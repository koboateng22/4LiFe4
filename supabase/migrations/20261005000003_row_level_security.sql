-- =====================================================================
-- 4Life-AI · Row Level Security
-- Every table has RLS on. Anything not allowed below is denied.
-- =====================================================================

alter table public.profiles               enable row level security;
alter table public.support_contacts       enable row level security;
alter table public.therapists             enable row level security;
alter table public.therapist_credentials  enable row level security;
alter table public.care_links             enable row level security;
alter table public.checkins               enable row level security;
alter table public.goals                  enable row level security;
alter table public.homework               enable row level security;
alter table public.safety_plans           enable row level security;
alter table public.session_requests       enable row level security;
alter table public.sessions               enable row level security;
alter table public.session_notes          enable row level security;
alter table public.session_note_versions  enable row level security;
alter table public.private_notes          enable row level security;
alter table public.sos_events             enable row level security;
alter table public.location_requests      enable row level security;
alter table public.escalations            enable row level security;
alter table public.emergency_centers      enable row level security;
alter table public.audit_log              enable row level security;

-- ---------- profiles --------------------------------------------------
create policy "profiles: read own"          on public.profiles for select to authenticated using (id = auth.uid());
create policy "profiles: therapist reads linked clients"
                                            on public.profiles for select to authenticated using (public.is_my_client(id));
create policy "profiles: client reads own therapists"
                                            on public.profiles for select to authenticated using (public.is_my_therapist(id));
create policy "profiles: admin reads all"   on public.profiles for select to authenticated using (public.is_admin());
create policy "profiles: update own"        on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
create policy "profiles: admin updates"     on public.profiles for update to authenticated using (public.is_admin());

-- ---------- support_contacts (client only) ----------------------------
create policy "contacts: client manages own" on public.support_contacts for all to authenticated
  using (client_id = auth.uid()) with check (client_id = auth.uid());

-- ---------- therapists ------------------------------------------------
-- Verified therapists who accept clients form the public directory for signed-in users.
create policy "therapists: directory"       on public.therapists for select to authenticated
  using (verification = 'verified' or id = auth.uid() or public.is_my_therapist(id) or public.is_admin());
create policy "therapists: update own"      on public.therapists for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
create policy "therapists: admin updates"   on public.therapists for update to authenticated using (public.is_admin());

-- ---------- therapist_credentials (owner and admins) -------------------
create policy "credentials: owner reads"    on public.therapist_credentials for select to authenticated
  using (therapist_id = auth.uid() or public.is_admin());
create policy "credentials: owner updates"  on public.therapist_credentials for update to authenticated
  using (therapist_id = auth.uid()) with check (therapist_id = auth.uid());
create policy "credentials: admin updates"  on public.therapist_credentials for update to authenticated using (public.is_admin());

-- ---------- care_links -------------------------------------------------
-- Created only through accept_session_request(). Both sides can read and
-- update their own columns (enforced by the guard trigger).
create policy "links: both sides read"      on public.care_links for select to authenticated
  using (client_id = auth.uid() or therapist_id = auth.uid() or public.is_admin());
create policy "links: both sides update"    on public.care_links for update to authenticated
  using (client_id = auth.uid() or therapist_id = auth.uid())
  with check (client_id = auth.uid() or therapist_id = auth.uid());

-- ---------- checkins ---------------------------------------------------
create policy "checkins: client manages own" on public.checkins for all to authenticated
  using (client_id = auth.uid()) with check (client_id = auth.uid());
create policy "checkins: therapist reads if shared" on public.checkins for select to authenticated
  using (public.can_see_checkins(client_id));

-- ---------- goals and homework (shared between client and therapist) ----
create policy "goals: client manages own"    on public.goals for all to authenticated
  using (client_id = auth.uid()) with check (client_id = auth.uid());
create policy "goals: therapist manages"     on public.goals for all to authenticated
  using (public.is_my_client(client_id)) with check (public.is_my_client(client_id));

create policy "homework: client reads own"   on public.homework for select to authenticated using (client_id = auth.uid());
create policy "homework: client ticks off"   on public.homework for update to authenticated
  using (client_id = auth.uid()) with check (client_id = auth.uid());
create policy "homework: therapist manages"  on public.homework for all to authenticated
  using (public.is_my_client(client_id)) with check (public.is_my_client(client_id) and (therapist_id is null or therapist_id = auth.uid()));

-- ---------- safety_plans -------------------------------------------------
create policy "safety: client manages own"   on public.safety_plans for all to authenticated
  using (client_id = auth.uid()) with check (client_id = auth.uid());
create policy "safety: therapist manages"    on public.safety_plans for all to authenticated
  using (public.is_my_client(client_id)) with check (public.is_my_client(client_id));

-- ---------- session_requests ---------------------------------------------
create policy "requests: client creates"     on public.session_requests for insert to authenticated
  with check (
    client_id = auth.uid() and status = 'new'
    and exists (select 1 from public.therapists t
                where t.id = therapist_id and t.verification = 'verified' and t.accepting_clients)
  );
create policy "requests: client reads own"   on public.session_requests for select to authenticated using (client_id = auth.uid());
create policy "requests: client withdraws"   on public.session_requests for update to authenticated
  using (client_id = auth.uid() and status = 'new') with check (client_id = auth.uid() and status = 'withdrawn');
