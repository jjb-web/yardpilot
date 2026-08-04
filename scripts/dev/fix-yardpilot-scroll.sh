#!/usr/bin/env bash
set -euo pipefail

cd "${1:-$HOME/yardpilot}"

STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP_DIR="backups/scroll-fix-$STAMP"
mkdir -p "$BACKUP_DIR"

FILES=(
  "src/styles/index.css"
  "src/app/components/AppLayout.tsx"
  "src/app/components/ClientLayout.tsx"
)

for file in "${FILES[@]}"; do
  if [[ ! -f "$file" ]]; then
    echo "ERROR: Missing $file" >&2
    exit 1
  fi
  mkdir -p "$BACKUP_DIR/$(dirname "$file")"
  cp "$file" "$BACKUP_DIR/$file"
done

python3 <<'PY'
from pathlib import Path

index_css = Path("src/styles/index.css")
app_layout = Path("src/app/components/AppLayout.tsx")
client_layout = Path("src/app/components/ClientLayout.tsx")

css = index_css.read_text(encoding="utf-8")

marker = "/* YardPilot authenticated page scrolling */"
block = """
/* YardPilot authenticated page scrolling */
body.yardpilot-app-open #root {
  height: 100dvh;
  overflow: hidden;
}

.app-page-scroll {
  min-height: 0;
  overflow-x: hidden;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  overscroll-behavior-y: contain;
}
""".strip()

if marker not in css:
    css = css.rstrip() + "\n\n" + block + "\n"
index_css.write_text(css, encoding="utf-8")

replacements = {
    'className="app-page-scroll flex-1 min-h-0"':
        'className="app-page-scroll flex-1 min-h-0 overflow-y-auto overflow-x-hidden overscroll-contain"',
    'className="app-page-scroll min-h-0 flex-1"':
        'className="app-page-scroll min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain"',
}

for path in (app_layout, client_layout):
    text = path.read_text(encoding="utf-8")
    original = text
    for old, new in replacements.items():
        text = text.replace(old, new)
    path.write_text(text, encoding="utf-8")
    if text == original:
        print(f"NOTE: No exact class replacement was needed in {path}; CSS fallback was still added.")
    else:
        print(f"Updated {path}")

print("Updated src/styles/index.css")
PY

echo
echo "Building YardPilot..."
npm run build

echo
echo "Scroll fix applied successfully."
echo "Backup: $BACKUP_DIR"
echo
echo "Review changes:"
git diff -- src/styles/index.css \
  src/app/components/AppLayout.tsx \
  src/app/components/ClientLayout.tsx || true
