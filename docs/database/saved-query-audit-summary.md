# YardPilot Supabase Saved-Query Audit

Generated from the complete export uploaded on August 3, 2026.

## Bottom line

- The archive contains **36 complete saved SQL queries**.
- Saved SQL Editor queries are **not runtime processes**. After this archive is stored safely, deleting a saved query from the Supabase Dashboard does **not** delete tables, policies, functions, triggers, or data already created in PostgreSQL.
- Do **not** blindly rerun the old queries. Several are migrations, several intentionally rewrite data or security policies, two are invalid, and one pair is an exact duplicate.
- Your current repository is missing SQL source for several RPCs the frontend still calls. Those old snippets therefore contain important source code even though the Dashboard entries themselves are not required.

## Definite findings

1. **Queries #2 and #5 are exact duplicates.**
2. **Query #11 is invalid PostgreSQL** because it uses `ALTER FUNCTION IF EXISTS`.
3. **Query #18 is incomplete** (`update public.invoices`) and must never be run.
4. **Queries #1 and #7 perform the same one-time platform-admin grant.**
5. **Query #6 is superseded by #2**, which redefines its recursion-safe helpers and policies and adds later marketplace search fixes.
6. **Query #9 is superseded** by the corrected volatility patch (#10) and later launch hardening (#4).
7. **Queries #33 and #35 are superseded early schema fragments.**
8. **Query #4 is the corrected launch-hardening migration**, and #3 is the corrected read-only diagnostics query.

## Important repository gap

Static comparison against the uploaded YardPilot project found current frontend RPC calls whose SQL definitions are not stored in the current repository:

| rpc                                      | query_defs   | app_locations                                           |
|:-----------------------------------------|:-------------|:--------------------------------------------------------|
| accept_workspace_invite                  | 28, 30       | src/app/context/AppContext.tsx, src/app/pages/Login.tsx |
| create_company_workspace                 | 29           | src/app/context/AppContext.tsx                          |
| create_workgroup_workspace               | 26           | src/app/context/AppContext.tsx                          |
| delete_project_with_connected_data       | 26           | src/app/context/AppContext.tsx                          |
| get_employee_project_operational_details | 14           | src/app/context/AppContext.tsx                          |
| get_project_labor_assignments            | 29           | src/app/context/AppContext.tsx                          |
| get_workspace_members                    | 29, 30       | src/app/context/AppContext.tsx                          |
| record_estimate_view                     | 29           | src/app/pages/PublicEstimate.tsx                        |
| record_invoice_view                      | 27           | src/app/pages/PublicInvoice.tsx                         |
| respond_to_estimate                      | 29           | src/app/pages/PublicEstimate.tsx                        |
| update_my_profile                        | 27           | src/app/context/AppContext.tsx                          |
| update_my_workspace_rate                 | 26           | src/app/context/AppContext.tsx                          |
| update_workspace_member                  | 29           | src/app/context/AppContext.tsx                          |

This means the live database may currently contain the functions, but a clean rebuild from the repository alone would be incomplete.

## Recommended organization

- `01-preserve-migration-source/`: important historical/current schema source. Preserve it in version control, but do not rerun it blindly against the live database.
- `02-diagnostics/`: read-only troubleshooting SQL.
- `03-one-time-seeds-and-repairs/`: administrator grants, promotional seed examples, and data repair scripts.
- `04-archive-superseded/`: historical snippets replaced by later SQL.
- `05-invalid-never-run/`: invalid or incomplete snippets.

## Dashboard cleanup rule

Once this organized archive is backed up and committed somewhere safe, you may delete all 36 saved SQL Editor snippets from the Supabase Dashboard. Keep the SQL files in your repository/archive instead. Dashboard deletion only removes the saved editor copy.

## Next technical step

Before applying any SQL again, run the current read-only live-schema diagnostics. The saved-query archive does not prove which migrations succeeded; it only proves what SQL was saved.
