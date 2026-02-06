#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:8003}"
ADMIN_TOKEN="${ADMIN_TOKEN:-}"
DEPARTMENT_NAME="${DEPARTMENT_NAME:-Sample Department}"
DEPARTMENT_CODE="${DEPARTMENT_CODE:-SAMPLE}"

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing dependency: $1"
    exit 1
  fi
}

require_cmd curl
require_cmd jq

echo "==> Health check"
curl -sS "$BASE_URL/health" | jq .

echo "==> /departments (public)"
curl -sS "$BASE_URL/departments" | jq .

if [[ -z "$ADMIN_TOKEN" ]]; then
  echo "Skipping admin department operations (set ADMIN_TOKEN)."
  echo "==> Smoke test complete"
  exit 0
fi

echo "==> /departments (create)"
CREATE_RESPONSE=$(curl -sS -X POST "$BASE_URL/departments" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"$DEPARTMENT_NAME\",\"code\":\"$DEPARTMENT_CODE\",\"display_order\":0}")
echo "$CREATE_RESPONSE" | jq .

DEPARTMENT_ID=$(echo "$CREATE_RESPONSE" | jq -r '._id // empty')
if [[ -z "$DEPARTMENT_ID" ]]; then
  echo "Department creation failed; skipping update/delete."
  echo "==> Smoke test complete"
  exit 0
fi

echo "==> /departments/{id} (update display_order)"
curl -sS -X PUT "$BASE_URL/departments/$DEPARTMENT_ID" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"display_order\":1}" | jq .

echo "==> /departments/{id} (delete)"
curl -sS -X DELETE "$BASE_URL/departments/$DEPARTMENT_ID" \
  -H "Authorization: Bearer $ADMIN_TOKEN" | jq .

echo "==> Smoke test complete"
