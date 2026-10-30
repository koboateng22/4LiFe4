-- =====================================================================
-- 4Life-AI · the three core features
--   1. AI CBT therapy  → thought_records (client-owned, optionally shared)
--   2. Global Village  → posts, replies, support, reports, blocks,
--                        group circles and circle chat
--   3. Instant EMS     → emergency_hotlines (checked numbers only)
-- Chat conversations with the AI are NOT stored here: they stay on the
-- person's device.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. CBT thought records
-- ---------------------------------------------------------------------
create table public.thought_records (
  id                uuid primary key default gen_random_uuid(),
  client_id         uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  situation         text not null default '' check (char_length(situation) <= 600),
  thought           text not null check (char_length(thought) between 1 and 600),
  emotion           text not null default '' check (char_length(emotion) <= 60),
  intensity_before  smallint not null check (intensity_before between 0 and 100),
  trap              text not null check (trap in ('all_or_nothing', 'expecting_worst', 'permission_giving', 'feelings_as_facts',
                                                  'mind_reading', 'ignoring_positive', 'overgeneralising', 'should_statements')),
  evidence_for      text not null default '' check (char_length(evidence_for) <= 1000),
  evidence_against  text not null default '' check (char_length(evidence_against) <= 1000),
  balanced_thought  text not null check (char_length(balanced_thought) between 1 and 600),
  intensity_after   smallint not null check (intensity_after between 0 and 100),
  shared            boolean not null default false,
  created_at        timestamptz not null default now()
);
create index thought_records_client_idx on public.thought_records (client_id, created_at desc);

alter table public.thought_records enable row level security;
create policy "thoughts: client manages own" on public.thought_records for all to authenticated
  using (client_id = auth.uid()) with check (client_id = auth.uid());
-- A linked therapist sees a record only when the client ticked "share with my counsellor"
create policy "thoughts: therapist reads shared" on public.thought_records for select to authenticated
  using (shared and public.is_my_client(client_id));

-- ---------------------------------------------------------------------
-- 2. Global Village
-- ---------------------------------------------------------------------
create table public.village_posts (
  id            uuid primary key default gen_random_uuid(),
  author_id     uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  author_name   text not null default '',          -- the author's community name, filled in by the database
  topic         text not null check (topic in ('substance', 'porn_social', 'anger', 'overeating', 'general')),
  title         text not null check (char_length(title) between 3 and 120),
  body          text not null check (char_length(body) between 1 and 4000),
  support_count integer not null default 0,
  reply_count   integer not null default 0,
  hidden        boolean not null default false,     -- set automatically after 3 reports, or by an admin
  created_at    timestamptz not null default now()
);
create index village_posts_recent_idx on public.village_posts (created_at desc) where not hidden;

create table public.village_replies (
  id          uuid primary key default gen_random_uuid(),
  post_id     uuid not null references public.village_posts (id) on delete cascade,
  author_id   uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  author_name text not null default '',
  body        text not null check (char_length(body) between 1 and 2000),
  hidden      boolean not null default false,
  created_at  timestamptz not null default now()
);
create index village_replies_post_idx on public.village_replies (post_id, created_at);

