#!/usr/bin/env bash
set -euo pipefail

cd "${1:-$HOME/yardpilot}"

STAMP="$(date +%Y%m%d-%H%M%S)"
OUT="../yardpilot-current-debug-bundle-$STAMP.tar.gz"

tar \
  --exclude='.git' \
  --exclude='node_modules' \
  --exclude='dist' \
  --exclude='build' \
  --exclude='coverage' \
  --exclude='.next' \
  --exclude='.vercel' \
  --exclude='.turbo' \
  --exclude='.cache' \
  --exclude='.vite' \
  --exclude='backups' \
  --exclude='yardpilot-code-audit-*' \
  --exclude='supabase-query-export-*' \
  --exclude='supabase/.temp' \
  --exclude='.supabase' \
  --exclude='.env' \
  --exclude='.env.*' \
  --exclude='*.pem' \
  --exclude='*.key' \
  --exclude='*.p12' \
  --exclude='*.pfx' \
  --exclude='*.log' \
  -czf "$OUT" .

echo "Created: $(cd "$(dirname "$OUT")" && pwd)/$(basename "$OUT")"
echo "Open the parent folder with: cd .. && explorer.exe ."
