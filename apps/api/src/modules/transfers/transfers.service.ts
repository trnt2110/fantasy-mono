import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { CreateTransferDto } from './dto/create-transfer.dto';
import { WILDCARD_HALF_SEASON_BOUNDARY } from '@fantasy/shared';

@Injectable()
export class TransfersService {
  constructor(private readonly prisma: PrismaService) {}

  async executeTransfer(userId: string, dto: CreateTransferDto) {
    if (dto.playerOutId === dto.playerInId) {
      throw new BadRequestException('Player in and player out cannot be the same player');
    }

    // Validate team belongs to user
    const team = await this.prisma.fantasyTeam.findUnique({
      where: { id: dto.fantasyTeamId },
    });
    if (!team) throw new NotFoundException('Fantasy team not found');
    if (team.userId !== userId) throw new ForbiddenException('Not your fantasy team');

    // Find the current open gameweek
    const gameweek = await this.prisma.gameweek.findFirst({
      where: {
        competitionId: team.competitionId,
        isCurrent: true,
        deadlineTime: { gt: new Date() },
        status: { in: ['SCHEDULED', 'ACTIVE'] },
      },
    });
    if (!gameweek) throw new BadRequestException('No open gameweek available for transfers');

    // Find playerOut in current squad (pick for current GW)
    const outPick = await this.prisma.playerPick.findFirst({
      where: { fantasyTeamId: dto.fantasyTeamId, playerId: dto.playerOutId, gameweekId: gameweek.id },
    });
    if (!outPick) throw new BadRequestException('Player to transfer out is not in your squad');

    // Validate playerIn
    const playerIn = await this.prisma.player.findUnique({
      where: { id: dto.playerInId },
      include: { competitionPrices: { where: { competitionId: team.competitionId } } },
    });
    if (!playerIn || !playerIn.isAvailable) {
      throw new BadRequestException('Player to transfer in is unavailable or does not exist');
    }
    if (!playerIn.competitionPrices[0]) {
      throw new BadRequestException('Player is not available in this competition');
    }

    // playerIn must not already be in the squad
    const inAlreadyInSquad = await this.prisma.playerPick.findFirst({
      where: { fantasyTeamId: dto.fantasyTeamId, playerId: dto.playerInId, gameweekId: gameweek.id },
    });
    if (inAlreadyInSquad) throw new BadRequestException('Player is already in your squad');

    const playerOut = await this.prisma.player.findUnique({
      where: { id: dto.playerOutId },
      include: { competitionPrices: { where: { competitionId: team.competitionId } } },
    });
    if (!playerOut?.competitionPrices[0]) {
      throw new BadRequestException('Cannot determine price for player out');
    }

    const priceOut = Number(playerOut.competitionPrices[0].currentPrice);
    const priceIn = Number(playerIn.competitionPrices[0].currentPrice);

    // Budget check
    const newBudget = Math.round((Number(team.budget) + priceOut - priceIn) * 10) / 10;
    if (newBudget < 0) {
      throw new BadRequestException(
        `Insufficient budget. Need ${priceIn}m, have ${(Number(team.budget) + priceOut).toFixed(1)}m`,
      );
    }

    // Position slot check (same position)
    if (playerOut.position !== playerIn.position) {
      throw new BadRequestException(
        `Position mismatch: transferring out a ${playerOut.position} but transferring in a ${playerIn.position}`,
      );
    }

    // Max 3 per club after swap
    const currentSquad = await this.prisma.playerPick.findMany({
      where: { fantasyTeamId: dto.fantasyTeamId, gameweekId: gameweek.id },
      include: { player: true },
    });
    const clubCountAfter: Record<number, number> = {};
    for (const pick of currentSquad) {
      const clubId = pick.playerId === dto.playerOutId ? null : pick.player.clubId;
      if (clubId !== null) {
        clubCountAfter[clubId] = (clubCountAfter[clubId] || 0) + 1;
      }
    }
    clubCountAfter[playerIn.clubId] = (clubCountAfter[playerIn.clubId] || 0) + 1;
    if ((clubCountAfter[playerIn.clubId] ?? 0) > 3) {
      throw new BadRequestException('This transfer would put more than 3 players from the same club in your squad');
    }

    // Count GW transfers (before this one)
    const gwTransferCount = await this.prisma.transfer.count({
      where: { fantasyTeamId: dto.fantasyTeamId, gameweekId: gameweek.id },
    });

    // Wildcard validation
    if (dto.activateWildcard) {
      await this.validateWildcard(dto.fantasyTeamId, gameweek.number);
    }

    // Calculate points deducted for this transfer
    const isWildcard = dto.activateWildcard ?? false;
    const pointsDeducted = isWildcard
      ? 0
      : gwTransferCount + 1 > team.freeTransfers
        ? 4
        : 0;

    // Execute in transaction
    const transfer = await this.prisma.$transaction(async (tx) => {
      // Create Transfer record
      const t = await tx.transfer.create({
        data: {
          fantasyTeamId: dto.fantasyTeamId,
          gameweekId: gameweek.id,
          playerOutId: dto.playerOutId,
          playerInId: dto.playerInId,
          priceOut,
          priceIn,
          isWildcard,
          pointsDeducted,
        },
      });

      // Swap picks: delete outPick, create inPick
      await tx.playerPick.delete({ where: { id: outPick.id } });
      await tx.playerPick.create({
        data: {
          fantasyTeamId: dto.fantasyTeamId,
          playerId: dto.playerInId,
          gameweekId: gameweek.id,
          isCaptain: outPick.isCaptain,
          isViceCaptain: outPick.isViceCaptain,
          isStarting: outPick.isStarting,
          benchOrder: outPick.benchOrder,
          multiplier: 1,
        },
      });

      // Update team budget
      await tx.fantasyTeam.update({
        where: { id: dto.fantasyTeamId },
        data: {
          budget: newBudget,
          totalValue: Math.round((Number(team.totalValue) - priceOut + priceIn) * 10) / 10,
        },
      });

      // Wildcard: zero out all GW deductions + create ChipActivation
      if (isWildcard) {
        await tx.transfer.updateMany({
          where: { fantasyTeamId: dto.fantasyTeamId, gameweekId: gameweek.id },
          data: { pointsDeducted: 0 },
        });
        const halfSeason = gameweek.number <= WILDCARD_HALF_SEASON_BOUNDARY ? 1 : 2;
        await tx.chipActivation.create({
          data: {
            fantasyTeamId: dto.fantasyTeamId,
            chip: 'WILDCARD',
            gameweekId: gameweek.id,
            halfSeason,
          },
        });
      }

      return t;
    });

    return {
      transferId: transfer.id,
      playerOutId: dto.playerOutId,
      playerInId: dto.playerInId,
      priceOut,
      priceIn,
      newBudget,
      pointsDeducted: transfer.pointsDeducted,
    };
  }

