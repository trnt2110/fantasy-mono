import {
  Controller,
  DefaultValuePipe,
  Get,
  Put,
  Delete,
  Body,
  Param,
  ParseIntPipe,
  Post,
  HttpCode,
  HttpStatus,
  Query,
  UseInterceptors,
  UploadedFiles,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '@prisma/client';
import { AdminService, ImportSummary } from './admin.service';
import { UpsertClubAliasDto } from './dto/upsert-club-alias.dto';
import { UpsertPlayerAliasDto } from './dto/upsert-player-alias.dto';
import { UpsertCompetitionAliasDto } from './dto/upsert-competition-alias.dto';
import { BootstrapDto } from './dto/bootstrap.dto';

interface MulterFile { buffer: Buffer; originalname: string; size: number; mimetype: string }

@Controller('admin')
@Roles(Role.ADMIN)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  // ─── Alias overview ───────────────────────────────────────────────────────

  @Get('aliases')
  async getAliasesSummary() {
    return { data: await this.adminService.getAliasesSummary() };
  }

  @Get('aliases/clubs')
  async getClubs(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
    @Query('search', new DefaultValuePipe('')) search: string,
    @Query('filter', new DefaultValuePipe('all')) filter: 'all' | 'unaliased' | 'aliased',
  ) {
    return { data: await this.adminService.getClubs(page, limit, search, filter) };
  }

  @Get('aliases/players')
  async getPlayers(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
    @Query('search', new DefaultValuePipe('')) search: string,
    @Query('filter', new DefaultValuePipe('all')) filter: 'all' | 'unaliased' | 'aliased',
  ) {
    return { data: await this.adminService.getPlayers(page, limit, search, filter) };
  }

  @Get('aliases/competitions')
  async getCompetitions(
    @Query('filter', new DefaultValuePipe('all')) filter: 'all' | 'unaliased' | 'aliased',
  ) {
    return { data: await this.adminService.getCompetitions(filter) };
  }

  // ─── Club aliases ─────────────────────────────────────────────────────────

  @Put('aliases/clubs/:id')
  async upsertClubAlias(@Param('id', ParseIntPipe) id: number, @Body() dto: UpsertClubAliasDto) {
    return { data: await this.adminService.upsertClubAlias(id, dto) };
  }

  @Delete('aliases/clubs/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteClubAlias(@Param('id', ParseIntPipe) id: number) {
    return this.adminService.deleteClubAlias(id);
  }

  // ─── Player aliases ───────────────────────────────────────────────────────

  @Put('aliases/players/:id')
  async upsertPlayerAlias(@Param('id', ParseIntPipe) id: number, @Body() dto: UpsertPlayerAliasDto) {
    return { data: await this.adminService.upsertPlayerAlias(id, dto) };
  }

  @Delete('aliases/players/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  deletePlayerAlias(@Param('id', ParseIntPipe) id: number) {
    return this.adminService.deletePlayerAlias(id);
  }

  // ─── Competition aliases ──────────────────────────────────────────────────

  @Put('aliases/competitions/:id')
  async upsertCompetitionAlias(@Param('id', ParseIntPipe) id: number, @Body() dto: UpsertCompetitionAliasDto) {
    return { data: await this.adminService.upsertCompetitionAlias(id, dto) };
  }

  @Delete('aliases/competitions/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteCompetitionAlias(@Param('id', ParseIntPipe) id: number) {
    return this.adminService.deleteCompetitionAlias(id);
  }

  // ─── Bulk import ──────────────────────────────────────────────────────────

  @Post('import/aliases')
  @UseInterceptors(FileFieldsInterceptor(
    [{ name: 'clubs', maxCount: 1 }, { name: 'players', maxCount: 1 }, { name: 'competitions', maxCount: 1 }],
    { limits: { fileSize: 5 * 1024 * 1024 } },
  ))
  async importAliases(
    @UploadedFiles() files: { clubs?: MulterFile[]; players?: MulterFile[]; competitions?: MulterFile[] },
  ): Promise<{ data: { clubs?: ImportSummary; players?: ImportSummary; competitions?: ImportSummary } }> {
    return { data: await this.adminService.importAliases(files ?? {}) };
  }

  // ─── Sync triggers ────────────────────────────────────────────────────────

  @Post('sync/bootstrap')
  @HttpCode(HttpStatus.ACCEPTED)
  triggerBootstrap(@Body() dto: BootstrapDto) {
    return this.adminService.triggerBootstrap(dto.season, dto.force);
  }

  @Post('sync/players/:leagueId')
  @HttpCode(HttpStatus.ACCEPTED)
  triggerPlayerSync(@Param('leagueId', ParseIntPipe) leagueId: number) {
    return this.adminService.triggerPlayerSync(leagueId);
  }

  @Post('sync/fixture/:id')
  @HttpCode(HttpStatus.ACCEPTED)
  triggerPerformanceSync(@Param('id', ParseIntPipe) fixtureId: number) {
    return this.adminService.triggerPerformanceSync(fixtureId);
  }

  @Get('sync/status')
  getQueueStatus() {
    return this.adminService.getQueueStatus();
  }

  @Get('sync/rate-limit')
  getRateLimitStatus() {
    return this.adminService.getRateLimitStatus();
  }
}
