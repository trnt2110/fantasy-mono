# Bootstrap API Improvements Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 8 correctness, safety, and observability issues in the bootstrap sync pipeline identified during code review.

**Architecture:** All changes are confined to `bootstrap.processor.ts`, `game.constants.ts` (shared), and `bootstrap.dto.ts`. No schema migrations required. Tasks are ordered by dependency — Tasks 1–3 are independent quick wins; Tasks 4–8 build on top of each other incrementally.

**Tech Stack:** NestJS, BullMQ, Prisma, Redis (`RedisService`), `@fantasy/shared` constants package.

---

## Files Modified

| File | Change |
|---|---|
| `packages/shared/src/constants/game.constants.ts` | Change `DEADLINE_OFFSET_MINUTES` from 90→120; add `POSITION_DEFAULT_PRICES` |
| `apps/api/src/modules/sync/bootstrap.processor.ts` | 7 targeted fixes (see tasks below) |
| `apps/api/src/modules/admin/dto/bootstrap.dto.ts` | Add `force?: boolean` field |

---

## Task 1: Use the deadline constant (don't hardcode 90)

The constant `DEADLINE_OFFSET_MINUTES = 90` already exists in `packages/shared/src/constants/game.constants.ts` but `bootstrap.processor.ts` ignores it and hardcodes `90 * 60 * 1000`. Fix this and also update the value to 120 min (FPL standard).

**Files:**
- Modify: `packages/shared/src/constants/game.constants.ts:29`
- Modify: `apps/api/src/modules/sync/bootstrap.processor.ts:278`

- [ ] **Step 1: Update the constant value in shared**

In `packages/shared/src/constants/game.constants.ts`, change line 29:
```typescript
// Before:
export const DEADLINE_OFFSET_MINUTES = 90; // deadline = first kickoff - 90 minutes

// After:
export const DEADLINE_OFFSET_MINUTES = 120; // deadline = first kickoff - 120 minutes (FPL standard)
```

- [ ] **Step 2: Import and use the constant in bootstrap.processor.ts**

At the top of `apps/api/src/modules/sync/bootstrap.processor.ts`, add `DEADLINE_OFFSET_MINUTES` to the shared import:
```typescript
import { LEAGUE_IDS, LEAGUE_SLUGS, LEAGUE_GW_COUNTS, TOTAL_MODE_COMPETITION_ID, DEADLINE_OFFSET_MINUTES } from '@fantasy/shared';
```

Then in `seedFixturesAndGameweeks` (around line 278), replace the hardcoded calculation:
```typescript
// Before:
const deadline = new Date(earliest.getTime() - 90 * 60 * 1000);

// After:
const deadline = new Date(earliest.getTime() - DEADLINE_OFFSET_MINUTES * 60 * 1000);
```

- [ ] **Step 3: Rebuild shared package and TypeScript-check**

```bash
cd /Users/trung/fantasy
pnpm --filter @fantasy/shared build

cd /Users/trung/fantasy/.worktrees/fantasy-game/apps/api
pnpm exec tsc --noEmit
```
Expected: no TypeScript errors.

- [ ] **Step 4: Commit**

```bash
cd /Users/trung/fantasy/.worktrees/fantasy-game
git add packages/shared/src/constants/game.constants.ts
git add apps/api/src/modules/sync/bootstrap.processor.ts
git commit -m "fix(bootstrap): use DEADLINE_OFFSET_MINUTES constant (90→120 min)"
```

---

## Task 2: Position-based player pricing

Players are currently all seeded at `INITIAL_PLAYER_PRICE = 5.0` regardless of position. A flat price lets users trivially exploit the budget by filling with cheap GKs. Use position-based defaults instead.

**Files:**
- Modify: `packages/shared/src/constants/game.constants.ts` (add `POSITION_DEFAULT_PRICES`)
- Modify: `apps/api/src/modules/sync/bootstrap.processor.ts` (use it in `seedPlayersForClub`)

- [ ] **Step 1: Add position price defaults to shared constants**

In `packages/shared/src/constants/game.constants.ts`, add after `DEADLINE_OFFSET_MINUTES`:
```typescript
/** Default prices (£m) seeded per position. Admins adjust after aliasing. */
export const POSITION_DEFAULT_PRICES: Record<string, number> = {
  GK: 4.5,
  DEF: 4.5,
  MID: 5.0,
  FWD: 5.5,
};
```

