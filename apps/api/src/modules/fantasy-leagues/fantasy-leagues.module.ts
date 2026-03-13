import { Module } from '@nestjs/common';
import { FantasyLeaguesController } from './fantasy-leagues.controller';
import { FantasyLeaguesService } from './fantasy-leagues.service';

@Module({
  controllers: [FantasyLeaguesController],
  providers: [FantasyLeaguesService],
})
export class FantasyLeaguesModule {}
