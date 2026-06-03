# Gameplay Simulation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add admin endpoints that simulate a full GW lifecycle — create bot users, open GWs for picks, generate synthetic match performance data, finalize scores, and advance to the next GW — so the developer can test the complete game flow without real 2024 match data.

**Architecture:** A `SimulationService` inside the existing `AdminModule` handles all simulation logic: random squad generation, direct Prisma writes (bypassing deadline guards and BullMQ), synthetic `PlayerPerformance` row creation, and inline score finalization. Five HTTP endpoints on a `SimulationController` expose each step. The simulation replicates what the BullMQ `gameweek-finalise` processor does, but synchronously and without external triggers.

**Tech Stack:** NestJS, Prisma, `ScoringService` (from `ScoringModule`), `PrismaService` (global), `RedisService` (global).

---

## Files

### Create
- `apps/api/src/modules/admin/dto/simulate.dto.ts` — DTOs for all simulation endpoints
- `apps/api/src/modules/admin/simulation.service.ts` — all simulation business logic
- `apps/api/src/modules/admin/simulation.controller.ts` — HTTP endpoints (all `@Roles(Role.ADMIN)`)
- `apps/api/src/modules/admin/simulation.service.spec.ts` — unit tests

### Modify
- `apps/api/src/modules/admin/admin.module.ts` — import `ScoringModule`; register `SimulationService` + `SimulationController`

---

## Simulation Step Reference

The intended usage sequence for each GW:

```
POST /admin/simulate/bots          ← once, creates N bots with teams
POST /admin/simulate/gw/:id/open   ← sets deadline to future (user can submit picks via UI)
[User submits picks via normal UI]
POST /admin/simulate/gw/:id/bot-picks  ← seeds/refreshes bot picks for this GW
POST /admin/simulate/gw/:id/finalize   ← generates performance data + scores + advances GW
Repeat from open for next GW
```

---

## Task 1: DTOs + SimulationService skeleton + module wiring

**Files:**
- Create: `apps/api/src/modules/admin/dto/simulate.dto.ts`
- Create: `apps/api/src/modules/admin/simulation.service.ts`
- Modify: `apps/api/src/modules/admin/admin.module.ts`

- [ ] **Step 1: Create DTOs**

```typescript
// apps/api/src/modules/admin/dto/simulate.dto.ts
import { IsInt, IsPositive, Min, Max, IsOptional } from 'class-validator';

export class CreateBotsDto {
  @IsInt() @IsPositive() count: number;           // number of bots to create
  @IsInt() @IsPositive() competitionId: number;   // e.g. 39 for Premier League
}

export class OpenGameweekDto {
  @IsOptional() @IsInt() @Min(5) @Max(1440) minutesFromNow: number = 60;
}
```

- [ ] **Step 2: Create SimulationService stub**

```typescript
// apps/api/src/modules/admin/simulation.service.ts
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
```

- [ ] **Step 3: Update admin.module.ts**

```typescript
// apps/api/src/modules/admin/admin.module.ts
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
```

- [ ] **Step 4: TypeScript check passes**

```bash
cd /Users/trung/fantasy/apps/api && pnpm exec tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
cd /Users/trung/fantasy && git add apps/api/src/modules/admin/dto/simulate.dto.ts apps/api/src/modules/admin/simulation.service.ts apps/api/src/modules/admin/admin.module.ts
git commit -m "feat(simulate): add SimulationService skeleton and DTOs"
```

---

## Task 2: createBots — build bot users with random valid squads

**Files:**
- Modify: `apps/api/src/modules/admin/simulation.service.ts` — implement `createBots` + `buildRandomSquad`
- Create: `apps/api/src/modules/admin/simulation.service.spec.ts`

### Context for squad validation rules (from `FantasyTeamsService`)

- Squad: exactly 2 GK, 5 DEF, 5 MID, 3 FWD
- Max 3 players from one club
- Total price ≤ 100m
- Starting XI uses formation `4-4-2`: 1 GK, 4 DEF, 4 MID, 2 FWD
- Captain + vice-captain must be different starters
- `competition.isActive` must be `true` — if not, update it first:
  ```sql
  UPDATE "Competition" SET "isActive" = true WHERE id = 39;
  ```

- [ ] **Step 1: Write failing test**

