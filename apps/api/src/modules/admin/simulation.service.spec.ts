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

describe('SimulationService.openGameweek', () => {
  let service: SimulationService;
  let prisma: any;

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

  it('sets deadlineTime to the future', async () => {
    const futureDate = new Date(Date.now() + 60 * 60_000);
    (prisma as any).gameweek = {
      findUnique: jest.fn().mockResolvedValue({ id: 1, competitionId: 39 }),
      update: jest.fn().mockResolvedValue({ id: 1, deadlineTime: futureDate }),
    };

    const result = await service.openGameweek(1, 60);

    expect(prisma.gameweek.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 1 } }),
    );
    expect(result.deadlineTime.getTime()).toBeGreaterThan(Date.now());
  });
});

describe('SimulationService.submitBotPicks', () => {
  let service: SimulationService;
  let prisma: any;

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

  it('seeds picks from previous GW when none exist for current GW', async () => {
    (prisma as any).gameweek = {
      findUnique: jest.fn().mockResolvedValue({ id: 2, competitionId: 39 }),
    };
    (prisma as any).fantasyTeam = {
      findMany: jest.fn().mockResolvedValue([{ id: 'team-1' }]),
    };
    (prisma as any).playerPick = {
      findMany: jest.fn()
        .mockResolvedValueOnce([])  // no picks for GW2
        .mockResolvedValueOnce([    // picks from previous GW (GW1)
          { playerId: 1, isCaptain: true, isViceCaptain: false, isStarting: true, benchOrder: null },
          { playerId: 2, isCaptain: false, isViceCaptain: true, isStarting: true, benchOrder: null },
        ]),
      findFirst: jest.fn().mockResolvedValue({ gameweekId: 1 }),  // most recent prior GW
      createMany: jest.fn().mockResolvedValue({ count: 2 }),
    };

    const result = await service.submitBotPicks(2);

    expect((prisma as any).playerPick.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([
          expect.objectContaining({ gameweekId: 2 }),
        ]),
      }),
    );
    expect(result.picksSeeded).toBe(1);
  });

  it('skips teams that already have picks for the GW', async () => {
    (prisma as any).gameweek = {
      findUnique: jest.fn().mockResolvedValue({ id: 1, competitionId: 39 }),
    };
    (prisma as any).fantasyTeam = {
      findMany: jest.fn().mockResolvedValue([{ id: 'team-1' }]),
    };
    (prisma as any).playerPick = {
      findMany: jest.fn().mockResolvedValue([
        { playerId: 1, isCaptain: true, isViceCaptain: false, isStarting: true, benchOrder: null },
      ]),
      createMany: jest.fn(),
    };

    const result = await service.submitBotPicks(1);

    expect((prisma as any).playerPick.createMany).not.toHaveBeenCalled();
    expect(result.picksSeeded).toBe(0);
  });
});

describe('SimulationService.generatePerformance', () => {
  let service: SimulationService;
  let prisma: any;

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

  it('returns valid performance stats for each position', () => {
    for (const pos of ['GK', 'DEF', 'MID', 'FWD']) {
      const perf = (service as any).generatePerformance(pos);
      expect(perf.minutesPlayed).toBeGreaterThanOrEqual(0);
      expect(perf.minutesPlayed).toBeLessThanOrEqual(90);
      expect(perf.goalsScored).toBeGreaterThanOrEqual(0);
      if (pos !== 'GK') {
        expect(perf.saves).toBe(0);
      }
    }
  });
});
