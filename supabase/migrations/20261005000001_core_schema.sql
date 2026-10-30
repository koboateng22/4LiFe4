-- =====================================================================
-- 4Life-AI · core schema
-- People in recovery (clients), therapists and admins share one Supabase
-- project. Row Level Security decides who can see what:
--   • a client owns their own data;
--   • a therapist only sees clients linked to them (care_links), and only
--     the parts the client agreed to share;
--   • an admin verifies therapist licences.
-- =====================================================================

-- ---------- Enums ----------------------------------------------------
create type public.app_role            as enum ('client', 'therapist', 'admin');
create type public.risk_level          as enum ('low', 'moderate', 'high');
create type public.session_format      as enum ('video', 'voice', 'in_person', 'chat');
create type public.session_type        as enum ('intake', 'follow_up', 'crisis', 'review');
create type public.session_status      as enum ('scheduled', 'in_progress', 'completed', 'cancelled', 'no_show');
create type public.request_status      as enum ('new', 'accepted', 'declined', 'withdrawn');
create type public.verification_status as enum ('pending', 'verified', 'rejected');
create type public.link_status         as enum ('active', 'paused', 'discharged');
create type public.location_source     as enum ('sos', 'checkin', 'requested');

-- ---------- Shared trigger: updated_at --------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- =====================================================================
-- People
-- =====================================================================

-- One row per user, created automatically when someone signs up.
create table public.profiles (
  id                        uuid primary key references auth.users (id) on delete cascade,
  role                      public.app_role not null default 'client',
  display_name              text not null default '' check (char_length(display_name) <= 120),
  nickname                  text not null check (char_length(nickname) between 2 and 40),
  region                    text check (char_length(region) <= 60),
  age                       smallint check (age between 13 and 120),
  language                  text not null default 'en' check (char_length(language) <= 10),
  theme                     text not null default 'light' check (theme in ('light', 'dark')),
  font_size                 text not null default 'md' check (font_size in ('sm', 'md', 'lg', 'xl')),
  current_triage            text not null default 'general',
  belief                    text,
  religion_type             text,
  streak_days               integer not null default 0 check (streak_days >= 0),
  -- Consent: share location with linked therapists only when the person presses SOS
  share_location_in_crisis  boolean not null default false,
  -- Other app preferences (avatar, AI companion name, blocked sites…)
  settings                  jsonb not null default '{}'::jsonb,
  deletion_requested_at     timestamptz,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);
create unique index profiles_nickname_key on public.profiles (lower(nickname));
create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

-- A client's support people. Private to the client.
create table public.support_contacts (
  id            uuid primary key default gen_random_uuid(),
  client_id     uuid not null references public.profiles (id) on delete cascade,
  name          text not null check (char_length(name) between 1 and 80),
  phone         text not null check (char_length(phone) between 5 and 30),
  email         text check (char_length(email) <= 120),
  relationship  text check (char_length(relationship) <= 60),
  is_primary    boolean not null default false,
  created_at    timestamptz not null default now()
);
create index support_contacts_client_idx on public.support_contacts (client_id);
create unique index support_contacts_one_primary on public.support_contacts (client_id) where is_primary;

-- Public part of a therapist's profile (what clients see once verified).
create table public.therapists (
  id                 uuid primary key references public.profiles (id) on delete cascade,
  title              text not null default '' check (title in ('', 'Dr.', 'Mr.', 'Ms.', 'Mrs.')),
  full_name          text not null check (char_length(full_name) between 2 and 120),
  profession         text not null check (char_length(profession) <= 60),
  years_experience   smallint not null default 0 check (years_experience between 0 and 70),
  verification       public.verification_status not null default 'pending',
  verified_at        timestamptz,
  specialties        text[] not null default '{}',
  approaches         text[] not null default '{}',
  languages          text[] not null default '{English}',
  formats            public.session_format[] not null default '{video,voice}',
  region             text,
  practice_location  text check (char_length(practice_location) <= 120),
  work_days          text[] not null default '{Mon,Tue,Wed,Thu,Fri}',
  start_time         time not null default '09:00',
  end_time           time not null default '17:00',
  session_length     smallint not null default 50 check (session_length in (30, 50, 60, 90)),
  fee_ghs            numeric(8, 2) not null default 0 check (fee_ghs >= 0),
  sliding_scale      boolean not null default true,
  accepting_clients  boolean not null default true,
  bio                text not null default '' check (char_length(bio) <= 400),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint therapists_hours_valid check (end_time > start_time),
  constraint therapists_days_valid check (work_days <@ array['Mon','Tue','Wed','Thu','Fri','Sat','Sun'])
);
create index therapists_directory_idx on public.therapists (verification, accepting_clients);
create trigger therapists_updated_at before update on public.therapists
  for each row execute function public.set_updated_at();

