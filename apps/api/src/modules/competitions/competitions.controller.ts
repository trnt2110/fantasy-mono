import { Controller, Get, Param, ParseIntPipe } from '@nestjs/common';
import { CompetitionsService } from './competitions.service';
import { Public } from '../../common/decorators/public.decorator';

@Public()
@Controller('competitions')
export class CompetitionsController {
  constructor(private readonly competitionsService: CompetitionsService) {}

  @Get()
  findAll() {
    return this.competitionsService.findAll();
  }

  @Get(':id/gameweeks')
  findGameweeks(@Param('id', ParseIntPipe) id: number) {
    return this.competitionsService.findGameweeks(id);
  }
}
