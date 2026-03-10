import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { ApiFootballClient } from '../../infrastructure/api-football/api-football.client';
import { QUEUE_SEASON_BOOTSTRAP } from './sync.constants';
import { LEAGUE_IDS, LEAGUE_SLUGS, LEAGUE_GW_COUNTS, TOTAL_MODE_COMPETITION_ID } from '@fantasy/shared';
import { CompetitionType } from '@prisma/client';

interface ApiFootballResponse<T> {
  response: T[];
  results: number;
  paging: { current: number; total: number };
  errors: Record<string, string>;
}

interface ApiLeague {
  league: { id: number; name: string; country: string };
  seasons: Array<{ year: number; current: boolean }>;
}

interface ApiTeam {
  team: { id: number; name: string; logo: string };
}

interface ApiPlayer {
  player: { id: number; name: string };
  statistics: Array<{
    games: { position: string };
    team: { id: number };
  }>;
}

interface ApiFixture {
  fixture: { id: number; date: string; status: { short: string } };
  league: { round: string };
  teams: { home: { id: number }; away: { id: number } };
  goals: { home: number | null; away: number | null };
}

const POSITION_MAP: Record<string, string> = {
  Goalkeeper: 'GK',
  Defender: 'DEF',
  Midfielder: 'MID',
  Attacker: 'FWD',
};

const INITIAL_PLAYER_PRICE = 5.0;

@Processor(QUEUE_SEASON_BOOTSTRAP)
export class BootstrapProcessor extends WorkerHost {
  private readonly logger = new Logger(BootstrapProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly apiFootball: ApiFootballClient,
  ) {
    super();
  }

  async process(job: Job) {
    const season = job.data.season as number;
    this.logger.log(`Starting bootstrap for season ${season}`);

    const failures: { leagueId: number; error: string }[] = [];

    for (const leagueId of Object.values(LEAGUE_IDS)) {
      try {
        await this.seedLeague(leagueId, season);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        this.logger.error(`Failed to seed league ${leagueId}: ${message}`, err instanceof Error ? err.stack : undefined);
        failures.push({ leagueId, error: message });
      }
    }

    await this.seedTotalModeCompetition(season);

    if (failures.length > 0) {
      const failedIds = failures.map((f) => f.leagueId).join(', ');
      this.logger.error(`Bootstrap completed with ${failures.length} failures: leagues [${failedIds}]`);
      throw new Error(`Bootstrap failed for leagues: ${failedIds}`);
    }

    this.logger.log('Bootstrap complete');
    return { success: true };
  }

  private async seedLeague(leagueId: number, season: number) {
    this.logger.log(`Seeding league ${leagueId}`);

    const leagueData = await this.apiFootball.get<ApiFootballResponse<ApiLeague>>('/leagues', {
      id: leagueId,
      season,
    });

    if (!leagueData.response.length) {
      this.logger.warn(`No data for league ${leagueId}`);
      return;
    }

    const league = leagueData.response[0].league;
    const gwCount = LEAGUE_GW_COUNTS[leagueId] ?? 38;

    await this.prisma.competition.upsert({
      where: { id: leagueId },
      create: {
        id: leagueId,
        realName: league.name,
        country: league.country,
        season,
        type: CompetitionType.LEAGUE,
        leagueSlug: LEAGUE_SLUGS[leagueId],
        gwCount,
        isActive: true,
      },
      update: {
        realName: league.name,
        country: league.country,
        season,
        gwCount,
        isActive: true,
      },
    });

    await this.seedClubs(leagueId, season);
    await this.seedFixturesAndGameweeks(leagueId, season);
  }

  private async seedClubs(leagueId: number, season: number) {
    const teamsData = await this.apiFootball.get<ApiFootballResponse<ApiTeam>>('/teams', {
      league: leagueId,
      season,
    });

    if (!teamsData.response.length) {
      this.logger.warn(`No teams found for league ${leagueId}`);
      return;
    }

    for (const item of teamsData.response) {
      await this.prisma.club.upsert({
        where: { id: item.team.id },
        create: {
          id: item.team.id,
          realName: item.team.name,
          logoUrl: item.team.logo,
          competitionId: leagueId,
        },
        update: {
          realName: item.team.name,
          logoUrl: item.team.logo,
        },
      });

      await this.seedPlayersForClub(item.team.id, leagueId, season);
    }
  }

