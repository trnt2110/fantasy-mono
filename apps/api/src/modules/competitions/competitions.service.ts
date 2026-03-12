import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { AliasService } from '../alias/alias.service';

@Injectable()
export class CompetitionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly aliasService: AliasService,
  ) {}

  async findAll() {
    const competitions = await this.prisma.competition.findMany({
      where: { isActive: true },
      include: { alias: true },
      orderBy: { id: 'asc' },
    });
    return competitions.map((c) => this.aliasService.resolveCompetition(c));
  }

  async findGameweeks(competitionId: number) {
    return this.prisma.gameweek.findMany({
      where: { competitionId },
      select: {
        id: true,
        competitionId: true,
        number: true,
        deadlineTime: true,
        status: true,
        isCurrent: true,
      },
      orderBy: { number: 'asc' },
    });
  }
}
