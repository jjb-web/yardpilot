#!/usr/bin/env bash
set -euo pipefail

cd "${1:-$HOME/yardpilot}"

STAMP="$(date +%Y%m%d-%H%M%S)"
OUT="yardpilot-code-audit-$STAMP"
mkdir -p "$OUT"

python3 - "$OUT" <<'PY'
from __future__ import annotations

import csv
import hashlib
import json
import re
import sys
from collections import defaultdict
from pathlib import Path

root = Path.cwd()
out = Path(sys.argv[1])
src = root / "src"

source_suffixes = {".ts", ".tsx", ".js", ".jsx", ".css", ".sql"}
ignored_parts = {
    ".git", "node_modules", "dist", "build", "coverage", ".next",
    ".vite", ".vercel", ".supabase", ".turbo", ".cache", "backups",
}

def included(path: Path) -> bool:
    try:
        rel = path.relative_to(root)
    except ValueError:
        return False
    return not any(part in ignored_parts for part in rel.parts)

all_files = [p for p in root.rglob("*") if p.is_file() and included(p)]

# Manifest and largest files.
manifest_rows = []
for path in all_files:
    rel = path.relative_to(root)
    manifest_rows.append((str(rel), path.stat().st_size))

with (out / "file-manifest.tsv").open("w", encoding="utf-8", newline="") as f:
    writer = csv.writer(f, delimiter="\t")
    writer.writerow(["path", "bytes"])
    writer.writerows(sorted(manifest_rows))

largest = sorted(manifest_rows, key=lambda row: row[1], reverse=True)[:50]

# Zero-byte and duplicate files.
zero_files = [path.relative_to(root) for path in all_files if path.stat().st_size == 0]
hash_groups: dict[tuple[int, str], list[Path]] = defaultdict(list)
for path in all_files:
    size = path.stat().st_size
    if size == 0:
        continue
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    hash_groups[(size, digest)].append(path.relative_to(root))
duplicates = [paths for paths in hash_groups.values() if len(paths) > 1]

# Source line counts.
line_counts = []
for path in all_files:
    if path.suffix.lower() in source_suffixes:
        try:
            count = len(path.read_text(encoding="utf-8", errors="ignore").splitlines())
        except OSError:
            continue
        line_counts.append((count, path.relative_to(root)))
large_sources = sorted(line_counts, reverse=True)[:50]

# Static TS/TSX import reachability from src/main.tsx.
ts_files = {
    path.resolve(): path
    for path in src.rglob("*")
    if path.is_file() and path.suffix in {".ts", ".tsx"}
}
import_re = re.compile(
    r"""(?:import\s+(?:[^;]*?\s+from\s+)?|export\s+[^;]*?\s+from\s+|import\s*\()\s*['"]([^'"]+)['"]""",
    re.S,
)

def resolve_import(source: Path, specifier: str) -> Path | None:
    if specifier.startswith("@/"):
        base = src / specifier[2:]
    elif specifier.startswith("."):
        base = source.parent / specifier
    else:
        return None

    candidates = [
        base,
        Path(str(base) + ".ts"),
        Path(str(base) + ".tsx"),
        base / "index.ts",
        base / "index.tsx",
    ]
    for candidate in candidates:
        resolved = candidate.resolve()
        if resolved in ts_files:
            return resolved
    return None

graph: dict[Path, list[Path]] = {}
external_imports: dict[Path, list[str]] = {}
for resolved, path in ts_files.items():
    text = path.read_text(encoding="utf-8", errors="ignore")
    dependencies = []
    externals = []
    for specifier in import_re.findall(text):
        target = resolve_import(path, specifier)
        if target:
            dependencies.append(target)
        elif not specifier.startswith(("figma:",)):
            externals.append(specifier)
    graph[resolved] = dependencies
    external_imports[resolved] = externals

entry = (src / "main.tsx").resolve()
reachable: set[Path] = set()
if entry in ts_files:
    stack = [entry]
    while stack:
        current = stack.pop()
        if current in reachable:
            continue
        reachable.add(current)
        stack.extend(graph.get(current, []))

unreachable = sorted(
    (path.relative_to(root) for resolved, path in ts_files.items() if resolved not in reachable),
    key=str,
)

# Imported runtime packages reachable from the entrypoint.
reachable_packages = set()
for resolved in reachable:
    for specifier in external_imports.get(resolved, []):
        if specifier.startswith(".") or specifier.startswith("@/"):
            continue
        if specifier.startswith("@"):
            pieces = specifier.split("/")
            package = "/".join(pieces[:2])
        else:
            package = specifier.split("/")[0]
        reachable_packages.add(package)

package_json = root / "package.json"
dependencies = {}
dev_dependencies = {}
if package_json.exists():
    package_data = json.loads(package_json.read_text(encoding="utf-8"))
    dependencies = package_data.get("dependencies", {})
    dev_dependencies = package_data.get("devDependencies", {})

unused_dependencies = sorted(set(dependencies) - reachable_packages)

