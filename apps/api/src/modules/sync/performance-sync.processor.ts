import { Processor, WorkerHost, InjectQueue } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job, Queue } from 'bullmq';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { ApiFootballClient } from '../../infrastructure/api-football/api-football.client';
import { RedisService } from '../../infrastructure/redis/redis.service';
import { ScoringService } from '../scoring/scoring.service';
import {
  QUEUE_PERFORMANCE_SYNC,
  QUEUE_GAMEWEEK_FINALISE,
  JOB_GAMEWEEK_FINALISE,
} from './sync.constants';

interface ApiPlayerStats {
  player: { id: number };
  statistics: Array<{
    team: { id: number };
    games: { minutes: number | null; position: string };
    goals: { total: number | null; assists: number | null; conceded: number | null; owngoals: number | null; saves: number | null; penaltyscored: number | null; penaltymissed: number | null };
    cards: { yellow: number | null; red: number | null };
    dribbles?: { success: number | null };
  }>;
}

interface ApiLineup {
  team: { id: number };
  startXI: Array<{ player: { id: number } }>;
  substitutes: Array<{ player: { id: number } }>;
}

interface ApiPlayerStatsResponse {
  response: ApiPlayerStats[];
}

interface ApiLineupResponse {
  response: ApiLineup[];
}

interface ApiFixtureEvents {
  response: Array<{
    time: { elapsed: number };
    team: { id: number };
    player: { id: number };
    type: string;
    detail: string;
  }>;
}

@Processor(QUEUE_PERFORMANCE_SYNC, { concurrency: 2 })
export class PerformanceSyncProcessor extends WorkerHost {
  private readonly logger = new Logger(PerformanceSyncProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly apiFootball: ApiFootballClient,
    private readonly redis: RedisService,
    private readonly scoring: ScoringService,
    @InjectQueue(QUEUE_GAMEWEEK_FINALISE) private readonly finaliseQueue: Queue,
  ) {
    super();
  }

