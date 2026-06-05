# Fantasy Football Game — Implementation Progress

> Updated at the end of each phase. Blocking issues logged here.

---

## Phase Status

| Phase | Status | Branch | Notes |
|---|---|---|---|
| **Phase 0** — Documentation Bootstrap | ✅ Done | feature/fantasy-game | All 5 design docs created; design decisions updated 2026-03-10 |
| **Phase 1** — Foundation | ✅ Done | feature/fantasy-game | Monorepo (pnpm), auth, prisma, api-football client, alias system |
| **Phase 2** — Core Game Logic | ✅ Done | feature/fantasy-game | Competitions/Clubs/Players/Fixtures/Gameweeks modules; FantasyTeams squad creation; Picks + GameweekOpenGuard; Transfers + wildcard; ScoringService |
| **Phase 3** — Sync Pipeline + Leaderboard | ✅ Done | feature/fantasy-game | BullMQ jobs, leaderboard, mini-leagues |
| **Phase 4** — Frontend | ✅ Done | feature/fantasy-game | 4a: UI scaffolded with mock data; 4b: full API wiring complete |
| **Phase 5** — Polish + SEO | ✅ Done | feature/fantasy-game | Clubs Redis cache; loading skeletons; error boundaries; landing page + SSG pre-rendering |

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

## Phase 3 — Sync Pipeline + Leaderboard ✅

**Completed:** 2026-03-13

**Goal:** Automated data sync from API-Football + global/mini-league standings.

Tasks:
- [x] 13. BullMQ: fixture-result-check cron → performance-sync → gameweek-finalise
- [x] 14. player-price-update job
- [x] 15. LeaderboardModule — global standings, paginated, Redis-cached
- [x] 16. FantasyLeaguesModule — create/join/standings

**Verification checklist:**
- [ ] Manually trigger performance-sync for test fixture → PlayerPerformance rows created (`POST /admin/sync/fixture/:id`)
- [ ] Trigger gameweek-finalise → GameweekScore rows written for all teams
- [ ] GET /leaderboard/global?competitionId=39 → teams ranked by totalPoints
- [ ] GET /fantasy-leagues/:id/standings → standings visible to members; 403 for non-members
- [ ] GET /admin/sync/status → queue stats returned

Implementation notes:
- `FixtureResultCheckProcessor`: queries fixtures with kickoff > 2h ago, status not finished; calls API-Football to check; updates Fixture + enqueues performance-sync
- `PerformanceSyncProcessor` (concurrency 2): fetches stats + lineups + events; upserts PlayerPerformance with calculated points; enqueues gameweek-finalise when all fixtures done
- `GameweekFinaliseProcessor` (concurrency 1): delegates to `ScoringService.finaliseGameweekScores()`; advances isCurrent; invalidates Redis caches; enqueues player-price-update
- `PlayerPriceUpdateProcessor` (concurrency 1): net transfer delta per player since last GW; ±0.1m at 2% threshold; clamps [4.0, 15.0]; writes PlayerPriceHistory
- `LeaderboardModule`: `GET /leaderboard/global` with competitionId + optional gameweekId; 5-min Redis cache; resolves to current GW if gameweekId omitted
- `FantasyLeaguesModule`: create (generates 8-char alphanumeric invite code), join (validates same competition), mine (list my leagues), standings (members-only, 5-min Redis cache)
- Admin endpoints added: `POST /admin/sync/fixture/:id` (manual perf-sync), `GET /admin/sync/status` (queue stats)

---

## Phase 4 — Frontend 🔄

**Goal:** Full React SPA covering all user journeys.

**Started:** 2026-03-13

### 4a — UI Scaffolding ✅ (2026-03-13)

`apps/web` created. Full responsive UI built with mock data across all 4 main screens.

**What was built:**
- [x] Vite + React 19 + TypeScript + Tailwind CSS v3 app scaffold
- [x] TanStack Query v5 + Zustand v5 + React Router v7 installed (not yet wired)
- [x] Global design system: Bangers (display) + Nunito (body) fonts, dark navy palette, neon green accent, 3D press buttons, game-card component, position badges
- [x] Responsive shell: fixed left sidebar on `lg:` desktop; top bar + bottom nav on mobile
- [x] **Squad Selection page** — pitch view (animated player cards, captain badge, bench) + list view; two-panel on desktop (pitch left, list right); player tap-to-modal
- [x] **Player Selection page** — grouped player list with add/remove; filter sidebar on desktop (squad counter, budget, position, sort, price slider); mobile inline filters
- [x] **Fixtures page** — GW navigation; expandable fixture cards showing your players + difficulty ratings; 2-column grid on desktop
- [x] **Leagues page** — stats summary row; leaderboard with rank, movement arrows, streak, points bar; join/create league panel on desktop
- [x] `src/data/mock.ts` — all UI wired to mock data; types define the shape components expect from the real API

