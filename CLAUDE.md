# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## Project Overview

Season-long FPL-style fantasy football game covering the top 5 European leagues (Premier League, La Liga, Serie A, Bundesliga, Ligue 1). Users manage a squad of 15 players, make weekly transfers, and earn points from real post-match player performances.

**Implementation status:** See `progress.md` for what is built vs. planned. All phases (1–5) are complete.

---

## Living Design Documents

**MANDATORY: Read ALL of these before starting any implementation task.** They are the authoritative source of truth and are updated after each implementation phase. Do not write a single line of code until you have re-read every document below in the current session.

| File | Contents |
|---|---|
| `game_design.md` | Game rules, scoring system, transfer accounting, chips, edge cases |
| `dev_design.md` | Tech stack, monorepo structure, docker setup, dev workflow, module map |
| `database.md` | Full Prisma schema, alias system, all indexes, migration notes |
| `api.md` | All REST endpoints, auth flow, sync pipeline, Redis cache strategy |
| `progress.md` | Phase-by-phase status, blocking issues, architecture decisions log |

**After completing any phase**, update the relevant design docs to reflect what was actually built (not the plan).

---

## Development Commands

```bash
# Infrastructure
docker compose up -d                          # Start Postgres + Redis

# From monorepo root
pnpm install                                  # Install all workspaces
pnpm --filter @fantasy/shared build           # Must run before apps/api can import shared

# Database (from apps/api/)
pnpm exec prisma migrate dev --name <desc>    # Create + apply migration
pnpm exec prisma migrate deploy               # Apply pending migrations (prod)
pnpm exec prisma studio                       # DB browser

# API (from apps/api/) — runs on port 3001
DATABASE_URL="postgresql://fantasy_user:fantasy_pass@localhost:5432/fantasy" \
REDIS_URL="redis://localhost:6379" \
JWT_SECRET="test-secret" JWT_REFRESH_SECRET="test-refresh-secret" \
PORT=3001 pnpm nest start

pnpm start:dev                                # With file watching (same env vars needed)
pnpm exec tsc --noEmit                        # TypeScript check (no emit)

# Frontend (from apps/web/) — proxies /api → localhost:3001
pnpm dev                                      # Vite dev server on :5173
pnpm build                                    # Production build + SSG pre-render
pnpm preview                                  # Preview production build
pnpm exec tsc --noEmit                        # TypeScript check

# Seed football data (once, requires running API + admin JWT)
# Step 1: seed competitions, clubs, fixtures/gameweeks (~15 API calls total)
curl -X POST http://localhost:3001/admin/sync/bootstrap \
  -H "Authorization: Bearer <admin-jwt>"
# Step 2: seed players per league (~40 API calls each — do one per day on free plan)
curl -X POST http://localhost:3001/admin/sync/players/39 \
  -H "Authorization: Bearer <admin-jwt>"   # 39=PL, 140=La Liga, 135=Serie A, 78=Bundesliga, 61=Ligue1
```

---

## Git Worktree Workflow

Active development happens in `.worktrees/fantasy-game/` — a git worktree on `feature/fantasy-game`. The `.worktrees/` directory is gitignored from the root.

```
/Users/trung/fantasy/           ← main repo (main branch)
  .worktrees/fantasy-game/      ← worktree (feature/fantasy-game branch)
```

```bash
# When feature is ready, create a PR:
cd /Users/trung/fantasy/.worktrees/fantasy-game
git push origin feature/fantasy-game
gh pr create --base main

# After PR is merged, pull it into main:
cd /Users/trung/fantasy
git pull

# Remove the worktree (after merge):
git worktree remove .worktrees/fantasy-game
```

---

## Quality Gates

Every `git push` runs two layers of checks:

**Shell pre-push hook** (`.git/hooks/pre-push`) — automated:
1. Linter (`pnpm lint` if script exists, else skipped)
2. TypeScript check (`pnpm exec tsc --noEmit`)

**Hookify rule** (`.claude/hookify.pre-push-checks.local.md`) — Claude-executed:
3. Security review: `pr-review-toolkit:silent-failure-hunter` agent on changed files
4. Code review: `pr-review-toolkit:code-reviewer` agent on changed files

Fix all CRITICAL/HIGH findings before proceeding with the push.

---

## Architecture

### Monorepo Structure

```
fantasy/
├── packages/shared/          # Shared TS types + constants (imported by both apps)
│   └── src/constants/scoring.constants.ts  # Single source of truth for all scoring rules
├── apps/api/                 # NestJS REST API + BullMQ workers
│   └── prisma/schema.prisma  # CRITICAL: written and migrated before any service code
└── apps/web/                 # React 19 + Vite 8 SPA (fully wired to real API)
```

### The Alias System (critical to understand)

Real club/player/competition names are **never exposed to users** (trademark safety). Every module that returns football data must resolve names through `AliasService` before serializing responses:

```typescript
// Wrong — leaks realName
return player;

// Always do this
return this.aliasService.resolvePlayer(player);
// Returns: { id, name: alias?.name ?? '[Unnamed]', position, price, isAliased: boolean }
```

- `realName` fields exist only for API-Football sync matching
- `*Alias` tables store admin-managed in-game display names
- `isAliased: false` signals the admin dashboard to flag the entity for naming

### NestJS Backend (`apps/api/`)

