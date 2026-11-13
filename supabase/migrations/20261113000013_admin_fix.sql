-- Follow-up to 20261113000012_admin.sql: is_suspended() was still callable by signed-out visitors
-- (Postgres lets everyone run a new function unless that is revoked). Only signed-in people need it.
revoke execute on function public.is_suspended(uuid) from public, anon;
grant execute on function public.is_suspended(uuid) to authenticated;
