# YardPilotUSA codebase structure

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
