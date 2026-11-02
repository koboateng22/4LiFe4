-- =====================================================================
-- 4Life-AI · Instant EMS: emergency incidents
--
-- A record of what really happened when someone asked for help, so the app
-- can show true status instead of assuming it. Additive: existing tables
-- and rows are kept; sos_events only gains one nullable column.
--
-- What this does NOT do: contact emergency services. 4Life has no dispatch
-- integration, so no status here means "an ambulance was sent". See EMERGENCY.md.
--
-- Statuses (keep in step with src/lib/incident.ts):
--   initiated         the server saved the incident
--   contact_notified  the person told us they sent a message to a support person
--                     (sent from their own phone, so delivery can't be confirmed)
--   acknowledged      a linked counsellor pressed "I've seen this"
--   resolved          the person (or their counsellor) closed it
--   cancelled         the person pressed it by mistake
--   expired           left open for 24 hours with no answer
--
-- All writes go through the functions below. They identify the caller with
-- auth.uid() and never accept a user id from the app.
-- =====================================================================

-- When the phone actually got the position (created_at is only when it was saved).
alter table public.sos_events add column located_at timestamptz;

create table public.emergency_incidents (
  id                 uuid primary key default gen_random_uuid(),
  client_id          uuid not null references public.profiles (id) on delete cascade,
  client_request_id  uuid not null,                  -- made by the app before sending, so a retry can't create a second incident
  status             text not null default 'initiated'
                       check (status in ('initiated', 'contact_notified', 'acknowledged', 'resolved', 'cancelled', 'expired')),
  -- What happened to the location. The coordinates themselves stay in sos_events,
  -- which already has consent stripping and a 30-day purge.
  location_status    text not null default 'pending'
                       check (location_status in ('pending', 'fresh', 'manual', 'denied', 'timeout', 'unavailable', 'unsupported')),
  location_at        timestamptz,
  accuracy_m         integer check (accuracy_m between 0 and 100000),
  location_shared    boolean not null default false,  -- reached a counsellor (needs share_location_in_crisis)
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  closed_at          timestamptz,
  closed_by          uuid,
  unique (client_id, client_request_id)
);
-- One open incident per person: two phones or a double press join the same one.
create unique index emergency_incidents_one_open on public.emergency_incidents (client_id)
  where status in ('initiated', 'contact_notified', 'acknowledged');
create index emergency_incidents_client_idx on public.emergency_incidents (client_id, created_at desc);

-- One row per recipient and channel. Holds references only: names and numbers stay in support_contacts.
create table public.emergency_notifications (
  id             uuid primary key default gen_random_uuid(),
  incident_id    uuid not null references public.emergency_incidents (id) on delete cascade,
  channel        text not null check (channel in ('counsellor_in_app', 'sms_handoff', 'whatsapp_handoff', 'contact_call_handoff', 'emergency_call_handoff')),
  recipient_key  text not null check (char_length(recipient_key) <= 60),   -- a therapist or contact id, or '112' / '193'
  therapist_id   uuid references public.therapists (id) on delete set null,
  contact_id     uuid references public.support_contacts (id) on delete set null,
  -- recorded        saved for the counsellor to see (no push: they may not have seen it)
  -- opened          the phone's own app was opened with the message or number; nothing is known after that
  -- reported_sent   the person says they pressed send
  -- reported_not_sent  the person says they did not
  -- acknowledged    the counsellor pressed "I've seen this"
  status         text not null check (status in ('recorded', 'opened', 'reported_sent', 'reported_not_sent', 'acknowledged')),
  updated_at     timestamptz not null default now(),
  acknowledged_at timestamptz,
  unique (incident_id, channel, recipient_key)
);
create index emergency_notifications_therapist_idx on public.emergency_notifications (therapist_id);

-- Append-only history. No coordinates, names or free text: only fixed codes.
create table public.emergency_incident_events (
  id           bigint generated always as identity primary key,
  incident_id  uuid not null references public.emergency_incidents (id) on delete cascade,
  at           timestamptz not null default now(),
  actor        uuid,
  kind         text not null check (char_length(kind) <= 60),
  from_status  text,
  to_status    text
);
create index emergency_incident_events_incident_idx on public.emergency_incident_events (incident_id, id);

-- ---------- The state machine --------------------------------------------
create or replace function public.emergency_guard_status()
returns trigger language plpgsql set search_path = '' as $$
begin
  if (new.id, new.client_id, new.client_request_id, new.created_at) is distinct from (old.id, old.client_id, old.client_request_id, old.created_at) then
    raise exception 'An incident cannot be moved or re-dated';
  end if;
  if new.status is distinct from old.status and not (
       (old.status = 'initiated'        and new.status in ('contact_notified', 'acknowledged', 'resolved', 'cancelled', 'expired'))
    or (old.status = 'contact_notified' and new.status in ('acknowledged', 'resolved', 'cancelled', 'expired'))
    or (old.status = 'acknowledged'     and new.status in ('resolved', 'cancelled', 'expired'))
  ) then
    raise exception 'emergency_bad_transition: % to %', old.status, new.status;
  end if;
  new.updated_at := now();
  if new.status in ('resolved', 'cancelled', 'expired') and old.closed_at is null then
    new.closed_at := now();
  end if;
  return new;
end $$;
create trigger emergency_incidents_guard before update on public.emergency_incidents
  for each row execute function public.emergency_guard_status();

create or replace function public.emergency_log_status()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    insert into public.emergency_incident_events (incident_id, actor, kind, to_status)
    values (new.id, auth.uid(), 'status', new.status);
  elsif new.status is distinct from old.status then
    insert into public.emergency_incident_events (incident_id, actor, kind, from_status, to_status)
    values (new.id, auth.uid(), 'status', old.status, new.status);
  end if;
  return new;
end $$;
create trigger emergency_incidents_log after insert or update on public.emergency_incidents
  for each row execute function public.emergency_log_status();

create trigger audit_emergency_incidents after insert or update or delete on public.emergency_incidents
  for each row execute function public.audit_row();

-- ---------- Helpers --------------------------------------------------------
-- What the app is told about an incident, for its owner.
create or replace function public.emergency_view(p_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', i.id,
    'client_request_id', i.client_request_id,
    'status', i.status,
    'location_status', i.location_status,
    'location_at', i.location_at,
    'accuracy_m', i.accuracy_m,
    'location_shared', i.location_shared,
    'created_at', i.created_at,
    'updated_at', i.updated_at,
    'closed_at', i.closed_at,
    'server_time', now(),
    'notifications', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'channel', n.channel,
        'recipient_key', n.recipient_key,
        'recipient_name', (select nullif(trim(concat_ws(' ', t.title, t.full_name)), '') from public.therapists t where t.id = n.therapist_id),
        'contact_id', n.contact_id,
        'status', n.status,
        'updated_at', n.updated_at,
        'acknowledged_at', n.acknowledged_at
      ) order by n.channel, n.recipient_key), '[]'::jsonb)
      from public.emergency_notifications n where n.incident_id = i.id
    )
  )
  from public.emergency_incidents i where i.id = p_id;
