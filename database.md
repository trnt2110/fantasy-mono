# Fantasy Football Game — Database Design

> **Living document.** Updated at the end of each implementation phase to reflect what was actually built.
> Last updated: Phase 0 (refined 2026-03-10)

---

## Alias System (Licensing Firewall)

To avoid trademark/licensing issues, all user-facing names for clubs, players, and competitions are admin-managed "in-game" aliases — similar to PES/eFootball's approach (e.g., "Manchester United" → "Manchester Red", "Premier League" → "England Top Flight").

### Design Pattern

Every aliasable entity:
1. Stores `realName` (internal — used only for API-Football sync matching, **never returned to clients**)
2. Has a corresponding `*Alias` table storing the admin-managed in-game display name
3. Resolved via `AliasService.resolveXxx()` before any API response is serialized

### API Response Shape (after alias resolution)

```typescript
// Club example
{
  id: 33,
  name: "Manchester Red",      // from ClubAlias.name
  shortName: "MRD",            // from ClubAlias.shortName
  city: "Manchester",          // from ClubAlias.city
  logoUrl: "...",              // safe (not a real trademark issue)
  isAliased: true              // false = admin hasn't set a name yet
}
```

### Admin Workflow

1. After `season-bootstrap` seeds real data, admin visits `/admin/aliases`
2. Dashboard surfaces all un-aliased entities (`isAliased: false`)
3. Admin sets in-game names one-by-one or via bulk CSV import
4. Until aliased, entities show as `[Unnamed]` to clients (not leaked to users, not returned in responses for formation purposes without a name)

---

## Prisma Schema

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// ─── Enums ─────────────────────────────────────────────────────────────────

enum Role {
  USER
  ADMIN
}

enum Position {
  GK
  DEF
  MID
  FWD
}

enum GameweekStatus {
  SCHEDULED
  ACTIVE
  SCORING
  FINISHED
}

enum CompetitionType {
  LEAGUE  // one league only; players from that league; natural GW sequence
  TOTAL   // cross-league; players from any of the 5 leagues; calendar-week GWs
}

enum ChipType {
  WILDCARD
  // Future: TRIPLE_CAPTAIN | BENCH_BOOST | FREE_HIT
}

// ─── Football Entities (synced from API-Football) ──────────────────────────

model Competition {
  id           Int             @id   // API-Football league ID (e.g., 39 for PL); use a sentinel ID (e.g., 0) for Total mode
  realName     String                // internal only — never returned to clients
  country      String
  season       Int
  type         CompetitionType @default(LEAGUE)
  leagueSlug   String?               // e.g. "premier-league"; null for Total mode
  gwCount      Int                   // natural season length (PL=38, BL=34, L1=34, SA=38, LL=38; Total=0/dynamic)
  isActive     Boolean         @default(true)
  alias        CompetitionAlias?
  clubs        Club[]
  gameweeks    Gameweek[]
  fixtures     Fixture[]
  fantasyTeams FantasyTeam[]
  fantasyLeagues FantasyLeague[]
  playerPrices  PlayerCompetitionPrice[]
  priceHistory  PlayerPriceHistory[]
}

model CompetitionAlias {
  competitionId Int     @id
  name          String   // "England Top Flight"
  shortName     String?  // "ETF"
  updatedAt     DateTime @updatedAt
  competition   Competition @relation(fields: [competitionId], references: [id])
}

model Club {
  id            Int      @id   // API-Football team ID
  realName      String         // internal only — never returned to clients
  logoUrl       String?
  competitionId Int
  competition   Competition @relation(fields: [competitionId], references: [id])
  alias         ClubAlias?
  players       Player[]
  homeFixtures  Fixture[] @relation("HomeClub")
  awayFixtures  Fixture[] @relation("AwayClub")
}

model ClubAlias {
  clubId    Int     @id
  name      String   // "Manchester Red"
  shortName String?  // "MRD"
  city      String?  // "Manchester"
  updatedAt DateTime @updatedAt
  club      Club @relation(fields: [clubId], references: [id])
}

model Player {
  id               Int      @id   // API-Football player ID
  realName         String         // internal only — never returned to clients
  position         Position
  clubId           Int
  club             Club @relation(fields: [clubId], references: [id])
  isAvailable      Boolean  @default(true)
  alias            PlayerAlias?
  competitionPrices PlayerCompetitionPrice[]
  priceHistory     PlayerPriceHistory[]
  performances     PlayerPerformance[]
  picks            PlayerPick[]
  transfersIn      Transfer[] @relation("PlayerIn")
  transfersOut     Transfer[] @relation("PlayerOut")
}

