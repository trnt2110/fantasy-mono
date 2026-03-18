import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { ApiFootballClient } from '../../infrastructure/api-football/api-football.client';
import { RedisService } from '../../infrastructure/redis/redis.service';
import { QUEUE_SEASON_BOOTSTRAP, JOB_PLAYER_SYNC } from './sync.constants';
import { LEAGUE_IDS, LEAGUE_SLUGS, LEAGUE_GW_COUNTS, TOTAL_MODE_COMPETITION_ID, DEADLINE_OFFSET_MINUTES, POSITION_DEFAULT_PRICES } from '@fantasy/shared';
import { CompetitionType, Prisma } from '@prisma/client';

interface ApiFootballResponse<T> {
  response: T[];
  results: number;
  paging: { current: number; total: number };
  errors: Record<string, string>;
}

interface ApiLeague {
  league: { id: number; name: string; type: string };
  country: { name: string; code: string };
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


@Processor(QUEUE_SEASON_BOOTSTRAP)
export class BootstrapProcessor extends WorkerHost {
  private readonly logger = new Logger(BootstrapProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly apiFootball: ApiFootballClient,
    private readonly redis: RedisService,
  ) {
    super();
  }

  async process(job: Job) {
    if (job.name === JOB_PLAYER_SYNC) {
      const leagueId = job.data.leagueId as number;
      await this.seedPlayersForLeague(leagueId);
      return { success: true };
    }

    const requestedSeason = job.data.season as number | undefined;
    const force = job.data.force as boolean | undefined;

    // Safety guard: refuse re-bootstrap if fantasy teams exist, unless force=true
    const teamCount = await this.prisma.fantasyTeam.count();
    if (teamCount > 0 && !force) {
      throw new Error(
        `Re-bootstrap blocked: ${teamCount} fantasy team(s) exist. ` +
        'Pass force=true to override (WARNING: may orphan existing picks/transfers).',
      );
    }
    if (teamCount > 0 && force) {
      this.logger.warn(`Force re-bootstrap with ${teamCount} existing fantasy teams — data integrity not guaranteed`);
    }

    this.logger.log(requestedSeason ? `Starting bootstrap for season ${requestedSeason}` : 'Starting bootstrap (auto-detecting season per league)');

    await this.redis.delByPattern('api_football:cache:*');
    this.logger.log('API-Football cache cleared');

    const failures: { leagueId: number; error: string }[] = [];
    let resolvedSeason = requestedSeason;

    for (const leagueId of Object.values(LEAGUE_IDS)) {
      try {
        const season = requestedSeason ?? await this.detectSeason(leagueId);
        await this.seedLeague(leagueId, season);
        if (!resolvedSeason) resolvedSeason = season;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        this.logger.error(`Failed to seed league ${leagueId}: ${message}`, err instanceof Error ? err.stack : undefined);
        failures.push({ leagueId, error: message });
      }
    }

    await this.seedTotalModeCompetition(resolvedSeason ?? new Date().getFullYear());

    if (failures.length > 0) {
      const failedIds = failures.map((f) => f.leagueId).join(', ');
      this.logger.error(`Bootstrap completed with ${failures.length} failures: leagues [${failedIds}]`);
      throw new Error(`Bootstrap failed for leagues: ${failedIds}`);
    }

    this.logger.log('Bootstrap complete');
    return { success: true };
  }

  private async seedLeague(leagueId: number, season: number): Promise<void> {
    this.logger.log(`Seeding league ${leagueId}`);

    // ① Fetch all API data BEFORE opening the transaction (no HTTP calls inside tx)
    const leagueData = await this.apiFootball.get<ApiFootballResponse<ApiLeague>>('/leagues', {
      id: leagueId,
      season,
    });

    if (!leagueData.response.length) {
      this.logger.warn(`No data for league ${leagueId}`);
      return;
    }

    const teamsData = await this.apiFootball.get<ApiFootballResponse<ApiTeam>>('/teams', {
      league: leagueId,
      season,
    });

    const fixturesData = await this.apiFootball.get<ApiFootballResponse<ApiFixture>>('/fixtures', {
      league: leagueId,
      season,
    });

    const { league, country: leagueCountry } = leagueData.response[0];
    const gwCount = LEAGUE_GW_COUNTS[leagueId] ?? 38;

    // ② All DB writes in a single atomic transaction
    await this.prisma.$transaction(
      async (tx) => {
        await tx.competition.upsert({
          where: { id: leagueId },
          create: {
            id: leagueId,
            realName: league.name,
            country: leagueCountry.name,
            season,
            type: CompetitionType.LEAGUE,
            leagueSlug: LEAGUE_SLUGS[leagueId],
            gwCount,
            isActive: true,
          },
          update: { realName: league.name, country: leagueCountry.name, season, gwCount, isActive: true },
        });

        await this.seedClubsFromData(teamsData, leagueId, tx);
        await this.seedFixturesFromData(fixturesData, leagueId, tx);
      },
      { timeout: 60_000 },
    );

    this.logger.log(`League ${leagueId} seeded. Players are fetched separately via /admin/sync/players/:leagueId`);
  }