  private async seedPlayersForClub(clubId: number, leagueId: number, season: number) {
    let page = 1;
    let totalPages = 1;

    do {
      const playersData = await this.apiFootball.get<ApiFootballResponse<ApiPlayer>>('/players', {
        team: clubId,
        season,
        page,
      });

      totalPages = playersData.paging?.total ?? 1;

      for (const item of playersData.response) {
        const stat = item.statistics?.[0];
        if (!stat) continue;

        const rawPosition = stat.games?.position;
        const position = POSITION_MAP[rawPosition];
        if (!position) continue;

        await this.prisma.player.upsert({
          where: { id: item.player.id },
          create: {
            id: item.player.id,
            realName: item.player.name,
            position: position as any,
            clubId,
            isAvailable: true,
          },
          update: {
            realName: item.player.name,
            position: position as any,
            clubId,
          },
        });

        await this.prisma.playerCompetitionPrice.upsert({
          where: { playerId_competitionId: { playerId: item.player.id, competitionId: leagueId } },
          create: { playerId: item.player.id, competitionId: leagueId, currentPrice: INITIAL_PLAYER_PRICE },
          update: {},
        });
      }

      page++;
    } while (page <= totalPages);
  }

  private async seedFixturesAndGameweeks(leagueId: number, season: number) {
    const fixturesData = await this.apiFootball.get<ApiFootballResponse<ApiFixture>>('/fixtures', {
      league: leagueId,
      season,
    });

    if (!fixturesData.response.length) {
      this.logger.warn(`No fixtures found for league ${leagueId}`);
      return;
    }

    // Group by round
    const roundMap = new Map<string, ApiFixture[]>();
    for (const f of fixturesData.response) {
      const round = f.league.round;
      if (!roundMap.has(round)) roundMap.set(round, []);
      roundMap.get(round)!.push(f);
    }

    // Sort rounds numerically by the trailing number (e.g. "Regular Season - 10" → 10)
    const rounds = Array.from(roundMap.keys()).sort((a, b) => {
      const numA = parseInt(a.split(' - ').pop() ?? '0', 10) || 0;
      const numB = parseInt(b.split(' - ').pop() ?? '0', 10) || 0;
      return numA - numB;
    });

    for (let i = 0; i < rounds.length; i++) {
      const round = rounds[i];
      const gwNumber = i + 1;
      const fixtures = roundMap.get(round)!;

      // Deadline = earliest kickoff - 90 min
      const kickoffs = fixtures.map((f) => new Date(f.fixture.date).getTime());
      const earliest = new Date(Math.min(...kickoffs));
      const deadline = new Date(earliest.getTime() - 90 * 60 * 1000);

      const gameweek = await this.prisma.gameweek.upsert({
        where: { competitionId_number: { competitionId: leagueId, number: gwNumber } },
        create: { competitionId: leagueId, number: gwNumber, deadlineTime: deadline },
        update: { deadlineTime: deadline },
      });

      for (const f of fixtures) {
        await this.prisma.fixture.upsert({
          where: { id: f.fixture.id },
          create: {
            id: f.fixture.id,
            competitionId: leagueId,
            gameweekId: gameweek.id,
            homeClubId: f.teams.home.id,
            awayClubId: f.teams.away.id,
            kickoffAt: new Date(f.fixture.date),
            status: f.fixture.status.short,
            homeGoals: f.goals.home,   // null for unplayed fixtures (explicit null, not undefined)
            awayGoals: f.goals.away,
          },
          update: {
            status: f.fixture.status.short,
            homeGoals: f.goals.home,
            awayGoals: f.goals.away,
          },
        });
      }
    }

    await this.markCurrentGameweek(leagueId);
  }

  private async markCurrentGameweek(competitionId: number) {
    await this.prisma.gameweek.updateMany({ where: { competitionId }, data: { isCurrent: false } });

    const firstScheduled = await this.prisma.gameweek.findFirst({
      where: { competitionId, status: { not: 'FINISHED' } },
      orderBy: { number: 'asc' },
    });

    if (firstScheduled) {
      await this.prisma.gameweek.update({ where: { id: firstScheduled.id }, data: { isCurrent: true } });
    }
  }

  private async seedTotalModeCompetition(season: number) {
    await this.prisma.competition.upsert({
      where: { id: TOTAL_MODE_COMPETITION_ID },
      create: {
        id: TOTAL_MODE_COMPETITION_ID,
        realName: 'Total Mode',
        country: 'Europe',
        season,
        type: CompetitionType.TOTAL,
        leagueSlug: null,
        gwCount: 0,
        isActive: true,
      },
      update: { season, isActive: true },
    });
    this.logger.log('Total mode competition seeded');
  }
}
