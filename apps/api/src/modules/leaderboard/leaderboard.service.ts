import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { RedisService } from '../../infrastructure/redis/redis.service';

const LEADERBOARD_CACHE_TTL = 5 * 60; // 5 minutes

export interface LeaderboardEntry {
  rank: number;
  fantasyTeamId: string;
  teamName: string;
  username: string;
  gwPoints: number;
  totalPoints: number;
}

export interface LeaderboardResult {
  data: LeaderboardEntry[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

@Injectable()
export class LeaderboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async getGlobalStandings(
    competitionId: number,
    gameweekId: number | undefined,
    page: number,
    limit: number,
  ): Promise<LeaderboardResult> {
    const competition = await this.prisma.competition.findUnique({ where: { id: competitionId } });
    if (!competition) throw new NotFoundException(`Competition ${competitionId} not found`);

    let resolvedGwId = gameweekId;
    if (!resolvedGwId) {
      const current = await this.prisma.gameweek.findFirst({
        where: { competitionId, isCurrent: true },
      });
      resolvedGwId = current?.id;
    }

    const cacheKey = `leaderboard:global:${competitionId}:${resolvedGwId ?? 'latest'}:${page}:${limit}`;

    return this.redis.getOrSet(cacheKey, LEADERBOARD_CACHE_TTL, () =>
      this.fetchGlobalStandings(competitionId, resolvedGwId, page, limit),
    );
  }

  private async fetchGlobalStandings(
    competitionId: number,
    gameweekId: number | undefined,
    page: number,
    limit: number,
  ): Promise<LeaderboardResult> {
    const skip = (page - 1) * limit;

    // Get total team count
    const total = await this.prisma.fantasyTeam.count({ where: { competitionId } });

    if (!gameweekId) {
      // No GW data yet — return teams ordered by totalPoints (all 0)
      const teams = await this.prisma.fantasyTeam.findMany({
        where: { competitionId },
        include: { user: { select: { username: true } } },
        skip,
        take: limit,
      });

      const data: LeaderboardEntry[] = teams.map((team, idx) => ({
        rank: skip + idx + 1,
        fantasyTeamId: team.id,
        teamName: team.name,
        username: team.user.username,
        gwPoints: 0,
        totalPoints: 0,
      }));

      return { data, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
    }

    const scores = await this.prisma.gameweekScore.findMany({
      where: { gameweekId, fantasyTeam: { competitionId } },
      orderBy: { totalPoints: 'desc' },
      include: {
        fantasyTeam: {
          select: { name: true, user: { select: { username: true } } },
        },
      },
      skip,
      take: limit,
    });

    const data: LeaderboardEntry[] = scores.map((score, idx) => ({
      rank: score.rank ?? skip + idx + 1,
      fantasyTeamId: score.fantasyTeamId,
      teamName: score.fantasyTeam.name,
      username: score.fantasyTeam.user.username,
      gwPoints: score.points,
      totalPoints: score.totalPoints,
    }));

    return { data, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }
}
