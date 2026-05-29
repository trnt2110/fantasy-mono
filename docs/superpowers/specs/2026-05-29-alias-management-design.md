# Alias Management System — Design Spec
*2026-05-29*

## Problem

After seeding real football data from API-Football, `PlayerAlias` and `ClubAlias` tables are empty. The `AliasService` falls back to `[Unnamed]` for all names. We need a workflow to:
1. Understand PES-style alias naming conventions
2. Export raw data to CSV for LLM-assisted naming
3. Bulk import the filled CSV back into the DB
4. Provide an admin UI for ongoing corrections

---

## Architecture

```
export-aliases.ts → exports/clubs.csv + exports/players.csv
                                ↓
                    [LLM fills alias columns]
                                ↓
                    Admin page → upload CSV → POST /admin/import/aliases
                                ↓
                    PlayerAlias / ClubAlias upserted in DB
                                ↓
                    Admin page → inline edit for individual corrections
```

### What is NOT changing
- Existing alias CRUD endpoints (`PUT /admin/aliases/clubs/:id`, etc.)
- Existing `getUnaliased*` admin service methods — kept as-is

---

## Step 1 — PES/WE Reference Document

**File:** `docs/references/alias_names_sample.md`

Covers real naming conventions from Pro Evolution Soccer / Winning Eleven across three categories:

### Club naming patterns
1. **Geographic replacement** — "Man Red" (Man Utd), "Merseyside Red" (Liverpool), "North London" (Arsenal), "East London" (West Ham), "East Midlands" (Nottm Forest)
2. **Color or kit identity** — "Les Bleus de Paris" (PSG), "Bianconeri" (Juventus), "Die Roten" (Bayern), "Rossoneri" (AC Milan), "Nerazzurri" (Inter)
3. **Abbreviated city + suffix** — "Mad. Blanco" (Real Madrid), "Mad. Rojo" (Atletico), "Lon. Blue" (Chelsea), "Lon. Red" (Arsenal)
4. **Phonetic near-miss** — "Chelsa" (Chelsea), "Manchesta" (Manchester), "Liverpule" (Liverpool)

Short names (3-letter codes): geographic abbreviation — "MRD" (Man Red), "MRS" (Merseyside Red), "NLN" (North London).