- [ ] **Step 2: Export from shared index**

Check `packages/shared/src/index.ts` — if `game.constants.ts` is already re-exported, no change needed. If not, add:
```typescript
export * from './constants/game.constants';
```

- [ ] **Step 3: Use position prices in bootstrap.processor.ts**

In `bootstrap.processor.ts`, add `POSITION_DEFAULT_PRICES` to the shared import line. Then in `seedPlayersForClub` (around line 233), change the upsert:
```typescript
// Before:
await this.prisma.playerCompetitionPrice.upsert({
  where: { playerId_competitionId: { playerId: item.player.id, competitionId: leagueId } },
  create: { playerId: item.player.id, competitionId: leagueId, currentPrice: INITIAL_PLAYER_PRICE },
  update: {},
});

// After:
const defaultPrice = POSITION_DEFAULT_PRICES[position] ?? INITIAL_PLAYER_PRICE;
await this.prisma.playerCompetitionPrice.upsert({
  where: { playerId_competitionId: { playerId: item.player.id, competitionId: leagueId } },
  create: { playerId: item.player.id, competitionId: leagueId, currentPrice: defaultPrice },
  update: {},  // never overwrite admin-adjusted prices on re-sync
});
```

Note: `update: {}` is intentional — prices are only seeded once. Admin can adjust via price-history mechanism.

- [ ] **Step 4: Remove the now-unused INITIAL_PLAYER_PRICE constant**

Remove line 50 in `bootstrap.processor.ts`:
```typescript
// Delete this line:
const INITIAL_PLAYER_PRICE = 5.0;
```

- [ ] **Step 5: Rebuild and TypeScript-check**

```bash
cd /Users/trung/fantasy
pnpm --filter @fantasy/shared build

cd /Users/trung/fantasy/.worktrees/fantasy-game/apps/api
pnpm exec tsc --noEmit
```
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
cd /Users/trung/fantasy/.worktrees/fantasy-game
git add packages/shared/src/constants/game.constants.ts
git add apps/api/src/modules/sync/bootstrap.processor.ts
git commit -m "feat(bootstrap): seed position-based default player prices (GK/DEF 4.5, MID 5.0, FWD 5.5)"
```

---

## Task 3: Set Total Mode competition inactive by default

`seedTotalModeCompetition` creates competition id=0 with `isActive: true`. This allows users to create a FantasyTeam in Total Mode (which is not yet implemented). `FantasyTeamsService.create` already checks `!competition.isActive` and throws, so setting `isActive: false` is the correct fix.

**Files:**
- Modify: `apps/api/src/modules/sync/bootstrap.processor.ts:362` (in `seedTotalModeCompetition`)

- [ ] **Step 1: Change isActive in seedTotalModeCompetition**

In `bootstrap.processor.ts`, in the `seedTotalModeCompetition` method (around line 355), change both `create` and `update`:
```typescript
// Before:
create: {
  ...
  isActive: true,   // ← change to false
},
update: { season, isActive: true },  // ← change to false

// After:
create: {
  id: TOTAL_MODE_COMPETITION_ID,
  realName: 'Total Mode',
  country: 'Europe',
  season,
  type: CompetitionType.TOTAL,
  leagueSlug: null,
  gwCount: 0,
  isActive: false,   // not yet implemented; block team creation
},
update: { season, isActive: false },
```

- [ ] **Step 2: TypeScript-check**

```bash
cd /Users/trung/fantasy/.worktrees/fantasy-game/apps/api
pnpm exec tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
cd /Users/trung/fantasy/.worktrees/fantasy-game
git add apps/api/src/modules/sync/bootstrap.processor.ts
git commit -m "fix(bootstrap): seed Total Mode competition as inactive until cross-league mode is built"
```

---

## Task 4: Re-bootstrap safety — force flag

Re-running bootstrap mid-season when users already have teams risks orphaning existing `PlayerPick` and `Transfer` rows (clubs/fixtures get re-upserted with potentially different IDs if API-Football data changes). Require an explicit `force: true` flag when `FantasyTeam` rows already exist.

**Files:**
- Modify: `apps/api/src/modules/admin/dto/bootstrap.dto.ts` (add `force` field)
- Modify: `apps/api/src/modules/sync/bootstrap.processor.ts` (guard check at top of `process`)

- [ ] **Step 1: Add force field to BootstrapDto**

In `apps/api/src/modules/admin/dto/bootstrap.dto.ts`:
```typescript
import { IsBoolean, IsInt, IsOptional, Min, Max } from 'class-validator';

