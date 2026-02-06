#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:8002}"
ADMIN_TOKEN="${ADMIN_TOKEN:-}"
EVENT_ID="${EVENT_ID:-}"
BATCH_NAME="${BATCH_NAME:-Sample Batch}"
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
  echo "==> /enrollments/batches (public)"
  curl -sS "$BASE_URL/enrollments/batches?event_id=$EVENT_ID" | jq .
else
  echo "Skipping /enrollments/batches (set EVENT_ID to include query)."
fi

if [[ -z "$ADMIN_TOKEN" || -z "$EVENT_ID" ]]; then
  echo "Skipping admin batch operations (set ADMIN_TOKEN and EVENT_ID)."
else
  echo "==> /enrollments/add-batch"
  ADD_BATCH_RESPONSE=$(curl -sS -X POST "$BASE_URL/enrollments/add-batch" \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"name\":\"$BATCH_NAME\",\"event_id\":\"$EVENT_ID\"}")
  echo "$ADD_BATCH_RESPONSE" | jq .

  echo "==> /enrollments/remove-batch"
  REMOVE_BATCH_RESPONSE=$(curl -sS -X DELETE "$BASE_URL/enrollments/remove-batch" \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"name\":\"$BATCH_NAME\",\"event_id\":\"$EVENT_ID\"}")
  echo "$REMOVE_BATCH_RESPONSE" | jq .
fi

if [[ -n "$EVENT_ID" && -n "$BATCH_NAME" && -n "$REG_NUMBER" ]]; then
  echo "==> /enrollments/batches/assign-player"
  curl -sS -X POST "$BASE_URL/enrollments/batches/assign-player" \
    -H "Content-Type: application/json" \
    -d "{\"name\":\"$BATCH_NAME\",\"event_id\":\"$EVENT_ID\",\"reg_number\":\"$REG_NUMBER\"}" | jq .

  echo "==> /enrollments/batches/unassign-player"
  curl -sS -X POST "$BASE_URL/enrollments/batches/unassign-player" \
    -H "Content-Type: application/json" \
    -d "{\"name\":\"$BATCH_NAME\",\"event_id\":\"$EVENT_ID\",\"reg_number\":\"$REG_NUMBER\"}" | jq .
else
  echo "Skipping assign/unassign (set EVENT_ID, BATCH_NAME, REG_NUMBER)."
fi

echo "==> Smoke test complete"