### Player naming patterns
1. **First name only** — "Kylian" (Mbappé), "Erling" (Haaland), "Vinicius" (Vinicius Jr.), "Pedri" (kept), "Bellingham" (kept — surnames that aren't trademarked)
2. **Phonetic respelling** — "Saleh" (Salah), "De Bryan" (De Bruyne), "Son" (kept), "Kanté" → "Kante"
3. **Nationality marker** — "Il Portiere" (generic Italian GK), "El Delantero" (generic Spanish FWD) — used for truly unknown players

### Competition naming patterns
| Real Name | PES-style Alias |
|---|---|
| Premier League | English Premier |
| La Liga | Spanish Primera |
| Serie A | Italian Serie |
| Bundesliga | German Bundesliga |
| Ligue 1 | French Ligue |

---

## Step 2 — Export Script

**File:** `apps/api/scripts/export-aliases.ts`

**Run:** `cd apps/api && npx ts-node scripts/export-aliases.ts`

**Output directory:** `apps/api/exports/` (gitignored — contains real player names)

### clubs.csv format
```
id,real_name,competition_id,alias_name,alias_short_name,alias_city
71,Manchester United,39,,,
```

Columns:
- `id` — Club.id (primary key, used for import matching)
- `real_name` — Club.realName (read-only reference for LLM)
- `competition_id` — for context grouping
- `alias_name` — LLM fills this (maps to ClubAlias.name)
- `alias_short_name` — LLM fills this, 3 chars (maps to ClubAlias.shortName)
- `alias_city` — LLM fills this (maps to ClubAlias.city)

### players.csv format
```
id,real_name,position,club_id,club_real_name,alias_name
123,Mohamed Salah,MF,40,Liverpool FC,
```

Columns:
- `id` — Player.id (primary key)
- `real_name` — Player.realName
- `position` — GK/DEF/MID/FWD
- `club_id` — for grouping
- `club_real_name` — club context for LLM
- `alias_name` — LLM fills this (maps to PlayerAlias.name)

### Script behavior
- Connects to DB via Prisma
- Exports all clubs (with existing alias pre-filled if present)
- Exports all players (with existing alias pre-filled if present)
- Writes two files and prints row counts

---

## Step 3 — Import Endpoint

**Endpoint:** `POST /admin/import/aliases`

**Content-type:** `multipart/form-data`

**Fields:**
- `clubs` — optional CSV file (clubs format above)
- `players` — optional CSV file (players format above)

**Behavior:**
- Parse each uploaded file using a streaming CSV parser
- For each row: if `alias_name` is non-empty, upsert the alias record; otherwise skip
- Collect errors per row without aborting the whole import
- Return summary:

```json
{
  "clubs":   { "processed": 20, "skipped": 2, "errors": [] },
  "players": { "processed": 500, "skipped": 31, "errors": [{ "row": 14, "id": 99, "error": "Player not found" }] }
}
```

**Validation:**
- `id` must be a valid integer and must exist in DB (skip with error if not found)
- `alias_name` max 100 chars
- `alias_short_name` max 10 chars
- No transaction wrapping the whole import — each row is independent

---

## Step 4 — Admin Page

### Route
`/admin` — added to `App.tsx`, outside `AppShell`, protected by `user.role === 'ADMIN'` check. Non-admin users are redirected to `/`.

### File structure
```
apps/web/src/pages/admin/
  AdminPage.tsx          # top-level layout + tab state
  AdminClubs.tsx         # clubs tab content
  AdminPlayers.tsx       # players tab content
  AdminCompetitions.tsx  # competitions tab content

apps/web/src/api/hooks/
  useAdminAliases.ts     # all admin alias hooks
```

### Layout
- Minimal dark header: "FANTASYFOOTYADMIN" logo + logged-in username + logout button
- Tab bar: **Clubs | Players | Competitions** (count badges showing unaliased count)
- Main content area: search bar + CSV upload button + paginated table

### Table columns
**Clubs:** ID | Real Name | Alias Name (editable) | Short (editable) | City (editable) | Status
**Players:** ID | Real Name | Position | Club | Alias Name (editable) | Status
**Competitions:** ID | Real Name | Alias Name (editable) | Short (editable) | Status

Status badge: green "Aliased" / orange "Unnamed"

### Inline editing
- Click any editable cell → renders `<input>` pre-filled with current value
- Save: blur or Enter → calls `PUT /admin/aliases/:type/:id`
- Cancel: Escape → restores previous value
- Optimistic update via TanStack Query `useMutation` + manual cache invalidation

### CSV upload
- "Import CSV" button opens file picker (accepts `.csv`)
- Separate upload buttons for clubs and players files
- On select: POST to `/admin/import/aliases` with `multipart/form-data`
- Shows loading state during upload
- On complete: toast with summary ("500 players aliased, 31 skipped")
- Invalidates alias query cache on success

### Backend additions needed

**New `filter` param on existing list endpoints:**
```
GET /admin/aliases/clubs?page=1&limit=50&search=&filter=all
GET /admin/aliases/players?page=1&limit=50&search=&filter=all
```
`filter` values: `all` (default) | `unaliased` | `aliased`

Current implementation only returns `{ alias: null }` — extend to support `all` and `aliased`.

Add `resolveClubForAdmin` and `resolvePlayerForAdmin` methods to `AliasService` that include `realName` in their return shape. The existing `resolveClub`/`resolvePlayer` methods are unchanged — the admin-specific methods are additive.

---

## Security

- All `/admin/*` routes require `@Roles(Role.ADMIN)` on the backend — already in place
- Frontend `/admin` route checks `user.role === 'ADMIN'` from auth store and redirects if not admin
- `exports/` directory is gitignored to prevent real names leaking into version control
- Import endpoint validates all IDs against DB before upserting

---

## Files to Create / Modify

| File | Action |
|---|---|
| `docs/references/alias_names_sample.md` | Create |
| `apps/api/scripts/export-aliases.ts` | Create |
| `apps/api/exports/` (gitignore entry) | Add to `apps/api/.gitignore` |
| `apps/api/src/modules/admin/admin.controller.ts` | Add import endpoint + updated list endpoints |
| `apps/api/src/modules/admin/admin.service.ts` | Add `importAliases`, extend `getClubs`/`getPlayers` with filter |
| `apps/api/src/modules/admin/dto/import-aliases.dto.ts` | Create |
| `apps/api/src/modules/alias/alias.service.ts` | Add `realName` to admin responses |
| `apps/web/src/App.tsx` | Add `/admin` route |
| `apps/web/src/pages/admin/AdminPage.tsx` | Create |
| `apps/web/src/pages/admin/AdminClubs.tsx` | Create |
| `apps/web/src/pages/admin/AdminPlayers.tsx` | Create |
| `apps/web/src/pages/admin/AdminCompetitions.tsx` | Create |
| `apps/web/src/api/hooks/useAdminAliases.ts` | Create |
