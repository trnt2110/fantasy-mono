# Fantasy Football Game — Implementation Progress

> Updated at the end of each phase. Blocking issues logged here.

---

## Phase Status

| Phase | Status | Branch | Notes |
|---|---|---|---|
| **Phase 0** — Documentation Bootstrap | ✅ Done | feature/fantasy-game | All 5 design docs created; design decisions updated 2026-03-10 |
| **Phase 1** — Foundation | ✅ Done | feature/fantasy-game | Monorepo (pnpm), auth, prisma, api-football client, alias system |
| **Phase 2** — Core Game Logic | ✅ Done | feature/fantasy-game | Competitions/Clubs/Players/Fixtures/Gameweeks modules; FantasyTeams squad creation; Picks + GameweekOpenGuard; Transfers + wildcard; ScoringService |
| **Phase 3** — Sync Pipeline + Leaderboard | 🔲 Not started | — | BullMQ jobs, leaderboard, mini-leagues |
| **Phase 4** — Frontend | 🔲 Not started | — | React SPA |
| **Phase 5** — Polish + SEO | 🔲 Not started | — | Caching, SEO, deadline countdown |

---

## Phase 0 — Documentation Bootstrap ✅

**Completed:** 2026-03-10 (refined from 2026-03-09)

Files created:
- [x] `game_design.md` — game rules, scoring, transfers, chips, edge cases
- [x] `dev_design.md` — tech stack, monorepo layout, docker, dev workflow
- [x] `database.md` — full Prisma schema, alias system, indexes, migration notes
- [x] `api.md` — all REST endpoints, auth flow, sync pipeline, cache strategy
- [x] `progress.md` — this file

Open design questions resolved in docs:
- Deadline = 1.5h before first fixture kickoff (auto-seeded by bootstrap)
- PlayerPerformance written for ALL squad members including 0-minute players
- Price change threshold: 2% of active teams triggers ±0.1m
- Multi-season: `@@unique([userId, competitionId])` is correct (new season = new Competition record)
- Soft delete: `isAvailable = false` for players; fixtures/gameweeks never deleted
- Blank-GW PlayerPerformance: `fixtureId = null`; uniqueness enforced via raw SQL partial index in migration
- Independent price markets: `PlayerCompetitionPrice(playerId, competitionId)` — each competition has its own market
- Wildcard chip tracking: `ChipActivation.halfSeason` (1 or 2) + `@@unique([fantasyTeamId, chip, halfSeason])`
- Total mode clubs: `Competition(type=TOTAL).clubs` is empty; total mode selects from all 5 leagues' clubs

Docs reviewed and confirmed consistent: 2026-03-10

---

## Phase 1 — Foundation ✅

**Completed:** 2026-03-10

**Goal:** Runnable monorepo with auth, database, and API-Football client.

Tasks:
- [x] 1. Init monorepo (pnpm workspaces), docker-compose.yml, .env.example
- [x] 2. `packages/shared` — scoring constants, leagues constants, game constants, shared TS types
- [x] 3. NestJS bootstrap — ConfigModule, PrismaService, RedisService; `prisma migrate dev`
- [x] 4. AuthModule — register (bcryptjs), login (JWT + refresh), refresh, logout
- [x] 5. ApiFootballClient — rate limiting via Redis + response cache (TTL 60min)
- [x] 6. SyncModule bootstrap job — seed Competition, Club, Player, Fixture, Gameweek
- [x] 7. AliasModule + AdminModule — resolveClub/Player/Competition(); `/admin/aliases` CRUD

**Verification checklist:**
- [x] `docker compose up -d` → Postgres (existing) + Redis running
- [x] `pnpm exec prisma migrate dev` → all tables + partial index created
- [x] POST /auth/register + /auth/login → JWT + refreshToken received
- [ ] POST /admin/sync/bootstrap (with ADMIN jwt) → seed data created (requires API_FOOTBALL_KEY)
- [x] GET /admin/aliases → 403 without ADMIN role (auth + RBAC guards confirmed working)

Implementation notes:
- Used **pnpm** workspaces instead of npm (faster, `pnpm-workspace.yaml`)
- Used **bcryptjs** (pure JS) instead of bcrypt (no prebuilt native bindings for Node 25)
- Postgres port 5432 was already in use by a pre-existing container; `fantasy` DB created in it
- Blank-GW partial index added to migration SQL: `CREATE UNIQUE INDEX pp_blank_gw_unique ON PlayerPerformance (playerId, gameweekId) WHERE fixtureId IS NULL`

---

## Phase 2 — Core Game Logic ✅

**Completed:** 2026-03-12

**Goal:** Full fantasy team lifecycle — create squad, set picks, make transfers, calculate scores.

Tasks:
- [x] 8. CompetitionsModule, ClubsModule, PlayersModule, FixturesModule, GameweeksModule
- [x] 9. FantasyTeamsModule — squad validation (15 players, position limits, budget, 3-per-club)
- [x] 10. PicksModule — GW snapshot + GameweekOpenGuard deadline enforcement
- [x] 11. TransfersModule — transaction, free transfer accounting, wildcard chip
- [x] 12. ScoringService — calculatePlayerPoints() + finaliseGameweekScores()

**Verification checklist:**
- [x] `tsc --noEmit` → clean (all modules compile)
- [x] API boots successfully — all modules initialized, all routes registered
- [x] ScoringService unit test: GK clean sheet + 60 min = 6 pts ✓ (inline node test)
- [ ] POST /fantasy-teams → valid squad accepted (requires seeded data)
- [ ] POST /fantasy-teams → invalid squad (wrong budget/positions/club count) → 400
- [ ] PUT /picks/:gwId → picks saved
- [ ] PUT /picks/:gwId (after deadline) → 403
- [ ] POST /transfers → budget updated; extra transfer → -4pts recorded

