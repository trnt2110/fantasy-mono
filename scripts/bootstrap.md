# Bootstrap Script

Seeds the database with competition, club, gameweek, and fixture data from API-Football. Run this once per season before the game goes live.

## Prerequisites

| Requirement | Install |
|---|---|
| `jq` | `brew install jq` |
| `psql` | `brew install postgresql` |
| API running | see [Dev Setup](#dev-setup) |
| Docker running | Postgres + Redis containers |

## Dev Setup

Start infrastructure and API if not already running:

```bash
docker compose up -d

cd apps/api
DATABASE_URL="postgresql://fantasy_user:fantasy_pass@localhost:5432/fantasy" \
REDIS_URL="redis://localhost:6379" \
JWT_SECRET="test-secret" JWT_REFRESH_SECRET="test-refresh-secret" \
PORT=3001 pnpm nest start
```

## Usage

```bash
# From the repo root
./scripts/bootstrap.sh [season]
```

`season` is optional. Omit it to let each league auto-detect the current season from API-Football. Pass an explicit year when you know the season (e.g. `2025` for the 2025/26 season).

### Examples

```bash
# Auto-detect season per league (recommended for first run)
./scripts/bootstrap.sh

# Explicit season
./scripts/bootstrap.sh 2025

# Override all defaults via env vars
API_URL=http://localhost:3001 \
ADMIN_EMAIL=admin@fantasy.local \
ADMIN_PASSWORD=supersecret123 \
DATABASE_URL="postgresql://fantasy_user:fantasy_pass@localhost:5432/fantasy" \
./scripts/bootstrap.sh 2025
```

## Environment Variables

All variables have sensible defaults for local development.

| Variable | Default | Description |
|---|---|---|
| `API_URL` | `http://localhost:3001` | Base URL of the running API |
| `ADMIN_EMAIL` | `admin@fantasy.local` | Email for the admin account |
| `ADMIN_USERNAME` | `admin` | Username for the admin account |
| `ADMIN_PASSWORD` | `supersecret123` | Password (min 8 chars) |
| `DATABASE_URL` | `postgresql://fantasy_user:fantasy_pass@localhost:5432/fantasy` | Postgres connection string — must match the running API |

## What the Script Does

1. **Waits for API** — polls until the API responds (up to 40s)
2. **Creates admin user** — `POST /auth/register`; skips if already exists (409)
3. **Promotes to ADMIN** — runs `UPDATE "User" SET role = 'ADMIN'` via `psql`
4. **Logs in** — `POST /auth/login` to get a fresh JWT with the ADMIN role embedded
5. **Checks quota** — aborts if the API-Football daily limit (95 req/day) is already exhausted
6. **Triggers bootstrap** — `POST /admin/sync/bootstrap`; queues a BullMQ job
7. **Polls until done** — checks `GET /admin/sync/status` every 10s; exits early on failure
8. **Verifies** — confirms at least one competition was seeded via `GET /competitions`
9. **Prints next steps** — outputs the player-sync commands to run

## After Bootstrap

Bootstrap only seeds competitions, clubs, gameweeks, and fixtures (~12–15 API calls total). Players must be seeded separately to stay within the 100 req/day API-Football free plan.

Run one league per day:

```bash
# Get the admin JWT first
TOKEN=$(curl -s -X POST http://localhost:3001/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@fantasy.local","password":"supersecret123"}' \
  | jq -r '.accessToken')

curl -X POST http://localhost:3001/admin/sync/players/39  -H "Authorization: Bearer $TOKEN"  # Premier League
curl -X POST http://localhost:3001/admin/sync/players/140 -H "Authorization: Bearer $TOKEN"  # La Liga
curl -X POST http://localhost:3001/admin/sync/players/135 -H "Authorization: Bearer $TOKEN"  # Serie A
curl -X POST http://localhost:3001/admin/sync/players/78  -H "Authorization: Bearer $TOKEN"  # Bundesliga
curl -X POST http://localhost:3001/admin/sync/players/61  -H "Authorization: Bearer $TOKEN"  # Ligue 1
```

Each player-sync call uses ~40 API requests. On the free plan (100 req/day), do one league per day.

## Re-running Bootstrap

If fantasy teams already exist in the database, bootstrap is blocked by default. To re-run (e.g. to refresh fixture data for a new season):

```bash
# Add force=true to the bootstrap payload — edit the script's BOOTSTRAP_PAYLOAD line, or call directly:
curl -X POST http://localhost:3001/admin/sync/bootstrap \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"season":2025,"force":true}'
```

> **Warning:** `force:true` bypasses the safety guard. If player IDs change between seasons, existing picks and transfers may reference orphaned player records.

## Troubleshooting

**`jq: command not found`**
```bash
brew install jq
```

**`psql: command not found`**
```bash
brew install postgresql
```

**`API did not respond after 20 attempts`**
The API is not running. Start it first — see [Dev Setup](#dev-setup).

**`Daily API-Football quota exhausted`**
The free plan allows 100 requests/day. Check usage:
```bash
curl http://localhost:3001/admin/sync/rate-limit -H "Authorization: Bearer $TOKEN"
```
Wait until UTC midnight for the counter to reset.

**`Bootstrap job failed`**
Check the API server logs for the error. Common causes:
- Invalid or expired `RAPIDAPI_KEY` environment variable in the API
- API-Football returned an unexpected response format
- Network issue reaching `api-football.com`

**`No competitions found after bootstrap`**
The job may have completed but seeded 0 leagues. Check the API logs for per-league errors and verify the `season` value is correct for the leagues you are targeting.
