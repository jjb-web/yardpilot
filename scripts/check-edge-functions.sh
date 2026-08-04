#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if ! command -v deno >/dev/null 2>&1; then
  echo "Deno is not installed in this WSL environment." >&2
  echo "Install Deno, reopen VS Code in WSL, then run this script again." >&2
  exit 1
fi

status=0
while IFS= read -r -d '' function_dir; do
  function_name="$(basename "$function_dir")"
  if [[ ! -f "$function_dir/index.ts" ]]; then
    echo "ERROR: $function_name is missing index.ts" >&2
    status=1
    continue
  fi
  if [[ ! -f "$function_dir/deno.json" ]]; then
    echo "ERROR: $function_name is missing deno.json" >&2
    status=1
    continue
  fi

  echo "Checking $function_name"
  (
    cd "$function_dir"
    deno check index.ts
    deno lint index.ts
    deno fmt --check index.ts deno.json
  ) || status=1
done < <(find "$ROOT/supabase/functions" -mindepth 1 -maxdepth 1 -type d -print0 | sort -z)

exit "$status"
