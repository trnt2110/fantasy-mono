import { Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { AliasService } from '../alias/alias.service';
import { RedisService } from '../../infrastructure/redis/redis.service';
import { GetPlayersDto } from './dto/get-players.dto';

@Injectable()
export class PlayersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly aliasService: AliasService,
    private readonly redis: RedisService,
  ) {}

  async findAll(dto: GetPlayersDto) {
    const { competitionId, position, clubId, minPrice, maxPrice, search, page = 1, limit = 20 } = dto;
    const cacheKey = `players:list:${createHash('sha256').update(JSON.stringify(dto)).digest('hex')}`;

    return this.redis.getOrSet(cacheKey, 300, async () => {
      const where = {
        isAvailable: true,
        ...(position && { position }),
        ...(clubId && { clubId }),
        ...(search && { alias: { name: { contains: search, mode: 'insensitive' as const } } }),
        competitionPrices: {
          some: {
            competitionId,
            ...(minPrice !== undefined && { currentPrice: { gte: minPrice } }),
            ...(maxPrice !== undefined && { currentPrice: { lte: maxPrice } }),
          },
        },
      };

      const [players, total] = await Promise.all([
        this.prisma.player.findMany({
          where,
          include: {
            alias: true,
            club: { include: { alias: true } },
            competitionPrices: { where: { competitionId } },
          },
          skip: (page - 1) * limit,
          take: limit,
          orderBy: { id: 'asc' },
        }),
        this.prisma.player.count({ where }),
      ]);

      const data = players.map((p) => {
        const price = p.competitionPrices[0];
        return this.aliasService.resolvePlayer(p, price ? Number(price.currentPrice) : undefined);
      });

      return {
        data,
        meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
      };
    });
  }

  async findOne(id: number, competitionId: number) {
    const cacheKey = `players:${id}:${competitionId}`;
    return this.redis.getOrSet(cacheKey, 600, async () => {
      const [player, currentGw] = await Promise.all([
        this.prisma.player.findUniqueOrThrow({
          where: { id },
          include: {
            alias: true,
            club: { include: { alias: true } },
            competitionPrices: { where: { competitionId } },
          },
        }),
        this.prisma.gameweek.findFirst({
          where: { competitionId, isCurrent: true },
          select: { id: true },
        }),
      ]);

      const price = player.competitionPrices[0];
      const resolved = this.aliasService.resolvePlayer(
        player,
        price ? Number(price.currentPrice) : undefined,
      );

      const [teamCount, pickCount] = await Promise.all([
        this.prisma.fantasyTeam.count({ where: { competitionId } }),
        currentGw
          ? this.prisma.playerPick.count({ where: { playerId: id, gameweekId: currentGw.id } })
          : Promise.resolve(0),
      ]);

      return {
        ...resolved,
        ownershipPct: teamCount > 0 ? Math.round((pickCount / teamCount) * 1000) / 10 : 0,
      };
    });
  }

  async findPerformances(id: number, competitionId: number) {
    const rows = await this.prisma.playerPerformance.findMany({
      where: { playerId: id, gameweek: { competitionId }, isFinalised: true },
      include: { gameweek: { select: { id: true, number: true } } },
      orderBy: { gameweek: { number: 'asc' } },
    });

    return rows.map((r) => ({
      gameweekId: r.gameweekId,
      gameweekNumber: r.gameweek.number,
      fixtureId: r.fixtureId,
      minutesPlayed: r.minutesPlayed,
      goalsScored: r.goalsScored,
      assists: r.assists,
      cleanSheet: r.cleanSheet,
      goalsConceded: r.goalsConceded,
      ownGoals: r.ownGoals,
      penaltiesSaved: r.penaltiesSaved,
      penaltiesMissed: r.penaltiesMissed,
      yellowCards: r.yellowCards,
      redCards: r.redCards,
      saves: r.saves,
      bonus: r.bonus,
      totalPoints: r.totalPoints,
      pointsBreakdown: r.pointsBreakdown,
      isFinalised: r.isFinalised,
    }));
  }
}
