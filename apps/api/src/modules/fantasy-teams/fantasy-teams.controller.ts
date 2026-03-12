import { Body, Controller, Get, Param, ParseIntPipe, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { FantasyTeamsService } from './fantasy-teams.service';
import { CreateFantasyTeamDto } from './dto/create-fantasy-team.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@Controller('fantasy-teams')
export class FantasyTeamsController {
  constructor(private readonly fantasyTeamsService: FantasyTeamsService) {}

  @Post()
  create(@CurrentUser('id') userId: string, @Body() dto: CreateFantasyTeamDto) {
    return this.fantasyTeamsService.create(userId, dto);
  }

  @Get('mine')
  findMine(
    @CurrentUser('id') userId: string,
    @Query('competitionId', ParseIntPipe) competitionId: number,
  ) {
    return this.fantasyTeamsService.findMine(userId, competitionId);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser('id') userId: string) {
    return this.fantasyTeamsService.findOne(id, userId);
  }

  @Get(':id/scores')
  findScores(@Param('id', ParseUUIDPipe) id: string) {
    return this.fantasyTeamsService.findScores(id);
  }
}