```typescript
// apps/api/src/modules/admin/simulation.service.spec.ts
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

    const countByPos = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
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

    const total = squad.players.reduce((sum: number, p: any) => sum + p.competitionPrices[0].currentPrice.toNumber(), 0);
    expect(total).toBeLessThanOrEqual(100);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/trung/fantasy/apps/api && pnpm test -- --testPathPattern=simulation.service
```

Expected: FAIL (method not implemented).

- [ ] **Step 3: Implement `buildRandomSquad` and `createBots`**

```typescript
// In simulation.service.ts — add these private helpers and implement createBots

private shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

private async buildRandomSquad(competitionId: number): Promise<{
  players: any[];
  startingIds: number[];
  formation: string;
  captainId: number;
  viceCaptainId: number;
  benchOrder: Record<number, number>;
}> {
  const allPlayers = await this.prisma.player.findMany({
    where: { isAvailable: true },
    include: { competitionPrices: { where: { competitionId } } },
  });

  const available = allPlayers
    .filter((p) => p.competitionPrices.length > 0)
    .map((p) => ({ ...p, price: Number(p.competitionPrices[0].currentPrice) }));

  const byPos: Record<string, typeof available> = {
    GK: this.shuffle(available.filter((p) => p.position === 'GK')),
    DEF: this.shuffle(available.filter((p) => p.position === 'DEF')),
    MID: this.shuffle(available.filter((p) => p.position === 'MID')),
    FWD: this.shuffle(available.filter((p) => p.position === 'FWD')),
  };

  const needs: Record<string, number> = { GK: 2, DEF: 5, MID: 5, FWD: 3 };
  const squad: typeof available = [];
  const clubCounts: Record<number, number> = {};
  let totalCost = 0;

  for (const [pos, count] of Object.entries(needs)) {
    let picked = 0;
    for (const player of byPos[pos]) {
      if (picked >= count) break;
      if ((clubCounts[player.clubId] || 0) >= 3) continue;
      // Reserve 4m per remaining player slot to stay within 100m
      const remainingSlots = 15 - squad.length - 1;
      if (totalCost + player.price + remainingSlots * 4 > 100) continue;
      squad.push(player);
      clubCounts[player.clubId] = (clubCounts[player.clubId] || 0) + 1;
      totalCost += player.price;
      picked++;
    }
    if (picked < count) {
      throw new BadRequestException(`Cannot find ${count} ${pos} players within budget. Ensure enough players are seeded.`);
    }
  }

  // Starting XI: 4-4-2 — 1 GK, 4 DEF, 4 MID, 2 FWD
  const gks = squad.filter((p) => p.position === 'GK');
  const defs = squad.filter((p) => p.position === 'DEF');
  const mids = squad.filter((p) => p.position === 'MID');
  const fwds = squad.filter((p) => p.position === 'FWD');

  const startingIds = [
    gks[0].id,
    ...defs.slice(0, 4).map((p) => p.id),
    ...mids.slice(0, 4).map((p) => p.id),
    ...fwds.slice(0, 2).map((p) => p.id),
  ];

  // Captain = highest-price starter (excluding GK); vice-captain = second highest
  const outfieldStarters = [...defs.slice(0, 4), ...mids.slice(0, 4), ...fwds.slice(0, 2)]
    .sort((a, b) => b.price - a.price);
  const captainId = outfieldStarters[0].id;
  const viceCaptainId = outfieldStarters[1].id;

  // Bench: GK2, DEF5, MID5, FWD3 (bench positions 1–4)
  const bench = [gks[1], defs[4], mids[4], fwds[2]];
  const benchOrder: Record<number, number> = {};
  bench.forEach((p, i) => { benchOrder[p.id] = i + 1; });

  return { players: squad, startingIds, formation: '4-4-2', captainId, viceCaptainId, benchOrder };
}

async createBots(dto: CreateBotsDto): Promise<{ created: number; skipped: number; botIds: string[] }> {
  const competition = await this.prisma.competition.findUnique({ where: { id: dto.competitionId } });
  if (!competition) throw new NotFoundException(`Competition ${dto.competitionId} not found`);
  if (!competition.isActive) {
    throw new BadRequestException(
      `Competition ${dto.competitionId} is not active. Run: UPDATE "Competition" SET "isActive" = true WHERE id = ${dto.competitionId};`,
    );
  }

  const currentGw = await this.prisma.gameweek.findFirst({
    where: { competitionId: dto.competitionId, isCurrent: true },
  });
  if (!currentGw) throw new BadRequestException(`No current gameweek for competition ${dto.competitionId}`);

  const bcrypt = await import('bcryptjs');
  const hash = await bcrypt.hash('bot_password_123', 10);

  let created = 0;
  let skipped = 0;
  const botIds: string[] = [];

  for (let i = 1; i <= dto.count; i++) {
    const email = `bot_${dto.competitionId}_${i}@sim.test`;

    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      // Check if they already have a team
      const existingTeam = await this.prisma.fantasyTeam.findUnique({
        where: { userId_competitionId: { userId: existing.id, competitionId: dto.competitionId } },
      });
      if (existingTeam) {
        skipped++;
        botIds.push(existing.id);
        continue;
      }
    }

    const user = existing ?? await this.prisma.user.create({
      data: { email, username: `Bot_${dto.competitionId}_${i}`, passwordHash: hash },
    });

    const squad = await this.buildRandomSquad(dto.competitionId);
    const totalCost = squad.players.reduce((sum, p) => sum + p.price, 0);
    const budget = Math.round((100 - totalCost) * 10) / 10;

    await this.prisma.$transaction(async (tx) => {
      const team = await tx.fantasyTeam.create({
        data: {
          userId: user.id,
          competitionId: dto.competitionId,
          name: `Bot Team ${i}`,
          budget,
          totalValue: Math.round(totalCost * 10) / 10,
          formation: squad.formation,
          freeTransfers: 1,
        },
      });

      const startingSet = new Set(squad.startingIds);
      await tx.playerPick.createMany({
        data: squad.players.map((p) => ({
          fantasyTeamId: team.id,
          playerId: p.id,
          gameweekId: currentGw.id,
          isCaptain: p.id === squad.captainId,
          isViceCaptain: p.id === squad.viceCaptainId,
          isStarting: startingSet.has(p.id),
          benchOrder: squad.benchOrder[p.id] ?? null,
          multiplier: 1,
        })),
      });
    });

    botIds.push(user.id);
    created++;
    this.logger.log(`Created bot ${i}: ${email}`);
  }

  return { created, skipped, botIds };
}
```

