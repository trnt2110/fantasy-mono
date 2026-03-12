import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import { ClubsService } from './clubs.service';
import { Public } from '../../common/decorators/public.decorator';

@Public()
@Controller('clubs')
export class ClubsController {
  constructor(private readonly clubsService: ClubsService) {}

  @Get()
  findAll(@Query('competitionId') competitionId: string) {
    if (!competitionId) throw new BadRequestException('competitionId is required');
    return this.clubsService.findByCompetition(Number(competitionId));
  }
}
