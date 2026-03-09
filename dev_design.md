# Fantasy Football Game — Technical Design

> **Living document.** Updated at the end of each implementation phase to reflect what was actually built.
> Last updated: Phase 0 (bootstrap)

---

## Tech Stack

| Layer | Technology | Version | Rationale |
|---|---|---|---|
| Frontend Framework | React + Vite | React 18, Vite 5 | Fast HMR, SPA, wide ecosystem |
| Styling | Tailwind CSS | v3 | Utility-first, no runtime cost |
| Server State | TanStack Query | v5 | Caching, invalidation, pagination built-in |
| Client State | Zustand | v4 | Lightweight; used for auth token + transfer draft staging only |
| Routing | React Router | v6 | Standard SPA routing |
| SEO | react-helmet-async + vite-plugin-ssg | — | Pre-render landing page only |
| Backend | NestJS | v10 | Modular, decorator-based, TypeScript-native |
| ORM | Prisma | v5 | Type-safe DB client, migrations as code |
| Database | PostgreSQL | v15 | Relational, ACID, good JSON support for pointsBreakdown |
| Cache / Queues | Redis + BullMQ | Redis 7, BullMQ v4 | Job queues + response caching in one service |
| Auth | JWT + Refresh Tokens | — | Stateless access token (15min) + DB-stored refresh (7d) |
| External API | API-Football (api-sports.io) | v3 | Single source for all football data |

---

## Monorepo Layout

```
fantasy/
├── package.json                  # npm workspaces root
├── docker-compose.yml            # PostgreSQL + Redis
├── .env.example
├── .gitignore
├── packages/
│   └── shared/
│       ├── package.json
│       └── src/
│           ├── types/
│           │   ├── football.types.ts     # Competition, Club, Player, Fixture, Gameweek
│           │   ├── fantasy.types.ts      # FantasyTeam, PlayerPick, Transfer, GameweekScore
│           │   └── scoring.types.ts      # PointsBreakdown, ScoringEvent
│           └── constants/
│               ├── scoring.constants.ts  # SCORING_RULES — single source of truth
│               ├── leagues.constants.ts  # API-Football league IDs (PL=39, etc.)
│               └── game.constants.ts     # SQUAD_SIZE=15, BUDGET=100.0, MAX_PER_CLUB=3
└── apps/
    ├── api/
    │   ├── prisma/
    │   │   └── schema.prisma             # CRITICAL: all modules derive from this
    │   └── src/
    │       ├── main.ts
    │       ├── app.module.ts
    │       ├── modules/
    │       │   ├── auth/
    │       │   ├── users/
    │       │   ├── competitions/
    │       │   ├── clubs/
    │       │   ├── players/
    │       │   ├── fixtures/
    │       │   ├── gameweeks/
    │       │   ├── fantasy-teams/
    │       │   ├── picks/
    │       │   ├── transfers/
    │       │   ├── scoring/
    │       │   ├── leaderboard/
    │       │   ├── fantasy-leagues/
    │       │   ├── sync/
    │       │   ├── alias/
    │       │   └── admin/
    │       └── infrastructure/
    │           ├── prisma/               # PrismaService
    │           ├── redis/                # RedisService
    │           └── api-football/         # ApiFootballClient
    └── web/
        ├── index.html
        ├── vite.config.ts
        └── src/
            ├── api/                      # TanStack Query hooks + axios client
            ├── store/                    # Zustand stores (auth.store, draft.store)
            ├── pages/
            │   ├── Landing.tsx
            │   ├── Login.tsx
            │   ├── Register.tsx
            │   └── app/
            │       ├── Dashboard.tsx
            │       ├── Team.tsx
            │       ├── Transfers.tsx
            │       ├── Fixtures.tsx
            │       ├── Leaderboard.tsx
            │       ├── Leagues.tsx
            │       ├── LeagueDetail.tsx
            │       └── PlayerDetail.tsx
            └── components/
                ├── football/
                │   ├── FormationViewer.tsx   # Pitch SVG, player slots by formation
                │   ├── PlayerCard.tsx        # Photo, name, price, GW pts, captain badge
                │   └── PlayerStatsModal.tsx  # Points breakdown per GW
                ├── fantasy/
                │   ├── TransferModal.tsx     # Two-panel: squad left, market right
                │   ├── GameweekNavigator.tsx # Arrow nav GW1-38, deadline countdown
                │   ├── SquadSelector.tsx
                │   └── DeadlineCountdown.tsx # setInterval countdown, disables forms
                └── leaderboard/
                    └── LeaderboardTable.tsx
```

---

## Docker Services

```yaml
# docker-compose.yml
services:
  postgres:
    image: postgres:15
    environment:
      POSTGRES_DB: fantasy
      POSTGRES_USER: fantasy_user
      POSTGRES_PASSWORD: fantasy_pass
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data

volumes:
  postgres_data:
  redis_data:
```

---

## Environment Variables

```bash
# Database
DATABASE_URL=postgresql://fantasy_user:fantasy_pass@localhost:5432/fantasy

# Redis
REDIS_URL=redis://localhost:6379

# Auth
JWT_SECRET=change-me-in-production
JWT_REFRESH_SECRET=change-me-refresh-in-production
JWT_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

# API-Football
API_FOOTBALL_KEY=your-api-football-key-here
API_FOOTBALL_BASE_URL=https://v3.football.api-sports.io

# App
NODE_ENV=development
PORT=3000
FRONTEND_URL=http://localhost:5173
```