**Actual versions installed (differs from plan):**
- React 19 (plan said 18), Vite 8 (plan said 5), React Router v7 (plan said v6), Zustand v5 (plan said v4)

### 4b — API Wiring ✅ (2026-03-13)

**What was built:**
- [x] 17. `src/api/client.ts` — axios instance + JWT Bearer interceptor + 401 refresh retry (queue pattern for concurrent requests; callback registration to avoid circular import with auth store)
- [x] 18. `src/store/auth.store.ts` (Zustand persist) — accessToken, refreshToken, user, fantasyTeamId, competitionId (default 39), budget; setAuth, setFantasyTeam, refreshTokens, clearAuth
- [x] 19. `src/store/draft.store.ts` (Zustand ephemeral) — playerIn/playerOut staging; cleared on confirm/cancel
- [x] 20. `src/api/hooks/` — TanStack Query hooks: useAuth (login/register/logout), useClubs + useClubsMap (memoized Map<clubId,shortName>), useCurrentGameweek, useSquad (useMyFantasyTeam + useGwPicks + useSubmitPicks), usePlayers + usePlayerDetail, usePlayerPerformances, useFixtures, useLeaderboard (useGlobalLeaderboard), useFantasyLeagues (useMyLeagues + useLeagueStandings + useJoinLeague + useCreateLeague)
- [x] 21. Auth pages: Login, Register + ProtectedRoute wrapper + AppShell extracted from App.tsx
- [x] 22. All mock data replaced with real query hooks: SquadSelection, PlayerSelection, Fixtures, Leagues, Sidebar all wired
- [x] 23. Sidebar wired to useCurrentGameweek + DeadlineCountdown + auth store (bank, user)
- [x] 24. PlayerDetail modal — real performance history (usePlayerDetail + usePlayerPerformances)
- [x] 25. DeadlineCountdown — setInterval (clears after deadline), shows "Xh MMm SSs" countdown or "DEADLINE PASSED"
- [x] Fixed `isCapitain` → `isCaptain` typo everywhere (mock.ts + all components)

**Implementation notes:**
- `clubShort` not returned by `/players` or `/picks` — derived via `useClubsMap()` (Map<clubId,shortName> from `/clubs`), with 3-letter fallback
- `competitionId=39` (Premier League) hardcoded as MVP default in auth store
- Fixture GW navigation disabled (nav buttons visible but inert) — only current GW fixtures fetchable via gwId; multi-GW browsing deferred to Phase 5
- "Form" sort + stat column removed from PlayerSelection — `ApiPlayer` list endpoint does not return a form rating
- `useGlobalLeaderboard` returns `res.data.data` (entries array, not envelope)
- `useClubsMap` wrapped in `useMemo` to prevent Map object churn on every render

**Verification checklist:**
- [x] Auth flow: register → login → app shell (JWT stored in Zustand persist)
- [x] Token refresh: 401 triggers silent refresh + request retry via queue
- [x] Squad page shows real picks from API
- [x] Player selection filters hit real `/players` endpoint with position filter
- [x] Transfer staging: add player → draft store updated; isPicked reflects staged player
- [x] Deadline countdown visible in Sidebar, Fixtures header, and mobile banners

---

## Phase 5 — Polish + SEO ✅

**Completed:** 2026-03-17

Tasks:
- [x] 24. Redis caching added to ClubsService (`clubs:competition:{id}`, 600s TTL)
- [x] 25. Loading skeletons (Skeleton primitive + pulse placeholders on all 4 pages); error boundaries (global ErrorBoundary + per-page QueryErrorResetBoundary with retry)
- [x] 26. Landing page (`/`) with react-helmet-async meta tags + SSG pre-render plugin in vite.config.ts
- [x] 27. Rate limit alerting — already implemented in Phase 1 (ApiFootballClient warns at >80 req/day)

