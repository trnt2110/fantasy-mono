#!/usr/bin/env bash
# bootstrap.sh — Full admin setup + season bootstrap for the fantasy API
#
# Usage:
#   ./scripts/bootstrap.sh [season]
#
# Arguments:
#   season   Optional. API-Football season year (e.g. 2025). Omit for auto-detect.
#
# Prerequisites:
#   - API running at $API_URL (default: http://localhost:3001)
#   - Postgres accessible via $DATABASE_URL
#   - jq installed (brew install jq)
#   - psql installed (brew install postgresql)

set -euo pipefail

# ─── Config ───────────────────────────────────────────────────────────────────

API_URL="${API_URL:-http://localhost:3001}"
ADMIN_EMAIL="${ADMIN_EMAIL:-admin@fantasy.local}"
ADMIN_USERNAME="${ADMIN_USERNAME:-admin}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-supersecret123}"
DATABASE_URL="${DATABASE_URL:-postgresql://fantasy_user:fantasy_pass@localhost:5432/fantasy}"
SEASON="${1:-}"

# ─── Helpers ──────────────────────────────────────────────────────────────────

log()  { echo "[$(date +%H:%M:%S)] $*"; }
ok()   { echo "[$(date +%H:%M:%S)] ✓ $*"; }
fail() { echo "[$(date +%H:%M:%S)] ✗ $*" >&2; exit 1; }

require_cmd() {
  command -v "$1" &>/dev/null || fail "'$1' is required but not installed."
}

# ─── Checks ───────────────────────────────────────────────────────────────────

require_cmd curl
require_cmd jq
require_cmd psql

# ─── Step 1: Wait for API to be ready ─────────────────────────────────────────

log "Waiting for API at $API_URL ..."
for i in $(seq 1 20); do
  if curl -sf "$API_URL/health" &>/dev/null || curl -sf "$API_URL/auth/login" -X POST \
      -H "Content-Type: application/json" -d '{}' -o /dev/null 2>/dev/null; then
    ok "API is up"
    break
  fi
  if [[ $i -eq 20 ]]; then
    fail "API did not respond after 20 attempts. Is it running?"
  fi
  sleep 2
done

# ─── Step 2: Register admin user (idempotent — 409 is fine) ───────────────────

log "Registering user '$ADMIN_EMAIL' ..."
REGISTER_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$API_URL/auth/register" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$ADMIN_EMAIL\",\"username\":\"$ADMIN_USERNAME\",\"password\":\"$ADMIN_PASSWORD\"}")

if [[ "$REGISTER_STATUS" == "201" ]]; then
  ok "User registered"
elif [[ "$REGISTER_STATUS" == "409" ]]; then
  ok "User already exists — skipping registration"
else
  fail "Registration failed with HTTP $REGISTER_STATUS"
fi

# ─── Step 3: Promote user to ADMIN in DB ──────────────────────────────────────

log "Promoting '$ADMIN_EMAIL' to ADMIN role in DB ..."
psql "$DATABASE_URL" -c "UPDATE \"User\" SET role = 'ADMIN' WHERE email = '$ADMIN_EMAIL';" -q
ok "Role updated"

# ─── Step 4: Login to get a fresh JWT (with ADMIN role embedded) ──────────────

log "Logging in as $ADMIN_EMAIL ..."
LOGIN_RESP=$(curl -s -X POST "$API_URL/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PASSWORD\"}")

ACCESS_TOKEN=$(echo "$LOGIN_RESP" | jq -r '.accessToken // empty')
[[ -z "$ACCESS_TOKEN" ]] && fail "Login failed. Response: $LOGIN_RESP"
ok "Logged in — access token acquired"

AUTH_HEADER="Authorization: Bearer $ACCESS_TOKEN"

# ─── Step 5: Check API-Football quota before bootstrap ────────────────────────

log "Checking API-Football rate limit ..."
RATE=$(curl -s "$API_URL/admin/sync/rate-limit" -H "$AUTH_HEADER")
REQUESTS_TODAY=$(echo "$RATE" | jq -r '.requestsToday')
HARD_LIMIT=$(echo "$RATE" | jq -r '.hardLimit')
log "Quota: $REQUESTS_TODAY / $HARD_LIMIT requests used today"

if [[ "$REQUESTS_TODAY" -ge "$HARD_LIMIT" ]]; then
  fail "Daily API-Football quota exhausted ($REQUESTS_TODAY/$HARD_LIMIT). Try again tomorrow."
fi

