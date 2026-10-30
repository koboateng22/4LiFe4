-- =====================================================================
-- 4Life-AI · database checks
-- Runs the main workflows as real users and checks the privacy rules.
-- Everything happens inside a transaction that is rolled back, so it is
-- safe to run on a development project:
--   psql "$DATABASE_URL" -f supabase/tests/database_checks.sql
-- or paste it into the Supabase SQL editor. It stops at the first failure.
-- =====================================================================
\set QUIET on
\pset tuples_only on
\pset format unaligned
begin;

-- Fixed ids for the test people
\set client_a  '''aaaaaaaa-0000-4000-8000-000000000001'''
\set client_b  '''bbbbbbbb-0000-4000-8000-000000000002'''
\set therap_t  '''cccccccc-0000-4000-8000-000000000003'''
\set therap_u  '''dddddddd-0000-4000-8000-000000000004'''
\set admin_x   '''eeeeeeee-0000-4000-8000-000000000005'''

-- Small helpers (temporary, removed by the rollback)
create function pg_temp.act_as(p uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated')::text, true);
$$;
create function pg_temp.check(ok boolean, what text) returns void language plpgsql as $$
begin
  if not coalesce(ok, false) then raise exception 'CHECK FAILED: %', what; end if;
  raise notice 'ok  %', what;
end $$;

-- ---------- Sign-ups ---------------------------------------------------
insert into auth.users (id, email, raw_user_meta_data) values
  (:client_a, 'a@test.dev', '{"nickname":"Kwame_T","display_name":"Kwame Test","current_triage":"substance","role":"admin"}'),
  (:client_b, 'b@test.dev', '{"nickname":"Ama_T"}'),
  (:therap_t, 't@test.dev', '{"role":"therapist","nickname":"dr_ama_t","full_name":"Ama Konadu","title":"Dr.","profession":"Clinical psychologist",
     "license_body":"Ghana Psychological Council","license_number":"TEST-1","agreed_confidentiality":true,"agreed_crisis_protocol":true,"agreed_accuracy":true,
     "specialties":["substance"],"languages":["English","Twi"],"formats":["video","voice"],"session_length":50,"fee_ghs":35}'),
  (:therap_u, 'u@test.dev', '{"role":"therapist","nickname":"kojo_u","full_name":"Kojo Asare","profession":"Addiction counsellor",
     "license_body":"GACC","license_number":"TEST-2","agreed_confidentiality":true,"agreed_crisis_protocol":true,"agreed_accuracy":true}'),
  (:admin_x, 'x@test.dev', '{"nickname":"admin_x"}');
update public.profiles set role = 'admin' where id = :admin_x;  -- done by the project owner

select pg_temp.check((select role = 'client' from public.profiles where id = :client_a), 'role "admin" in sign-up metadata is ignored');
select pg_temp.check((select count(*) = 2 from public.therapists where id in (:therap_t, :therap_u)), 'therapist sign-ups create therapist rows');
select pg_temp.check((select verification = 'pending' from public.therapists where id = :therap_t), 'new therapists start as pending');

do $$ begin
  begin
    insert into auth.users (id, email, raw_user_meta_data) values (gen_random_uuid(), 'bad@test.dev', '{"role":"therapist","nickname":"no_licence"}');
    raise exception 'should have failed';
  exception when others then
    if sqlerrm = 'should have failed' then raise exception 'CHECK FAILED: therapist without licence was accepted'; end if;
  end;
  raise notice 'ok  therapist sign-up without a licence is refused';
end $$;

-- ---------- Signed-out visitors ------------------------------------------
set local role anon;
select pg_temp.check((select count(*) > 0 from public.emergency_centers), 'anyone can read emergency centres');
do $$ begin
  perform 1 from public.profiles;
  raise exception 'CHECK FAILED: anon can read profiles';
exception when insufficient_privilege then raise notice 'ok  signed-out visitors cannot read profiles';
end $$;
reset role;

-- ---------- Roles and verification ---------------------------------------
set local role authenticated;
select pg_temp.act_as(:client_a);
do $$ begin
  update public.profiles set role = 'admin' where id = auth.uid();
  raise exception 'CHECK FAILED: client changed own role';
exception when others then
  if sqlerrm like 'CHECK FAILED%' then raise; end if;
  raise notice 'ok  a client cannot make themselves admin';
end $$;

select pg_temp.act_as(:therap_t);
do $$ begin
  update public.therapists set verification = 'verified' where id = auth.uid();
  raise exception 'CHECK FAILED: therapist self-verified';
exception when others then
  if sqlerrm like 'CHECK FAILED%' then raise; end if;
  raise notice 'ok  a therapist cannot verify themselves';
end $$;

-- Requests to an unverified therapist are refused
select pg_temp.act_as(:client_a);
do $$ begin
  insert into public.session_requests (therapist_id, preferred_time, format, message)
  values ('cccccccc-0000-4000-8000-000000000003', now() + interval '1 day', 'voice', 'hello');
  raise exception 'CHECK FAILED: request to unverified therapist accepted';
exception when others then
  if sqlerrm like 'CHECK FAILED%' then raise; end if;
  raise notice 'ok  clients cannot book an unverified therapist';
end $$;

select pg_temp.act_as(:admin_x);
select public.review_therapist(:therap_t, true, 'Checked against the register');
select public.review_therapist(:therap_u, true, null);
select pg_temp.check((select verification = 'verified' and verified_at is not null from public.therapists where id = :therap_t), 'admin can verify a therapist');

-- ---------- Booking -------------------------------------------------------
select pg_temp.act_as(:client_a);
select pg_temp.check((select count(*) = 2 from public.therapists), 'clients see verified therapists in the directory');
do $$ begin
  perform 1 from public.therapist_credentials;
  if found then raise exception 'CHECK FAILED: client can read licence details'; end if;
  raise notice 'ok  licence details are private';
end $$;
insert into public.session_requests (therapist_id, preferred_time, format, message, shares_checkins)
values (:therap_t, now() + interval '1 day', 'voice', 'Weekends are hard', true);

select pg_temp.act_as(:client_b);
select pg_temp.check((select count(*) = 0 from public.session_requests), 'another client cannot see the request');

select pg_temp.act_as(:therap_u);
select pg_temp.check((select count(*) = 0 from public.session_requests), 'another therapist cannot see the request');
select pg_temp.check((select count(*) = 0 from public.profiles where id = :client_a), 'another therapist cannot see the client');

select pg_temp.act_as(:therap_t);
select pg_temp.check((select count(*) = 1 from public.session_requests where status = 'new'), 'the therapist sees the request');
select pg_temp.check((select client_nickname = 'Kwame_T' and focus = 'substance' from public.session_requests limit 1), 'the request shows who is asking and why');
select public.accept_session_request((select id from public.session_requests limit 1), now() + interval '1 day');
select pg_temp.check((select count(*) = 1 from public.care_links where client_id = :client_a and shares_checkins), 'accepting links the client, with their sharing choice');
select pg_temp.check((select type = 'intake' from public.sessions where client_id = :client_a), 'accepting books an intake session');
select pg_temp.check((select nickname = 'Kwame_T' from public.profiles where id = :client_a), 'the therapist can now see the client''s profile');

select pg_temp.act_as(:client_b);
do $$ begin
  insert into public.care_links (client_id, therapist_id) values (auth.uid(), 'cccccccc-0000-4000-8000-000000000003');
  raise exception 'CHECK FAILED: client created a care link';
exception when others then
  if sqlerrm like 'CHECK FAILED%' then raise; end if;
  raise notice 'ok  care links can only be created by accepting a request';
end $$;
do $$ begin
  perform public.begin_system_update();
  raise exception 'CHECK FAILED: app user switched off the guards';
exception when insufficient_privilege then
  raise notice 'ok  app users cannot switch off the guards';
end $$;

-- ---------- Check-ins and sharing -----------------------------------------
select pg_temp.act_as(:client_a);
insert into public.checkins (mood, craving) values (3, 6);
select pg_temp.check((select count(*) = 1 from public.sessions), 'the client sees their own session');

select pg_temp.act_as(:therap_t);
select pg_temp.check((select count(*) = 1 from public.checkins where client_id = :client_a), 'the therapist sees shared check-ins');

select pg_temp.act_as(:client_a);
update public.care_links set shares_checkins = false where client_id = auth.uid();
select pg_temp.act_as(:therap_t);
select pg_temp.check((select count(*) = 0 from public.checkins where client_id = :client_a), 'check-ins disappear when the client stops sharing');

do $$ begin
  update public.care_links set shares_checkins = true where therapist_id = auth.uid();
  raise exception 'CHECK FAILED: therapist changed sharing';
exception when others then
  if sqlerrm like 'CHECK FAILED%' then raise; end if;
  raise notice 'ok  only the client can change what they share';
end $$;

select pg_temp.act_as(:client_a);
do $$ begin
  update public.care_links set risk = 'high' where client_id = auth.uid();
  raise exception 'CHECK FAILED: client set risk';
exception when others then
  if sqlerrm like 'CHECK FAILED%' then raise; end if;
  raise notice 'ok  only the therapist can set risk';
end $$;

-- ---------- Session notes ---------------------------------------------------
select pg_temp.act_as(:therap_t);
update public.sessions set status = 'in_progress', started_at = now() where client_id = :client_a;
insert into public.session_notes (session_id, data, assessment, plan, mood_rating, risk_level, homework)
select id, 'Talked about weekends', 'Motivated', 'Plan activities', 3, 'moderate', 'Plan two alcohol-free activities'
from public.sessions where client_id = :client_a;
select public.sign_session_note((select id from public.sessions where client_id = :client_a), now() + interval '8 days');
select pg_temp.check((select risk = 'moderate' from public.care_links where client_id = :client_a), 'signing updates the risk level');
select pg_temp.check((select count(*) = 1 from public.homework where client_id = :client_a), 'signing adds the homework');
select pg_temp.check((select count(*) = 2 from public.sessions where client_id = :client_a), 'signing books the next session');

update public.session_notes set plan = 'Plan activities and call sister' where client_id = :client_a;
select pg_temp.check((select count(*) = 1 from public.session_note_versions), 'editing a signed note keeps the old version');

select pg_temp.act_as(:client_a);
select pg_temp.check((select count(*) = 0 from public.session_notes), 'clients cannot read session notes');
select pg_temp.check((select count(*) = 1 from public.homework), 'the client sees their homework');

-- ---------- SOS and location consent ------------------------------------------
-- Location sharing is off: coordinates are removed
insert into public.sos_events (lat, lng, accuracy_m, area) values (5.65, -0.19, 20, 'Legon');
select pg_temp.check((select lat is null from public.sos_events order by created_at limit 1), 'without consent, SOS coordinates are removed');

select pg_temp.act_as(:therap_t);
select pg_temp.check((select risk = 'high' from public.care_links where client_id = :client_a), 'an SOS raises risk to high');
select pg_temp.check((select count(*) = 1 from public.escalations where client_id = :client_a), 'an SOS starts the escalation record');

select pg_temp.act_as(:client_a);
update public.profiles set share_location_in_crisis = true where id = auth.uid();
insert into public.sos_events (lat, lng, accuracy_m, area, created_at) values (5.65, -0.19, 20, 'Legon', now() + interval '1 second');

select pg_temp.act_as(:therap_t);
select pg_temp.check((select lat is not null from public.sos_events where client_id = :client_a order by created_at desc limit 1), 'with consent, the therapist sees the location');
insert into public.location_requests (client_id) values (:client_a);
insert into public.escalations (client_id, therapist_id, action) values (:client_a, :therap_t, 'Called 112');
do $$ declare n integer; begin
  update public.escalations set action = 'edited';
  get diagnostics n = row_count;
  if n > 0 then raise exception 'CHECK FAILED: therapist edited an escalation'; end if;
  raise notice 'ok  therapists cannot edit the escalation record';
end $$;

select pg_temp.act_as(:therap_u);
select pg_temp.check((select count(*) = 0 from public.sos_events), 'unlinked therapists cannot see SOS alerts');

-- ---------- CBT thought records -------------------------------------------------
select pg_temp.act_as(:client_a);
insert into public.thought_records (thought, emotion, intensity_before, trap, balanced_thought, intensity_after, shared)
values ('One drink will not hurt', 'Tempted', 80, 'permission_giving', 'One drink usually leads to more. I can wait 20 minutes.', 40, false),
       ('I always fail', 'Ashamed', 70, 'overgeneralising', 'I have 12 clean days. A hard day is not failure.', 35, true);
select pg_temp.check((select count(*) = 2 from public.thought_records), 'a client saves thought records');
select pg_temp.act_as(:therap_t);
select pg_temp.check((select count(*) = 1 from public.thought_records), 'the linked therapist sees only the shared thought record');
select pg_temp.act_as(:therap_u);
select pg_temp.check((select count(*) = 0 from public.thought_records), 'an unlinked therapist sees no thought records');
select pg_temp.act_as(:client_b);
select pg_temp.check((select count(*) = 0 from public.thought_records), 'another client sees no thought records');

-- ---------- Global Village --------------------------------------------------------
select pg_temp.act_as(:client_a);
insert into public.village_posts (author_id, author_name, topic, title, body, hidden, support_count)
values (:client_b, 'Someone_else', 'substance', 'Weekends are hard', 'Friday nights are my risky time.', true, 99);
select pg_temp.check((select author_id = :client_a and author_name = 'Kwame_T' and not hidden and support_count = 0 from public.village_posts limit 1),
  'a post is always signed with your own community name and cannot be pre-hidden or pre-liked');
select pg_temp.act_as(:client_b);
insert into public.village_support (post_id) select id from public.village_posts limit 1;
insert into public.village_replies (post_id, body) select id, 'Same here. Plan Friday in advance.' from public.village_posts limit 1;
select pg_temp.check((select support_count = 1 and reply_count = 1 from public.village_posts limit 1), 'support and replies are counted');
insert into public.village_support (post_id, kind) select id, 'metoo' from public.village_posts limit 1;
insert into public.village_support (post_id, kind) select id, 'helped' from public.village_posts limit 1;
select pg_temp.check((select support_count = 1 and metoo_count = 1 and helped_count = 1 from public.village_posts limit 1), '"Me too" and "This helped me" are counted separately');
do $$ begin
  insert into public.village_support (post_id, kind) select id, 'metoo' from public.village_posts limit 1;
  raise exception 'CHECK FAILED: the same reaction was counted twice';
exception when others then
  if sqlerrm like 'CHECK FAILED%' then raise; end if;
  raise notice 'ok  each person gives each reaction once';
end $$;
do $$ begin
  insert into public.village_support (post_id, kind) select id, 'love' from public.village_posts limit 1;
  raise exception 'CHECK FAILED: an unknown reaction was accepted';
exception when others then
  if sqlerrm like 'CHECK FAILED%' then raise; end if;
  raise notice 'ok  only the three reactions are allowed';
end $$;
delete from public.village_support where kind = 'metoo';
select pg_temp.check((select metoo_count = 0 and support_count = 1 from public.village_posts limit 1), 'taking back a reaction updates its count only');

-- Safety plan: the person can fill in their own plan, including reasons and safe places
insert into public.safety_plans (client_id, warning_signs, reasons, safe_places) values (:client_b, 'Payday evenings', 'My little sister', 'The library');
select pg_temp.check((select reasons = 'My little sister' and safe_places = 'The library' from public.safety_plans where client_id = :client_b), 'clients can write their own safety plan');
select pg_temp.act_as(:client_a);
select pg_temp.check((select count(*) = 0 from public.safety_plans where client_id = :client_b), 'other clients cannot see someone''s safety plan');
select pg_temp.act_as(:client_b);

-- Circle RSVPs: people can say they're going; only the number is shared
insert into public.circle_rsvps (circle_id, session_on) select id, current_date + 1 from public.village_circles limit 1;
select pg_temp.act_as(:client_a);
insert into public.circle_rsvps (circle_id, session_on) select id, current_date + 1 from public.village_circles limit 1;
select pg_temp.check((select count(*) = 1 from public.circle_rsvps), 'you only see your own "I''m going"');
select pg_temp.check((select public.circle_going_count(id, current_date + 1) = 2 from public.village_circles limit 1), 'everyone sees how many are going');
do $$ begin
  insert into public.circle_rsvps (circle_id, session_on) select id, current_date + 60 from public.village_circles limit 1;
  raise exception 'CHECK FAILED: an RSVP far in the future was accepted';
exception when others then
  if sqlerrm like 'CHECK FAILED%' then raise; end if;
  raise notice 'ok  RSVPs are only for the coming week';
end $$;
select pg_temp.act_as(:client_b);
do $$ declare n integer; begin
  update public.village_posts set title = 'changed';
  get diagnostics n = row_count;
  if n > 0 then raise exception 'CHECK FAILED: someone else edited a post'; end if;
  raise notice 'ok  members cannot edit other people''s posts';
end $$;
select pg_temp.act_as(:client_a);
do $$ declare n integer; begin
  update public.village_posts set title = 'my new title';
  get diagnostics n = row_count;
  if n > 0 then raise exception 'CHECK FAILED: author edited a post'; end if;
  raise notice 'ok  posts cannot be edited after posting (delete and post again)';
end $$;

-- Blocking hides the blocked person's words from you
select pg_temp.act_as(:client_a);
insert into public.village_blocks (blocked_id) values (:client_b);
select pg_temp.check((select count(*) = 0 from public.village_replies), 'blocking someone hides their replies');
delete from public.village_blocks;
select pg_temp.check((select count(*) = 1 from public.village_replies), 'unblocking shows them again');

-- Three reports from different people hide a post until an admin reviews it
select pg_temp.act_as(:client_b);
insert into public.village_reports (target_type, target_id, reason) select 'post', id, 'unkind' from public.village_posts limit 1;
select pg_temp.check((select count(*) = 0 from public.village_posts), 'a post you report disappears for you');
select pg_temp.act_as(:therap_t);
insert into public.village_reports (target_type, target_id, reason) select 'post', id, 'unkind' from public.village_posts limit 1;
select pg_temp.act_as(:therap_u);
select pg_temp.check((select count(*) = 1 from public.village_posts), 'two reports do not hide a post for others');
insert into public.village_reports (target_type, target_id, reason, reporter_id) select 'post', id, 'unkind', :client_b from public.village_posts limit 1;
select pg_temp.act_as(:admin_x);
select pg_temp.check((select bool_and(hidden) from public.village_posts), 'a third report hides the post until an admin reviews it');
select pg_temp.act_as(:client_a);
select pg_temp.check((select count(*) = 1 from public.village_posts where hidden), 'the author can still see their hidden post');
select pg_temp.act_as(:client_b);
select pg_temp.check((select count(*) = 1 from public.village_reports), 'people see only their own reports');
select pg_temp.act_as(:admin_x);
select pg_temp.check((select count(*) = 3 from public.village_reports), 'admins see every report');

-- Circle chat and rate limits
select pg_temp.act_as(:client_b);
select pg_temp.check((select count(*) = 4 from public.village_circles), 'members see the weekly circles');
insert into public.circle_messages (circle_id, body) values ('circle-sober-evenings', 'Hello everyone');
select pg_temp.check((select author_name = 'Ama_T' from public.circle_messages limit 1), 'circle messages carry the community name');
do $$ begin
  for i in 1..6 loop
    insert into public.village_posts (topic, title, body) values ('general', 'Post number ' || i, 'Testing the limit');
  end loop;
  raise exception 'CHECK FAILED: no rate limit';
exception when others then
  if sqlerrm like 'CHECK FAILED%' then raise; end if;
  raise notice 'ok  posting too quickly is slowed down';
end $$;

-- House rules the database enforces even without the app
do $$ begin
  insert into public.village_posts (topic, title, body) values ('general', 'Call me', 'my number is 024 456 7890');
  raise exception 'CHECK FAILED: phone number accepted';
exception when others then
  if sqlerrm like 'CHECK FAILED%' then raise; end if;
  raise notice 'ok  phone numbers are refused by the database';
end $$;
insert into public.circle_messages (circle_id, body, created_at) values ('circle-sober-evenings', 'Back-dated?', '2000-01-01');
select pg_temp.check((select created_at > now() - interval '1 minute' from public.circle_messages where body = 'Back-dated?'), 'posts cannot be back- or future-dated');

-- Something you reported disappears for you
select pg_temp.act_as(:client_a);
insert into public.circle_messages (circle_id, body) values ('circle-sober-evenings', 'A message to report');
select pg_temp.act_as(:client_b);
insert into public.village_reports (target_type, target_id, reason) select 'circle_message', id, 'spam' from public.circle_messages where body = 'A message to report';
select pg_temp.check((select count(*) = 0 from public.circle_messages where body = 'A message to report'), 'what you report disappears for you');

-- A discharged care link stays closed
select pg_temp.act_as(:client_a);
update public.care_links set status = 'discharged' where client_id = :client_a and therapist_id = :therap_t;
select pg_temp.act_as(:therap_t);
do $$ begin
  update public.care_links set status = 'active' where therapist_id = auth.uid();
  raise exception 'CHECK FAILED: therapist reopened a discharged link';
exception when others then
  if sqlerrm like 'CHECK FAILED%' then raise; end if;
  raise notice 'ok  a therapist cannot reopen a link the client ended';
end $$;
select pg_temp.check((select count(*) = 0 from public.thought_records), 'after the link ends, shared thought records are hidden');
select pg_temp.act_as(:client_b);

-- Hotlines: only numbers that have been checked are shown
reset role;
set local role anon;
select pg_temp.check((select count(*) = 5 and bool_and(verified_at is not null) from public.emergency_hotlines), 'only checked hotline numbers are shown');
reset role;
set local role authenticated;

-- ---------- Data export and audit ----------------------------------------------
select pg_temp.act_as(:client_a);
select pg_temp.check((select (public.export_my_data() -> 'checkins') is not null), 'clients can download their data');
select pg_temp.check((select jsonb_array_length(public.export_my_data() -> 'thought_records') = 2 and jsonb_array_length(public.export_my_data() -> 'village_posts') = 1), 'the download includes thought records and Village posts');
reset role;
select pg_temp.check((select count(*) > 0 from public.audit_log where table_name = 'session_notes'), 'changes to notes are audited');
do $$ begin
  update public.escalations set action = 'edited';
  raise exception 'CHECK FAILED: escalation edited by the database owner';
exception when others then
  if sqlerrm like 'CHECK FAILED%' then raise; end if;
  raise notice 'ok  even the database owner cannot edit the escalation record';
end $$;

select 'All database checks passed' as result;
rollback;