Implementation notes:
- `ClubsService` now uses `RedisService.getOrSet` — `RedisModule` is `@Global()` so no module import change needed
- `Skeleton` component: single `animate-pulse bg-white/5` primitive; layout-specific shapes inlined per page
- Skeleton guards placed inside `QueryErrorResetBoundary` / `ErrorBoundary` tree (not as early returns) so errors during loading are caught by the per-page boundary
- `ErrorBoundary` is a class component (required for `getDerivedStateFromError`); `QueryErrorResetBoundary` wraps each page to reset TanStack Query error state on retry
- SSG pre-render: custom Vite `closeBundle` plugin renders `Landing` via `renderToString` + `StaticRouter` after build; injects into `dist/index.html`; non-fatal (warns and skips on failure)
- `StaticRouter` imported from `react-router-dom` (not `react-router-dom/server` — RR v7 changed the export location)
- `tsconfig.node.json` updated with `"jsx": "react-jsx"` to allow the Vite plugin to dynamically import `.tsx` files

Verification checklist:
- [x] GET /clubs?competitionId=39 twice → Redis key `clubs:competition:39` exists after first call
- [x] All 4 pages show skeleton placeholders while TanStack Query is loading
- [x] Throwing an error in a page component shows error fallback UI with Retry button
- [x] `http://localhost:5173/` shows landing page (not login redirect) for unauthenticated users
- [x] `pnpm build` → `dist/index.html` contains pre-rendered landing content and og:title meta tag

---

## Phase 6 — Data Seeding (Bootstrap + Player Sync) 🔄

**Started:** 2026-05-25

**Goal:** Seed real football data from API-Football into the running database.

### Bootstrap ✅ (2026-05-25)

Competitions, clubs, fixtures, and gameweeks successfully seeded for all 5 leagues.

**Seeded data:**
| League | ID | Season | Clubs | Gameweeks |
|---|---|---|---|---|
| Premier League | 39 | 2024 | 20 | 38 |
| La Liga | 140 | 2024 | 20 | 38 |
| Serie A | 135 | 2024 | 20 | 38 |
| Bundesliga | 78 | 2024 | 34 | 34 |
| Ligue 1 | 61 | 2024 | 19 | 34 |
| Total Mode | 0 | 2024 | — | — |

**Bugs fixed during bootstrap:**
- `apps/api/.env` had `PORT=3000`; Vite proxy targets 3001 — fixed to 3001
- `ApiFootballClient` only retried on HTTP 429 but API-Football also returns HTTP 200 with `errors.rateLimit` body on soft rate limit — added body-level rateLimit check with same retry logic
- Added detailed `[API]` / `[DB]` logging throughout `BootstrapProcessor` for visibility

**Known API plan limitation:**
- Free plan only covers seasons 2022–2024. Season 2025 returns `errors: { plan: "Free plans do not have access to this season, try from 2022 to 2024." }` with HTTP 200 and 0 results.
- Bootstrap auto-detects the latest available season (2024) correctly — no code change needed.
- Upgrading to a paid API-Football plan would allow season 2025 data.

### Player Sync ⏳ (upcoming)

Players are seeded separately to stay within the 100 req/day free plan limit (~40 calls per league).

Tasks:
- [x] Run `POST /admin/sync/players/39` (Premier League) — 1129 players seeded across 20 clubs (2026-05-26)
- [ ] Run `POST /admin/sync/players/140` (La Liga) — hit daily quota (96/95) mid-sync on 2026-05-26; re-run tomorrow
- [ ] Run `POST /admin/sync/players/135` (Serie A)
- [ ] Run `POST /admin/sync/players/78` (Bundesliga)
- [ ] Run `POST /admin/sync/players/61` (Ligue 1)

Do one league per day on the free plan.

### Known Issues / Remaining Tasks

- [ ] **Error responses are cached**: `ApiFootballClient` caches all HTTP 200 responses including those with `errors.plan` or other API-level errors. These should not be stored in Redis. Fix: skip `redis.set` when `data.errors` is non-empty.

---

## Phase 7 — End-to-End Testing & Bug Fixes 🔄

**Started:** 2026-06-01

### Onboarding page fixes ✅ (2026-06-01)

**Bug 1: Footer (Next button + budget) not visible on /onboarding step 1**
- Root cause: `OnboardingWizard` used `min-h-screen flex flex-col`. With `min-height` (not a definite `height`), the `flex-1 overflow-hidden` content area failed to anchor `Step1PickPlayers`'s `h-full`. The player list expanded to full content height; the `overflow-hidden` parent clipped everything past the viewport — exactly where the footer lives. Both the "Next →" button and the budget display were off-screen.
- Fix: Changed `min-h-screen` → `h-dvh overflow-hidden` in `Onboarding.tsx`. `h-dvh` gives a definite viewport height (accounts for mobile browser chrome), making `h-full` resolve correctly in child components.