- `JwtAuthGuard` applied globally via `APP_GUARD`; `@Public()` decorator for open routes
- `RolesGuard` applied globally; `@Roles(Role.ADMIN)` for admin-only endpoints
- `GameweekOpenGuard` blocks picks/transfers after `Gameweek.deadlineTime`
- `RedisModule` is `@Global()` — `RedisService` is injectable everywhere without importing the module
- Infrastructure services: `PrismaService` (DB), `RedisService` (cache/queues), `ApiFootballClient` (rate-limited external API)
- All services with hot endpoints use `RedisService.getOrSet(key, ttlSeconds, fetchFn)` for caching

### Redis Cache Keys

| Key Pattern | TTL | Service |
|---|---|---|
| `players:list:{sha256(filters)}` | 300s | PlayersService |
| `players:{id}:{competitionId}` | 600s | PlayersService |
| `fixtures:gw:{gameweekId}` | 1800s | FixturesService |
| `gameweek:current:{competitionId}` | 120s | GameweeksService |
| `leaderboard:global:{compId}:{gwId}:{page}:{limit}` | 300s | LeaderboardService |
| `clubs:competition:{competitionId}` | 600s | ClubsService |
| `api_football:cache:{path}:{params}` | 3600s | ApiFootballClient |

### Sync Pipeline (BullMQ)

Data flows one-way from API-Football through a chain of jobs:

```
fixture-result-check (cron, 2h)
  → performance-sync (concurrency 2, per finished fixture)
    → gameweek-finalise (concurrency 1, when all fixtures done)
      → player-price-update (concurrency 1)

player-sync (admin-triggered, per league)   ← standalone, not part of the chain
```

`ScoringService.calculatePlayerPoints()` is the single source of truth for scoring, called inside `performance-sync`.


`player-sync` jobs run on the same `season-bootstrap` queue as `bootstrap` jobs. The `BootstrapProcessor.process()` dispatches by `job.name` to handle both. Bootstrap only seeds clubs/fixtures — players are seeded separately via `POST /admin/sync/players/:leagueId` to stay within the 100 req/day API-Football free plan limit.

### Frontend (`apps/web/`)

All four pages (SquadSelection, PlayerSelection, Fixtures, Leagues) are fully wired to the real API via TanStack Query hooks in `src/api/hooks/`.

**State management:**
- **TanStack Query**: all server state (players, picks, fixtures, leaderboard) — `src/api/hooks/`
- **Zustand `auth.store`** (persisted): `accessToken`, `refreshToken`, `user`, `fantasyTeamId`, `competitionId`, `budget`
- **Zustand `draft.store`** (ephemeral): in-progress transfer staging; cleared on confirm/cancel

**API client** (`src/api/client.ts`): axios instance with JWT Bearer interceptor + silent 401 refresh retry using a queue pattern to handle concurrent requests during token refresh.

**Design system:**
- Fonts: **Bangers** (`font-bangers`, display/headings) + **Nunito** (`font-nunito`, body)
- Colors: `game-bg` (#0b0f1e), `game-card` (#131929), `game-neon` (#00ff87), `game-gold` (#ffd60a), `game-fire` (#ff6b35), `game-sky` (#38bdf8)
- Reusable classes in `index.css`: `.game-card`, `.btn-primary`, `.btn-secondary`, `.pos-badge`, `.pos-gkp/def/mid/fwd`, `.pitch-bg`, `.scanlines`

**Responsive layout:**
- Mobile (< `lg`): top bar + bottom nav (`BottomNav`, `lg:hidden`, `fixed bottom-0`)
- Desktop (`lg:`+): fixed left sidebar (`Sidebar`, `w-64`); main content `lg:ml-64`
- Pages use `flex flex-col h-full` with `flex-1 overflow-y-auto` for inner scroll

**Error handling + loading:**
- `ErrorBoundary` class component wraps `AppShell` globally; each page also has a `QueryErrorResetBoundary` + `ErrorBoundary` so query errors show a per-page retry UI
- `Skeleton` primitive (`src/components/ui/Skeleton.tsx`) — `animate-pulse bg-white/5`; all pages show skeleton states during loading
- Skeleton guards are placed as **conditionals inside** the `ErrorBoundary` tree, not as early returns before it

**Landing page (`/`):**
- Public route, not protected; renders before the `/*` catch-all in `App.tsx`
- `react-helmet-async` (`HelmetProvider` in `main.tsx`) manages meta tags
- Vite `closeBundle` plugin in `vite.config.ts` pre-renders the landing page HTML into `dist/index.html` at build time (non-fatal on failure)

**`clubShort`** (3-letter code, e.g. `"ARS"`) is not returned by the API — derived client-side via `useClubsMap()` which returns `Map<clubId, shortName>` from `/clubs`. Used for jersey colors in `JerseyIcon.tsx` and fixture badge colors.

### Key Scoring Rules (single source of truth: `packages/shared/src/constants/scoring.constants.ts`)

- Playing 60+ min: 2pts; 1–59 min: 1pt
- Goals: GK 10pts, DEF 6pts, MID 5pts, FWD 4pts
- Assist: 3pts (all positions); Clean sheet: GK/DEF 4pts, MID 1pt
- Captain = 2× points; vice-captain takes over if captain played 0 minutes
- Auto-sub: 0-minute starters replaced by first eligible bench player (formation must remain valid)
- Extra transfer cost: −4pts each beyond the free allocation (1 per GW, bank max 2)

### API-Football Rate Limiting

Redis counter `api_football:requests:{date}` tracks daily usage. The `ApiFootballClient` throws `ServiceUnavailableException` at >95 requests and logs WARN at >80. All responses are cached for 60 minutes.
