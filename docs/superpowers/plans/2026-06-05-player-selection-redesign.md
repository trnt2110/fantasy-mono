# Player Selection Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the broken 20-player flat list with a 2-col card grid that shows points, adds a club filter, and introduces separate browse/transfer modes.

**Architecture:** Backend fixes sort order and exposes `currentGwPoints`; frontend introduces `PlayerCard` + `PlayerStatsModal` components, rewrites `PlayerSelection.tsx` with mode detection via `draftStore.playerOut`, and adds a Transfer button to the existing `SquadSelection` player modal.

**Tech Stack:** NestJS/Prisma (API), React 19 + TanStack Query + Zustand (frontend), Tailwind CSS with custom game-* colours.

---

## File Map

| Action | Path | What changes |
|---|---|---|
| Modify | `apps/api/src/modules/players/players.service.ts` | Fix `orderBy`, add `currentGwPoints`, default limit 50 |
| Create | `apps/api/src/modules/players/players.service.spec.ts` | Unit tests for the above |
| Modify | `apps/web/src/api/types.ts` | Add `totalPoints`, `currentGwPoints` to `ApiPlayer` |
| Modify | `apps/web/src/api/hooks/usePlayers.ts` | Add `clubId` filter param |
| Create | `apps/web/src/components/ui/PlayerCard.tsx` | Card grid item |
| Create | `apps/web/src/components/ui/PlayerStatsModal.tsx` | Bottom-sheet stats modal |
| Modify | `apps/web/src/pages/PlayerSelection.tsx` | Full rewrite with modes + pagination |
| Modify | `apps/web/src/pages/SquadSelection.tsx` | Add Transfer button to PlayerModal |

---

## Task 1: Fix backend — sort, currentGwPoints, default limit

**Files:**
- Create: `apps/api/src/modules/players/players.service.spec.ts`
- Modify: `apps/api/src/modules/players/players.service.ts`

- [ ] **Step 1: Write the failing tests**

Create `apps/api/src/modules/players/players.service.spec.ts`:

```typescript
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
      makePlayer({ performances: [{ totalPoints: 12 }] }),
    ]);

    const result = await service.findAll({ competitionId: 1 });
    expect(result.data[0].currentGwPoints).toBe(12);
  });

  it('sets currentGwPoints to null when player has no performance this GW', async () => {
    prisma.gameweek.findFirst.mockResolvedValue({ id: 7 });
    prisma.player.findMany.mockResolvedValue([
      makePlayer({ performances: [] }),
    ]);

    const result = await service.findAll({ competitionId: 1 });
    expect(result.data[0].currentGwPoints).toBeNull();
  });

  it('sets currentGwPoints to null when no current gameweek exists', async () => {
    prisma.gameweek.findFirst.mockResolvedValue(null);
    prisma.player.findMany.mockResolvedValue([
      makePlayer({ performances: [] }),
    ]);

    const result = await service.findAll({ competitionId: 1 });
    expect(result.data[0].currentGwPoints).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd /Users/trung/fantasy/apps/api
pnpm test -- --testPathPattern=players.service
```

Expected: 5 failures — `orderBy: { id: 'asc' }` mismatches, `take: 20`, `currentGwPoints` missing.

- [ ] **Step 3: Implement the fixes in players.service.ts**

Replace the entire `findAll` method in `apps/api/src/modules/players/players.service.ts`:

```typescript
async findAll(dto: GetPlayersDto) {
  const { competitionId, position, clubId, minPrice, maxPrice, search, page = 1, limit = 50 } = dto;
  const cacheKey = `players:list:${createHash('sha256').update(JSON.stringify(dto)).digest('hex')}`;

  return this.redis.getOrSet(cacheKey, 300, async () => {
    const where = {
      isAvailable: true,
      ...(position && { position }),
      ...(clubId && { clubId }),
      ...(search && { alias: { name: { contains: search, mode: 'insensitive' as const } } }),
      competitionPrices: {
        some: {
          competitionId,
          ...(minPrice !== undefined && { currentPrice: { gte: minPrice } }),
          ...(maxPrice !== undefined && { currentPrice: { lte: maxPrice } }),
        },
      },
    };

    const currentGw = await this.prisma.gameweek.findFirst({
      where: { competitionId, isCurrent: true },
      select: { id: true },
    });

    const [players, total] = await Promise.all([
      this.prisma.player.findMany({
        where,
        include: {
          alias: true,
          club: { include: { alias: true } },
          competitionPrices: { where: { competitionId } },
          performances: {
            where: { gameweekId: currentGw?.id ?? 0 },
            select: { totalPoints: true },
          },
        },
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { totalPoints: 'desc' },
      }),
      this.prisma.player.count({ where }),
    ]);

    const data = players.map((p) => {
      const price = p.competitionPrices[0];
      const resolved = this.aliasService.resolvePlayer(p, price ? Number(price.currentPrice) : undefined);
      return {
        ...resolved,
        totalPoints: p.totalPoints,
        currentGwPoints: p.performances[0]?.totalPoints ?? null,
      };
    });

    return {
      data,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  });
}
```

