import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { RedisService } from '../../infrastructure/redis/redis.service';

@Injectable()
export class GameweeksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async findAll(competitionId: number) {
    return this.prisma.gameweek.findMany({
      where: { competitionId },
      select: { id: true, number: true, status: true, deadlineTime: true },
      orderBy: { number: 'asc' },
    });
  }

  async findCurrent(competitionId: number) {
    const cacheKey = `gameweek:current:${competitionId}`;
    return this.redis.getOrSet(cacheKey, 120, () =>
      this.prisma.gameweek.findFirst({
        where: { competitionId, isCurrent: true },
        select: {
          id: true,
          competitionId: true,
          number: true,
          deadlineTime: true,
          status: true,
          isCurrent: true,
        },
      }),
    );
  }
}