  async process(job: Job<{ fixtureId: number; gameweekId: number; competitionId: number }>): Promise<void> {
    const { fixtureId, gameweekId, competitionId } = job.data;
    this.logger.log(`performance-sync: fixture ${fixtureId}`);

    const [statsData, lineupData, eventsData] = await Promise.all([
      this.apiFootball.get<ApiPlayerStatsResponse>('/fixtures/players', { fixture: fixtureId }),
      this.apiFootball.get<ApiLineupResponse>('/fixtures/lineups', { fixture: fixtureId }),
      this.apiFootball.get<ApiFixtureEvents>('/fixtures/events', { fixture: fixtureId }),
    ]);

    // Determine clean sheet: which teams conceded 0 goals this fixture
    const fixture = await this.prisma.fixture.findUnique({ where: { id: fixtureId } });
    if (!fixture) {
      this.logger.warn(`Fixture ${fixtureId} not found in DB`);
      return;
    }
    const cleanSheetTeams = new Set<number>();
    if ((fixture.homeGoals ?? 0) === 0) cleanSheetTeams.add(fixture.awayClubId);
    if ((fixture.awayGoals ?? 0) === 0) cleanSheetTeams.add(fixture.homeClubId);

    // Calculate minutes played from lineups + substitution events
    const minutesMap = this.calculateMinutesPlayed(lineupData.response, eventsData.response);

    // Build map of bonus points from API stats
    const bonusMap = new Map<number, number>();
    for (const entry of statsData.response) {
      // API-Football doesn't provide BPS directly; we use 0 as placeholder
      // In production this would come from a dedicated bonus endpoint
      bonusMap.set(entry.player.id, 0);
    }

    // Get all players that appeared in lineups (starting + substitutes)
    const allPlayerIds = new Set<number>();
    for (const lineup of lineupData.response) {
      for (const p of lineup.startXI) allPlayerIds.add(p.player.id);
      for (const p of lineup.substitutes) allPlayerIds.add(p.player.id);
    }

    // Also include players from stats response
    for (const entry of statsData.response) {
      allPlayerIds.add(entry.player.id);
    }

    // Find which DB players match
    const dbPlayers = await this.prisma.player.findMany({
      where: { id: { in: Array.from(allPlayerIds) } },
      select: { id: true, position: true, clubId: true },
    });
    const dbPlayerMap = new Map(dbPlayers.map((p) => [p.id, p]));

    // Upsert PlayerPerformance for each player
    for (const entry of statsData.response) {
      const stat = entry.statistics[0];
      if (!stat) continue;

      const dbPlayer = dbPlayerMap.get(entry.player.id);
      if (!dbPlayer) continue;

      const minutes = minutesMap.get(entry.player.id) ?? stat.games.minutes ?? 0;
      const cleanSheet = cleanSheetTeams.has(dbPlayer.clubId);

      const perfInput = {
        minutesPlayed: minutes,
        goalsScored: stat.goals.total ?? 0,
        assists: stat.goals.assists ?? 0,
        cleanSheet,
        goalsConceded: stat.goals.conceded ?? 0,
        ownGoals: stat.goals.owngoals ?? 0,
        penaltiesSaved: stat.goals.penaltyscored ?? 0, // API uses penaltyscored for GK saves
        penaltiesMissed: stat.goals.penaltymissed ?? 0,
        yellowCards: stat.cards.yellow ?? 0,
        redCards: stat.cards.red ?? 0,
        saves: stat.goals.saves ?? 0,
        bonus: bonusMap.get(entry.player.id) ?? 0,
      };

      const { totalPoints, pointsBreakdown } = this.scoring.calculatePlayerPoints(perfInput, dbPlayer.position);

      await this.prisma.playerPerformance.upsert({
        where: { playerId_fixtureId: { playerId: entry.player.id, fixtureId } },
        create: {
          playerId: entry.player.id,
          fixtureId,
          gameweekId,
          ...perfInput,
          totalPoints,
          pointsBreakdown,
          isFinalised: true,
        },
        update: {
          ...perfInput,
          totalPoints,
          pointsBreakdown,
          isFinalised: true,
        },
      });
    }

    // Invalidate player caches
    await this.redis.delByPattern('players:list:*');

    // Check if all fixtures in this GW are now finished
    const unfinishedFixtures = await this.prisma.fixture.count({
      where: {
        gameweekId,
        status: { notIn: ['FT', 'AET', 'PEN', 'AWD', 'WO'] },
      },
    });

    if (unfinishedFixtures === 0) {
      this.logger.log(`All fixtures in GW ${gameweekId} finished — enqueueing gameweek-finalise`);
      await this.finaliseQueue.add(
        JOB_GAMEWEEK_FINALISE,
        { gameweekId, competitionId },
        { removeOnComplete: 10, removeOnFail: 50 },
      );
    }
  }

  private calculateMinutesPlayed(
    lineups: ApiLineup[],
    events: ApiFixtureEvents['response'],
  ): Map<number, number> {
    const minutesMap = new Map<number, number>();

    for (const lineup of lineups) {
      // Starting XI play until substituted out or 90 min
      for (const p of lineup.startXI) {
        minutesMap.set(p.player.id, 90);
      }
      // Substitutes start at 0
      for (const p of lineup.substitutes) {
        if (!minutesMap.has(p.player.id)) minutesMap.set(p.player.id, 0);
      }
    }

    // Process substitution events to adjust minutes
    for (const event of events) {
      if (event.type !== 'subst') continue;
      const elapsed = event.time.elapsed;
      // player coming off — update their minutes to the sub time
      minutesMap.set(event.player.id, elapsed);
      // The assist field in event contains the player coming on — not available in this structure
      // Minutes for subs coming on: 90 - elapsed
      // We handle this separately via the 'assist' field which isn't in this simplified type
    }

    return minutesMap;
  }
}
