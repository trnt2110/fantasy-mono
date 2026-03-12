import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { AliasService } from '../alias/alias.service';
import { RedisService } from '../../infrastructure/redis/redis.service';

@Injectable()
export class FixturesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly aliasService: AliasService,
    private readonly redis: RedisService,
  ) {}

  async findByGameweek(gameweekId: number) {
    const cacheKey = `fixtures:gw:${gameweekId}`;
    return this.redis.getOrSet(cacheKey, 1800, () => this.fetchByGameweek(gameweekId));
  }

  private async fetchByGameweek(gameweekId: number) {
    const fixtures = await this.prisma.fixture.findMany({
      where: { gameweekId },
      include: {
        homeClub: { include: { alias: true } },
        awayClub: { include: { alias: true } },
      },
      orderBy: { kickoffAt: 'asc' },
    });
    return fixtures.map((f) => this.mapFixture(f));
  }

  async findUpcomingByClub(clubId: number) {
    const fixtures = await this.prisma.fixture.findMany({
      where: {
        OR: [{ homeClubId: clubId }, { awayClubId: clubId }],
        status: 'SCHEDULED',
        kickoffAt: { gt: new Date() },
      },
      include: {
        homeClub: { include: { alias: true } },
        awayClub: { include: { alias: true } },
      },
      orderBy: { kickoffAt: 'asc' },
      take: 5,
    });
    return fixtures.map((f) => this.mapFixture(f));
  }

  private mapFixture(f: any) {
    return {
      id: f.id,
      gameweekId: f.gameweekId,
      homeClubId: f.homeClubId,
      homeClubName: this.aliasService.resolveClub(f.homeClub).name,
      awayClubId: f.awayClubId,
      awayClubName: this.aliasService.resolveClub(f.awayClub).name,
      kickoffAt: f.kickoffAt,
      status: f.status,
      homeGoals: f.homeGoals,
      awayGoals: f.awayGoals,
    };
  }
}
