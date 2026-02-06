#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:8004}"
ADMIN_TOKEN="${ADMIN_TOKEN:-}"
EVENT_ID="${EVENT_ID:-}"
SPORT_NAME="${SPORT_NAME:-Sample Sport}"
SPORT_TYPE="${SPORT_TYPE:-}"
SPORT_CATEGORY="${SPORT_CATEGORY:-}"
TEAM_SIZE="${TEAM_SIZE:-}"
REG_NUMBER="${REG_NUMBER:-}"

for bin in curl jq; do
  if ! command -v "$bin" >/dev/null 2>&1; then
    echo "Missing required dependency: $bin"
    exit 1
  fi
done

echo "==> Health check"
curl -sS "$BASE_URL/health" | jq .

if [[ -n "$EVENT_ID" ]]; then
  echo "==> /sports-participations/sports (public)"
  curl -sS "$BASE_URL/sports-participations/sports?event_id=$EVENT_ID" | jq .
else
  echo "Skipping /sports-participations/sports (set EVENT_ID to include query)."
fi

if [[ -n "$ADMIN_TOKEN" && -n "$EVENT_ID" ]]; then
  echo "==> /sports-participations/sports-counts (admin token)"
  curl -sS "$BASE_URL/sports-participations/sports-counts?event_id=$EVENT_ID" \
    -H "Authorization: Bearer $ADMIN_TOKEN" | jq .
else
  echo "Skipping /sports-participations/sports-counts (set ADMIN_TOKEN and EVENT_ID)."
fi

if [[ -n "$ADMIN_TOKEN" && -n "$EVENT_ID" && -n "$REG_NUMBER" ]]; then
  echo "==> /sports-participations/player-enrollments/$REG_NUMBER"
  curl -sS "$BASE_URL/sports-participations/player-enrollments/$REG_NUMBER?event_id=$EVENT_ID" \
    -H "Authorization: Bearer $ADMIN_TOKEN" | jq .
else
  echo "Skipping /sports-participations/player-enrollments (set ADMIN_TOKEN, EVENT_ID, REG_NUMBER)."
fi

if [[ -z "$ADMIN_TOKEN" || -z "$EVENT_ID" || -z "$SPORT_TYPE" || -z "$SPORT_CATEGORY" ]]; then
  echo "Skipping sport create/delete (set ADMIN_TOKEN, EVENT_ID, SPORT_TYPE, SPORT_CATEGORY)."
  echo "==> Smoke test complete"
  exit 0
fi

echo "==> /sports-participations/sports (create)"
CREATE_PAYLOAD=$(jq -n \
  --arg name "$SPORT_NAME" \
  --arg event_id "$EVENT_ID" \
  --arg type "$SPORT_TYPE" \
  --arg category "$SPORT_CATEGORY" \
  --arg team_size "$TEAM_SIZE" \
  '{
    name: $name,
    event_id: $event_id,
    type: $type,
    category: $category,
    team_size: ($team_size | select(length > 0) | tonumber?),
    imageUri: null
  } | with_entries(select(.value != null))')

CREATE_RESPONSE=$(curl -sS -X POST "$BASE_URL/sports-participations/sports" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d "$CREATE_PAYLOAD")
echo "$CREATE_RESPONSE" | jq .

SPORT_ID=$(echo "$CREATE_RESPONSE" | jq -r '.sport._id // empty')
if [[ -z "$SPORT_ID" ]]; then
  echo "No sport id returned; skipping delete."
  echo "==> Smoke test complete"
  exit 0
fi

echo "==> /sports-participations/sports/$SPORT_ID (delete)"
curl -sS -X DELETE "$BASE_URL/sports-participations/sports/$SPORT_ID?event_id=$EVENT_ID" \
  -H "Authorization: Bearer $ADMIN_TOKEN" | jq .

echo "==> Smoke test complete"