export class BootstrapDto {
  @IsOptional()
  @IsInt()
  @Min(2020)
  @Max(2030)
  season?: number;

  /**
   * Set to true to allow re-bootstrap when fantasy teams already exist.
   * WARNING: re-bootstrap may orphan existing picks/transfers if player IDs change.
   */
  @IsOptional()
  @IsBoolean()
  force?: boolean;
}
```

- [ ] **Step 2: Pass force through to the job**

In `apps/api/src/modules/admin/admin.service.ts`, `triggerBootstrap`:
```typescript
// Before:
async triggerBootstrap(season?: number) {
  const job = await this.bootstrapQueue.add(JOB_BOOTSTRAP, { season }, ...);
  ...
}

// After:
async triggerBootstrap(season?: number, force?: boolean) {
  const job = await this.bootstrapQueue.add(JOB_BOOTSTRAP, { season, force }, ...);
  ...
}
```

Also update the controller call in `admin.controller.ts`:
```typescript
// Before:
triggerBootstrap(@Body() dto: BootstrapDto) {
  return this.adminService.triggerBootstrap(dto.season);
}

// After:
triggerBootstrap(@Body() dto: BootstrapDto) {
  return this.adminService.triggerBootstrap(dto.season, dto.force);
}
```

- [ ] **Step 3: Add guard at top of bootstrap.processor.ts process method**

The guard must be placed **before** `redis.delByPattern` so the cache is not blown when the bootstrap is rejected. Refactor the top of the `process` method to match this exact order:

```typescript
async process(job: Job) {
  if (job.name === JOB_PLAYER_SYNC) {
    const leagueId = job.data.leagueId as number;
    await this.seedPlayersForLeague(leagueId);
    return { success: true };
  }

  const requestedSeason = job.data.season as number | undefined;
  const force = job.data.force as boolean | undefined;

  // ① Safety guard FIRST — before clearing cache or touching the DB
  const teamCount = await this.prisma.fantasyTeam.count();
  if (teamCount > 0 && !force) {
    throw new Error(
      `Re-bootstrap blocked: ${teamCount} fantasy team(s) exist. ` +
      'Pass force=true to override (WARNING: may orphan existing picks/transfers).',
    );
  }
  if (teamCount > 0 && force) {
    this.logger.warn(`Force re-bootstrap with ${teamCount} existing fantasy teams — data integrity not guaranteed`);
  }

  // ② Only clear cache after guard passes
  this.logger.log(requestedSeason ? `Starting bootstrap for season ${requestedSeason}` : 'Starting bootstrap (auto-detecting season per league)');
  await this.redis.delByPattern('api_football:cache:*');
  this.logger.log('API-Football cache cleared');

  // ... rest of the method continues unchanged
```

- [ ] **Step 4: TypeScript-check**

```bash
cd /Users/trung/fantasy/.worktrees/fantasy-game/apps/api
pnpm exec tsc --noEmit
```
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
cd /Users/trung/fantasy/.worktrees/fantasy-game
git add apps/api/src/modules/admin/dto/bootstrap.dto.ts
git add apps/api/src/modules/admin/admin.service.ts
git add apps/api/src/modules/admin/admin.controller.ts
git add apps/api/src/modules/sync/bootstrap.processor.ts
git commit -m "feat(bootstrap): add force flag to prevent accidental re-bootstrap when teams exist"
```

---

## Task 5: Transaction wrapping for per-league seeding

If `seedClubs` or `seedFixturesAndGameweeks` fails partway through, the DB is left with some clubs or gameweeks written but not others. Wrap each league's entire seed operation in a Prisma interactive transaction with a generous timeout.

**Important:** Prisma's default interactive transaction timeout is 5s — far too short for 380+ upserts. Set `timeout: 60_000` (60 seconds per league).

**Files:**
- Modify: `apps/api/src/modules/sync/bootstrap.processor.ts` (refactor `seedLeague` and its helpers to accept a `tx` parameter)

- [ ] **Step 1: Understand the current call chain**

`seedLeague(leagueId, season)` calls:
1. `this.prisma.competition.upsert(...)` — 1 write
2. `seedClubs(leagueId, season)` — N upserts (one per club, ~20)
3. `seedFixturesAndGameweeks(leagueId, season)` — M upserts (one per GW + one per fixture, ~38 + 380)

All three must be inside the same transaction to be atomic.

- [ ] **Step 2: Add Prisma transaction type import**

At the top of `bootstrap.processor.ts`, add:
```typescript
import { Prisma } from '@prisma/client';
```

- [ ] **Step 3: Replace seedClubs with seedClubsFromData (accepts pre-fetched data + tx)**

Delete the existing `seedClubs` method and replace with `seedClubsFromData`. It takes already-fetched API data as a parameter — it must NOT call `this.apiFootball.get()` internally (that would run inside the transaction).

```typescript
private async seedClubsFromData(
  teamsData: ApiFootballResponse<ApiTeam>,
  leagueId: number,
  tx: Prisma.TransactionClient,
): Promise<void> {
  if (!teamsData.response.length) {
    this.logger.warn(`No teams found for league ${leagueId}`);
    return;
  }

  for (const item of teamsData.response) {
    await tx.club.upsert({
      where: { id: item.team.id },
      create: {
        id: item.team.id,
        realName: item.team.name,
        logoUrl: item.team.logo,
        competitionId: leagueId,
      },
      update: {
        realName: item.team.name,
        logoUrl: item.team.logo,
      },
    });
  }
}
```

- [ ] **Step 4: Replace seedFixturesAndGameweeks with seedFixturesFromData (accepts pre-fetched data + tx)**

Delete the existing `seedFixturesAndGameweeks` method and replace with `seedFixturesFromData`. Same rule — no API calls inside.

Also replace `markCurrentGameweek` to accept `tx` instead of `this.prisma`:

```typescript
private async seedFixturesFromData(
  fixturesData: ApiFootballResponse<ApiFixture>,
  leagueId: number,
  tx: Prisma.TransactionClient,
): Promise<void> {
  if (!fixturesData.response.length) {
    this.logger.warn(`No fixtures found for league ${leagueId}`);
    return;
  }

  // Group by round
  const roundMap = new Map<string, ApiFixture[]>();
  for (const f of fixturesData.response) {
    const round = f.league.round;
    if (!roundMap.has(round)) roundMap.set(round, []);
    roundMap.get(round)!.push(f);
  }

  // Sort rounds numerically
  const rounds = Array.from(roundMap.keys()).sort((a, b) => {
    const numA = parseInt(a.split(' - ').pop() ?? '0', 10) || 0;
    const numB = parseInt(b.split(' - ').pop() ?? '0', 10) || 0;
    return numA - numB;
  });

  for (let i = 0; i < rounds.length; i++) {
    const round = rounds[i];
    const gwNumber = i + 1;
    const fixtures = roundMap.get(round)!;

    const kickoffs = fixtures.map((f) => new Date(f.fixture.date).getTime());
    const earliest = new Date(Math.min(...kickoffs));
    const deadline = new Date(earliest.getTime() - DEADLINE_OFFSET_MINUTES * 60 * 1000);

    const gameweek = await tx.gameweek.upsert({
      where: { competitionId_number: { competitionId: leagueId, number: gwNumber } },
      create: { competitionId: leagueId, number: gwNumber, deadlineTime: deadline },
      update: { deadlineTime: deadline },
    });

    for (const f of fixtures) {
      await tx.fixture.upsert({
        where: { id: f.fixture.id },
        create: {
          id: f.fixture.id,
          competitionId: leagueId,
          gameweekId: gameweek.id,
          homeClubId: f.teams.home.id,
          awayClubId: f.teams.away.id,
          kickoffAt: new Date(f.fixture.date),
          status: f.fixture.status.short,
          homeGoals: f.goals.home,
          awayGoals: f.goals.away,
        },
        update: {
          status: f.fixture.status.short,
          homeGoals: f.goals.home,
          awayGoals: f.goals.away,
        },
      });
    }
  }

  await this.markCurrentGameweek(leagueId, tx);
}

private async markCurrentGameweek(
  competitionId: number,
  tx: Prisma.TransactionClient,
): Promise<void> {
  await tx.gameweek.updateMany({ where: { competitionId }, data: { isCurrent: false } });

  const firstScheduled = await tx.gameweek.findFirst({
    where: { competitionId, status: { not: 'FINISHED' } },
    orderBy: { number: 'asc' },
  });

  if (firstScheduled) {
    await tx.gameweek.update({ where: { id: firstScheduled.id }, data: { isCurrent: true } });
  }
}
```

- [ ] **Step 5: Replace seedLeague body to pre-fetch all data then transact**

The new `seedLeague` fetches ALL API data first (outside the transaction), then opens a single `prisma.$transaction` and calls the renamed helpers. This prevents holding a Postgres transaction open during HTTP calls:

```typescript
private async seedLeague(leagueId: number, season: number): Promise<void> {
  this.logger.log(`Seeding league ${leagueId}`);

  // ① Fetch all API data BEFORE opening the transaction
  const leagueData = await this.apiFootball.get<ApiFootballResponse<ApiLeague>>('/leagues', {
    id: leagueId,
    season,
  });
  if (!leagueData.response.length) {
    this.logger.warn(`No data for league ${leagueId}`);
    return;
  }

  const teamsData = await this.apiFootball.get<ApiFootballResponse<ApiTeam>>('/teams', {
    league: leagueId,
    season,
  });

  const fixturesData = await this.apiFootball.get<ApiFootballResponse<ApiFixture>>('/fixtures', {
    league: leagueId,
    season,
  });

  const { league, country: leagueCountry } = leagueData.response[0];
  const gwCount = LEAGUE_GW_COUNTS[leagueId] ?? 38;

  // ② All DB writes in a single atomic transaction (no HTTP calls inside)
  await this.prisma.$transaction(
    async (tx) => {
      await tx.competition.upsert({
        where: { id: leagueId },
        create: {
          id: leagueId,
          realName: league.name,
          country: leagueCountry.name,
          season,
          type: CompetitionType.LEAGUE,
          leagueSlug: LEAGUE_SLUGS[leagueId],
          gwCount,
          isActive: true,
        },
        update: { realName: league.name, country: leagueCountry.name, season, gwCount, isActive: true },
      });

      await this.seedClubsFromData(teamsData, leagueId, tx);
      await this.seedFixturesFromData(fixturesData, leagueId, tx);
    },
    { timeout: 60_000 },
  );

  this.logger.log(`League ${leagueId} seeded.`);
}

- [ ] **Step 6: TypeScript-check**

```bash
cd /Users/trung/fantasy/.worktrees/fantasy-game/apps/api
pnpm exec tsc --noEmit
```
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
cd /Users/trung/fantasy/.worktrees/fantasy-game
git add apps/api/src/modules/sync/bootstrap.processor.ts
git commit -m "feat(bootstrap): wrap per-league DB writes in a transaction (fetch API data first, then commit atomically)"
```

---

## Task 6: Structured error reporting

Currently bootstrap collects failures per league but throws a single merged error string at the end. BullMQ stores this error in the job's `failedReason` field. Admin has no structured data to inspect. Fix: return a structured result even on partial failure (don't throw), and log each failure with full detail.

