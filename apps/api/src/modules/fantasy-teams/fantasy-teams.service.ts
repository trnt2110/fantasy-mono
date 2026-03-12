import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { AliasService } from '../alias/alias.service';
import { CreateFantasyTeamDto } from './dto/create-fantasy-team.dto';
import { Player } from '@prisma/client';

const VALID_FORMATIONS = ['3-4-3', '3-5-2', '4-3-3', '4-4-2', '4-5-1', '5-3-2', '5-4-1'];
const BUDGET = 100.0;

@Injectable()
export class FantasyTeamsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly aliasService: AliasService,
  ) {}

  async create(userId: string, dto: CreateFantasyTeamDto) {
    // Check competition exists
    const competition = await this.prisma.competition.findUnique({
      where: { id: dto.competitionId },
    });
    if (!competition || !competition.isActive) {
      throw new NotFoundException('Competition not found or inactive');
    }

    // Prevent duplicate team for this user + competition
    const existing = await this.prisma.fantasyTeam.findUnique({
      where: { userId_competitionId: { userId, competitionId: dto.competitionId } },
    });
    if (existing) {
      throw new BadRequestException('You already have a team in this competition');
    }

    // Fetch all 15 players with prices
    const players = await this.prisma.player.findMany({
      where: { id: { in: dto.playerIds } },
      include: {
        competitionPrices: { where: { competitionId: dto.competitionId } },
      },
    });

    if (players.length !== 15) {
      throw new BadRequestException('One or more player IDs are invalid');
    }

    // Validate all have prices in this competition
    for (const p of players) {
      if (!p.competitionPrices[0]) {
        throw new BadRequestException(`Player ${p.id} is not available in this competition`);
      }
    }

    // Validate squad rules
    this.validateSquadComposition(players as any, dto);

    // Calculate budget
    const totalCost = players.reduce(
      (sum, p) => sum + Number(p.competitionPrices[0].currentPrice),
      0,
    );
    const budget = Math.round((BUDGET - totalCost) * 10) / 10;
    if (budget < 0) {
      throw new BadRequestException(`Squad cost ${totalCost.toFixed(1)}m exceeds budget of ${BUDGET}m`);
    }

    // Find initial gameweek
    const gameweek = await this.prisma.gameweek.findFirst({
      where: {
        competitionId: dto.competitionId,
        OR: [{ isCurrent: true }, { status: 'SCHEDULED' }],
      },
      orderBy: { number: 'asc' },
    });
    if (!gameweek) {
      throw new BadRequestException('No active gameweek found for this competition');
    }

    const startingSet = new Set(dto.startingIds);

    // Create team + picks in a transaction
    const fantasyTeam = await this.prisma.$transaction(async (tx) => {
      const team = await tx.fantasyTeam.create({
        data: {
          userId,
          competitionId: dto.competitionId,
          name: dto.name,
          budget,
          totalValue: Math.round(totalCost * 10) / 10,
          formation: dto.formation,
          freeTransfers: 1,
        },
      });

      await tx.playerPick.createMany({
        data: players.map((p) => ({
          fantasyTeamId: team.id,
          playerId: p.id,
          gameweekId: gameweek.id,
          isCaptain: p.id === dto.captainId,
          isViceCaptain: p.id === dto.viceCaptainId,
          isStarting: startingSet.has(p.id),
          benchOrder: startingSet.has(p.id) ? null : (dto.benchOrder[String(p.id)] ?? null),
          multiplier: 1,
        })),
      });

      return team;
    });

    return fantasyTeam;
  }

  async findMine(userId: string, competitionId: number) {
    const team = await this.prisma.fantasyTeam.findUnique({
      where: { userId_competitionId: { userId, competitionId } },
    });
    if (!team) throw new NotFoundException('Fantasy team not found');
    return team;
  }

  async findOne(id: string, requestingUserId: string) {
    const team = await this.prisma.fantasyTeam.findUnique({
      where: { id },
      include: { user: { select: { username: true } } },
    });
    if (!team) throw new NotFoundException('Fantasy team not found');

    return {
      id: team.id,
      userId: team.userId,
      username: team.user.username,
      competitionId: team.competitionId,
      name: team.name,
      budget: Number(team.budget),
      totalValue: Number(team.totalValue),
      formation: team.formation,
      freeTransfers: team.freeTransfers,
    };
  }

  async findScores(id: string) {
    await this.assertTeamExists(id);
    const scores = await this.prisma.gameweekScore.findMany({
      where: { fantasyTeamId: id },
      include: { gameweek: { select: { number: true } } },
      orderBy: { gameweek: { number: 'asc' } },
    });
    return scores.map((s) => ({
      gameweekId: s.gameweekId,
      gameweekNumber: s.gameweek.number,
      points: s.points,
      totalPoints: s.totalPoints,
      rank: s.rank,
      isFinalised: s.isFinalised,
    }));
  }

  private async assertTeamExists(id: string) {
    const team = await this.prisma.fantasyTeam.findUnique({ where: { id } });
    if (!team) throw new NotFoundException('Fantasy team not found');
    return team;
  }

  private validateSquadComposition(
    players: (Player & { competitionPrices: { currentPrice: any }[] })[],
    dto: CreateFantasyTeamDto,
  ) {
    // All players must be available
    if (players.some((p) => !p.isAvailable)) {
      throw new BadRequestException('One or more players are unavailable');
    }

    // No duplicate IDs
    if (new Set(dto.playerIds).size !== 15) {
      throw new BadRequestException('Player IDs must be unique');
    }

    // Position counts: GK=2, DEF=5, MID=5, FWD=3
    const byPos = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
    for (const p of players) byPos[p.position]++;
    if (byPos.GK !== 2 || byPos.DEF !== 5 || byPos.MID !== 5 || byPos.FWD !== 3) {
      throw new BadRequestException(
        `Invalid position composition: got GK=${byPos.GK} DEF=${byPos.DEF} MID=${byPos.MID} FWD=${byPos.FWD}, need 2/5/5/3`,
      );
    }

    // Max 3 per club
    const clubCounts: Record<number, number> = {};
    for (const p of players) {
      clubCounts[p.clubId] = (clubCounts[p.clubId] || 0) + 1;
      if (clubCounts[p.clubId] > 3) {
        throw new BadRequestException('Maximum 3 players from the same club');
      }
    }

    // Starting XI
    const startingSet = new Set(dto.startingIds);
    if (new Set(dto.startingIds).size !== 11) {
      throw new BadRequestException('Starting IDs must be unique');
    }
    const notInSquad = dto.startingIds.filter((id) => !dto.playerIds.includes(id));
    if (notInSquad.length > 0) {
      throw new BadRequestException('Starting players must be part of the 15-player squad');
    }

    // Formation validation
    if (!VALID_FORMATIONS.includes(dto.formation)) {
      throw new BadRequestException(
        `Invalid formation. Supported: ${VALID_FORMATIONS.join(', ')}`,
      );
    }
    const [def, mid, fwd] = dto.formation.split('-').map(Number);
    const startingPlayers = players.filter((p) => startingSet.has(p.id));
    const gkCount = startingPlayers.filter((p) => p.position === 'GK').length;
    const defCount = startingPlayers.filter((p) => p.position === 'DEF').length;
    const midCount = startingPlayers.filter((p) => p.position === 'MID').length;
    const fwdCount = startingPlayers.filter((p) => p.position === 'FWD').length;
    if (gkCount !== 1 || defCount !== def || midCount !== mid || fwdCount !== fwd) {
      throw new BadRequestException(
        `Formation ${dto.formation} requires 1 GK, ${def} DEF, ${mid} MID, ${fwd} FWD in starting XI`,
      );
    }

    // Captain/vice-captain must be in starting XI and different
    if (!startingSet.has(dto.captainId) || !startingSet.has(dto.viceCaptainId)) {
      throw new BadRequestException('Captain and vice-captain must be in the starting XI');
    }
    if (dto.captainId === dto.viceCaptainId) {
      throw new BadRequestException('Captain and vice-captain must be different players');
    }

    // Bench order: exactly 4 bench players, positions 1–4
    const benchIds = players.filter((p) => !startingSet.has(p.id)).map((p) => p.id);
    const benchEntries = Object.entries(dto.benchOrder);
    if (benchEntries.length !== 4) {
      throw new BadRequestException('benchOrder must specify exactly 4 players');
    }
    const benchPositions = benchEntries.map(([, v]) => v);
    if (!benchPositions.every((v) => [1, 2, 3, 4].includes(v)) || new Set(benchPositions).size !== 4) {
      throw new BadRequestException('Bench positions must be unique values 1–4');
    }
    for (const [playerId] of benchEntries) {
      if (!benchIds.includes(Number(playerId))) {
        throw new BadRequestException(`Player ${playerId} is not on the bench`);
      }
    }
  }
}
