-- =====================================================================
-- 4Life-AI · helper functions, guards and workflows
-- Helpers are SECURITY DEFINER so RLS policies can use them without
-- recursion. All use an empty search_path and fully qualified names.
-- =====================================================================

-- ---------- Who is asking? -------------------------------------------
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin');
$$;

create or replace function public.is_therapist()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.therapists t where t.id = auth.uid());
$$;

-- The current user is a therapist linked to this client (not discharged).
create or replace function public.is_my_client(p_client uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.care_links l
    where l.client_id = p_client and l.therapist_id = auth.uid() and l.status <> 'discharged'
  );
$$;

-- …and the client agreed to share daily check-ins with them.
create or replace function public.can_see_checkins(p_client uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.care_links l
    where l.client_id = p_client and l.therapist_id = auth.uid()
      and l.status <> 'discharged' and l.shares_checkins
  );
$$;

-- …and the client agreed to share their location when they press SOS.
create or replace function public.can_see_location(p_client uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_my_client(p_client)
     and exists (select 1 from public.profiles p where p.id = p_client and p.share_location_in_crisis);
$$;

-- The current user is a client of this therapist (used for the therapist's own profile row).
create or replace function public.is_my_therapist(p_therapist uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.care_links l
    where l.therapist_id = p_therapist and l.client_id = auth.uid() and l.status <> 'discharged'
  );
$$;

-- Trusted workflows below switch this on for the rest of their transaction
-- so the column guards let their own system updates through.
create or replace function public.in_system_update()
returns boolean language sql stable set search_path = '' as $$
  select coalesce(current_setting('fourlife.system', true), '') = 'on';
$$;

create or replace function public.begin_system_update()
returns void language sql set search_path = '' as $$
  select set_config('fourlife.system', 'on', true);
$$;

create or replace function public.end_system_update()
returns void language sql set search_path = '' as $$
  select set_config('fourlife.system', 'off', true);
$$;

-- ---------- New sign-ups ---------------------------------------------
-- Creates the profile (and, for therapists, the therapist + credential rows)
-- from the metadata sent with supabase.auth.signUp(). Works whether or not
-- email confirmation is switched on.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  m        jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_role   public.app_role := case when m ->> 'role' = 'therapist' then 'therapist'::public.app_role else 'client'::public.app_role end;
  v_nick   text := coalesce(nullif(trim(m ->> 'nickname'), ''), 'member_' || substr(replace(new.id::text, '-', ''), 1, 8));
begin
  insert into public.profiles (id, role, display_name, nickname, region, language, theme, current_triage, belief, religion_type)
  values (
    new.id, v_role,
    coalesce(m ->> 'display_name', ''),
    v_nick,
    m ->> 'region',
    coalesce(m ->> 'language', 'en'),
    case when m ->> 'theme' = 'dark' then 'dark' else 'light' end,
    coalesce(m ->> 'current_triage', 'general'),
    m ->> 'belief',
    m ->> 'religion_type'
  );

  if v_role = 'therapist' then
    if coalesce(m ->> 'license_number', '') = '' or coalesce(m ->> 'license_body', '') = '' then
      raise exception 'Therapist sign-up needs a licensing body and licence number';
    end if;
    if not (coalesce((m ->> 'agreed_confidentiality')::boolean, false)
        and coalesce((m ->> 'agreed_crisis_protocol')::boolean, false)
        and coalesce((m ->> 'agreed_accuracy')::boolean, false)) then
      raise exception 'Therapist sign-up needs all three professional agreements';
    end if;

    insert into public.therapists (
      id, title, full_name, profession, years_experience, specialties, approaches, languages, formats,
      region, practice_location, work_days, start_time, end_time, session_length, fee_ghs, sliding_scale,
      accepting_clients, bio)
    values (
      new.id,
      coalesce(m ->> 'title', ''),
      coalesce(nullif(m ->> 'full_name', ''), m ->> 'display_name', v_nick),
      coalesce(m ->> 'profession', 'Counsellor'),
      coalesce((m ->> 'years_experience')::smallint, 0),
      coalesce(array(select jsonb_array_elements_text(m -> 'specialties')), '{}'),
      coalesce(array(select jsonb_array_elements_text(m -> 'approaches')), '{}'),
      coalesce(nullif(array(select jsonb_array_elements_text(m -> 'languages')), '{}'), '{English}'),
      coalesce(nullif(array(select jsonb_array_elements_text(m -> 'formats'))::public.session_format[], '{}'), '{video,voice}'),
      m ->> 'region',
      m ->> 'practice_location',
      coalesce(nullif(array(select jsonb_array_elements_text(m -> 'work_days')), '{}'), '{Mon,Tue,Wed,Thu,Fri}'),
      coalesce((m ->> 'start_time')::time, '09:00'),
      coalesce((m ->> 'end_time')::time, '17:00'),
      coalesce((m ->> 'session_length')::smallint, 50),
      coalesce((m ->> 'fee_ghs')::numeric, 0),
      coalesce((m ->> 'sliding_scale')::boolean, true),
      coalesce((m ->> 'accepting_clients')::boolean, true),
      coalesce(m ->> 'bio', '')
    );

    insert into public.therapist_credentials (
      therapist_id, license_body, license_number,
      agreed_confidentiality_at, agreed_crisis_protocol_at, agreed_accuracy_at)
    values (new.id, m ->> 'license_body', m ->> 'license_number', now(), now(), now());
  end if;

  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- Guards ----------------------------------------------------
-- Nobody can change their own role; only admins can.
create or replace function public.guard_profile_role()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.role is distinct from old.role and not public.is_admin() and auth.uid() is not null then
    raise exception 'Only an admin can change a role';
  end if;
  return new;
end $$;
create trigger profiles_guard_role before update on public.profiles
  for each row execute function public.guard_profile_role();

-- Verification is set by admins only. Editing licence details sends it back to "pending".
create or replace function public.guard_therapist_verification()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.verification is distinct from old.verification and auth.uid() is not null
     and not public.is_admin() and not public.in_system_update() then
    raise exception 'Only an admin can change verification';
  end if;
  if new.verification = 'verified' and old.verification is distinct from 'verified' then
    new.verified_at := now();
  end if;
  return new;
end $$;
create trigger therapists_guard_verification before update on public.therapists
  for each row execute function public.guard_therapist_verification();

create or replace function public.reverify_on_credential_change()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (new.license_body, new.license_number) is distinct from (old.license_body, old.license_number)
     and auth.uid() is not null and not public.is_admin() then
    perform public.begin_system_update();
    update public.therapists set verification = 'pending', verified_at = null where id = new.therapist_id;
    perform public.end_system_update();
    new.reviewed_by := null;
    new.reviewed_at := null;
  end if;
  return new;
end $$;
create trigger credentials_reverify before update on public.therapist_credentials
  for each row execute function public.reverify_on_credential_change();

-- Clients control sharing; therapists control risk and status.
create or replace function public.guard_care_link_columns()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or public.is_admin() or public.in_system_update() then
    return new;
  end if;
  if auth.uid() = old.client_id then
    if new.risk is distinct from old.risk then
      raise exception 'Only the therapist can set the risk level';
    end if;
    -- A client may end the relationship, but not reopen it
    if new.status is distinct from old.status and new.status <> 'discharged' then
      raise exception 'A client can only end a care link';
    end if;
  elsif auth.uid() = old.therapist_id then
    if new.shares_checkins is distinct from old.shares_checkins then
      raise exception 'Only the client can change what they share';
    end if;
  end if;
  if (new.client_id, new.therapist_id) is distinct from (old.client_id, old.therapist_id) then
    raise exception 'A care link cannot be moved to other people';
  end if;
  return new;
end $$;
create trigger care_links_guard before update on public.care_links
  for each row execute function public.guard_care_link_columns();

-- A note always belongs to the session's therapist and client.
create or replace function public.fill_note_owner()
returns trigger language plpgsql security definer set search_path = '' as $$
declare s record;
begin
  select therapist_id, client_id into s from public.sessions where id = new.session_id;
  if s is null then raise exception 'Session not found'; end if;
  new.therapist_id := s.therapist_id;
  new.client_id := s.client_id;
  return new;
end $$;
create trigger session_notes_fill_owner before insert or update on public.session_notes
  for each row execute function public.fill_note_owner();

-- Keep the previous version whenever a signed note is changed.
create or replace function public.version_signed_note()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.signed_at is not null and (old.data, old.assessment, old.plan, old.risk_level, old.mood_rating, old.homework)
     is distinct from (new.data, new.assessment, new.plan, new.risk_level, new.mood_rating, new.homework) then
    insert into public.session_note_versions (session_id, snapshot, changed_by)
    values (old.session_id, to_jsonb(old), auth.uid());
  end if;
  return new;
end $$;
create trigger session_notes_versioning before update on public.session_notes
  for each row execute function public.version_signed_note();

-- Escalations and audit entries can never be edited or removed.
create or replace function public.forbid_change()
returns trigger language plpgsql as $$
begin
  raise exception '% is append-only', tg_table_name;
end $$;
create trigger escalations_append_only before update or delete on public.escalations
  for each row execute function public.forbid_change();
create trigger audit_log_append_only before update or delete on public.audit_log
  for each row execute function public.forbid_change();
create trigger note_versions_append_only before update or delete on public.session_note_versions
  for each row execute function public.forbid_change();

-- ---------- SOS -------------------------------------------------------
-- Strip the location unless the client agreed to share it.
create or replace function public.sos_respect_consent()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.profiles p where p.id = new.client_id and p.share_location_in_crisis) then
    new.lat := null; new.lng := null; new.accuracy_m := null; new.area := null; new.approximate := false;
  end if;
  return new;
end $$;
create trigger sos_events_consent before insert on public.sos_events
  for each row execute function public.sos_respect_consent();

-- An SOS raises risk to high for every active therapist and starts the record.
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
                else 'Pressed SOS in the app (location not shared)' end
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
create trigger sos_events_notify after insert on public.sos_events
  for each row execute function public.sos_notify_therapists();

-- ---------- Session requests -----------------------------------------
-- Add the requester's community name and, only if they chose to share,
-- a short snapshot of their recent check-ins.
create or replace function public.fill_request_details()
returns trigger language plpgsql security definer set search_path = '' as $$
declare p public.profiles;
begin
  select * into p from public.profiles where id = new.client_id;
  new.client_nickname := p.nickname;
  if new.focus is null or new.focus = 'general' then new.focus := coalesce(p.current_triage, 'general'); end if;
  if new.shares_checkins then
    new.snapshot := jsonb_build_object(
      'streak_days', p.streak_days,
      'mood',    (select coalesce(jsonb_agg(c.mood order by c.day), '[]') from public.checkins c
                  where c.client_id = new.client_id and c.day > current_date - 7),
      'craving', (select coalesce(jsonb_agg(c.craving order by c.day), '[]') from public.checkins c
                  where c.client_id = new.client_id and c.day > current_date - 7));
  else
    new.snapshot := null;
  end if;
  return new;
end $$;
create trigger session_requests_fill before insert on public.session_requests
  for each row execute function public.fill_request_details();

-- ---------- Audit trail -----------------------------------------------
create or replace function public.audit_row()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  rec jsonb := to_jsonb(coalesce(new, old));
begin
  insert into public.audit_log (actor, table_name, op, row_key)
  values (auth.uid(), tg_table_name, tg_op,
          coalesce(rec ->> 'id', rec ->> 'session_id', rec ->> 'client_id', rec ->> 'therapist_id'));
  return coalesce(new, old);
end $$;

create trigger audit_care_links     after insert or update or delete on public.care_links            for each row execute function public.audit_row();
create trigger audit_session_notes  after insert or update or delete on public.session_notes         for each row execute function public.audit_row();
create trigger audit_private_notes  after insert or update or delete on public.private_notes         for each row execute function public.audit_row();
create trigger audit_safety_plans   after insert or update or delete on public.safety_plans          for each row execute function public.audit_row();
create trigger audit_credentials    after insert or update or delete on public.therapist_credentials for each row execute function public.audit_row();
create trigger audit_therapists     after update of verification on public.therapists                for each row execute function public.audit_row();
create trigger audit_sos            after insert on public.sos_events                                for each row execute function public.audit_row();

-- =====================================================================
-- Workflows (RPC). Each runs as one transaction.
-- Call from the app with supabase.rpc('name', { ...args }).
-- =====================================================================

-- Accept a request: link the client, book the first session.
create or replace function public.accept_session_request(p_request uuid, p_starts_at timestamptz default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  r          public.session_requests;
  t          public.therapists;
  v_existing boolean;
  v_session  uuid;
begin
  select * into r from public.session_requests where id = p_request for update;
  if r is null or r.therapist_id <> auth.uid() then
    raise exception 'Request not found';
  end if;
  if r.status <> 'new' then
    raise exception 'This request has already been answered';
  end if;
  select * into t from public.therapists where id = r.therapist_id;

  select exists (select 1 from public.care_links where client_id = r.client_id and therapist_id = r.therapist_id)
    into v_existing;

  perform public.begin_system_update();

  insert into public.care_links (client_id, therapist_id, shares_checkins, status)
  values (r.client_id, r.therapist_id, r.shares_checkins, 'active')
  on conflict (client_id, therapist_id) do update
    set status = 'active', shares_checkins = excluded.shares_checkins or public.care_links.shares_checkins;

  insert into public.sessions (therapist_id, client_id, request_id, starts_at, duration_min, format, type, topic)
  values (r.therapist_id, r.client_id, r.id, coalesce(p_starts_at, r.preferred_time), t.session_length, r.format,
          case when v_existing then 'follow_up'::public.session_type else 'intake'::public.session_type end,
          case when v_existing then null else 'Getting to know each other' end)
  returning id into v_session;

  perform public.end_system_update();

  update public.session_requests set status = 'accepted', responded_at = now() where id = r.id;
  return v_session;
end $$;

create or replace function public.decline_session_request(p_request uuid, p_reason text default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.session_requests
     set status = 'declined', decline_reason = left(p_reason, 200), responded_at = now()
   where id = p_request and therapist_id = auth.uid() and status = 'new';
  if not found then raise exception 'Request not found or already answered'; end if;
end $$;

-- Sign a session note: closes the session, updates risk and homework,
-- and books the next session if asked (and none is booked yet).
create or replace function public.sign_session_note(p_session uuid, p_next_starts_at timestamptz default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  s public.sessions;
  n public.session_notes;
begin
  select * into s from public.sessions where id = p_session for update;
  if s is null or s.therapist_id <> auth.uid() then raise exception 'Session not found'; end if;
  if s.status = 'scheduled' then raise exception 'You can sign a note after the session has taken place'; end if;

  select * into n from public.session_notes where session_id = p_session for update;
  if n is null or trim(n.data) = '' then raise exception 'Write what happened before signing'; end if;

  update public.session_notes set signed_at = now() where session_id = p_session;
  update public.sessions set status = 'completed', ended_at = coalesce(ended_at, now()) where id = p_session;
  update public.care_links set risk = n.risk_level where client_id = s.client_id and therapist_id = s.therapist_id;

  if coalesce(trim(n.homework), '') <> '' and not exists (
       select 1 from public.homework where session_id = p_session) then
    insert into public.homework (client_id, therapist_id, session_id, text)
    values (s.client_id, s.therapist_id, p_session, trim(n.homework));
  end if;

  if p_next_starts_at is not null and not exists (
       select 1 from public.sessions
        where client_id = s.client_id and therapist_id = s.therapist_id
          and status = 'scheduled' and starts_at > s.starts_at) then
    insert into public.sessions (therapist_id, client_id, starts_at, duration_min, format, type)
    values (s.therapist_id, s.client_id, p_next_starts_at, s.duration_min, s.format, 'follow_up');
  end if;
end $$;

-- A copy of everything stored about the current user (Settings → Download my data).
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
    'therapist',        (select to_jsonb(t) from public.therapists t where t.id = auth.uid())
  );
$$;

-- Ask for the account to be deleted. An admin completes it after any
-- legally required record keeping (clinical notes may need to be retained).
create or replace function public.request_account_deletion()
returns void language sql security definer set search_path = '' as $$
  update public.profiles set deletion_requested_at = now() where id = auth.uid();
$$;

-- Remove exact coordinates from SOS events older than 30 days.
-- Schedule daily with pg_cron (Database → Extensions → pg_cron), e.g.:
--   select cron.schedule('purge-old-locations', '15 3 * * *', $$select public.purge_expired_locations()$$);
create or replace function public.purge_expired_locations(p_days integer default 30)
returns integer language plpgsql security definer set search_path = '' as $$
declare v_count integer;
begin
  update public.sos_events
     set lat = null, lng = null, accuracy_m = null, area = null
   where created_at < now() - make_interval(days => p_days) and lat is not null;
  get diagnostics v_count = row_count;
  return v_count;
end $$;

-- Admin: approve or reject a therapist's licence.
create or replace function public.review_therapist(p_therapist uuid, p_verified boolean, p_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Admins only'; end if;
  update public.therapists
     set verification = case when p_verified then 'verified'::public.verification_status else 'rejected'::public.verification_status end
   where id = p_therapist;
  update public.therapist_credentials
     set reviewed_by = auth.uid(), reviewed_at = now(), review_note = p_note
   where therapist_id = p_therapist;
end $$;