-- Private part: licence details and signed agreements. Owner and admins only.
create table public.therapist_credentials (
  therapist_id               uuid primary key references public.therapists (id) on delete cascade,
  license_body               text not null check (char_length(license_body) between 2 and 120),
  license_number             text not null check (char_length(license_number) between 2 and 60),
  agreed_confidentiality_at  timestamptz not null,
  agreed_crisis_protocol_at  timestamptz not null,
  agreed_accuracy_at         timestamptz not null,
  reviewed_by                uuid references public.profiles (id),
  reviewed_at                timestamptz,
  review_note                text,
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now(),
  unique (license_body, license_number)
);
create trigger therapist_credentials_updated_at before update on public.therapist_credentials
  for each row execute function public.set_updated_at();

-- =====================================================================
-- The link between a client and a therapist — every sharing rule checks it
-- =====================================================================
create table public.care_links (
  id               uuid primary key default gen_random_uuid(),
  client_id        uuid not null references public.profiles (id) on delete cascade,
  therapist_id     uuid not null references public.therapists (id) on delete cascade,
  status           public.link_status not null default 'active',
  -- Set by the therapist
  risk             public.risk_level not null default 'low',
  -- Set by the client
  shares_checkins  boolean not null default false,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (client_id, therapist_id),
  constraint care_links_not_self check (client_id <> therapist_id)
);
create index care_links_therapist_idx on public.care_links (therapist_id, status);
create index care_links_client_idx on public.care_links (client_id);
create trigger care_links_updated_at before update on public.care_links
  for each row execute function public.set_updated_at();

-- =====================================================================
-- Client data
-- =====================================================================
create table public.checkins (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  day         date not null default current_date,
  mood        smallint check (mood between 1 and 5),
  craving     smallint check (craving between 0 and 10),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (client_id, day),
  constraint checkins_has_value check (mood is not null or craving is not null)
);
create trigger checkins_updated_at before update on public.checkins
  for each row execute function public.set_updated_at();

create table public.goals (
  id            uuid primary key default gen_random_uuid(),
  client_id     uuid not null references public.profiles (id) on delete cascade,
  created_by    uuid default auth.uid() references public.profiles (id) on delete set null,
  text          text not null check (char_length(text) between 1 and 200),
  done          boolean not null default false,
  created_at    timestamptz not null default now()
);
create index goals_client_idx on public.goals (client_id);

create table public.homework (
  id            uuid primary key default gen_random_uuid(),
  client_id     uuid not null references public.profiles (id) on delete cascade,
  therapist_id  uuid references public.therapists (id) on delete set null,
  session_id    uuid,
  text          text not null check (char_length(text) between 1 and 300),
  done          boolean not null default false,
  done_at       timestamptz,
  created_at    timestamptz not null default now()
);
create index homework_client_idx on public.homework (client_id, created_at desc);

create table public.safety_plans (
  client_id      uuid primary key references public.profiles (id) on delete cascade,
  warning_signs  text not null default '' check (char_length(warning_signs) <= 1500),
  coping_steps   text not null default '' check (char_length(coping_steps) <= 1500),
  support_people text not null default '' check (char_length(support_people) <= 600),
  updated_by     uuid references public.profiles (id) on delete set null,
  updated_at     timestamptz not null default now()
);
create trigger safety_plans_updated_at before update on public.safety_plans
  for each row execute function public.set_updated_at();

-- =====================================================================
-- Therapy work
-- =====================================================================
create table public.session_requests (
  id               uuid primary key default gen_random_uuid(),
  client_id        uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  therapist_id     uuid not null references public.therapists (id) on delete cascade,
  focus            text not null default 'general',
  preferred_time   timestamptz not null,
  format           public.session_format not null default 'voice',
  message          text not null default '' check (char_length(message) <= 600),
  shares_checkins  boolean not null default false,
  -- Filled in by the database when the request is made, so the therapist can
  -- see who is asking before they are linked (see fill_request_details)
  client_nickname  text,
  snapshot         jsonb,
  status           public.request_status not null default 'new',
  decline_reason   text check (char_length(decline_reason) <= 200),
  responded_at     timestamptz,
  created_at       timestamptz not null default now()
);
create index session_requests_therapist_idx on public.session_requests (therapist_id, status, created_at desc);
create index session_requests_client_idx on public.session_requests (client_id);
-- One open request per client and therapist
create unique index session_requests_one_open on public.session_requests (client_id, therapist_id) where status = 'new';

create table public.sessions (
  id            uuid primary key default gen_random_uuid(),
  therapist_id  uuid not null references public.therapists (id) on delete cascade,
  client_id     uuid not null references public.profiles (id) on delete cascade,
  request_id    uuid references public.session_requests (id) on delete set null,
  starts_at     timestamptz not null,
  duration_min  smallint not null default 50 check (duration_min between 15 and 180),
  format        public.session_format not null default 'video',
  type          public.session_type not null default 'follow_up',
  status        public.session_status not null default 'scheduled',
  topic         text check (char_length(topic) <= 160),
  started_at    timestamptz,
  ended_at      timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint sessions_end_after_start check (ended_at is null or started_at is null or ended_at >= started_at)
);
create index sessions_therapist_time_idx on public.sessions (therapist_id, starts_at);
create index sessions_client_time_idx on public.sessions (client_id, starts_at);
create trigger sessions_updated_at before update on public.sessions
  for each row execute function public.set_updated_at();