# Unimported CSS from the app entry graph.
css_import_re = re.compile(r"""(?:import\s+|@import\s+)['"]([^'"]+\.css)['"]""")
imported_css = set()
for resolved in reachable:
    path = ts_files[resolved]
    text = path.read_text(encoding="utf-8", errors="ignore")
    for specifier in css_import_re.findall(text):
        candidate = (path.parent / specifier).resolve()
        if candidate.exists():
            imported_css.add(candidate)

# Follow CSS @imports.
queue = list(imported_css)
while queue:
    path = queue.pop()
    text = path.read_text(encoding="utf-8", errors="ignore")
    for specifier in css_import_re.findall(text):
        if specifier.startswith(("http://", "https://")):
            continue
        candidate = (path.parent / specifier).resolve()
        if candidate.exists() and candidate not in imported_css:
            imported_css.add(candidate)
            queue.append(candidate)

all_css = {p.resolve(): p for p in src.rglob("*.css")}
unimported_css = sorted(
    (path.relative_to(root) for resolved, path in all_css.items() if resolved not in imported_css),
    key=str,
)

# Suspicious root artifacts.
suspicious = []
checks = {
    "add": "Unexpected zero-byte/generated root file",
    "download": "Looks like accidentally downloaded text rather than a named config file",
    "main.tsx": "Duplicate root entrypoint; Vite uses src/main.tsx",
    "default_shadcn_theme.css": "Likely generated theme copy; verify imports",
    "settings.json": "VS Code settings normally belong in .vscode/settings.json",
    "extensions.json": "VS Code recommendations normally belong in .vscode/extensions.json",
}
for name, reason in checks.items():
    path = root / name
    if path.exists():
        suspicious.append((name, reason))

workspace = root / "pnpm-workspace.yaml"
if workspace.exists():
    beginning = workspace.read_text(encoding="utf-8", errors="ignore")[:80]
    if beginning.startswith("#!/usr/bin/env bash"):
        suspicious.append(("pnpm-workspace.yaml", "Contains a Bash script, not pnpm workspace YAML"))

report = []
report.append("# YardPilot codebase audit")
report.append("")
report.append(f"- Files scanned: **{len(all_files)}**")
report.append(f"- TypeScript/TSX files: **{len(ts_files)}**")
report.append(f"- Reachable from `src/main.tsx`: **{len(reachable)}**")
report.append(f"- Static unreachable candidates: **{len(unreachable)}**")
report.append(f"- Zero-byte files: **{len(zero_files)}**")
report.append(f"- Duplicate-content groups: **{len(duplicates)}**")
report.append("")
report.append("> Unreachable and unused results are review candidates, not automatic deletion instructions. Dynamic imports or newly generated files can require manual confirmation.")
report.append("")

report.append("## Immediate suspicious root files")
report.append("")
if suspicious:
    for name, reason in suspicious:
        report.append(f"- `{name}` — {reason}")
else:
    report.append("- None detected.")
report.append("")

report.append("## Largest files")
report.append("")
for path, size in largest[:25]:
    report.append(f"- `{path}` — {size / 1024:.1f} KB")
report.append("")

report.append("## Largest source files")
report.append("")
for lines, path in large_sources[:25]:
    report.append(f"- `{path}` — {lines} lines")
report.append("")

report.append("## Static unreachable TS/TSX candidates")
report.append("")
if unreachable:
    for path in unreachable:
        report.append(f"- `{path}`")
else:
    report.append("- None.")
report.append("")

report.append("## Unimported CSS candidates")
report.append("")
if unimported_css:
    for path in unimported_css:
        report.append(f"- `{path}`")
else:
    report.append("- None.")
report.append("")

report.append("## Runtime packages reachable from the entrypoint")
report.append("")
for package in sorted(reachable_packages):
    report.append(f"- `{package}`")
report.append("")

report.append("## Dependency removal candidates")
report.append("")
if unused_dependencies:
    for package in unused_dependencies:
        report.append(f"- `{package}`")
else:
    report.append("- None.")
report.append("")

report.append("## Zero-byte files")
report.append("")
if zero_files:
    for path in zero_files:
        report.append(f"- `{path}`")
else:
    report.append("- None.")
report.append("")

report.append("## Duplicate-content groups")
report.append("")
if duplicates:
    for group in duplicates:
        report.append("- " + ", ".join(f"`{path}`" for path in sorted(group, key=str)))
else:
    report.append("- None.")

(out / "README.md").write_text("\n".join(report) + "\n", encoding="utf-8")

(out / "unreachable-ts-files.txt").write_text(
    "\n".join(str(path) for path in unreachable) + ("\n" if unreachable else ""),
    encoding="utf-8",
)
(out / "unused-dependencies.txt").write_text(
    "\n".join(unused_dependencies) + ("\n" if unused_dependencies else ""),
    encoding="utf-8",
)
(out / "unimported-css.txt").write_text(
    "\n".join(str(path) for path in unimported_css) + ("\n" if unimported_css else ""),
    encoding="utf-8",
)

print(f"Audit written to {out}")
PY

tar -czf "$OUT.tar.gz" "$OUT"

echo
echo "Created:"
echo "  $(pwd)/$OUT.tar.gz"
echo
echo "Open the report:"
echo "  less $OUT/README.md"
echo
echo "Open the folder in Windows:"
echo "  explorer.exe ."
