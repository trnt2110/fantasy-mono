# Fantasy Football Game — API Design

> **Living document.** Updated at the end of each implementation phase to reflect what was actually built.
> Last updated: Phase 0 (bootstrap)

---

## Base URL

- Development: `http://localhost:3000`
- Production: `https://api.yourdomain.com`

---

## Auth

- `JwtAuthGuard` applied globally; routes marked `@Public()` skip it
- Access token: `Authorization: Bearer <token>`, expires 15 minutes
- Refresh token: stored in DB (`RefreshToken` table), expires 7 days, rotated on use
- All JWT payloads include: `{ sub: userId, email, role }`

---

## Standard Response Shape

```json
// Success (single resource)
{ "data": { ... } }

// Success (paginated list)
{ "data": [...], "meta": { "page": 1, "limit": 20, "total": 500, "totalPages": 25 } }

// Error (global HttpExceptionFilter)
{ "statusCode": 400, "message": "Validation failed", "errors": ["field: reason"] }
```

---

## Endpoints

### Auth (`/auth`)

| Method | Path | Auth | Body | Description |
|---|---|---|---|---|
| POST | `/auth/register` | Public | `{ email, username, password }` | Create account |
| POST | `/auth/login` | Public | `{ email, password }` | Returns `{ accessToken, refreshToken }` |
| POST | `/auth/refresh` | Public | `{ refreshToken }` | Exchange refresh token for new pair |
| POST | `/auth/logout` | JWT | `{ refreshToken }` | Revoke refresh token |

---

### Users (`/users`)

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/users/me` | JWT | Get current user profile (id, email, username, role) |
| PATCH | `/users/me` | JWT | Update username |

---

### Competitions (`/competitions`)

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/competitions` | Public | List active competitions (alias-resolved names) |
| GET | `/competitions/:id/gameweeks` | Public | Gameweeks with deadlines and statuses |

---

### Clubs (`/clubs`)

| Method | Path | Auth | Query | Description |
|---|---|---|---|---|
| GET | `/clubs` | Public | `?competitionId=` | List clubs in a competition (alias-resolved) |

---

### Players (`/players`)

| Method | Path | Auth | Query | Description |
|---|---|---|---|---|
| GET | `/players` | Public | `?competitionId=&position=&clubId=&minPrice=&maxPrice=&search=&page=&limit=` | Paginated player list |
| GET | `/players/:id` | Public | — | Player detail + current price + ownership % |
| GET | `/players/:id/performances` | Public | `?competitionId=` | GW-by-GW performance history with points breakdown |

**Ownership %** = count of FantasyTeams picking this player / total FantasyTeams in competition × 100

---

### Gameweeks (`/gameweeks`)

| Method | Path | Auth | Query | Description |
|---|---|---|---|---|
| GET | `/gameweeks/current` | Public | `?competitionId=` | Current active GW + deadline time |

---

### Fixtures (`/fixtures`)

| Method | Path | Auth | Query | Description |
|---|---|---|---|---|
| GET | `/fixtures` | Public | `?gameweekId=` | All fixtures for a gameweek |
| GET | `/fixtures` | Public | `?clubId=` | Upcoming fixtures for a club |

---