**Files:**
- Modify: `apps/api/src/modules/sync/bootstrap.processor.ts` (change `process` return type)

- [ ] **Step 1: Change the job failure behavior**

In `bootstrap.processor.ts`, replace the end of the `process` method:
```typescript
// Before (throws, losing structure):
if (failures.length > 0) {
  const failedIds = failures.map((f) => f.leagueId).join(', ');
  this.logger.error(`Bootstrap completed with ${failures.length} failures: leagues [${failedIds}]`);
  throw new Error(`Bootstrap failed for leagues: ${failedIds}`);
}
this.logger.log('Bootstrap complete');
return { success: true };

// After (returns structured result; rethrows only if ALL leagues failed):
const succeeded = Object.values(LEAGUE_IDS).length - failures.length;
if (failures.length > 0) {
  this.logger.error(
    `Bootstrap completed: ${succeeded} leagues ok, ${failures.length} failed: ` +
    failures.map((f) => `${f.leagueId}(${f.error})`).join('; '),
  );
}
if (failures.length === Object.values(LEAGUE_IDS).length) {
  // All leagues failed — treat as full job failure so BullMQ marks it failed
  throw new Error(`All leagues failed during bootstrap: ${failures.map((f) => f.error).join('; ')}`);
}
this.logger.log(`Bootstrap complete (${succeeded} leagues, ${failures.length} failures)`);
return {
  success: failures.length === 0,
  succeeded,
  failures,
};
```

