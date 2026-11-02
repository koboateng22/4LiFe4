/**
 * Instant EMS: the alert workflow, with a fake server, so every kind of failure can
 * be forced. No network, database or real messages.
 *   npx tsx scripts/emergency-unit-test.ts
 */
import { readFileSync } from 'node:fs';
const mem = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (k: string) => (mem.has(k) ? mem.get(k)! : null),
  setItem: (k: string, v: string) => void mem.set(k, String(v)),
  removeItem: (k: string) => void mem.delete(k),
};
const { canMove, classifyRpcError, deviceBackend, IncidentController, IncidentError, isFreshFix, locationProblem, TRANSITIONS } = await import('../src/lib/incident');
const { statusText } = await import('../src/components/ems/EmergencyPanel');
const { locationMessage } = await import('../src/lib/ems');
const { getCrisisLocation } = await import('../src/lib/location');
type Incident = import('../src/lib/incident').Incident;
type LocationReport = import('../src/lib/incident').LocationReport;

let n = 0;
const ok = (c: unknown, w: string) => {
  if (!c) throw new Error('FAIL: ' + w);
  n++;
  console.log('ok ', w);
};
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const until = async (f: () => unknown, w: string) => {
  for (let i = 0; i < 200; i++) {
    if (f()) return;
    await sleep(5);
  }
  throw new Error('TIMED OUT waiting for: ' + w);
};

/** A pretend server. Set `failNext` to choose how the next calls go wrong. */
function fakeServer() {
  const s = {
    mode: 'server' as const,
    rows: new Map<string, Incident>(),
    opens: [] as string[],
    locations: [] as LocationReport[],
    /** 'after' = the work is saved, then the answer is lost. 'before' = never arrived. */
    failNext: [] as Array<'after' | 'before' | 'auth' | 'rate_limited' | 'rejected'>,
    failAll: false,
    apply(fn: string) {
      if (s.failAll) throw new IncidentError('uncertain');
      const f = s.failNext.shift();
      if (f === 'before') throw new IncidentError('uncertain');
      if (f === 'auth' || f === 'rate_limited' || f === 'rejected') throw new IncidentError(f);
      return f === 'after';
    },
    make(req: string): Incident {
      const now = new Date().toISOString();
      return { id: 'i-' + req, client_request_id: req, status: 'initiated', location_status: 'pending', location_shared: false, created_at: now, updated_at: now, notifications: [] };
    },
    async open(req: string) {
      s.opens.push(req);
      const lose = s.apply('open');
      if (!s.rows.has(req)) s.rows.set(req, s.make(req));
      if (lose) throw new IncidentError('uncertain');
      return s.rows.get(req)!;
    },
    async byRequest(req: string) {
      s.apply('byRequest');
      return s.rows.get(req) ?? null;
    },
    async active() {
      s.apply('active');
      return [...s.rows.values()].find(r => ['initiated', 'contact_notified', 'acknowledged'].includes(r.status)) ?? null;
    },
    async get(id: string) {
      s.apply('get');
      return [...s.rows.values()].find(r => r.id === id) ?? null;
    },
    async attachLocation(id: string, report: LocationReport) {
      s.apply('attach');
      s.locations.push(report);
      const r = [...s.rows.values()].find(x => x.id === id)!;
      r.location_status = report.status;
      return r;
    },
    async record(id: string, channel: any, recipient: string, action: any) {
      s.apply('record');
      const r = [...s.rows.values()].find(x => x.id === id)!;
      r.notifications = [...r.notifications.filter(x => x.recipient_key !== recipient), { channel, recipient_key: recipient, status: action, updated_at: new Date().toISOString() }];
      if (action === 'reported_sent' && r.status === 'initiated') r.status = 'contact_notified';
      return r;
    },
    async close(id: string, outcome: any) {
      s.apply('close');
      const r = [...s.rows.values()].find(x => x.id === id)!;
      r.status = outcome;
      r.closed_at = new Date().toISOString();
      return r;
    },
  };
  return s;
}

const FIX = () => ({ lat: 5.6, lng: -0.18, accuracyM: 12, at: new Date().toISOString() });
const QUICK = { retryDelaysMs: [5], pollMs: 100000, isOnline: () => true };
let key = 0;
const fresh = (server: ReturnType<typeof fakeServer>, opts: any = {}) => {
  const c = new IncidentController(server as any, 'u' + ++key, { ...QUICK, locate: async () => FIX(), shareLocation: () => true, ...opts });
  return c;
};

