import { Controller, Get, ParseIntPipe, Query } from '@nestjs/common';
import { GameweeksService } from './gameweeks.service';
import { Public } from '../../common/decorators/public.decorator';

@Public()
@Controller('gameweeks')
export class GameweeksController {
  constructor(private readonly gameweeksService: GameweeksService) {}

  @Get()
  async findAll(@Query('competitionId', ParseIntPipe) competitionId: number) {
    return { data: await this.gameweeksService.findAll(competitionId) };
  }

  @Get('current')
  async findCurrent(@Query('competitionId', ParseIntPipe) competitionId: number) {
    return { data: await this.gameweeksService.findCurrent(competitionId) };
  }
}
