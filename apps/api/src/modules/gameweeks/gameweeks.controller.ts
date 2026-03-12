import { Controller, Get, ParseIntPipe, Query } from '@nestjs/common';
import { GameweeksService } from './gameweeks.service';
import { Public } from '../../common/decorators/public.decorator';

@Public()
@Controller('gameweeks')
export class GameweeksController {
  constructor(private readonly gameweeksService: GameweeksService) {}

  @Get('current')
  findCurrent(@Query('competitionId', ParseIntPipe) competitionId: number) {
    return this.gameweeksService.findCurrent(competitionId);
  }
}