-- "Send support" (like a heart). One per person per post.
create table public.village_support (
  post_id    uuid not null references public.village_posts (id) on delete cascade,
  user_id    uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create table public.village_reports (
  id           uuid primary key default gen_random_uuid(),
  target_type  text not null check (target_type in ('post', 'reply', 'circle_message')),
  target_id    uuid not null,
  reporter_id  uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  reason       text not null check (reason in ('unkind', 'unsafe', 'drugs', 'personal_info', 'spam', 'other')),
  note         text not null default '' check (char_length(note) <= 500),
  resolved_at  timestamptz,
  created_at   timestamptz not null default now(),
  unique (target_type, target_id, reporter_id)
);

-- Blocking someone hides their posts, replies and circle messages from you.
create table public.village_blocks (
  blocker_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  blocked_id uuid not null references public.profiles (id) on delete cascade,
  blocked_name text not null default '' check (char_length(blocked_name) <= 40),  -- shown in your own "blocked" list
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

-- Weekly group circles (times are in Ghana time, GMT all year).
create table public.village_circles (
  id            text primary key,
  title         text not null,
  topic         text not null,
  host_name     text not null,
  host_role     text not null default '',
  description   text not null default '',
  weekday       smallint not null check (weekday between 0 and 6),   -- 0 = Sunday
  start_time    time not null,
  duration_min  smallint not null default 60 check (duration_min between 15 and 180),
  active        boolean not null default true
);

create table public.circle_messages (
  id          uuid primary key default gen_random_uuid(),
  circle_id   text not null references public.village_circles (id) on delete cascade,
  author_id   uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  author_name text not null default '',
  body        text not null check (char_length(body) between 1 and 1000),
  hidden      boolean not null default false,
  created_at  timestamptz not null default now()
);
create index circle_messages_recent_idx on public.circle_messages (circle_id, created_at desc);

-- ---------- Helpers ----------------------------------------------------
create or replace function public.i_blocked(p_author uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.village_blocks b where b.blocker_id = auth.uid() and b.blocked_id = p_author);
$$;

-- Something you reported disappears for you straight away.
create or replace function public.i_reported(p_target uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.village_reports r where r.reporter_id = auth.uid() and r.target_id = p_target);
$$;

-- Fill in the author's community name and stop anyone posting as someone else
-- or un-hiding content. Also a gentle rate limit against spam.
create or replace function public.village_before_insert()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  recent integer;
  lim integer;
  win interval;
  txt text;
begin
  -- App users always post as themselves. (Server scripts using the service key, where
  -- auth.uid() is empty, may set the author — e.g. scripts/seed-demo.mjs.)
  if not public.in_system_update() and auth.uid() is not null then
    new.author_id := auth.uid();
    new.hidden := false;
    new.created_at := now();   -- no back- or future-dating (rate limit, feed order, purge)
  end if;

  -- The app and server check the full house rules before posting. These are the
  -- rules the database enforces even if someone calls it directly.
  txt := lower(translate(coalesce(new.body, '') || ' ' || coalesce(to_jsonb(new) ->> 'title', ''), '’‘', ''''''));
  if txt ~ '(\+?233[ -]?\d{2}[ -]?\d{3}[ -]?\d{4})|(\m0\d{2}[ -]?\d{3}[ -]?\d{4}\M)|(\m\d{9,}\M)' or txt ~ '[a-z0-9._%+-]+@[a-z0-9-]+\.[a-z.]+' then
    raise exception 'Please don''t share phone numbers or emails in the Village.';
  end if;
  if txt ~ '\m(nigg(er|a)s?|chinks?|kikes?|fags?|faggots?|trann(y|ies)|retards?|retarded|spics?|wetbacks?|gooks?|towelheads?)\M' then
    raise exception 'Slurs are not allowed in the Village.';
  end if;
  if txt ~ '\m(kill yourself|kys|hang yourself|go die)\M' then
    raise exception 'Telling anyone to hurt themselves is never allowed here.';
  end if;
  select p.nickname into new.author_name from public.profiles p where p.id = new.author_id;
  if new.author_name is null then
    raise exception 'Please finish setting up your profile first';
  end if;

  if tg_table_name = 'village_posts' then
    new.support_count := 0;
    new.reply_count := 0;
    lim := 5;  win := interval '1 hour';
    select count(*) into recent from public.village_posts where author_id = new.author_id and created_at > now() - win;
  elsif tg_table_name = 'village_replies' then
    lim := 30; win := interval '1 hour';
    select count(*) into recent from public.village_replies where author_id = new.author_id and created_at > now() - win;
  else
    lim := 20; win := interval '5 minutes';
    select count(*) into recent from public.circle_messages where author_id = new.author_id and created_at > now() - win;
  end if;
  if recent >= lim then
    raise exception 'You are posting very quickly. Please wait a little and try again.';
  end if;
  return new;
end $$;

create trigger village_posts_before_insert   before insert on public.village_posts   for each row execute function public.village_before_insert();
create trigger village_replies_before_insert before insert on public.village_replies for each row execute function public.village_before_insert();
create trigger circle_messages_before_insert before insert on public.circle_messages for each row execute function public.village_before_insert();

-- Only admins (or the report workflow) can hide or edit; authors may only delete.
create or replace function public.village_guard_update()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if public.in_system_update() or public.is_admin() then
    return new;
  end if;
  raise exception 'Posts cannot be edited. You can delete yours and post again.';
end $$;

create trigger village_posts_guard   before update on public.village_posts   for each row execute function public.village_guard_update();
create trigger village_replies_guard before update on public.village_replies for each row execute function public.village_guard_update();
create trigger circle_messages_guard before update on public.circle_messages for each row execute function public.village_guard_update();

-- Keep the counters on each post correct.
create or replace function public.village_count()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  pid uuid := coalesce(new.post_id, old.post_id);
begin
  perform public.begin_system_update();
  if tg_table_name = 'village_support' then
    update public.village_posts set support_count = (select count(*) from public.village_support s where s.post_id = pid) where id = pid;
  else
    update public.village_posts set reply_count = (select count(*) from public.village_replies r where r.post_id = pid and not r.hidden) where id = pid;
  end if;
  perform public.end_system_update();
  return coalesce(new, old);
end $$;

create trigger village_support_count after insert or delete on public.village_support for each row execute function public.village_count();
create trigger village_replies_count after insert or delete or update of hidden on public.village_replies for each row execute function public.village_count();

-- Three different people reporting the same thing hides it until an admin reviews it.
create or replace function public.village_after_report()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  n integer;
begin
  select count(*) into n from public.village_reports r
  where r.target_type = new.target_type and r.target_id = new.target_id and r.resolved_at is null;
  if n >= 3 then
    perform public.begin_system_update();
    if new.target_type = 'post' then
      update public.village_posts set hidden = true where id = new.target_id;
    elsif new.target_type = 'reply' then
      update public.village_replies set hidden = true where id = new.target_id;
    else
      update public.circle_messages set hidden = true where id = new.target_id;
    end if;
    perform public.end_system_update();
  end if;
  return new;
end $$;

create trigger village_reports_after_insert after insert on public.village_reports for each row execute function public.village_after_report();

-- Reporters are always the signed-in person.
create or replace function public.village_report_owner()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  new.reporter_id := coalesce(auth.uid(), new.reporter_id);
  new.resolved_at := null;
  return new;
end $$;
create trigger village_reports_owner before insert on public.village_reports for each row execute function public.village_report_owner();

-- Circle chat is a live conversation, not an archive: remove messages after 7 days.
-- Schedule with pg_cron, e.g.:
--   select cron.schedule('purge-circle-chat', '30 3 * * *', $$select public.purge_old_circle_messages()$$);
create or replace function public.purge_old_circle_messages(p_days integer default 7)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  n integer;
begin
  delete from public.circle_messages where created_at < now() - make_interval(days => p_days);
  get diagnostics n = row_count;
  return n;
end $$;

-- ---------- Row Level Security -----------------------------------------
alter table public.village_posts    enable row level security;
alter table public.village_replies  enable row level security;
alter table public.village_support  enable row level security;
alter table public.village_reports  enable row level security;
alter table public.village_blocks   enable row level security;
alter table public.village_circles  enable row level security;
alter table public.circle_messages  enable row level security;

create policy "posts: members read"     on public.village_posts for select to authenticated
  using ((not hidden and not public.i_blocked(author_id) and not public.i_reported(id)) or author_id = auth.uid() or public.is_admin());
create policy "posts: members write"    on public.village_posts for insert to authenticated with check (author_id = auth.uid());
create policy "posts: author deletes"   on public.village_posts for delete to authenticated using (author_id = auth.uid() or public.is_admin());
create policy "posts: admin updates"    on public.village_posts for update to authenticated using (public.is_admin());

create policy "replies: members read"   on public.village_replies for select to authenticated
  using ((not hidden and not public.i_blocked(author_id) and not public.i_reported(id)) or author_id = auth.uid() or public.is_admin());
create policy "replies: members write"  on public.village_replies for insert to authenticated
  with check (author_id = auth.uid() and exists (select 1 from public.village_posts p where p.id = post_id and not p.hidden));
create policy "replies: author deletes" on public.village_replies for delete to authenticated using (author_id = auth.uid() or public.is_admin());
create policy "replies: admin updates"  on public.village_replies for update to authenticated using (public.is_admin());

create policy "support: read own"       on public.village_support for select to authenticated using (user_id = auth.uid());
create policy "support: give"           on public.village_support for insert to authenticated with check (user_id = auth.uid());
create policy "support: take back"      on public.village_support for delete to authenticated using (user_id = auth.uid());

create policy "reports: make"           on public.village_reports for insert to authenticated with check (true);
create policy "reports: read own"       on public.village_reports for select to authenticated using (reporter_id = auth.uid() or public.is_admin());
create policy "reports: admin resolves" on public.village_reports for update to authenticated using (public.is_admin());

create policy "blocks: manage own"      on public.village_blocks for all to authenticated
  using (blocker_id = auth.uid()) with check (blocker_id = auth.uid());

create policy "circles: members read"   on public.village_circles for select to authenticated using (active or public.is_admin());
create policy "circles: admin manages"  on public.village_circles for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "circle chat: members read"  on public.circle_messages for select to authenticated
  using ((not hidden and not public.i_blocked(author_id) and not public.i_reported(id)) or author_id = auth.uid() or public.is_admin());
create policy "circle chat: members write" on public.circle_messages for insert to authenticated with check (author_id = auth.uid());
create policy "circle chat: author deletes" on public.circle_messages for delete to authenticated using (author_id = auth.uid() or public.is_admin());
create policy "circle chat: admin updates"  on public.circle_messages for update to authenticated using (public.is_admin());

-- ---------------------------------------------------------------------
-- 3. Instant EMS: emergency hotlines
-- Only numbers with a recorded check are shown in the app.
-- ---------------------------------------------------------------------
create table public.emergency_hotlines (
  id           text primary key,
  label        text not null,
  number       text not null,
  description  text not null default '',
  sort         smallint not null default 100,
  verified_at  date,               -- when the number was last confirmed to work
  source       text not null default '',
  updated_at   timestamptz not null default now()
);
alter table public.emergency_hotlines enable row level security;
create policy "hotlines: everyone reads"  on public.emergency_hotlines for select to anon, authenticated using (verified_at is not null or public.is_admin());
create policy "hotlines: admin manages"   on public.emergency_hotlines for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ---------- Care links: a discharged link stays closed -----------------
-- Thought records are shared through care links, so a therapist must not be
-- able to reopen a link the client (or they) ended. Only a new accepted
-- request (a trusted workflow) or an admin can.
create or replace function public.guard_care_link_columns()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or public.is_admin() or public.in_system_update() then
    return new;
  end if;
  if old.status = 'discharged' and new.status is distinct from old.status then
    raise exception 'This care link has ended. A new request is needed to start again.';
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

-- ---------- Updated export: include the new records --------------------
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
    'thought_records',  (select coalesce(jsonb_agg(t order by t.created_at), '[]') from public.thought_records t where t.client_id = auth.uid()),
    'village_posts',    (select coalesce(jsonb_agg(p order by p.created_at), '[]') from public.village_posts p where p.author_id = auth.uid()),
    'village_replies',  (select coalesce(jsonb_agg(r order by r.created_at), '[]') from public.village_replies r where r.author_id = auth.uid()),
    'therapist',        (select to_jsonb(t) from public.therapists t where t.id = auth.uid())
  );
$$;

-- ---------- Function permissions ---------------------------------------
revoke execute on function public.village_before_insert()          from public, anon, authenticated;
revoke execute on function public.village_guard_update()           from public, anon, authenticated;
revoke execute on function public.village_count()                  from public, anon, authenticated;
revoke execute on function public.village_after_report()           from public, anon, authenticated;
revoke execute on function public.village_report_owner()           from public, anon, authenticated;
revoke execute on function public.purge_old_circle_messages(integer) from public, anon, authenticated;
revoke execute on function public.export_my_data()                 from public, anon;
grant execute on function public.export_my_data()                  to authenticated;

-- ---------- Live updates ------------------------------------------------
alter publication supabase_realtime add table
  public.village_posts,
  public.village_replies,
  public.circle_messages,
  public.thought_records;

-- ---------------------------------------------------------------------
-- Reference data
-- ---------------------------------------------------------------------
insert into public.village_circles (id, title, topic, host_name, host_role, description, weekday, start_time, duration_min) values
  ('circle-sober-evenings', 'Sober evenings',      'substance',   'Dr. Ama Konadu', 'Clinical psychologist', 'For the hours after lectures or work when cravings are strongest. Share one hard moment and one win.', 3, '19:00', 60),
  ('circle-screen-reset',   'Screen-time reset',   'porn_social', 'Kojo A.',        'Peer supporter, 2 years in recovery', 'Late-night scrolling and explicit content: practical tips and honest talk, no judgement.', 2, '21:00', 45),
  ('circle-cool-head',      'Cool head',           'anger',       'Efua M.',        'Counsellor',            'When stress turns into anger. Learn one calming skill each week.', 4, '18:30', 60),
  ('circle-weekend-plan',   'Weekend plan',        'general',     'Dr. Ama Konadu', 'Clinical psychologist', 'Plan a safe weekend together: risky places, people to call, and things to do instead.', 5, '17:00', 45)
on conflict (id) do nothing;

-- Checked numbers (source and date recorded). Add more only after calling them.
insert into public.emergency_hotlines (id, label, number, description, sort, verified_at, source) values
  ('gh-112',      'Emergency (all services)', '112',          'Police, fire and ambulance. Free from any phone.',          1, '2026-08-31', 'TherapyRoute Ghana crisis lines, checked Aug 2026'),
  ('gh-193',      'Ambulance',                '193',          'National Ambulance Service.',                              2, '2026-08-31', 'TherapyRoute Ghana crisis lines, checked Aug 2026'),
  ('gh-191',      'Police',                   '191',          'If you or someone else is in danger.',                     3, '2026-08-31', 'TherapyRoute Ghana crisis lines, checked Aug 2026'),
  ('gh-192',      'Fire service',             '192',          'Fire and rescue.',                                         4, '2026-08-31', 'TherapyRoute Ghana crisis lines, checked Aug 2026'),
  ('gh-yonkodo',  'Yonkodo Foundation',       '0558 288 288', 'Emotional support and suicide prevention, answered by trained volunteers. Also on WhatsApp.', 5, '2026-08-31', 'TherapyRoute Ghana crisis lines, checked Aug 2026'),
  ('gh-mha',      'Mental Health Authority',  '0800 678 678', 'Toll-free psychosocial support line.',                     6, null,         'GNA, Sept 2022 — not yet confirmed working')
on conflict (id) do update set label = excluded.label, number = excluded.number, description = excluded.description,
  sort = excluded.sort, verified_at = excluded.verified_at, source = excluded.source, updated_at = now();
