#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:8008}"
ADMIN_TOKEN="${ADMIN_TOKEN:-}"
EVENT_ID="${EVENT_ID:-}"

for bin in curl jq; do
  if ! command -v "$bin" >/dev/null 2>&1; then
    echo "Missing required dependency: $bin"
    exit 1
  fi
done

echo "==> Health check"
curl -sS "$BASE_URL/health" | jq .

if [[ -n "$ADMIN_TOKEN" ]]; then
  echo "==> /reportings/export-excel"
  TMP_FILE="$(mktemp -t players_report.XXXXXX.xlsx)"
  if [[ -n "$EVENT_ID" ]]; then
    curl -sS "$BASE_URL/reportings/export-excel?event_id=$EVENT_ID" \
      -H "Authorization: Bearer $ADMIN_TOKEN" \
      -o "$TMP_FILE"
  else
    curl -sS "$BASE_URL/reportings/export-excel" \
      -H "Authorization: Bearer $ADMIN_TOKEN" \
      -o "$TMP_FILE"
  fi
  echo "Report downloaded: $TMP_FILE ($(wc -c < "$TMP_FILE") bytes)"
else
  echo "Skipping export (set ADMIN_TOKEN)."
fi

echo "==> Smoke test complete"
