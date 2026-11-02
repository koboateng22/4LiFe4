/**
 * Instant EMS: runs every migration in a real PostgreSQL (PGlite, in this process, nothing
 * to install or sign in to), then checks the incident functions and privacy rules as real
 * users, through the app's own client code where it can.
 *   npx tsx scripts/emergency-db-test.ts
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { __useTestClient } from '../src/lib/supabase';
import { serverBackend, IncidentController, IncidentError, type Incident } from '../src/lib/incident';

export const SUPABASE_STUB = `
  create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
  create schema auth;
  create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}', raw_app_meta_data jsonb default '{}', created_at timestamptz default now());
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub', '')::uuid $$;
  create function auth.role() returns text language sql stable as $$
    select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', 'anon') $$;
  grant usage on schema public, auth to anon, authenticated, service_role;
  grant execute on function auth.uid(), auth.role() to anon, authenticated, service_role;
  alter default privileges in schema public grant select, insert, update, delete on tables to authenticated, service_role;
  alter default privileges in schema public grant usage on sequences to authenticated, service_role;
  create publication supabase_realtime;
`;

export const THERAPIST = '11111111-1111-4111-8111-111111111111';
export const CLIENT = '22222222-2222-4222-8222-222222222222';
export const OTHER = '33333333-3333-4333-8333-333333333333';
export const OTHER_THERAPIST = '44444444-4444-4444-8444-444444444444';
export const NO_CONSENT = '55555555-5555-4555-8555-555555555555';

/** A database with all migrations applied and the test people in it. */
export async function testDatabase() {
  const pg = new PGlite();
  await pg.exec(SUPABASE_STUB);
  const dir = 'supabase/migrations';
  for (const f of readdirSync(dir).sort()) await pg.exec(readFileSync(join(dir, f), 'utf8'));
  const therapistMeta = (nick: string, licence: string) =>
    JSON.stringify({ role: 'therapist', nickname: nick, full_name: 'Ama Konadu', title: 'Dr.', profession: 'Clinical psychologist', license_body: 'GPC', license_number: licence, agreed_confidentiality: true, agreed_crisis_protocol: true, agreed_accuracy: true, specialties: ['substance'], session_length: 50, fee_ghs: 35 });
  await pg.query(`insert into auth.users (id, email, raw_user_meta_data) values
    ($1, 'ama@it.test', $2::jsonb), ($3, 'other-t@it.test', $4::jsonb),
    ($5, 'kwame@it.test', '{"nickname":"Kwame_GH"}'), ($6, 'akosua@it.test', '{"nickname":"Akosua_R"}'), ($7, 'nana@it.test', '{"nickname":"Nana_N"}')`,
    [THERAPIST, therapistMeta('dr_ama', 'IT-1'), OTHER_THERAPIST, therapistMeta('dr_two', 'IT-2'), CLIENT, OTHER, NO_CONSENT]);
  await pg.exec(`
    update public.profiles set share_location_in_crisis = true where id = '${CLIENT}';
    insert into public.care_links (client_id, therapist_id) values ('${CLIENT}', '${THERAPIST}'), ('${NO_CONSENT}', '${THERAPIST}');
    insert into public.support_contacts (id, client_id, name, phone, is_primary) values
      ('aaaaaaaa-0000-4000-8000-000000000001', '${CLIENT}', 'Sister Mary', '+233240000001', true),
      ('aaaaaaaa-0000-4000-8000-000000000002', '${OTHER}', 'Someone Else', '+233240000002', true);
  `);
  return pg;
}

/** Runs one statement as a signed-in person (or signed out), with Row Level Security on, as PostgREST does. */
export async function asUser<T = any>(pg: PGlite, uid: string | null, sql: string, params: unknown[] = []): Promise<T[]> {
  const role = uid ? 'authenticated' : 'anon';
  return pg.transaction(async tx => {
    await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: uid ?? '', role })]);
    await tx.exec(`set local role ${role}`);
    const r = await tx.query<T>(sql, params);
    return r.rows;
  }) as Promise<T[]>;
}