- [ ] **Step 4: Run the tests to confirm they pass**

```bash
cd /Users/trung/fantasy/apps/api
pnpm test -- --testPathPattern=players.service
```

Expected: 5 tests pass.

- [ ] **Step 5: TypeScript check**

```bash
cd /Users/trung/fantasy/apps/api
pnpm exec tsc --noEmit
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/players/players.service.ts \
        apps/api/src/modules/players/players.service.spec.ts
git commit -m "feat(players): sort by totalPoints, add currentGwPoints, bump default limit to 50"
```

---

## Task 2: Extend ApiPlayer type and usePlayers hook

**Files:**
- Modify: `apps/web/src/api/types.ts`
- Modify: `apps/web/src/api/hooks/usePlayers.ts`

- [ ] **Step 1: Add totalPoints and currentGwPoints to ApiPlayer**

In `apps/web/src/api/types.ts`, replace the `ApiPlayer` interface:

```typescript
export interface ApiPlayer {
  id: number; name: string; position: 'GKP' | 'DEF' | 'MID' | 'FWD'
  clubId: number; clubName: string; currentPrice: number; isAvailable: boolean; isAliased: boolean
  totalPoints: number; currentGwPoints: number | null
}
```

- [ ] **Step 2: Add clubId to PlayerFilters in usePlayers.ts**

In `apps/web/src/api/hooks/usePlayers.ts`, replace the file:

```typescript
import { useQuery } from '@tanstack/react-query'
import { apiClient } from '../client'
import { useAuthStore } from '../../store/auth.store'
import type { ApiListResponse, ApiPlayer } from '../types'

export interface PlayerFilters {
  position?: string
  clubId?: number
  search?: string
  minPrice?: number
  maxPrice?: number
  page?: number
  limit?: number
}

const toApiPos = (p?: string) => p === 'GKP' ? 'GK' : p
const toClientPos = (p: string) => p === 'GK' ? 'GKP' : p

export function usePlayers(filters: PlayerFilters = {}) {
  const competitionId = useAuthStore(s => s.competitionId)
  return useQuery({
    queryKey: ['players', competitionId, filters],
    queryFn: async () => {
      const res = await apiClient.get<ApiListResponse<ApiPlayer>>('/players', {
        params: { competitionId, ...filters, position: toApiPos(filters.position) },
      })
      const list = res.data
      return { ...list, data: list.data.map(p => ({ ...p, position: toClientPos(p.position) })) }
    },
    staleTime: 5 * 60 * 1000,
    placeholderData: prev => prev,
  })
}

export function usePlayerDetail(playerId: number | null) {
  const competitionId = useAuthStore(s => s.competitionId)
  return useQuery({
    queryKey: ['player', playerId, competitionId],
    queryFn: async () => {
      const res = await apiClient.get(`/players/${playerId}`, { params: { competitionId } })
      return res.data
    },
    enabled: playerId !== null,
    staleTime: 10 * 60 * 1000,
  })
}
```

- [ ] **Step 3: TypeScript check**

```bash
cd /Users/trung/fantasy/apps/web
pnpm exec tsc --noEmit
```

