import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { RedisService } from '../../infrastructure/redis/redis.service';
import { CreateLeagueDto } from './dto/create-league.dto';
import { JoinLeagueDto } from './dto/join-league.dto';

const LEAGUE_STANDINGS_CACHE_TTL = 5 * 60; // 5 minutes

function generateCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

@Injectable()
export class FantasyLeaguesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async createLeague(userId: string, dto: CreateLeagueDto) {
    const team = await this.prisma.fantasyTeam.findUnique({
      where: { id: dto.fantasyTeamId },
    });
    if (!team) throw new NotFoundException('Fantasy team not found');
    if (team.userId !== userId) throw new ForbiddenException('Not your fantasy team');
    if (team.competitionId !== dto.competitionId) {
      throw new BadRequestException('Fantasy team is not in the specified competition');
    }

    // Generate unique invite code
    let code: string;
    let attempts = 0;
    do {
      code = generateCode();
      attempts++;
      if (attempts > 10) throw new Error('Failed to generate unique invite code');
    } while (await this.prisma.fantasyLeague.findUnique({ where: { code } }));

    const league = await this.prisma.$transaction(async (tx) => {
      const created = await tx.fantasyLeague.create({
        data: {
          name: dto.name,
          code,
          competitionId: dto.competitionId,
          adminTeamId: dto.fantasyTeamId,
        },
      });

      // Creator automatically joins
      await tx.fantasyLeagueMembership.create({
        data: {
          leagueId: created.id,
          fantasyTeamId: dto.fantasyTeamId,
          userId,
        },
      });

      return created;
    });

    return { id: league.id, name: league.name, code: league.code, competitionId: league.competitionId };
  }

  async joinLeague(userId: string, dto: JoinLeagueDto) {
    const league = await this.prisma.fantasyLeague.findUnique({ where: { code: dto.code } });
    if (!league) throw new NotFoundException('League not found — check invite code');

    const team = await this.prisma.fantasyTeam.findUnique({ where: { id: dto.fantasyTeamId } });
    if (!team) throw new NotFoundException('Fantasy team not found');
    if (team.userId !== userId) throw new ForbiddenException('Not your fantasy team');
    if (team.competitionId !== league.competitionId) {
      throw new BadRequestException('Your fantasy team must be in the same competition as this league');
    }

    const existing = await this.prisma.fantasyLeagueMembership.findUnique({
      where: { leagueId_fantasyTeamId: { leagueId: league.id, fantasyTeamId: dto.fantasyTeamId } },
    });
    if (existing) throw new BadRequestException('Already a member of this league');

    await this.prisma.fantasyLeagueMembership.create({
      data: { leagueId: league.id, fantasyTeamId: dto.fantasyTeamId, userId },
    });

    return { message: `Joined league "${league.name}" successfully` };
  }

  async getMyLeagues(userId: string) {
    const memberships = await this.prisma.fantasyLeagueMembership.findMany({
      where: { userId },
      include: {
        league: {
          include: { _count: { select: { memberships: true } } },
        },
      },
      orderBy: { joinedAt: 'desc' },
    });

    return memberships.map((m) => ({
      id: m.league.id,
      name: m.league.name,
      code: m.league.code,
      competitionId: m.league.competitionId,
      memberCount: m.league._count.memberships,
      joinedAt: m.joinedAt,
    }));
  }

  async getStandings(leagueId: number, userId: string, gameweekId?: number) {
    // Check membership
    const membership = await this.prisma.fantasyLeagueMembership.findFirst({
      where: { leagueId, userId },
    });
    if (!membership) throw new ForbiddenException('You are not a member of this league');

    const league = await this.prisma.fantasyLeague.findUnique({
      where: { id: leagueId },
    });
    if (!league) throw new NotFoundException('League not found');

    const cacheKey = `leaderboard:league:${leagueId}:${gameweekId ?? 'latest'}`;
    return this.redis.getOrSet(cacheKey, LEAGUE_STANDINGS_CACHE_TTL, () =>
      this.fetchLeagueStandings(leagueId, league.competitionId, gameweekId),
    );
  }

  private async fetchLeagueStandings(
    leagueId: number,
    competitionId: number,
    gameweekId?: number,
  ) {
    let resolvedGwId = gameweekId;
    if (!resolvedGwId) {
      const current = await this.prisma.gameweek.findFirst({
        where: { competitionId, isCurrent: true },
      });
      resolvedGwId = current?.id;
    }

    const memberships = await this.prisma.fantasyLeagueMembership.findMany({
      where: { leagueId },
      include: {
        fantasyTeam: { select: { name: true, user: { select: { username: true } } } },
      },
    });

    const teamIds = memberships.map((m) => m.fantasyTeamId);

    const scoreMap = new Map<string, { points: number; totalPoints: number }>();
    if (resolvedGwId) {
      const scores = await this.prisma.gameweekScore.findMany({
        where: { gameweekId: resolvedGwId, fantasyTeamId: { in: teamIds } },
        select: { fantasyTeamId: true, points: true, totalPoints: true },
      });
      for (const s of scores) {
        scoreMap.set(s.fantasyTeamId, { points: s.points, totalPoints: s.totalPoints });
      }
    }

    const entries = memberships.map((m) => {
      const score = scoreMap.get(m.fantasyTeamId);
      return {
        fantasyTeamId: m.fantasyTeamId,
        teamName: m.fantasyTeam.name,
        username: m.fantasyTeam.user.username,
        gwPoints: score?.points ?? 0,
        totalPoints: score?.totalPoints ?? 0,
        joinedAt: m.joinedAt,
      };
    });

    // Sort by totalPoints DESC, then gwPoints DESC
    entries.sort((a, b) => b.totalPoints - a.totalPoints || b.gwPoints - a.gwPoints);

    return entries.map((e, idx) => ({ rank: idx + 1, ...e }));
  }
}