Implementation notes:
- `AliasService.resolvePlayer` updated to accept optional `currentPrice` parameter
- `AliasService.resolveCompetition` updated to include `leagueSlug` in response
- `RedisService` extended with `getOrSet<T>` and `delByPattern` for cache strategy
- `GameweekOpenGuard` reads `:gameweekId` from route params; returns 403 if deadline passed or status not SCHEDULED/ACTIVE
- `ScoringService.calculatePlayerPoints()` is the single source of truth for all scoring logic
- `ScoringService.finaliseGameweekScores()` handles auto-subs, captain multiplier, formation revalidation
- Transfer wildcard retroactively zeroes all GW deductions + creates `ChipActivation` row
- Players module uses Redis cache (300s list, 600s detail) with `sha256(dto)` cache keys

---

## Phase 3 — Sync Pipeline + Leaderboard 🔲

**Goal:** Automated data sync from API-Football + global/mini-league standings.

Tasks:
- [ ] 13. BullMQ: fixture-result-check cron → performance-sync → gameweek-finalise
- [ ] 14. player-price-update job
- [ ] 15. LeaderboardModule — global standings, paginated, Redis-cached
- [ ] 16. FantasyLeaguesModule — create/join/standings

**Verification checklist:**
- [ ] Manually trigger performance-sync for test fixture → PlayerPerformance rows created
- [ ] Trigger gameweek-finalise → GameweekScore rows written for all teams
- [ ] GET /leaderboard/global → teams ranked by totalPoints
- [ ] GET /fantasy-leagues/:id → standings visible to members; 403 for non-members

---

## Phase 4 — Frontend 🔲

**Goal:** Full React SPA covering all user journeys.

Tasks:
- [ ] 17. Auth pages + axios JWT interceptor + refresh retry
- [ ] 18. ProtectedRoute + Zustand auth.store + draft.store
- [ ] 19. Dashboard — GW points, rank, deadline countdown
- [ ] 20. TeamManagement — FormationViewer (pitch SVG), SquadSelector, PlayerCard
- [ ] 21. Transfers — TransferModal, player search/filter, budget bar
- [ ] 22. Fixtures, Leaderboard, MiniLeagues pages
- [ ] 23. PlayerDetail — performance history + points breakdown

**Verification checklist:**
- [ ] Auth flow: register → login → dashboard (with JWT stored)
- [ ] Token refresh: let access token expire → next request auto-refreshes
- [ ] Team formation view shows correct player positions
- [ ] Transfer flow: select out → select in → confirm → budget updates
- [ ] Deadline passed: submit buttons disabled

---

## Phase 5 — Polish + SEO 🔲

**Goal:** Performance, reliability, and search engine optimization.

Tasks:
- [ ] 24. Redis caching on all hot endpoints (see api.md cache table)
- [ ] 25. DeadlineCountdown setInterval, loading skeletons, error boundaries
- [ ] 26. vite-plugin-ssg — pre-render `/` landing page
- [ ] 27. Rate limit alerting — log WARN at 80% API-Football daily quota

**Verification checklist:**
- [ ] GET /players (hot path) → second request served from Redis
- [ ] Landing page HTML served with proper meta tags (curl -s http://localhost:5173 | grep og:title)
- [ ] API-Football mock at 81 requests/day → WARN logged

---

## Blocking Issues

None currently.

---

## Architecture Decisions Log

| Date | Decision | Rationale |
|---|---|---|
| 2026-03-09 | Alias system for all names | Trademark safety; admin-managed in-game names |
| 2026-03-09 | Post-match scoring only | Reduces complexity; no need for live WebSocket connections |
| 2026-03-09 | pnpm workspaces monorepo | Faster installs than npm; strict hoisting prevents phantom deps; `pnpm-workspace.yaml` |
| 2026-03-09 | BullMQ over cron-only | Retry logic, concurrency control, job visibility for sync pipeline |
| 2026-03-09 | PlayerPerformance for 0-min players | Required for auto-sub finalisation logic |
| 2026-03-10 | Two competition types: LEAGUE + TOTAL | League mode = per-league squad + natural GW sequence; Total mode = cross-league squad + calendar-week GWs; 6 global leaderboards total |
| 2026-03-10 | Scoring scope: domestic leagues only | Cups, UCL, UEL, and internationals excluded from points calculation |
| 2026-03-10 | Independent price markets per competition | Transfer volume in one competition (e.g. PL) does not affect prices in another (e.g. Total mode) |
| 2026-03-10 | Business model: ads → cosmetics → prize mini-leagues | Stage 1: ad-supported launch; Stage 2: purchasable cosmetics (emblem, card skin, title, kit, GIF character); Stage 3: paid-entry prize mini-leagues |
| 2026-03-10 | Target audience: existing FPL players | Users who want FPL-equivalent for La Liga / Serie A / Bundesliga / Ligue 1, plus a novel cross-league Total mode |
| 2026-03-10 | Visual identity: casual/cartoonish/funny | Not a serious sports sim; alias system enables in-game personality; animated GIF characters are a core cosmetics feature |
| 2026-03-10 | bcryptjs over bcrypt | bcrypt has no prebuilt native bindings for Node 25; bcryptjs is pure JS with identical API |
| 2026-03-10 | Pre-push quality gate (2 layers) | Shell hook: lint + TS check (automated); hookify rule: security + code review agents (Claude-executed) |
| 2026-03-10 | Git worktree for feature branches | Isolates feature work from main without file copying; worktree shares `.git` database; delete after PR merge |