**Bug 2: Max-price filter slider confused for remaining budget indicator**
- Root cause: The max-price filter slider was styled with the same gold `£15m` label as the budget display, making it look like a budget tracker to users.
- Fix: Relabeled filter with a grey "Max" prefix; changed slider accent to neon green. Footer budget label changed from "Budget" to "Remaining Budget"; removed `Math.max(0, ...)` floor so negative budget renders in red as an explicit overspend signal.

### Gameplay Simulation system ✅ (2026-06-02)

**Context:** All 2024 GW deadlines are in the past, so the normal pick/transfer flow is permanently blocked for testing. A simulation system was built as admin-only tooling to drive the full game loop without real match data.

**What was built:**

Backend (`apps/api/src/modules/admin/`):
- `simulation.service.ts` — `createBots`, `openGameweek`, `submitBotPicks`, `finalizeGameweek`, `generatePerformance`, `getStatus`
- `simulation.controller.ts` — 5 endpoints under `/admin/simulate/`
- `dto/simulate.dto.ts` — `CreateBotsDto`, `OpenGameweekDto`
- 11 unit tests (all passing)

Frontend (`apps/web/src/pages/admin/AdminSimulation.tsx`):
- Bot setup card (create/reset bots with count input)
- Current-GW stepper with 4 steps: Open → Your Picks → Bot Picks → Finalize
- Action buttons per step, inline error messages, 4-second toast notifications
- GW history table (all finished GWs with teams scored + deadline)
- `useAdminSimulation.ts` — 5 TanStack Query hooks; status query invalidated after every mutation
- Simulation tab added to `AdminPage.tsx`

**Key design decisions:**
- Simulation bypasses `GameweekOpenGuard` entirely — all DB writes are direct via `SimulationService`
- `finalizeGameweek` replicates `GameweekFinaliseProcessor` logic synchronously (no BullMQ)
- Bot users identified by `@sim.test` email suffix; `createBots` is idempotent
- `generatePerformance`: 92% play rate, position-weighted goal rates, GK gets saves
- `submitBotPicks`: uses two-step GW lookup to avoid cross-GW pick bleed on second+ GW
- `PlayerPerformance` upsert uses `findFirst` + conditional create/update (schema `@@unique([playerId, fixtureId])` is nullable, cannot use Prisma upsert)
- Competition hardcoded to 39 (PL) for MVP — selector deferred

**Bugs found and fixed during implementation:**
- `Number(prismaDecimal)` → NaN; fixed to `.toNumber()`
- Budget test was asserting raw mock data instead of the mapped `p.price` field
- `submitBotPicks` used `gameweekId: { not: gwId }` which blended picks from multiple prior GWs; fixed to fetch most-recent-GW picks only

See `docs/admin_guide.md` for the full simulation workflow.

### Reset Bots fix ✅ (2026-06-03)

**Bug:** "Reset Bots" button called the create-bots handler instead of a reset endpoint. No reset endpoint existed, so clicking it did nothing (existing bots skipped, count stayed at 10).

**Fix:**
- Backend: `DELETE /admin/simulate/bots` — deletes all `@sim.test` users and their teams/picks in dependency order (picks → teams → users)
- Frontend: `useResetBots` hook + `handleResetBots` handler; button now calls the correct endpoint

---

### Squad page shows empty pitch and list after team creation ✅ (2026-06-02)

**Root cause: Systematic missing `{ data: ... }` wrapper across 6 API controllers**

The auth controller (the correct template) wraps all responses: `return { data: await service.method() }`. Every frontend hook reads results as `res.data.data` (outer `.data` = axios envelope, inner `.data` = API wrapper). Six controllers were missing this wrapper, so every hook got `undefined` instead of actual data.

The cascade on `/squad`:
1. `GET /fantasy-teams/mine` returned unwrapped team → `res.data.data = undefined` → `fantasyTeamId` never set in auth store
2. `GET /gameweeks/current` returned unwrapped gameweek → `res.data.data = undefined` → `gw = undefined` → "GW—" in header
3. `useGwPicks(gw?.id)` disabled (no `gameweekId`, no `fantasyTeamId`) → `picks = []` → empty pitch and list