create policy "requests: therapist reads"    on public.session_requests for select to authenticated using (therapist_id = auth.uid());
-- Therapists answer through accept_session_request() / decline_session_request().

-- ---------- sessions -------------------------------------------------------
create policy "sessions: therapist manages"  on public.sessions for all to authenticated
  using (therapist_id = auth.uid())
  with check (therapist_id = auth.uid() and public.is_my_client(client_id));
create policy "sessions: client reads own"   on public.sessions for select to authenticated using (client_id = auth.uid());

-- ---------- session notes (therapist only) ---------------------------------
create policy "notes: therapist manages own" on public.session_notes for all to authenticated
  using (therapist_id = auth.uid())
  with check (exists (select 1 from public.sessions s where s.id = session_id and s.therapist_id = auth.uid()));
create policy "note versions: therapist reads own" on public.session_note_versions for select to authenticated
  using (exists (select 1 from public.sessions s where s.id = session_id and s.therapist_id = auth.uid()));

-- ---------- private notes (therapist only) ----------------------------------
create policy "private notes: therapist manages own" on public.private_notes for all to authenticated
  using (therapist_id = auth.uid()) with check (therapist_id = auth.uid() and public.is_my_client(client_id));

-- ---------- SOS and location ---------------------------------------------
create policy "sos: client sends own"        on public.sos_events for insert to authenticated with check (client_id = auth.uid());
create policy "sos: client reads own"        on public.sos_events for select to authenticated using (client_id = auth.uid());
-- Therapists see the alert, and the coordinates are only present when the client consented
-- (the sos_respect_consent trigger strips them otherwise).
create policy "sos: therapist reads linked"  on public.sos_events for select to authenticated using (public.is_my_client(client_id));

create policy "location requests: therapist asks" on public.location_requests for insert to authenticated
  with check (therapist_id = auth.uid() and public.can_see_location(client_id));
create policy "location requests: both read" on public.location_requests for select to authenticated
  using (client_id = auth.uid() or therapist_id = auth.uid());

-- ---------- escalations (append-only) ----------------------------------------
create policy "escalations: therapist reads"  on public.escalations for select to authenticated
  using (therapist_id = auth.uid() or public.is_admin());
create policy "escalations: therapist records" on public.escalations for insert to authenticated
  with check (therapist_id = auth.uid() and actor = auth.uid() and public.is_my_client(client_id));

-- ---------- reference data and audit -----------------------------------------
create policy "centres: everyone reads"      on public.emergency_centers for select to anon, authenticated using (true);
create policy "centres: admin manages"       on public.emergency_centers for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy "audit: admin reads"           on public.audit_log for select to authenticated using (public.is_admin());

-- =====================================================================
-- Privileges
-- =====================================================================
-- Signed-out visitors can only read the emergency centre list.
revoke all on all tables in schema public from anon;
grant select on public.emergency_centers to anon;

-- Internal functions are not callable from the app.
revoke execute on function public.begin_system_update()            from public, anon, authenticated;
revoke execute on function public.end_system_update()              from public, anon, authenticated;
revoke execute on function public.handle_new_user()                from public, anon, authenticated;
revoke execute on function public.purge_expired_locations(integer) from public, anon, authenticated;
revoke execute on function public.guard_profile_role()             from public, anon, authenticated;
revoke execute on function public.guard_therapist_verification()   from public, anon, authenticated;
revoke execute on function public.reverify_on_credential_change()  from public, anon, authenticated;
revoke execute on function public.guard_care_link_columns()        from public, anon, authenticated;
revoke execute on function public.fill_note_owner()                from public, anon, authenticated;
revoke execute on function public.version_signed_note()            from public, anon, authenticated;
revoke execute on function public.sos_respect_consent()            from public, anon, authenticated;
revoke execute on function public.sos_notify_therapists()          from public, anon, authenticated;
revoke execute on function public.audit_row()                      from public, anon, authenticated;
revoke execute on function public.fill_request_details()           from public, anon, authenticated;

-- Workflows: signed-in users only (each checks who is calling).
revoke execute on function public.accept_session_request(uuid, timestamptz) from public, anon;
revoke execute on function public.decline_session_request(uuid, text)       from public, anon;
revoke execute on function public.sign_session_note(uuid, timestamptz)      from public, anon;
revoke execute on function public.export_my_data()                          from public, anon;
revoke execute on function public.request_account_deletion()                from public, anon;
revoke execute on function public.review_therapist(uuid, boolean, text)     from public, anon;
grant execute on function public.accept_session_request(uuid, timestamptz) to authenticated;
grant execute on function public.decline_session_request(uuid, text)       to authenticated;
grant execute on function public.sign_session_note(uuid, timestamptz)      to authenticated;
grant execute on function public.export_my_data()                          to authenticated;
grant execute on function public.request_account_deletion()                to authenticated;
grant execute on function public.review_therapist(uuid, boolean, text)     to authenticated;

-- =====================================================================
-- Realtime: the apps listen for these changes (RLS still applies)
-- =====================================================================
alter publication supabase_realtime add table
  public.session_requests,
  public.sessions,
  public.care_links,
  public.checkins,
  public.sos_events,
  public.location_requests,
  public.escalations;
