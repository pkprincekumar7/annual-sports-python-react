#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:8007}"
ADMIN_TOKEN="${ADMIN_TOKEN:-}"
EVENT_ID="${EVENT_ID:-}"
SPORT_NAME="${SPORT_NAME:-}"
GENDER="${GENDER:-Male}"
RUN_BACKFILL="${RUN_BACKFILL:-false}"

for bin in curl jq; do
  if ! command -v "$bin" >/dev/null 2>&1; then
    echo "Missing required dependency: $bin"
    exit 1
  fi
done

echo "==> Health check"
curl -sS "$BASE_URL/health" | jq .

if [[ -n "$ADMIN_TOKEN" && -n "$EVENT_ID" && -n "$SPORT_NAME" ]]; then
  echo "==> /scorings/points-table/$SPORT_NAME"
  curl -sS "$BASE_URL/scorings/points-table/$SPORT_NAME?event_id=$EVENT_ID&gender=$GENDER" \
    -H "Authorization: Bearer $ADMIN_TOKEN" | jq .
else
  echo "Skipping /scorings/points-table (set ADMIN_TOKEN, EVENT_ID, SPORT_NAME)."
fi

if [[ "$RUN_BACKFILL" == "true" && -n "$ADMIN_TOKEN" && -n "$EVENT_ID" && -n "$SPORT_NAME" ]]; then
  echo "==> /scorings/points-table/backfill/$SPORT_NAME"
  curl -sS -X POST "$BASE_URL/scorings/points-table/backfill/$SPORT_NAME?event_id=$EVENT_ID" \
    -H "Authorization: Bearer $ADMIN_TOKEN" | jq .
else
  echo "Skipping backfill (set RUN_BACKFILL=true and ADMIN_TOKEN/EVENT_ID/SPORT_NAME)."
fi

echo "==> Smoke test complete"