- [ ] **Step 4: Run tests**

```bash
cd /Users/trung/fantasy/apps/api && pnpm test -- --testPathPattern=simulation.service
```

Expected: 3 tests PASS.

- [ ] **Step 5: TypeScript check**

```bash
cd /Users/trung/fantasy/apps/api && pnpm exec tsc --noEmit
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
cd /Users/trung/fantasy && git add apps/api/src/modules/admin/simulation.service.ts apps/api/src/modules/admin/simulation.service.spec.ts
git commit -m "feat(simulate): implement createBots with random squad generation"
```

---

## Task 3: openGameweek — reset deadline to future

**Files:**
- Modify: `apps/api/src/modules/admin/simulation.service.ts` — implement `openGameweek`

- [ ] **Step 1: Write failing test**

```typescript
// In simulation.service.spec.ts — add to describe block:

describe('SimulationService.openGameweek', () => {
  it('sets deadlineTime to the future', async () => {
    const futureDate = new Date(Date.now() + 60 * 60_000);
    prisma.gameweek = {
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
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/trung/fantasy/apps/api && pnpm test -- --testPathPattern=simulation.service
```

Expected: new test FAILS.

- [ ] **Step 3: Implement `openGameweek`**

```typescript
// In simulation.service.ts — replace throw in openGameweek:

async openGameweek(gwId: number, minutesFromNow: number): Promise<{ gameweekId: number; deadlineTime: Date }> {
  const gw = await this.prisma.gameweek.findUnique({ where: { id: gwId } });
  if (!gw) throw new NotFoundException(`Gameweek ${gwId} not found`);

  const deadlineTime = new Date(Date.now() + minutesFromNow * 60_000);
  await this.prisma.gameweek.update({ where: { id: gwId }, data: { deadlineTime } });

  this.logger.log(`GW ${gwId} opened — deadline set to ${deadlineTime.toISOString()}`);
  return { gameweekId: gwId, deadlineTime };
}
```

