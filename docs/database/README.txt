YardPilot database cleanup overlay

This archive does not alter the live database.

Extract it into the YardPilot repository root. It adds:
- organized historical SQL source
- a read-only live-object audit
- a proposed resume-policy canonicalization migration
- a step-by-step cleanup plan

Historical SQL is intentionally stored outside supabase/migrations to prevent
accidental execution against the live project.
