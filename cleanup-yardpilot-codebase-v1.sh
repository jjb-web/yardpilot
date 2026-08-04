#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="${1:-$HOME/yardpilot}"
cd "$PROJECT_DIR"

required=(package.json package-lock.json src/main.tsx src/app/routes.tsx src/styles/index.css)
for file in "${required[@]}"; do
  if [[ ! -f "$file" ]]; then
    echo "ERROR: $PROJECT_DIR does not look like the current YardPilot repository (missing $file)." >&2
    exit 1
  fi
done

STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP="../yardpilot-before-code-cleanup-$STAMP.tar.gz"

echo "Creating rollback archive: $BACKUP"
tar \
  --exclude='.git' \
  --exclude='node_modules' \
  --exclude='dist' \
  --exclude='build' \
  --exclude='coverage' \
  --exclude='.vite' \
  --exclude='.vercel' \
  --exclude='.supabase' \
  --exclude='supabase/.temp' \
  --exclude='.env' \
  --exclude='.env.*' \
  -czf "$BACKUP" .

rollback() {
  local code=$?
  if [[ $code -eq 0 ]]; then return; fi
  echo
  echo "Cleanup failed. Restoring tracked project files from $BACKUP ..." >&2
  rm -rf \
    .vscode \
    .env.example \
    scripts/dev \
    docs/archive \
    docs/PRODUCTION-SETTINGS.md \
    docs/database/README.txt
  tar -xzf "$BACKUP" -C "$PROJECT_DIR"
  echo "Rollback complete. Exit code: $code" >&2
  exit "$code"
}
trap rollback ERR

mkdir -p .vscode scripts/dev docs/archive docs/database

# Keep safe shared VS Code settings in the conventional location.
if [[ -f settings.json ]]; then mv -f settings.json .vscode/settings.json; fi
if [[ -f extensions.json ]]; then mv -f extensions.json .vscode/extensions.json; fi

# Move reusable maintenance tools out of the repository root.
for script in \
  audit-yardpilot-codebase.sh \
  fix-yardpilot-scroll.sh \
  make-yardpilot-current-bundle.sh \
  export-all-supabase-queries.sh \
  export-all-supabase-queries-v2.sh
 do
  if [[ -f "$script" ]]; then mv -f "$script" scripts/dev/; fi
done

# Normalize the safe public environment template name used by README.md.
if [[ -f env.example && ! -f .env.example ]]; then mv env.example .env.example; fi

# Archive release notes that are useful history but should not clutter the root.
if [[ -f README-FIRST.md ]]; then mv -f README-FIRST.md docs/archive/launch-hardening-v1.md; fi
if [[ -f FIXES-APPLIED.md ]]; then mv -f FIXES-APPLIED.md docs/archive/fixes-applied-v1.md; fi
if [[ -f IMPLEMENTED.md ]]; then mv -f IMPLEMENTED.md docs/archive/implemented-v1.md; fi
if [[ -f MANUAL-SETTINGS.md ]]; then mv -f MANUAL-SETTINGS.md docs/PRODUCTION-SETTINGS.md; fi
if [[ -f README-DATABASE-CLEANUP.txt ]]; then mv -f README-DATABASE-CLEANUP.txt docs/database/README.txt; fi

# Remove confirmed accidental, duplicate, generated, or obsolete root artifacts.
rm -f \
  add \
  download \
  main.tsx \
  default_shadcn_theme.css \
  pnpm-workspace.yaml \
  README.txt \
  FILES-TO-REPLACE.txt \
  TEST-CHECKLIST.md \
  'yardpilot-code-maintenance-tools-20260804.tar.gz' \
  'yardpilot-database-cleanup-overlay-20260804 (1).tar.gz'

# Remove duplicate Edge Function files whose names contain spaces.
rm -f \
  'supabase/functions/create-invoice-checkout/index .ts' \
  'supabase/functions/create-invoice-checkout/deno .json'

# Remove source files proven unreachable from src/main.tsx and unreferenced by all source.
rm -rf \
  src/app/components/ui \
  src/app/components/figma
rm -f \
  src/app/components/Layout.tsx \
  src/app/services/ai.ts \
  src/styles/fonts.css \
  src/styles/globals.css \
  src/styles/tailwind.css \
  src/styles/theme.css
rmdir src/app/services 2>/dev/null || true

# Keep VS Code project settings while ignoring other local editor state.
python3 <<'PY'
from pathlib import Path
p = Path('.gitignore')
text = p.read_text(encoding='utf-8')
text = text.replace('.vscode/\n', '.vscode/*\n!.vscode/settings.json\n!.vscode/extensions.json\n')
if 'yardpilot-*-bundle-*.tar.gz' not in text:
    text += '\n# Local diagnostic/export archives\nyardpilot-*-bundle-*.tar.gz\nyardpilot-code-audit-*\nsupabase-query-export-*\nbackups/\n'
p.write_text(text.rstrip() + '\n', encoding='utf-8')
PY

# Keep only packages imported by the active application.
python3 <<'PY'
import json
from pathlib import Path
p = Path('package.json')
data = json.loads(p.read_text(encoding='utf-8'))
data['scripts'] = {
    'dev': 'vite',
    'build': 'vite build',
    'preview': 'vite preview',
    'check:edge-functions': 'bash scripts/check-edge-functions.sh',
}
data['dependencies'] = {
    '@supabase/supabase-js': '^2.110.9',
    'lucide-react': '0.487.0',
    'react': '18.3.1',
    'react-dom': '18.3.1',
    'react-router': '7.13.0',
}
data['devDependencies'] = {
    '@tailwindcss/vite': '4.1.12',
    '@vitejs/plugin-react': '4.7.0',
    'tailwindcss': '4.1.12',
    'vite': '6.3.5',
}
data.pop('peerDependencies', None)
data.pop('peerDependenciesMeta', None)
data.pop('pnpm', None)
p.write_text(json.dumps(data, indent=2) + '\n', encoding='utf-8')
PY

