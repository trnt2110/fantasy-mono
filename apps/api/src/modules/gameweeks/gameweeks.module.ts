import { Module } from '@nestjs/common';
import { GameweeksService } from './gameweeks.service';
import { GameweeksController } from './gameweeks.controller';

@Module({
  controllers: [GameweeksController],
  providers: [GameweeksService],
  exports: [GameweeksService],
})
export class GameweeksModule {}