model PlayerAlias {
  playerId  Int     @id
  name      String   // "M. Rashstone"
  updatedAt DateTime @updatedAt
  player    Player @relation(fields: [playerId], references: [id])
}

model PlayerCompetitionPrice {
  playerId      Int
  player        Player      @relation(fields: [playerId], references: [id])
  competitionId Int
  competition   Competition @relation(fields: [competitionId], references: [id])
  currentPrice  Decimal     @db.Decimal(5, 1)

  @@id([playerId, competitionId])
}

model PlayerPriceHistory {
  id            Int      @id @default(autoincrement())
  playerId      Int
  player        Player      @relation(fields: [playerId], references: [id])
  competitionId Int
  competition   Competition @relation(fields: [competitionId], references: [id])
  price         Decimal  @db.Decimal(5, 1)
  changedAt     DateTime @default(now())

  @@index([playerId, competitionId, changedAt])
}

model Gameweek {
  id            Int            @id @default(autoincrement())
  competitionId Int
  competition   Competition    @relation(fields: [competitionId], references: [id])
  number        Int
  deadlineTime  DateTime
  status        GameweekStatus @default(SCHEDULED)
  isCurrent     Boolean        @default(false)
  fixtures        Fixture[]
  picks           PlayerPick[]
  transfers       Transfer[]
  scores          GameweekScore[]
  performances    PlayerPerformance[]
  chipActivations ChipActivation[]

  @@unique([competitionId, number])
  @@index([competitionId, isCurrent])
}

model Fixture {
  id            Int      @id   // API-Football fixture ID
  competitionId Int
  competition   Competition @relation(fields: [competitionId], references: [id])
  gameweekId    Int
  gameweek      Gameweek @relation(fields: [gameweekId], references: [id])
  homeClubId    Int
  homeClub      Club @relation("HomeClub", fields: [homeClubId], references: [id])
  awayClubId    Int
  awayClub      Club @relation("AwayClub", fields: [awayClubId], references: [id])
  kickoffAt     DateTime
  status        String   // SCHEDULED | LIVE | FINISHED
  homeGoals     Int?
  awayGoals     Int?
  performances  PlayerPerformance[]

  @@index([gameweekId, status])
  @@index([kickoffAt])
}

// ─── Scoring Entities ──────────────────────────────────────────────────────

model PlayerPerformance {
  id              Int      @id @default(autoincrement())
  playerId        Int
  player          Player   @relation(fields: [playerId], references: [id])
  fixtureId       Int?     // null for blank-GW placeholder rows (player's club has no fixture)
  fixture         Fixture? @relation(fields: [fixtureId], references: [id])
  gameweekId      Int
  gameweek        Gameweek @relation(fields: [gameweekId], references: [id])
  minutesPlayed   Int      @default(0)
  goalsScored     Int      @default(0)
  assists         Int      @default(0)
  cleanSheet      Boolean  @default(false)
  goalsConceded   Int      @default(0)
  ownGoals        Int      @default(0)
  penaltiesSaved  Int      @default(0)
  penaltiesMissed Int      @default(0)
  yellowCards     Int      @default(0)
  redCards        Int      @default(0)
  saves           Int      @default(0)
  bonus           Int      @default(0)
  totalPoints     Int      @default(0)
  pointsBreakdown Json                  // { minutes: 2, goals: 10, assists: 3, ... }
  isFinalised     Boolean  @default(false)

  @@unique([playerId, fixtureId])   // fixture rows: prevents duplicate per player+fixture
  @@index([gameweekId, playerId])
  // Blank-GW uniqueness (fixtureId IS NULL) cannot be expressed in Prisma.
  // Add raw SQL partial index in migration:
  //   CREATE UNIQUE INDEX "pp_blank_gw_unique" ON "PlayerPerformance" ("playerId", "gameweekId") WHERE "fixtureId" IS NULL;
}

// ─── Users & Auth ──────────────────────────────────────────────────────────

model User {
  id           String   @id @default(uuid())
  email        String   @unique
  username     String   @unique
  passwordHash String
  role         Role     @default(USER)
  createdAt    DateTime @default(now())
  refreshTokens         RefreshToken[]
  fantasyTeams          FantasyTeam[]
  leagueMemberships     FantasyLeagueMembership[]
}

model RefreshToken {
  id        Int      @id @default(autoincrement())
  token     String   @unique
  userId    String
  user      User     @relation(fields: [userId], references: [id])
  expiresAt DateTime
  revoked   Boolean  @default(false)
  createdAt DateTime @default(now())

  @@index([userId, revoked])
}

