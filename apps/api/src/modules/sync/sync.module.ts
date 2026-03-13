import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BootstrapProcessor } from './bootstrap.processor';
import { FixtureResultCheckProcessor } from './fixture-result-check.processor';
import { PerformanceSyncProcessor } from './performance-sync.processor';
import { GameweekFinaliseProcessor } from './gameweek-finalise.processor';
import { PlayerPriceUpdateProcessor } from './player-price-update.processor';
import { ScoringModule } from '../scoring/scoring.module';
import {
  QUEUE_SEASON_BOOTSTRAP,
  QUEUE_FIXTURE_RESULT_CHECK,
  QUEUE_PERFORMANCE_SYNC,
  QUEUE_GAMEWEEK_FINALISE,
  QUEUE_PLAYER_PRICE_UPDATE,
} from './sync.constants';

@Module({
  imports: [
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: {
          url: config.get<string>('REDIS_URL', 'redis://localhost:6379'),
        },
      }),
    }),
    BullModule.registerQueue(
      { name: QUEUE_SEASON_BOOTSTRAP },
      { name: QUEUE_FIXTURE_RESULT_CHECK },
      { name: QUEUE_PERFORMANCE_SYNC },
      { name: QUEUE_GAMEWEEK_FINALISE },
      { name: QUEUE_PLAYER_PRICE_UPDATE },
    ),
    ScoringModule,
  ],
  providers: [
    BootstrapProcessor,
    FixtureResultCheckProcessor,
    PerformanceSyncProcessor,
    GameweekFinaliseProcessor,
    PlayerPriceUpdateProcessor,
  ],
  exports: [BullModule],
})
export class SyncModule {}
