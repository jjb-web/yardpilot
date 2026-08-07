# YardPilotUSA diagnostic fixes applied

- Corrected `CREATE POLICY ... ON ... AS RESTRICTIVE` ordering in the launch-hardening migration.
- Corrected the diagnostics function-order expression.
- Renamed the invoice checkout Edge Function files to exact Supabase names: `index.ts` and `deno.json`.
- Removed the obsolete employee self-claim UI/RPC path; launch hardening makes job assignment manager-controlled.
- Repaired `.gitignore` so local secrets, platform state, dependencies, and build output are excluded.
- Corrected the unused root `main.tsx` paths.
- Added `create-invoice-checkout` to the deployment commands.

These source fixes do not prove that the live Supabase schema, secrets, webhooks, or Vercel environment match the repository. Run the included live diagnostics after applying the corrected migration.
