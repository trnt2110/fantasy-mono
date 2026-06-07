import { Test, TestingModule } from '@nestjs/testing';
import { PlayersService } from './players.service';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { AliasService } from '../alias/alias.service';
import { RedisService } from '../../infrastructure/redis/redis.service';

const makePlayer = (overrides: Record<string, unknown> = {}) => ({
  id: 1, totalPoints: 80, position: 'FWD', clubId: 1, isAvailable: true,
  alias: null, club: { id: 1, alias: null },
  competitionPrices: [{ currentPrice: { toNumber: () => 5.0 } }],
  performances: [],
  ...overrides,
});

describe('PlayersService.findAll', () => {
  let service: PlayersService;
  let prisma: {
    player: { findMany: jest.Mock; count: jest.Mock };
    gameweek: { findFirst: jest.Mock };
  };
  let redis: { getOrSet: jest.Mock };
  let alias: { resolvePlayer: jest.Mock };

  beforeEach(async () => {
    prisma = {
      player: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
      gameweek: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    redis = {
      getOrSet: jest.fn().mockImplementation((_key, _ttl, fn) => fn()),
    };
    alias = {
      resolvePlayer: jest.fn().mockImplementation((p) => ({
        id: p.id, name: 'Player', position: p.position,
        clubId: p.clubId, clubName: 'Club',
        currentPrice: 5.0, isAvailable: true, isAliased: false,
      })),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PlayersService,
        { provide: PrismaService, useValue: prisma },
        { provide: AliasService, useValue: alias },
        { provide: RedisService, useValue: redis },
      ],
    }).compile();

    service = module.get(PlayersService);
  });

  it('orders by totalPoints desc', async () => {
    await service.findAll({ competitionId: 1 });
    expect(prisma.player.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { totalPoints: 'desc' } }),
    );
  });

  it('uses default limit of 50', async () => {
    await service.findAll({ competitionId: 1 });
    expect(prisma.player.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 50 }),
    );
  });

  it('returns currentGwPoints from current gameweek performance', async () => {
    prisma.gameweek.findFirst.mockResolvedValue({ id: 7 });
    prisma.player.findMany.mockResolvedValue([
      makePlayer({ performances: [{ totalPoints: 12, gameweekId: 7 }] }),
    ]);

    const result = await service.findAll({ competitionId: 1 });
    expect((result.data as any[])[0].currentGwPoints).toBe(12);
  });

  it('returns totalPoints as sum of all performance records', async () => {
    prisma.gameweek.findFirst.mockResolvedValue({ id: 7 });
    prisma.player.findMany.mockResolvedValue([
      makePlayer({ performances: [{ totalPoints: 10, gameweekId: 5 }, { totalPoints: 7, gameweekId: 7 }] }),
    ]);

    const result = await service.findAll({ competitionId: 1 });
    expect((result.data as any[])[0].totalPoints).toBe(17);
    expect((result.data as any[])[0].currentGwPoints).toBe(7);
  });

  it('sets currentGwPoints to null when player has no performance this GW', async () => {
    prisma.gameweek.findFirst.mockResolvedValue({ id: 7 });
    prisma.player.findMany.mockResolvedValue([
      makePlayer({ performances: [{ totalPoints: 10, gameweekId: 5 }] }),
    ]);

    const result = await service.findAll({ competitionId: 1 });
    expect((result.data as any[])[0].currentGwPoints).toBeNull();
  });

  it('sets currentGwPoints to null when no current gameweek exists', async () => {
    prisma.gameweek.findFirst.mockResolvedValue(null);
    prisma.player.findMany.mockResolvedValue([
      makePlayer({ performances: [] }),
    ]);

    const result = await service.findAll({ competitionId: 1 });
    expect((result.data as any[])[0].currentGwPoints).toBeNull();
  });
});
