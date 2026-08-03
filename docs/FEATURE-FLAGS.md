# Emergency Feature Flags

The migration creates these flags:

```text
public_registration
marketplace_bidding
marketplace_hiring
browser_push
ai_assistant
real_payroll
```

Disable bidding immediately:

```sql
update public.feature_flags
set enabled = false, updated_at = now()
where key = 'marketplace_bidding';
```

Disable hiring similarly with `marketplace_hiring`. The frontend hides/pauses
the matching workflow and database policies block new requests, bids, openings,
and applications. Existing records remain.

`public_registration` disables the YardPilot registration UI. For a true
emergency registration shutdown, also disable new-user signups in Supabase Auth,
because a browser flag alone cannot secure the Auth API. Valid existing sessions
and team-invitation behavior should be tested after changing Auth settings.

Keep `browser_push`, `ai_assistant`, and `real_payroll` disabled until separately
implemented, reviewed, and tested.
