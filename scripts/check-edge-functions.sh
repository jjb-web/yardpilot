#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if ! command -v deno >/dev/null 2>&1; then
  echo "Deno is not installed in this WSL environment." >&2
  echo "Install Deno, reopen VS Code in WSL, then run this script again." >&2
  exit 1
fi

functions=(
  stripe-connect-account
  create-invoice-checkout
  stripe-webhook
  delete-account
)

for function_name in "${functions[@]}"; do
  function_dir="$ROOT/supabase/functions/$function_name"
  echo "Installing and checking $function_name"
  (
    cd "$function_dir"
    deno install
    deno check index.ts
    deno lint index.ts
    deno fmt --check index.ts deno.json
  )
done

echo "All YardPilot Edge Functions passed Deno checks."
