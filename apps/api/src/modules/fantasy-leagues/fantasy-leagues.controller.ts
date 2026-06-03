import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  ParseIntPipe,
  Query,
  Req,
} from '@nestjs/common';
import { Request } from 'express';
import { FantasyLeaguesService } from './fantasy-leagues.service';
import { CreateLeagueDto } from './dto/create-league.dto';
import { JoinLeagueDto } from './dto/join-league.dto';

interface JwtUser {
  sub: string;
  email: string;
  role: string;
}

@Controller('fantasy-leagues')
export class FantasyLeaguesController {
  constructor(private readonly fantasyLeagues: FantasyLeaguesService) {}

  @Post()
  async createLeague(@Req() req: Request & { user: JwtUser }, @Body() dto: CreateLeagueDto) {
    return { data: await this.fantasyLeagues.createLeague(req.user.sub, dto) };
  }

  @Post('join')
  async joinLeague(@Req() req: Request & { user: JwtUser }, @Body() dto: JoinLeagueDto) {
    return { data: await this.fantasyLeagues.joinLeague(req.user.sub, dto) };
  }

  @Get('mine')
  async getMyLeagues(@Req() req: Request & { user: JwtUser }) {
    return { data: await this.fantasyLeagues.getMyLeagues(req.user.sub) };
  }

  @Get(':id/standings')
  async getStandings(
    @Req() req: Request & { user: JwtUser },
    @Param('id', ParseIntPipe) leagueId: number,
    @Query('gameweekId') gameweekIdRaw?: string,
  ) {
    const gameweekId = gameweekIdRaw ? parseInt(gameweekIdRaw, 10) : undefined;
    return { data: await this.fantasyLeagues.getStandings(leagueId, req.user.sub, gameweekId) };
  }
}
