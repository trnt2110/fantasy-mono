import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { RedisService } from '../../infrastructure/redis/redis.service';
import { ScoringService } from '../scoring/scoring.service';
import { CreateBotsDto } from './dto/simulate.dto';

@Injectable()
export class SimulationService {
  private readonly logger = new Logger(SimulationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly scoring: ScoringService,
  ) {}

  async createBots(dto: CreateBotsDto): Promise<{ created: number; skipped: number; botIds: string[] }> {
    throw new Error('Not implemented');
  }

  async openGameweek(gwId: number, minutesFromNow: number): Promise<{ gameweekId: number; deadlineTime: Date }> {
    throw new Error('Not implemented');
  }

  async submitBotPicks(gwId: number): Promise<{ bots: number; picksSeeded: number }> {
    throw new Error('Not implemented');
  }

  async finalizeGameweek(gwId: number): Promise<{ gameweekId: number; teamsScored: number; nextGameweekId: number | null }> {
    throw new Error('Not implemented');
  }
}