- [ ] **Step 4: Run tests**

```bash
cd /Users/trung/fantasy/apps/api && pnpm test -- --testPathPattern=simulation.service
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/trung/fantasy && git add apps/api/src/modules/admin/simulation.service.ts apps/api/src/modules/admin/simulation.service.spec.ts
git commit -m "feat(simulate): implement openGameweek"
```

---

## Task 4: submitBotPicks — seed bot picks for a GW

**Files:**
- Modify: `apps/api/src/modules/admin/simulation.service.ts` — implement `submitBotPicks`

**Context:** For GW1, picks were already created by `createBots`. For GW2+, picks must be seeded from the previous GW. The bot's captain/VC from the most recent GW are preserved. This directly writes to DB — no deadline guard check.

- [ ] **Step 1: Write failing test**

```typescript
// In simulation.service.spec.ts — add:

describe('SimulationService.submitBotPicks', () => {
  it('seeds picks from previous GW when none exist for current GW', async () => {
    prisma.gameweek = {
      findUnique: jest.fn().mockResolvedValue({ id: 2, competitionId: 39 }),
    };
    prisma.fantasyTeam = {
      findMany: jest.fn().mockResolvedValue([{ id: 'team-1' }]),
    };
    prisma.playerPick = {
      findMany: jest.fn()
        .mockResolvedValueOnce([])  // no picks for GW2
        .mockResolvedValueOnce([    // picks from previous GW
          { playerId: 1, isCaptain: true, isViceCaptain: false, isStarting: true, benchOrder: null },
          { playerId: 2, isCaptain: false, isViceCaptain: true, isStarting: true, benchOrder: null },
        ]),
      createMany: jest.fn().mockResolvedValue({ count: 2 }),
    };

    const result = await service.submitBotPicks(2);

    expect(prisma.playerPick.createMany).toHaveBeenCalled();
    expect(result.picksSeeded).toBe(1);
  });

  it('skips teams that already have picks for the GW', async () => {
    prisma.gameweek = {
      findUnique: jest.fn().mockResolvedValue({ id: 1, competitionId: 39 }),
    };
    prisma.fantasyTeam = {
      findMany: jest.fn().mockResolvedValue([{ id: 'team-1' }]),
    };
    prisma.playerPick = {
      findMany: jest.fn().mockResolvedValue([
        { playerId: 1, isCaptain: true, isViceCaptain: false, isStarting: true, benchOrder: null },
      ]),
      createMany: jest.fn(),
    };

    const result = await service.submitBotPicks(1);

    expect(prisma.playerPick.createMany).not.toHaveBeenCalled();
    expect(result.picksSeeded).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/trung/fantasy/apps/api && pnpm test -- --testPathPattern=simulation.service
```

Expected: 2 new tests FAIL.

- [ ] **Step 3: Implement `submitBotPicks`**

```typescript
// In simulation.service.ts — replace throw in submitBotPicks:

async submitBotPicks(gwId: number): Promise<{ bots: number; picksSeeded: number }> {
  const gw = await this.prisma.gameweek.findUnique({ where: { id: gwId } });
  if (!gw) throw new NotFoundException(`Gameweek ${gwId} not found`);

  // Get all bot teams (users whose email matches bot pattern)
  const botTeams = await this.prisma.fantasyTeam.findMany({
    where: {
      competitionId: gw.competitionId,
      user: { email: { contains: '@sim.test' } },
    },
  });

  let picksSeeded = 0;

  for (const team of botTeams) {
    // Check if picks already exist for this GW
    const existingPicks = await this.prisma.playerPick.findMany({
      where: { fantasyTeamId: team.id, gameweekId: gwId },
    });

    if (existingPicks.length > 0) continue; // already seeded

    // Seed from most recent previous GW's picks
    const previousPicks = await this.prisma.playerPick.findMany({
      where: { fantasyTeamId: team.id, gameweekId: { not: gwId } },
      orderBy: { gameweek: { number: 'desc' } },
      take: 15,
    });

    if (previousPicks.length === 0) {
      this.logger.warn(`Bot team ${team.id} has no previous picks to seed from`);
      continue;
    }

    await this.prisma.playerPick.createMany({
      data: previousPicks.map((p) => ({
        fantasyTeamId: team.id,
        playerId: p.playerId,
        gameweekId: gwId,
        isCaptain: p.isCaptain,
        isViceCaptain: p.isViceCaptain,
        isStarting: p.isStarting,
        benchOrder: p.benchOrder,
        multiplier: 1,
      })),
      skipDuplicates: true,
    });

    picksSeeded++;
  }

  return { bots: botTeams.length, picksSeeded };
}
```

