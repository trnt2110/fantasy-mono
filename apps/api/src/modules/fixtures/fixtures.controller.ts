import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import { FixturesService } from './fixtures.service';
import { Public } from '../../common/decorators/public.decorator';

@Public()
@Controller('fixtures')
export class FixturesController {
  constructor(private readonly fixturesService: FixturesService) {}

  @Get()
  async find(
    @Query('gameweekId') gameweekId: string,
    @Query('clubId') clubId: string,
    @Query('upcoming') upcoming: string,
  ) {
    if (gameweekId) {
      return { data: await this.fixturesService.findByGameweek(Number(gameweekId)) };
    }
    if (clubId && upcoming === 'true') {
      return { data: await this.fixturesService.findUpcomingByClub(Number(clubId)) };
    }
    throw new BadRequestException('Provide gameweekId or clubId with upcoming=true');
  }
}
