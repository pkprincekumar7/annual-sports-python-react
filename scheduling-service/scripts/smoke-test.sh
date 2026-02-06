#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:8006}"
ADMIN_TOKEN="${ADMIN_TOKEN:-}"
EVENT_ID="${EVENT_ID:-}"
SPORT_NAME="${SPORT_NAME:-}"
GENDER="${GENDER:-}"
MATCH_TYPE="${MATCH_TYPE:-}"
MATCH_DATE="${MATCH_DATE:-}"
TEAMS_CSV="${TEAMS_CSV:-}"
PLAYERS_CSV="${PLAYERS_CSV:-}"

for bin in curl jq; do
  if ! command -v "$bin" >/dev/null 2>&1; then
    echo "Missing required dependency: $bin"
    exit 1
  fi
done

echo "==> Health check"
curl -sS "$BASE_URL/health" | jq .

if [[ -n "$ADMIN_TOKEN" && -n "$EVENT_ID" && -n "$SPORT_NAME" ]]; then
  echo "==> /schedulings/event-schedule/$SPORT_NAME"
  curl -sS "$BASE_URL/schedulings/event-schedule/$SPORT_NAME?event_id=$EVENT_ID" \
    -H "Authorization: Bearer $ADMIN_TOKEN" | jq .
else
  echo "Skipping /schedulings/event-schedule (set ADMIN_TOKEN, EVENT_ID, SPORT_NAME)."
fi

if [[ -n "$ADMIN_TOKEN" && -n "$EVENT_ID" && -n "$SPORT_NAME" && -n "$GENDER" ]]; then
  echo "==> /schedulings/event-schedule/$SPORT_NAME/teams-players"
  curl -sS "$BASE_URL/schedulings/event-schedule/$SPORT_NAME/teams-players?event_id=$EVENT_ID&gender=$GENDER" \
    -H "Authorization: Bearer $ADMIN_TOKEN" | jq .
else
  echo "Skipping /schedulings/event-schedule/{sport}/teams-players (set ADMIN_TOKEN, EVENT_ID, SPORT_NAME, GENDER)."
fi

if [[ -z "$ADMIN_TOKEN" || -z "$EVENT_ID" || -z "$SPORT_NAME" || -z "$MATCH_TYPE" || -z "$MATCH_DATE" ]]; then
  echo "Skipping match create/delete (set ADMIN_TOKEN, EVENT_ID, SPORT_NAME, MATCH_TYPE, MATCH_DATE)."
  echo "==> Smoke test complete"
  exit 0
fi

TEAMS_JSON="[]"
PLAYERS_JSON="[]"
if [[ -n "$TEAMS_CSV" ]]; then
  TEAMS_JSON=$(printf '%s' "$TEAMS_CSV" | jq -R -s -c 'split(",") | map(gsub("^\\s+|\\s+$";"")) | map(select(length > 0))')
fi
if [[ -n "$PLAYERS_CSV" ]]; then
  PLAYERS_JSON=$(printf '%s' "$PLAYERS_CSV" | jq -R -s -c 'split(",") | map(gsub("^\\s+|\\s+$";"")) | map(select(length > 0))')
fi

CREATE_PAYLOAD=$(jq -n \
  --arg match_type "$MATCH_TYPE" \
  --arg sports_name "$SPORT_NAME" \
  --arg match_date "$MATCH_DATE" \
  --arg event_id "$EVENT_ID" \
  --argjson teams "$TEAMS_JSON" \
  --argjson players "$PLAYERS_JSON" \
  '{
    match_type: $match_type,
    sports_name: $sports_name,
    match_date: $match_date,
    event_id: $event_id,
    teams: $teams,
    players: $players
  }')

echo "==> /schedulings/event-schedule (create)"
CREATE_RESPONSE=$(curl -sS -X POST "$BASE_URL/schedulings/event-schedule" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d "$CREATE_PAYLOAD")
echo "$CREATE_RESPONSE" | jq .

MATCH_ID=$(echo "$CREATE_RESPONSE" | jq -r '.match._id // empty')
if [[ -z "$MATCH_ID" ]]; then
  echo "No match id returned; skipping delete."
  echo "==> Smoke test complete"
  exit 0
fi

echo "==> /schedulings/event-schedule/$MATCH_ID (delete)"
curl -sS -X DELETE "$BASE_URL/schedulings/event-schedule/$MATCH_ID" \
  -H "Authorization: Bearer $ADMIN_TOKEN" | jq .

echo "==> Smoke test complete"
