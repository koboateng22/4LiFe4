-- Admin dashboard: what administrators can see and do, all through functions that check
-- public.is_admin() first. Reuses the existing admin role (profiles.role = 'admin', assigned by the
-- project owner in the SQL editor: SUPABASE.md, step 7) and adds no second role system.
-- Forward-only: new tables, functions and restrictive policies; no data is changed or removed.
--
-- Privacy rules for everything below:
--  * no recovery content (chats are on devices; check-ins, thought records, safety plans, notes are not read)
--  * no session notes, private notes or session topics
--  * no SOS coordinates or support-contact phone numbers; who raised an SOS is shown only with a reason, logged
--  * every change, and every look at a person's details or an SOS, is written to admin_actions

-- ---------------------------------------------------------------------
-- 1. The admin action log: append-only, admins read it, only the functions below write it
-- ---------------------------------------------------------------------
create table if not exists public.admin_actions (
  id           bigint generated always as identity primary key,
  at           timestamptz not null default now(),
  admin_id     uuid not null,
  action       text not null check (char_length(action) between 2 and 60),
  target_type  text check (char_length(target_type) <= 40),
  target_id    text check (char_length(target_id) <= 80),
  reason       text check (char_length(reason) <= 500),
  details      jsonb not null default '{}'::jsonb
);
create index if not exists admin_actions_at_idx on public.admin_actions (at desc);
create index if not exists admin_actions_target_idx on public.admin_actions (target_type, target_id);
drop trigger if exists admin_actions_append_only on public.admin_actions;
create trigger admin_actions_append_only before update or delete on public.admin_actions
  for each row execute function public.forbid_change();
alter table public.admin_actions enable row level security;
drop policy if exists "admin actions: admins read" on public.admin_actions;
create policy "admin actions: admins read" on public.admin_actions for select to authenticated using (public.is_admin());

create or replace function public.admin_require()
returns void language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'Admins only' using errcode = '42501';
  end if;
end $$;

create or replace function public.admin_log(p_action text, p_type text, p_id text, p_reason text default null, p_details jsonb default '{}'::jsonb)
returns void language sql security definer set search_path = '' as $$
  insert into public.admin_actions (admin_id, action, target_type, target_id, reason, details)
  values (auth.uid(), p_action, p_type, left(p_id, 80), nullif(left(trim(coalesce(p_reason, '')), 500), ''), coalesce(p_details, '{}'::jsonb));
$$;
revoke execute on function public.admin_require() from public, anon, authenticated;
revoke execute on function public.admin_log(text, text, text, text, jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 2. Suspended accounts. The person can still sign in to read and download their own data and
--    use SOS and the emergency tools; they cannot post, react, request or book, and a suspended
--    therapist is hidden from the directory and offers no free times.
-- ---------------------------------------------------------------------
create table if not exists public.account_suspensions (
  user_id       uuid primary key references public.profiles (id) on delete cascade,
  suspended_at  timestamptz not null default now(),
  suspended_by  uuid,
  reason        text not null check (char_length(reason) between 3 and 500)
);
alter table public.account_suspensions enable row level security;
drop policy if exists "suspensions: own or admin reads" on public.account_suspensions;
create policy "suspensions: own or admin reads" on public.account_suspensions for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

create or replace function public.is_suspended(p_user uuid default auth.uid())
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.account_suspensions s where s.user_id = p_user);
$$;
grant execute on function public.is_suspended(uuid) to authenticated;

-- Restrictive policies: they narrow the existing rules, never widen them
drop policy if exists "suspended: no posts" on public.village_posts;
create policy "suspended: no posts" on public.village_posts as restrictive for insert to authenticated with check (not public.is_suspended());
drop policy if exists "suspended: no replies" on public.village_replies;
create policy "suspended: no replies" on public.village_replies as restrictive for insert to authenticated with check (not public.is_suspended());
drop policy if exists "suspended: no circle chat" on public.circle_messages;
create policy "suspended: no circle chat" on public.circle_messages as restrictive for insert to authenticated with check (not public.is_suspended());
drop policy if exists "suspended: no reactions" on public.village_support;
create policy "suspended: no reactions" on public.village_support as restrictive for insert to authenticated with check (not public.is_suspended());
drop policy if exists "suspended: no requests" on public.session_requests;
create policy "suspended: no requests" on public.session_requests as restrictive for insert to authenticated
  with check (not public.is_suspended() and not public.is_suspended(therapist_id));
drop policy if exists "suspended: no bookings" on public.sessions;
create policy "suspended: no bookings" on public.sessions as restrictive for insert to authenticated with check (not public.is_suspended());
drop policy if exists "suspended: not in the directory" on public.therapists;
create policy "suspended: not in the directory" on public.therapists as restrictive for select to authenticated
  using (not public.is_suspended(id) or id = auth.uid() or public.is_admin() or public.is_my_therapist(id));
drop policy if exists "suspended: services not listed" on public.therapist_services;
create policy "suspended: services not listed" on public.therapist_services as restrictive for select to authenticated
  using (therapist_id = auth.uid() or public.is_admin() or not public.is_suspended(therapist_id));

-- Free times and accepting requests: the same functions as in 20261112000010, plus the suspension check
create or replace function public.therapist_free_slots(p_therapist uuid, p_days integer default 14, p_duration integer default null)
returns setof timestamptz language plpgsql stable security definer set search_path = '' as $$
declare
  t        public.therapists;
  v_len    integer;
  v_day    date;
  v_today  date := (now() at time zone 'Africa/Accra')::date;
  v_t      time;
  v_start  timestamptz;
  v_count  integer := 0;
