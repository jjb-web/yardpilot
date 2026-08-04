#!/usr/bin/env bash
set -euo pipefail

# Export every saved SQL snippet from the linked Supabase project.
# Run from the YardPilot repository root:
#   bash export-all-supabase-queries.sh

STAMP="$(date +%Y%m%d-%H%M%S)"
OUT_DIR="supabase-query-export-$STAMP"
SQL_DIR="$OUT_DIR/sql"
ZIP_FILE="$OUT_DIR.zip"

mkdir -p "$SQL_DIR"

echo "Reading saved Supabase SQL snippets..."
npx supabase@latest snippets list --output json > "$OUT_DIR/snippets-list.json"

python3 - "$OUT_DIR/snippets-list.json" "$OUT_DIR/snippets.tsv" <<'PY'
import json
import sys
from pathlib import Path

source = Path(sys.argv[1])
target = Path(sys.argv[2])

data = json.loads(source.read_text(encoding="utf-8"))
rows = []
seen = set()

def walk(value):
    if isinstance(value, dict):
        snippet_id = value.get("id")
        if snippet_id and isinstance(snippet_id, str) and snippet_id not in seen:
            seen.add(snippet_id)
            title = (
                value.get("name")
                or value.get("title")
                or value.get("description")
                or "untitled"
            )
            title = str(title).replace("\t", " ").replace("\n", " ").strip()
            rows.append((snippet_id, title))
        for child in value.values():
            walk(child)
    elif isinstance(value, list):
        for child in value:
            walk(child)

walk(data)

if not rows:
    raise SystemExit(
        "No snippet IDs were found. Run "
        "'npx supabase@latest snippets list --output json' manually "
        "and inspect the result."
    )

with target.open("w", encoding="utf-8") as handle:
    for snippet_id, title in rows:
        handle.write(f"{snippet_id}\t{title}\n")

print(f"Found {len(rows)} saved snippets.")
PY

COUNT=0
while IFS=$'\t' read -r SNIPPET_ID TITLE; do
  COUNT=$((COUNT + 1))
  PADDED=$(printf "%03d" "$COUNT")
  SAFE_TITLE=$(printf '%s' "$TITLE" \
    | tr '[:upper:]' '[:lower:]' \
    | sed -E 's/[^a-z0-9]+/-/g; s/^-+//; s/-+$//' \
    | cut -c1-70)

  if [ -z "$SAFE_TITLE" ]; then
    SAFE_TITLE="untitled"
  fi

  FILE="$SQL_DIR/${PADDED}-${SAFE_TITLE}-${SNIPPET_ID}.sql"

  echo "[$COUNT] Downloading: $TITLE"
  npx supabase@latest snippets download "$SNIPPET_ID" > "$FILE"
done < "$OUT_DIR/snippets.tsv"

{
  echo "Supabase SQL query export"
  echo "Created: $(date -Iseconds)"
  echo "Queries exported: $COUNT"
  echo
  echo "snippets-list.json contains the original list metadata."
  echo "snippets.tsv maps snippet IDs to their existing titles."
  echo "sql/ contains each complete saved SQL query."
} > "$OUT_DIR/README.txt"

if command -v zip >/dev/null 2>&1; then
  zip -qr "$ZIP_FILE" "$OUT_DIR"
else
  python3 - "$OUT_DIR" "$ZIP_FILE" <<'PY'
import shutil
import sys
from pathlib import Path

folder = Path(sys.argv[1])
zip_path = Path(sys.argv[2])
base = str(zip_path.with_suffix(""))
shutil.make_archive(base, "zip", root_dir=folder.parent, base_dir=folder.name)
PY
fi

echo
echo "Finished."
echo "Created: $(pwd)/$ZIP_FILE"
echo
echo "Open the folder in Windows with:"
echo "  explorer.exe ."
echo
echo "Then upload $ZIP_FILE to ChatGPT."
