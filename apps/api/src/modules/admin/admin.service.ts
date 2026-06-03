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
  JOB_PLAYER_SYNC,
  JOB_PERFORMANCE_SYNC,
} from '../sync/sync.constants';
import { UpsertClubAliasDto } from './dto/upsert-club-alias.dto';
import { UpsertPlayerAliasDto } from './dto/upsert-player-alias.dto';
import { UpsertCompetitionAliasDto } from './dto/upsert-competition-alias.dto';

// ── CSV helpers ───────────────────────────────────────────────────────────────

export interface ImportError { row: number; id: number | string; error: string }
export interface ImportSummary { processed: number; skipped: number; errors: ImportError[] }

interface MulterFile {
  buffer: Buffer;
  originalname: string;
  size: number;
  mimetype: string;
}

function parseCsvRows(content: string): Record<string, string>[] {
  const lines = content.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];
  const headers = splitCsvRow(lines[0]);
  return lines.slice(1).map((line) => {
    const values = splitCsvRow(line);
    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h.trim()] = (values[i] ?? '').trim(); });
    return row;
  });
}

function splitCsvRow(line: string): string[] {
  const result: string[] = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
      else { inQ = !inQ; }
    } else if (ch === ',' && !inQ) {
      result.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  result.push(cur);
  return result;
}