begin
  select * into t from public.therapists where id = p_therapist and verification = 'verified' and accepting_clients;
  if t is null or public.is_suspended(t.id) then return; end if;
  -- (greatest() skips a NULL, so the therapist's own length is chosen explicitly when none is asked for)
  v_len := case when p_duration is null then t.session_length else least(greatest(p_duration, 15), 180) end;
  for i in 0 .. least(greatest(coalesce(p_days, 14), 1), 60) - 1 loop
    v_day := v_today + i;
    continue when not (to_char(v_day, 'Dy') = any (t.work_days));
    continue when exists (select 1 from public.therapist_time_off o where o.therapist_id = t.id and v_day between o.starts_on and o.ends_on);
    v_t := t.start_time;
    while v_t + make_interval(mins => v_len) <= t.end_time and v_t >= t.start_time loop
      if t.break_start is not null and v_t < t.break_end and t.break_start < v_t + make_interval(mins => v_len) then
        v_t := t.break_end; -- skip over the break
        continue;
      end if;
      v_start := (v_day + v_t) at time zone 'Africa/Accra';
      if v_start >= now() + interval '2 hours'
         and not exists (
           select 1 from public.sessions s
            where s.therapist_id = t.id and s.status in ('scheduled', 'in_progress')
              and tstzrange(s.starts_at, s.starts_at + make_interval(mins => s.duration_min))
               && tstzrange(v_start, v_start + make_interval(mins => v_len))) then
        return next v_start;
        v_count := v_count + 1;
        if v_count >= 60 then return; end if;
      end if;
      v_t := v_t + make_interval(mins => v_len + 10);
    end loop;
  end loop;
end $$;

create or replace function public.accept_session_request(p_request uuid, p_starts_at timestamptz default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  r          public.session_requests;
  t          public.therapists;
  v_existing boolean;
  v_session  uuid;
  v_length   smallint;
begin
  select * into r from public.session_requests where id = p_request for update;
  if r is null or r.therapist_id <> auth.uid() then
    raise exception 'Request not found';
  end if;
  if public.is_suspended() then
    raise exception 'This account is suspended';
  end if;
  if r.status <> 'new' then
    raise exception 'This request has already been answered';
  end if;
  select * into t from public.therapists where id = r.therapist_id;
  select coalesce((select s.duration_min from public.therapist_services s where s.id = r.service_id and s.therapist_id = r.therapist_id), t.session_length)
    into v_length;

  select exists (select 1 from public.care_links where client_id = r.client_id and therapist_id = r.therapist_id)
    into v_existing;

  perform public.begin_system_update();

  insert into public.care_links (client_id, therapist_id, shares_checkins, status)
  values (r.client_id, r.therapist_id, r.shares_checkins, 'active')
  on conflict (client_id, therapist_id) do update
    set status = 'active', shares_checkins = excluded.shares_checkins or public.care_links.shares_checkins;

  insert into public.sessions (therapist_id, client_id, request_id, service_id, starts_at, duration_min, format, type, topic)
  values (r.therapist_id, r.client_id, r.id, r.service_id, coalesce(p_starts_at, r.preferred_time), v_length, r.format,
          case when v_existing then 'follow_up'::public.session_type else 'intake'::public.session_type end,
          case when v_existing then null else 'Getting to know each other' end)
  returning id into v_session;

  perform public.end_system_update();

  update public.session_requests set status = 'accepted', responded_at = now() where id = r.id;
  return v_session;
end $$;
-- ---------------------------------------------------------------------
-- 3. Overview: real counts and 30-day series. "Active SOS" means open and under 24 hours old;
--    older ones are history (they expire automatically), never shown as live.
-- ---------------------------------------------------------------------
create or replace function public.admin_overview()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v jsonb;
  d date := (now() at time zone 'Africa/Accra')::date;
begin
  perform public.admin_require();
  select jsonb_build_object(
    'generated_at', now(),
    'users', (select jsonb_build_object(
        'total', count(*),
        'clients', count(*) filter (where p.role = 'client'),
        'therapists', count(*) filter (where p.role = 'therapist'),
        'admins', count(*) filter (where p.role = 'admin'),
        'new_7d', count(*) filter (where p.created_at > now() - interval '7 days'),
        'new_30d', count(*) filter (where p.created_at > now() - interval '30 days'),
        'deletion_requested', count(*) filter (where p.deletion_requested_at is not null),
        'suspended', (select count(*) from public.account_suspensions),
        'active_30d', (select count(*) from auth.users u where (to_jsonb(u) ->> 'last_sign_in_at')::timestamptz > now() - interval '30 days'))
      from public.profiles p),
    'therapists', (select jsonb_build_object(
        'verified', count(*) filter (where t.verification = 'verified'),
        'pending', count(*) filter (where t.verification = 'pending'),
        'rejected', count(*) filter (where t.verification = 'rejected'),
        'accepting', count(*) filter (where t.verification = 'verified' and t.accepting_clients and not public.is_suspended(t.id)))
      from public.therapists t),
    'sessions', (select jsonb_build_object(
        'total', count(*),
        'upcoming', count(*) filter (where s.status = 'scheduled' and s.starts_at >= now()),
        'overdue', count(*) filter (where s.status = 'scheduled' and s.starts_at + make_interval(mins => s.duration_min) < now()),
        'completed', count(*) filter (where s.status = 'completed'),
        'cancelled', count(*) filter (where s.status = 'cancelled'),
        'no_show', count(*) filter (where s.status = 'no_show'))
      from public.sessions s),
    'requests', (select jsonb_build_object(
        'pending', count(*) filter (where r.status = 'new'),
        'accepted', count(*) filter (where r.status = 'accepted'),
        'declined', count(*) filter (where r.status = 'declined'),
        'withdrawn', count(*) filter (where r.status = 'withdrawn'),
        'pending_over_48h', count(*) filter (where r.status = 'new' and r.created_at < now() - interval '48 hours'))
      from public.session_requests r),
    'village', jsonb_build_object(
        'posts_7d', (select count(*) from public.village_posts where created_at > now() - interval '7 days'),
        'replies_7d', (select count(*) from public.village_replies where created_at > now() - interval '7 days'),
        'posts_total', (select count(*) from public.village_posts),
        'hidden', (select count(*) from public.village_posts where hidden) + (select count(*) from public.village_replies where hidden) + (select count(*) from public.circle_messages where hidden),
        'open_reports', (select count(distinct (target_type, target_id)) from public.village_reports where resolved_at is null)),
    'sos', (select jsonb_build_object(
        'active', count(*) filter (where i.status in ('initiated', 'contact_notified', 'acknowledged') and i.created_at > now() - interval '24 hours'),
        'last_30d', count(*) filter (where i.created_at > now() - interval '30 days'),
        'acknowledged_30d', count(*) filter (where i.created_at > now() - interval '30 days' and exists (select 1 from public.emergency_notifications n where n.incident_id = i.id and n.acknowledged_at is not null)),
        'resolved_30d', count(*) filter (where i.created_at > now() - interval '30 days' and i.status = 'resolved'),
        'cancelled_30d', count(*) filter (where i.created_at > now() - interval '30 days' and i.status = 'cancelled'),
        'expired_30d', count(*) filter (where i.created_at > now() - interval '30 days' and i.status = 'expired'))
      from public.emergency_incidents i),
    'series', jsonb_build_object(
        'days', (select jsonb_agg(to_char(x, 'YYYY-MM-DD') order by x) from generate_series(d - 29, d, interval '1 day') x),
        'signups', (select jsonb_agg((select count(*) from public.profiles p where (p.created_at at time zone 'Africa/Accra')::date = x::date) order by x) from generate_series(d - 29, d, interval '1 day') x),
        'sessions', (select jsonb_agg((select count(*) from public.sessions s where (s.starts_at at time zone 'Africa/Accra')::date = x::date and s.status <> 'cancelled') order by x) from generate_series(d - 29, d, interval '1 day') x),
        'posts', (select jsonb_agg((select count(*) from public.village_posts p where (p.created_at at time zone 'Africa/Accra')::date = x::date) order by x) from generate_series(d - 29, d, interval '1 day') x),
        'sos', (select jsonb_agg((select count(*) from public.emergency_incidents i where (i.created_at at time zone 'Africa/Accra')::date = x::date) order by x) from generate_series(d - 29, d, interval '1 day') x)),
    'recent_actions', (select coalesce(jsonb_agg(a order by a.at desc), '[]'::jsonb) from (
        select x.at, x.action, x.target_type, x.target_id, x.reason, p.nickname as admin
          from public.admin_actions x left join public.profiles p on p.id = x.admin_id
         order by x.at desc limit 8) a)
  ) into v;
  return v;
end $$;

-- ---------------------------------------------------------------------
-- 4. People
-- ---------------------------------------------------------------------
create or replace function public.admin_list_users(p_query text default null, p_role text default null, p_status text default null, p_limit integer default 50, p_offset integer default 0)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  q text := nullif(trim(coalesce(p_query, '')), '');
  v jsonb;
begin
  perform public.admin_require();
  with base as (
    select p.id, p.nickname, p.display_name, p.role::text as role, p.created_at, p.deletion_requested_at,
           u.email, (to_jsonb(u) ->> 'last_sign_in_at')::timestamptz as last_sign_in_at,
           s.reason as suspension_reason, s.suspended_at, t.verification::text as verification
      from public.profiles p
      left join auth.users u on u.id = p.id
      left join public.account_suspensions s on s.user_id = p.id
      left join public.therapists t on t.id = p.id
     where (q is null or p.nickname ilike '%' || q || '%' or p.display_name ilike '%' || q || '%' or u.email ilike '%' || q || '%' or p.id::text = q)
       and (p_role is null or p.role::text = p_role)
       and (p_status is null
            or (p_status = 'suspended' and s.user_id is not null)
            or (p_status = 'active' and s.user_id is null)
            or (p_status = 'deletion_requested' and p.deletion_requested_at is not null))
  )
  select jsonb_build_object(
    'total', (select count(*) from base),
    'rows', coalesce((select jsonb_agg(b order by b.created_at desc) from (select * from base order by created_at desc limit least(greatest(coalesce(p_limit, 50), 1), 200) offset greatest(coalesce(p_offset, 0), 0)) b), '[]'::jsonb)
  ) into v;
  return v;
end $$;

create or replace function public.admin_user_detail(p_user uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v jsonb;
begin
  perform public.admin_require();
  if not exists (select 1 from public.profiles where id = p_user) then raise exception 'No such account'; end if;
  select jsonb_build_object(
    'id', p.id, 'nickname', p.nickname, 'display_name', p.display_name, 'role', p.role, 'age', p.age, 'region', p.region,
    'language', p.language, 'created_at', p.created_at, 'deletion_requested_at', p.deletion_requested_at,
    'email', u.email, 'last_sign_in_at', (to_jsonb(u) ->> 'last_sign_in_at')::timestamptz,
    'suspension', (select to_jsonb(s) - 'user_id' from public.account_suspensions s where s.user_id = p.id),
    'activity', jsonb_build_object(
      'checkins', (select count(*) from public.checkins c where c.client_id = p.id),
      'last_checkin', (select max(day) from public.checkins c where c.client_id = p.id),
      'thought_records', (select count(*) from public.thought_records r where r.client_id = p.id),
      'village_posts', (select count(*) from public.village_posts x where x.author_id = p.id),
      'village_replies', (select count(*) from public.village_replies x where x.author_id = p.id),
      'reports_made', (select count(*) from public.village_reports x where x.reporter_id = p.id),
      'reports_about_them', (select count(*) from public.village_reports r where
          (r.target_type = 'post' and r.target_id in (select id from public.village_posts where author_id = p.id))
       or (r.target_type = 'reply' and r.target_id in (select id from public.village_replies where author_id = p.id))
       or (r.target_type = 'circle_message' and r.target_id in (select id from public.circle_messages where author_id = p.id))),
      'counsellors', (select count(*) from public.care_links l where l.client_id = p.id and l.status <> 'discharged'),
      'clients', (select count(*) from public.care_links l where l.therapist_id = p.id and l.status <> 'discharged'),
      'sessions', (select count(*) from public.sessions s where s.client_id = p.id or s.therapist_id = p.id),
      'sos_30d', (select count(*) from public.emergency_incidents i where i.client_id = p.id and i.created_at > now() - interval '30 days')),
    'history', (select coalesce(jsonb_agg(h order by h.at desc), '[]'::jsonb) from (
        select a.at, a.action, a.reason, ap.nickname as admin from public.admin_actions a left join public.profiles ap on ap.id = a.admin_id
         where a.target_type = 'user' and a.target_id = p.id::text and a.action <> 'view_user' order by a.at desc limit 20) h)
  ) into v
  from public.profiles p left join auth.users u on u.id = p.id where p.id = p_user;
  perform public.admin_log('view_user', 'user', p_user::text);
  return v;
end $$;

create or replace function public.admin_set_suspension(p_user uuid, p_suspend boolean, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare r public.app_role;
begin
  perform public.admin_require();
  select role into r from public.profiles where id = p_user;
  if r is null then raise exception 'No such account'; end if;
  if p_user = auth.uid() then raise exception 'You cannot suspend your own account'; end if;
  if char_length(trim(coalesce(p_reason, ''))) < 3 then raise exception 'Give a reason'; end if;
  if p_suspend then
    if r = 'admin' then raise exception 'Remove admin rights before suspending this account'; end if;
    if public.is_suspended(p_user) then raise exception 'This account is already suspended'; end if;
    insert into public.account_suspensions (user_id, suspended_by, reason) values (p_user, auth.uid(), trim(p_reason));
    perform public.admin_log('suspend_account', 'user', p_user::text, p_reason, jsonb_build_object('role', r));
  else
    if not public.is_suspended(p_user) then raise exception 'This account is not suspended'; end if;
    delete from public.account_suspensions where user_id = p_user;
    perform public.admin_log('restore_account', 'user', p_user::text, p_reason, jsonb_build_object('role', r));
  end if;
end $$;

-- Permission changes: the same role column as before; a client account becomes admin, or back
create or replace function public.admin_set_admin(p_user uuid, p_admin boolean, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare r public.app_role;
begin
  perform public.admin_require();
  perform set_config('fourlife.admin_fn', 'on', true);
  select role into r from public.profiles where id = p_user;
  if r is null then raise exception 'No such account'; end if;
  if p_user = auth.uid() then raise exception 'You cannot change your own admin rights'; end if;
  if char_length(trim(coalesce(p_reason, ''))) < 3 then raise exception 'Give a reason'; end if;
  if p_admin then
    if r = 'therapist' then raise exception 'A therapist account cannot also be an admin. Use a separate client account'; end if;
    if r = 'admin' then raise exception 'This account is already an admin'; end if;
    if public.is_suspended(p_user) then raise exception 'Restore the account before making it an admin'; end if;
    update public.profiles set role = 'admin' where id = p_user;
    perform public.admin_log('grant_admin', 'user', p_user::text, p_reason);
  else
    if r <> 'admin' then raise exception 'This account is not an admin'; end if;
    update public.profiles set role = 'client' where id = p_user;
    perform public.admin_log('revoke_admin', 'user', p_user::text, p_reason);
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 5. Therapists. review_therapist keeps its signature (SUPABASE.md) and is now logged;
--    a rejection needs a reason.
-- ---------------------------------------------------------------------
create or replace function public.review_therapist(p_therapist uuid, p_verified boolean, p_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.admin_require();
  perform set_config('fourlife.admin_fn', 'on', true);
  if not exists (select 1 from public.therapists where id = p_therapist) then raise exception 'No such therapist'; end if;
  if not p_verified and char_length(trim(coalesce(p_note, ''))) < 3 then raise exception 'Give a reason for the rejection'; end if;
  update public.therapists
     set verification = case when p_verified then 'verified'::public.verification_status else 'rejected'::public.verification_status end
   where id = p_therapist;
  update public.therapist_credentials
     set reviewed_by = auth.uid(), reviewed_at = now(), review_note = p_note
   where therapist_id = p_therapist;
  perform public.admin_log(case when p_verified then 'approve_therapist' else 'reject_therapist' end, 'user', p_therapist::text, p_note);
end $$;

create or replace function public.admin_list_therapists(p_status text default null, p_query text default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare q text := nullif(trim(coalesce(p_query, '')), '');
begin
  perform public.admin_require();
  return coalesce((select jsonb_agg(x order by x.pending desc, x.created_at desc) from (
    select t.id, t.title, t.full_name, p.nickname, u.email, t.profession, t.years_experience, t.verification, t.verified_at,
           t.specialties, t.approaches, t.languages, t.formats, t.region, t.practice_location, t.fee_ghs, t.accepting_clients, t.bio, t.created_at,
           (t.verification = 'pending') as pending,
           public.is_suspended(t.id) as suspended,
           (select to_jsonb(c) - 'therapist_id' - 'reviewed_by' || jsonb_build_object('reviewer', rp.nickname)
              from public.therapist_credentials c left join public.profiles rp on rp.id = c.reviewed_by where c.therapist_id = t.id) as licence,
           (select coalesce(jsonb_agg(jsonb_build_object('name', s.name, 'duration_min', s.duration_min, 'fee_ghs', s.fee_ghs, 'formats', s.formats, 'active', s.active) order by s.sort, s.created_at), '[]'::jsonb)
              from public.therapist_services s where s.therapist_id = t.id) as services,
           (select count(*) from public.care_links l where l.therapist_id = t.id and l.status = 'active') as active_clients,
           (select count(*) from public.sessions s where s.therapist_id = t.id and s.status = 'scheduled' and s.starts_at >= now()) as upcoming_sessions,
           (select count(*) from public.sessions s where s.therapist_id = t.id and s.status = 'completed') as completed_sessions,
           (select count(*) from public.session_requests r where r.therapist_id = t.id and r.status = 'new') as pending_requests
      from public.therapists t join public.profiles p on p.id = t.id left join auth.users u on u.id = t.id
     where (p_status is null or t.verification::text = p_status or (p_status = 'suspended' and public.is_suspended(t.id)))
       and (q is null or t.full_name ilike '%' || q || '%' or p.nickname ilike '%' || q || '%' or u.email ilike '%' || q || '%')
  ) x), '[]'::jsonb);
end $$;

-- ---------------------------------------------------------------------
-- 6. Appointments: times, status and who, never topics or notes
-- ---------------------------------------------------------------------
create or replace function public.admin_appointments(p_status text default null, p_days integer default 30)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare since timestamptz := now() - make_interval(days => least(greatest(coalesce(p_days, 30), 1), 365));
begin
  perform public.admin_require();
  return jsonb_build_object(
    'sessions', coalesce((select jsonb_agg(x order by x.starts_at desc) from (
        select s.id, s.starts_at, s.duration_min, s.status, s.format, s.type, s.created_at,
               concat_ws(' ', nullif(t.title, ''), t.full_name) as therapist, s.therapist_id, cp.nickname as client, sv.name as service
          from public.sessions s join public.therapists t on t.id = s.therapist_id join public.profiles cp on cp.id = s.client_id
          left join public.therapist_services sv on sv.id = s.service_id
         where (s.starts_at >= since or (s.status = 'scheduled' and s.starts_at >= now()))
           and (p_status is null or s.status::text = p_status)
         order by s.starts_at desc limit 300) x), '[]'::jsonb),
    'requests', coalesce((select jsonb_agg(x order by x.created_at desc) from (
        select r.id, r.created_at, r.status, r.preferred_time, r.format, r.responded_at, r.decline_reason,
               concat_ws(' ', nullif(t.title, ''), t.full_name) as therapist, coalesce(r.client_nickname, cp.nickname) as client, sv.name as service,
               (r.status = 'new' and r.created_at < now() - interval '48 hours') as waiting_long
          from public.session_requests r join public.therapists t on t.id = r.therapist_id join public.profiles cp on cp.id = r.client_id
          left join public.therapist_services sv on sv.id = r.service_id
         where r.created_at >= since or r.status = 'new'
         order by r.created_at desc limit 300) x), '[]'::jsonb),
    -- two booked sessions at once for one therapist (the database refuses new ones; older data may have them)
    'conflicts', coalesce((select jsonb_agg(jsonb_build_object('therapist', concat_ws(' ', nullif(t.title, ''), t.full_name), 'a', a.id, 'a_start', a.starts_at, 'b', b.id, 'b_start', b.starts_at))
        from public.sessions a join public.sessions b on b.therapist_id = a.therapist_id and a.id < b.id
        join public.therapists t on t.id = a.therapist_id
       where a.status in ('scheduled', 'in_progress') and b.status in ('scheduled', 'in_progress')
         and tstzrange(a.starts_at, a.starts_at + make_interval(mins => a.duration_min)) && tstzrange(b.starts_at, b.starts_at + make_interval(mins => b.duration_min))), '[]'::jsonb),
    'overdue', (select count(*) from public.sessions s where s.status = 'scheduled' and s.starts_at + make_interval(mins => s.duration_min) < now())
  );
end $$;
-- ---------------------------------------------------------------------
-- 7. Global Village moderation: reports grouped by item, and one logged action per decision
-- ---------------------------------------------------------------------
create or replace function public.admin_reports(p_state text default 'open')
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.admin_require();
  return coalesce((select jsonb_agg(x order by x.open desc, x.last_at desc) from (
    select r.target_type, r.target_id,
           count(*) as reports, bool_or(r.resolved_at is null) as open,
           jsonb_agg(distinct r.reason) as reasons,
           coalesce(jsonb_agg(left(r.note, 300)) filter (where r.note <> ''), '[]'::jsonb) as notes,
           min(r.created_at) as first_at, max(r.created_at) as last_at, max(r.resolved_at) as resolved_at,
           coalesce(po.title, null) as title,
           left(coalesce(po.body, re.body, cm.body), 600) as body,
           coalesce(po.author_name, re.author_name, cm.author_name) as author,
           coalesce(po.author_id, re.author_id, cm.author_id) as author_id,
           coalesce(po.hidden, re.hidden, cm.hidden) as hidden,
           coalesce(po.created_at, re.created_at, cm.created_at) as posted_at,
           (po.id is null and re.id is null and cm.id is null) as removed,
           public.is_suspended(coalesce(po.author_id, re.author_id, cm.author_id)) as author_suspended
      from public.village_reports r
      left join public.village_posts po on r.target_type = 'post' and po.id = r.target_id
      left join public.village_replies re on r.target_type = 'reply' and re.id = r.target_id
      left join public.circle_messages cm on r.target_type = 'circle_message' and cm.id = r.target_id
     group by r.target_type, r.target_id, po.id, re.id, cm.id
    having p_state = 'all' or (p_state = 'open' and bool_or(r.resolved_at is null)) or (p_state = 'resolved' and not bool_or(r.resolved_at is null))
     limit 200
  ) x), '[]'::jsonb);
end $$;

-- p_action: 'keep' (the reports are not upheld: it stays or becomes visible), 'hide', or 'delete'
create or replace function public.admin_moderate(p_type text, p_id uuid, p_action text, p_reason text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  excerpt text;
  author uuid;
begin
  perform public.admin_require();
  perform set_config('fourlife.admin_fn', 'on', true);
  if p_type not in ('post', 'reply', 'circle_message') then raise exception 'Unknown item type'; end if;
  if p_action not in ('keep', 'hide', 'delete') then raise exception 'Unknown action'; end if;
  if p_action <> 'keep' and char_length(trim(coalesce(p_reason, ''))) < 3 then raise exception 'Give a reason'; end if;
  if p_type = 'post' then select left(title || ': ' || body, 200), author_id into excerpt, author from public.village_posts where id = p_id;
  elsif p_type = 'reply' then select left(body, 200), author_id into excerpt, author from public.village_replies where id = p_id;
  else select left(body, 200), author_id into excerpt, author from public.circle_messages where id = p_id; end if;
  if author is null and p_action <> 'keep' then raise exception 'This item no longer exists'; end if;

  if p_action = 'delete' then
    if p_type = 'post' then delete from public.village_posts where id = p_id;
    elsif p_type = 'reply' then delete from public.village_replies where id = p_id;
    else delete from public.circle_messages where id = p_id; end if;
  elsif author is not null then
    if p_type = 'post' then update public.village_posts set hidden = (p_action = 'hide') where id = p_id;
    elsif p_type = 'reply' then update public.village_replies set hidden = (p_action = 'hide') where id = p_id;
    else update public.circle_messages set hidden = (p_action = 'hide') where id = p_id; end if;
  end if;
  update public.village_reports set resolved_at = now() where target_type = p_type and target_id = p_id and resolved_at is null;
  -- what was decided, with a short excerpt of the (community, already public) text it was about
  perform public.admin_log('moderate_' || p_action, p_type, p_id::text, p_reason, jsonb_build_object('excerpt', excerpt, 'author', author));
end $$;

-- ---------------------------------------------------------------------
-- 8. SOS: status and timing only. No coordinates, no contact phone numbers. Who raised it,
--    and which counsellors were told, only with a reason (logged).
-- ---------------------------------------------------------------------
create or replace function public.admin_sos(p_days integer default 30)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.admin_require();
  return coalesce((select jsonb_agg(x order by x.created_at desc) from (
    select i.id, upper(left(i.id::text, 8)) as ref, i.created_at, i.status, i.location_status, i.location_shared, i.closed_at,
           (i.status in ('initiated', 'contact_notified', 'acknowledged') and i.created_at > now() - interval '24 hours') as active,
           exists (select 1 from public.emergency_notifications n where n.incident_id = i.id and n.channel = 'counsellor_in_app') as counsellor_notified,
           (select min(n.acknowledged_at) from public.emergency_notifications n where n.incident_id = i.id) as acknowledged_at,
           (select count(*) from public.emergency_notifications n where n.incident_id = i.id and n.channel in ('sms_handoff', 'whatsapp_handoff', 'contact_call_handoff') and n.status in ('opened', 'reported_sent')) as contact_handoffs,
           (select count(*) from public.emergency_notifications n where n.incident_id = i.id and n.status = 'reported_sent') as reported_sent,
           exists (select 1 from public.emergency_notifications n where n.incident_id = i.id and n.channel = 'emergency_call_handoff') as emergency_call_opened
      from public.emergency_incidents i
     where i.created_at > now() - make_interval(days => least(greatest(coalesce(p_days, 30), 1), 365))
        or i.status in ('initiated', 'contact_notified', 'acknowledged')
     limit 300) x), '[]'::jsonb);
end $$;

create or replace function public.admin_sos_detail(p_id uuid, p_reason text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v jsonb;
begin
  perform public.admin_require();
  if char_length(trim(coalesce(p_reason, ''))) < 5 then raise exception 'Give the reason you need these details'; end if;
  if not exists (select 1 from public.emergency_incidents where id = p_id) then raise exception 'No such SOS'; end if;
  select jsonb_build_object(
    'id', i.id, 'created_at', i.created_at, 'status', i.status, 'location_status', i.location_status, 'location_shared', i.location_shared,
    'closed_at', i.closed_at, 'client', p.nickname, 'client_id', i.client_id,
    'counsellors', (select coalesce(jsonb_agg(jsonb_build_object('therapist', concat_ws(' ', nullif(t.title, ''), t.full_name), 'status', n.status, 'acknowledged_at', n.acknowledged_at)), '[]'::jsonb)
        from public.emergency_notifications n join public.therapists t on t.id = n.therapist_id where n.incident_id = i.id),
    'handoffs', (select coalesce(jsonb_agg(jsonb_build_object('channel', n.channel, 'status', n.status, 'at', n.updated_at) order by n.updated_at), '[]'::jsonb)
        from public.emergency_notifications n where n.incident_id = i.id and n.channel <> 'counsellor_in_app'),
    'timeline', (select coalesce(jsonb_agg(jsonb_build_object('at', e.at, 'kind', e.kind, 'from', e.from_status, 'to', e.to_status) order by e.at), '[]'::jsonb)
        from public.emergency_incident_events e where e.incident_id = i.id)
  ) into v
  from public.emergency_incidents i join public.profiles p on p.id = i.client_id where i.id = p_id;
  perform public.admin_log('view_sos', 'sos', p_id::text, p_reason);
  return v;
end $$;

-- ---------------------------------------------------------------------
-- 9. Content the app already lets admins manage: group circles, helplines, emergency centres
-- ---------------------------------------------------------------------
create or replace function public.admin_content()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.admin_require();
  return jsonb_build_object(
    'circles', coalesce((select jsonb_agg(to_jsonb(c) || jsonb_build_object('rsvps', (select count(*) from public.circle_rsvps r where r.circle_id = c.id)) order by c.weekday, c.start_time) from public.village_circles c), '[]'::jsonb),
    'hotlines', coalesce((select jsonb_agg(to_jsonb(h) order by h.sort, h.id) from public.emergency_hotlines h), '[]'::jsonb),
    'centres', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name, 'type', c.type, 'region', c.region, 'phone', c.phone, 'verified_at', c.verified_at) order by c.region, c.name) from public.emergency_centers c), '[]'::jsonb)
  );
end $$;

create or replace function public.admin_set_circle_active(p_id text, p_active boolean, p_reason text default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.admin_require();
  update public.village_circles set active = p_active where id = p_id;
  if not found then raise exception 'No such circle'; end if;
  perform public.admin_log(case when p_active then 'circle_on' else 'circle_off' end, 'circle', p_id, p_reason);
end $$;

-- Mark a helpline or centre as checked (only checked helplines are shown in the app), or not
create or replace function public.admin_verify_contact(p_kind text, p_id text, p_verified boolean, p_source text default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.admin_require();
  if p_verified and char_length(trim(coalesce(p_source, ''))) < 3 then raise exception 'Say how it was checked'; end if;
  if p_kind = 'hotline' then
    update public.emergency_hotlines set verified_at = case when p_verified then current_date else null end,
           source = case when p_verified then left(trim(p_source), 200) else source end, updated_at = now() where id = p_id;
  elsif p_kind = 'centre' then
    update public.emergency_centers set verified_at = case when p_verified then now() else null end, updated_at = now() where id = p_id;
  else raise exception 'Unknown kind'; end if;
  if not found then raise exception 'Not found'; end if;
  perform public.admin_log(case when p_verified then 'verify_' else 'unverify_' end || p_kind, p_kind, p_id, p_source);
end $$;

-- ---------------------------------------------------------------------
-- 10. System: which parts of the database are in place, and whether the clean-ups are scheduled
-- ---------------------------------------------------------------------
create or replace function public.admin_system()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare jobs jsonb := '[]'::jsonb; has_cron boolean := to_regclass('cron.job') is not null;
begin
  perform public.admin_require();
  if has_cron then
    execute 'select coalesce(jsonb_agg(jsonb_build_object(''name'', jobname, ''schedule'', schedule, ''active'', active, ''command'', left(command, 120))), ''[]''::jsonb) from cron.job' into jobs;
  end if;
  return jsonb_build_object(
    'cron_available', has_cron,
    'jobs', jobs,
    'cleanups', jsonb_build_array(
      jsonb_build_object('name', 'SOS locations after 30 days', 'function', 'purge_expired_locations', 'scheduled', exists (select 1 from jsonb_array_elements(jobs) j where j ->> 'command' ilike '%purge_expired_locations%')),
      jsonb_build_object('name', 'Circle chat after 7 days', 'function', 'purge_old_circle_messages', 'scheduled', exists (select 1 from jsonb_array_elements(jobs) j where j ->> 'command' ilike '%purge_old_circle_messages%')),
      jsonb_build_object('name', 'Close and delete old SOS records', 'function', 'purge_expired_incidents', 'scheduled', exists (select 1 from jsonb_array_elements(jobs) j where j ->> 'command' ilike '%purge_expired_incidents%'))),
    'migrations', jsonb_build_array(
      jsonb_build_object('name', 'Scheduling (0010)', 'present', to_regprocedure('public.therapist_free_slots(uuid,integer,integer)') is not null),
      jsonb_build_object('name', 'Privacy (0011)', 'present', to_regprocedure('public.my_client_profiles(uuid[])') is not null),
      jsonb_build_object('name', 'Admin (0012)', 'present', true)),
    'unverified_hotlines', (select count(*) from public.emergency_hotlines where verified_at is null),
    'unverified_centres', (select count(*) from public.emergency_centers where verified_at is null),
    'database_time', now()
  );
end $$;

-- ---------------------------------------------------------------------
-- 11. The action log
-- ---------------------------------------------------------------------
create or replace function public.admin_list_actions(p_limit integer default 100, p_offset integer default 0, p_action text default null, p_target text default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.admin_require();
  return jsonb_build_object(
    'total', (select count(*) from public.admin_actions a where (p_action is null or a.action like p_action || '%') and (p_target is null or a.target_id = p_target)),
    'rows', coalesce((select jsonb_agg(x order by x.at desc) from (
      select a.id, a.at, a.action, a.target_type, a.target_id, a.reason, a.details, p.nickname as admin,
             case when a.target_type = 'user' then (select tp.nickname from public.profiles tp where tp.id::text = a.target_id) end as target_name
        from public.admin_actions a left join public.profiles p on p.id = a.admin_id
       where (p_action is null or a.action like p_action || '%') and (p_target is null or a.target_id = p_target)
       order by a.at desc limit least(greatest(coalesce(p_limit, 100), 1), 500) offset greatest(coalesce(p_offset, 0), 0)) x), '[]'::jsonb));
end $$;

-- ---------------------------------------------------------------------
-- 12. Nothing changes silently. The admin functions above log what they do. The older access rules
--     still let an admin change these tables directly, and the project owner assigns admins in the SQL
--     editor (SUPABASE.md, step 7): those changes are logged here, automatically.
--     (Inside an admin function the flag fourlife.admin_fn is set, so nothing is logged twice.)
--     In the SQL editor there is no signed-in person: those rows use the all-zero id.
-- ---------------------------------------------------------------------
create or replace function public.admin_audit_direct()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  who uuid := coalesce(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid);
  inside boolean := coalesce(current_setting('fourlife.admin_fn', true), '') = 'on';
begin
  if inside then return null; end if;
  if tg_table_name = 'profiles' then
    if new.role is distinct from old.role then
      insert into public.admin_actions (admin_id, action, target_type, target_id, details)
      values (who, 'role_change', 'user', new.id::text, jsonb_build_object('from', old.role, 'to', new.role, 'via', case when auth.uid() is null then 'sql_editor' else 'direct' end));
    end if;
  elsif tg_table_name = 'therapists' then
    if new.verification is distinct from old.verification and auth.uid() is not null and public.is_admin() then
      insert into public.admin_actions (admin_id, action, target_type, target_id, details)
      values (who, 'verification_change', 'user', new.id::text, jsonb_build_object('from', old.verification, 'to', new.verification, 'via', 'direct'));
    end if;
  elsif auth.uid() is not null and public.is_admin() and auth.uid() is distinct from old.author_id then
    -- an admin changing or removing someone else's Village post, reply or circle message
    insert into public.admin_actions (admin_id, action, target_type, target_id, details)
    values (who, case when tg_op = 'DELETE' then 'direct_delete' else 'direct_edit' end,
            case tg_table_name when 'village_posts' then 'post' when 'village_replies' then 'reply' else 'circle_message' end, old.id::text,
            jsonb_build_object('excerpt', left(old.body, 200), 'author', old.author_id, 'hidden', case when tg_op = 'UPDATE' then new.hidden end, 'via', 'direct'));
  end if;
  return null;
end $$;
revoke execute on function public.admin_audit_direct() from public, anon, authenticated;
drop trigger if exists profiles_admin_audit on public.profiles;
create trigger profiles_admin_audit after update of role on public.profiles for each row execute function public.admin_audit_direct();
drop trigger if exists therapists_admin_audit on public.therapists;
create trigger therapists_admin_audit after update of verification on public.therapists for each row execute function public.admin_audit_direct();
drop trigger if exists village_posts_admin_audit on public.village_posts;
create trigger village_posts_admin_audit after update or delete on public.village_posts for each row execute function public.admin_audit_direct();
drop trigger if exists village_replies_admin_audit on public.village_replies;
create trigger village_replies_admin_audit after update or delete on public.village_replies for each row execute function public.admin_audit_direct();
drop trigger if exists circle_messages_admin_audit on public.circle_messages;
create trigger circle_messages_admin_audit after update or delete on public.circle_messages for each row execute function public.admin_audit_direct();

-- Who may call what: signed-in people only; each function refuses anyone who is not an admin
revoke execute on function public.admin_overview() from public, anon;
revoke execute on function public.admin_list_users(text, text, text, integer, integer) from public, anon;
revoke execute on function public.admin_user_detail(uuid) from public, anon;
revoke execute on function public.admin_set_suspension(uuid, boolean, text) from public, anon;
revoke execute on function public.admin_set_admin(uuid, boolean, text) from public, anon;
revoke execute on function public.review_therapist(uuid, boolean, text) from public, anon;
revoke execute on function public.admin_list_therapists(text, text) from public, anon;
revoke execute on function public.admin_appointments(text, integer) from public, anon;
revoke execute on function public.admin_reports(text) from public, anon;
revoke execute on function public.admin_moderate(text, uuid, text, text) from public, anon;
revoke execute on function public.admin_sos(integer) from public, anon;
revoke execute on function public.admin_sos_detail(uuid, text) from public, anon;
revoke execute on function public.admin_content() from public, anon;
revoke execute on function public.admin_set_circle_active(text, boolean, text) from public, anon;
revoke execute on function public.admin_verify_contact(text, text, boolean, text) from public, anon;
revoke execute on function public.admin_system() from public, anon;
revoke execute on function public.admin_list_actions(integer, integer, text, text) from public, anon;
grant execute on function public.admin_overview(), public.admin_list_users(text, text, text, integer, integer), public.admin_user_detail(uuid),
  public.admin_set_suspension(uuid, boolean, text), public.admin_set_admin(uuid, boolean, text), public.review_therapist(uuid, boolean, text),
  public.admin_list_therapists(text, text), public.admin_appointments(text, integer), public.admin_reports(text), public.admin_moderate(text, uuid, text, text),
  public.admin_sos(integer), public.admin_sos_detail(uuid, text), public.admin_content(), public.admin_set_circle_active(text, boolean, text),
  public.admin_verify_contact(text, text, boolean, text), public.admin_system(), public.admin_list_actions(integer, integer, text, text) to authenticated;
