-- Scheduling for the therapist workspace: breaks, days off, services, real free times for booking,
-- and no double-booking. Forward-only: adds columns, tables, functions and a trigger; changes no
-- existing data. Existing installs and fresh installs end in the same state.
-- Times are Ghana time (Africa/Accra, GMT, no daylight saving), as therapists enter them.

-- ---------------------------------------------------------------------
-- 1. A daily break (optional)
-- ---------------------------------------------------------------------
alter table public.therapists
  add column if not exists break_start time,
  add column if not exists break_end   time;
alter table public.therapists drop constraint if exists therapists_break_valid;
alter table public.therapists add constraint therapists_break_valid
  check ((break_start is null) = (break_end is null) and (break_end is null or break_end > break_start));

-- ---------------------------------------------------------------------
-- 2. Days off (holidays, training, sick days): no bookings on these dates
-- ---------------------------------------------------------------------
create table if not exists public.therapist_time_off (
  id            uuid primary key default gen_random_uuid(),
  therapist_id  uuid not null default auth.uid() references public.therapists (id) on delete cascade,
  starts_on     date not null,
  ends_on       date not null,
  note          text not null default '' check (char_length(note) <= 120),
  created_at    timestamptz not null default now(),
  constraint time_off_order check (ends_on >= starts_on),
  constraint time_off_length check (ends_on - starts_on <= 366)
);
create index if not exists therapist_time_off_idx on public.therapist_time_off (therapist_id, starts_on);
alter table public.therapist_time_off enable row level security;
-- Only the therapist sees their days off (clients only ever get free times, never the reason)
drop policy if exists "time off: therapist manages own" on public.therapist_time_off;
create policy "time off: therapist manages own" on public.therapist_time_off for all to authenticated
  using (therapist_id = auth.uid()) with check (therapist_id = auth.uid() and public.is_therapist());

-- ---------------------------------------------------------------------
-- 3. Services: what a therapist offers, how long, how much, and how
-- ---------------------------------------------------------------------
create table if not exists public.therapist_services (
  id            uuid primary key default gen_random_uuid(),
  therapist_id  uuid not null default auth.uid() references public.therapists (id) on delete cascade,
  name          text not null check (char_length(name) between 2 and 80),
  description   text not null default '' check (char_length(description) <= 400),
  duration_min  smallint not null default 50 check (duration_min between 15 and 180),
  fee_ghs       numeric(8, 2) not null default 0 check (fee_ghs >= 0),
  formats       public.session_format[] not null default '{video,voice}' check (cardinality(formats) between 1 and 4),
  active        boolean not null default true,
  sort          smallint not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists therapist_services_idx on public.therapist_services (therapist_id, sort);
drop trigger if exists therapist_services_updated_at on public.therapist_services;
create trigger therapist_services_updated_at before update on public.therapist_services
  for each row execute function public.set_updated_at();
alter table public.therapist_services enable row level security;
drop policy if exists "services: therapist manages own" on public.therapist_services;
create policy "services: therapist manages own" on public.therapist_services for all to authenticated
  using (therapist_id = auth.uid()) with check (therapist_id = auth.uid() and public.is_therapist());
-- Signed-in people see the services a verified therapist is offering now (as they see the directory)
drop policy if exists "services: directory" on public.therapist_services;
create policy "services: directory" on public.therapist_services for select to authenticated
  using (active and exists (select 1 from public.therapists t where t.id = therapist_id and t.verification = 'verified'));

-- Which service a request and a session are for (optional; older ones have none)
alter table public.session_requests add column if not exists service_id uuid references public.therapist_services (id) on delete set null;
alter table public.sessions        add column if not exists service_id uuid references public.therapist_services (id) on delete set null;

-- ---------------------------------------------------------------------
-- 4. No double-booking. Checked in the database for every new or moved session, whoever writes it,
--    under a per-therapist lock so two requests at the same moment can't both get the same time.
--    Existing rows are not checked again, so this applies cleanly to any database.
-- ---------------------------------------------------------------------
create or replace function public.guard_session_overlap()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status not in ('scheduled', 'in_progress') then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.starts_at = old.starts_at and new.duration_min = old.duration_min and old.status in ('scheduled', 'in_progress') then
    return new; -- nothing about the time changed
  end if;
  perform pg_advisory_xact_lock(hashtextextended('4life-schedule:' || new.therapist_id::text, 0));
  if exists (
    select 1 from public.sessions s
     where s.therapist_id = new.therapist_id
       and s.id <> new.id
       and s.status in ('scheduled', 'in_progress')
       and tstzrange(s.starts_at, s.starts_at + make_interval(mins => s.duration_min))
        && tstzrange(new.starts_at, new.starts_at + make_interval(mins => new.duration_min))
  ) then
    raise exception 'This time overlaps another session' using errcode = 'P0001', hint = 'session_overlap';
  end if;
  return new;
end $$;
drop trigger if exists sessions_no_overlap on public.sessions;
create trigger sessions_no_overlap before insert or update of starts_at, duration_min, status on public.sessions
  for each row execute function public.guard_session_overlap();
revoke execute on function public.guard_session_overlap() from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 5. Free times to book: the therapist's days and hours, minus the break, days off and booked
--    sessions (whose they are is never revealed), at least 2 hours from now. Same rules as
--    src/lib/schedule.ts. Only for verified therapists who accept new clients.
-- ---------------------------------------------------------------------
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
  if t is null then return; end if;
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
revoke execute on function public.therapist_free_slots(uuid, integer, integer) from public, anon;
grant execute on function public.therapist_free_slots(uuid, integer, integer) to authenticated;

-- ---------------------------------------------------------------------
-- 6. Accepting a request books the chosen service's length (same function as before, plus the
--    service). A clash is refused by the guard above, and the request stays open to try another time.
-- ---------------------------------------------------------------------
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
-- 7. A request may name only an active service of the therapist it is sent to
-- ---------------------------------------------------------------------
create or replace function public.check_request_service()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.service_id is not null and not exists (
    select 1 from public.therapist_services s where s.id = new.service_id and s.therapist_id = new.therapist_id and s.active
  ) then
    raise exception 'That service is not offered by this therapist' using errcode = 'P0001';
  end if;
  return new;
end $$;
drop trigger if exists session_requests_service on public.session_requests;
create trigger session_requests_service before insert or update of service_id on public.session_requests
  for each row execute function public.check_request_service();
revoke execute on function public.check_request_service() from public, anon, authenticated;
