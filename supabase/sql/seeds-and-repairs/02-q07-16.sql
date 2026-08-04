-- Replace YOUR_LOGIN_EMAIL with the email you use to sign into YardPilot.
-- Run once after yardpilot-marketplace-client-payments-v1.sql.

insert into public.platform_admins(user_id)
select id
from auth.users
where lower(email) = lower('wybryant01@gmail.com')
on conflict (user_id) do nothing;

select u.email, pa.created_at
from public.platform_admins pa
join auth.users u on u.id = pa.user_id
order by pa.created_at;
