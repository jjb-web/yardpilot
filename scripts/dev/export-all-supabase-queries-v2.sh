#!/usr/bin/env bash
set -euo pipefail

# Export ALL saved SQL snippets from a linked Supabase project.
# This bypasses the Supabase CLI's 10-snippet listing limit by using
# the Management API directly, then creates a .tar.gz archive.
#
# Run from the YardPilot repository root:
#   bash export-all-supabase-queries-v2.sh
#
# Optional:
#   bash export-all-supabase-queries-v2.sh YOUR_PROJECT_REF

PROJECT_REF="${1:-${SUPABASE_PROJECT_REF:-}}"

if [[ -z "$PROJECT_REF" ]]; then
  for candidate in \
    "supabase/.temp/project-ref" \
    ".supabase/project-ref" \
    "supabase/.branches/_current_branch"
  do
    if [[ -f "$candidate" ]]; then
      PROJECT_REF="$(tr -d '[:space:]' < "$candidate")"
      [[ -n "$PROJECT_REF" ]] && break
    fi
  done
fi

if [[ -z "$PROJECT_REF" ]]; then
  read -r -p "Supabase project reference: " PROJECT_REF
fi

if [[ -z "$PROJECT_REF" ]]; then
  echo "No Supabase project reference was provided." >&2
  exit 1
fi

ACCESS_TOKEN="${SUPABASE_ACCESS_TOKEN:-}"

if [[ -z "$ACCESS_TOKEN" && -f "$HOME/.supabase/access-token" ]]; then
  ACCESS_TOKEN="$(tr -d '\r\n' < "$HOME/.supabase/access-token")"
fi

if [[ -z "$ACCESS_TOKEN" ]]; then
  echo "The script could not read the Supabase CLI access token automatically."
  echo "Paste your Supabase personal access token below."
  echo "It stays local and is not written into the export."
  read -r -s -p "Supabase access token: " ACCESS_TOKEN
  echo
fi

if [[ -z "$ACCESS_TOKEN" ]]; then
  echo "No access token was supplied." >&2
  exit 1
fi

STAMP="$(date +%Y%m%d-%H%M%S)"
OUT_DIR="supabase-query-export-all-$STAMP"
ARCHIVE="$OUT_DIR.tar.gz"

mkdir -p "$OUT_DIR/sql" "$OUT_DIR/raw"

export YP_PROJECT_REF="$PROJECT_REF"
export YP_ACCESS_TOKEN="$ACCESS_TOKEN"
export YP_OUT_DIR="$OUT_DIR"

python3 <<'PY'
import json
import os
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

project_ref = os.environ["YP_PROJECT_REF"].strip()
access_token = os.environ["YP_ACCESS_TOKEN"].strip()
out_dir = Path(os.environ["YP_OUT_DIR"])
sql_dir = out_dir / "sql"
raw_dir = out_dir / "raw"

base_url = "https://api.supabase.com/v1"
headers = {
    "Authorization": f"Bearer {access_token}",
    "Accept": "application/json",
    "User-Agent": "yardpilot-sql-export/2",
}

def get_json(url: str):
    request = urllib.request.Request(url, headers=headers, method="GET")
    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            body = response.read().decode("utf-8")
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"Supabase API returned HTTP {exc.code}: {detail}") from exc
    except urllib.error.URLError as exc:
        raise RuntimeError(f"Could not connect to Supabase API: {exc}") from exc
    return json.loads(body)

# Retrieve every page. The CLI currently only exposes the first page.
all_snippets = []
seen_ids = set()
seen_cursors = set()
cursor = None
page_number = 0

while True:
    page_number += 1
    params = {
        "project_ref": project_ref,
        "limit": "100",
        "sort_by": "inserted_at",
        "sort_order": "desc",
    }
    if cursor:
        params["cursor"] = cursor

    url = f"{base_url}/snippets?{urllib.parse.urlencode(params)}"
    page = get_json(url)
    (raw_dir / f"list-page-{page_number:03d}.json").write_text(
        json.dumps(page, indent=2), encoding="utf-8"
    )

    if isinstance(page, dict):
        items = page.get("data", [])
        next_cursor = page.get("cursor")
    elif isinstance(page, list):
        items = page
        next_cursor = None
    else:
        raise RuntimeError("Unexpected response from the Supabase snippets API.")

    if not isinstance(items, list):
        raise RuntimeError("Supabase snippets response did not contain a data list.")

    added = 0
    for item in items:
        if not isinstance(item, dict):
            continue
        snippet_id = str(item.get("id", "")).strip()
        if not snippet_id or snippet_id in seen_ids:
            continue
        seen_ids.add(snippet_id)
        all_snippets.append(item)
        added += 1

    if not next_cursor or next_cursor in seen_cursors or added == 0:
        break

    seen_cursors.add(next_cursor)
    cursor = next_cursor

