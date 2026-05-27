# Create Team Onboarding Flow — Design Spec
**Date:** 2026-05-27  
**Status:** Approved

---

## Overview

New users who register have no fantasy team and currently hit a 404 error on SquadSelection. This spec defines a 3-step standalone wizard at `/onboarding` that collects all data required by `POST /fantasy-teams` and redirects to `/squad` on success.

---

## Routing & Guard Logic

### New route
- `/onboarding` — standalone full-screen page, same visual style as Login/Register (no AppShell, no sidebar, no bottom nav)
- Protected: requires auth (redirected to `/login` if not logged in)

### Guard behaviour
1. **Register flow:** `Register.tsx` redirects to `/onboarding` on success instead of `/`
2. **AppShell:** calls `useMyFantasyTeam()` on mount; if the query throws a 404 (NotFoundException), redirect to `/onboarding`
3. **`/onboarding` itself:** if `useMyFantasyTeam()` succeeds (team exists), redirect to `/squad` immediately

### App.tsx change
Add `/onboarding` as a `ProtectedRoute` outside `AppShell`, similar to how `/login` and `/register` are separate.

---

## Wizard Steps

### Step 1 — Build Squad (Pick 15 Players)

**Goal:** user selects exactly 2 GK + 5 DEF + 5 MID + 3 FWD from the player database.

**Layout:**
- **Desktop (≥ lg):** split — left panel is player list + filters, right panel is live pitch diagram showing 15 slots
- **Mobile (< lg):** two tabs at top — "Players" (default) and "Pitch"; each tab is full-screen

**Player list panel:**
- Position tabs: GKP / DEF / MID / FWD (shows `filled/required` count per tab, e.g. `GKP 1/2`)
- Search input (client-side filter on player name)
- Price filter (max price slider or input)
- Player rows: jersey icon, name, club, position badge, price, +/− button
- Already-selected players show a red ✕ (remove); available players show a green +
- Uses existing `usePlayers({ competitionId, position })` and `useClubsMap()` hooks

**Pitch panel:**
- Shows 15 position slots grouped as: 2 GK rows, 5 DEF row, 5 MID row, 3 FWD row, then a dashed separator + 4 bench slots
- Slots fill in with player name + position as they're picked
- Empty slots show position label as placeholder
- Clicking a filled slot removes the player (same as clicking ✕ in the list)

**Footer bar (sticky bottom):**
- Budget remaining (£100m − total cost)
- "Next →" button: disabled until all 15 slots filled with correct position counts; enabled = green

**Validation before proceeding:**
- Exactly 15 players: 2 GK, 5 DEF, 5 MID, 3 FWD
- Budget ≥ 0
- Max 3 players from the same club

---

### Step 2 — Formation + Starting XI

**Goal:** user picks a formation and designates 11 starters (and bench order for 4 subs).

**Formation picker:**
- 7 pill buttons at top: `3-4-3`, `3-5-2`, `4-3-3`, `4-4-2`, `4-5-1`, `5-3-2`, `5-4-1`
- Default: `4-4-2`
- Changing formation re-evaluates whether current starters are still valid; if not, clears any starters that no longer fit and shows a toast

**Pitch:**
- Shows all 15 players arranged by position
- Clicking a player toggles starting/bench status
- Formation is enforced: if toggling would break the formation, the click is ignored with a brief error message
- Starting XI slots are visually distinct from bench slots

**Bench order:**
- 4 bench slots shown below pitch separator
- Each bench slot has ↑/↓ arrow buttons to set priority order (1 = first auto-sub)
- Order updates in real time

**Validation before proceeding:**
- Exactly 11 starters matching the chosen formation (1 GK + DEF/MID/FWD counts per formation)
- Exactly 4 bench players with bench positions 1–4 assigned

---

### Step 3 — Name + Captain

**Goal:** user names the team and assigns captain + vice-captain from the starting XI.

**Team name input:**
- Text input, 1–50 characters, required
- Placeholder: "My Fantasy FC"

**Captain picker:**
- Starting XI displayed as pitch cards
- Tap cycle: 1st tap = Captain (gold C badge), 2nd tap = Vice-Captain (blue VC badge), 3rd tap = clear
- Only one captain and one vice-captain at a time; tapping a new player shifts the assignment
- Captain and vice-captain must be different players and both in the starting XI

**Submit:**
- "✨ CREATE TEAM" button: disabled until team name filled + captain + vice-captain assigned
- On click: POST `/fantasy-teams` with assembled DTO
- Loading state: button shows spinner, disabled
- On success: invalidate `['fantasy-team', 'mine']` TanStack Query cache, redirect to `/squad`
- On error: show inline error message below button ("Failed to create team. Please try again.")

---

## State Management

All wizard state lives in a single `useOnboarding` hook (local React state — no Zustand store).

```ts
// Conceptual shape
{
  step: 1 | 2 | 3
  // Step 1
  pickedPlayers: ApiPlayer[]          // ordered array, max 15
  // Step 2
  formation: string                   // e.g. '4-4-2'
  startingIds: Set<number>
  benchOrder: Record<string, number>  // playerId → 1..4
  // Step 3
  teamName: string
  captainId: number | null
  viceCaptainId: number | null
}
```

Back navigation preserves all state (Back button on steps 2 and 3, browser back button also works).

---

## Component Structure

```
src/pages/Onboarding.tsx          ← page wrapper, step router, useOnboarding hook
src/pages/onboarding/
  Step1PickPlayers.tsx            ← split layout, player list, pitch panel
  Step2Formation.tsx              ← formation pills, pitch with toggle
  Step3Captain.tsx                ← team name input, captain picker pitch
src/api/hooks/useCreateTeam.ts    ← useMutation wrapping POST /fantasy-teams
```

Existing reused components:
- `JerseyIcon`, `PosBadge`, `Skeleton` from `src/components/ui/`
- `usePlayers()`, `useClubsMap()`, `useMyFantasyTeam()` from `src/api/hooks/`

---

## Error Handling

| Scenario | Behaviour |
|----------|-----------|
| Player API fails to load | Skeleton → error boundary with retry button |
| Budget exceeded | "Next →" stays disabled; budget bar turns red |
| Formation mismatch on toggle | Brief inline message: "Can't bench — formation requires a DEF here" |
| POST /fantasy-teams 400 | Inline error on Step 3 with server message |
| POST /fantasy-teams 500 | Generic "Failed to create team. Please try again." |
| User navigates away mid-flow | State lost (acceptable for MVP — wizard is short) |

---

## Out of Scope (MVP)

- Competition selection (hardcoded to `competitionId: 39` Premier League from auth store)
- Drag-and-drop bench reordering (↑/↓ buttons used instead)
- Player stats/form shown during picking (price only)
- Saving draft progress across sessions
