TOKEN=$(curl -s -X POST http://localhost:3001/auth/login \
    -H "Content-Type: application/json" \
    -d '{"email":"trungbeobk@gmail.com","password":"test1234"}' | jq -r '.accessToken') \
  && curl -s -X POST http://localhost:3001/admin/sync/bootstrap \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $TOKEN" | jq .


    Here are the steps to populate aliases and use the admin page:

  1. Start the services
  # Terminal 1 — API
  cd /Users/trung/fantasy/.worktrees/fantasy-game/apps/api
  pnpm start:dev

  # Terminal 2 — Frontend
  cd /Users/trung/fantasy/.worktrees/fantasy-game/apps/web
  pnpm dev

  2. Re-export CSVs (if needed — 98 clubs + 1,437 players already exported)
  cd /Users/trung/fantasy/.worktrees/fantasy-game/apps/api
  npx ts-node --project tsconfig.json scripts/export-aliases.ts
  # → apps/api/exports/clubs.csv
  # → apps/api/exports/players.csv

  3. Fill alias names using an LLM
  - Give the LLM: docs/references/alias_names_sample.md + clubs.csv + players.csv
  - Ask it to fill the alias_name, alias_short_name, alias_city columns for clubs and alias_name for players using PES/WE naming conventions
  - Save the filled files

  4. Import via Admin UI
  - Open http://localhost:5173/admin (must be logged in as ADMIN)
  - Clubs tab → "Import clubs CSV" → select filled clubs CSV
  - Players tab → "Import players CSV" → select filled players CSV
  - Check the toast for processed/skipped/error counts

  5. Set competition aliases manually
  - Go to Competitions tab in /admin
  - 5 competitions: Premier League, La Liga, Serie A, Bundesliga, Ligue 1
  - Click each alias cell to inline-edit (e.g. "Premier League" → "England Premier", short → "EPL")

  6. Verify
  - Log out and go through the onboarding flow — players and clubs should now show alias names instead of "[Unnamed]"

  The main time investment is step 3 (LLM naming). The import itself is fast — the endpoint batch-validates all IDs and upserts in one pass.