if not all_snippets:
    raise RuntimeError("No saved SQL snippets were returned for this project.")

def find_sql(value):
    """Find the SQL text in the detail response without assuming one schema."""
    if isinstance(value, dict):
        for key in ("content", "sql", "query", "snippet"):
            candidate = value.get(key)
            if isinstance(candidate, str) and candidate.strip():
                return candidate
        for key in ("data", "result"):
            if key in value:
                candidate = find_sql(value[key])
                if candidate:
                    return candidate
        for child in value.values():
            candidate = find_sql(child)
            if candidate:
                return candidate
    elif isinstance(value, list):
        for child in value:
            candidate = find_sql(child)
            if candidate:
                return candidate
    return None

def safe_name(value: str) -> str:
    value = value.lower().strip()
    value = re.sub(r"[^a-z0-9]+", "-", value)
    value = value.strip("-")
    return (value[:80] or "untitled")

metadata_rows = []
failures = []

for index, item in enumerate(all_snippets, start=1):
    snippet_id = str(item["id"])
    title = str(
        item.get("name")
        or item.get("title")
        or item.get("description")
        or "untitled"
    ).strip()

    print(f"[{index}/{len(all_snippets)}] Downloading: {title}")

    detail = get_json(f"{base_url}/snippets/{urllib.parse.quote(snippet_id)}")
    (raw_dir / f"{index:03d}-{snippet_id}.json").write_text(
        json.dumps(detail, indent=2), encoding="utf-8"
    )

    sql = find_sql(detail)
    if not sql:
        failures.append((snippet_id, title))
        continue

    filename = f"{index:03d}-{safe_name(title)}-{snippet_id}.sql"
    (sql_dir / filename).write_text(sql.rstrip() + "\n", encoding="utf-8")

    metadata_rows.append(
        {
            "number": index,
            "id": snippet_id,
            "name": title,
            "inserted_at": item.get("inserted_at", ""),
            "updated_at": item.get("updated_at", ""),
            "filename": filename,
        }
    )

(out_dir / "snippets-list-all.json").write_text(
    json.dumps(all_snippets, indent=2), encoding="utf-8"
)

with (out_dir / "snippets.tsv").open("w", encoding="utf-8") as handle:
    handle.write("number\tid\tname\tinserted_at\tupdated_at\tfilename\n")
    for row in metadata_rows:
        values = [
            str(row["number"]),
            row["id"],
            row["name"].replace("\t", " ").replace("\n", " "),
            str(row["inserted_at"]),
            str(row["updated_at"]),
            row["filename"],
        ]
        handle.write("\t".join(values) + "\n")

readme = [
    "Supabase SQL query export — all pages",
    f"Project reference: {project_ref}",
    f"Queries listed: {len(all_snippets)}",
    f"SQL files written: {len(metadata_rows)}",
    "",
    "sql/ contains the complete SQL text.",
    "raw/ contains the original Management API responses.",
    "snippets.tsv maps titles and IDs to filenames.",
    "No Supabase access token is stored in this export.",
]

if failures:
    readme.extend(["", "Queries whose SQL text could not be detected:"])
    readme.extend(f"- {snippet_id}: {title}" for snippet_id, title in failures)

(out_dir / "README.txt").write_text("\n".join(readme) + "\n", encoding="utf-8")

print()
print(f"Found {len(all_snippets)} saved snippets.")
print(f"Wrote {len(metadata_rows)} SQL files.")

if failures:
    print(f"Warning: {len(failures)} snippet details did not expose recognizable SQL.")
    print("Their raw JSON responses were still preserved.")
PY

# Remove the token from the environment before packaging.
unset YP_ACCESS_TOKEN ACCESS_TOKEN

tar -czf "$ARCHIVE" "$OUT_DIR"

echo
echo "Finished."
echo "Created: $(pwd)/$ARCHIVE"
echo
echo "Check the count with:"
echo "  find \"$OUT_DIR/sql\" -type f -name '*.sql' | wc -l"
echo
echo "Open this folder in Windows with:"
echo "  explorer.exe ."
echo
echo "Upload this file to ChatGPT:"
echo "  $ARCHIVE"
