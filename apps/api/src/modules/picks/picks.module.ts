import { Module } from '@nestjs/common';
import { PicksService } from './picks.service';
import { PicksController } from './picks.controller';
import { GameweekOpenGuard } from '../../common/guards/gameweek-open.guard';

@Module({
  controllers: [PicksController],
  providers: [PicksService, GameweekOpenGuard],
  exports: [PicksService],
})
export class PicksModule {}