  async findTransfers(fantasyTeamId: string, gameweekId: number) {
    const transfers = await this.prisma.transfer.findMany({
      where: { fantasyTeamId, gameweekId },
      include: {
        playerOut: { include: { alias: true } },
        playerIn: { include: { alias: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    return transfers.map((t) => ({
      id: t.id,
      playerOutId: t.playerOutId,
      playerOutName: t.playerOut.alias?.name ?? '[Unnamed]',
      playerInId: t.playerInId,
      playerInName: t.playerIn.alias?.name ?? '[Unnamed]',
      priceOut: Number(t.priceOut),
      priceIn: Number(t.priceIn),
      isWildcard: t.isWildcard,
      pointsDeducted: t.pointsDeducted,
      createdAt: t.createdAt,
    }));
  }

  private async validateWildcard(fantasyTeamId: string, gwNumber: number) {
    const halfSeason = gwNumber <= WILDCARD_HALF_SEASON_BOUNDARY ? 1 : 2;
    const existing = await this.prisma.chipActivation.findUnique({
      where: {
        fantasyTeamId_chip_halfSeason: {
          fantasyTeamId,
          chip: 'WILDCARD',
          halfSeason,
        },
      },
    });
    if (existing) {
      throw new BadRequestException(
        `Wildcard already used in half-season ${halfSeason} (GW${halfSeason === 1 ? '1–19' : '20–38'})`,
      );
    }
  }
}
