#!/usr/bin/env bash
set -euo pipefail

ROOT="${1:-$HOME/yardpilot}"
cd "$ROOT"

if [[ ! -d supabase/functions ]]; then
  echo "No supabase/functions directory exists." >&2
  exit 1
fi

PROJECT_REF=""

if [[ -f supabase/.temp/project-ref ]]; then
  PROJECT_REF="$(tr -d '\r\n' < supabase/.temp/project-ref)"
fi

if [[ -z "$PROJECT_REF" ]]; then
  echo "ERROR: Supabase project is not linked." >&2
  echo "Run: npx supabase@latest link --project-ref YOUR_PROJECT_REF" >&2
  exit 1
fi

mapfile -t functions < <(
  grep -RIl \
    --include='*.ts' \
    --include='*.tsx' \
    --include='*.js' \
    --include='*.jsx' \
    --include='*.html' \
    'YardPilotUSA' \
    supabase/functions 2>/dev/null \
  | awk -F/ 'NF >= 3 { print $3 }' \
  | sort -u
)

if [[ "${#functions[@]}" -eq 0 ]]; then
  echo "No Edge Functions contain visible YardPilotUSA branding."
  exit 0
fi

echo "Deploying branded Edge Functions to $PROJECT_REF:"
printf '  - %s\n' "${functions[@]}"
echo

for function_name in "${functions[@]}"; do
  npx supabase@latest functions deploy "$function_name" \
    --project-ref "$PROJECT_REF"
done

echo
echo "Branded Edge Functions deployed successfully."