- [ ] **Step 4: Run tests**

```bash
cd /Users/trung/fantasy/apps/api && pnpm test -- --testPathPattern=simulation.service
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/trung/fantasy && git add apps/api/src/modules/admin/simulation.service.ts apps/api/src/modules/admin/simulation.service.spec.ts
git commit -m "feat(simulate): implement submitBotPicks"
```

---

## Task 5: finalizeGameweek — generate performance data + score all teams

**Files:**
- Modify: `apps/api/src/modules/admin/simulation.service.ts` — implement `finalizeGameweek` + `generatePerformance`

**Context:** This does everything that the BullMQ `gameweek-finalise` processor does, but synchronously:
1. Set `deadlineTime = now() - 1 min` (blocks future picks)
2. Generate synthetic `PlayerPerformance` rows for every player in any pick for this GW
3. Set all GW fixtures to `FINISHED` in DB
4. Call `ScoringService.finaliseGameweekScores(gwId)` (reads rows where `isFinalised: true`)
5. Set GW status = `FINISHED`, `isCurrent = false`
6. Set next GW's `isCurrent = true`
7. Invalidate Redis leaderboard caches

The `ScoringService.calculatePlayerPoints(perf, position)` signature requires:
```typescript
{ minutesPlayed, goalsScored, assists, cleanSheet, goalsConceded, ownGoals,
  penaltiesSaved, penaltiesMissed, yellowCards, redCards, saves, bonus }
```
and returns `{ totalPoints, pointsBreakdown }`.

- [ ] **Step 1: Write failing test**

```typescript
// In simulation.service.spec.ts — add:

describe('SimulationService.generatePerformance', () => {
  it('returns valid performance stats for each position', () => {
    for (const pos of ['GK', 'DEF', 'MID', 'FWD']) {
      const perf = (service as any).generatePerformance(pos);
      expect(perf.minutesPlayed).toBeGreaterThanOrEqual(0);
      expect(perf.minutesPlayed).toBeLessThanOrEqual(90);
      expect(perf.goalsScored).toBeGreaterThanOrEqual(0);
      expect(perf.saves).toBe(pos === 'GK' ? perf.saves : 0); // only GK has saves
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/trung/fantasy/apps/api && pnpm test -- --testPathPattern=simulation.service
```

Expected: FAIL.

- [ ] **Step 3: Implement `generatePerformance` + `finalizeGameweek`**