---

## Dev Workflow

```bash
# 1. Start infrastructure
docker-compose up -d

# 2. Install dependencies
npm install          # from monorepo root (workspaces)

# 3. Run migrations
cd apps/api && npx prisma migrate dev

# 4. Seed football data (run once, admin endpoint)
curl -X POST http://localhost:3000/admin/sync/bootstrap \
  -H "Authorization: Bearer <admin-jwt>"

# 5. Start API (development)
cd apps/api && npm run start:dev

# 6. Start frontend (development)
cd apps/web && npm run dev
```

---

## BullMQ Queues

| Queue Name | Concurrency | Triggered by |
|---|---|---|
| `season-bootstrap` | 1 | Admin POST /admin/sync/bootstrap |
| `fixture-result-check` | 1 (cron) | Every 2h during active GW |
| `performance-sync` | 2 | fixture-result-check per finished fixture |
| `gameweek-finalise` | 1 | performance-sync when all GW fixtures done |
| `player-price-update` | 1 | gameweek-finalise completion |

**Queue persistence:** Jobs use BullMQ with Redis as the backing store. Failed jobs are retained for inspection and manual retry.

---

## NestJS Module Map

| Module | Key Responsibilities |
|---|---|
| **AuthModule** | register (bcrypt), login (JWT + refresh), refresh, logout |
| **UsersModule** | GET/PATCH /users/me |
| **CompetitionsModule** | List competitions, gameweeks with deadlines |
| **ClubsModule** | List clubs per competition |
| **PlayersModule** | Paginated list (filter), detail, ownership %, performances |
| **FixturesModule** | Fixtures per gameweek, upcoming per club |
| **GameweeksModule** | Current GW, deadline; `isDeadlinePassed()` for guards |
| **FantasyTeamsModule** | Create (15-player + budget + position + 3-per-club validation), get, history |
| **PicksModule** | Submit GW snapshot (starting XI + bench + captain); `GameweekOpenGuard` |
| **TransfersModule** | Execute transfer in Prisma transaction; free transfer accounting; wildcard |
| **ScoringModule** | `calculatePlayerPoints()`, `finaliseGameweekScores()` — internal only |
| **LeaderboardModule** | Global standings per competition + per GW; paginated; Redis-cached |
| **FantasyLeaguesModule** | Create (invite code), join, standings (members only) |
| **SyncModule** | BullMQ workers orchestrating all data ingestion |
| **AliasModule** | `AliasService.resolveClub/Player/Competition()`; `/admin/aliases` CRUD |
| **AdminModule** | Auth-gated admin endpoints: aliases, sync triggers |

### Common Infrastructure
- `JwtAuthGuard` applied globally; `@Public()` decorator whitelists open routes
- `RolesGuard` + `@Roles(Role.ADMIN)` for admin-only endpoints
- `GameweekOpenGuard` blocks transfers/picks after deadline
- Global `ValidationPipe`, `HttpExceptionFilter`, `LoggingInterceptor`

---

## Frontend Routes

| Path | Component | Auth Required |
|---|---|---|
| `/` | Landing (SSG pre-rendered) | No |
| `/login` | Login | No |
| `/register` | Register | No |
| `/app/dashboard` | Dashboard | Yes |
| `/app/team` | Team + FormationViewer | Yes |
| `/app/transfers` | TransferModal + search | Yes |
| `/app/fixtures` | Gameweek fixtures | Yes |
| `/app/leaderboard` | Global standings | Yes |
| `/app/leagues` | Mini-leagues list + create/join | Yes |
| `/app/leagues/:id` | Mini-league standings | Yes |
| `/app/players/:id` | Player detail + performance history | Yes |

### State Management Strategy
- **TanStack Query**: All server state (players, picks, scores, leaderboard) — handles caching, invalidation, pagination
- **Zustand `auth.store`**: Access token, refresh token, current user info
- **Zustand `draft.store`**: In-progress transfer staging (player out/in pairs before confirming) — not persisted

---

## Deployment (100–1k Users)

Single VPS (2 CPU, 4GB RAM) with Docker Compose is sufficient for this scale.

```
VPS
├── docker-compose.yml
│   ├── api (NestJS — port 3000)
│   ├── web (Nginx serving static Vite build — port 80/443)
│   ├── postgres (port 5432, internal only)
│   └── redis (port 6379, internal only)
└── nginx (reverse proxy, TLS termination)
```

**Scale triggers:**
- >500 concurrent users → migrate Postgres to managed DB (Supabase/Railway)
- >2,000 users → separate Redis instance, consider horizontal API scaling
- >10,000 users → proper microservices split (sync workers separated from API)

---

## API-Football Usage Notes

- Free tier: 100 req/day (sufficient for development with seed SQL approach)
- Paid tier: ~$10-20/mo for 7,500 req/day (recommended for production sync)
- **Dev strategy**: Run bootstrap once, commit seed SQL dump, use free tier sparingly
- **Prod strategy**: Paid plan for continuous 2h sync during active GWs

### League IDs
| Competition | API-Football ID |
|---|---|
| Premier League | 39 |
| La Liga | 140 |
| Serie A | 135 |
| Bundesliga | 78 |
| Ligue 1 | 61 |
