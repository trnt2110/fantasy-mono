import { Processor, WorkerHost, InjectQueue } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job, Queue } from 'bullmq';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { ApiFootballClient } from '../../infrastructure/api-football/api-football.client';
import { RedisService } from '../../infrastructure/redis/redis.service';
import {
  QUEUE_FIXTURE_RESULT_CHECK,
  QUEUE_PERFORMANCE_SYNC,
  JOB_PERFORMANCE_SYNC,
} from './sync.constants';

interface ApiFixtureStatus {
  response: Array<{
    fixture: { id: number; status: { short: string } };
    goals: { home: number | null; away: number | null };
  }>;
}

@Processor(QUEUE_FIXTURE_RESULT_CHECK)
export class FixtureResultCheckProcessor extends WorkerHost {
  private readonly logger = new Logger(FixtureResultCheckProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly apiFootball: ApiFootballClient,
    private readonly redis: RedisService,
    @InjectQueue(QUEUE_PERFORMANCE_SYNC) private readonly performanceSyncQueue: Queue,
  ) {
    super();
  }

  async process(_job: Job): Promise<void> {
    this.logger.log('fixture-result-check: checking for newly finished fixtures');

    // Find current active gameweeks
    const currentGameweeks = await this.prisma.gameweek.findMany({
      where: { isCurrent: true, status: { not: 'FINISHED' } },
      include: { competition: true },
    });

    for (const gw of currentGameweeks) {
      await this.checkGameweekFixtures(gw.id, gw.competitionId);
    }
  }

  private async checkGameweekFixtures(gameweekId: number, competitionId: number): Promise<void> {
    const now = new Date();
    const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);

    // Find scheduled fixtures with kickoff > 2h ago (should be finished by now)
    const candidateFixtures = await this.prisma.fixture.findMany({
      where: {
        gameweekId,
        status: { notIn: ['FT', 'AET', 'PEN', 'AWD', 'WO'] },
        kickoffAt: { lt: twoHoursAgo },
      },
    });

    if (candidateFixtures.length === 0) return;

    for (const fixture of candidateFixtures) {
      try {
        const data = await this.apiFootball.get<ApiFixtureStatus>('/fixtures', { id: fixture.id });
        if (!data.response.length) continue;

        const apiFixture = data.response[0];
        const finishedStatuses = ['FT', 'AET', 'PEN', 'AWD', 'WO'];

        if (finishedStatuses.includes(apiFixture.fixture.status.short)) {
          await this.prisma.fixture.update({
            where: { id: fixture.id },
            data: {
              status: apiFixture.fixture.status.short,
              homeGoals: apiFixture.goals.home,
              awayGoals: apiFixture.goals.away,
            },
          });

          this.logger.log(`Fixture ${fixture.id} finished — enqueueing performance-sync`);
          await this.performanceSyncQueue.add(
            JOB_PERFORMANCE_SYNC,
            { fixtureId: fixture.id, gameweekId, competitionId },
            { removeOnComplete: 10, removeOnFail: 50 },
          );

          // Invalidate fixtures cache
          await this.redis.delByPattern(`fixtures:gw:${gameweekId}*`);
          await this.redis.delByPattern(`gameweek:current:${competitionId}*`);
        }
      } catch (err) {
        this.logger.error(`Failed to check fixture ${fixture.id}: ${err}`);
      }
    }
  }
}