- [ ] **Step 2: TypeScript-check**

```bash
cd /Users/trung/fantasy/.worktrees/fantasy-game/apps/api
pnpm exec tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
cd /Users/trung/fantasy/.worktrees/fantasy-game
git add apps/api/src/modules/sync/bootstrap.processor.ts
git commit -m "fix(bootstrap): return structured failure list; only throw if all leagues fail"
```

---

## Task 7: API quota logging during bootstrap

Admins have no visibility into how many of their 100 daily API-Football requests the bootstrap consumed. `AdminService.getRateLimitStatus()` (and `ApiFootballClient.getDailyRequestCount()`) already exist — use them in the processor.

**Files:**
- Modify: `apps/api/src/modules/sync/bootstrap.processor.ts` (log before/after counts)

- [ ] **Step 1: Inject ApiFootballClient in BootstrapProcessor**

Check if `ApiFootballClient` is already injected — yes it is (line 58). Good.

- [ ] **Step 2: Add quota logging around the bootstrap loop**

In `bootstrap.processor.ts`, in the `process` method, add before and after the league loop:
```typescript
// Before the loop:
const countBefore = await this.apiFootball.getDailyRequestCount();
this.logger.log(`API-Football quota: ${countBefore}/95 requests used today before bootstrap`);

// ... existing league loop ...

// After the loop (before seedTotalModeCompetition):
const countAfter = await this.apiFootball.getDailyRequestCount();
this.logger.log(
  `API-Football quota: ${countAfter}/95 used after bootstrap (+${countAfter - countBefore} requests consumed)`,
);
```

