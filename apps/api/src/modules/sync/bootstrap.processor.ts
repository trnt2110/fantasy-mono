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

const SEASON_CACHE_TTL_SECONDS = 24 * 60 * 60; // 24 hours

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

    const countBefore = await this.apiFootball.getDailyRequestCount();
    this.logger.log(`API-Football quota: ${countBefore}/95 requests used today before bootstrap`);

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

    const countAfter = await this.apiFootball.getDailyRequestCount();
    this.logger.log(
      `API-Football quota: ${countAfter}/95 used after bootstrap (+${countAfter - countBefore} requests consumed)`,
    );

    await this.seedTotalModeCompetition(resolvedSeason ?? new Date().getFullYear());

    const succeeded = Object.values(LEAGUE_IDS).length - failures.length;
    if (failures.length > 0) {
      this.logger.error(
        `Bootstrap completed: ${succeeded} leagues ok, ${failures.length} failed: ` +
        failures.map((f) => `${f.leagueId}(${f.error})`).join('; '),
      );
    }

    if (failures.length === Object.values(LEAGUE_IDS).length) {
      // All leagues failed — mark job as failed so BullMQ retries/alerts
      throw new Error(`All leagues failed during bootstrap: ${failures.map((f) => f.error).join('; ')}`);
    }

    this.logger.log(`Bootstrap complete (${succeeded} leagues ok, ${failures.length} failures)`);
    return { success: failures.length === 0, succeeded, failures };
  }

  private async seedLeague(leagueId: number, season: number): Promise<void> {
    this.logger.log(`[League ${leagueId}] Starting seed for season ${season}`);

    // ① Fetch all API data BEFORE opening the transaction (no HTTP calls inside tx)
    this.logger.log(`[API] GET /leagues { id: ${leagueId}, season: ${season} }`);
    const leagueData = await this.apiFootball.get<ApiFootballResponse<ApiLeague>>('/leagues', {
      id: leagueId,
      season,
    });
    this.logger.log(`[API] /leagues response: ${leagueData.results} result(s) errors=${JSON.stringify(leagueData.errors)}`);

    if (!leagueData.response.length) {
      this.logger.warn(`No data for league ${leagueId}`);
      return;
    }

    const { league, country: leagueCountry } = leagueData.response[0];
    this.logger.log(`[API] League resolved: "${league.name}" (${leagueCountry.name})`);

    this.logger.log(`[API] GET /teams { league: ${leagueId}, season: ${season} }`);
    const teamsData = await this.apiFootball.get<ApiFootballResponse<ApiTeam>>('/teams', {
      league: leagueId,
      season,
    });
    this.logger.log(`[API] /teams response: ${teamsData.results} team(s) errors=${JSON.stringify(teamsData.errors)} — ${teamsData.response.map((t) => t.team.name).join(', ')}`);

    this.logger.log(`[API] GET /fixtures { league: ${leagueId}, season: ${season} }`);
    const fixturesData = await this.apiFootball.get<ApiFootballResponse<ApiFixture>>('/fixtures', {
      league: leagueId,
      season,
    });
    this.logger.log(`[API] /fixtures response: ${fixturesData.results} fixture(s)`);

    const gwCount = LEAGUE_GW_COUNTS[leagueId] ?? 38;

    // ② All DB writes in a single atomic transaction
    this.logger.log(`[DB] Starting transaction for league ${leagueId}`);
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
        this.logger.log(`[DB] Competition upserted: id=${leagueId} "${league.name}" season=${season} gwCount=${gwCount}`);

        await this.seedClubsFromData(teamsData, leagueId, tx);
        await this.seedFixturesFromData(fixturesData, leagueId, tx);
      },
      { timeout: 60_000 },
    );

    this.logger.log(`[League ${leagueId}] Seed complete. Players seeded separately via /admin/sync/players/${leagueId}`);
  }

  private async seedClubsFromData(
    teamsData: ApiFootballResponse<ApiTeam>,
    leagueId: number,
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    if (!teamsData.response.length) {
      this.logger.warn(`[DB] No teams to seed for league ${leagueId}`);
      return;
    }

    this.logger.log(`[DB] Seeding ${teamsData.response.length} clubs for league ${leagueId}`);
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
      this.logger.log(`[DB] Club upserted: id=${item.team.id} "${item.team.name}"`);
    }
    this.logger.log(`[DB] ${teamsData.response.length} clubs seeded for league ${leagueId}`);
  }

  async seedPlayersForLeague(leagueId: number) {
    const competition = await this.prisma.competition.findUnique({ where: { id: leagueId } });
    if (!competition) {
      throw new Error(`Competition ${leagueId} not found — run bootstrap first`);
    }

    const clubs = await this.prisma.club.findMany({ where: { competitionId: leagueId } });
    if (!clubs.length) {
      throw new Error(`No clubs found for competition ${leagueId} — run bootstrap first`);
    }

    this.logger.log(`[Players] Seeding league ${leagueId} — ${clubs.length} clubs, season ${competition.season}`);

    let totalSeeded = 0;
    for (const club of clubs) {
      const count = await this.seedPlayersForClub(club.id, leagueId, competition.season);
      totalSeeded += count;
      this.logger.log(`[Players] Club ${club.id} "${club.realName}": ${count} players seeded (running total: ${totalSeeded})`);
    }

    this.logger.log(`[Players] League ${leagueId} complete — ${totalSeeded} players seeded across ${clubs.length} clubs`);
  }

  private async seedPlayersForClub(clubId: number, leagueId: number, season: number): Promise<number> {
    let page = 1;
    let totalPages = 1;
    let seededCount = 0;

    do {
      this.logger.log(`[API] GET /players { team: ${clubId}, season: ${season}, page: ${page} }`);
      const playersData = await this.apiFootball.get<ApiFootballResponse<ApiPlayer>>('/players', {
        team: clubId,
        season,
        page,
      });

      totalPages = playersData.paging?.total ?? 1;
      this.logger.log(`[API] /players response: ${playersData.results} player(s) on page ${page}/${totalPages}`);

      for (const item of playersData.response) {
        const stat = item.statistics?.[0];
        if (!stat) {
          this.logger.warn(`[Players] Skipping player id=${item.player.id} "${item.player.name}" — no statistics`);
          continue;
        }

        const rawPosition = stat.games?.position;
        const position = POSITION_MAP[rawPosition];
        if (!position) {
          this.logger.warn(`[Players] Skipping player id=${item.player.id} "${item.player.name}" — unmapped position "${rawPosition}"`);
          continue;
        }

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
          update: {},
        });

        this.logger.log(`[DB] Player upserted: id=${item.player.id} "${item.player.name}" pos=${position} price=${defaultPrice}`);
        seededCount++;
      }

      page++;
    } while (page <= totalPages);

    return seededCount;
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

    this.logger.log(`[DB] Seeding ${rounds.length} gameweeks, ${fixturesData.results} fixtures for league ${leagueId}`);

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

      this.logger.log(`[DB] GW${gwNumber} upserted: id=${gameweek.id} round="${round}" deadline=${deadline.toISOString()} fixtures=${fixtures.length}`);

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
        this.logger.log(`[DB] Fixture upserted: id=${f.fixture.id} home=${f.teams.home.id} away=${f.teams.away.id} kickoff=${f.fixture.date} status=${f.fixture.status.short}`);
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
      this.logger.log(`[DB] Current GW marked: id=${firstScheduled.id} number=${firstScheduled.number} for competition ${competitionId}`);
    } else {
      this.logger.warn(`[DB] No unfinished gameweek found for competition ${competitionId} — isCurrent not set`);
    }
  }

  private async detectSeason(leagueId: number): Promise<number> {
    const cacheKey = `bootstrap:season:${leagueId}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      const year = parseInt(cached, 10);
      this.logger.log(`Using cached season ${year} for league ${leagueId}`);
      return year;
    }

    this.logger.log(`[API] GET /leagues { id: ${leagueId}, current: true } (season detection)`);
    const data = await this.apiFootball.get<ApiFootballResponse<ApiLeague>>('/leagues', {
      id: leagueId,
      current: true,
    });
    this.logger.log(`[API] /leagues (detect) response: ${data.results} result(s) errors=${JSON.stringify(data.errors)}`);

    if (!data.response.length) {
      throw new Error(`Could not detect current season for league ${leagueId}`);
    }

    // Use the season flagged as current; fall back to year-1 if the plan doesn't cover it
    const currentYear = data.response[0].seasons.find((s) => s.current)?.year;
    if (!currentYear) {
      throw new Error(`No current season found for league ${leagueId}`);
    }

    for (const year of [currentYear, currentYear - 1]) {
      this.logger.log(`[API] GET /teams { league: ${leagueId}, season: ${year} } (season probe)`);
      const teamsData = await this.apiFootball.get<ApiFootballResponse<{ team: { id: number } }>>('/teams', {
        league: leagueId,
        season: year,
      });
      this.logger.log(`[API] /teams (probe) season=${year}: ${teamsData.results} team(s) errors=${JSON.stringify(teamsData.errors)}`);
      if (teamsData.results > 0) {
        this.logger.log(`[Season] Auto-detected season ${year} for league ${leagueId} (current flagged: ${currentYear})`);
        await this.redis.set(cacheKey, String(year), SEASON_CACHE_TTL_SECONDS);
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