// ─── Fantasy Game ──────────────────────────────────────────────────────────

model FantasyTeam {
  id            String   @id @default(uuid())
  userId        String
  user          User     @relation(fields: [userId], references: [id])
  competitionId Int
  competition   Competition @relation(fields: [competitionId], references: [id])
  name          String
  budget        Decimal  @db.Decimal(6, 1) @default(100.0)
  totalValue    Decimal  @db.Decimal(6, 1) @default(0.0)
  formation     String   @default("4-4-2")
  freeTransfers Int      @default(1)   // tracks banked free transfers (1 or 2)
  picks         PlayerPick[]
  transfers     Transfer[]
  scores        GameweekScore[]
  chipActivations ChipActivation[]
  leagueMemberships FantasyLeagueMembership[]

  @@unique([userId, competitionId])
}

model ChipActivation {
  id            Int      @id @default(autoincrement())
  fantasyTeamId String
  fantasyTeam   FantasyTeam @relation(fields: [fantasyTeamId], references: [id])
  chip          ChipType
  gameweekId    Int
  gameweek      Gameweek @relation(fields: [gameweekId], references: [id])
  halfSeason    Int      // 1 = GW1–19; 2 = GW20–38; derived from GW number at activation time
  activatedAt   DateTime @default(now())

  @@unique([fantasyTeamId, chip, halfSeason])  // one wildcard per half-season per team
  @@index([fantasyTeamId])
}

model PlayerPick {
  id            Int      @id @default(autoincrement())
  fantasyTeamId String
  fantasyTeam   FantasyTeam @relation(fields: [fantasyTeamId], references: [id])
  playerId      Int
  player        Player   @relation(fields: [playerId], references: [id])
  gameweekId    Int
  gameweek      Gameweek @relation(fields: [gameweekId], references: [id])
  isCaptain     Boolean  @default(false)
  isViceCaptain Boolean  @default(false)
  isStarting    Boolean  @default(true)
  benchOrder    Int?     // 1–4 for bench; null for starters
  multiplier    Int      @default(1)  // set to 2 for captain during finalisation

  @@unique([fantasyTeamId, playerId, gameweekId])
  @@index([fantasyTeamId, gameweekId])
}

model Transfer {
  id             Int      @id @default(autoincrement())
  fantasyTeamId  String
  fantasyTeam    FantasyTeam @relation(fields: [fantasyTeamId], references: [id])
  gameweekId     Int
  gameweek       Gameweek @relation(fields: [gameweekId], references: [id])
  playerOutId    Int
  playerOut      Player   @relation("PlayerOut", fields: [playerOutId], references: [id])
  playerInId     Int
  playerIn       Player   @relation("PlayerIn", fields: [playerInId], references: [id])
  priceOut       Decimal  @db.Decimal(5, 1)
  priceIn        Decimal  @db.Decimal(5, 1)
  isWildcard     Boolean  @default(false)
  pointsDeducted Int      @default(0)
  createdAt      DateTime @default(now())

  @@index([fantasyTeamId, gameweekId])
}

model GameweekScore {
  id            Int      @id @default(autoincrement())
  fantasyTeamId String
  fantasyTeam   FantasyTeam @relation(fields: [fantasyTeamId], references: [id])
  gameweekId    Int
  gameweek      Gameweek @relation(fields: [gameweekId], references: [id])
  points        Int      @default(0)  // this GW only (including transfer deductions)
  totalPoints   Int      @default(0)  // cumulative across all GWs
  rank          Int?
  isFinalised   Boolean  @default(false)

  @@unique([fantasyTeamId, gameweekId])
  @@index([gameweekId, points])   // fast leaderboard ORDER BY
}

model FantasyLeague {
  id            Int      @id @default(autoincrement())
  name          String
  code          String   @unique   // 8-char alphanumeric invite code
  competitionId Int
  competition   Competition @relation(fields: [competitionId], references: [id])
  adminTeamId   String
  createdAt     DateTime @default(now())
  memberships   FantasyLeagueMembership[]
}

model FantasyLeagueMembership {
  id            Int      @id @default(autoincrement())
  leagueId      Int
  league        FantasyLeague @relation(fields: [leagueId], references: [id])
  fantasyTeamId String
  fantasyTeam   FantasyTeam @relation(fields: [fantasyTeamId], references: [id])
  userId        String
  user          User     @relation(fields: [userId], references: [id])
  joinedAt      DateTime @default(now())
  rank          Int?

  @@unique([leagueId, fantasyTeamId])
  @@index([leagueId])
}

