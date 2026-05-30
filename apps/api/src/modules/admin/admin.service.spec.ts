/// <reference types="jest" />
import { AdminService } from './admin.service';

// Minimal mock — only the methods we need
function makeService(overrides: Partial<any> = {}): AdminService {
  const prisma = {
    club: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn() },
    player: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn() },
    clubAlias: { upsert: jest.fn() },
    playerAlias: { upsert: jest.fn() },
    ...overrides.prisma,
  } as any;

  const aliasService = {
    resolveClubForAdmin: (c: any) => ({ id: c.id, realName: c.realName, name: c.alias?.name ?? '[Unnamed]', isAliased: !!c.alias }),
    resolvePlayerForAdmin: (p: any) => ({ id: p.id, realName: p.realName, name: p.alias?.name ?? '[Unnamed]', isAliased: !!p.alias }),
    resolveCompetitionForAdmin: jest.fn(),
    getUnaliasedSummary: jest.fn(),
    resolveClub: jest.fn(),
    resolvePlayer: jest.fn(),
    resolveCompetition: jest.fn(),
    ...overrides.aliasService,
  } as any;

  return new AdminService(prisma, aliasService, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any);
}

describe('AdminService.importAliases', () => {
  it('skips rows with empty alias_name', async () => {
    const svc = makeService();
    const csv = 'id,real_name,competition_id,alias_name,alias_short_name,alias_city\n1,Real Club,39,,, ';
    const file = { buffer: Buffer.from(csv) } as any;
    const result = await svc.importAliases({ clubs: [file] });
    expect(result.clubs?.skipped).toBe(1);
    expect(result.clubs?.processed).toBe(0);
  });

  it('processes rows with alias_name, upserts alias', async () => {
    const upsert = jest.fn().mockResolvedValue({});
    const findMany = jest.fn().mockResolvedValue([{ id: 1 }]);
    const svc = makeService({ prisma: { club: { findMany }, clubAlias: { upsert } } });
    const csv = 'id,real_name,competition_id,alias_name,alias_short_name,alias_city\n1,Real Club,39,Alias Club,ACL,London';
    const file = { buffer: Buffer.from(csv) } as any;
    const result = await svc.importAliases({ clubs: [file] });
    expect(result.clubs?.processed).toBe(1);
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { clubId: 1 },
      create: expect.objectContaining({ name: 'Alias Club', shortName: 'ACL', city: 'London' }),
    }));
  });

  it('records error for unknown club id', async () => {
    const findMany = jest.fn().mockResolvedValue([]); // empty = not found
    const svc = makeService({ prisma: { club: { findMany } } });
    const csv = 'id,real_name,competition_id,alias_name,alias_short_name,alias_city\n999,Ghost Club,39,Ghost,GHO,';
    const file = { buffer: Buffer.from(csv) } as any;
    const result = await svc.importAliases({ clubs: [file] });
    expect(result.clubs?.errors).toHaveLength(1);
    expect(result.clubs?.errors[0].error).toMatch(/not found/i);
  });

  it('processes player CSV with alias_name', async () => {
    const upsert = jest.fn().mockResolvedValue({});
    const findMany = jest.fn().mockResolvedValue([{ id: 5 }]);
    const svc = makeService({ prisma: { player: { findMany }, playerAlias: { upsert } } });
    const csv = 'id,real_name,position,club_id,club_real_name,alias_name\n5,Real Player,MF,1,Real Club,Alias Player';
    const file = { buffer: Buffer.from(csv) } as any;
    const result = await svc.importAliases({ players: [file] });
    expect(result.players?.processed).toBe(1);
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { playerId: 5 },
      create: expect.objectContaining({ name: 'Alias Player' }),
    }));
  });
});
