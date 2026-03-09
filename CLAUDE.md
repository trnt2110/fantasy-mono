# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## Project Overview

Season-long FPL-style fantasy football game covering the top 5 European leagues (Premier League, La Liga, Serie A, Bundesliga, Ligue 1). Users manage a squad of 15 players, make weekly transfers, and earn points from real post-match player performances.

**Implementation status:** See `progress.md` for what is built vs. planned.

---

## Living Design Documents

**Always read these before starting any task.** They are the authoritative source of truth and are updated after each implementation phase:

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
docker-compose up -d                          # Start Postgres + Redis

# From monorepo root
npm install                                   # Install all workspaces

# Database (from apps/api/)
npx prisma migrate dev --name <description>   # Create + apply migration
npx prisma migrate deploy                     # Apply pending migrations (prod)
npx prisma studio                             # DB browser

# API (from apps/api/)
npm run start:dev                             # Start NestJS with file watching
npm run test                                  # Run all tests
npm run test -- --testPathPattern=auth        # Run single test file

# Frontend (from apps/web/)
npm run dev                                   # Start Vite dev server (port 5173)
npm run build                                 # Production build
npm run preview                               # Preview production build

# Seed football data (once, requires running API + admin JWT)
curl -X POST http://localhost:3000/admin/sync/bootstrap \
  -H "Authorization: Bearer <admin-jwt>"
```

---

## Architecture

### Monorepo Structure

```
fantasy/
├── packages/shared/          # Shared TS types + constants (imported by both apps)
├── apps/api/                 # NestJS REST API + BullMQ workers
│   └── prisma/schema.prisma  # CRITICAL: written and migrated before any service code
└── apps/web/                 # React + Vite SPA
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

- `JwtAuthGuard` applied globally; `@Public()` decorator for open routes
- `RolesGuard` + `@Roles(Role.ADMIN)` for admin-only endpoints
- `GameweekOpenGuard` blocks picks/transfers after `Gameweek.deadlineTime`
- All modules import `AliasModule` and call `AliasService` before returning responses
- Infrastructure services: `PrismaService` (DB), `RedisService` (cache/queues), `ApiFootballClient` (rate-limited external API)

### Sync Pipeline (BullMQ)

Data flows one-way from API-Football through a chain of jobs:

```
fixture-result-check (cron, 2h)
  → performance-sync (concurrency 2, per finished fixture)
    → gameweek-finalise (concurrency 1, when all fixtures done)
      → player-price-update (concurrency 1)
```

`ScoringService` is called inside `performance-sync` to calculate `totalPoints` and the `pointsBreakdown` JSON stored on `PlayerPerformance`.

### Frontend (`apps/web/`)

- **TanStack Query**: all server state (players, picks, scores, leaderboard)
- **Zustand `auth.store`**: access token + user info only
- **Zustand `draft.store`**: in-progress transfer staging (not persisted); cleared on confirm/cancel
- **`FormationViewer`**: pitch SVG rendering player slots from a formation string (`"4-4-2"`)
- **`GameweekOpenGuard`** equivalent on frontend: `DeadlineCountdown` disables submit buttons when `Gameweek.deadlineTime` passes

### Key Scoring Rules (single source of truth: `packages/shared/src/constants/scoring.constants.ts`)

- Playing 60+ min: 2pts; 1–59 min: 1pt
- Goals: GK 10pts, DEF 6pts, MID 5pts, FWD 4pts
- Assist: 3pts (all positions); Clean sheet: GK/DEF 4pts, MID 1pt
- Captain = 2× points; vice-captain takes over if captain played 0 minutes
- Auto-sub: 0-minute starters replaced by first eligible bench player (formation must remain valid)
- Extra transfer cost: −4pts each beyond the free allocation (1 per GW, bank max 2)

### API-Football Rate Limiting

Redis counter `api_football:requests:{date}` tracks daily usage. The `ApiFootballClient` throws `RateLimitException` at >95 requests and logs WARN at >80. All responses are cached for 60 minutes.

---

## Worktree

Active implementation is on branch `feature/fantasy-game` in `.worktrees/fantasy-game/`. The `.worktrees/` directory is gitignored.