// ─────────────────────────────────────────────────────────────────────────────

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

  // ── Alias summary ─────────────────────────────────────────────────────────

  getAliasesSummary() {
    return this.aliasService.getUnaliasedSummary();
  }

  // ── Club list ─────────────────────────────────────────────────────────────

  async getClubs(page: number, limit: number, search: string, filter: 'all' | 'unaliased' | 'aliased') {
    const skip = (page - 1) * limit;

    const aliasFilter =
      filter === 'unaliased' ? { alias: null } :
      filter === 'aliased'   ? { NOT: { alias: null } } :
      {};

    const searchFilter = search
      ? { OR: [
          { realName: { contains: search, mode: 'insensitive' as const } },
          { alias: { name: { contains: search, mode: 'insensitive' as const } } },
        ]}
      : {};

    const where = { AND: [aliasFilter, searchFilter].filter(f => Object.keys(f).length > 0) };

    const [items, total] = await Promise.all([
      this.prisma.club.findMany({ where, skip, take: limit, include: { alias: true }, orderBy: { id: 'asc' } }),
      this.prisma.club.count({ where }),
    ]);
    return { items: items.map((c) => this.aliasService.resolveClubForAdmin(c)), total, page, limit };
  }

  async getUnaliasedClubs(page: number, limit: number) {
    return this.getClubs(page, limit, '', 'unaliased');
  }

  // ── Player list ───────────────────────────────────────────────────────────

  async getPlayers(page: number, limit: number, search: string, filter: 'all' | 'unaliased' | 'aliased') {
    const skip = (page - 1) * limit;

    const aliasFilter =
      filter === 'unaliased' ? { alias: null } :
      filter === 'aliased'   ? { NOT: { alias: null } } :
      {};

    const searchFilter = search
      ? { OR: [
          { realName: { contains: search, mode: 'insensitive' as const } },
          { alias: { name: { contains: search, mode: 'insensitive' as const } } },
        ]}
      : {};

    const where = { AND: [aliasFilter, searchFilter].filter(f => Object.keys(f).length > 0) };

    const [items, total] = await Promise.all([
      this.prisma.player.findMany({
        where,
        skip,
        take: limit,
        include: { alias: true, club: { include: { alias: true } } },
        orderBy: { id: 'asc' },
      }),
      this.prisma.player.count({ where }),
    ]);
    return { items: items.map((p) => this.aliasService.resolvePlayerForAdmin(p)), total, page, limit };
  }

  async getUnaliasedPlayers(page: number, limit: number) {
    return this.getPlayers(page, limit, '', 'unaliased');
  }

  // ── Competition list ──────────────────────────────────────────────────────

  async getCompetitions(filter: 'all' | 'unaliased' | 'aliased') {
    const where =
      filter === 'unaliased' ? { alias: null } :
      filter === 'aliased'   ? { NOT: { alias: null } } :
      {};
    const items = await this.prisma.competition.findMany({ where, include: { alias: true } });
    return items.map((c) => this.aliasService.resolveCompetitionForAdmin(c));
  }

  async getUnaliasedCompetitions() {
    return this.getCompetitions('unaliased');
  }

  // ── Upsert / Delete aliases ───────────────────────────────────────────────

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

  // ── Import ────────────────────────────────────────────────────────────────

  async importAliases(files: {
    clubs?: MulterFile[];
    players?: MulterFile[];
    competitions?: MulterFile[];
  }): Promise<{ clubs?: ImportSummary; players?: ImportSummary; competitions?: ImportSummary }> {
    const result: { clubs?: ImportSummary; players?: ImportSummary; competitions?: ImportSummary } = {};
    if (files.clubs?.[0]) result.clubs = await this.importClubsCsv(files.clubs[0].buffer.toString('utf-8'));
    if (files.players?.[0]) result.players = await this.importPlayersCsv(files.players[0].buffer.toString('utf-8'));
    if (files.competitions?.[0]) result.competitions = await this.importCompetitionsCsv(files.competitions[0].buffer.toString('utf-8'));
    return result;
  }

  private async importClubsCsv(content: string): Promise<ImportSummary> {
    const rows = parseCsvRows(content);
    let processed = 0, skipped = 0;
    const errors: ImportError[] = [];

    // Pre-validate IDs and filter to rows that have an alias_name
    const toProcess: Array<{ row: Record<string, string>; rowNum: number; id: number }> = [];
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNum = i + 2;
      if (!row.alias_name?.trim()) { skipped++; continue; }
      const id = parseInt(row.id, 10);
      if (isNaN(id)) { errors.push({ row: rowNum, id: row.id, error: 'Invalid ID' }); continue; }
      toProcess.push({ row, rowNum, id });
    }

    // Batch existence check
    const validIds = new Set(
      (await this.prisma.club.findMany({ where: { id: { in: toProcess.map(r => r.id) } }, select: { id: true } }))
        .map(c => c.id),
    );

    for (const { row, rowNum, id } of toProcess) {
      if (!validIds.has(id)) { errors.push({ row: rowNum, id, error: `Club ${id} not found` }); continue; }
      await this.prisma.clubAlias.upsert({
        where: { clubId: id },
        create: { clubId: id, name: row.alias_name.trim(), shortName: row.alias_short_name?.trim() || null, city: row.alias_city?.trim() || null },
        update: { name: row.alias_name.trim(), shortName: row.alias_short_name?.trim() || null, city: row.alias_city?.trim() || null },
      });
      processed++;
    }

    return { processed, skipped, errors };
  }

  private async importPlayersCsv(content: string): Promise<ImportSummary> {
    const rows = parseCsvRows(content);
    let processed = 0, skipped = 0;
    const errors: ImportError[] = [];

    const toProcess: Array<{ row: Record<string, string>; rowNum: number; id: number }> = [];
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNum = i + 2;
      if (!row.alias_name?.trim()) { skipped++; continue; }
      const id = parseInt(row.id, 10);
      if (isNaN(id)) { errors.push({ row: rowNum, id: row.id, error: 'Invalid ID' }); continue; }
      toProcess.push({ row, rowNum, id });
    }

    const validIds = new Set(
      (await this.prisma.player.findMany({ where: { id: { in: toProcess.map(r => r.id) } }, select: { id: true } }))
        .map(p => p.id),
    );

    for (const { row, rowNum, id } of toProcess) {
      if (!validIds.has(id)) { errors.push({ row: rowNum, id, error: `Player ${id} not found` }); continue; }
      await this.prisma.playerAlias.upsert({
        where: { playerId: id },
        create: { playerId: id, name: row.alias_name.trim() },
        update: { name: row.alias_name.trim() },
      });
      processed++;
    }

    return { processed, skipped, errors };
  }

  private async importCompetitionsCsv(content: string): Promise<ImportSummary> {
    const rows = parseCsvRows(content);
    let processed = 0, skipped = 0;
    const errors: ImportError[] = [];

    const toProcess: Array<{ row: Record<string, string>; rowNum: number; id: number }> = [];
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNum = i + 2;
      if (!row.alias_name?.trim()) { skipped++; continue; }
      const id = parseInt(row.id, 10);
      if (isNaN(id)) { errors.push({ row: rowNum, id: row.id, error: 'Invalid ID' }); continue; }
      toProcess.push({ row, rowNum, id });
    }

    const validIds = new Set(
      (await this.prisma.competition.findMany({ where: { id: { in: toProcess.map(r => r.id) } }, select: { id: true } }))
        .map(c => c.id),
    );

    for (const { row, rowNum, id } of toProcess) {
      if (!validIds.has(id)) { errors.push({ row: rowNum, id, error: `Competition ${id} not found` }); continue; }
      await this.prisma.competitionAlias.upsert({
        where: { competitionId: id },
        create: { competitionId: id, name: row.alias_name.trim(), shortName: row.alias_short_name?.trim() || null },
        update: { name: row.alias_name.trim(), shortName: row.alias_short_name?.trim() || null },
      });
      processed++;
    }

    return { processed, skipped, errors };
  }

  // ── Sync triggers ─────────────────────────────────────────────────────────

  async triggerBootstrap(season?: number, force?: boolean) {
    const job = await this.bootstrapQueue.add(JOB_BOOTSTRAP, { season, force }, { removeOnComplete: 10, removeOnFail: 50 });
    return { jobId: job.id, message: season ? `Bootstrap job queued for season ${season}` : 'Bootstrap job queued (auto-detecting season)' };
  }

  async triggerPlayerSync(leagueId: number) {
    const competition = await this.prisma.competition.findUnique({ where: { id: leagueId } });
    if (!competition) throw new NotFoundException(`Competition ${leagueId} not found`);

    const job = await this.bootstrapQueue.add(JOB_PLAYER_SYNC, { leagueId }, { removeOnComplete: 10, removeOnFail: 50 });
    return { jobId: job.id, message: `Player sync queued for league ${leagueId}` };
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