// ─── Cosmetics & Inventory (Phase 2 — placeholder) ─────────────────────────
//
// When Phase 2 is implemented, add:
//   model CosmeticItem   { id, type (EMBLEM|CARD_SKIN|TITLE|KIT|GIF_CHARACTER), name, imageUrl, price, ... }
//   model UserInventory  { id, userId, cosmeticItemId, acquiredAt, ... }
//   model EquippedCosmetic { userId, fantasyTeamId?, slot, cosmeticItemId, ... }
//
// See game_design.md § Business Model for the full cosmetics list.
```

---

## Key Indexes Summary

| Table | Index | Purpose |
|---|---|---|
| `GameweekScore` | `(gameweekId, points)` | Fast leaderboard `ORDER BY` |
| `PlayerPick` | `(fantasyTeamId, gameweekId)` | Load team picks per GW |
| `PlayerPerformance` | `UNIQUE(playerId, fixtureId)` | Unique per player+fixture (non-null) |
| `PlayerPerformance` | `(gameweekId, playerId)` | Aggregate GW performance per team |
| `PlayerPerformance` | Partial `UNIQUE(playerId, gameweekId) WHERE fixtureId IS NULL` | One blank-GW row per player per GW — raw SQL in migration |
| `PlayerCompetitionPrice` | `PK(playerId, competitionId)` | Direct current price lookup |
| `PlayerPriceHistory` | `(playerId, competitionId, changedAt)` | Price history per competition |
| `ChipActivation` | `UNIQUE(fantasyTeamId, chip, halfSeason)` | One wildcard per half-season |
| `ChipActivation` | `(fantasyTeamId)` | Load all chips for a team |
| `Fixture` | `(gameweekId, status)` | Find finished/scheduled fixtures in GW |
| `Fixture` | `(kickoffAt)` | Cron job: find matches kickoffAt < now()-2h |
| `Gameweek` | `(competitionId, isCurrent)` | Fast current GW lookup |
| `Gameweek` | `UNIQUE(competitionId, number)` | Prevent duplicate GW numbers |
| `RefreshToken` | `(userId, revoked)` | Find valid tokens for user |
| `Transfer` | `(fantasyTeamId, gameweekId)` | Load GW transfers for accounting |

---

## Migration Strategy

- **Dev**: `npx prisma migrate dev --name <description>` — creates migration file + applies it
- **Prod**: `npx prisma migrate deploy` — applies all pending migrations (no interactive prompts)
- **Rule**: Never edit applied migration files; always create new ones
- **Naming convention**: `YYYYMMDD_description` (Prisma auto-timestamps)

---

## Soft Delete Policy

| Entity | Policy |
|---|---|
| Player | `isAvailable = false` — never hard-deleted; existing picks preserved |
| Fixture | Never deleted; `status` field tracks lifecycle |
| Gameweek | Never deleted; `status` field tracks lifecycle |
| User | Soft delete not implemented in MVP (admin can manually deactivate) |
| FantasyTeam | Never deleted; preserves historical GameweekScore data |

---

## Open Questions Resolved

| Question | Decision |
|---|---|
| Multi-season support | `@@unique([userId, competitionId])` is correct for now — different seasons are different Competition records (new `season` field); if we ever need same competitionId across seasons, revisit |
| PlayerPerformance for 0-minute players | YES — always write a row (with minutesPlayed=0) for all squad members in each fixture; needed for auto-sub logic during finalisation |
| Blank-GW PlayerPerformance | `fixtureId` is nullable; blank-GW rows have `fixtureId = null`; uniqueness enforced by partial SQL index `UNIQUE(playerId, gameweekId) WHERE fixtureId IS NULL` (add in migration) |
| Deadline time rule | Auto-set: `deadlineTime = MIN(fixture.kickoffAt in GW) - 90 minutes`; seeded by bootstrap job |
| Retired players | `isAvailable = false`; picks preserved; transfer away is free at current price |
| Independent price markets | `PlayerCompetitionPrice(playerId, competitionId)` stores current price per competition; `PlayerPriceHistory` also scoped by `competitionId`; price change jobs operate per competition |
| Chip tracking | `ChipActivation` table; `@@unique([fantasyTeamId, chip, halfSeason])` enforces one wildcard per half (halfSeason=1 for GW1–19, halfSeason=2 for GW20–38); DB constraint prevents double use |
| Club–Competition in Total mode | Clubs are scoped to their real competition; Total mode selects players from any club regardless of `competitionId`; `Competition(type=TOTAL).clubs` is empty by design |
| FantasyTeam.formation | Stores current formation only (overwritten each GW); no per-GW formation history |