```typescript
// In simulation.service.ts — add private helper:

private generatePerformance(position: string): {
  minutesPlayed: number; goalsScored: number; assists: number;
  cleanSheet: boolean; goalsConceded: number; ownGoals: number;
  penaltiesSaved: number; penaltiesMissed: number;
  yellowCards: number; redCards: number; saves: number; bonus: number;
} {
  const r = Math.random;
  const played = r() > 0.08; // 92% chance of playing
  if (!played) {
    return { minutesPlayed: 0, goalsScored: 0, assists: 0, cleanSheet: false, goalsConceded: 0, ownGoals: 0, penaltiesSaved: 0, penaltiesMissed: 0, yellowCards: 0, redCards: 0, saves: 0, bonus: 0 };
  }

  const minutesPlayed = r() > 0.25 ? Math.floor(60 + r() * 30) : Math.floor(1 + r() * 59);
  const goalRates: Record<string, number> = { GK: 0.01, DEF: 0.04, MID: 0.12, FWD: 0.28 };
  const cleanSheet = minutesPlayed >= 60 && r() < 0.28;

  return {
    minutesPlayed,
    goalsScored: r() < (goalRates[position] ?? 0.1) ? (r() < 0.15 ? 2 : 1) : 0,
    assists: r() < 0.12 ? 1 : 0,
    cleanSheet,
    goalsConceded: cleanSheet ? 0 : Math.floor(r() * 3),
    ownGoals: r() < 0.01 ? 1 : 0,
    penaltiesSaved: position === 'GK' && r() < 0.02 ? 1 : 0,
    penaltiesMissed: r() < 0.01 ? 1 : 0,
    yellowCards: r() < 0.08 ? 1 : 0,
    redCards: r() < 0.01 ? 1 : 0,
    saves: position === 'GK' ? Math.floor(r() * 7) : 0,
    bonus: [0, 0, 0, 0, 1, 2, 3][Math.floor(r() * 7)],
  };
}

// Replace throw in finalizeGameweek:

async finalizeGameweek(gwId: number): Promise<{ gameweekId: number; teamsScored: number; nextGameweekId: number | null }> {
  const gw = await this.prisma.gameweek.findUnique({
    where: { id: gwId },
    include: { competition: true },
  });
  if (!gw) throw new NotFoundException(`Gameweek ${gwId} not found`);
  if (gw.status === 'FINISHED') throw new BadRequestException(`Gameweek ${gwId} is already FINISHED`);

  // 1. Set deadline to the past (locks picks)
  await this.prisma.gameweek.update({
    where: { id: gwId },
    data: { deadlineTime: new Date(Date.now() - 60_000), status: 'SCORING' },
  });

  // 2. Get all fixtures for this GW (use first one as anchor for performance rows)
  const fixtures = await this.prisma.fixture.findMany({ where: { gameweekId: gwId } });
  const anchorFixtureId = fixtures[0]?.id ?? null;

  // 3. Get all unique players in picks for this GW
  const picks = await this.prisma.playerPick.findMany({
    where: { gameweekId: gwId },
    include: { player: { select: { position: true } } },
    distinct: ['playerId'],
  });

  // 4. Generate and upsert PlayerPerformance for each player
  for (const pick of picks) {
    const stats = this.generatePerformance(pick.player.position);
    const { totalPoints, pointsBreakdown } = this.scoring.calculatePlayerPoints(stats, pick.player.position as any);

    await this.prisma.playerPerformance.upsert({
      where: {
        playerId_gameweekId_fixtureId: {
          playerId: pick.playerId,
          gameweekId: gwId,
          fixtureId: anchorFixtureId ?? 0,
        },
      },
      create: {
        playerId: pick.playerId,
        gameweekId: gwId,
        fixtureId: anchorFixtureId,
        ...stats,
        totalPoints,
        pointsBreakdown,
        isFinalised: true,
      },
      update: { ...stats, totalPoints, pointsBreakdown, isFinalised: true },
    });
  }

  // 5. Mark all fixtures in the GW as FINISHED
  await this.prisma.fixture.updateMany({
    where: { gameweekId: gwId },
    data: { status: 'FINISHED' },
  });

  // 6. Run score finalization
  await this.scoring.finaliseGameweekScores(gwId);

  // 7. Mark GW FINISHED, unset isCurrent
  await this.prisma.gameweek.update({
    where: { id: gwId },
    data: { status: 'FINISHED', isCurrent: false },
  });

  // 8. Advance isCurrent to next GW
  const nextGw = await this.prisma.gameweek.findFirst({
    where: { competitionId: gw.competitionId, status: { not: 'FINISHED' } },
    orderBy: { number: 'asc' },
  });
  if (nextGw) {
    await this.prisma.gameweek.update({ where: { id: nextGw.id }, data: { isCurrent: true } });
  }

  // 9. Invalidate Redis leaderboard caches
  await this.redis.delByPattern(`leaderboard:global:${gw.competitionId}:*`);
  await this.redis.delByPattern(`leaderboard:league:*`);

  // Count scored teams
  const scored = await this.prisma.gameweekScore.count({ where: { gameweekId: gwId } });

  this.logger.log(`GW ${gwId} finalized — ${scored} teams scored. Next GW: ${nextGw?.id ?? 'none'}`);
  return { gameweekId: gwId, teamsScored: scored, nextGameweekId: nextGw?.id ?? null };
}
```