- [ ] **Step 3: Verify getDailyRequestCount is public on ApiFootballClient**

Check `apps/api/src/infrastructure/api-football/api-football.client.ts` — if `getDailyRequestCount` is already exported (it's called from `AdminService.getRateLimitStatus`), no change needed. If it's private, make it public.

- [ ] **Step 4: TypeScript-check**

```bash
cd /Users/trung/fantasy/.worktrees/fantasy-game/apps/api
pnpm exec tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
cd /Users/trung/fantasy/.worktrees/fantasy-game
git add apps/api/src/modules/sync/bootstrap.processor.ts
git commit -m "feat(bootstrap): log API-Football quota usage before and after bootstrap"
```

---

## Task 8: Cache detectSeason results in Redis (24h)

`detectSeason` makes 2–4 API calls per league (1 for `/leagues?current=true`, 1–2 for `/teams` to verify). For 5 leagues without a `requestedSeason`, this is 10–20 requests just for season detection — before any real data is fetched. Cache the result per league for 24 hours.

**Files:**
- Modify: `apps/api/src/modules/sync/bootstrap.processor.ts` (wrap `detectSeason` body)

- [ ] **Step 1: Add cache key constant for season detection**

In `bootstrap.processor.ts`, add near the top (with other private constants):
```typescript
const SEASON_CACHE_TTL_SECONDS = 24 * 60 * 60; // 24 hours
```

- [ ] **Step 2: Wrap detectSeason body in Redis getOrSet**

Replace the `detectSeason` method body:
```typescript
private async detectSeason(leagueId: number): Promise<number> {
  const cacheKey = `bootstrap:season:${leagueId}`;

  const cached = await this.redis.get(cacheKey);
  if (cached) {
    const year = parseInt(cached, 10);
    this.logger.log(`Using cached season ${year} for league ${leagueId}`);
    return year;
  }

  const data = await this.apiFootball.get<ApiFootballResponse<ApiLeague>>('/leagues', {
    id: leagueId,
    current: true,
  });

  if (!data.response.length) {
    throw new Error(`Could not detect current season for league ${leagueId}`);
  }

  const currentYear = data.response[0].seasons.find((s) => s.current)?.year;
  if (!currentYear) {
    throw new Error(`No current season found for league ${leagueId}`);
  }

  for (const year of [currentYear, currentYear - 1]) {
    const teamsData = await this.apiFootball.get<ApiFootballResponse<{ team: { id: number } }>>('/teams', {
      league: leagueId,
      season: year,
    });
    if (teamsData.results > 0) {
      this.logger.log(`Auto-detected season ${year} for league ${leagueId} (current flagged: ${currentYear})`);
      await this.redis.set(cacheKey, String(year), SEASON_CACHE_TTL_SECONDS);
      return year;
    }
  }

  throw new Error(`No season with data found for league ${leagueId} (tried ${currentYear} and ${currentYear - 1})`);
}
```

- [ ] **Step 3: Verify RedisService has a get/set API**

Check `apps/api/src/infrastructure/redis/redis.service.ts` for `get(key)` and `set(key, value, ttl)` methods. If they exist (they should — used for caching elsewhere), no changes needed. The `delByPattern` is already called so `RedisService` is injectable and available.

- [ ] **Step 4: TypeScript-check**

```bash
cd /Users/trung/fantasy/.worktrees/fantasy-game/apps/api
pnpm exec tsc --noEmit
```
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
cd /Users/trung/fantasy/.worktrees/fantasy-game
git add apps/api/src/modules/sync/bootstrap.processor.ts
git commit -m "perf(bootstrap): cache detectSeason results in Redis for 24h to save API quota"
```

---

## Final Verification

- [ ] **Run full TypeScript check on both apps**

```bash
cd /Users/trung/fantasy
pnpm --filter @fantasy/shared build

cd /Users/trung/fantasy/.worktrees/fantasy-game/apps/api
pnpm exec tsc --noEmit

cd /Users/trung/fantasy/.worktrees/fantasy-game/apps/web
pnpm exec tsc --noEmit
```
Expected: 0 errors in both apps.

- [ ] **Check no regressions in existing tests**

```bash
cd /Users/trung/fantasy/.worktrees/fantasy-game/apps/api
pnpm test
```

- [ ] **Manual smoke test (with running API and test DB)**

```bash
# Start API
cd /Users/trung/fantasy/.worktrees/fantasy-game/apps/api
DATABASE_URL="postgresql://fantasy_user:fantasy_pass@localhost:5432/fantasy" \
REDIS_URL="redis://localhost:6379" \
JWT_SECRET="test-secret" JWT_REFRESH_SECRET="test-refresh-secret" \
PORT=3001 pnpm nest start &

# Attempt bootstrap without force (first time - should succeed):
curl -s -X POST http://localhost:3001/admin/sync/bootstrap \
  -H "Authorization: Bearer <admin-jwt>" \
  -H "Content-Type: application/json" \
  -d '{}' | jq .

# Check queue status:
curl -s http://localhost:3001/admin/sync/status \
  -H "Authorization: Bearer <admin-jwt>" | jq .

# Check rate limit usage:
curl -s http://localhost:3001/admin/sync/rate-limit \
  -H "Authorization: Bearer <admin-jwt>" | jq .
```

---

## Summary of Changes

| Task | File(s) | Impact |
|---|---|---|
| 1. Deadline constant | `game.constants.ts`, `bootstrap.processor.ts` | Correctness — deadline is now 2h before kickoff (FPL standard) |
| 2. Position pricing | `game.constants.ts`, `bootstrap.processor.ts` | Game balance — GK 4.5, DEF 4.5, MID 5.0, FWD 5.5 |
| 3. Total Mode inactive | `bootstrap.processor.ts` | Safety — blocks team creation in unimplemented mode |
| 4. Re-bootstrap force flag | `bootstrap.dto.ts`, `admin.service.ts`, `admin.controller.ts`, `bootstrap.processor.ts` | Operational safety — prevents accidental mid-season wipe |
| 5. Transactions | `bootstrap.processor.ts` | Data integrity — per-league writes are atomic |
| 6. Structured errors | `bootstrap.processor.ts` | Observability — partial failures are inspectable |
| 7. Quota logging | `bootstrap.processor.ts` | Observability — admins see API quota consumed |
| 8. detectSeason cache | `bootstrap.processor.ts` | Efficiency — saves 10–20 API requests on repeated runs |