Expected: no errors (or only errors in files that reference `ApiPlayer` without `totalPoints` — those will be fixed in later tasks).

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/api/types.ts apps/web/src/api/hooks/usePlayers.ts
git commit -m "feat(players): add totalPoints + currentGwPoints to ApiPlayer, add clubId filter"
```

---

## Task 3: PlayerCard component

**Files:**
- Create: `apps/web/src/components/ui/PlayerCard.tsx`

- [ ] **Step 1: Create the component**

Create `apps/web/src/components/ui/PlayerCard.tsx`:

```tsx
import { JerseyIcon } from './JerseyIcon'
import { PosBadge } from './PosBadge'
import type { ApiPlayer } from '../../api/types'

interface PlayerCardProps {
  player: ApiPlayer
  clubShort: string
  isInSquad: boolean
  isTransferMode: boolean
  isAffordable?: boolean
  onTap: (player: ApiPlayer) => void
}

export function PlayerCard({
  player, clubShort, isInSquad, isTransferMode, isAffordable = true, onTap,
}: PlayerCardProps) {
  const disabled = isTransferMode && !isAffordable

  return (
    <div
      onClick={() => !disabled && onTap(player)}
      className={`relative rounded-xl p-3 border transition-colors select-none
        ${isInSquad
          ? 'bg-game-neon/5 border-game-neon/45 cursor-pointer'
          : disabled
            ? 'bg-game-card border-game-border opacity-50 cursor-not-allowed'
            : 'bg-game-card border-game-border hover:border-game-neon/30 cursor-pointer'
        }`}
    >
      {isInSquad && (
        <div className="absolute top-1.5 right-1.5 bg-game-neon text-black text-[9px] font-black px-1.5 py-0.5 rounded leading-none">
          IN SQUAD
        </div>
      )}

      <div className="mb-2">
        <JerseyIcon clubShort={clubShort} position={player.position} size="sm" />
      </div>

      <div className={`font-bold text-[11px] truncate mb-0.5 ${isInSquad ? 'text-game-neon' : 'text-slate-100'}`}>
        {player.name}
      </div>
      <div className="flex items-center gap-1 mb-2">
        <span className="text-slate-500 text-[9px] truncate max-w-[70px]">{player.clubName}</span>
        <PosBadge pos={player.position} />
      </div>

      <div className="flex justify-between items-end">
        <div>
          <div className="text-slate-100 font-bold text-[14px] leading-none">{player.totalPoints}</div>
          <div className="text-slate-500 text-[8px] uppercase mt-0.5">PTS</div>
        </div>
        <div className="text-right">
          <div className="text-game-gold text-[10px] font-bold leading-none">£{player.currentPrice.toFixed(1)}</div>
          {player.currentGwPoints != null && (
            <div className="text-slate-500 text-[8px] mt-0.5">GW:{player.currentGwPoints}</div>
          )}
        </div>
      </div>

      {isTransferMode && disabled && (
        <div className="mt-2 bg-game-red/10 border border-game-red/30 rounded text-center py-1 text-game-red text-[9px] font-bold">
          Too expensive
        </div>
      )}
      {isTransferMode && !disabled && !isInSquad && (
        <div className="mt-2 bg-game-neon/10 border border-game-neon/30 rounded text-center py-1 text-game-neon text-[9px] font-bold">
          ✓ Select
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: TypeScript check**

```bash
cd /Users/trung/fantasy/apps/web
pnpm exec tsc --noEmit
```

Expected: no errors from the new file.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/ui/PlayerCard.tsx
git commit -m "feat(ui): add PlayerCard component for 2-column player grid"
```

---

## Task 4: PlayerStatsModal component

**Files:**
- Create: `apps/web/src/components/ui/PlayerStatsModal.tsx`

- [ ] **Step 1: Create the component**

Create `apps/web/src/components/ui/PlayerStatsModal.tsx`:

```tsx
import { usePlayerDetail, usePlayerPerformances } from '../../api/hooks'
import { JerseyIcon } from './JerseyIcon'
import { PosBadge } from './PosBadge'
import type { ApiPlayer } from '../../api/types'

interface PlayerStatsModalProps {
  player: ApiPlayer
  clubShort: string
  onClose: () => void
}

export function PlayerStatsModal({ player, clubShort, onClose }: PlayerStatsModalProps) {
  const { data: detail } = usePlayerDetail(player.id)
  const { data: performances = [] } = usePlayerPerformances(player.id)

  const maxPts = Math.max(...performances.map(p => p.totalPoints), 1)
  const totalGoals = performances.reduce((s, p) => s + p.goalsScored, 0)
  const totalAssists = performances.reduce((s, p) => s + p.assists, 0)

  return (
    <div className="fixed inset-0 z-50 flex items-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative w-full bg-game-card rounded-t-2xl max-h-[85vh] overflow-y-auto anim-slide-up"
        onClick={e => e.stopPropagation()}
      >
        {/* Drag handle */}
        <div className="pt-3 pb-1 flex justify-center">
          <div className="w-8 h-1 bg-white/20 rounded-full" />
        </div>

        {/* Header */}
        <div className="flex gap-4 items-center px-5 pt-2 pb-4 border-b border-game-border/50">
          <div className="anim-float">
            <JerseyIcon clubShort={clubShort} position={player.position} size="lg" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-bangers text-2xl tracking-wider text-white truncate">{player.name}</div>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-slate-400 text-sm truncate">{player.clubName}</span>
              <PosBadge pos={player.position} />
            </div>
            <div className="text-game-gold font-bold text-sm mt-1">£{player.currentPrice.toFixed(1)}m</div>
          </div>
          <div className="flex flex-col gap-2 flex-shrink-0">
            <div className="bg-white/5 rounded-xl px-3 py-2 text-center border border-white/5">
              <div className="font-bangers text-2xl text-game-neon leading-none">{player.totalPoints}</div>
              <div className="text-[9px] text-slate-500 mt-0.5 uppercase tracking-wide">Total Pts</div>
            </div>
            <div className="bg-white/5 rounded-xl px-3 py-2 text-center border border-white/5">
              <div className="font-bangers text-xl text-game-gold leading-none">
                {player.currentGwPoints ?? '—'}
              </div>
              <div className="text-[9px] text-slate-500 mt-0.5 uppercase tracking-wide">GW Pts</div>
            </div>
          </div>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-3 divide-x divide-game-border/50 border-b border-game-border/50">
          {[
            { label: 'Own%', value: detail?.ownershipPct != null ? `${detail.ownershipPct.toFixed(1)}%` : '—' },
            { label: 'Goals', value: totalGoals },
            { label: 'Assists', value: totalAssists },
          ].map(({ label, value }) => (
            <div key={label} className="py-3 text-center">
              <div className="font-bold text-slate-100 text-base">{value}</div>
              <div className="text-[10px] text-slate-500 mt-0.5">{label}</div>
            </div>
          ))}
        </div>

        {/* GW bar chart */}
        {performances.length > 0 && (
          <div className="px-5 py-4">
            <div className="text-[10px] text-slate-500 font-bangers tracking-widest mb-3">FORM BY GAMEWEEK</div>
            <div className="flex items-end gap-1.5 h-12">
              {performances.map(perf => (
                <div key={perf.gameweekId} className="flex-1 flex flex-col items-center justify-end">
                  <div
                    className="w-full bg-game-sky/70 rounded-t"
                    style={{ height: `${Math.max((perf.totalPoints / maxPts) * 48, 3)}px` }}
                  />
                </div>
              ))}
            </div>
            <div className="flex gap-1.5 mt-1">
              {performances.map(perf => (
                <div key={perf.gameweekId} className="flex-1 text-center text-[7px] text-slate-600">
                  {perf.gameweekNumber}
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="px-5 pb-8">
          <button onClick={onClose} className="w-full btn-secondary py-3 font-bold">
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: TypeScript check**

```bash
cd /Users/trung/fantasy/apps/web
pnpm exec tsc --noEmit
```

Expected: no errors from the new file.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/ui/PlayerStatsModal.tsx
git commit -m "feat(ui): add PlayerStatsModal bottom sheet with GW bar chart"
```

---

## Task 5: Rewrite PlayerSelection page

**Files:**
- Modify: `apps/web/src/pages/PlayerSelection.tsx`

- [ ] **Step 1: Replace the entire file**

Replace all content of `apps/web/src/pages/PlayerSelection.tsx`:

```tsx
import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { QueryErrorResetBoundary } from '@tanstack/react-query'
import { useDraftStore } from '../store/draft.store'
import { useClubs, useClubsMap, usePlayers, useGwPicks, useMyFantasyTeam, useCurrentGameweek, usePlayerDetail } from '../api/hooks'
import type { ApiPlayer } from '../api/types'
import { PlayerCard } from '../components/ui/PlayerCard'
import { PlayerStatsModal } from '../components/ui/PlayerStatsModal'
import { Skeleton } from '../components/ui/Skeleton'
import { ErrorBoundary } from '../components/ErrorBoundary'

type Position = 'GKP' | 'DEF' | 'MID' | 'FWD'
const POSITIONS: Position[] = ['GKP', 'DEF', 'MID', 'FWD']

export function PlayerSelection() {
  const navigate = useNavigate()
  const { playerOut: draftPlayerOut, setPlayerIn, setPlayerOut: setDraftPlayerOut } = useDraftStore()
  const isTransferMode = !!draftPlayerOut

  const clubsMap = useClubsMap()
  const { data: clubs = [] } = useClubs()
  const { data: gw } = useCurrentGameweek()
  const { data: team } = useMyFantasyTeam()
  const { data: picks = [] } = useGwPicks(gw?.id)

  // Get sell price of player being transferred out to calculate available budget
  const { data: playerOutDetail } = usePlayerDetail(draftPlayerOut?.playerId ?? null)
  const budget = team?.budget ?? 0
  const availableBudget = isTransferMode ? budget + (playerOutDetail?.currentPrice ?? 0) : budget

  const [search, setSearch] = useState('')
  const [posFilter, setPosFilter] = useState<Position | 'ALL'>(
    draftPlayerOut ? (draftPlayerOut.position as Position) : 'ALL'
  )
  const [clubId, setClubId] = useState<number | undefined>(undefined)
  const [sortByPrice, setSortByPrice] = useState(false)
  const [limit, setLimit] = useState(50)
  const [selectedPlayer, setSelectedPlayer] = useState<ApiPlayer | null>(null)

  const pickedIds = useMemo(() => new Set(picks.map(p => p.playerId)), [picks])

  const filterParams = useMemo(() => ({
    position: posFilter !== 'ALL' ? posFilter : undefined,
    clubId,
    search: search || undefined,
    limit,
  }), [posFilter, clubId, search, limit])

  const { data: playersResponse, isLoading } = usePlayers(filterParams)
  const rawPlayers = playersResponse?.data ?? []
  const meta = playersResponse?.meta

  const players = useMemo(() => {
    if (sortByPrice) return [...rawPlayers].sort((a, b) => b.currentPrice - a.currentPrice)
    return rawPlayers
  }, [rawPlayers, sortByPrice])

  const hasMore = meta ? meta.total > limit : false

  function handleCardTap(player: ApiPlayer) {
    if (isTransferMode) {
      if (player.currentPrice > availableBudget) return
      setPlayerIn(player)
      navigate('/squad')
    } else {
      setSelectedPlayer(player)
    }
  }

  function cancelTransfer() {
    setDraftPlayerOut(null)
    navigate('/squad')
  }

  const filterBar = (
    <div className="flex flex-wrap gap-2 items-center">
      {/* Search */}
      <div className="relative flex-1 min-w-[140px]">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-xs">🔍</span>
        <input
          type="text"
          placeholder="Name…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full bg-game-card border border-game-border rounded-xl
            pl-8 pr-3 py-2 text-sm text-slate-100 placeholder-slate-600
            focus:outline-none focus:border-game-neon transition-all font-nunito"
        />
      </div>
      {/* Position pills */}
      <div className="flex gap-1">
        {(['ALL', ...POSITIONS] as const).map(pos => (
          <button
            key={pos}
            onClick={() => setPosFilter(pos)}
            className={`font-bangers tracking-wider text-xs px-2.5 py-1.5 rounded-lg transition-all
              ${posFilter === pos
                ? 'bg-game-purple text-white'
                : 'bg-game-card border border-game-border text-slate-400 hover:border-game-purple/50'
              }`}
          >
            {pos}
          </button>
        ))}
      </div>
      {/* Club dropdown */}
      <select
        value={clubId ?? ''}
        onChange={e => setClubId(e.target.value ? Number(e.target.value) : undefined)}
        className="bg-game-card border border-game-border text-slate-300 text-sm
          px-3 py-2 rounded-xl focus:outline-none font-nunito cursor-pointer
          focus:border-game-neon transition-all"
      >
        <option value="">All Clubs</option>
        {clubs.map(c => (
          <option key={c.id} value={c.id}>{c.name}</option>
        ))}
      </select>
      {/* Sort toggle */}
      <button
        onClick={() => setSortByPrice(v => !v)}
        className={`text-xs font-bold px-3 py-2 rounded-xl border transition-all
          ${sortByPrice
            ? 'bg-game-sky/15 text-game-sky border-game-sky/30'
            : 'bg-game-card border-game-border text-slate-400 hover:border-game-sky/30'
          }`}
      >
        {sortByPrice ? '£ ↓' : 'Pts ↓'}
      </button>
    </div>
  )

  const cardGrid = (
    <>
      <div className="grid grid-cols-2 gap-3">
        {isLoading
          ? Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-32 rounded-xl" />
            ))
          : players.map(p => (
              <PlayerCard
                key={p.id}
                player={p}
                clubShort={clubsMap.get(p.clubId) ?? p.clubName.slice(0, 3).toUpperCase()}
                isInSquad={pickedIds.has(p.id)}
                isTransferMode={isTransferMode}
                isAffordable={p.currentPrice <= availableBudget}
                onTap={handleCardTap}
              />
            ))
        }
      </div>
      {hasMore && !isLoading && (
        <button
          onClick={() => setLimit(l => l + 50)}
          className="w-full mt-4 py-3 rounded-xl border border-game-border text-slate-400
            hover:text-game-sky hover:border-game-sky/30 text-sm font-bold transition-all"
        >
          ↓ Load more ({meta!.total - players.length} more)
        </button>
      )}
    </>
  )

  return (
    <QueryErrorResetBoundary>
      {({ reset }) => (
        <ErrorBoundary
          fallback={
            <div className="flex flex-col items-center justify-center h-full gap-4 p-8">
              <div className="text-5xl">⚠️</div>
              <p className="text-slate-400 text-sm">Failed to load players.</p>
              <button className="btn-primary" onClick={reset}>Retry</button>
            </div>
          }
        >
          <div className="flex flex-col h-full">

            {/* Transfer mode banner */}
            {isTransferMode && draftPlayerOut && (
              <div className="flex-shrink-0 flex items-center gap-3 px-5 py-3
                bg-game-gold/10 border-b-2 border-game-gold/40">
                <span className="text-xl">🔄</span>
                <div className="flex-1 min-w-0">
                  <div className="font-bangers tracking-wider text-game-gold text-base leading-none">
                    REPLACING {draftPlayerOut.playerName.toUpperCase()}
                  </div>
                  <div className="text-slate-400 text-xs mt-0.5">
                    {draftPlayerOut.position} · Budget: £{availableBudget.toFixed(1)}m
                  </div>
                </div>
                <button
                  onClick={cancelTransfer}
                  className="text-slate-500 hover:text-game-red text-xl font-bold transition-colors flex-shrink-0"
                >
                  ✕
                </button>
              </div>
            )}

            {/* Header */}
            {!isTransferMode && (
              <div className="flex-shrink-0 px-5 pt-4 pb-3 border-b border-game-border/50">
                <div className="flex items-center justify-between">
                  <div>
                    <h1 className="font-bangers text-3xl lg:text-4xl tracking-widest text-white leading-none">
                      PLAYERS
                    </h1>
                    <p className="text-slate-400 text-sm mt-0.5">
                      {meta ? `${meta.total} players` : 'Browse & scout'}
                    </p>
                  </div>
                  <div className="game-card px-3 py-1.5 text-center">
                    <div className="font-bangers text-xl text-game-gold leading-none">
                      £{budget.toFixed(1)}m
                    </div>
                    <div className="text-xs text-slate-500 font-medium">budget</div>
                  </div>
                </div>
              </div>
            )}

            {/* ── DESKTOP layout ──────────────────────────── */}
            <div className="hidden lg:grid lg:flex-1 lg:overflow-hidden"
              style={{ flex: 1, gridTemplateColumns: '280px 1fr' }}>
              {/* Sidebar */}
              <div className="overflow-y-auto p-4 border-r border-game-border/50 flex flex-col gap-4">
                <div className="flex flex-col gap-3">
                  {/* Search */}
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-xs">🔍</span>
                    <input
                      type="text"
                      placeholder="Name…"
                      value={search}
                      onChange={e => setSearch(e.target.value)}
                      className="w-full bg-game-card border border-game-border rounded-xl
                        pl-8 pr-3 py-2.5 text-sm text-slate-100 placeholder-slate-600
                        focus:outline-none focus:border-game-neon transition-all font-nunito"
                    />
                  </div>
                  {/* Position */}
                  <div>
                    <div className="text-xs text-slate-500 font-medium tracking-wider uppercase mb-1.5">Position</div>
                    <div className="grid grid-cols-5 gap-1">
                      {(['ALL', ...POSITIONS] as const).map(pos => (
                        <button
                          key={pos}
                          onClick={() => setPosFilter(pos)}
                          className={`font-bangers tracking-wider text-xs py-2 rounded-lg transition-all
                            ${posFilter === pos
                              ? 'bg-game-purple text-white shadow-[0_0_10px_rgba(168,85,247,0.4)]'
                              : 'bg-game-card border border-game-border text-slate-400 hover:border-game-purple/50'
                            }`}
                        >
                          {pos}
                        </button>
                      ))}
                    </div>
                  </div>
                  {/* Club */}
                  <div>
                    <div className="text-xs text-slate-500 font-medium tracking-wider uppercase mb-1.5">Club</div>
                    <select
                      value={clubId ?? ''}
                      onChange={e => setClubId(e.target.value ? Number(e.target.value) : undefined)}
                      className="w-full bg-game-card border border-game-border text-slate-300 text-sm
                        px-3 py-2.5 rounded-xl focus:outline-none font-nunito cursor-pointer
                        focus:border-game-neon transition-all"
                    >
                      <option value="">All Clubs</option>
                      {clubs.map(c => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </div>
                  {/* Sort */}
                  <div>
                    <div className="text-xs text-slate-500 font-medium tracking-wider uppercase mb-1.5">Sort by</div>
                    <div className="flex flex-col gap-1">
                      {[
                        { label: '🏆 Total Points', value: false },
                        { label: '💰 Price', value: true },
                      ].map(opt => (
                        <button
                          key={String(opt.value)}
                          onClick={() => setSortByPrice(opt.value)}
                          className={`text-left px-3 py-2 rounded-xl text-sm font-bold transition-all
                            ${sortByPrice === opt.value
                              ? 'bg-game-sky/15 text-game-sky border border-game-sky/30'
                              : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
                            }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  {/* Reset */}
                  <button
                    onClick={() => { setSearch(''); setPosFilter('ALL'); setClubId(undefined); setSortByPrice(false) }}
                    className="w-full text-center py-2 rounded-xl text-slate-500 hover:text-game-red
                      border border-game-border/50 hover:border-game-red/30 text-sm font-bold transition-all"
                  >
                    Reset filters ↺
                  </button>
                </div>
                {meta && (
                  <div className="text-center text-xs text-slate-500 mt-auto">
                    <span className="text-game-sky font-bold">{meta.total}</span> players total
                  </div>
                )}
              </div>
              {/* Card grid */}
              <div className="overflow-y-auto p-4">
                {cardGrid}
              </div>
            </div>

            {/* ── MOBILE layout ────────────────────────────── */}
            <div className="lg:hidden flex flex-col flex-1 overflow-hidden">
              <div className="flex-shrink-0 px-4 pt-3 pb-2">
                {filterBar}
              </div>
              <div className="flex-1 overflow-y-auto px-4 pb-24">
                {cardGrid}
              </div>
            </div>

          </div>

          {/* Player stats modal (browse mode) */}
          {selectedPlayer && !isTransferMode && (
            <PlayerStatsModal
              player={selectedPlayer}
              clubShort={clubsMap.get(selectedPlayer.clubId) ?? selectedPlayer.clubName.slice(0, 3).toUpperCase()}
              onClose={() => setSelectedPlayer(null)}
            />
          )}
        </ErrorBoundary>
      )}
    </QueryErrorResetBoundary>
  )
}
```

- [ ] **Step 2: TypeScript check**

```bash
cd /Users/trung/fantasy/apps/web
pnpm exec tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/pages/PlayerSelection.tsx
git commit -m "feat(players): rewrite PlayerSelection with card grid, browse/transfer modes, club filter"
```

---

## Task 6: Wire Transfer button in SquadSelection

**Files:**
- Modify: `apps/web/src/pages/SquadSelection.tsx`

- [ ] **Step 1: Add useNavigate and useDraftStore imports**

In `apps/web/src/pages/SquadSelection.tsx`, add to the existing imports at the top:

```typescript
import { useNavigate } from 'react-router-dom'
import { useDraftStore } from '../store/draft.store'
```

The existing imports block starts with:
```typescript
import { useState, useMemo } from 'react'
import { QueryErrorResetBoundary } from '@tanstack/react-query'
```

Add the two new imports after `from '@tanstack/react-query'`:
```typescript
import { useState, useMemo } from 'react'
import { QueryErrorResetBoundary } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { useDraftStore } from '../store/draft.store'
```

- [ ] **Step 2: Add Transfer button to PlayerModal**

Inside the `PlayerModal` function body (after `const showToast` and before the `return`), add:

```typescript
const navigate = useNavigate()
const { setPlayerOut: setDraftPlayerOut } = useDraftStore()

function handleTransfer() {
  setDraftPlayerOut(pick)
  onClose()
  navigate('/players')
}
```

Then, after the existing captain button inside the modal JSX (after the `<button onClick={handleCaptain} ...>` block and before the deadline paragraph), add:

```tsx
{!isPastDeadline && (
  <button
    onClick={handleTransfer}
    className="w-full py-2.5 mt-2 btn-secondary"
  >
    🔄 TRANSFER OUT
  </button>
)}
```

The full button block at the bottom of the modal should look like:

```tsx
<button
  onClick={handleCaptain}
  disabled={submitPicks.isPending || isAlreadyCaptain || isBenchPlayer}
  className={`w-full py-2.5 ${isAlreadyCaptain || isBenchPlayer ? 'btn-secondary opacity-50' : 'btn-primary'}`}
>
  {submitPicks.isPending ? '...' : isAlreadyCaptain ? '👑 CAPTAIN ✓' : '👑 MAKE CAPTAIN'}
</button>
{!isPastDeadline && (
  <button
    onClick={handleTransfer}
    className="w-full py-2.5 mt-2 btn-secondary"
  >
    🔄 TRANSFER OUT
  </button>
)}
{isPastDeadline && (
  <p className="text-center text-xs text-game-red mt-3 font-medium">
    Deadline passed — picks locked
  </p>
)}
```

- [ ] **Step 3: TypeScript check**

```bash
cd /Users/trung/fantasy/apps/web
pnpm exec tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/pages/SquadSelection.tsx
git commit -m "feat(squad): add Transfer Out button to player modal, navigates to players page with context"
```

---

## Task 7: Verify end-to-end

- [ ] **Step 1: Start the API**

```bash
cd /Users/trung/fantasy/apps/api
pnpm start:dev
```

Wait until `Nest application successfully started`.

- [ ] **Step 2: Start the frontend**

```bash
cd /Users/trung/fantasy/apps/web
pnpm dev
```

- [ ] **Step 3: Verify browse mode**

1. Open `http://localhost:5173` and log in
2. Click **Players** in the sidebar
3. Confirm: card grid visible, each card shows a points number and price
4. Confirm: IN SQUAD badge appears on players in your team
5. Confirm: Club dropdown populated with clubs
6. Change sort to £ — cards reorder by price
7. Tap any card (not in squad) — stats modal slides up with bar chart
8. Close modal by tapping backdrop

- [ ] **Step 4: Verify transfer mode**

1. Click **My Squad** in sidebar
2. Click any player on the pitch — modal opens
3. Click **🔄 TRANSFER OUT**
4. Confirm: redirected to Players page with yellow banner "REPLACING [Name]"
5. Confirm: position pill is pre-filtered to that player's position
6. Confirm: over-budget players show "Too expensive" in red
7. Tap an affordable player — confirm: returns to My Squad with player staged for transfer
8. Click ✕ on the transfer banner instead — confirm: returns to My Squad with no transfer staged

- [ ] **Step 5: Run full test suite**

```bash
cd /Users/trung/fantasy/apps/api
pnpm test
```

Expected: all tests pass including the 5 new players.service tests.