**Fixes:**
- `gameweeks.controller.ts` — wrapped `findCurrent`
- `picks.controller.ts` — wrapped `getPicks`
- `fantasy-teams.controller.ts` — wrapped `findMine`, `findOne`, `findScores`
- `clubs.controller.ts` — wrapped `findAll`
- `fixtures.controller.ts` — wrapped both `findByGameweek` and `findUpcomingByClub`
- `fantasy-leagues.controller.ts` — wrapped all four endpoints
- `fantasy-teams.service.ts findMine` — additionally fixed to serialize Prisma `Decimal` fields as `Number` (same pattern as `findOne`), preventing `budget` from serializing as a string over JSON

---

### Squad inheritance + Points page ✅ (2026-06-05)

**Problem:** After GW1 was finalised and GW2 became current, the squad page showed 0/15 players (empty pitch) because no picks existed for GW2. No UI existed to review past GW scores.

**What was built:**

Backend:
- `GET /gameweeks?competitionId=` — new list endpoint returning all GWs with id, number, status, deadlineTime ordered by number asc
- Auto-seed picks on GW finalisation — after promoting next GW to `isCurrent`, each team's GW N picks are automatically copied verbatim to GW N+1. Added to both `SimulationService.finalizeGameweek()` and `GameweekFinaliseProcessor.process()`. Idempotent (skips teams already with picks); error-isolated per-team (one failure can't abort the rest of the loop)

Frontend:
- `useGameweeks()` + `useFinishedGameweeks()` hooks; `ApiGameweekSummary` type
- `Points` page (`📊 Points` nav item) — finished GW tab selector (defaults to last GW), your score summary (GW pts / rank / total), GW leaderboard table with "you" row highlighted, and read-only squad list for the selected GW showing per-player points and captain ×2 multiplier

**Design doc update:** `game_design.md` now explicitly documents Squad Inheritance (picks carry over between GWs) and Scoring Display (GW vs overall leaderboard, Points/GW History screen).

**Notable fixes during review:**
- `useGwPicks` was typed as `ApiListResponse<ApiPick>` (has `meta`) but endpoint returns `ApiResponse<ApiPick[]>` (no `meta`) — corrected
- Captain ×2 multiplier in Points display used `pick.multiplier` (always 1 in DB); fixed to `pick.isCaptain ? 2 : 1`

---

## Blocking Issues

None currently.

---

## What's Next

### Immediate — finish the game loop

1. **Squad page: carry-over UX** — The squad now shows correctly after GW finalises (picks auto-seeded). Still needed: a clear banner on the squad page when the GW is `SCHEDULED` and the deadline hasn't passed yet, prompting the user to "Confirm squad for GW N" or make transfers. Currently nothing distinguishes "reading your carried-over squad" from "you've already confirmed picks."

2. **Transfers flow** — Transfer UI exists (button navigates to `/players`) but the confirm-transfer path is not wired end-to-end. Need to verify `POST /transfers` is callable from the frontend and the squad page reflects the updated pick after confirmation.

3. **Player seeding** — Remaining 4 leagues not yet synced (hit daily API quota):
   - `POST /admin/sync/players/140` — La Liga
   - `POST /admin/sync/players/135` — Serie A
   - `POST /admin/sync/players/78` — Bundesliga
   - `POST /admin/sync/players/61` — Ligue 1
   - One per day on free plan (~40 API calls each)

4. **Alias setup** — After each player sync, all new clubs/players have `isAliased: false`. Use admin panel (Players + Clubs tabs) to set in-game display names.

5. **Fix cached API errors** — `ApiFootballClient` caches all HTTP 200 responses including those with `errors.plan` or `errors.rateLimit`. Fix: skip `redis.set` when `data.errors` is non-empty.

### Medium-term

6. **Multi-competition support** — Everything is hardcoded to `competitionId: 39` (Premier League). The simulation controller, `useSimulationStatus`, auth store default, and Points/Leagues pages all assume PL. Before opening other leagues, add a competition selector (or derive from user's teams).

7. **Fixtures GW navigation** — GW nav arrows on the Fixtures page are visible but inert. Wire them to let users browse past and upcoming GWs.

8. **Leaderboard pagination** — `GET /leaderboard/global` supports `?page=` but the Leagues and Points pages always load page 1 (top 20). Add "Load more" or pagination for large competitions.

9. **`GameweekOpenGuard` alignment** — The guard blocks picks when deadline is past. But after GW finalises and next GW is `SCHEDULED` with a future deadline, the guard should allow picks. Verify the guard handles the `SCHEDULED` → `ACTIVE` transition correctly for the carried-over squad confirm flow.

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
