# YardPilotUSA current code audit — August 4, 2026

## Verified scroll state

The current uploaded bundle already contains the authenticated scroll repair:

- `AppLayout.tsx` and `ClientLayout.tsx` use `h-[100dvh]`, `min-h-0`, and an
  `overflow-y-auto` main container.
- `src/styles/index.css` defines `.app-page-scroll` with vertical scrolling and
  mobile momentum scrolling.

The fix must still be built and deployed to Vercel before the production site
changes. If production still cannot scroll after deployment, verify the deployed
commit and test in a private browser window to bypass cached assets.

## Safe cleanup findings

- 269 files were scanned.
- 52 TypeScript/TSX files were statically unreachable.
- The entire generated `src/app/components/ui/` tree has no import from active
  application source.
- The active frontend imports only React, React DOM, React Router, Lucide, and
  Supabase JS as runtime packages.
- `pnpm-workspace.yaml` is actually a Bash archive script and is invalid YAML.
- Root `main.tsx` duplicates the real Vite entry at `src/main.tsx`.
- `add` is empty; `download` is misplaced `.gitignore` text.
- `settings.json` and `extensions.json` belong in `.vscode/`.
- `create-invoice-checkout` still contains duplicate filenames with embedded
  spaces even though the correct files are also present.
- Four CSS files and three old source areas are unreferenced.
- Two downloaded maintenance archives are stored inside the repository and
  should not be versioned.

## Deferred refactor

The cleanup intentionally does not rewrite behavior in:

- `AppContext.tsx` — 3,042 lines
- `Contacts.tsx` — 1,741 lines
- `EstimateBuilder.tsx` — 1,332 lines
- `Team.tsx` — 1,024 lines
- `Invoices.tsx` — 994 lines

Those files should be decomposed after functional regression testing, because
splitting them now would carry significantly more launch risk than removing
unreferenced files and dependencies.
