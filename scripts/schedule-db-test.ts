/**
 * Scheduling in a real PostgreSQL (PGlite) with every migration applied and Row Level Security on:
 * free times match the app's own rules, breaks and days off are respected, a time can't be booked
 * twice, services and days off are seen only by who should see them.
 *   npm run test:schedule-db
 */
import { testDatabase, asUser, callRpc, CLIENT, OTHER, THERAPIST, OTHER_THERAPIST } from './emergency-db-test';
import { freeSlots, type Weekday } from '../src/lib/schedule';

let n = 0;
const ok = (c: unknown, what: string) => {
  if (!c) throw new Error('FAIL: ' + what);
  n++;
  console.log('ok ', what);
};
const fails = async (p: Promise<unknown>, re?: RegExp) =>
  p.then(
    () => false,
    (e: any) => (re ? re.test(String(e?.message)) : true)
  );

const pg = await testDatabase();
const ALL: Weekday[] = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
// The test therapist: verified, every day 09:00–17:00, 50-minute sessions, lunch 13:00–14:00
await pg.exec(`update public.therapists set verification = 'verified', accepting_clients = true, work_days = '{Mon,Tue,Wed,Thu,Fri,Sat,Sun}',
  start_time = '09:00', end_time = '17:00', session_length = 50, break_start = '13:00', break_end = '14:00' where id = '${THERAPIST}'`);

const slots = async (who: string | null, therapist = THERAPIST, days = 4, duration: number | null = null) =>
  (await asUser<{ s: string }>(pg, who, `select s from public.therapist_free_slots($1, $2, $3) s`, [therapist, days, duration])).map(r => new Date(r.s).toISOString());

// 1. Free times = the app's rules
const hours = { days: ALL, startTime: '09:00', endTime: '17:00', sessionLength: 50, breakStart: '13:00', breakEnd: '14:00' };
const sql1 = await slots(CLIENT);
const js1 = freeSlots(hours, [], [], { days: 4 }).map(d => d.toISOString());
ok(sql1.length > 0 && JSON.stringify(sql1) === JSON.stringify(js1), `the server's free times match the app's rules exactly (${sql1.length} times)`);
ok(sql1.every(s => new Date(s).getTime() >= Date.now() + 2 * 3600000 - 60000), 'no time is offered within 2 hours of now');
ok(!sql1.some(s => { const m = new Date(s).getUTCHours() * 60 + new Date(s).getUTCMinutes(); return m < 14 * 60 && m + 50 > 13 * 60; }), 'nothing is offered during the lunch break');

// 2. A booked session removes the times it covers; whose it is isn't shown
const tomorrow = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate() + 1, 10, 0));
await pg.query(`insert into public.sessions (therapist_id, client_id, starts_at, duration_min) values ($1, $2, $3, 50)`, [THERAPIST, CLIENT, tomorrow.toISOString()]);
const sql2 = await slots(OTHER);
const js2 = freeSlots(hours, [], [{ start: tomorrow.toISOString(), durationMin: 50 }], { days: 4 }).map(d => d.toISOString());
ok(JSON.stringify(sql2) === JSON.stringify(js2) && !sql2.includes(tomorrow.toISOString()), 'a booked time is no longer offered to anyone else');

// 3. Days off
const dayAfter = new Date(tomorrow.getTime() + 86400000).toISOString().slice(0, 10);
await asUser(pg, THERAPIST, `insert into public.therapist_time_off (starts_on, ends_on, note) values ($1, $1, 'Training')`, [dayAfter]);
ok(!(await slots(OTHER)).some(s => s.startsWith(dayAfter)), 'a day off is never offered');
ok((await asUser(pg, CLIENT, `select * from public.therapist_time_off`)).length === 0, "clients can't see a therapist's days off (or why)");
ok(await fails(asUser(pg, CLIENT, `insert into public.therapist_time_off (therapist_id, starts_on, ends_on) values ($1, current_date, current_date)`, [THERAPIST])), "a client can't add days off for a therapist");
ok(await fails(asUser(pg, THERAPIST, `insert into public.therapist_time_off (starts_on, ends_on) values (current_date + 5, current_date + 2)`)), 'a day off must end after it starts');

