#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:8005}"
ADMIN_TOKEN="${ADMIN_TOKEN:-}"
EVENT_ID="${EVENT_ID:-}"
EVENT_YEAR="${EVENT_YEAR:-}"
EVENT_NAME="${EVENT_NAME:-Community Fest}"
EVENT_ORGANIZER="${EVENT_ORGANIZER:-Events Community}"
EVENT_TITLE="${EVENT_TITLE:-Community Entertainment}"
EVENT_HIGHLIGHT="${EVENT_HIGHLIGHT:-Community Entertainment Fest}"
REG_START_DATE="${REG_START_DATE:-}"
REG_END_DATE="${REG_END_DATE:-}"
EVENT_START_DATE="${EVENT_START_DATE:-}"
EVENT_END_DATE="${EVENT_END_DATE:-}"

if ! command -v curl >/dev/null 2>&1; then
  echo "curl is required but not installed."
  exit 1
fi
if ! command -v jq >/dev/null 2>&1; then
  echo "jq is required but not installed."
  exit 1
fi

echo "==> Health check"
curl -sS "$BASE_URL/health" | jq .

echo "==> /event-configurations/event-years/active (public)"
curl -sS "$BASE_URL/event-configurations/event-years/active" | jq .

if [[ -z "$ADMIN_TOKEN" ]]; then
  echo "Skipping admin event-year operations (set ADMIN_TOKEN)."
  echo "==> Smoke test complete"
  exit 0
fi

echo "==> /event-configurations/event-years (auth)"
curl -sS "$BASE_URL/event-configurations/event-years" \
  -H "Authorization: Bearer $ADMIN_TOKEN" | jq .

if [[ -z "$EVENT_YEAR" || -z "$REG_START_DATE" || -z "$REG_END_DATE" || -z "$EVENT_START_DATE" || -z "$EVENT_END_DATE" ]]; then
  echo "Skipping create/update/delete (set EVENT_YEAR, REG_START_DATE, REG_END_DATE, EVENT_START_DATE, EVENT_END_DATE)."
  echo "==> Smoke test complete"
  exit 0
fi

EVENT_ID="${EVENT_ID:-${EVENT_YEAR}-$(echo "$EVENT_NAME" | tr '[:upper:]' '[:lower:]' | tr -s ' ' '-' )}"

echo "==> /event-configurations/event-years (create)"
CREATE_RESPONSE=$(curl -sS -X POST "$BASE_URL/event-configurations/event-years" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"event_year\": $EVENT_YEAR,
    \"event_name\": \"${EVENT_NAME}\",
    \"event_dates\": {\"start\":\"${EVENT_START_DATE}\",\"end\":\"${EVENT_END_DATE}\"},
    \"registration_dates\": {\"start\":\"${REG_START_DATE}\",\"end\":\"${REG_END_DATE}\"},
    \"event_organizer\": \"${EVENT_ORGANIZER}\",
    \"event_title\": \"${EVENT_TITLE}\",
    \"event_highlight\": \"${EVENT_HIGHLIGHT}\"
  }")
echo "$CREATE_RESPONSE" | jq .

echo "==> /event-configurations/event-years/${EVENT_ID} (update highlight)"
UPDATE_RESPONSE=$(curl -sS -X PUT "$BASE_URL/event-configurations/event-years/$EVENT_ID" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"event_highlight\":\"${EVENT_HIGHLIGHT} Updated\"}")
echo "$UPDATE_RESPONSE" | jq .

echo "==> /event-configurations/event-years/${EVENT_ID} (delete)"
DELETE_RESPONSE=$(curl -sS -X DELETE "$BASE_URL/event-configurations/event-years/$EVENT_ID" \
  -H "Authorization: Bearer $ADMIN_TOKEN")
echo "$DELETE_RESPONSE" | jq .

echo "==> Smoke test complete"