$$;

-- The caller's own open incident, locked for this transaction. Raises if it isn't theirs.
create or replace function public.emergency_owned(p_incident uuid)
returns public.emergency_incidents language plpgsql security definer set search_path = '' as $$
declare r public.emergency_incidents;
begin
  select * into r from public.emergency_incidents where id = p_incident and client_id = auth.uid() for update;
  if not found then raise exception 'emergency_not_found'; end if;
  return r;
end $$;

-- ---------- Starting and reading -------------------------------------------
create or replace function public.emergency_open_incident(p_request_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  found_id uuid;
  recent integer;
begin
  if uid is null then raise exception 'emergency_sign_in_required'; end if;
  if p_request_id is null then raise exception 'emergency_bad_request'; end if;
  -- Two presses at the same moment wait for each other here
  perform pg_advisory_xact_lock(hashtextextended('emergency:' || uid::text, 0));

  -- The same request again (a retry after a timeout): the same answer
  select id into found_id from public.emergency_incidents where client_id = uid and client_request_id = p_request_id;
  if found_id is not null then return public.emergency_view(found_id); end if;

  -- An alert nobody closed for a day should not swallow a new emergency
  update public.emergency_incidents set status = 'expired'
   where client_id = uid and status in ('initiated', 'contact_notified', 'acknowledged') and created_at < now() - interval '24 hours';

  -- Already open (another phone, another tab): join it
  select id into found_id from public.emergency_incidents
   where client_id = uid and status in ('initiated', 'contact_notified', 'acknowledged');
  if found_id is not null then return public.emergency_view(found_id); end if;

  -- A brake on repeated alerts, which raise a counsellor's alarm each time.
  -- The call buttons and text messages don't depend on this.
  select count(*) into recent from public.emergency_incidents where client_id = uid and created_at > now() - interval '1 hour';
  if recent >= 6 then raise exception 'emergency_rate_limited'; end if;

  insert into public.emergency_incidents (client_id, client_request_id)
  values (uid, p_request_id) returning id into found_id;

  insert into public.emergency_notifications (incident_id, channel, recipient_key, therapist_id, status)
  select found_id, 'counsellor_in_app', l.therapist_id::text, l.therapist_id, 'recorded'
    from public.care_links l where l.client_id = uid and l.status = 'active';

  -- Raises the alert on the counsellor's side (risk level and record), as before
  insert into public.sos_events (client_id, source) values (uid, 'sos');

  return public.emergency_view(found_id);
end $$;

create or replace function public.emergency_by_request(p_request_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select public.emergency_view(i.id) from public.emergency_incidents i
   where i.client_id = auth.uid() and i.client_request_id = p_request_id;
$$;

create or replace function public.emergency_get(p_incident uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select public.emergency_view(i.id) from public.emergency_incidents i
   where i.client_id = auth.uid() and i.id = p_incident;
$$;

create or replace function public.emergency_active()
returns jsonb language sql stable security definer set search_path = '' as $$
  select public.emergency_view(i.id) from public.emergency_incidents i
   where i.client_id = auth.uid() and i.status in ('initiated', 'contact_notified', 'acknowledged')
     and i.created_at > now() - interval '24 hours'
   order by i.created_at desc limit 1;
$$;

-- ---------- Location -------------------------------------------------------
-- Coordinates are only kept (in sos_events) if the person agreed to share them in a crisis.
create or replace function public.emergency_attach_location(
  p_incident uuid, p_status text, p_lat double precision default null, p_lng double precision default null,
  p_accuracy_m integer default null, p_located_at timestamptz default null, p_note text default null
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  r public.emergency_incidents;
  consent boolean;
  note text := nullif(trim(coalesce(p_note, '')), '');
begin
  r := public.emergency_owned(p_incident);
  if r.closed_at is not null then return public.emergency_view(r.id); end if;
  if p_status not in ('fresh', 'manual', 'denied', 'timeout', 'unavailable', 'unsupported') then raise exception 'emergency_bad_request'; end if;
  if char_length(note) > 120 then raise exception 'emergency_bad_request'; end if;
  -- Without consent the app reports only that a position was found, not where
  if p_status = 'fresh' and (
       p_accuracy_m is null or p_located_at is null or (p_lat is null) <> (p_lng is null)
       or p_lat not between -90 and 90 or p_lng not between -180 and 180 or p_accuracy_m not between 0 and 100000
       -- An old position must never pass as the current one
       or p_located_at < now() - interval '10 minutes' or p_located_at > now() + interval '2 minutes'
  ) then raise exception 'emergency_bad_location'; end if;
  -- A later failure must not hide a location we already have
  if p_status not in ('fresh', 'manual') and r.location_status in ('fresh', 'manual') then return public.emergency_view(r.id); end if;

  select p.share_location_in_crisis into consent from public.profiles p where p.id = auth.uid();
  consent := coalesce(consent, false);
  if p_status = 'manual' and consent and note is null then raise exception 'emergency_bad_location'; end if;

  update public.emergency_incidents
     set location_status = p_status,
         location_at = case when p_status = 'fresh' then p_located_at when p_status = 'manual' then now() else null end,
         accuracy_m = case when p_status = 'fresh' then p_accuracy_m else null end,
         location_shared = location_shared or (consent and ((p_status = 'fresh' and p_lat is not null) or p_status = 'manual'))
   where id = r.id;
  insert into public.emergency_incident_events (incident_id, actor, kind) values (r.id, auth.uid(), 'location:' || p_status);

  if consent and p_status = 'fresh' and p_lat is not null then
    -- 'requested' tells the counsellor's record an updated location arrived
    insert into public.sos_events (client_id, source, lat, lng, accuracy_m, area, located_at)
    values (auth.uid(), 'requested', p_lat, p_lng, p_accuracy_m, note, p_located_at);
  elsif consent and p_status = 'manual' then
    insert into public.escalations (client_id, therapist_id, actor, action, note)
    select auth.uid(), l.therapist_id, auth.uid(), 'Client typed where they are', note
      from public.care_links l where l.client_id = auth.uid() and l.status = 'active';
  end if;
  return public.emergency_view(r.id);
end $$;

-- ---------- What the person did on their phone -----------------------------
-- These record that the phone's own app was opened, or what the person told us.
-- 4Life can't see whether a message was delivered or a call was answered.
create or replace function public.emergency_record_action(p_incident uuid, p_channel text, p_recipient text, p_action text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  r public.emergency_incidents;
  contact uuid;
  n_events integer;
begin
  r := public.emergency_owned(p_incident);
  if r.closed_at is not null then return public.emergency_view(r.id); end if;
  if p_action not in ('opened', 'reported_sent', 'reported_not_sent') then raise exception 'emergency_bad_request'; end if;

  if p_channel = 'emergency_call_handoff' then
    if p_recipient not in ('112', '193') or p_action <> 'opened' then raise exception 'emergency_bad_request'; end if;
  elsif p_channel in ('sms_handoff', 'whatsapp_handoff', 'contact_call_handoff') then
    if p_channel = 'contact_call_handoff' and p_action <> 'opened' then raise exception 'emergency_bad_request'; end if;
    -- 'unlinked': a contact the app has not saved yet. Otherwise it must be the caller's own.
    if p_recipient <> 'unlinked' then
      begin
        contact := p_recipient::uuid;
      exception when invalid_text_representation then
        raise exception 'emergency_bad_request';
      end;
      if not exists (select 1 from public.support_contacts c where c.id = contact and c.client_id = auth.uid()) then
        raise exception 'emergency_not_found';
      end if;
    end if;
  else
    raise exception 'emergency_bad_request';
  end if;

  select count(*) into n_events from public.emergency_incident_events where incident_id = r.id;
  if n_events >= 200 then raise exception 'emergency_rate_limited'; end if;

  insert into public.emergency_notifications (incident_id, channel, recipient_key, contact_id, status)
  values (r.id, p_channel, p_recipient, contact, p_action)
  on conflict (incident_id, channel, recipient_key) do update
    set status = case
          -- Opening the app again doesn't undo "I sent it"
          when public.emergency_notifications.status = 'reported_sent' and excluded.status = 'opened' then 'reported_sent'
          else excluded.status end,
        updated_at = now();
  insert into public.emergency_incident_events (incident_id, actor, kind) values (r.id, auth.uid(), p_channel || ':' || p_action);

  if p_action = 'reported_sent' and r.status = 'initiated' then
    update public.emergency_incidents set status = 'contact_notified' where id = r.id;
  end if;
  return public.emergency_view(r.id);
end $$;

-- ---------- Counsellor -----------------------------------------------------
create or replace function public.emergency_acknowledge(p_incident uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  r public.emergency_incidents;
  uid uuid := auth.uid();
begin
  select * into r from public.emergency_incidents where id = p_incident for update;
  if not found or not public.is_my_client(r.client_id) then raise exception 'emergency_not_found'; end if;
  if r.closed_at is not null then return; end if;

  insert into public.emergency_notifications (incident_id, channel, recipient_key, therapist_id, status, acknowledged_at)
  values (r.id, 'counsellor_in_app', uid::text, uid, 'acknowledged', now())
  on conflict (incident_id, channel, recipient_key) do update
    set status = 'acknowledged', updated_at = now(),
        acknowledged_at = coalesce(public.emergency_notifications.acknowledged_at, now());
  if r.status <> 'acknowledged' then
    update public.emergency_incidents set status = 'acknowledged' where id = r.id;
    insert into public.escalations (client_id, therapist_id, actor, action)
    values (r.client_id, uid, uid, 'Told the client you have seen their alert');
  end if;
end $$;

-- ---------- Closing --------------------------------------------------------
-- The person can resolve or cancel. A linked counsellor can only resolve.
create or replace function public.emergency_close(p_incident uuid, p_outcome text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  r public.emergency_incidents;
  is_owner boolean;
begin
  if p_outcome not in ('resolved', 'cancelled') then raise exception 'emergency_bad_request'; end if;
  select * into r from public.emergency_incidents where id = p_incident for update;
  if not found then raise exception 'emergency_not_found'; end if;
  is_owner := r.client_id = auth.uid();
  if not is_owner and not (public.is_my_client(r.client_id) and p_outcome = 'resolved') then
    raise exception 'emergency_not_found';
  end if;

  if r.closed_at is null then
    update public.emergency_incidents set status = p_outcome, closed_by = auth.uid() where id = r.id;
    if is_owner then
      insert into public.escalations (client_id, therapist_id, actor, action)
      select r.client_id, l.therapist_id, r.client_id,
             case when p_outcome = 'cancelled' then 'Client cancelled the alert: pressed by mistake' else 'Client marked themselves as safe' end
        from public.care_links l where l.client_id = r.client_id and l.status = 'active';
    end if;
  end if;
  return case when is_owner then public.emergency_view(r.id) else null end;
end $$;

-- ---------- Retention ------------------------------------------------------
-- Schedule daily with pg_cron, next to purge-old-locations:
--   select cron.schedule('purge-old-incidents', '20 3 * * *', $$select public.purge_expired_incidents()$$);
create or replace function public.purge_expired_incidents(p_days integer default 90)
returns integer language plpgsql security definer set search_path = '' as $$
declare v_count integer;
begin
  update public.emergency_incidents set status = 'expired'
   where status in ('initiated', 'contact_notified', 'acknowledged') and created_at < now() - interval '24 hours';
  delete from public.emergency_incidents where closed_at < now() - make_interval(days => p_days);
  get diagnostics v_count = row_count;
  return v_count;
end $$;

-- ---------- Counsellor's record wording --------------------------------------
-- The incident is saved first and the location follows, so "not shared" would be untrue here.
create or replace function public.sos_notify_therapists()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform public.begin_system_update();
  if new.source = 'sos' then
    update public.care_links set risk = 'high'
    where client_id = new.client_id and status = 'active';

    insert into public.escalations (client_id, therapist_id, actor, action)
    select new.client_id, l.therapist_id, new.client_id,
           case when new.lat is not null then 'Pressed SOS in the app and shared location'
                else 'Pressed SOS in the app (no location received yet)' end
    from public.care_links l
    where l.client_id = new.client_id and l.status = 'active';
  elsif new.source = 'requested' then
    update public.location_requests set answered_at = now()
    where client_id = new.client_id and answered_at is null;

    insert into public.escalations (client_id, therapist_id, actor, action)
    select new.client_id, l.therapist_id, new.client_id, 'Received updated location'
    from public.care_links l
    where l.client_id = new.client_id and l.status = 'active' and l.risk = 'high';
  end if;
  perform public.end_system_update();
  return new;
end $$;

-- ---------- Updated export: include incidents --------------------------------
create or replace function public.export_my_data()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'exported_at',      now(),
    'profile',          (select to_jsonb(p) from public.profiles p where p.id = auth.uid()),
    'support_contacts', (select coalesce(jsonb_agg(c), '[]') from public.support_contacts c where c.client_id = auth.uid()),
    'checkins',         (select coalesce(jsonb_agg(c order by c.day), '[]') from public.checkins c where c.client_id = auth.uid()),
    'goals',            (select coalesce(jsonb_agg(g), '[]') from public.goals g where g.client_id = auth.uid()),
    'homework',         (select coalesce(jsonb_agg(h), '[]') from public.homework h where h.client_id = auth.uid()),
    'safety_plan',      (select to_jsonb(s) from public.safety_plans s where s.client_id = auth.uid()),
    'care_links',       (select coalesce(jsonb_agg(l), '[]') from public.care_links l where l.client_id = auth.uid() or l.therapist_id = auth.uid()),
    'session_requests', (select coalesce(jsonb_agg(r), '[]') from public.session_requests r where r.client_id = auth.uid() or r.therapist_id = auth.uid()),
    'sessions',         (select coalesce(jsonb_agg(s), '[]') from public.sessions s where s.client_id = auth.uid() or s.therapist_id = auth.uid()),
    'sos_events',       (select coalesce(jsonb_agg(e), '[]') from public.sos_events e where e.client_id = auth.uid()),
    'emergency_incidents', (select coalesce(jsonb_agg(public.emergency_view(i.id) order by i.created_at), '[]') from public.emergency_incidents i where i.client_id = auth.uid()),
    'thought_records',  (select coalesce(jsonb_agg(t order by t.created_at), '[]') from public.thought_records t where t.client_id = auth.uid()),
    'village_posts',    (select coalesce(jsonb_agg(p order by p.created_at), '[]') from public.village_posts p where p.author_id = auth.uid()),
    'village_replies',  (select coalesce(jsonb_agg(r order by r.created_at), '[]') from public.village_replies r where r.author_id = auth.uid()),
    'therapist',        (select to_jsonb(t) from public.therapists t where t.id = auth.uid())
  );
$$;

-- ---------- Row Level Security -----------------------------------------------
-- Read only. There are no write policies: every change goes through the functions above.
alter table public.emergency_incidents       enable row level security;
alter table public.emergency_notifications   enable row level security;
alter table public.emergency_incident_events enable row level security;

create policy "incidents: client reads own" on public.emergency_incidents for select to authenticated
  using (client_id = auth.uid());
create policy "incidents: therapist reads linked" on public.emergency_incidents for select to authenticated
  using (public.is_my_client(client_id));

-- A counsellor sees only their own alert, never which support people were contacted.
create policy "incident notifications: client reads own" on public.emergency_notifications for select to authenticated
  using (exists (select 1 from public.emergency_incidents i where i.id = incident_id and i.client_id = auth.uid()));
create policy "incident notifications: therapist reads own" on public.emergency_notifications for select to authenticated
  using (therapist_id = auth.uid());

create policy "incident events: client reads own" on public.emergency_incident_events for select to authenticated
  using (exists (select 1 from public.emergency_incidents i where i.id = incident_id and i.client_id = auth.uid()));
create policy "incident events: admin reads" on public.emergency_incident_events for select to authenticated
  using (public.is_admin());

revoke all on public.emergency_incidents, public.emergency_notifications, public.emergency_incident_events from anon, authenticated;
grant select on public.emergency_incidents, public.emergency_notifications, public.emergency_incident_events to authenticated;

-- ---------- Function permissions ---------------------------------------------
revoke execute on function public.emergency_guard_status()     from public, anon, authenticated;
revoke execute on function public.emergency_log_status()       from public, anon, authenticated;
revoke execute on function public.emergency_view(uuid)         from public, anon, authenticated;
revoke execute on function public.emergency_owned(uuid)        from public, anon, authenticated;
revoke execute on function public.purge_expired_incidents(integer) from public, anon, authenticated;
revoke execute on function public.sos_notify_therapists()      from public, anon, authenticated;
revoke execute on function public.export_my_data()             from public, anon;
grant execute on function public.export_my_data()              to authenticated;

revoke execute on function public.emergency_open_incident(uuid) from public, anon;
revoke execute on function public.emergency_by_request(uuid)    from public, anon;
revoke execute on function public.emergency_get(uuid)           from public, anon;
revoke execute on function public.emergency_active()            from public, anon;
revoke execute on function public.emergency_attach_location(uuid, text, double precision, double precision, integer, timestamptz, text) from public, anon;
revoke execute on function public.emergency_record_action(uuid, text, text, text) from public, anon;
revoke execute on function public.emergency_acknowledge(uuid)   from public, anon;
revoke execute on function public.emergency_close(uuid, text)   from public, anon;
grant execute on function public.emergency_open_incident(uuid)  to authenticated;
grant execute on function public.emergency_by_request(uuid)     to authenticated;
grant execute on function public.emergency_get(uuid)            to authenticated;
grant execute on function public.emergency_active()             to authenticated;
grant execute on function public.emergency_attach_location(uuid, text, double precision, double precision, integer, timestamptz, text) to authenticated;
grant execute on function public.emergency_record_action(uuid, text, text, text) to authenticated;
grant execute on function public.emergency_acknowledge(uuid)    to authenticated;
grant execute on function public.emergency_close(uuid, text)    to authenticated;

-- ---------- Live updates -----------------------------------------------------
alter publication supabase_realtime add table public.emergency_incidents;
