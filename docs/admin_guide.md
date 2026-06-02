# Admin Guide — Gameplay Simulation

> For testing the full game loop when all real 2024 GW deadlines are in the past.

---

## Why simulation exists

All 2024 match data is already finished, so every gameweek deadline has passed. The normal pick/transfer UI is permanently blocked (`GameweekOpenGuard` rejects any request once `deadlineTime ≤ now()`). The simulation system lets you drive the full game loop manually — create fake players, rewind deadlines, generate synthetic match results, score everyone — without touching the BullMQ sync pipeline.

---

## Prerequisites

1. API + frontend both running:
   ```bash
   # Terminal 1
   cd apps/api && pnpm start:dev

   # Terminal 2
   cd apps/web && pnpm dev
   ```

2. At least one user registered and promoted to ADMIN:
   ```sql
   UPDATE "User" SET role = 'ADMIN' WHERE email = 'your@email.com';
   ```

3. Bootstrap data seeded (competitions, clubs, fixtures, gameweeks):
   ```bash
   TOKEN=$(curl -s -X POST http://localhost:3001/auth/login \
     -H "Content-Type: application/json" \
     -d '{"email":"your@email.com","password":"yourpassword"}' \
     | jq -r '.data.accessToken')

   curl -s -X POST http://localhost:3001/admin/sync/bootstrap \
     -H "Authorization: Bearer $TOKEN"
   ```

4. At least Premier League players seeded:
   ```bash
   curl -s -X POST http://localhost:3001/admin/sync/players/39 \
     -H "Authorization: Bearer $TOKEN"
   ```

5. Competition marked active (required for bot squad creation):
   ```sql
   UPDATE "Competition" SET "isActive" = true WHERE id = 39;
   ```

---

## Using the Simulation tab

Navigate to `http://localhost:5173/admin` → click **Simulation**.

The tab has three sections: Bot Setup, Current GW stepper, and GW History.

---

## Full GW simulation walkthrough

### Step 0 — Create bots (once)

The **Bot Setup** card is at the top. On first visit it shows "No bots yet".

1. Set the bot count (default 5, max 20).
2. Click **Create Bots**.

Each bot gets a random valid 15-player squad (2GK/5DEF/5MID/3FWD, max 3 per club, within £100m budget), registered as a FantasyTeam with GW1 picks already set.

After creation the card collapses to show `● N bots active · Premier League`. You only need to do this once — bots persist across sessions and GW cycles. If you click **Reset Bots** it re-runs creation but skips bots that already have a team.

---

### Step 1 — Open the GW

The **Current GW** card shows the active gameweek. After bootstrap, all GW deadlines are in the past (red `● PASSED` indicator), so the stepper highlights Step 1.

Click **Open GW** → sets the deadline 60 minutes from now.

The card updates: deadline shows as a future time with a green `● OPEN` indicator. Step 1 turns green (✓), Step 2 is now highlighted.

---

### Step 2 — Submit your own picks (in the main app)

Step 2 has no button — it's a reminder to go to the main app.

Open `http://localhost:5173/squad` in another tab. Log in as your regular (non-admin) user. You should see the squad page with the pick submission UI now active (deadline is in the future). Make your picks and save.

You have 60 minutes before the deadline. If you need more time, click **Open GW** again — it resets the deadline to 60 minutes from now.

---

### Step 3 — Seed bot picks

Click **Submit Bot Picks**.

For GW1: bots already have picks from `createBots`, so picksSeeded = 0 (that's normal — it means all bots are already set).

For GW2+: picks are copied from each bot's previous GW. The result shows how many teams were newly seeded vs already set.

The button label updates to `Bot Picks ✓ (N seeded)` after success.

---

### Step 4 — Finalize

Click **Finalize GW**.

This runs the full scoring pipeline synchronously:
1. Locks the deadline (sets it 1 minute in the past)
2. Generates synthetic `PlayerPerformance` data for every player in any pick
3. Marks all GW fixtures as FINISHED
4. Calls `ScoringService.finaliseGameweekScores()` — applies auto-subs, captain multiplier, writes `GameweekScore` rows
5. Advances `isCurrent` to the next GW
6. Invalidates Redis leaderboard caches

The GW card shows the `FINISHED` badge and a **Next GW →** button appears.

You can verify scores in the main app: `http://localhost:5173/squad` should now show points for the finalized GW.

---

### Repeat for next GW

Click **Next GW →** — opens the next GW (sets its deadline 60 minutes from now) and updates the Current GW card to show that GW.

Then repeat Steps 2–4.

---

## GW History

Below the stepper, the **GW History** table lists all finalized GWs with:
- GW number
- Teams scored (how many `GameweekScore` rows exist)
- Deadline date

The table is empty until you finalize your first GW.

---

## API reference (direct curl)

All endpoints require an admin JWT (`Authorization: Bearer $TOKEN`).

```bash
# Get simulation status
curl -s http://localhost:3001/admin/simulate/status \
  -H "Authorization: Bearer $TOKEN" | jq

# Create 5 bots for PL
curl -s -X POST http://localhost:3001/admin/simulate/bots \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"count":5,"competitionId":39}' | jq

# Open GW (replace GW_ID with the id from /admin/simulate/status)
curl -s -X POST http://localhost:3001/admin/simulate/gw/$GW_ID/open \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"minutesFromNow":60}' | jq

# Seed bot picks
curl -s -X POST http://localhost:3001/admin/simulate/gw/$GW_ID/bot-picks \
  -H "Authorization: Bearer $TOKEN" | jq

# Finalize GW
curl -s -X POST http://localhost:3001/admin/simulate/gw/$GW_ID/finalize \
  -H "Authorization: Bearer $TOKEN" | jq
```

---

## Troubleshooting

**"Competition 39 is not active"** when creating bots:
```sql
UPDATE "Competition" SET "isActive" = true WHERE id = 39;
```

**"No current gameweek for competition 39"** when creating bots:
Bootstrap hasn't been run, or no GW has `isCurrent = true`. Check via Prisma Studio (`pnpm exec prisma studio` from `apps/api/`).

**Bot picks show 0 seeded on GW2+**:
This is normal if bots already had picks copied from a previous run. "0 seeded, N already set" means all bots are covered.

**Finalize fails mid-loop** (rare — Prisma error in logs):
Check that at least one fixture exists for the GW (`fixtureId` on `PlayerPerformance` is nullable but must FK to a real fixture if non-null). Run `GET /admin/simulate/status` to confirm `currentGameweek` is set.

**Score page still shows 0 pts after finalize**:
Redis leaderboard caches are invalidated by finalize, but the frontend query has its own TTL. Hard-refresh the page or wait for the TanStack Query stale time to expire.
