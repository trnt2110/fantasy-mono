import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { RedisService } from '../../infrastructure/redis/redis.service';
import { ScoringService } from '../scoring/scoring.service';
import { CreateBotsDto } from './dto/simulate.dto';

@Injectable()
export class SimulationService {
  private readonly logger = new Logger(SimulationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly scoring: ScoringService,
  ) {}

  private shuffle<T>(arr: T[]): T[] {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  private async buildRandomSquad(competitionId: number): Promise<{
    players: any[];
    startingIds: number[];
    formation: string;
    captainId: number;
    viceCaptainId: number;
    benchOrder: Record<number, number>;
  }> {
    const allPlayers = await this.prisma.player.findMany({
      where: { isAvailable: true },
      include: { competitionPrices: { where: { competitionId } } },
    });

    const available = allPlayers
      .filter((p) => p.competitionPrices.length > 0)
      .map((p) => ({ ...p, price: p.competitionPrices[0].currentPrice.toNumber() }));

    const byPos: Record<string, typeof available> = {
      GK: this.shuffle(available.filter((p) => p.position === 'GK')),
      DEF: this.shuffle(available.filter((p) => p.position === 'DEF')),
      MID: this.shuffle(available.filter((p) => p.position === 'MID')),
      FWD: this.shuffle(available.filter((p) => p.position === 'FWD')),
    };

    const needs: Record<string, number> = { GK: 2, DEF: 5, MID: 5, FWD: 3 };
    const squad: typeof available = [];
    const clubCounts: Record<number, number> = {};
    let totalCost = 0;

    for (const [pos, count] of Object.entries(needs)) {
      let picked = 0;
      for (const player of byPos[pos]) {
        if (picked >= count) break;
        if ((clubCounts[player.clubId] || 0) >= 3) continue;
        // Reserve 4m per remaining player slot to stay within 100m
        const remainingSlots = 15 - squad.length - 1;
        if (totalCost + player.price + remainingSlots * 4 > 100) continue;
        squad.push(player);
        clubCounts[player.clubId] = (clubCounts[player.clubId] || 0) + 1;
        totalCost += player.price;
        picked++;
      }
      if (picked < count) {
        throw new BadRequestException(
          `Cannot find ${count} ${pos} players within budget. Ensure enough players are seeded.`,
        );
      }
    }

    // Starting XI: 4-4-2 — 1 GK, 4 DEF, 4 MID, 2 FWD
    const gks = squad.filter((p) => p.position === 'GK');
    const defs = squad.filter((p) => p.position === 'DEF');
    const mids = squad.filter((p) => p.position === 'MID');
    const fwds = squad.filter((p) => p.position === 'FWD');

    const startingIds = [
      gks[0].id,
      ...defs.slice(0, 4).map((p) => p.id),
      ...mids.slice(0, 4).map((p) => p.id),
      ...fwds.slice(0, 2).map((p) => p.id),
    ];

    // Captain = highest-price starter (excluding GK); vice-captain = second highest
    const outfieldStarters = [...defs.slice(0, 4), ...mids.slice(0, 4), ...fwds.slice(0, 2)].sort(
      (a, b) => b.price - a.price,
    );
    const captainId = outfieldStarters[0].id;
    const viceCaptainId = outfieldStarters[1].id;

    // Bench: GK2, DEF5, MID5, FWD3 (bench positions 1–4)
    const bench = [gks[1], defs[4], mids[4], fwds[2]];
    const benchOrder: Record<number, number> = {};
    bench.forEach((p, i) => {
      benchOrder[p.id] = i + 1;
    });

    return { players: squad, startingIds, formation: '4-4-2', captainId, viceCaptainId, benchOrder };
  }

  async createBots(dto: CreateBotsDto): Promise<{ created: number; skipped: number; botIds: string[] }> {
    const competition = await this.prisma.competition.findUnique({ where: { id: dto.competitionId } });
    if (!competition) throw new NotFoundException(`Competition ${dto.competitionId} not found`);
    if (!competition.isActive) {
      throw new BadRequestException(
        `Competition ${dto.competitionId} is not active. Run: UPDATE "Competition" SET "isActive" = true WHERE id = ${dto.competitionId};`,
      );
    }

    const currentGw = await this.prisma.gameweek.findFirst({
      where: { competitionId: dto.competitionId, isCurrent: true },
    });
    if (!currentGw) throw new BadRequestException(`No current gameweek for competition ${dto.competitionId}`);

    const bcrypt = await import('bcryptjs');
    const hash = await bcrypt.hash('bot_password_123', 10);

    let created = 0;
    let skipped = 0;
    const botIds: string[] = [];

    for (let i = 1; i <= dto.count; i++) {
      const email = `bot_${dto.competitionId}_${i}@sim.test`;

      const existing = await this.prisma.user.findUnique({ where: { email } });
      if (existing) {
        // Check if they already have a team
        const existingTeam = await this.prisma.fantasyTeam.findUnique({
          where: { userId_competitionId: { userId: existing.id, competitionId: dto.competitionId } },
        });
        if (existingTeam) {
          skipped++;
          botIds.push(existing.id);
          continue;
        }
      }

      const user =
        existing ??
        (await this.prisma.user.create({
          data: { email, username: `Bot_${dto.competitionId}_${i}`, passwordHash: hash },
        }));

      const squad = await this.buildRandomSquad(dto.competitionId);
      const totalCost = squad.players.reduce((sum, p) => sum + p.price, 0);
      const budget = Math.round((100 - totalCost) * 10) / 10;

      await this.prisma.$transaction(async (tx) => {
        const team = await tx.fantasyTeam.create({
          data: {
            userId: user.id,
            competitionId: dto.competitionId,
            name: `Bot Team ${i}`,
            budget,
            totalValue: Math.round(totalCost * 10) / 10,
            formation: squad.formation,
            freeTransfers: 1,
          },
        });

        const startingSet = new Set(squad.startingIds);
        await tx.playerPick.createMany({
          data: squad.players.map((p) => ({
            fantasyTeamId: team.id,
            playerId: p.id,
            gameweekId: currentGw.id,
            isCaptain: p.id === squad.captainId,
            isViceCaptain: p.id === squad.viceCaptainId,
            isStarting: startingSet.has(p.id),
            benchOrder: squad.benchOrder[p.id] ?? null,
            multiplier: 1,
          })),
        });
      });

      botIds.push(user.id);
      created++;
      this.logger.log(`Created bot ${i}: ${email}`);
    }

    return { created, skipped, botIds };
  }

  async openGameweek(gwId: number, minutesFromNow: number): Promise<{ gameweekId: number; deadlineTime: Date }> {
    const gw = await this.prisma.gameweek.findUnique({ where: { id: gwId } });
    if (!gw) throw new NotFoundException(`Gameweek ${gwId} not found`);

    const deadlineTime = new Date(Date.now() + minutesFromNow * 60_000);
    await this.prisma.gameweek.update({ where: { id: gwId }, data: { deadlineTime } });

    this.logger.log(`GW ${gwId} opened — deadline set to ${deadlineTime.toISOString()}`);
    return { gameweekId: gwId, deadlineTime };
  }

  async submitBotPicks(gwId: number): Promise<{ bots: number; picksSeeded: number }> {
    const gw = await this.prisma.gameweek.findUnique({ where: { id: gwId } });
    if (!gw) throw new NotFoundException(`Gameweek ${gwId} not found`);

    // Get all bot teams (users whose email matches bot pattern)
    const botTeams = await this.prisma.fantasyTeam.findMany({
      where: {
        competitionId: gw.competitionId,
        user: { email: { contains: '@sim.test' } },
      },
    });

    let picksSeeded = 0;

    for (const team of botTeams) {
      // Check if picks already exist for this GW
      const existingPicks = await this.prisma.playerPick.findMany({
        where: { fantasyTeamId: team.id, gameweekId: gwId },
      });

      if (existingPicks.length > 0) continue; // already seeded

      // Find the most recent prior GW this team has picks for
      const latestPriorPick = await this.prisma.playerPick.findFirst({
        where: { fantasyTeamId: team.id, gameweekId: { not: gwId } },
        orderBy: { gameweek: { number: 'desc' } },
        select: { gameweekId: true },
      });

      if (!latestPriorPick) {
        this.logger.warn(`Bot team ${team.id} has no previous picks to seed from`);
        continue;
      }

      const previousPicks = await this.prisma.playerPick.findMany({
        where: { fantasyTeamId: team.id, gameweekId: latestPriorPick.gameweekId },
      });

      await this.prisma.playerPick.createMany({
        data: previousPicks.map((p) => ({
          fantasyTeamId: team.id,
          playerId: p.playerId,
          gameweekId: gwId,
          isCaptain: p.isCaptain,
          isViceCaptain: p.isViceCaptain,
          isStarting: p.isStarting,
          benchOrder: p.benchOrder,
          multiplier: 1,
        })),
        skipDuplicates: true,
      });

      picksSeeded++;
    }

    return { bots: botTeams.length, picksSeeded };
  }

  private generatePerformance(position: string): {
    minutesPlayed: number; goalsScored: number; assists: number;
    cleanSheet: boolean; goalsConceded: number; ownGoals: number;
    penaltiesSaved: number; penaltiesMissed: number;
    yellowCards: number; redCards: number; saves: number; bonus: number;
  } {
    const r = Math.random;
    const played = r() > 0.08;
    if (!played) {
      return { minutesPlayed: 0, goalsScored: 0, assists: 0, cleanSheet: false,
        goalsConceded: 0, ownGoals: 0, penaltiesSaved: 0, penaltiesMissed: 0,
        yellowCards: 0, redCards: 0, saves: 0, bonus: 0 };
    }
    const minutesPlayed = r() > 0.25 ? Math.floor(60 + r() * 30) : Math.floor(1 + r() * 59);
    const goalRates: Record<string, number> = { GK: 0.01, DEF: 0.04, MID: 0.12, FWD: 0.28 };
    const cleanSheet = minutesPlayed >= 60 && r() < 0.28;
    return {
      minutesPlayed,
      goalsScored: r() < (goalRates[position] ?? 0.1) ? (r() < 0.15 ? 2 : 1) : 0,
      assists: r() < 0.12 ? 1 : 0,
      cleanSheet,
      goalsConceded: cleanSheet ? 0 : Math.floor(r() * 3),
      ownGoals: r() < 0.01 ? 1 : 0,
      penaltiesSaved: position === 'GK' && r() < 0.02 ? 1 : 0,
      penaltiesMissed: r() < 0.01 ? 1 : 0,
      yellowCards: r() < 0.08 ? 1 : 0,
      redCards: r() < 0.01 ? 1 : 0,
      saves: position === 'GK' ? Math.floor(r() * 7) : 0,
      bonus: [0, 0, 0, 0, 1, 2, 3][Math.floor(r() * 7)],
    };
  }

  async finalizeGameweek(gwId: number): Promise<{ gameweekId: number; teamsScored: number; nextGameweekId: number | null }> {
    const gw = await this.prisma.gameweek.findUnique({
      where: { id: gwId },
      include: { competition: true },
    });
    if (!gw) throw new NotFoundException(`Gameweek ${gwId} not found`);
    if (gw.status === 'FINISHED') throw new BadRequestException(`Gameweek ${gwId} is already FINISHED`);

    await this.prisma.gameweek.update({
      where: { id: gwId },
      data: { deadlineTime: new Date(Date.now() - 60_000), status: 'SCORING' },
    });

    const fixtures = await this.prisma.fixture.findMany({ where: { gameweekId: gwId } });
    const anchorFixtureId = fixtures[0]?.id ?? null;

    const picks = await this.prisma.playerPick.findMany({
      where: { gameweekId: gwId },
      include: { player: { select: { position: true } } },
      distinct: ['playerId'],
    });

    for (const pick of picks) {
      const stats = this.generatePerformance(pick.player.position);
      const { totalPoints, pointsBreakdown } = this.scoring.calculatePlayerPoints(stats, pick.player.position as any);

      const existing = await this.prisma.playerPerformance.findFirst({
        where: { playerId: pick.playerId, gameweekId: gwId },
      });
      if (existing) {
        await this.prisma.playerPerformance.update({
          where: { id: existing.id },
          data: { ...stats, totalPoints, pointsBreakdown, isFinalised: true },
        });
      } else {
        await this.prisma.playerPerformance.create({
          data: { playerId: pick.playerId, gameweekId: gwId, fixtureId: anchorFixtureId,
            ...stats, totalPoints, pointsBreakdown, isFinalised: true },
        });
      }
    }

    await this.prisma.fixture.updateMany({ where: { gameweekId: gwId }, data: { status: 'FINISHED' } });
    await this.scoring.finaliseGameweekScores(gwId);
    await this.prisma.gameweek.update({ where: { id: gwId }, data: { status: 'FINISHED', isCurrent: false } });

    const nextGw = await this.prisma.gameweek.findFirst({
      where: { competitionId: gw.competitionId, status: { not: 'FINISHED' } },
      orderBy: { number: 'asc' },
    });
    if (nextGw) {
      await this.prisma.gameweek.update({ where: { id: nextGw.id }, data: { isCurrent: true } });

      // Seed next GW picks for all teams — copy verbatim from current GW picks
      const teams = await this.prisma.fantasyTeam.findMany({
        where: { competitionId: gw.competitionId },
        select: { id: true },
      });
      for (const team of teams) {
        const alreadyHasPicks = await this.prisma.playerPick.findFirst({
          where: { fantasyTeamId: team.id, gameweekId: nextGw.id },
        });
        if (alreadyHasPicks) continue;
        const prevPicks = await this.prisma.playerPick.findMany({
          where: { fantasyTeamId: team.id, gameweekId: gwId },
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

    await this.redis.delByPattern(`leaderboard:global:${gw.competitionId}:*`);
    await this.redis.delByPattern(`leaderboard:league:*`);

    const scored = await this.prisma.gameweekScore.count({ where: { gameweekId: gwId } });
    this.logger.log(`GW ${gwId} finalized — ${scored} teams scored. Next GW: ${nextGw?.id ?? 'none'}`);
    return { gameweekId: gwId, teamsScored: scored, nextGameweekId: nextGw?.id ?? null };
  }

  async resetBots(competitionId: number): Promise<{ deleted: number }> {
    const bots = await this.prisma.user.findMany({
      where: { email: { contains: '@sim.test' } },
      select: { id: true },
    });

    if (bots.length === 0) return { deleted: 0 };

    const botIds = bots.map((b) => b.id);

    // Delete in dependency order: picks → teams → users
    const teamIds = (
      await this.prisma.fantasyTeam.findMany({
        where: { userId: { in: botIds }, competitionId },
        select: { id: true },
      })
    ).map((t) => t.id);

    await this.prisma.playerPick.deleteMany({ where: { fantasyTeamId: { in: teamIds } } });
    await this.prisma.fantasyTeam.deleteMany({ where: { id: { in: teamIds } } });
    await this.prisma.user.deleteMany({ where: { id: { in: botIds } } });

    this.logger.log(`Reset ${bots.length} bots for competition ${competitionId}`);
    return { deleted: bots.length };
  }

  async getStatus(competitionId: number) {
    const botCount = await this.prisma.user.count({
      where: { email: { contains: '@sim.test' } },
    });

    const currentGameweek = await this.prisma.gameweek.findFirst({
      where: { competitionId, isCurrent: true },
      select: { id: true, number: true, status: true, deadlineTime: true },
    });

    const finishedGws = await this.prisma.gameweek.findMany({
      where: { competitionId, status: 'FINISHED' },
      orderBy: { number: 'desc' },
      select: { id: true, number: true, deadlineTime: true },
    });

    const finishedGameweeks = await Promise.all(
      finishedGws.map(async (gw) => ({
        ...gw,
        teamsScored: await this.prisma.gameweekScore.count({ where: { gameweekId: gw.id } }),
      })),
    );

    return { botCount, competitionId, currentGameweek: currentGameweek ?? null, finishedGameweeks };
  }
}
