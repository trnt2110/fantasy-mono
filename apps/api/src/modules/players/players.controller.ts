import { Controller, Get, Param, ParseIntPipe, Query } from '@nestjs/common';
import { PlayersService } from './players.service';
import { GetPlayersDto } from './dto/get-players.dto';
import { Public } from '../../common/decorators/public.decorator';

@Public()
@Controller('players')
export class PlayersController {
  constructor(private readonly playersService: PlayersService) {}

  @Get()
  findAll(@Query() dto: GetPlayersDto) {
    return this.playersService.findAll(dto);
  }

  @Get(':id')
  findOne(
    @Param('id', ParseIntPipe) id: number,
    @Query('competitionId', ParseIntPipe) competitionId: number,
  ) {
    return this.playersService.findOne(id, competitionId);
  }

  @Get(':id/performances')
  findPerformances(
    @Param('id', ParseIntPipe) id: number,
    @Query('competitionId', ParseIntPipe) competitionId: number,
  ) {
    return this.playersService.findPerformances(id, competitionId);
  }
}
