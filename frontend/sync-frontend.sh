#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TARGET_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

rsync -a \
  --exclude "node_modules" \
  --exclude "dist" \
  "$ROOT_DIR/src" \
  "$ROOT_DIR/public" \
  "$ROOT_DIR/index.html" \
  "$ROOT_DIR/package.json" \
  "$ROOT_DIR/package-lock.json" \
  "$ROOT_DIR/postcss.config.js" \
  "$ROOT_DIR/tailwind.config.js" \
  "$ROOT_DIR/vite.config.js" \
  "$TARGET_DIR/"