  private async seedClubsFromData(
    teamsData: ApiFootballResponse<ApiTeam>,
    leagueId: number,
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    if (!teamsData.response.length) {
      this.logger.warn(`No teams found for league ${leagueId}`);
      return;
    }

    for (const item of teamsData.response) {
      await tx.club.upsert({
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
    }
  }

  async seedPlayersForLeague(leagueId: number) {
    // Find the competition to determine the season
    const competition = await this.prisma.competition.findUnique({ where: { id: leagueId } });
    if (!competition) {
      throw new Error(`Competition ${leagueId} not found — run bootstrap first`);
    }

    const clubs = await this.prisma.club.findMany({ where: { competitionId: leagueId } });
    if (!clubs.length) {
      throw new Error(`No clubs found for competition ${leagueId} — run bootstrap first`);
    }

    this.logger.log(`Seeding players for league ${leagueId} (${clubs.length} clubs, season ${competition.season})`);

    for (const club of clubs) {
      await this.seedPlayersForClub(club.id, leagueId, competition.season);
    }

    this.logger.log(`Players seeded for league ${leagueId}`);
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

        const defaultPrice = POSITION_DEFAULT_PRICES[position] ?? 5.0;
        await this.prisma.playerCompetitionPrice.upsert({
          where: { playerId_competitionId: { playerId: item.player.id, competitionId: leagueId } },
          create: { playerId: item.player.id, competitionId: leagueId, currentPrice: defaultPrice },
          update: {},  // never overwrite admin-adjusted prices on re-sync
        });
      }

      page++;
    } while (page <= totalPages);
  }

  private async seedFixturesFromData(
    fixturesData: ApiFootballResponse<ApiFixture>,
    leagueId: number,
    tx: Prisma.TransactionClient,
  ): Promise<void> {
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

      const kickoffs = fixtures.map((f) => new Date(f.fixture.date).getTime());
      const earliest = new Date(Math.min(...kickoffs));
      const deadline = new Date(earliest.getTime() - DEADLINE_OFFSET_MINUTES * 60 * 1000);

      const gameweek = await tx.gameweek.upsert({
        where: { competitionId_number: { competitionId: leagueId, number: gwNumber } },
        create: { competitionId: leagueId, number: gwNumber, deadlineTime: deadline },
        update: { deadlineTime: deadline },
      });

      for (const f of fixtures) {
        await tx.fixture.upsert({
          where: { id: f.fixture.id },
          create: {
            id: f.fixture.id,
            competitionId: leagueId,
            gameweekId: gameweek.id,
            homeClubId: f.teams.home.id,
            awayClubId: f.teams.away.id,
            kickoffAt: new Date(f.fixture.date),
            status: f.fixture.status.short,
            homeGoals: f.goals.home,
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

    await this.markCurrentGameweek(leagueId, tx);
  }

  private async markCurrentGameweek(competitionId: number, tx: Prisma.TransactionClient): Promise<void> {
    await tx.gameweek.updateMany({ where: { competitionId }, data: { isCurrent: false } });

    const firstScheduled = await tx.gameweek.findFirst({
      where: { competitionId, status: { not: 'FINISHED' } },
      orderBy: { number: 'asc' },
    });

    if (firstScheduled) {
      await tx.gameweek.update({ where: { id: firstScheduled.id }, data: { isCurrent: true } });
    }
  }

  private async detectSeason(leagueId: number): Promise<number> {
    const data = await this.apiFootball.get<ApiFootballResponse<ApiLeague>>('/leagues', {
      id: leagueId,
      current: true,
    });

    if (!data.response.length) {
      throw new Error(`Could not detect current season for league ${leagueId}`);
    }

    // Use the season flagged as current; fall back to year-1 if the plan doesn't cover it
    const currentYear = data.response[0].seasons.find((s) => s.current)?.year;
    if (!currentYear) {
      throw new Error(`No current season found for league ${leagueId}`);
    }

    for (const year of [currentYear, currentYear - 1]) {
      const teamsData = await this.apiFootball.get<ApiFootballResponse<{ team: { id: number } }>>('/teams', {
        league: leagueId,
        season: year,
      });
      if (teamsData.results > 0) {
        this.logger.log(`Auto-detected season ${year} for league ${leagueId} (current flagged: ${currentYear})`);
        return year;
      }
    }

    throw new Error(`No season with data found for league ${leagueId} (tried ${currentYear} and ${currentYear - 1})`);
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
        isActive: false,  // not yet implemented; block team creation
      },
      update: { season, isActive: false },
    });
    this.logger.log('Total mode competition seeded');
  }
}
