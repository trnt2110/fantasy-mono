import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { SimulationService } from './simulation.service';
import { SyncModule } from '../sync/sync.module';
import { ScoringModule } from '../scoring/scoring.module';

@Module({
  imports: [SyncModule, ScoringModule],
  controllers: [AdminController],
  providers: [AdminService, SimulationService],
})
export class AdminModule {}
