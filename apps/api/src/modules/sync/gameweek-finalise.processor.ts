import { Processor, WorkerHost, InjectQueue } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job, Queue } from 'bullmq';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { RedisService } from '../../infrastructure/redis/redis.service';
import { ScoringService } from '../scoring/scoring.service';
import {
  QUEUE_GAMEWEEK_FINALISE,
  QUEUE_PLAYER_PRICE_UPDATE,
  JOB_PLAYER_PRICE_UPDATE,
} from './sync.constants';

@Processor(QUEUE_GAMEWEEK_FINALISE, { concurrency: 1 })
export class GameweekFinaliseProcessor extends WorkerHost {
  private readonly logger = new Logger(GameweekFinaliseProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly scoring: ScoringService,
    @InjectQueue(QUEUE_PLAYER_PRICE_UPDATE) private readonly priceUpdateQueue: Queue,
  ) {
    super();
  }

  async process(job: Job<{ gameweekId: number; competitionId: number }>): Promise<void> {
    const { gameweekId, competitionId } = job.data;
    this.logger.log(`gameweek-finalise: GW ${gameweekId}`);

    // Mark gameweek as SCORING while we process
    await this.prisma.gameweek.update({
      where: { id: gameweekId },
      data: { status: 'SCORING' },
    });

    try {
      await this.scoring.finaliseGameweekScores(gameweekId);
    } catch (err) {
      this.logger.error(`finaliseGameweekScores failed for GW ${gameweekId}: ${err}`);
      throw err;
    }

    // Mark gameweek FINISHED, unset isCurrent
    await this.prisma.gameweek.update({
      where: { id: gameweekId },
      data: { status: 'FINISHED', isCurrent: false },
    });

    // Advance isCurrent to next gameweek in same competition
    const nextGw = await this.prisma.gameweek.findFirst({
      where: { competitionId, status: { not: 'FINISHED' } },
      orderBy: { number: 'asc' },
    });
    if (nextGw) {
      await this.prisma.gameweek.update({
        where: { id: nextGw.id },
        data: { isCurrent: true },
      });

      // Seed next GW picks for all teams — copy verbatim from current GW picks
      const teams = await this.prisma.fantasyTeam.findMany({
        where: { competitionId },
        select: { id: true },
      });
      for (const team of teams) {
        const alreadyHasPicks = await this.prisma.playerPick.findFirst({
          where: { fantasyTeamId: team.id, gameweekId: nextGw.id },
        });
        if (alreadyHasPicks) continue;
        const prevPicks = await this.prisma.playerPick.findMany({
          where: { fantasyTeamId: team.id, gameweekId: gameweekId },
        });
        if (prevPicks.length === 0) continue;
        await this.prisma.playerPick.createMany({
          data: prevPicks.map((p) => ({
            fantasyTeamId: p.fantasyTeamId,
            playerId: p.playerId,
            gameweekId: nextGw.id,
            isCaptain: p.isCaptain,
            isViceCaptain: p.isViceCaptain,
            isStarting: p.isStarting,
            benchOrder: p.benchOrder,
            multiplier: 1,
          })),
          skipDuplicates: true,
        });
      }
    }

    // Invalidate leaderboard caches
    await this.redis.delByPattern(`leaderboard:global:${competitionId}:*`);
    await this.redis.delByPattern(`leaderboard:league:*`);

    // Enqueue price update
    await this.priceUpdateQueue.add(
      JOB_PLAYER_PRICE_UPDATE,
      { competitionId },
      { removeOnComplete: 10, removeOnFail: 50 },
    );

    this.logger.log(`Gameweek ${gameweekId} finalised successfully`);
  }
}