/* ---------- The state machine ---------- */
{
  ok(!Object.keys(TRANSITIONS).some(s => /dispatch|ems|ambulance/i.test(s)), 'no status can claim emergency services were reached');
  ok(!canMove('resolved', 'initiated') && !canMove('cancelled', 'acknowledged') && !canMove('acknowledged', 'contact_notified'), 'closed incidents stay closed and status never goes backwards');
  ok(canMove('initiated', 'acknowledged') && canMove('contact_notified', 'resolved'), 'allowed moves');
  // The app's table and the database trigger must say the same thing
  const sql = readFileSync('supabase/migrations/20261102000007_emergency_incidents.sql', 'utf8');
  for (const [from, tos] of Object.entries(TRANSITIONS)) {
    if (!tos.length) continue;
    const m = sql.match(new RegExp(`old\\.status = '${from}'\\s+and new\\.status in \\(([^)]*)\\)`));
    const dbTos = m?.[1].split(',').map(x => x.trim().replace(/'/g, '')).sort();
    ok(JSON.stringify(dbTos) === JSON.stringify([...tos].sort()), `transitions from ${from} match the database`);
  }
}

/* ---------- Which errors leave us unsure ---------- */
{
  ok(classifyRpcError(undefined, { message: 'TypeError: Failed to fetch' }) === 'uncertain', 'a dropped connection is "unsure", not "failed"');
  ok(classifyRpcError(0, { message: 'AbortError' }) === 'uncertain', 'a timeout is "unsure"');
  ok(classifyRpcError(503, { message: 'db down' }) === 'uncertain', 'a server error is "unsure"');
  ok(classifyRpcError(401, { message: 'JWT expired' }) === 'auth', 'an expired session is a sign-in problem');
  ok(classifyRpcError(400, { message: 'emergency_rate_limited' }) === 'rate_limited', 'rate limit');
  ok(classifyRpcError(400, { message: 'emergency_bad_request' }) === 'rejected', 'a refused request');
}

/* ---------- Starting an alert ---------- */
{
  const s = fakeServer();
  const c = fresh(s);
  ok(c.getView().phase === 'idle', 'starts idle');
  c.start();
  c.start();
  ok(c.getView().phase === 'submitting', 'pressing shows "saving", not "sent"');
  await until(() => c.getView().phase === 'active', 'active');
  c.start();
  ok(s.rows.size === 1 && s.opens.length === 1, 'pressing three times makes one incident');
  ok(statusText(c.getView()).title.startsWith('Alert saved'), 'the screen says saved');
  await until(() => s.locations.length === 1, 'location sent');
  ok(s.locations[0].status === 'fresh' && s.locations[0].fix!.lat === 5.6, 'the location follows the alert');
  c.stop();
}

/* ---------- Lost answers ---------- */
{
  const s = fakeServer();
  s.failNext = ['after'];
  const c = fresh(s);
  c.start();
  await until(() => c.getView().phase === 'unknown', 'unknown');
  ok(statusText(c.getView()).title === 'Not sure yet if your alert was saved', 'a lost answer is shown as unsure, not failed or sent');
  await until(() => c.getView().phase === 'active', 'recovered');
  ok(s.rows.size === 1 && s.opens.length === 1, 'saved but the answer was lost: found by asking, not sent twice');
  c.stop();
}
{
  const s = fakeServer();
  s.failNext = ['before', 'before', 'before'];
  const c = fresh(s);
  c.start();
  await until(() => c.getView().phase === 'active', 'recovered');
  ok(new Set(s.opens).size === 1 && s.rows.size === 1, 'never arrived: every retry uses the same request id');
  c.stop();
}

/* ---------- Refusals ---------- */
for (const [kind, words] of [['auth', 'sign in'], ['rate_limited', 'Too many'], ['rejected', 'No one was told']] as const) {
  const s = fakeServer();
  s.failNext = [kind];
  const c = fresh(s);
  c.start();
  await until(() => c.getView().phase === 'failed', 'failed');
  await sleep(20);
  ok(s.opens.length === 1 && statusText(c.getView()).detail.includes(words), `${kind}: says it was not saved, and doesn't retry`);
  c.reset();
  ok(c.getView().phase === 'idle', `${kind}: can start again`);
  c.stop();
}

/* ---------- Offline and refresh ---------- */
{
  const s = fakeServer();
  let on = false;
  const store = new Map<string, string>();
  const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) };
  const c = new IncidentController(s as any, 'off', { ...QUICK, isOnline: () => on, storage });
  c.start();
  await until(() => c.getView().phase === 'offline', 'offline');
  ok(s.opens.length === 0 && /not saved yet/.test(statusText(c.getView()).title), 'offline: says it is not saved yet');
  c.stop();

  // The page is refreshed while still offline, then the connection comes back
  const c2 = new IncidentController(s as any, 'off', { ...QUICK, isOnline: () => on, storage });
  await c2.resume();
  ok(c2.getView().phase === 'offline', 'a refresh keeps the waiting alert');
  on = true;
  c2.online();
  await until(() => c2.getView().phase === 'active', 'sent after reconnecting');
  ok(s.rows.size === 1, 'sent once when back online');

  // Another refresh finds the same incident on the server
  const c3 = new IncidentController(s as any, 'off', { ...QUICK, isOnline: () => on, storage });
  await c3.resume();
  ok(c3.getView().phase === 'active' && c3.getView().incident?.id === c2.getView().incident?.id && s.rows.size === 1, 'a refresh shows the true status from the server');
  ok(c3.getView().location.state !== 'idle', 'a refresh looks for the location again');
  c2.stop();
  c3.stop();
}
{
  // Pressed, and the page closed before an answer. Hours later it is not sent.
  const s = fakeServer();
  let t = 1000;
  const store = new Map<string, string>();
  const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) };
  const off = new IncidentController(s as any, 'old', { ...QUICK, isOnline: () => false, storage, now: () => t, pendingMaxAgeMs: 60000 });
  off.start();
  await until(() => off.getView().phase === 'offline', 'offline');
  off.stop();
  t += 3 * 3600_000;
  const later = new IncidentController(s as any, 'old', { ...QUICK, storage, now: () => t, pendingMaxAgeMs: 60000 });
  await later.resume();
  ok(later.getView().phase === 'failed' && later.getView().failure === 'too_old' && s.opens.length === 0, 'an old unsent alert is not raised hours later, and the person is told');
  later.stop();
}

