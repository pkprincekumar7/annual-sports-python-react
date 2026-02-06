#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:8001}"
ADMIN_REG_NUMBER="${ADMIN_REG_NUMBER:-admin}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-admin}"
SAMPLE_REG_NUMBER="${SAMPLE_REG_NUMBER:-sample-user-1}"
SAMPLE_FULL_NAME="${SAMPLE_FULL_NAME:-Sample User}"
SAMPLE_DEPARTMENT="${SAMPLE_DEPARTMENT:-Computer Science}"
SAMPLE_MOBILE="${SAMPLE_MOBILE:-9999999999}"
SAMPLE_EMAIL="${SAMPLE_EMAIL:-sample.user@your-domain.com}"
SAMPLE_GENDER="${SAMPLE_GENDER:-Male}"
SAMPLE_PASSWORD="${SAMPLE_PASSWORD:-password123}"
SAMPLE_BATCH_NAME="${SAMPLE_BATCH_NAME:-1st Year (2025)}"

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

echo "==> Login"
LOGIN_RESPONSE=$(curl -sS -X POST "$BASE_URL/identities/login" \
  -H "Content-Type: application/json" \
  -d "{\"reg_number\":\"$ADMIN_REG_NUMBER\",\"password\":\"$ADMIN_PASSWORD\"}")

TOKEN=$(echo "$LOGIN_RESPONSE" | jq -r '.token')
if [[ -z "$TOKEN" || "$TOKEN" == "null" ]]; then
  echo "Login failed:"
  echo "$LOGIN_RESPONSE" | jq .
  exit 1
fi

echo "==> /identities/me"
curl -sS "$BASE_URL/identities/me" \
  -H "Authorization: Bearer $TOKEN" | jq .

echo "==> /identities/players (first page)"
curl -sS "$BASE_URL/identities/players?page=1&limit=5" \
  -H "Authorization: Bearer $TOKEN" | jq .

echo "==> /identities/save-player (sample data)"
SAVE_PLAYER_RESPONSE=$(curl -sS -X POST "$BASE_URL/identities/save-player" \
  -H "Content-Type: application/json" \
  -d "{
    \"reg_number\":\"$SAMPLE_REG_NUMBER\",
    \"full_name\":\"$SAMPLE_FULL_NAME\",
    \"gender\":\"$SAMPLE_GENDER\",
    \"department_branch\":\"$SAMPLE_DEPARTMENT\",
    \"mobile_number\":\"$SAMPLE_MOBILE\",
    \"email_id\":\"$SAMPLE_EMAIL\",
    \"password\":\"$SAMPLE_PASSWORD\",
    \"batch_name\":\"$SAMPLE_BATCH_NAME\"
  }")
echo "$SAVE_PLAYER_RESPONSE" | jq .

echo "==> /identities/update-player (sample data)"
UPDATE_PLAYER_RESPONSE=$(curl -sS -X PUT "$BASE_URL/identities/update-player" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"reg_number\":\"$SAMPLE_REG_NUMBER\",
    \"full_name\":\"$SAMPLE_FULL_NAME Updated\",
    \"gender\":\"$SAMPLE_GENDER\",
    \"department_branch\":\"$SAMPLE_DEPARTMENT\",
    \"mobile_number\":\"$SAMPLE_MOBILE\",
    \"email_id\":\"$SAMPLE_EMAIL\"
  }")
echo "$UPDATE_PLAYER_RESPONSE" | jq .

echo "==> /identities/delete-player/{reg_number}"
DELETE_PLAYER_RESPONSE=$(curl -sS -X DELETE "$BASE_URL/identities/delete-player/$SAMPLE_REG_NUMBER" \
  -H "Authorization: Bearer $TOKEN")
echo "$DELETE_PLAYER_RESPONSE" | jq .

echo "==> Smoke test complete"
