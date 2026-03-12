import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';

/**
 * Blocks picks/transfers after the gameweek deadline.
 * Expects the gameweekId as a route parameter named :gameweekId.
 */
@Injectable()
export class GameweekOpenGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const gameweekId = Number(request.params?.gameweekId);

    if (!gameweekId) return true; // no gameweekId param — guard does not apply

    const gameweek = await this.prisma.gameweek.findUnique({
      where: { id: gameweekId },
      select: { deadlineTime: true, status: true },
    });

    if (!gameweek) {
      throw new ForbiddenException('Gameweek not found');
    }

    const deadlinePassed = gameweek.deadlineTime <= new Date();
    const statusClosed = !['SCHEDULED', 'ACTIVE'].includes(gameweek.status);

    if (deadlinePassed || statusClosed) {
      throw new ForbiddenException('Gameweek deadline has passed — picks are locked');
    }

    return true;
  }
}
