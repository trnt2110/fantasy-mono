import { Module } from '@nestjs/common';
import { FantasyTeamsService } from './fantasy-teams.service';
import { FantasyTeamsController } from './fantasy-teams.controller';

@Module({
  controllers: [FantasyTeamsController],
  providers: [FantasyTeamsService],
  exports: [FantasyTeamsService],
})
export class FantasyTeamsModule {}
