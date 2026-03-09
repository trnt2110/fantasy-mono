# Fantasy Football Game — Implementation Progress

> Updated at the end of each phase. Blocking issues logged here.

---

## Phase Status

| Phase | Status | Branch | Notes |
|---|---|---|---|
| **Phase 0** — Documentation Bootstrap | ✅ Done | feature/fantasy-game | All 5 design docs created |
| **Phase 1** — Foundation | 🔲 Not started | — | Monorepo, auth, prisma, api-football client, alias system |
| **Phase 2** — Core Game Logic | 🔲 Not started | — | Squads, picks, transfers, scoring |
| **Phase 3** — Sync Pipeline + Leaderboard | 🔲 Not started | — | BullMQ jobs, leaderboard, mini-leagues |
| **Phase 4** — Frontend | 🔲 Not started | — | React SPA |
| **Phase 5** — Polish + SEO | 🔲 Not started | — | Caching, SEO, deadline countdown |

---

## Phase 0 — Documentation Bootstrap ✅

**Completed:** 2026-03-09

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

---

## Phase 1 — Foundation 🔲

**Goal:** Runnable monorepo with auth, database, and API-Football client.

Tasks:
- [ ] 1. Init monorepo (npm workspaces), docker-compose.yml, .env.example
- [ ] 2. `packages/shared` — scoring constants, leagues constants, game constants, shared TS types
- [ ] 3. NestJS bootstrap — ConfigModule, PrismaService, RedisService; run `prisma migrate dev`
- [ ] 4. AuthModule — register (bcrypt), login (JWT + refresh), refresh, logout
- [ ] 5. ApiFootballClient — rate limiting via Redis + response cache (TTL 60min)
- [ ] 6. SyncModule bootstrap job — seed Competition, Club, Player, Fixture, Gameweek
- [ ] 7. AliasModule + AdminModule — resolveClub/Player/Competition(); `/admin/aliases` CRUD

**Verification checklist:**
- [ ] `docker-compose up` → Postgres + Redis running
- [ ] `npx prisma migrate dev` → all tables created
- [ ] POST /auth/register + /auth/login → JWT received
- [ ] POST /admin/sync/bootstrap (with ADMIN jwt) → seed data created
- [ ] GET /admin/aliases → shows un-aliased entities

---

## Phase 2 — Core Game Logic 🔲

**Goal:** Full fantasy team lifecycle — create squad, set picks, make transfers, calculate scores.

Tasks:
- [ ] 8. CompetitionsModule, ClubsModule, PlayersModule, FixturesModule, GameweeksModule
- [ ] 9. FantasyTeamsModule — squad validation (15 players, position limits, budget, 3-per-club)
- [ ] 10. PicksModule — GW snapshot + GameweekOpenGuard deadline enforcement
- [ ] 11. TransfersModule — transaction, free transfer accounting, wildcard chip
- [ ] 12. ScoringService — calculatePlayerPoints() + finaliseGameweekScores()

**Verification checklist:**
- [ ] POST /fantasy-teams → valid squad accepted
- [ ] POST /fantasy-teams → invalid squad (wrong budget/positions/club count) → 400
- [ ] PUT /picks/:gwId → picks saved
- [ ] PUT /picks/:gwId (after deadline) → 403
- [ ] POST /transfers → budget updated; extra transfer → -4pts recorded
- [ ] ScoringService unit test: GK clean sheet + 60 min = 6 pts

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
| 2026-03-09 | npm workspaces monorepo | Simplest setup; shared types between API and frontend |
| 2026-03-09 | BullMQ over cron-only | Retry logic, concurrency control, job visibility for sync pipeline |
| 2026-03-09 | PlayerPerformance for 0-min players | Required for auto-sub finalisation logic |
