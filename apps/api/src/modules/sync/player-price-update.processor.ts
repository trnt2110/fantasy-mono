import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { RedisService } from '../../infrastructure/redis/redis.service';
import { QUEUE_PLAYER_PRICE_UPDATE } from './sync.constants';

const PRICE_CHANGE_THRESHOLD_PCT = 2; // 2% of active teams triggers a price change
const PRICE_CHANGE_AMOUNT = 0.1;      // ±0.1m
const MIN_PRICE = 4.0;
const MAX_PRICE = 15.0;

@Processor(QUEUE_PLAYER_PRICE_UPDATE, { concurrency: 1 })
export class PlayerPriceUpdateProcessor extends WorkerHost {
  private readonly logger = new Logger(PlayerPriceUpdateProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {
    super();
  }

  async process(job: Job<{ competitionId: number }>): Promise<void> {
    const { competitionId } = job.data;
    this.logger.log(`player-price-update: competition ${competitionId}`);

    const totalTeams = await this.prisma.fantasyTeam.count({ where: { competitionId } });
    if (totalTeams === 0) {
      this.logger.warn(`No teams in competition ${competitionId}, skipping price update`);
      return;
    }

    const threshold = Math.ceil((PRICE_CHANGE_THRESHOLD_PCT / 100) * totalTeams);

    // Get all player prices in this competition
    const prices = await this.prisma.playerCompetitionPrice.findMany({
      where: { competitionId },
      select: { playerId: true, currentPrice: true },
    });

    let updated = 0;
    for (const { playerId, currentPrice } of prices) {
      const currentPriceNum = Number(currentPrice);

      // Count net transfers since last GW: transfers IN minus transfers OUT
      // We look at all transfers in the most recent finalised GW
      const recentGw = await this.prisma.gameweek.findFirst({
        where: { competitionId, status: 'FINISHED' },
        orderBy: { number: 'desc' },
      });
      if (!recentGw) continue;

      const [transfersIn, transfersOut] = await Promise.all([
        this.prisma.transfer.count({
          where: { gameweekId: recentGw.id, playerInId: playerId, fantasyTeam: { competitionId } },
        }),
        this.prisma.transfer.count({
          where: { gameweekId: recentGw.id, playerOutId: playerId, fantasyTeam: { competitionId } },
        }),
      ]);

      const netIn = transfersIn - transfersOut;

      let newPrice = currentPriceNum;
      if (netIn >= threshold) {
        newPrice = Math.min(MAX_PRICE, currentPriceNum + PRICE_CHANGE_AMOUNT);
      } else if (netIn <= -threshold) {
        newPrice = Math.max(MIN_PRICE, currentPriceNum - PRICE_CHANGE_AMOUNT);
      }

      if (newPrice !== currentPriceNum) {
        await this.prisma.$transaction([
          this.prisma.playerCompetitionPrice.update({
            where: { playerId_competitionId: { playerId, competitionId } },
            data: { currentPrice: newPrice },
          }),
          this.prisma.playerPriceHistory.create({
            data: { playerId, competitionId, price: newPrice },
          }),
        ]);
        updated++;
      }
    }

    this.logger.log(`Price update complete: ${updated} player prices changed`);

    // Invalidate player list caches
    await this.redis.delByPattern('players:list:*');
  }
}