### Fantasy Teams (`/fantasy-teams`)

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/fantasy-teams` | JWT | Create team — validates 15 players, budget ≤ 100.0, position limits, ≤ 3 per club |
| GET | `/fantasy-teams/mine` | JWT | `?competitionId=` — get my team |
| GET | `/fantasy-teams/:id` | JWT | Get any team (alias-resolved names, no private info) |

**Create team request body:**
```json
{
  "competitionId": 39,
  "name": "My Team Name",
  "playerIds": [1, 2, 3, ...],  // exactly 15 player IDs
  "formation": "4-4-2",
  "startingIds": [1, 2, ...],   // exactly 11 from playerIds
  "captainId": 5,
  "viceCaptainId": 3,
  "benchOrder": { "12": 1, "7": 2, "9": 3, "4": 4 }  // playerId → bench position
}
```

---

### Picks (`/picks`)

| Method | Path | Auth | Description |
|---|---|---|---|
| PUT | `/picks/:gameweekId` | JWT | Submit GW picks snapshot; blocked by `GameweekOpenGuard` after deadline |
| GET | `/picks/:gameweekId` | JWT | Get my picks for a GW |

**GameweekOpenGuard:** Returns `403 Forbidden` if `Gameweek.deadlineTime < now()` or `Gameweek.status !== SCHEDULED | ACTIVE`.

**PUT body:**
```json
{
  "fantasyTeamId": "uuid",
  "startingPlayerIds": [1, 2, ...],  // 11 IDs
  "captainId": 5,
  "viceCaptainId": 3,
  "benchOrder": { "12": 1, "7": 2, "9": 3, "4": 4 }
}
```

---

### Transfers (`/transfers`)

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/transfers` | JWT | Execute transfer; blocked after deadline |
| GET | `/transfers` | JWT | `?gameweekId=` — my transfers for a GW |

**POST body:**
```json
{
  "fantasyTeamId": "uuid",
  "playerOutId": 5,
  "playerInId": 88,
  "activateWildcard": false
}
```

**Transfer execution logic:**
1. Validate deadline not passed
2. Validate playerOut is in current squad
3. Validate playerIn is available and not already in squad
4. Validate budget: `budget + playerOut.currentPrice - playerIn.currentPrice >= 0`
5. Validate max 3 per club after swap
6. Validate position slot preserved (GK in for GK, etc.)
7. Execute in Prisma transaction: update budget, create Transfer row, update PlayerPick squad
8. Calculate `pointsDeducted`: max(0, (transferCount - freeTransfers) × 4)

---

### Leaderboard (`/leaderboard`)

| Method | Path | Auth | Query | Description |
|---|---|---|---|---|
| GET | `/leaderboard/global` | Public | `?competitionId=&gameweekId=&page=&limit=` | Global standings (cached 5min) |

**Response** includes rank, team name, manager username, GW points, total points per entry.

---

### Fantasy Leagues (`/fantasy-leagues`)

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/fantasy-leagues` | JWT | Create private league (generates invite code) |
| POST | `/fantasy-leagues/join` | JWT | `{ code }` — join by invite code |
| GET | `/fantasy-leagues/mine` | JWT | List my leagues |
| GET | `/fantasy-leagues/:id/standings` | JWT (member) | League standings `?gameweekId=` |

---

### Admin (`/admin`) — `ADMIN` role required

| Method | Path | Description |
|---|---|---|
| GET | `/admin/aliases` | `?unaliasedOnly=true` — list entities needing in-game names |
| PATCH | `/admin/aliases/competition/:id` | Set competition alias `{ name, shortName }` |
| PATCH | `/admin/aliases/club/:id` | Set club alias `{ name, shortName, city }` |
| PATCH | `/admin/aliases/player/:id` | Set player alias `{ name }` |
| POST | `/admin/aliases/bulk` | Bulk import via CSV body |
| POST | `/admin/sync/bootstrap` | Trigger season bootstrap job |
| POST | `/admin/sync/fixture/:id` | Manually trigger performance-sync for a fixture |
| GET | `/admin/sync/status` | View BullMQ job queue status |

---

## Alias Resolution Rule

Every module that returns football entities MUST call `AliasService` before serializing responses:

```typescript
// WRONG — exposes realName
return player;

// CORRECT — always do this
return this.aliasService.resolvePlayer(player);