alter table public.homework
  add constraint homework_session_fk foreign key (session_id) references public.sessions (id) on delete set null;

-- Session notes (DAP). Only the therapist who ran the session can read them.
create table public.session_notes (
  session_id    uuid primary key references public.sessions (id) on delete cascade,
  therapist_id  uuid not null references public.therapists (id) on delete cascade,
  client_id     uuid not null references public.profiles (id) on delete cascade,
  data          text not null default '' check (char_length(data) <= 10000),
  assessment    text not null default '' check (char_length(assessment) <= 10000),
  plan          text not null default '' check (char_length(plan) <= 5000),
  mood_rating   smallint not null default 3 check (mood_rating between 1 and 5),
  risk_level    public.risk_level not null default 'low',
  homework      text check (char_length(homework) <= 300),
  agenda_done   text[] not null default '{}',
  signed_at     timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index session_notes_therapist_idx on public.session_notes (therapist_id, signed_at);
create trigger session_notes_updated_at before update on public.session_notes
  for each row execute function public.set_updated_at();

-- Every change to a signed note keeps the previous version (clinical record keeping).
create table public.session_note_versions (
  id          bigint generated always as identity primary key,
  session_id  uuid not null references public.sessions (id) on delete cascade,
  snapshot    jsonb not null,
  changed_by  uuid,
  changed_at  timestamptz not null default now()
);
create index session_note_versions_session_idx on public.session_note_versions (session_id);

-- Notes only the therapist sees, one per client.
create table public.private_notes (
  therapist_id  uuid not null references public.therapists (id) on delete cascade,
  client_id     uuid not null references public.profiles (id) on delete cascade,
  body          text not null default '' check (char_length(body) <= 20000),
  updated_at    timestamptz not null default now(),
  primary key (therapist_id, client_id)
);
create trigger private_notes_updated_at before update on public.private_notes
  for each row execute function public.set_updated_at();

-- =====================================================================
-- Emergencies
-- =====================================================================
create table public.sos_events (
  id           uuid primary key default gen_random_uuid(),
  client_id    uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  source       public.location_source not null default 'sos',
  lat          double precision check (lat between -90 and 90),
  lng          double precision check (lng between -180 and 180),
  accuracy_m   integer check (accuracy_m between 0 and 100000),
  area         text check (char_length(area) <= 120),
  approximate  boolean not null default false,
  created_at   timestamptz not null default now(),
  constraint sos_events_latlng_together check ((lat is null) = (lng is null))
);
create index sos_events_client_time_idx on public.sos_events (client_id, created_at desc);

-- A therapist asks a client's app for a fresh location during an alert.
create table public.location_requests (
  id            uuid primary key default gen_random_uuid(),
  client_id     uuid not null references public.profiles (id) on delete cascade,
  therapist_id  uuid not null default auth.uid() references public.therapists (id) on delete cascade,
  created_at    timestamptz not null default now(),
  answered_at   timestamptz
);
create index location_requests_client_idx on public.location_requests (client_id, created_at desc);

-- What happened during a crisis. Append-only.
create table public.escalations (
  id            uuid primary key default gen_random_uuid(),
  client_id     uuid not null references public.profiles (id) on delete cascade,
  therapist_id  uuid references public.therapists (id) on delete cascade,
  actor         uuid default auth.uid(),
  action        text not null check (char_length(action) between 1 and 200),
  note          text check (char_length(note) <= 1000),
  created_at    timestamptz not null default now()
);
create index escalations_client_idx on public.escalations (client_id, created_at desc);
create index escalations_therapist_idx on public.escalations (therapist_id, created_at desc);

-- Hospitals and ambulance stations (reference data).
create table public.emergency_centers (
  id                 text primary key,
  name               text not null,
  type               text not null check (type in ('hospital', 'rehab', 'ems_station', 'helpline')),
  region             text not null,
  address            text not null,
  phone              text not null,
  lat                double precision not null,
  lng                double precision not null,
  hours              text not null,
  beds_available     boolean not null default false,
  emergency_hotline  text,
  verified_at        timestamptz,
  updated_at         timestamptz not null default now()
);

-- =====================================================================
-- Audit trail: who changed sensitive records, and when (no content copied)
-- =====================================================================
create table public.audit_log (
  id          bigint generated always as identity primary key,
  at          timestamptz not null default now(),
  actor       uuid,
  table_name  text not null,
  op          text not null,
  row_key     text
);
create index audit_log_at_idx on public.audit_log (at desc);
create index audit_log_actor_idx on public.audit_log (actor, at desc);