/* ---------- Location ---------- */
for (const [code, problem] of [[1, 'denied'], [2, 'unavailable'], [3, 'timeout']] as const) {
  const s = fakeServer();
  const c = fresh(s, { locate: () => Promise.reject({ code }) });
  c.start();
  await until(() => c.getView().phase === 'active' && s.locations.length === 1, 'reported');
  const loc = c.getView().location;
  ok(loc.state === 'problem' && loc.problem === problem && s.locations[0].status === problem, `${problem}: the alert still goes, and the problem is recorded`);
  c.stop();
}
{
  ok(locationProblem(new Error('unsupported')) === 'unsupported', 'no location support');
  // A position that never comes doesn't hold up anything
  const s = fakeServer();
  const c = fresh(s, { locate: () => new Promise(() => {}) });
  c.start();
  await until(() => c.getView().phase === 'active', 'active');
  ok(c.getView().location.state === 'finding', 'a slow location does not hold up the alert');
  c.setManualLocation('  Near Adum junction  ');
  await until(() => s.locations.length === 1, 'manual');
  ok(s.locations[0].status === 'manual' && s.locations[0].note === 'Near Adum junction', 'a landmark can be typed');
  c.stop();
}
{
  // Consent off: no coordinates and no landmark leave the phone
  const s = fakeServer();
  const c = fresh(s, { shareLocation: () => false });
  c.start();
  await until(() => s.locations.length === 1, 'sent');
  ok(s.locations[0].status === 'fresh' && s.locations[0].fix!.lat === null && s.locations[0].fix!.lng === null, 'no consent: coordinates stay on the phone');
  c.setManualLocation('Secret place');
  await until(() => s.locations.length === 2, 'sent');
  ok(s.locations[1].status === 'manual' && !s.locations[1].note, 'no consent: a typed landmark stays on the phone');
  c.stop();
}
{
  ok(isFreshFix({ at: new Date().toISOString() }) && !isFreshFix({ at: new Date(Date.now() - 3 * 60000).toISOString() }) && !isFreshFix(null), 'old positions are not "fresh"');
  const at = new Date(2026, 10, 2, 10, 42).toISOString();
  const msg = locationMessage('Kofi', { lat: 5.6, lng: -0.18, accuracyM: 12, at });
  ok(/12 m at 10:42|12 m at 10.42/i.test(msg), 'the message says when the position was taken');
  ok(/couldn't share my exact location/.test(locationMessage('Kofi', null)), 'no position: the message says so');

  // No guess in place of a real position
  // Newer Node versions have a read-only navigator, so it is swapped this way
  const realNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  const setNavigator = (value: unknown) => Object.defineProperty(globalThis, 'navigator', { value, configurable: true });
  setNavigator({ geolocation: { getCurrentPosition: (_ok: any, no: any) => no({ code: 1 }) } });
  const crisis = await getCrisisLocation({ shareLocationInCrisis: true, region: 'Ashanti' } as any);
  ok(crisis === undefined, 'no region-centre guess when the phone cannot locate');
  const oldStamp = Date.now() - 25000;
  setNavigator({ geolocation: { getCurrentPosition: (yes: any) => yes({ timestamp: oldStamp, coords: { latitude: 1, longitude: 2, accuracy: 3 } }) } });
  const real = await getCrisisLocation({ shareLocationInCrisis: true, region: 'Ashanti' } as any);
  ok(real?.at === new Date(oldStamp).toISOString() && real.accuracyM === 3, 'the true time and accuracy are kept');
  if (realNavigator) Object.defineProperty(globalThis, 'navigator', realNavigator);
  else delete (globalThis as any).navigator;
}

/* ---------- After it is saved ---------- */
{
  const s = fakeServer();
  const c = fresh(s);
  c.start();
  await until(() => c.getView().phase === 'active' && s.locations.length === 1, 'active');

  // Partial success: the incident is saved, a report can't reach the server
  s.failAll = true;
  c.record('sms_handoff', 'unlinked', 'opened');
  ok(c.getView().incident!.notifications[0].status === 'opened', 'opening the messaging app is shown straight away');
  await until(() => c.getView().stale, 'stale');
  ok(c.getView().phase === 'active' && !s.rows.values().next().value!.notifications.length, 'the record is not lost or claimed: still waiting to send');
  await c.close('resolved');
  ok(c.getView().closeFailed && c.getView().phase === 'active', 'a close that fails says so and stays open');

  s.failAll = false;
  await c.refresh();
  ok(!c.getView().stale && s.rows.values().next().value!.notifications[0].status === 'opened', 'it is sent once the server is back');

  c.record('sms_handoff', 'unlinked', 'reported_sent');
  await until(() => c.getView().incident!.status === 'contact_notified', 'told');
  ok(/You said you sent/.test(statusText(c.getView()).detail), 'a reported message is shown as the person’s word, not as delivered');

  // The counsellor presses "I've seen this"; the next check shows it
  const row = s.rows.values().next().value!;
  row.status = 'acknowledged';
  await c.refresh();
  const text = statusText(c.getView());
  ok(text.title === 'Your counsellor has seen your alert' && /isn’t an ambulance/.test(text.detail), 'acknowledged only says what happened');

  await c.close('cancelled');
  ok(c.getView().phase === 'closed' && /cancelled/.test(statusText(c.getView()).title), 'cancelled');
  await c.refresh();
  ok(c.getView().phase === 'closed', 'closed stays closed');
  c.stop();
}
{
  // Closed from the counsellor's side
  const s = fakeServer();
  const c = fresh(s);
  c.start();
  await until(() => c.getView().phase === 'active', 'active');
  s.rows.values().next().value!.status = 'resolved';
  await c.refresh();
  ok(c.getView().phase === 'closed', 'closing on the other side reaches this phone');
  c.stop();
}

/* ---------- No account: this phone only ---------- */
{
  const d = deviceBackend('t_device');
  const c = new IncidentController(d, 'guest', { ...QUICK, locate: async () => FIX() });
  c.start();
  await until(() => c.getView().phase === 'active', 'active');
  const text = statusText(c.getView());
  ok(/on this phone only/.test(text.title) && /has not told anyone/.test(text.detail), 'without an account the screen says no one was told');
  c.record('sms_handoff', 'unlinked', 'opened');
  await until(() => c.getView().incident!.notifications.length === 1, 'recorded');
  ok(c.getView().incident!.status === 'initiated', 'opening the messaging app is not "contact notified"');
  c.record('sms_handoff', 'unlinked', 'reported_sent');
  c.record('sms_handoff', 'unlinked', 'opened');
  await until(() => c.getView().incident!.status === 'contact_notified', 'told');
  await sleep(10);
  ok(c.getView().incident!.notifications[0].status === 'reported_sent', '"I sent it" is not undone by opening the app again');

  const again = new IncidentController(d, 'guest', { ...QUICK });
  await again.resume();
  ok(again.getView().phase === 'active' && again.getView().incident?.id === c.getView().incident?.id, 'a refresh keeps the alert');
  await again.close('resolved');
  ok(again.getView().phase === 'closed' && !(await d.active()), 'can be closed');
  c.stop();
  again.stop();
}

/* ---------- What the screens must never say ---------- */
{
  const src = ['src/components/ems/EmergencyPanel.tsx', 'src/components/modals/SosModal.tsx', 'src/lib/incident.ts'].map(f => readFileSync(f, 'utf8')).join('\n');
  const code = src.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
  ok(!/help is on (its|the) way|ambulance (is )?(coming|on)|dispatched|has been told|tracking number/i.test(code) && !/\bETA\b/.test(code), 'no screen promises help is coming');
  ok(!/COUNTDOWN|setTimeout/.test(readFileSync('src/components/modals/SosModal.tsx', 'utf8')), 'no countdown on the SOS screen');
}

console.log(`\nAll ${n} emergency unit checks passed`);
