import { Controller, Get, Query, ParseIntPipe, DefaultValuePipe, Optional } from '@nestjs/common';
import { Public } from '../../common/decorators/public.decorator';
import { LeaderboardService } from './leaderboard.service';

@Controller('leaderboard')
export class LeaderboardController {
  constructor(private readonly leaderboard: LeaderboardService) {}

  @Public()
  @Get('global')
  getGlobalStandings(
    @Query('competitionId', ParseIntPipe) competitionId: number,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('gameweekId') gameweekIdRaw?: string,
  ) {
    const gameweekId = gameweekIdRaw ? parseInt(gameweekIdRaw, 10) : undefined;
    return this.leaderboard.getGlobalStandings(competitionId, gameweekId, page, limit);
  }
}