/** What supabase-js's rpc() does, against this database. */
export async function callRpc(pg: PGlite, uid: string | null, fn: string, args: Record<string, unknown>) {
  const names = Object.keys(args);
  const sql = `select public.${fn}(${names.map((k, i) => `${k} := $${i + 1}`).join(', ')}) as r`;
  const rows = await asUser<{ r: any }>(pg, uid, sql, names.map(k => args[k]));
  return rows[0]?.r ?? null;
}

const pgClient = (pg: PGlite, uid: string | null) => ({
  rpc: (fn: string, args: Record<string, unknown> = {}) => ({
    abortSignal: () =>
      callRpc(pg, uid, fn, args).then(
        data => ({ data, error: null, status: 200 }),
        (e: any) => ({ data: null, error: { message: e.message, code: e.code }, status: e.code === '42501' ? 403 : 400 })
      ),
  }),
});

async function main() {
  let n = 0;
  const ok = (c: unknown, w: string) => {
    if (!c) throw new Error('FAIL: ' + w);
    n++;
    console.log('ok ', w);
  };
  const refused = async (p: Promise<unknown>, w: string, pattern?: RegExp) => {
    let err: any = null;
    try {
      await p;
    } catch (e) {
      err = e;
    }
    ok(err && (!pattern || pattern.test(err.message)), `refused: ${w}${err ? '' : ' (it was allowed!)'}`);
  };

  const pg = await testDatabase();
  ok(true, 'every migration applies to an empty database, in order');
  const rid = (i: number) => `dddddddd-0000-4000-8000-${String(i).padStart(12, '0')}`;
  const open = (uid: string, r: string) => callRpc(pg, uid, 'emergency_open_incident', { p_request_id: r });
  const count = async (sql: string) => Number((await pg.query<{ c: number }>(`select count(*)::int as c from ${sql}`)).rows[0].c);

  /* ---------- Through the app's own client code ---------- */
  __useTestClient(pgClient(pg, CLIENT) as any);
  const backend = serverBackend();
  const c = new IncidentController(backend, 'dbtest', { retryDelaysMs: [5], pollMs: 100000, isOnline: () => true, shareLocation: () => true, locate: async () => ({ lat: 5.6, lng: -0.18, accuracyM: 12, at: new Date().toISOString() }) });
  c.start();
  for (let i = 0; i < 400 && (c.getView().phase !== 'active' || c.getView().incident?.location_status !== 'fresh'); i++) await new Promise(r => setTimeout(r, 5));
  let inc = c.getView().incident as Incident;
  ok(c.getView().phase === 'active' && inc.status === 'initiated', 'the app starts an incident on the real database');
  ok(inc.notifications.length === 1 && inc.notifications[0].channel === 'counsellor_in_app' && inc.notifications[0].status === 'recorded' && /Ama Konadu/.test(inc.notifications[0].recipient_name || ''), 'the linked counsellor is named, as "recorded", not as told');
  ok(inc.location_status === 'fresh' && inc.accuracy_m === 12 && inc.location_shared, 'the location is attached with accuracy');
  ok(!('lat' in inc) && !JSON.stringify(inc).includes('5.6'), 'the incident itself holds no coordinates');
  const sos = (await pg.query<any>(`select lat, source, located_at from public.sos_events where client_id='${CLIENT}' order by created_at, source`)).rows;
  ok(sos.length === 2 && sos.some(e => e.source === 'sos' && e.lat === null) && sos.some(e => e.source === 'requested' && e.lat === 5.6 && e.located_at), 'the counsellor gets the alert, then the location, through the existing SOS records');
  const risk = (await pg.query<any>(`select risk from public.care_links where client_id='${CLIENT}'`)).rows[0].risk;
  ok(risk === 'high', 'the alert raises the counsellor’s risk level, as before');
  ok((await count(`public.escalations where client_id='${CLIENT}' and action like '%no location received yet%'`)) === 1, 'the counsellor’s record uses true words');

  /* ---------- Duplicates ---------- */
  const sameAgain = await open(CLIENT, inc.client_request_id);
  ok(sameAgain.id === inc.id && (await count(`public.emergency_incidents where client_id='${CLIENT}'`)) === 1, 'a retry with the same request id returns the same incident');
  const secondPhone = await open(CLIENT, rid(1));
  ok(secondPhone.id === inc.id && (await count(`public.emergency_incidents where client_id='${CLIENT}'`)) === 1 && (await count(`public.sos_events where client_id='${CLIENT}' and source='sos'`)) === 1, 'a second phone joins the open incident, with no second alert');
  const both = await Promise.all([open(OTHER, rid(2)), open(OTHER, rid(3))]);
  ok(both[0].id === both[1].id && (await count(`public.emergency_incidents where client_id='${OTHER}'`)) === 1, 'two presses at the same moment make one incident');
  ok(both[0].notifications.length === 0, 'no linked counsellor: no one is listed as alerted');

  /* ---------- Who can see what ---------- */
  ok((await asUser(pg, OTHER, `select * from public.emergency_incidents where id=$1`, [inc.id])).length === 0, 'another person cannot read the incident');
  ok((await asUser(pg, OTHER, `select * from public.emergency_incident_events where incident_id=$1`, [inc.id])).length === 0, 'or its history');
  ok((await asUser(pg, OTHER, `select * from public.emergency_notifications where incident_id=$1`, [inc.id])).length === 0, 'or who was alerted');
  ok((await asUser(pg, OTHER, `select * from public.sos_events where client_id=$1`, [CLIENT])).length === 0, 'or the location');
  ok((await callRpc(pg, OTHER, 'emergency_get', { p_incident: inc.id })) === null, 'emergency_get returns nothing for someone else’s incident');
  ok((await callRpc(pg, OTHER, 'emergency_by_request', { p_request_id: inc.client_request_id })) === null, 'nor does looking it up by request id');
  ok((await asUser(pg, OTHER_THERAPIST, `select * from public.emergency_incidents where id=$1`, [inc.id])).length === 0, 'an unlinked counsellor cannot read it');
  ok((await asUser(pg, OTHER_THERAPIST, `select * from public.sos_events where client_id=$1`, [CLIENT])).length === 0, 'or the location');
  ok((await asUser(pg, THERAPIST, `select * from public.emergency_incidents where id=$1`, [inc.id])).length === 1, 'the linked counsellor can read it');
  ok((await asUser(pg, THERAPIST, `select * from public.emergency_incident_events where incident_id=$1`, [inc.id])).length === 0, 'but not the history of what the client did on their phone');
  await refused(asUser(pg, null, `select * from public.emergency_incidents`), 'signed out: no table access', /permission denied/);
  await refused(callRpc(pg, null, 'emergency_open_incident', { p_request_id: rid(4) }), 'signed out or expired session: cannot start an incident', /permission denied/);
  await refused(callRpc(pg, null, 'emergency_active', {}), 'signed out: cannot read status', /permission denied/);

  /* ---------- No forging or direct writes ---------- */
  await refused(asUser(pg, OTHER, `insert into public.emergency_incidents (client_id, client_request_id) values ($1, $2)`, [CLIENT, rid(5)]), 'inserting an incident for someone else', /permission denied/);
  await refused(asUser(pg, CLIENT, `insert into public.emergency_incidents (client_id, client_request_id) values ($1, $2)`, [CLIENT, rid(6)]), 'inserting directly, even for yourself', /permission denied/);
  await refused(asUser(pg, CLIENT, `update public.emergency_incidents set status='acknowledged' where id=$1`, [inc.id]), 'a client faking "acknowledged"', /permission denied/);
  await refused(asUser(pg, THERAPIST, `update public.emergency_incidents set status='resolved' where id=$1`, [inc.id]), 'a direct update by a counsellor', /permission denied/);
  await refused(asUser(pg, CLIENT, `delete from public.emergency_incident_events`), 'deleting history', /permission denied/);
  await refused(asUser(pg, CLIENT, `insert into public.emergency_notifications (incident_id, channel, recipient_key, status) values ($1,'counsellor_in_app','x','acknowledged')`, [inc.id]), 'writing a fake acknowledgement row', /permission denied/);
  await refused(callRpc(pg, CLIENT, 'emergency_view', { p_id: inc.id }), 'calling internal functions', /permission denied/);
  await refused(callRpc(pg, OTHER, 'emergency_record_action', { p_incident: inc.id, p_channel: 'sms_handoff', p_recipient: 'unlinked', p_action: 'opened' }), 'recording on someone else’s incident', /emergency_not_found/);
  await refused(callRpc(pg, OTHER, 'emergency_attach_location', { p_incident: inc.id, p_status: 'denied' }), 'changing someone else’s location status', /emergency_not_found/);
  await refused(callRpc(pg, OTHER, 'emergency_close', { p_incident: inc.id, p_outcome: 'cancelled' }), 'closing someone else’s incident', /emergency_not_found/);
  await refused(callRpc(pg, OTHER_THERAPIST, 'emergency_acknowledge', { p_incident: inc.id }), 'an unlinked counsellor acknowledging', /emergency_not_found/);
  await refused(callRpc(pg, OTHER, 'emergency_acknowledge', { p_incident: both[0].id }), 'a client acknowledging their own alert', /emergency_not_found/);
  await refused(callRpc(pg, THERAPIST, 'emergency_close', { p_incident: inc.id, p_outcome: 'cancelled' }), 'a counsellor marking it a mistake', /emergency_not_found/);

  /* ---------- Checks on what comes in ---------- */
  const attach = (args: Record<string, unknown>, uid = CLIENT, id = inc.id) => callRpc(pg, uid, 'emergency_attach_location', { p_incident: id, ...args });
  await refused(attach({ p_status: 'fresh', p_lat: 95, p_lng: 0, p_accuracy_m: 5, p_located_at: new Date().toISOString() }), 'an impossible latitude', /bad_location/);
  await refused(attach({ p_status: 'fresh', p_lat: 5, p_accuracy_m: 5, p_located_at: new Date().toISOString() }), 'a latitude without a longitude', /bad_location/);
  await refused(attach({ p_status: 'fresh', p_lat: 5, p_lng: 0, p_accuracy_m: 5, p_located_at: new Date(Date.now() - 3600_000).toISOString() }), 'an hour-old position passed off as current', /bad_location/);
  await refused(attach({ p_status: 'fresh', p_lat: 5, p_lng: 0, p_accuracy_m: 5, p_located_at: new Date(Date.now() + 3600_000).toISOString() }), 'a position from the future', /bad_location/);
  await refused(attach({ p_status: 'made_up' }), 'an unknown location status', /bad_request/);
  await refused(attach({ p_status: 'manual' }), 'a landmark with no words', /bad_location/);
  await refused(attach({ p_status: 'manual', p_note: 'x'.repeat(121) }), 'a landmark that is too long', /bad_request/);
  const after = await attach({ p_status: 'denied' });
  ok(after.location_status === 'fresh', 'a later failure does not hide a location already found');
  const rec = (args: Record<string, unknown>, uid = CLIENT) => callRpc(pg, uid, 'emergency_record_action', { p_incident: inc.id, ...args });
  await refused(rec({ p_channel: 'emergency_call_handoff', p_recipient: '999', p_action: 'opened' }), 'an emergency number that isn’t on the list', /bad_request/);
  await refused(rec({ p_channel: 'emergency_call_handoff', p_recipient: '112', p_action: 'reported_sent' }), 'claiming a call was delivered', /bad_request/);
  await refused(rec({ p_channel: 'sms_handoff', p_recipient: 'aaaaaaaa-0000-4000-8000-000000000002', p_action: 'opened' }), 'someone else’s support person', /not_found/);
  await refused(rec({ p_channel: 'sms_handoff', p_recipient: 'not-a-uuid', p_action: 'opened' }), 'a malformed support person', /bad_request/);
  await refused(rec({ p_channel: 'ems_dispatch', p_recipient: '112', p_action: 'opened' }), 'a dispatch channel: there isn’t one', /bad_request/);
  await refused(callRpc(pg, CLIENT, 'emergency_close', { p_incident: inc.id, p_outcome: 'dispatched' }), 'closing with a made-up outcome', /bad_request/);

  /* ---------- State moves ---------- */
  const contact = 'aaaaaaaa-0000-4000-8000-000000000001';
  let v = await rec({ p_channel: 'sms_handoff', p_recipient: contact, p_action: 'opened' });
  ok(v.status === 'initiated', 'opening the messaging app does not count as notified');
  ok(!JSON.stringify(v.notifications).includes('Sister Mary') && !JSON.stringify(v.notifications).includes('+233'), 'notifications hold references, not names or numbers');
  v = await rec({ p_channel: 'emergency_call_handoff', p_recipient: '112', p_action: 'opened' });
  ok(v.status === 'initiated', 'opening the phone to call 112 does not change the status');
  v = await rec({ p_channel: 'sms_handoff', p_recipient: contact, p_action: 'reported_sent' });
  ok(v.status === 'contact_notified', 'the person saying they sent it moves to contact_notified');
  v = await rec({ p_channel: 'sms_handoff', p_recipient: contact, p_action: 'opened' });
  ok(v.notifications.find((x: any) => x.recipient_key === contact).status === 'reported_sent' && (await count(`public.emergency_notifications where incident_id='${inc.id}' and channel='sms_handoff'`)) === 1, 'repeating an action makes no second row and no step back');
  ok((await asUser(pg, THERAPIST, `select * from public.emergency_notifications where incident_id=$1`, [inc.id])).length === 1, 'the counsellor sees only their own alert row, not which support people were contacted');

  await callRpc(pg, THERAPIST, 'emergency_acknowledge', { p_incident: inc.id });
  await callRpc(pg, THERAPIST, 'emergency_acknowledge', { p_incident: inc.id });
  v = await callRpc(pg, CLIENT, 'emergency_get', { p_incident: inc.id });
  const ack = v.notifications.find((x: any) => x.channel === 'counsellor_in_app');
  ok(v.status === 'acknowledged' && ack.status === 'acknowledged' && ack.acknowledged_at, 'the counsellor’s acknowledgement reaches the client');
  ok((await count(`public.escalations where client_id='${CLIENT}' and action like 'Told the client%'`)) === 1, 'acknowledging twice is recorded once');
  v = await rec({ p_channel: 'whatsapp_handoff', p_recipient: contact, p_action: 'reported_sent' });
  ok(v.status === 'acknowledged', 'a later report does not move the status backwards');
  await refused(pg.exec(`update public.emergency_incidents set status='initiated' where id='${inc.id}'`), 'even the database owner cannot move a status backwards', /bad_transition/);
  await refused(pg.exec(`update public.emergency_incidents set client_id='${OTHER}' where id='${inc.id}'`), 'moving an incident to another person', /cannot be moved/);

  v = await callRpc(pg, CLIENT, 'emergency_close', { p_incident: inc.id, p_outcome: 'resolved' });
  ok(v.status === 'resolved' && v.closed_at, 'the person can resolve it');
  const hist = (await pg.query<any>(`select from_status, to_status from public.emergency_incident_events where incident_id='${inc.id}' and kind='status' order by id`)).rows;
  ok(JSON.stringify(hist.map(h => h.to_status)) === JSON.stringify(['initiated', 'contact_notified', 'acknowledged', 'resolved']), 'the full history is kept');
  const closedAgain = await callRpc(pg, CLIENT, 'emergency_close', { p_incident: inc.id, p_outcome: 'cancelled' });
  ok(closedAgain.status === 'resolved', 'closing twice keeps the first outcome');
  ok((await count(`public.audit_log where table_name='emergency_incidents'`)) > 0, 'changes reach the audit log');
  const eventColumns = (await pg.query<any>(`select detail from (select to_jsonb(e) as detail from public.emergency_incident_events e) x`)).rows.map(r => JSON.stringify(r.detail)).join();
  ok(!/5\.6|Adum|\+233/.test(eventColumns), 'history has no coordinates or personal details');

  // A new alert can start after closing, and the counsellor can resolve theirs
  const newOne = await open(CLIENT, rid(7));
  ok(newOne.id !== inc.id && newOne.status === 'initiated', 'a new alert can start after the last one closed');
  const stillOwner = await callRpc(pg, THERAPIST, 'emergency_close', { p_incident: newOne.id, p_outcome: 'resolved' });
  ok(stillOwner === null, 'a counsellor can resolve, and is not sent the client’s details back');
  ok((await callRpc(pg, CLIENT, 'emergency_active', {})) === null, 'and the client sees it closed');
  await refused(callRpc(pg, CLIENT, 'emergency_record_action', { p_incident: 'ffffffff-0000-4000-8000-000000000000', p_channel: 'sms_handoff', p_recipient: 'unlinked', p_action: 'opened' }), 'an incident that doesn’t exist', /not_found/);

  /* ---------- Consent ---------- */
  const nc = await open(NO_CONSENT, rid(8));
  ok(nc.notifications.length === 1, 'without location consent the counsellor is still alerted');
  const ncV = await attach({ p_status: 'fresh', p_lat: 6.1, p_lng: -1.2, p_accuracy_m: 9, p_located_at: new Date().toISOString() }, NO_CONSENT, nc.id);
  ok(!ncV.location_shared && (await count(`public.sos_events where client_id='${NO_CONSENT}' and lat is not null`)) === 0, 'without consent, coordinates sent anyway are not kept');
  ok((await asUser(pg, THERAPIST, `select * from public.sos_events where client_id=$1 and lat is not null`, [NO_CONSENT])).length === 0, 'and the counsellor sees none');
  const ncM = await attach({ p_status: 'manual', p_note: 'At Adum junction' }, NO_CONSENT, nc.id);
  ok(ncM.location_status === 'manual' && !ncM.location_shared && (await count(`public.escalations where client_id='${NO_CONSENT}' and note='At Adum junction'`)) === 0, 'and a typed landmark does not reach the counsellor');
  const yes = await open(CLIENT, rid(9));
  await attach({ p_status: 'manual', p_note: 'At Adum junction' }, CLIENT, yes.id);
  ok((await asUser(pg, THERAPIST, `select * from public.escalations where client_id=$1 and note='At Adum junction'`, [CLIENT])).length === 1, 'with consent, a typed landmark reaches the counsellor');
  await callRpc(pg, CLIENT, 'emergency_close', { p_incident: yes.id, p_outcome: 'cancelled' });
  ok((await count(`public.escalations where client_id='${CLIENT}' and action like 'Client cancelled%'`)) === 1, 'the counsellor sees a cancel');
  await callRpc(pg, NO_CONSENT, 'emergency_close', { p_incident: nc.id, p_outcome: 'cancelled' });

  /* ---------- A discharged counsellor ---------- */
  await pg.exec(`update public.care_links set status='discharged' where client_id='${NO_CONSENT}'`);
  const afterDischarge = await open(NO_CONSENT, rid(10));
  ok(afterDischarge.notifications.length === 0, 'a discharged counsellor is not alerted');
  ok((await asUser(pg, THERAPIST, `select * from public.emergency_incidents where id=$1`, [afterDischarge.id])).length === 0, 'and cannot read the new incident');
  await refused(callRpc(pg, THERAPIST, 'emergency_acknowledge', { p_incident: afterDischarge.id }), 'or acknowledge it', /not_found/);
  await callRpc(pg, NO_CONSENT, 'emergency_close', { p_incident: afterDischarge.id, p_outcome: 'cancelled' });

  /* ---------- Rate limit ---------- */
  const limit = OTHER;
  await callRpc(pg, limit, 'emergency_close', { p_incident: both[0].id, p_outcome: 'cancelled' });
  for (let i = 0; i < 5; i++) {
    const r = await open(limit, rid(20 + i));
    await callRpc(pg, limit, 'emergency_close', { p_incident: r.id, p_outcome: 'cancelled' });
  }
  __useTestClient(pgClient(pg, limit) as any);
  let kind = '';
  try {
    await serverBackend().open(rid(30));
  } catch (e) {
    kind = (e as InstanceType<typeof IncidentError>).kind;
  }
  ok(kind === 'rate_limited', 'a seventh alert within the hour is refused, and the app can tell why');
  const replay = await open(limit, rid(24));
  ok(replay.status === 'cancelled', 'looking up an old request still works when limited');

  /* ---------- Retention ---------- */
  const stale = await open(CLIENT, rid(40));
  await pg.exec(`alter table public.emergency_incidents disable trigger emergency_incidents_guard;
    update public.emergency_incidents set created_at = now() - interval '25 hours' where id='${stale.id}';
    alter table public.emergency_incidents enable trigger emergency_incidents_guard;`);
  ok((await callRpc(pg, CLIENT, 'emergency_active', {})) === null, 'an alert left open for a day no longer shows as active');
  const fresh = await open(CLIENT, rid(41));
  ok(fresh.id !== stale.id, 'and does not swallow a new emergency');
  ok((await pg.query<any>(`select status from public.emergency_incidents where id='${stale.id}'`)).rows[0].status === 'expired', 'it is marked expired');
  await pg.exec(`alter table public.emergency_incidents disable trigger emergency_incidents_guard;
    update public.emergency_incidents set closed_at = now() - interval '91 days' where id='${stale.id}';
    alter table public.emergency_incidents enable trigger emergency_incidents_guard;`);
  const purged = (await pg.query<any>(`select public.purge_expired_incidents() as n`)).rows[0].n;
  ok(purged === 1 && (await count(`public.emergency_notifications where incident_id='${stale.id}'`)) === 0 && (await count(`public.emergency_incident_events where incident_id='${stale.id}'`)) === 0, 'purge removes old incidents with their history, and keeps open ones');
  await refused(callRpc(pg, CLIENT, 'purge_expired_incidents', {}), 'the purge can’t be called from the app', /permission denied/);
  const ex = (await asUser<any>(pg, CLIENT, `select public.export_my_data() as d`))[0].d;
  ok(ex.emergency_incidents.length > 0 && ex.sos_events.length > 0 && ex.village_posts, 'a person’s data export includes their incidents');
  // OTHER has incidents and no counsellor. (An account with counsellor escalations can't be deleted
  // at all today, because escalations are append-only: see "Decisions" in EMERGENCY.md.)
  ok((await count(`public.emergency_incidents where client_id='${OTHER}'`)) > 0, 'before deleting');
  await pg.exec(`delete from auth.users where id='${OTHER}'`);
  ok((await count(`public.emergency_incidents where client_id='${OTHER}'`)) === 0, 'deleting the account removes their incidents');

  c.stop();
  console.log(`\nAll ${n} emergency database checks passed`);
  await pg.close();
}

if (process.argv[1]?.endsWith('emergency-db-test.ts')) await main();
