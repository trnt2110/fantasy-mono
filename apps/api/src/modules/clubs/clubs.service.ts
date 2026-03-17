import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { AliasService } from '../alias/alias.service';
import { RedisService } from '../../infrastructure/redis/redis.service';

@Injectable()
export class ClubsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly aliasService: AliasService,
    private readonly redis: RedisService,
  ) {}

  async findByCompetition(competitionId: number) {
    const cacheKey = `clubs:competition:${competitionId}`;
    return this.redis.getOrSet(cacheKey, 600, async () => {
      const clubs = await this.prisma.club.findMany({
        where: { competitionId },
        include: { alias: true },
        orderBy: { id: 'asc' },
      });
      return clubs.map((c) => this.aliasService.resolveClub(c));
    });
  }
}
