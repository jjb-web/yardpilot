# YardPilotUSA database cleanup plan

## Safety rule

A saved SQL Editor query is only a saved text document. A table, function, policy,
trigger, index, or row in PostgreSQL is a live database object. Delete saved
queries separately from live objects.

Do not run `drop table`, `drop function`, `drop policy`, `drop trigger`,
`truncate`, or broad `delete` statements until the live-object audit has been
reviewed.

## Phase 1 — Clean the SQL Editor safely

The complete export is already preserved. For a gradual cleanup, remove these
saved snippets first:

- Exact duplicate: #5
- Superseded patches: #6, #9, #33, #35
- Duplicate one-time admin query: #7
- Invalid/incomplete and never runnable: #11, #18
- Incident-only diagnostic: #21

Optional editor cleanup after confirming the archive is stored:

- Specific one-time admin query: #1
- Optional promotional-code seed: #12
- Stripe onboarding diagnostic: #19
- One-time owner-membership repair: #24

Keep the remaining snippets in the Dashboard temporarily until the source
overlay is committed. After that, all 36 Dashboard snippets can be deleted.

Deleting a Dashboard snippet does not undo SQL that previously ran.

## Phase 2 — Preserve source in the repository

Extract this overlay into the YardPilotUSA repository root. It places old SQL under
`supabase/sql/history`, not `supabase/migrations`, so it cannot be accidentally
pushed as pending migrations.

Recommended long-term layout:

- `supabase/migrations/`: future executable, timestamped migrations only
- `supabase/sql/history/`: historical source needed to understand/rebuild the app
- `supabase/sql/diagnostics/`: read-only checks
- `supabase/sql/seeds-and-repairs/`: manually invoked seeds/repairs
- `supabase/sql/archive/`: superseded or invalid historical snippets
- `supabase/sql/proposed/`: reviewed cleanup SQL not yet applied

## Phase 3 — Capture the live database as the source of truth

Before changing live objects, create a schema backup and current baseline.

Suggested commands from `~/yardpilot`:

```bash
mkdir -p backups
npx supabase@latest db dump --linked   -f "backups/$(date +%Y%m%d-%H%M%S)-yardpilot-schema.sql"
```

For a formal migration baseline, use `npx supabase@latest db pull` after Docker
Desktop with WSL integration is running. Review the generated migration before
accepting any migration-history repair prompt.

Never run `supabase db reset --linked`; that is destructive to the remote
database.

## Phase 4 — Run the read-only live audit

Run:

`supabase/sql/diagnostics/yardpilot-live-object-audit-v1.sql`

Preserve all result tabs. It checks:

- Required tables and RPCs
- RLS coverage
- Every public/storage policy
- Exact duplicate policy definitions
- Triggers
- SECURITY DEFINER functions missing an explicit search path
- Function overloads
- Invalid indexes
- Zero-scan index candidates
- Foreign-key dependencies
- Live migration history

## Phase 5 — What can be removed from the live database now?

Nothing should be dropped merely because its original saved query is old.

Definite interpretation of the 36-query history:

- Old baseline queries created the same `projects`, `profiles`, `contacts`,
  workspace, invoice, and marketplace objects that later queries altered.
  They did not create separate duplicate tables.
- Most later function changes used `create or replace function`; PostgreSQL keeps
  one current function per signature.
- Most policy changes used `drop policy if exists` followed by `create policy`;
  identical policy names do not accumulate.
- Invalid query #11 and incomplete query #18 created no useful cleanup target.

One confirmed cleanup candidate exists: resume-storage policies were created
under both plural and singular names. The proposed policy canonicalization file
preserves the behavior and leaves one naming convention. Run it only after the
live audit confirms both variants.

## Phase 6 — Deferred cleanup candidate

`employee_claim_project` is intentionally disabled by the launch-hardening SQL,
but the uploaded frontend still calls it. Do not drop the function until:

1. The frontend claim-job action is removed or replaced.
2. Manager-controlled project assignment is tested.
3. No Edge Function or client code calls the RPC.
4. The live audit confirms the function is no longer required.

Then create a new timestamped migration that revokes and drops the exact
signature.

## Phase 7 — Future workflow

For every future database change:

1. Create a timestamped migration with
   `npx supabase@latest migration new descriptive_name`.
2. Test locally.
3. Review `npx supabase@latest db push --dry-run`.
4. Commit migration and generated types.
5. Push the migration once.
6. Use SQL Editor only for read-only diagnostics or emergency repairs that are
   immediately copied into version control.
