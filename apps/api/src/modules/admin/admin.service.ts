import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { AliasService } from '../alias/alias.service';
import { ApiFootballClient } from '../../infrastructure/api-football/api-football.client';
import {
  QUEUE_SEASON_BOOTSTRAP,
  QUEUE_FIXTURE_RESULT_CHECK,
  QUEUE_PERFORMANCE_SYNC,
  QUEUE_GAMEWEEK_FINALISE,
  QUEUE_PLAYER_PRICE_UPDATE,
  JOB_BOOTSTRAP,
  JOB_PERFORMANCE_SYNC,
} from '../sync/sync.constants';
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
    @InjectQueue(QUEUE_FIXTURE_RESULT_CHECK) private readonly fixtureCheckQueue: Queue,
    @InjectQueue(QUEUE_PERFORMANCE_SYNC) private readonly perfSyncQueue: Queue,
    @InjectQueue(QUEUE_GAMEWEEK_FINALISE) private readonly gwFinaliseQueue: Queue,
    @InjectQueue(QUEUE_PLAYER_PRICE_UPDATE) private readonly priceUpdateQueue: Queue,
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

    return this.prisma.clubAlias.upsert({
      where: { clubId },
      create: { clubId, name: dto.name, shortName: dto.shortName, city: dto.city },
      update: { name: dto.name, shortName: dto.shortName, city: dto.city },
    });
  }

  async deleteClubAlias(clubId: number) {
    try {
      await this.prisma.clubAlias.delete({ where: { clubId } });
    } catch (err) {
      if (err instanceof PrismaClientKnownRequestError && err.code === 'P2025') {
        throw new NotFoundException(`Club alias for club ${clubId} not found`);
      }
      throw err;
    }
  }

  async upsertPlayerAlias(playerId: number, dto: UpsertPlayerAliasDto) {
    const player = await this.prisma.player.findUnique({ where: { id: playerId } });
    if (!player) throw new NotFoundException(`Player ${playerId} not found`);

    return this.prisma.playerAlias.upsert({
      where: { playerId },
      create: { playerId, name: dto.name },
      update: { name: dto.name },
    });
  }

  async deletePlayerAlias(playerId: number) {
    try {
      await this.prisma.playerAlias.delete({ where: { playerId } });
    } catch (err) {
      if (err instanceof PrismaClientKnownRequestError && err.code === 'P2025') {
        throw new NotFoundException(`Player alias for player ${playerId} not found`);
      }
      throw err;
    }
  }

  async upsertCompetitionAlias(competitionId: number, dto: UpsertCompetitionAliasDto) {
    const competition = await this.prisma.competition.findUnique({ where: { id: competitionId } });
    if (!competition) throw new NotFoundException(`Competition ${competitionId} not found`);

    return this.prisma.competitionAlias.upsert({
      where: { competitionId },
      create: { competitionId, name: dto.name, shortName: dto.shortName },
      update: { name: dto.name, shortName: dto.shortName },
    });
  }

  async deleteCompetitionAlias(competitionId: number) {
    try {
      await this.prisma.competitionAlias.delete({ where: { competitionId } });
    } catch (err) {
      if (err instanceof PrismaClientKnownRequestError && err.code === 'P2025') {
        throw new NotFoundException(`Competition alias for competition ${competitionId} not found`);
      }
      throw err;
    }
  }

  async triggerBootstrap(season: number) {
    const job = await this.bootstrapQueue.add(JOB_BOOTSTRAP, { season }, { removeOnComplete: 10, removeOnFail: 50 });
    return { jobId: job.id, message: `Bootstrap job queued for season ${season}` };
  }

  async triggerPerformanceSync(fixtureId: number) {
    const fixture = await this.prisma.fixture.findUnique({
      where: { id: fixtureId },
      include: { gameweek: true },
    });
    if (!fixture) throw new NotFoundException(`Fixture ${fixtureId} not found`);

    const job = await this.perfSyncQueue.add(
      JOB_PERFORMANCE_SYNC,
      { fixtureId, gameweekId: fixture.gameweekId, competitionId: fixture.competitionId },
      { removeOnComplete: 10, removeOnFail: 50 },
    );
    return { jobId: job.id, message: `Performance sync queued for fixture ${fixtureId}` };
  }

  async getQueueStatus() {
    const queues = [
      { name: QUEUE_SEASON_BOOTSTRAP, queue: this.bootstrapQueue },
      { name: QUEUE_FIXTURE_RESULT_CHECK, queue: this.fixtureCheckQueue },
      { name: QUEUE_PERFORMANCE_SYNC, queue: this.perfSyncQueue },
      { name: QUEUE_GAMEWEEK_FINALISE, queue: this.gwFinaliseQueue },
      { name: QUEUE_PLAYER_PRICE_UPDATE, queue: this.priceUpdateQueue },
    ];

    const statuses = await Promise.all(
      queues.map(async ({ name, queue }) => {
        const [waiting, active, completed, failed] = await Promise.all([
          queue.getWaitingCount(),
          queue.getActiveCount(),
          queue.getCompletedCount(),
          queue.getFailedCount(),
        ]);
        return { name, waiting, active, completed, failed };
      }),
    );

    return statuses;
  }

  async getRateLimitStatus() {
    const count = await this.apiFootball.getDailyRequestCount();
    return { requestsToday: count, hardLimit: 95, warnThreshold: 80 };
  }
}
