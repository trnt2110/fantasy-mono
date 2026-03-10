import {
  Controller,
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
} from '@nestjs/common';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '@prisma/client';
import { AdminService } from './admin.service';
import { UpsertClubAliasDto } from './dto/upsert-club-alias.dto';
import { UpsertPlayerAliasDto } from './dto/upsert-player-alias.dto';
import { UpsertCompetitionAliasDto } from './dto/upsert-competition-alias.dto';
import { BootstrapDto } from './dto/bootstrap.dto';

@Controller('admin')
@Roles(Role.ADMIN)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  // ─── Alias overview ───────────────────────────────────────────────────────

  @Get('aliases')
  getAliasesSummary() {
    return this.adminService.getAliasesSummary();
  }

  @Get('aliases/clubs')
  getUnaliasedClubs(@Query('page') page = '1', @Query('limit') limit = '50') {
    return this.adminService.getUnaliasedClubs(parseInt(page), parseInt(limit));
  }

  @Get('aliases/players')
  getUnaliasedPlayers(@Query('page') page = '1', @Query('limit') limit = '50') {
    return this.adminService.getUnaliasedPlayers(parseInt(page), parseInt(limit));
  }

  @Get('aliases/competitions')
  getUnaliasedCompetitions() {
    return this.adminService.getUnaliasedCompetitions();
  }

  // ─── Club aliases ─────────────────────────────────────────────────────────

  @Put('aliases/clubs/:id')
  upsertClubAlias(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpsertClubAliasDto,
  ) {
    return this.adminService.upsertClubAlias(id, dto);
  }

  @Delete('aliases/clubs/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteClubAlias(@Param('id', ParseIntPipe) id: number) {
    return this.adminService.deleteClubAlias(id);
  }

  // ─── Player aliases ───────────────────────────────────────────────────────

  @Put('aliases/players/:id')
  upsertPlayerAlias(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpsertPlayerAliasDto,
  ) {
    return this.adminService.upsertPlayerAlias(id, dto);
  }

  @Delete('aliases/players/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  deletePlayerAlias(@Param('id', ParseIntPipe) id: number) {
    return this.adminService.deletePlayerAlias(id);
  }

  // ─── Competition aliases ──────────────────────────────────────────────────

  @Put('aliases/competitions/:id')
  upsertCompetitionAlias(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpsertCompetitionAliasDto,
  ) {
    return this.adminService.upsertCompetitionAlias(id, dto);
  }

  @Delete('aliases/competitions/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteCompetitionAlias(@Param('id', ParseIntPipe) id: number) {
    return this.adminService.deleteCompetitionAlias(id);
  }

  // ─── Sync triggers ────────────────────────────────────────────────────────

  @Post('sync/bootstrap')
  @HttpCode(HttpStatus.ACCEPTED)
  triggerBootstrap(@Body() dto: BootstrapDto) {
    return this.adminService.triggerBootstrap(dto.season);
  }

  @Get('sync/rate-limit')
  getRateLimitStatus() {
    return this.adminService.getRateLimitStatus();
  }
}
