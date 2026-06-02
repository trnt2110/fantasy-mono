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
    throw new Error('Not implemented');
  }

  async finalizeGameweek(gwId: number): Promise<{ gameweekId: number; teamsScored: number; nextGameweekId: number | null }> {
    throw new Error('Not implemented');
  }
}