# Dynamic Edge Function checker: every function folder must have exact filenames.
cat > scripts/check-edge-functions.sh <<'CHECK'
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
CHECK
chmod +x scripts/check-edge-functions.sh scripts/dev/*.sh 2>/dev/null || true

cat > .editorconfig <<'EDITOR'
root = true

[*]
charset = utf-8
end_of_line = lf
insert_final_newline = true
indent_style = space
indent_size = 2
trim_trailing_whitespace = true

[*.md]
trim_trailing_whitespace = false

[*.sh]
indent_size = 2
EDITOR

cat > docs/CODEBASE-STRUCTURE.md <<'DOC'
# YardPilot codebase structure

- `src/app/components/`: shared active application components
- `src/app/context/`: global application state (scheduled for later decomposition)
- `src/app/hooks/`: reusable React hooks
- `src/app/lib/`: deterministic business and integration helpers
- `src/app/pages/`: route-level screens
- `src/styles/index.css`: the single frontend stylesheet entry
- `supabase/functions/`: one folder per Edge Function, each with `index.ts` and `deno.json`
- `supabase/sql/diagnostics/`: read-only checks
- `supabase/sql/history/`: preserved historical SQL, never automatically pushed
- `supabase/sql/proposed/`: reviewed SQL not yet applied
- `scripts/`: project checks
- `scripts/dev/`: one-off export, audit, and bundle tools

## Next refactor boundary

Do not split large stateful files while launch behavior is unstable. After role,
Stripe, estimate, invoice, and marketplace tests pass, decompose in this order:

1. `AppContext.tsx`: auth, workspace, contacts/properties, projects, invoices.
2. `Contacts.tsx`: list, editor, property editor, photo manager.
3. `EstimateBuilder.tsx`: form state, jobs, labor, materials, document preview.
4. `Team.tsx` and `Invoices.tsx`: data hooks and modal components.
DOC

# Update root README paths and current database guidance without changing product behavior.
python3 <<'PY'
from pathlib import Path
p = Path('README.md')
text = p.read_text(encoding='utf-8')
text = text.replace('- `README-FIRST.md`\n', '- `docs/archive/launch-hardening-v1.md`\n')
text = text.replace('Apply SQL migrations manually and in order. For this release, first confirm the\nlatest marketplace visibility/RLS migration was applied, then run:\n\n```text\nsupabase/sql/yardpilot-launch-hardening-v1.sql\n```\n\nDo not rerun older migrations afterward because they may restore obsolete\nfunctions or policies.',
'''Historical SQL is preserved under `supabase/sql/history/` and must not be rerun\nagainst production. Keep future executable database changes as reviewed,\ntimestamped migrations under `supabase/migrations/`. Read\n`docs/database/cleanup-plan.md` before changing the live schema.''')
if '- `docs/CODEBASE-STRUCTURE.md`' not in text:
    text = text.rstrip() + '\n- `docs/CODEBASE-STRUCTURE.md`\n'
p.write_text(text.rstrip() + '\n', encoding='utf-8')
PY

# Confirm every relative TypeScript import still resolves after cleanup.
python3 <<'PY'
from pathlib import Path
import re
import sys

root = Path('src').resolve()
files = {p.resolve() for p in root.rglob('*') if p.suffix in {'.ts', '.tsx'}}
pattern = re.compile(r'''(?:import\s+(?:[^;]*?\s+from\s+)?|export\s+[^;]*?\s+from\s+|import\s*\()\s*["']([^"']+)["']''', re.S)
missing = []
for source in sorted(files):
    text = source.read_text(encoding='utf-8', errors='ignore')
    for spec in pattern.findall(text):
        if spec.endswith(('.css', '.svg', '.png', '.jpg', '.jpeg', '.webp', '.csv')):
            continue
        if spec.startswith('@/'):
            base = root / spec[2:]
        elif spec.startswith('.'):
            base = source.parent / spec
        else:
            continue
        candidates = [base, Path(str(base)+'.ts'), Path(str(base)+'.tsx'), base/'index.ts', base/'index.tsx']
        if not any(c.resolve() in files for c in candidates):
            missing.append((source.relative_to(root.parent), spec))
if missing:
    for source, spec in missing:
        print(f'MISSING IMPORT: {source}: {spec}', file=sys.stderr)
    raise SystemExit(1)
print(f'Relative import check passed for {len(files)} TypeScript/TSX files.')
PY

# Regenerate the lockfile from the reduced package manifest, then build.
if [[ "${YARDPILOT_SKIP_NPM:-0}" != "1" ]]; then
  echo
  echo "Regenerating package-lock.json..."
  npm install --package-lock-only --ignore-scripts

  echo
  echo "Running production build..."
  npm run build

  # Remove obsolete installed packages only after the build succeeds.
  echo
  echo "Pruning unused node_modules packages..."
  npm prune --ignore-scripts || echo "Warning: npm prune failed; run npm install later. Source cleanup and build still succeeded."
else
  echo "Skipping npm lockfile/build steps because YARDPILOT_SKIP_NPM=1."
fi

trap - ERR

echo
echo "YardPilot cleanup completed successfully."
echo "Rollback archive: $(cd .. && pwd)/$(basename "$BACKUP")"
echo
echo "Review the changes:"
git status --short || true
echo
echo "Recommended commit:"
echo "  git add -A && git commit -m 'Clean and organize YardPilot codebase'"
