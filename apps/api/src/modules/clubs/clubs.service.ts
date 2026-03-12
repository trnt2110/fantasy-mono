import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { AliasService } from '../alias/alias.service';

@Injectable()
export class ClubsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly aliasService: AliasService,
  ) {}

  async findByCompetition(competitionId: number) {
    const clubs = await this.prisma.club.findMany({
      where: { competitionId },
      include: { alias: true },
      orderBy: { id: 'asc' },
    });
    return clubs.map((c) => this.aliasService.resolveClub(c));
  }
}