**Note on the `upsert` key:** The Prisma schema defines a unique index on `(playerId, gameweekId, fixtureId)` for `PlayerPerformance`, but the blank-GW partial index uses raw SQL. If `anchorFixtureId` is null, use the raw partial index approach instead of `upsert`. Check the actual Prisma schema — if `@@unique` doesn't cover the null case, use `findFirst` + `create`/`update` instead of `upsert`.

- [ ] **Step 4: Run tests**

```bash
cd /Users/trung/fantasy/apps/api && pnpm test -- --testPathPattern=simulation.service
```

Expected: all tests PASS.

- [ ] **Step 5: TypeScript check**

```bash
cd /Users/trung/fantasy/apps/api && pnpm exec tsc --noEmit
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
cd /Users/trung/fantasy && git add apps/api/src/modules/admin/simulation.service.ts apps/api/src/modules/admin/simulation.service.spec.ts
git commit -m "feat(simulate): implement generatePerformance and finalizeGameweek"
```

---

## Task 6: SimulationController — wire all endpoints

**Files:**
- Create: `apps/api/src/modules/admin/simulation.controller.ts`
- Modify: `apps/api/src/modules/admin/admin.module.ts` — add SimulationController

- [ ] **Step 1: Create the controller**

```typescript
// apps/api/src/modules/admin/simulation.controller.ts
import { Controller, Post, Param, ParseIntPipe, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '@prisma/client';
import { SimulationService } from './simulation.service';
import { CreateBotsDto, OpenGameweekDto } from './dto/simulate.dto';

@Controller('admin/simulate')
@Roles(Role.ADMIN)
export class SimulationController {
  constructor(private readonly simulation: SimulationService) {}

  @Post('bots')
  async createBots(@Body() dto: CreateBotsDto) {
    return { data: await this.simulation.createBots(dto) };
  }

  @Post('gw/:gwId/open')
  async openGameweek(
    @Param('gwId', ParseIntPipe) gwId: number,
    @Body() dto: OpenGameweekDto,
  ) {
    return { data: await this.simulation.openGameweek(gwId, dto.minutesFromNow ?? 60) };
  }

  @Post('gw/:gwId/bot-picks')
  async submitBotPicks(@Param('gwId', ParseIntPipe) gwId: number) {
    return { data: await this.simulation.submitBotPicks(gwId) };
  }

  @Post('gw/:gwId/finalize')
  @HttpCode(HttpStatus.OK)
  async finalizeGameweek(@Param('gwId', ParseIntPipe) gwId: number) {
    return { data: await this.simulation.finalizeGameweek(gwId) };
  }
}
```

- [ ] **Step 2: Register controller in admin.module.ts**

```typescript
// apps/api/src/modules/admin/admin.module.ts
import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { SimulationService } from './simulation.service';
import { SimulationController } from './simulation.controller';
import { SyncModule } from '../sync/sync.module';
import { ScoringModule } from '../scoring/scoring.module';

@Module({
  imports: [SyncModule, ScoringModule],
  controllers: [AdminController, SimulationController],
  providers: [AdminService, SimulationService],
})
export class AdminModule {}
```

- [ ] **Step 3: TypeScript check**

```bash
cd /Users/trung/fantasy/apps/api && pnpm exec tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Start API and verify routes are registered**

```bash
cd /Users/trung/fantasy/apps/api && pnpm start:dev
```

Look for lines like:
```
[RouterExplorer] Mapped {/admin/simulate/bots, POST}
[RouterExplorer] Mapped {/admin/simulate/gw/:gwId/open, POST}
[RouterExplorer] Mapped {/admin/simulate/gw/:gwId/bot-picks, POST}
[RouterExplorer] Mapped {/admin/simulate/gw/:gwId/finalize, POST}
```

- [ ] **Step 5: Commit**

```bash
cd /Users/trung/fantasy && git add apps/api/src/modules/admin/simulation.controller.ts apps/api/src/modules/admin/admin.module.ts
git commit -m "feat(simulate): add SimulationController with all simulation endpoints"
```

---

## Task 7: End-to-end smoke test

Run through the full simulation flow manually to confirm everything works together.

- [ ] **Step 1: Ensure competition is active**

In Prisma Studio (`pnpm exec prisma studio` from `apps/api/`) or via psql:
```sql
UPDATE "Competition" SET "isActive" = true WHERE id = 39;
```

- [ ] **Step 2: Get admin JWT**

```bash
TOKEN=$(curl -s -X POST http://localhost:3001/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"<your-admin-email>","password":"<your-password>"}' \
  | jq -r '.data.accessToken')