// resolvePlayer output:
{
  id: 42,
  name: "M. Rashstone",    // alias.name ?? '[Unnamed]'
  position: "FWD",
  clubId: 33,
  currentPrice: 12.5,
  isAvailable: true,
  isAliased: true           // false = no alias set yet
}
```

---

## API-Football Sync Pipeline

```
[Cron: every 2h during active GW]
  fixture-result-check BullMQ job
    → query DB: Fixture WHERE status='SCHEDULED' AND kickoffAt < now()-2h AND gameweek=current
    → GET /fixtures?id=X from API-Football (per unresolved fixture)
    → if status=FT: update Fixture { status='FINISHED', homeGoals, awayGoals }
    → enqueue performance-sync job for each newly finished fixture

[performance-sync job] concurrency: 2
  → GET /fixtures/players?fixture=X    (player stats: goals, assists, cards, etc.)
  → GET /fixtures/lineups?fixture=X    (lineups + substitutions for minutesPlayed)
  → upsert PlayerPerformance rows (create or update, including 0-minute rows for all squad players)
  → ScoringService.calculatePlayerPoints() → store totalPoints + pointsBreakdown JSON
  → check: if ALL Fixtures in Gameweek are FINISHED → enqueue gameweek-finalise

[gameweek-finalise job] concurrency: 1
  → for each FantasyTeam in competition:
      1. resolve captain (2× or vice-captain fallback)
      2. apply auto-substitutions (0-min starters replaced by bench)
      3. sum PlayerPerformance.totalPoints for resolved starting XI
      4. subtract transfer point deductions for this GW
      5. upsert GameweekScore { points, totalPoints (cumulative), isFinalised: true }
      6. update rank for all teams (ORDER BY totalPoints DESC)
  → update Gameweek.status = FINISHED, isCurrent = false
  → set next Gameweek.isCurrent = true (if exists)
  → enqueue player-price-update
  → invalidate Redis leaderboard cache keys

[player-price-update job] concurrency: 1
  → calculate net transfer delta per player since last GW
  → threshold: net_in > 2% of total teams → +0.1m; net_out > 2% → -0.1m
  → clamp to [4.0, 15.0]
  → upsert Player.currentPrice + write PlayerPriceHistory
  → invalidate Redis players:list cache keys
```

---

## Rate Limit Protection (API-Football Client)

```
Redis key: api_football:requests:{YYYY-MM-DD}
  INCR on each outbound request
  Set TTL to end of day (86400s from midnight)

On request:
  if count > 95 → throw RateLimitException (503)
  if count > 80 → log.warn("API-Football daily limit at 80%")

Response caching:
  Key: api_football:cache:{sha256(endpoint + JSON.stringify(params))}
  TTL: 3600 seconds (60 min)
  Strategy: cache-aside (check before request, store after successful response)
```

---

## Redis Cache Strategy

| Key Pattern | TTL | Invalidated by |
|---|---|---|
| `players:list:{sha256(filters)}` | 5 min | player-price-update job |
| `players:{id}` | 10 min | performance-sync job |
| `fixtures:gw:{gameweekId}` | 30 min | fixture-result-check job |
| `gameweek:current:{competitionId}` | 2 min | fixture-result-check job |
| `leaderboard:global:{compId}:{gwId}:{page}` | 5 min | gameweek-finalise job |
| `leaderboard:league:{id}:{gwId}` | 5 min | gameweek-finalise job |
| `api_football:cache:{hash}` | 60 min | Never (external API cache) |

**Cache implementation:** `RedisService.getOrSet(key, ttl, fetchFn)` — checked in service layer, not controller layer.

---

## Sync Bootstrap Strategy

**Development (free tier - 100 req/day):**
1. Run bootstrap once against the API
2. Export Postgres dump: `pg_dump fantasy > seed.sql`
3. Commit `seed.sql` to repo
4. CI/CD restores from seed (no API calls needed in dev/test)

**Production (paid tier - 7,500 req/day):**
1. Run bootstrap from API at season start (~30-50 requests)
2. Ongoing: 2h sync cron uses ~5-10 requests per active matchday
3. Budget: ~100-200 requests per day on active weekends; well within 7,500 limit