# ─── Step 6: Trigger bootstrap ────────────────────────────────────────────────

if [[ -n "$SEASON" ]]; then
  BOOTSTRAP_PAYLOAD="{\"season\":$SEASON}"
  log "Triggering bootstrap for season $SEASON ..."
else
  BOOTSTRAP_PAYLOAD="{}"
  log "Triggering bootstrap (auto-detecting season per league) ..."
fi

BOOTSTRAP_RESP=$(curl -s -X POST "$API_URL/admin/sync/bootstrap" \
  -H "$AUTH_HEADER" \
  -H "Content-Type: application/json" \
  -d "$BOOTSTRAP_PAYLOAD")

JOB_ID=$(echo "$BOOTSTRAP_RESP" | jq -r '.jobId // empty')
[[ -z "$JOB_ID" ]] && fail "Bootstrap trigger failed. Response: $BOOTSTRAP_RESP"
ok "Bootstrap job queued (jobId: $JOB_ID)"
log "$(echo "$BOOTSTRAP_RESP" | jq -r '.message')"

# ─── Step 7: Poll queue status until bootstrap job completes ──────────────────

log "Polling queue status (checking every 10s) ..."
TIMEOUT=600  # 10 minutes
ELAPSED=0

while true; do
  STATUS_RESP=$(curl -s "$API_URL/admin/sync/status" -H "$AUTH_HEADER")
  BS_QUEUE=$(echo "$STATUS_RESP" | jq '.[] | select(.name == "season-bootstrap")')

  WAITING=$(echo "$BS_QUEUE" | jq -r '.waiting')
  ACTIVE=$(echo "$BS_QUEUE" | jq -r '.active')
  COMPLETED=$(echo "$BS_QUEUE" | jq -r '.completed')
  FAILED=$(echo "$BS_QUEUE" | jq -r '.failed')

  log "Queue season-bootstrap — waiting:$WAITING active:$ACTIVE completed:$COMPLETED failed:$FAILED"

  if [[ "$FAILED" -gt 0 && "$ACTIVE" -eq 0 && "$WAITING" -eq 0 ]]; then
    fail "Bootstrap job failed! Check API logs for details."
  fi

  if [[ "$ACTIVE" -eq 0 && "$WAITING" -eq 0 && "$COMPLETED" -gt 0 ]]; then
    ok "Bootstrap job completed"
    break
  fi

  if [[ "$ELAPSED" -ge "$TIMEOUT" ]]; then
    fail "Bootstrap did not complete within ${TIMEOUT}s. Check API logs."
  fi

  sleep 10
  ELAPSED=$((ELAPSED + 10))
done

# ─── Step 8: Verify — list seeded competitions ────────────────────────────────

log "Verifying seeded competitions ..."
COMPS=$(curl -s "$API_URL/competitions" -H "$AUTH_HEADER")
COMP_COUNT=$(echo "$COMPS" | jq 'if type == "array" then length else .total // 0 end')
ok "Competitions in DB: $COMP_COUNT"

if [[ "$COMP_COUNT" -eq 0 ]]; then
  fail "No competitions found after bootstrap — something went wrong."
fi

# ─── Step 9: Final rate limit check ───────────────────────────────────────────

RATE_AFTER=$(curl -s "$API_URL/admin/sync/rate-limit" -H "$AUTH_HEADER")
REQUESTS_AFTER=$(echo "$RATE_AFTER" | jq -r '.requestsToday')
log "API-Football quota after bootstrap: $REQUESTS_AFTER / $HARD_LIMIT"

# ─── Done ─────────────────────────────────────────────────────────────────────

echo ""
echo "Bootstrap complete!"
echo "  Competitions seeded : $COMP_COUNT"
echo "  API quota used today: $REQUESTS_AFTER / $HARD_LIMIT"
echo ""
echo "Next step — seed players (costs ~40 API calls each, do one per day on free plan):"
echo "  curl -X POST $API_URL/admin/sync/players/39  -H \"$AUTH_HEADER\"  # Premier League"
echo "  curl -X POST $API_URL/admin/sync/players/140 -H \"$AUTH_HEADER\"  # La Liga"
echo "  curl -X POST $API_URL/admin/sync/players/135 -H \"$AUTH_HEADER\"  # Serie A"
echo "  curl -X POST $API_URL/admin/sync/players/78  -H \"$AUTH_HEADER\"  # Bundesliga"
echo "  curl -X POST $API_URL/admin/sync/players/61  -H \"$AUTH_HEADER\"  # Ligue 1"
