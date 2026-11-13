/**
 * The admin system in a real PostgreSQL (PGlite) with every migration applied and Row Level Security on,
 * tested as separate accounts: an admin, ordinary clients, a therapist and a signed-out visitor.
 *  - Only admins get anything from the admin functions; nobody can make themselves admin (by updating
 *    their role, through sign-up data or through editable profile settings).
 *  - Suspension, therapist review, admin rights, moderation, SOS, content: they change the real records,
 *    and every change (and every look at a person or an SOS) is in the append-only admin log.
 *  - No recovery content, session notes or SOS coordinates come out of the admin functions.
 *   npm run test:admin-db
 */
import { testDatabase, asUser, callRpc, CLIENT, OTHER, THERAPIST, OTHER_THERAPIST, NO_CONSENT } from './emergency-db-test';

let n = 0;
const ok = (c: unknown, what: string) => {
  if (!c) throw new Error('FAIL: ' + what);
  n++;
  console.log('ok ', what);
};
const refused = async (p: Promise<unknown>, re: RegExp = /Admins only|permission denied/i) =>
  p.then(
    () => false,
    (e: any) => re.test(String(e?.message))
  );

const pg = await testDatabase();
const ADMIN = '66666666-6666-4666-8666-666666666666';
// The documented way to make an admin (SUPABASE.md, step 7): the project owner, in the SQL editor
await pg.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, 'admin@it.test', '{"nickname":"Admin_One"}')`, [ADMIN]);
await pg.query(`update public.profiles set role = 'admin' where id = (select id from auth.users where email = 'admin@it.test')`);
await pg.exec(`update public.therapists set verification = 'verified', accepting_clients = true, work_days = '{Mon,Tue,Wed,Thu,Fri,Sat,Sun}' where id = '${THERAPIST}'`);
const rpc = (who: string | null, fn: string, args: Record<string, unknown> = {}) => callRpc(pg, who, fn, args);
const log = async () => (await pg.query<any>(`select * from public.admin_actions order by id`)).rows;

// ---------- 1. Who can get in ----------
ok((await log()).some(a => a.action === 'role_change' && a.details.via === 'sql_editor' && a.details.to === 'admin'), 'making an admin in the SQL editor (the documented way) is logged');
for (const [who, name] of [[CLIENT, 'a client'], [THERAPIST, 'a therapist']] as const)
  ok(await refused(rpc(who, 'admin_overview')), `${name} gets “Admins only” from the admin functions`);
ok(await refused(rpc(null, 'admin_overview')), 'a signed-out visitor cannot call them at all');
ok(await refused(rpc(null, 'is_suspended', { p_user: CLIENT })), 'a signed-out visitor cannot ask whether an account is suspended');
ok(await refused(rpc(CLIENT, 'admin_set_suspension', { p_user: OTHER, p_suspend: true, p_reason: 'test' })) && !(await rpc(ADMIN, 'is_suspended', { p_user: OTHER })), 'a client cannot suspend anyone');
ok(await refused(rpc(THERAPIST, 'review_therapist', { p_therapist: OTHER_THERAPIST, p_verified: true })), 'a therapist cannot approve a therapist (even themselves)');
ok(await refused(asUser(pg, CLIENT, `update public.profiles set role = 'admin' where id = auth.uid()`), /Only an admin can change a role/), 'a client cannot make themselves admin');
await asUser(pg, CLIENT, `update public.profiles set settings = settings || '{"role":"admin","isAdmin":true}'::jsonb where id = auth.uid()`);
ok(await refused(rpc(CLIENT, 'admin_overview')), 'writing role: admin into their own editable settings changes nothing');
await pg.query(`insert into auth.users (id, email, raw_user_meta_data) values ('77777777-7777-4777-8777-777777777777', 'sneaky@it.test', '{"nickname":"Sneaky_1","role":"admin"}')`);
ok((await pg.query<any>(`select role from public.profiles where id = '77777777-7777-4777-8777-777777777777'`)).rows[0].role === 'client', 'role: admin in sign-up data is ignored');
ok((await asUser(pg, CLIENT, `select * from public.admin_actions`)).length === 0, 'a client sees nothing of the admin log');
ok(await refused(asUser(pg, CLIENT, `insert into public.admin_actions (admin_id, action) values (auth.uid(), 'fake')`), /row-level security|permission denied/i), 'a client cannot write to the admin log');
ok(await refused(asUser(pg, CLIENT, `insert into public.account_suspensions (user_id, reason) values ('${OTHER}', 'xxx')`), /row-level security|permission denied/i), 'a client cannot suspend anyone by writing the table');
ok(await refused(asUser(pg, ADMIN, `insert into public.admin_actions (admin_id, action) values (auth.uid(), 'fake')`), /row-level security|permission denied/i), 'even an admin cannot write the log directly: only the functions do');

// ---------- 2. Overview: real numbers ----------
const ov = await rpc(ADMIN, 'admin_overview');
const realUsers = (await pg.query<any>(`select count(*)::int c from public.profiles`)).rows[0].c;
ok(ov.users.total === realUsers && ov.users.admins === 1 && ov.users.therapists === 2, `the overview counts real accounts (${ov.users.total} people, ${ov.users.therapists} therapists, 1 admin)`);
ok(ov.therapists.verified === 1 && ov.therapists.pending === 1, 'it counts verified and pending therapists');
ok(ov.series.days.length === 30 && ov.series.signups.length === 30 && ov.series.signups.at(-1) === realUsers, 'it gives 30-day series for the charts (all sign-ups are today here)');
ok(ov.sos.active === 0 && ov.sos.last_30d === 0, 'no SOS yet: none active, none in the last 30 days');

// ---------- 3. People ----------
const found = await rpc(ADMIN, 'admin_list_users', { p_query: 'kwame' });
ok(found.total === 1 && found.rows[0].email === 'kwame@it.test' && found.rows[0].nickname === 'Kwame_GH', 'search finds people by name or email');
ok(!JSON.stringify(found).match(/settings|password|encrypted|belief/), 'the list has no settings, faith or sign-in secrets');
ok((await rpc(ADMIN, 'admin_list_users', { p_role: 'therapist' })).total === 2, 'filter by role works');
await pg.exec(`insert into public.checkins (client_id, day, mood, craving) values ('${CLIENT}', current_date, 2, 8)`);
const detail = await rpc(ADMIN, 'admin_user_detail', { p_user: CLIENT });
ok(detail.activity.checkins === 1 && !('mood' in detail.activity) && !JSON.stringify(detail).includes('"craving"'), 'a person’s details show how much they use 4Life, never what they wrote or rated');
ok((await log()).some(a => a.action === 'view_user' && a.target_id === CLIENT), 'looking at a person’s details is logged');

// ---------- 4. Suspension ----------
ok(await refused(rpc(ADMIN, 'admin_set_suspension', { p_user: OTHER, p_suspend: true, p_reason: '' }), /Give a reason/), 'suspending needs a reason');
ok(await refused(rpc(ADMIN, 'admin_set_suspension', { p_user: ADMIN, p_suspend: true, p_reason: 'oops' }), /your own account/), 'an admin cannot suspend themselves');
await rpc(ADMIN, 'admin_set_suspension', { p_user: OTHER, p_suspend: true, p_reason: 'Repeated harassment in the Village' });
ok(await refused(asUser(pg, OTHER, `insert into public.village_posts (topic, title, body) values ('general', 'Hello all', 'test')`), /row-level security/i), 'a suspended person cannot post in the Village');
ok(await refused(asUser(pg, OTHER, `insert into public.session_requests (therapist_id, preferred_time) values ('${THERAPIST}', now() + interval '3 days')`), /row-level security/i), '…or ask for a session');
await asUser(pg, OTHER, `insert into public.sos_events (lat, lng) values (5.6, -0.2)`);
ok((await asUser(pg, OTHER, `select * from public.sos_events where client_id = auth.uid()`)).length === 1, '…but can still raise an SOS');
ok((await asUser<any>(pg, OTHER, `select reason from public.account_suspensions where user_id = auth.uid()`))[0]?.reason === 'Repeated harassment in the Village', '…and can see why they were suspended');
ok((await callRpc(pg, OTHER, 'export_my_data', {})).profile.id === OTHER, '…and can still download their data');
await rpc(ADMIN, 'admin_set_suspension', { p_user: OTHER, p_suspend: false, p_reason: 'Appeal accepted' });
await asUser(pg, OTHER, `insert into public.village_posts (topic, title, body) values ('general', 'Back again', 'Thanks for having me back')`);
ok(true, 'restored: they can post again');
const sus = (await log()).filter(a => a.target_id === OTHER && /suspend_account|restore_account/.test(a.action));
ok(sus.length === 2 && sus[0].reason === 'Repeated harassment in the Village' && sus[1].reason === 'Appeal accepted' && sus.every(a => a.admin_id === ADMIN), 'both are logged, with who did it and why');

// a suspended therapist disappears from the directory and offers no times
await rpc(ADMIN, 'admin_set_suspension', { p_user: THERAPIST, p_suspend: true, p_reason: 'Licence under investigation' });
ok((await asUser(pg, NO_CONSENT, `select id from public.therapists where id = '${THERAPIST}' and verification = 'verified'`)).length === 1, 'a suspended therapist is still visible to their own clients');
ok((await asUser(pg, OTHER, `select id from public.therapists where id = '${THERAPIST}'`)).length === 0, 'a suspended therapist is hidden from everyone else in the directory');
ok((await asUser(pg, OTHER, `select s from public.therapist_free_slots('${THERAPIST}', 7, null) s`)).length === 0, '…and offers no free times');
await rpc(ADMIN, 'admin_set_suspension', { p_user: THERAPIST, p_suspend: false, p_reason: 'Cleared' });
ok((await asUser(pg, OTHER, `select s from public.therapist_free_slots('${THERAPIST}', 7, null) s`)).length > 0, 'restored: free times come back');

// ---------- 5. Therapists ----------
const list = await rpc(ADMIN, 'admin_list_therapists', { p_status: 'pending' });
ok(list.length === 1 && list[0].id === OTHER_THERAPIST && list[0].licence.license_number === 'IT-2', 'pending therapists are listed with their licence details for review');
ok(await refused(rpc(ADMIN, 'review_therapist', { p_therapist: OTHER_THERAPIST, p_verified: false, p_note: '' }), /reason/), 'rejecting needs a reason');
await rpc(ADMIN, 'review_therapist', { p_therapist: OTHER_THERAPIST, p_verified: true, p_note: 'Checked against the register, licence IT-2' });
ok((await pg.query<any>(`select verification from public.therapists where id = '${OTHER_THERAPIST}'`)).rows[0].verification === 'verified', 'approving really verifies the therapist');
ok((await log()).filter(a => a.action === 'approve_therapist' && a.target_id === OTHER_THERAPIST).length === 1 && !(await log()).some(a => a.action === 'verification_change' && a.target_id === OTHER_THERAPIST), 'the approval is logged once (not twice)');

// ---------- 6. Admin rights ----------
ok(await refused(rpc(ADMIN, 'admin_set_admin', { p_user: THERAPIST, p_admin: true, p_reason: 'help' }), /therapist account cannot also be an admin/), 'a therapist account is not turned into an admin (it would lose its workspace)');
await rpc(ADMIN, 'admin_set_admin', { p_user: NO_CONSENT, p_admin: true, p_reason: 'Second moderator' });
ok(!(await refused(rpc(NO_CONSENT, 'admin_overview'))), 'a client made admin can use the admin functions');
ok(await refused(rpc(NO_CONSENT, 'admin_set_admin', { p_user: NO_CONSENT, p_admin: false, p_reason: 'x y z' }), /your own admin rights/), 'admins cannot change their own rights');
await rpc(ADMIN, 'admin_set_admin', { p_user: NO_CONSENT, p_admin: false, p_reason: 'Trial over' });
ok(await refused(rpc(NO_CONSENT, 'admin_overview')), 'taking the rights back works at once');
const roleLog = (await log()).filter(a => a.target_id === NO_CONSENT && /admin|role_change/.test(a.action)).map(a => a.action);
ok(roleLog.join() === 'grant_admin,revoke_admin', `rights changes are logged once each (${roleLog.join(', ')})`);

// ---------- 7. Appointments ----------
await pg.exec(`insert into public.sessions (therapist_id, client_id, starts_at, duration_min, topic) values ('${THERAPIST}', '${CLIENT}', now() + interval '2 days', 50, 'Private topic about family')`);
const ap = await rpc(ADMIN, 'admin_appointments', {});
ok(ap.sessions.length === 1 && ap.sessions[0].client === 'Kwame_GH' && !JSON.stringify(ap).includes('Private topic'), 'appointments show times, status and who, never the topic');
ok(Array.isArray(ap.conflicts) && ap.conflicts.length === 0, 'it checks for double bookings (none)');

// ---------- 8. Moderation ----------
await asUser(pg, CLIENT, `insert into public.village_posts (topic, title, body) values ('general', 'Rude post', 'Something unkind here')`);
const post = (await pg.query<any>(`select id from public.village_posts where title = 'Rude post'`)).rows[0].id;
for (const who of [OTHER, NO_CONSENT, THERAPIST]) await asUser(pg, who, `insert into public.village_reports (target_type, target_id, reason) values ('post', $1, 'unkind')`, [post]);
const reports = await rpc(ADMIN, 'admin_reports', { p_state: 'open' });
const item = reports.find((r: any) => r.target_id === post);
ok(item && item.reports === 3 && item.hidden === true && item.author === 'Kwame_GH', 'reports are grouped by item, with the content, its author and whether it was hidden automatically');
ok(await refused(rpc(ADMIN, 'admin_moderate', { p_type: 'post', p_id: post, p_action: 'delete', p_reason: '' }), /Give a reason/), 'removing needs a reason');
await rpc(ADMIN, 'admin_moderate', { p_type: 'post', p_id: post, p_action: 'delete', p_reason: 'Breaks the house rules: insults' });
ok((await pg.query<any>(`select count(*)::int c from public.village_posts where id = $1`, [post])).rows[0].c === 0, 'removing really deletes it');
ok((await pg.query<any>(`select bool_and(resolved_at is not null) r from public.village_reports where target_id = $1`, [post])).rows[0].r, 'its reports are marked resolved');
const mod = (await log()).filter(a => a.target_id === post);
ok(mod.length === 1 && mod[0].action === 'moderate_delete' && mod[0].details.excerpt.includes('Rude post') && mod[0].reason.includes('insults'), 'the removal is logged once, with an excerpt and the reason');
// an admin editing someone's content directly (not through the dashboard) is logged too
const other = (await pg.query<any>(`select id from public.village_posts where title = 'Back again'`)).rows[0].id;
await asUser(pg, ADMIN, `update public.village_posts set hidden = true where id = $1`, [other]);
ok((await log()).some(a => a.action === 'direct_edit' && a.target_id === other && a.details.via === 'direct'), 'an admin hiding a post directly, outside the dashboard, is still logged');

// ---------- 9. SOS ----------
const inc = await callRpc(pg, CLIENT, 'emergency_open_incident', { p_request_id: 'bbbbbbbb-0000-4000-8000-000000000001' });
const sos = await rpc(ADMIN, 'admin_sos', {});
ok(sos.length === 1 && sos[0].active === true && sos[0].ref.length === 8, 'an open SOS from the last 24 hours is shown as active, with a short reference');
ok(!JSON.stringify(sos).match(/lat|lng|Kwame|client|phone/i), 'the SOS list has no location, no name and no phone number');
ok(await refused(rpc(ADMIN, 'admin_sos_detail', { p_id: sos[0].id, p_reason: '' }), /reason/), 'who raised it is only shown with a reason');
const sd = await rpc(ADMIN, 'admin_sos_detail', { p_id: sos[0].id, p_reason: 'Counsellor asked us to check the alert reached them' });
ok(sd.client === 'Kwame_GH' && Array.isArray(sd.timeline) && !JSON.stringify(sd).match(/"lat"|"lng"|\+233/), 'with a reason: the person and the timeline, still no coordinates or contact numbers');
ok((await log()).some(a => a.action === 'view_sos' && a.reason.includes('Counsellor asked')), 'looking at an SOS is logged with the reason');
void inc;

// ---------- 10. Content and system ----------
const content = await rpc(ADMIN, 'admin_content');
const hot = content.hotlines[0];
ok(content.circles.length >= 4 && content.hotlines.length > 0, 'circles and helplines are listed');
ok(await refused(rpc(ADMIN, 'admin_verify_contact', { p_kind: 'hotline', p_id: hot.id, p_verified: true, p_source: '' }), /how it was checked/), 'marking a helpline checked needs to say how');
await rpc(ADMIN, 'admin_verify_contact', { p_kind: 'hotline', p_id: hot.id, p_verified: true, p_source: 'Called on 13 Nov by Admin_One' });
ok((await pg.query<any>(`select verified_at is not null v from public.emergency_hotlines where id = $1`, [hot.id])).rows[0].v, 'it really marks the helpline as checked (so the app shows it)');
await rpc(ADMIN, 'admin_set_circle_active', { p_id: content.circles[0].id, p_active: false, p_reason: 'Host on leave' });
ok((await pg.query<any>(`select active from public.village_circles where id = $1`, [content.circles[0].id])).rows[0].active === false, 'a circle can be switched off');
const sys = await rpc(ADMIN, 'admin_system');
ok(sys.cron_available === false && sys.cleanups.every((c: any) => c.scheduled === false) && sys.migrations.every((m: any) => m.present), 'system status says honestly that the clean-ups are not scheduled here');

// ---------- 11. The log itself ----------
ok(await refused(pg.query(`update public.admin_actions set reason = 'changed' where id = 1`), /append-only/), 'the admin log cannot be edited, not even by the database owner');
ok(await refused(pg.query(`delete from public.admin_actions`), /append-only/), '…or deleted');
const acts = await rpc(ADMIN, 'admin_list_actions', { p_limit: 200 });
ok(acts.total === (await log()).length && acts.rows.some((r: any) => r.action === 'suspend_account' && r.target_name === 'Akosua_R'), 'admins can read the full log, with names for the people involved');
const all = await log();
ok(all.every(a => !a.details?.excerpt || a.details.excerpt.length <= 200) && !JSON.stringify(all).match(/password|token|api[_-]?key|\+233|"lat"|"lng"/i), 'the log keeps short excerpts only: no secrets, phone numbers or locations');

console.log(`All ${n} admin database checks passed`);
process.exit(0);
