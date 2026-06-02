# Simulation UI — Design Spec

> Last updated: 2026-06-02

---

## Goal

Add a **Simulation** tab to the admin page that lets the developer drive the full GW simulation loop — create bots, open GWs for picks, submit bot picks, finalize scores — with clear status indicators and a history of completed GWs.

---

## Scope

- Frontend only for the UI. One new backend endpoint (`GET /admin/simulate/status`) completes the backend surface.
- Competition hardwired to `id = 39` (Premier League) — MVP default.
- No mobile-specific layout needed; admin page is desktop-only.

---

## New Backend Endpoint

### `GET /admin/simulate/status`

Returns everything the simulation UI needs on initial load.

**Response:**
```json
{
  "data": {
    "botCount": 5,
    "competitionId": 39,
    "currentGameweek": {
      "id": 4,
      "number": 4,
      "status": "SCHEDULED",
      "deadlineTime": "2024-09-14T12:00:00Z"
    },
    "finishedGameweeks": [
      { "id": 3, "number": 3, "teamsScored": 6, "deadlineTime": "2024-09-07T12:00:00Z" },
      { "id": 2, "number": 2, "teamsScored": 6, "deadlineTime": "2024-08-31T12:00:00Z" }
    ]
  }
}
```

- `botCount`: count of users with email matching `@sim.test` in the DB
- `currentGameweek`: the GW where `isCurrent = true` for competition 39; `null` if none
- `finishedGameweeks`: all GWs with `status = 'FINISHED'` for competition 39, sorted by `number DESC`; each includes `teamsScored` from `COUNT(GameweekScore WHERE gameweekId = X)`

**Backend location:** `SimulationService.getStatus()` + `SimulationController GET /admin/simulate/status`

---

## Component Structure

### Files to create/modify

| File | Change |
|---|---|
| `apps/web/src/pages/admin/AdminSimulation.tsx` | New — full simulation tab component |
| `apps/web/src/api/hooks/useAdminSimulation.ts` | New — TanStack Query hooks for simulation endpoints |
| `apps/web/src/pages/admin/AdminPage.tsx` | Add `'simulation'` tab |

### Data flow

```
AdminSimulation
  ├── useSimulationStatus()          → GET /admin/simulate/status  (query, refetch on mutation success)
  ├── useCreateBots()                → POST /admin/simulate/bots
  ├── useOpenGameweek()              → POST /admin/simulate/gw/:id/open
  ├── useSubmitBotPicks()            → POST /admin/simulate/gw/:id/bot-picks
  └── useFinalizeGameweek()          → POST /admin/simulate/gw/:id/finalize
```

`useSimulationStatus()` is invalidated after every mutation succeeds, so the page self-updates after each action.

---

## UI Layout

Three stacked areas inside the tab content:

```
┌─────────────────────────────────────┐
│  BOT SETUP CARD                     │
└─────────────────────────────────────┘
┌─────────────────────────────────────┐
│  CURRENT GW CARD + STEPPER          │
└─────────────────────────────────────┘
┌─────────────────────────────────────┐
│  GW HISTORY TABLE                   │
└─────────────────────────────────────┘
```

---

## Bot Setup Card

### No bots (botCount = 0)

- Card with neon border (`border-game-neon/30`)
- Label: "Bot Players"
- Number input: label "Number of bots", default `5`, min `1`, max `20`
- Button: "Create Bots" — calls `useCreateBots({ count, competitionId: 39 })`
- On success: toast "5 bots created" + status query invalidated → card transitions to collapsed state

### Bots exist (botCount > 0)

- Collapsed appearance: lower opacity, no neon border
- Single line: `● 5 bots active · Premier League`
- Small muted "Reset" button — re-runs `createBots` with existing count input
- The number input is hidden in this state (reset uses the same default count or last-used count)

---

## Current GW Card

### Card header

`GW {number}  ·  {status badge}  ·  Deadline: {formatted deadlineTime}`

Status badge colors:
- `SCHEDULED`: slate/grey
- `SCORING`: amber
- `FINISHED`: green

If `currentGameweek` is null: show "No active gameweek — all GWs may be finished." with no stepper.

### Stepper

Four steps in a horizontal row with connecting lines:

```
[1 Open] ——— [2 Your Picks] ——— [3 Bot Picks] ——— [4 Finalize]
```

**Step state derivation (client-side, from `currentGameweek`):**

| Condition | Active step |
|---|---|
| `status = 'FINISHED'` | All done — show "Next GW →" button |
| `status = 'SCORING'` | Step 4 in progress |
| `deadlineTime > now` | Steps 2 + 3 are active |
| `deadlineTime ≤ now` | Step 1 is active |

**Step 1 — Open**
- Active when `deadlineTime ≤ now()`
- Button: "Open GW" — calls `useOpenGameweek(gwId, { minutesFromNow: 60 })`
- On success: toast "GW opened — 60 min to deadline" + status refetch
- Done indicator: ✓ (green) when deadline is in the future

**Step 2 — Your Picks**
- No action button
- Info text (amber): "Submit your picks in the main app before the deadline"
- Treated as done when deadline is in the future (can't verify from admin)

**Step 3 — Bot Picks**
- Active when `deadlineTime > now()`
- Button: "Submit Bot Picks" — calls `useSubmitBotPicks(gwId)`
- On success: inline result `"5 bots · 3 seeded, 2 existing"` + toast

**Step 4 — Finalize**
- Active when `status !== 'FINISHED'`
- Button: "Finalize GW" — calls `useFinalizeGameweek(gwId)`
- On success: inline result `"6 teams scored"` + toast "GW {n} finalized" + status refetch
- After finalize: "Next GW →" button appears; clicking it calls `useOpenGameweek(nextGameweekId, { minutesFromNow: 60 })` (using `nextGameweekId` from the finalize mutation response) then triggers status refetch — the current GW card updates to show the new GW with deadline 60 min from now and Step 2 highlighted. If `nextGameweekId` is null (all GWs done), the button shows "All GWs Complete" and is disabled.

**Loading states:** Each button shows a spinner and is disabled while its mutation is `isPending`.

**Error states:** Each step shows a red inline error message (not just a toast) if its mutation fails, so the error persists until the next action.

---

## GW History Table

Shown below the current GW card. Sorted newest first.

| Column | Source |
|---|---|
| GW | `number` |
| Status | `status` — always `FINISHED` with green badge |
| Teams Scored | `teamsScored` |
| Deadline | `deadlineTime` formatted as `DD MMM YYYY` |

Empty state (no finished GWs): `"No gameweeks finalized yet."` in muted text.

No actions on history rows — read-only.

---

## Toast Notifications

Same pattern as existing admin tabs: local `useState<string | null>` with a 4-second auto-dismiss. One toast instance shared across the whole tab. Positioned at top-right of the tab content area (consistent with existing tabs).

---

## Styling

Follows existing admin design system:
- Background: `bg-game-bg` / `bg-game-card`
- Borders: `border-white/10`
- Neon accent: `text-game-neon` / `border-game-neon/30` for active/highlighted elements
- Gold: `text-game-gold` for Step 2 warning
- Muted: `text-slate-400` / `text-slate-500`
- Buttons follow existing `.btn-primary` / neon outline pattern from other admin tabs
- Status badges: inline `<span>` with small colored dot + text (same style as admin tables)

---

## Out of Scope

- Competition selector (hardwired to 39)
- Bot transfer between GWs (bots keep same squad each GW)
- Manually entering a GW ID
- Mobile layout
