import { Test, TestingModule } from '@nestjs/testing';
import { SimulationService } from './simulation.service';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { RedisService } from '../../infrastructure/redis/redis.service';
import { ScoringService } from '../scoring/scoring.service';

const mockPlayers = (count: number, position: string, clubIdStart = 1) =>
  Array.from({ length: count }, (_, i) => ({
    id: i + 1 + (position === 'GK' ? 0 : position === 'DEF' ? 100 : position === 'MID' ? 200 : 300),
    position,
    clubId: clubIdStart + Math.floor(i / 3),
    isAvailable: true,
    competitionPrices: [{ currentPrice: { toNumber: () => 5.0 } }],
  }));

describe('SimulationService.buildRandomSquad', () => {
  let service: SimulationService;
  let prisma: { player: { findMany: jest.Mock }; competition: { findUnique: jest.Mock } };

  beforeEach(async () => {
    prisma = {
      player: { findMany: jest.fn() },
      competition: { findUnique: jest.fn() },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SimulationService,
        { provide: PrismaService, useValue: prisma },
        { provide: RedisService, useValue: {} },
        { provide: ScoringService, useValue: {} },
      ],
    }).compile();

    service = module.get(SimulationService);
  });

  it('builds a 15-player squad with correct position counts', async () => {
    prisma.player.findMany.mockResolvedValue([
      ...mockPlayers(5, 'GK', 1),
      ...mockPlayers(20, 'DEF', 2),
      ...mockPlayers(20, 'MID', 10),
      ...mockPlayers(10, 'FWD', 18),
    ]);

    const squad = await (service as any).buildRandomSquad(39);

    const countByPos: Record<string, number> = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
    for (const p of squad.players) countByPos[p.position]++;
    expect(countByPos).toEqual({ GK: 2, DEF: 5, MID: 5, FWD: 3 });
  });

  it('respects max 3 players per club', async () => {
    prisma.player.findMany.mockResolvedValue([
      ...mockPlayers(5, 'GK', 1),
      ...mockPlayers(20, 'DEF', 2),
      ...mockPlayers(20, 'MID', 10),
      ...mockPlayers(10, 'FWD', 18),
    ]);

    const squad = await (service as any).buildRandomSquad(39);

    const clubCounts: Record<number, number> = {};
    for (const p of squad.players) clubCounts[p.clubId] = (clubCounts[p.clubId] || 0) + 1;
    expect(Math.max(...Object.values(clubCounts))).toBeLessThanOrEqual(3);
  });

  it('total price does not exceed 100m', async () => {
    prisma.player.findMany.mockResolvedValue([
      ...mockPlayers(5, 'GK', 1),
      ...mockPlayers(20, 'DEF', 2),
      ...mockPlayers(20, 'MID', 10),
      ...mockPlayers(10, 'FWD', 18),
    ]);

    const squad = await (service as any).buildRandomSquad(39);

    const total = squad.players.reduce((sum: number, p: any) => sum + p.price, 0);
    expect(total).toBeLessThanOrEqual(100);
  });
});
