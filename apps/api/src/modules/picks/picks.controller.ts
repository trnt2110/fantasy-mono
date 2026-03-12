import { Body, Controller, Get, Param, ParseIntPipe, ParseUUIDPipe, Put, Query, UseGuards } from '@nestjs/common';
import { PicksService } from './picks.service';
import { SubmitPicksDto } from './dto/submit-picks.dto';
import { GameweekOpenGuard } from '../../common/guards/gameweek-open.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@Controller('picks')
export class PicksController {
  constructor(private readonly picksService: PicksService) {}

  @Put(':gameweekId')
  @UseGuards(GameweekOpenGuard)
  submitPicks(
    @Param('gameweekId', ParseIntPipe) gameweekId: number,
    @CurrentUser('id') userId: string,
    @Body() dto: SubmitPicksDto,
  ) {
    return this.picksService.submitPicks(gameweekId, userId, dto);
  }

  @Get(':gameweekId')
  getPicks(
    @Param('gameweekId', ParseIntPipe) gameweekId: number,
    @Query('fantasyTeamId', ParseUUIDPipe) fantasyTeamId: string,
  ) {
    return this.picksService.getPicks(gameweekId, fantasyTeamId);
  }
}
