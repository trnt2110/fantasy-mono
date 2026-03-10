import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { AliasService } from '../alias/alias.service';
import { ApiFootballClient } from '../../infrastructure/api-football/api-football.client';
import { QUEUE_SEASON_BOOTSTRAP, JOB_BOOTSTRAP } from '../sync/sync.constants';
import { UpsertClubAliasDto } from './dto/upsert-club-alias.dto';
import { UpsertPlayerAliasDto } from './dto/upsert-player-alias.dto';
import { UpsertCompetitionAliasDto } from './dto/upsert-competition-alias.dto';

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly aliasService: AliasService,
    private readonly apiFootball: ApiFootballClient,
    @InjectQueue(QUEUE_SEASON_BOOTSTRAP) private readonly bootstrapQueue: Queue,
  ) {}

  getAliasesSummary() {
    return this.aliasService.getUnaliasedSummary();
  }

  async getUnaliasedClubs(page: number, limit: number) {
    const skip = (page - 1) * limit;
    const [items, total] = await Promise.all([
      this.prisma.club.findMany({ where: { alias: null }, skip, take: limit, include: { alias: true } }),
      this.prisma.club.count({ where: { alias: null } }),
    ]);
    return { items: items.map((c) => this.aliasService.resolveClub(c)), total, page, limit };
  }

  async getUnaliasedPlayers(page: number, limit: number) {
    const skip = (page - 1) * limit;
    const [items, total] = await Promise.all([
      this.prisma.player.findMany({
        where: { alias: null },
        skip,
        take: limit,
        include: { alias: true, club: { include: { alias: true } } },
      }),
      this.prisma.player.count({ where: { alias: null } }),
    ]);
    return { items: items.map((p) => this.aliasService.resolvePlayer(p)), total, page, limit };
  }

  async getUnaliasedCompetitions() {
    const items = await this.prisma.competition.findMany({
      where: { alias: null },
      include: { alias: true },
    });
    return items.map((c) => this.aliasService.resolveCompetition(c));
  }

  async upsertClubAlias(clubId: number, dto: UpsertClubAliasDto) {
    const club = await this.prisma.club.findUnique({ where: { id: clubId } });
    if (!club) throw new NotFoundException(`Club ${clubId} not found`);

    const alias = await this.prisma.clubAlias.upsert({
      where: { clubId },
      create: { clubId, name: dto.name, shortName: dto.shortName, city: dto.city },
      update: { name: dto.name, shortName: dto.shortName, city: dto.city },
    });
    return alias;
  }

  async deleteClubAlias(clubId: number) {
    await this.prisma.clubAlias.delete({ where: { clubId } });
  }

  async upsertPlayerAlias(playerId: number, dto: UpsertPlayerAliasDto) {
    const player = await this.prisma.player.findUnique({ where: { id: playerId } });
    if (!player) throw new NotFoundException(`Player ${playerId} not found`);

    const alias = await this.prisma.playerAlias.upsert({
      where: { playerId },
      create: { playerId, name: dto.name },
      update: { name: dto.name },
    });
    return alias;
  }

  async deletePlayerAlias(playerId: number) {
    await this.prisma.playerAlias.delete({ where: { playerId } });
  }

  async upsertCompetitionAlias(competitionId: number, dto: UpsertCompetitionAliasDto) {
    const competition = await this.prisma.competition.findUnique({ where: { id: competitionId } });
    if (!competition) throw new NotFoundException(`Competition ${competitionId} not found`);

    const alias = await this.prisma.competitionAlias.upsert({
      where: { competitionId },
      create: { competitionId, name: dto.name, shortName: dto.shortName },
      update: { name: dto.name, shortName: dto.shortName },
    });
    return alias;
  }

  async deleteCompetitionAlias(competitionId: number) {
    await this.prisma.competitionAlias.delete({ where: { competitionId } });
  }

  async triggerBootstrap(season: number) {
    const job = await this.bootstrapQueue.add(JOB_BOOTSTRAP, { season }, { removeOnComplete: 10, removeOnFail: 50 });
    return { jobId: job.id, message: `Bootstrap job queued for season ${season}` };
  }

  async getRateLimitStatus() {
    const count = await this.apiFootball.getDailyRequestCount();
    return { requestsToday: count, hardLimit: 95, warnThreshold: 80 };
  }
}