// 4. No double-booking, whoever writes it
ok(await fails(asUser(pg, THERAPIST, `insert into public.sessions (therapist_id, client_id, starts_at, duration_min) values ($1, $2, $3, 50)`, [THERAPIST, CLIENT, new Date(tomorrow.getTime() + 20 * 60000).toISOString()]), /overlaps/), 'a session that overlaps another is refused by the database');
ok(!(await fails(asUser(pg, THERAPIST, `insert into public.sessions (therapist_id, client_id, starts_at, duration_min) values ($1, $2, $3, 50)`, [THERAPIST, CLIENT, new Date(tomorrow.getTime() + 50 * 60000).toISOString()]))), 'a session that starts as the last one ends is fine');
const moved = (await pg.query<{ id: string }>(`select id from public.sessions where therapist_id = $1 and starts_at = $2`, [THERAPIST, new Date(tomorrow.getTime() + 50 * 60000).toISOString()])).rows[0].id;
ok(await fails(asUser(pg, THERAPIST, `update public.sessions set starts_at = $1 where id = $2`, [tomorrow.toISOString(), moved]), /overlaps/), 'moving a session onto another one is refused');
await asUser(pg, THERAPIST, `update public.sessions set status = 'cancelled' where starts_at = $1 and therapist_id = $2`, [tomorrow.toISOString(), THERAPIST]);
ok(!(await fails(asUser(pg, THERAPIST, `update public.sessions set starts_at = $1 where id = $2`, [tomorrow.toISOString(), moved]))), 'a cancelled session frees its time');

// 5. Services: the therapist manages their own; clients see active ones; a request uses its length
await pg.exec(`update public.therapists set verification = 'verified' where id = '${OTHER_THERAPIST}'`);
const [svc] = await asUser<{ id: string }>(pg, THERAPIST, `insert into public.therapist_services (name, description, duration_min, fee_ghs, formats) values ('Craving support', 'One-to-one CBT for cravings', 30, 25, '{voice,video}') returning id`);
await asUser(pg, THERAPIST, `insert into public.therapist_services (name, duration_min, active) values ('Paused service', 60, false)`);
ok((await asUser(pg, CLIENT, `select name from public.therapist_services where therapist_id = $1`, [THERAPIST])).map((r: any) => r.name).join() === 'Craving support', 'clients see only active services');
ok(await fails(asUser(pg, CLIENT, `insert into public.therapist_services (therapist_id, name) values ($1, 'Fake')`, [THERAPIST])), "a client can't add a service");
await asUser(pg, OTHER_THERAPIST, `update public.therapist_services set fee_ghs = 0 where id = $1`, [svc.id]);
ok(Number((await pg.query<any>(`select fee_ghs from public.therapist_services where id = $1`, [svc.id])).rows[0].fee_ghs) === 25, "another therapist can't change someone's service");
ok(await fails(asUser(pg, THERAPIST, `insert into public.therapist_services (name, duration_min) values ('X', 500)`)), 'a service must have a sensible length and name');

const short = await slots(OTHER, THERAPIST, 2, 30);
ok(JSON.stringify(short) === JSON.stringify(freeSlots(hours, [], [{ start: tomorrow.toISOString(), durationMin: 50 }], { days: 2, durationMin: 30 }).map(d => d.toISOString())), 'free times follow the service length');

ok(await fails(asUser(pg, OTHER, `insert into public.session_requests (therapist_id, preferred_time, service_id) values ($1, now() + interval '1 day', $2)`, [OTHER_THERAPIST, svc.id]), /not offered/), "a request can't name another therapist's service");
const free = short[short.length - 1];
const [req] = await asUser<{ id: string }>(pg, OTHER, `insert into public.session_requests (therapist_id, preferred_time, service_id, format) values ($1, $2, $3, 'voice') returning id`, [THERAPIST, free, svc.id]);
const sessionId = await callRpc(pg, THERAPIST, 'accept_session_request', { p_request: req.id, p_starts_at: null });
const booked = (await pg.query<any>(`select duration_min, service_id from public.sessions where id = $1`, [sessionId])).rows[0];
ok(booked.duration_min === 30 && booked.service_id === svc.id, "accepting a request books the service's length");

// 6. Accepting a clashing time is refused and the request stays open
const [req2] = await asUser<{ id: string }>(pg, CLIENT, `insert into public.session_requests (therapist_id, preferred_time, format) values ($1, $2, 'voice') returning id`, [THERAPIST, free]);
ok(await fails(callRpc(pg, THERAPIST, 'accept_session_request', { p_request: req2.id, p_starts_at: null }), /overlaps/), 'accepting a request for a time that is already booked is refused');
ok((await pg.query<any>(`select status from public.session_requests where id = $1`, [req2.id])).rows[0].status === 'new', '…and the request stays open, so another time can be offered');

// 7. Who gets free times
await pg.exec(`update public.therapists set accepting_clients = false where id = '${OTHER_THERAPIST}'`);
ok((await slots(CLIENT, OTHER_THERAPIST)).length === 0, 'a therapist not taking new clients offers no times');
ok(await fails(asUser(pg, null, `select * from public.therapist_free_slots($1)`, [THERAPIST])), 'signed-out visitors get no times');

console.log(`All ${n} scheduling database checks passed`);
