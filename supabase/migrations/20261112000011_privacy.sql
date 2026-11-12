-- Privacy fixes found while writing the Privacy Policy (see PRIVACY-AUDIT.md). Forward-only: it
-- replaces one access rule and one function, and adds one function. No data is changed or removed.

-- ---------------------------------------------------------------------
-- 1. A therapist sees only the profile details their workspace uses.
--    Before: a linked therapist could read a client's whole profile row, including `settings`, which
--    holds the client's latest mood and craving, gender, area and other preferences. That went past
--    the client's choice to keep check-ins private. Now: community name, age, focus area, streak and
--    whether they agreed to share their location in an SOS, through this function only.
-- ---------------------------------------------------------------------
drop policy if exists "profiles: therapist reads linked clients" on public.profiles;

create or replace function public.my_client_profiles(p_ids uuid[] default null)
returns table (id uuid, nickname text, age smallint, current_triage text, streak_days integer, share_location_in_crisis boolean)
language sql stable security definer set search_path = '' as $$
  select p.id, p.nickname, p.age, p.current_triage, p.streak_days, p.share_location_in_crisis
    from public.profiles p
   where public.is_my_client(p.id)
     and (p_ids is null or p.id = any (p_ids));
$$;
revoke execute on function public.my_client_profiles(uuid[]) from public, anon;
grant execute on function public.my_client_profiles(uuid[]) to authenticated;

-- ---------------------------------------------------------------------
-- 2. "Download my data" includes everything the person can be given about themselves:
--    their sign-in email, and the records that were missing (Village reactions, blocks, reports and
--    circle sign-ups, their own circle messages, location requests about them, and a therapist's
--    services, days off and licence details). Records that are about someone else, or that are a
--    therapist's own notes, are not included (see the Privacy Policy, "Downloading your information").
-- ---------------------------------------------------------------------
create or replace function public.export_my_data()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'exported_at',      now(),
    'account',          (select jsonb_build_object('email', u.email, 'created_at', u.created_at) from auth.users u where u.id = auth.uid()),
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
    'location_requests', (select coalesce(jsonb_agg(jsonb_build_object('created_at', q.created_at, 'answered_at', q.answered_at) order by q.created_at), '[]')
                            from public.location_requests q where q.client_id = auth.uid()),
    'emergency_incidents', (select coalesce(jsonb_agg(public.emergency_view(i.id) order by i.created_at), '[]') from public.emergency_incidents i where i.client_id = auth.uid()),
    'thought_records',  (select coalesce(jsonb_agg(t order by t.created_at), '[]') from public.thought_records t where t.client_id = auth.uid()),
    'village_posts',    (select coalesce(jsonb_agg(p order by p.created_at), '[]') from public.village_posts p where p.author_id = auth.uid()),
    'village_replies',  (select coalesce(jsonb_agg(r order by r.created_at), '[]') from public.village_replies r where r.author_id = auth.uid()),
    'village_reactions', (select coalesce(jsonb_agg(to_jsonb(s) - 'user_id' order by s.created_at), '[]') from public.village_support s where s.user_id = auth.uid()),
    'village_reports',  (select coalesce(jsonb_agg(to_jsonb(r) - 'reporter_id' order by r.created_at), '[]') from public.village_reports r where r.reporter_id = auth.uid()),
    'village_blocks',   (select coalesce(jsonb_agg(jsonb_build_object('blocked_name', b.blocked_name, 'created_at', b.created_at) order by b.created_at), '[]') from public.village_blocks b where b.blocker_id = auth.uid()),
    'circle_rsvps',     (select coalesce(jsonb_agg(to_jsonb(c) - 'user_id' order by c.created_at), '[]') from public.circle_rsvps c where c.user_id = auth.uid()),
    'circle_messages',  (select coalesce(jsonb_agg(m order by m.created_at), '[]') from public.circle_messages m where m.author_id = auth.uid()),
    'therapist',        (select to_jsonb(t) from public.therapists t where t.id = auth.uid()),
    'therapist_credentials', (select to_jsonb(c) - 'reviewed_by' from public.therapist_credentials c where c.therapist_id = auth.uid()),
    'therapist_services', (select coalesce(jsonb_agg(s order by s.created_at), '[]') from public.therapist_services s where s.therapist_id = auth.uid()),
    'therapist_time_off', (select coalesce(jsonb_agg(o order by o.starts_on), '[]') from public.therapist_time_off o where o.therapist_id = auth.uid())
  );
$$;
revoke execute on function public.export_my_data() from public, anon;
grant execute on function public.export_my_data() to authenticated;
