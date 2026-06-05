# Player Selection Redesign

**Date:** 2026-06-05  
**Status:** Approved

---

## Problem

The Players screen has five issues:

1. No points visible — `PlayerRow` only shows Price
2. Only 20 players shown regardless of filters — API default `limit=20`, no pagination
3. No club filter — API supports `clubId` but frontend never exposes it
4. Hard to see which players are in your squad — `opacity-60` is too subtle
5. Transfer mode and browse mode are mixed — the + / ✕ buttons appear in both contexts, confusing purpose

---

## Design

### Layout: Card Grid

Replace the flat `PlayerRow` list with a 2-column `PlayerCard` grid (Option C from brainstorming). Each card shows:

- Jersey icon + player name + club + position badge
- **Total Pts** (large, primary stat)
- **GW Pts** (this gameweek, secondary)
- **Price** (£x.xm)
- **IN SQUAD** badge (green, top-right corner) when the player is in the current picks

Players in squad get a green border (`border-game-neon/45`) and green name. Players not in squad have the default `game-card` border.

### Two Modes: Browse vs Transfer

The page operates in one of two modes, determined by whether `draftStore.playerOut` is set.

**Browse mode** (direct nav from sidebar "Players" link):
- Header: "PLAYERS" with total count
- Filter bar: search, position pills, club dropdown, sort toggle
- Cards are tap-to-modal only — no + / ✕ buttons
- Tapping a card opens the Player Stats Modal

**Transfer mode** (navigated from My Squad with a `playerOut` staged):
- A yellow context banner at the top: "REPLACING [Player Name]" with position + budget available
- Filter bar auto-initialises to the position being replaced and `maxPrice = budget`
- Over-budget cards are visually disabled (red "Too expensive" label, no tap action)
- Affordable cards show a "✓ Select" footer
- Tapping an affordable card sets `draftStore.playerIn` and navigates back to My Squad, where the user sees the pending swap and confirms (the transfer API is called there, not here)
- The ✕ on the banner cancels the transfer (clears `playerOut`) and navigates back

### Filter Bar

Both modes share the same filter bar:

| Control | Implementation |
|---|---|
| Search | Text input → passes `search` param to API |
| Position pills | ALL / GKP / DEF / MID / FWD → passes `position` param to API |
| Club dropdown | Populated from `useClubsMap()` → passes `clubId` param to API |
| Sort toggle | "Pts ↓" / "£ ↓" → passes `sortBy` param to API |

In transfer mode, position pill and max-price are pre-set from context and the price badge shows "≤£x.xm".

### Pagination

Default `limit=50` (up from 20). A "Load more" button at the bottom appends the next page. Uses TanStack Query's `keepPreviousData` so the list doesn't flash on load.

### Player Stats Modal

Activated by tapping any card in browse mode. A bottom sheet (`position: fixed, bottom: 0`) that slides up. Content:

- Player header: jersey, name, club, position badge, price
- Two stat boxes: Total Pts (green) + GW Pts (gold)
- Three-stat row: Goals / Assists / Own%
- GW-by-GW points bar chart (uses existing `usePlayerDetail()` hook which returns performance history)
- Close by tapping backdrop or dragging down

No action buttons in browse mode — it is read-only.

---

## Backend Changes

### `players.service.ts`

- Change `orderBy: { id: 'asc' }` → `orderBy: { totalPoints: 'desc' }` as the default
- Add optional `sortBy: 'totalPoints' | 'price'` field to `GetPlayersDto` and branch the `orderBy` accordingly

### `get-players.dto.ts`

Add:

```typescript
@IsOptional()
@IsEnum(['totalPoints', 'price'])
sortBy?: 'totalPoints' | 'price';
```

---

## Frontend Changes

### New components

| Component | Purpose |
|---|---|
| `PlayerCard` | 2-column grid card replacing `PlayerRow` |
| `TransferBanner` | Yellow context banner shown in transfer mode |
| `ClubFilterDropdown` | Club selector using `useClubsMap()` |
| `PlayerStatsModal` | Bottom sheet with points history |

### Modified

| File | Change |
|---|---|
| `PlayerSelection.tsx` | Rewire layout, add mode detection, new filter params |
| `usePlayers.ts` | Add `sortBy` and `clubId` to `PlayerFilters`, increase default limit to 50 |

### Mode detection

```typescript
const isTransferMode = !!draftStore.playerOut
```

`playerOut` is already stored in `draft.store`. Transfer mode is entered when My Squad sets `playerOut` and navigates to `/players`.

### No new routes or stores needed

The existing `draft.store` already has `playerOut` / `playerIn`. Navigation from My Squad to Players already works. No schema changes needed — `totalPoints` is already on the `Player` model and returned by `AliasService.resolvePlayer()`.

---

## Out of scope

- Player comparison side-by-side
- Watchlist / favourites
- Fixture difficulty ratings on cards
- Infinite scroll (Load More button is sufficient)
