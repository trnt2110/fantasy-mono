import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { AliasService } from '../alias/alias.service';
import { SubmitPicksDto } from './dto/submit-picks.dto';

const VALID_FORMATIONS = ['3-4-3', '3-5-2', '4-3-3', '4-4-2', '4-5-1', '5-3-2', '5-4-1'];

@Injectable()
export class PicksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly aliasService: AliasService,
  ) {}

  async submitPicks(gameweekId: number, userId: string, dto: SubmitPicksDto) {
    // Validate the team belongs to this user
    const team = await this.prisma.fantasyTeam.findUnique({
      where: { id: dto.fantasyTeamId },
    });
    if (!team) throw new NotFoundException('Fantasy team not found');
    if (team.userId !== userId) throw new ForbiddenException('Not your fantasy team');

    // Validate gameweek belongs to the same competition
    const gameweek = await this.prisma.gameweek.findFirst({
      where: { id: gameweekId, competitionId: team.competitionId },
    });
    if (!gameweek) throw new NotFoundException('Gameweek not found for this competition');

    // Find existing squad picks for this GW (or seed from latest GW)
    let picks = await this.prisma.playerPick.findMany({
      where: { fantasyTeamId: dto.fantasyTeamId, gameweekId },
      include: { player: true },
    });

    if (picks.length === 0) {
      // Seed from the most recent GW that has picks
      const latestPicks = await this.prisma.playerPick.findMany({
        where: { fantasyTeamId: dto.fantasyTeamId },
        include: { player: true, gameweek: { select: { number: true } } },
        orderBy: { gameweek: { number: 'desc' } },
        take: 15,
      });
      if (latestPicks.length === 0) {
        throw new BadRequestException('No squad found. Create a fantasy team first.');
      }
      await this.prisma.playerPick.createMany({
        data: latestPicks.map((p) => ({
          fantasyTeamId: dto.fantasyTeamId,
          playerId: p.playerId,
          gameweekId,
          isCaptain: false,
          isViceCaptain: false,
          isStarting: p.isStarting,
          benchOrder: p.benchOrder,
          multiplier: 1,
        })),
      });
      picks = await this.prisma.playerPick.findMany({
        where: { fantasyTeamId: dto.fantasyTeamId, gameweekId },
        include: { player: true },
      });
    }

    const squadPlayerIds = picks.map((p) => p.playerId);

    // Validate starting IDs are in the squad
    const startingSet = new Set(dto.startingPlayerIds);
    if (new Set(dto.startingPlayerIds).size !== 11) {
      throw new BadRequestException('Starting player IDs must be unique');
    }
    const notInSquad = dto.startingPlayerIds.filter((id) => !squadPlayerIds.includes(id));
    if (notInSquad.length > 0) {
      throw new BadRequestException('Starting players must be part of the squad');
    }

    // Formation validation from starting XI
    const startingPlayers = picks
      .filter((p) => startingSet.has(p.playerId))
      .map((p) => p.player);

    const gkCount = startingPlayers.filter((p) => p.position === 'GK').length;
    const defCount = startingPlayers.filter((p) => p.position === 'DEF').length;
    const midCount = startingPlayers.filter((p) => p.position === 'MID').length;
    const fwdCount = startingPlayers.filter((p) => p.position === 'FWD').length;

    const detectedFormation = `${defCount}-${midCount}-${fwdCount}`;
    if (gkCount !== 1 || !VALID_FORMATIONS.includes(detectedFormation)) {
      throw new BadRequestException(
        `Invalid starting XI composition: GK=${gkCount} DEF=${defCount} MID=${midCount} FWD=${fwdCount}. Supported formations: ${VALID_FORMATIONS.join(', ')}`,
      );
    }

    // Captain/vice-captain must be in starting XI and different
    if (!startingSet.has(dto.captainId) || !startingSet.has(dto.viceCaptainId)) {
      throw new BadRequestException('Captain and vice-captain must be in the starting XI');
    }
    if (dto.captainId === dto.viceCaptainId) {
      throw new BadRequestException('Captain and vice-captain must be different players');
    }

    // Bench order validation
    const benchIds = squadPlayerIds.filter((id) => !startingSet.has(id));
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

    // Update all picks in a transaction
    await this.prisma.$transaction(
      picks.map((pick) =>
        this.prisma.playerPick.update({
          where: { id: pick.id },
          data: {
            isStarting: startingSet.has(pick.playerId),
            isCaptain: pick.playerId === dto.captainId,
            isViceCaptain: pick.playerId === dto.viceCaptainId,
            benchOrder: startingSet.has(pick.playerId)
              ? null
              : (dto.benchOrder[String(pick.playerId)] ?? null),
          },
        }),
      ),
    );

    // Update team formation
    await this.prisma.fantasyTeam.update({
      where: { id: dto.fantasyTeamId },
      data: { formation: detectedFormation },
    });

    return { message: 'Picks saved', gameweekId, fantasyTeamId: dto.fantasyTeamId };
  }

  async getPicks(gameweekId: number, fantasyTeamId: string) {
    const picks = await this.prisma.playerPick.findMany({
      where: { fantasyTeamId, gameweekId },
      include: {
        player: {
          include: { alias: true, club: { include: { alias: true } } },
        },
      },
      orderBy: [{ isStarting: 'desc' }, { benchOrder: 'asc' }],
    });

    if (picks.length === 0) throw new NotFoundException('No picks found for this team/gameweek');

    // Get finalised points if available
    const performances = await this.prisma.playerPerformance.findMany({
      where: {
        playerId: { in: picks.map((p) => p.playerId) },
        gameweekId,
        isFinalised: true,
      },
      select: { playerId: true, totalPoints: true },
    });
    const pointsMap = new Map(performances.map((p) => [p.playerId, p.totalPoints]));

    const team = await this.prisma.fantasyTeam.findUnique({
      where: { id: fantasyTeamId },
      select: { competitionId: true },
    });

    return picks.map((pick) => ({
      playerId: pick.playerId,
      playerName: this.aliasService.resolvePlayer(pick.player).name,
      position: pick.player.position,
      clubId: pick.player.club.id,
      clubName: this.aliasService.resolveClub(pick.player.club as any).name,
      isStarting: pick.isStarting,
      isCaptain: pick.isCaptain,
      isViceCaptain: pick.isViceCaptain,
      benchOrder: pick.benchOrder,
      multiplier: pick.multiplier,
      gwPoints: pointsMap.get(pick.playerId) ?? null,
    }));
  }
}