echo $TOKEN
```

- [ ] **Step 3: Create bots**

```bash
curl -s -X POST http://localhost:3001/admin/simulate/bots \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"count":5,"competitionId":39}' | jq
```

Expected: `{ "data": { "created": 5, "skipped": 0, "botIds": [...] } }`

- [ ] **Step 4: Get GW1 ID**

```bash
curl -s "http://localhost:3001/competitions/39/gameweeks" \
  -H "Authorization: Bearer $TOKEN" | jq '.data[0]'
```

Note the `id` of the first gameweek (GW where `isCurrent: true`). Substitute as `GW_ID` below.

- [ ] **Step 5: Open GW1 for user picks**

```bash
curl -s -X POST "http://localhost:3001/admin/simulate/gw/${GW_ID}/open" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"minutesFromNow":60}' | jq
```

Expected: `{ "data": { "gameweekId": GW_ID, "deadlineTime": "<future ISO string>" } }`

- [ ] **Step 6: Submit user picks via UI**

Navigate to `http://localhost:5173/squad`, submit your picks for the open GW.

- [ ] **Step 7: Submit bot picks**

```bash
curl -s -X POST "http://localhost:3001/admin/simulate/gw/${GW_ID}/bot-picks" \
  -H "Authorization: Bearer $TOKEN" | jq
```

Expected: `{ "data": { "bots": 5, "picksSeeded": 0 } }` (0 seeded because GW1 picks already exist from `createBots`)

- [ ] **Step 8: Finalize GW1**

```bash
curl -s -X POST "http://localhost:3001/admin/simulate/gw/${GW_ID}/finalize" \
  -H "Authorization: Bearer $TOKEN" | jq
```

Expected: `{ "data": { "gameweekId": GW_ID, "teamsScored": 6, "nextGameweekId": <GW2_ID> } }`

- [ ] **Step 9: Verify squad page shows points**

Navigate to `http://localhost:5173/squad` — the GW should now show scored points. Navigate to Leagues to see the leaderboard update.

- [ ] **Step 10: Run GW2**

```bash
GW2_ID=<nextGameweekId from step 8>

# Open GW2
curl -s -X POST "http://localhost:3001/admin/simulate/gw/${GW2_ID}/open" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"minutesFromNow":60}' | jq

# Submit user picks via UI (make a transfer if desired)

# Submit bot picks (seeds from GW1)
curl -s -X POST "http://localhost:3001/admin/simulate/gw/${GW2_ID}/bot-picks" \
  -H "Authorization: Bearer $TOKEN" | jq

# Finalize GW2
curl -s -X POST "http://localhost:3001/admin/simulate/gw/${GW2_ID}/finalize" \
  -H "Authorization: Bearer $TOKEN" | jq
```

- [ ] **Step 11: Final commit**

```bash
cd /Users/trung/fantasy && git add -A
git commit -m "feat(simulate): complete gameplay simulation endpoints"
```

---

## Self-Review Checklist

**Spec coverage:**
- [x] Create bots → `createBots`
- [x] Create bots' teams → done inside `createBots`
- [x] Auto picks for bots → `submitBotPicks`
- [x] Change time to past deadline → `openGameweek` sets future; `finalizeGameweek` sets past
- [x] Calculate scores → `finalizeGameweek` calls `ScoringService.finaliseGameweekScores()`
- [x] Change GW status to FINISHED + start next GW → `finalizeGameweek` handles GW transitions
- [x] Auto transfer for bots — **not implemented** (bots keep the same squad each GW; bots don't make transfers). This keeps the implementation scope tight.

**Notes for executor:**
- The `upsert` in `finalizeGameweek` relies on a unique constraint on `(playerId, gameweekId, fixtureId)`. Verify this exists in Prisma schema (`@@unique`) before using `upsert`. If `fixtureId` is nullable and the unique index is a raw SQL partial index, replace `upsert` with `findFirst` + create-or-update.
- If `ScoringModule` import causes a circular dependency (unlikely, but possible if ScoringService imports something AdminModule also owns), add `ScoringService` directly as a provider instead.
