/**
 * Instant EMS end to end: the real app in Chrome. The server side is the real SQL in an
 * in-process database (scripts/emergency-db-test.ts), so these check real state changes
 * and what the person sees. No message or call can leave this machine: every outside
 * request is blocked, and tel:/sms: links are never followed by a real phone.
 *   npx tsx scripts/emergency-e2e.ts           (needs Chrome: CHROME_PATH or /usr/bin/google-chrome)
 */
import { createHmac } from 'node:crypto';
import { chromium, type BrowserContext, type Page, type Route } from 'playwright-core';
import { createServer, type ViteDevServer } from 'vite';
import { asUser, callRpc, CLIENT, testDatabase, THERAPIST } from './emergency-db-test';

const FAKE = 'https://fake4life.supabase.test';
let n = 0;
const ok = (c: unknown, w: string) => {
  if (!c) throw new Error('FAIL: ' + w);
  n++;
  console.log('ok ', w);
};

const pg = await testDatabase();
const rows = async (sql: string) => (await pg.query<any>(sql)).rows;

async function serve(port: number, env: Record<string, string>): Promise<ViteDevServer> {
  for (const k of ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY', 'VITE_SUPABASE_PUBLISHABLE_KEY']) delete process.env[k];
  Object.assign(process.env, env);
  const s = await createServer({ server: { port, strictPort: true }, logLevel: 'error', envDir: '/nonexistent' });
  await s.listen();
  return s;
}

const jwt = (sub: string) => {
  const b = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const head = b({ alg: 'HS256', typ: 'JWT' });
  const body = b({ sub, role: 'authenticated', aud: 'authenticated', exp: Math.floor(Date.now() / 1000) + 7200 });
  return `${head}.${body}.${createHmac('sha256', 'test').update(`${head}.${body}`).digest('base64url')}`;
};

/** How the pretend network behaves. `rpc` lets a test choose what happens per function. */
const net = {
  // 'lose-answer': the server does the work, then the connection drops
  // 'down': the server can't be reached
  mode: new Map<string, 'lose-answer' | 'down' | 'http500' | 'expired'>(),
  calls: [] as string[],
};

async function supabaseRoute(route: Route, uid: string) {
  const req = route.request();
  const url = new URL(req.url());
  const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*', 'content-type': 'application/json' };
  if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
  const json = (status: number, body: unknown) => route.fulfill({ status, headers: cors, body: JSON.stringify(body) });

  if (url.pathname.startsWith('/auth/v1/')) return json(200, { id: uid, email: 'kwame@it.test', aud: 'authenticated', role: 'authenticated' });

  const rpc = url.pathname.match(/^\/rest\/v1\/rpc\/(\w+)/)?.[1];
  if (rpc) {
    net.calls.push(rpc);
    const mode = net.mode.get(rpc) ?? net.mode.get('*');
    if (mode === 'down') return route.abort('connectionfailed');
    if (mode === 'http500') return json(503, { message: 'database unavailable' });
    if (mode === 'expired') return json(401, { code: 'PGRST301', message: 'JWT expired' });
    try {
      const data = await callRpc(pg, uid, rpc, JSON.parse(req.postData() || '{}'));
      if (mode === 'lose-answer') return route.abort('connectionreset');
      return json(200, data);
    } catch (e: any) {
      return json(400, { code: e.code, message: e.message });
    }
  }

  // Ordinary table reads go through the real Row Level Security; writes do nothing here
  const table = url.pathname.match(/^\/rest\/v1\/(\w+)/)?.[1];
  if (!table || req.method() !== 'GET') return json(201, []);
  const where: string[] = [];
  const params: string[] = [];
  url.searchParams.forEach((v, k) => {
    const m = v.match(/^eq\.(.*)$/);
    if (m && /^\w+$/.test(k)) {
      params.push(m[1]);
      where.push(`${k}::text = $${params.length}`);
    }
  });
  let data: any[] = [];
  try {
    data = await asUser(pg, uid, `select * from public.${table}${where.length ? ` where ${where.join(' and ')}` : ''} limit 50`, params);
  } catch {
    /* the app handles an empty answer */
  }
  if ((req.headers()['accept'] || '').includes('vnd.pgrst.object')) return data[0] ? json(200, data[0]) : json(406, { code: 'PGRST116', message: 'no rows' });
  return json(200, data);
}

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox'] });

async function context(base: string, opts: { uid?: string; geo?: boolean; mobile?: boolean }): Promise<BrowserContext> {
  const ctx = await browser.newContext({
    baseURL: base,
    serviceWorkers: 'block',
    viewport: opts.mobile ? { width: 390, height: 780 } : { width: 1280, height: 900 },
    hasTouch: !!opts.mobile,
    ...(opts.geo ? { geolocation: { latitude: 5.6037, longitude: -0.187, accuracy: 14 }, permissions: ['geolocation'] } : {}),
  });
  // Nothing leaves this machine. Links that would open a phone app are recorded and stopped.
  await ctx.route('**/*', route => {
    const host = new URL(route.request().url()).hostname;
    return host === 'localhost' || host === '127.0.0.1' ? route.fallback() : route.abort();
  });
  if (opts.uid) {
    await ctx.route(`${FAKE}/**`, r => supabaseRoute(r, opts.uid!));
    const session = { access_token: jwt(opts.uid), refresh_token: 'r', token_type: 'bearer', expires_in: 7200, expires_at: Math.floor(Date.now() / 1000) + 7200, user: { id: opts.uid, aud: 'authenticated', role: 'authenticated', email: 'kwame@it.test', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' } };
    await ctx.addInitScript(([k, v]) => {
      localStorage.setItem(k, v);
    }, ['sb-fake4life-auth-token', JSON.stringify(session)]);
  }
  return ctx;
}

const sosButton = (p: Page) => p.getByRole('button', { name: 'SOS', exact: true }).first();
const status = (p: Page) => p.getByTestId('alert-status');
const seeText = async (p: Page, what: string | RegExp, why: string, timeout = 15000) => {
  await p.getByText(what).first().waitFor({ timeout });
  ok(true, why);
};
const openSos = async (p: Page) => {
  await sosButton(p).waitFor({ timeout: 30000 });
  await sosButton(p).click();
};
/** Set E2E_SHOTS to a folder to keep pictures of the screens. */
const shot = async (p: Page, name: string) => {
  if (process.env.E2E_SHOTS) await p.screenshot({ path: `${process.env.E2E_SHOTS}/${name}.png`, fullPage: false });
};
const closeAll = async () => {
  for (const r of await rows(`select id from public.emergency_incidents where client_id='${CLIENT}' and closed_at is null`)) await callRpc(pg, CLIENT, 'emergency_close', { p_incident: r.id, p_outcome: 'cancelled' });
  // A clean slate for the hourly limit between scenarios
  await pg.exec(`alter table public.emergency_incidents disable trigger emergency_incidents_guard;
    update public.emergency_incidents set created_at = now() - interval '2 hours' where client_id='${CLIENT}';
    alter table public.emergency_incidents enable trigger emergency_incidents_guard;`);
  net.mode.clear();
  net.calls.length = 0;
};
const openIncidents = async () => rows(`select * from public.emergency_incidents where client_id='${CLIENT}' and closed_at is null`);

const remoteServer = await serve(5191, { VITE_SUPABASE_URL: FAKE, VITE_SUPABASE_ANON_KEY: 'anon-test-key' });
const REMOTE = 'http://localhost:5191';

try {
  /* ---------- 1. The main path: real states, real records ---------- */
  {
    const ctx = await context(REMOTE, { uid: CLIENT, geo: true, mobile: true });
    const p = await ctx.newPage();
    const pageErrors: string[] = [];
    p.on('pageerror', e => pageErrors.push(e.message));
    await p.goto('/');
    await openSos(p);

    await seeText(p, 'This does not contact an ambulance.', 'before pressing: says it does not contact an ambulance');
    await seeText(p, /A message to Sister Mary gets ready/, 'before pressing: names who it will reach');
    ok((await p.getByRole('link', { name: /Call 112/ }).first().getAttribute('href')) === 'tel:112', 'calling 112 is the first choice, and is a real phone link');
    ok((await openIncidents()).length === 0, 'opening the SOS screen does nothing by itself');

    await shot(p, 'before-pressing');
    await p.getByRole('button', { name: 'Start alert' }).click();
    await seeText(p, /Alert saved at/, 'pressing shows "Alert saved", with a time');
    let [row] = await openIncidents();
    ok(row && row.status === 'initiated', 'the screen matches the database: initiated');
    await seeText(p, /Alert saved for Dr\. Ama Konadu.*haven’t confirmed yet/, 'counsellor: saved, not confirmed. It does not claim they were told');
    await seeText(p, /Found at .*accurate to about 14 m/, 'location: shown with its time and accuracy');
    await p.waitForTimeout(300);
    [row] = await openIncidents();
    ok(row.location_status === 'fresh' && row.accuracy_m === 14, 'the location status reached the database');
    ok((await rows(`select * from public.sos_events where client_id='${CLIENT}' and source='requested' and lat is not null`)).length === 1, 'coordinates are kept in sos_events (this person agreed)');
    await shot(p, 'alert-saved');
    await seeText(p, 'Emergency services', 'emergency services row is shown');
    await seeText(p, /isn’t connected to them and can’t send an ambulance/, 'it says plainly that 4Life can’t send an ambulance');
    ok((await p.getByText(/dispatched|help is on the way|responder/i).count()) === 0, 'nothing on screen says help is coming');

    // Text message: the link is real, and opening it isn't "sent"
    const smsLink = p.getByRole('link', { name: /^Text Sister Mary/ });
    const href = (await smsLink.getAttribute('href'))!;
    ok(href.startsWith('sms:+233') && decodeURIComponent(href).includes('maps.google.com/?q=5.60370,-0.18700') && /14 m at/.test(decodeURIComponent(href)), 'the message has the map link, accuracy and time');
    ok(!(await p.url()).includes('5.6037'), 'the coordinates are not in the page address');
    await smsLink.evaluate((a: HTMLAnchorElement) => {
      a.addEventListener('click', e => e.preventDefault());
      a.click();
    });
    await seeText(p, /Your messaging app was opened at .*Nothing is sent until you press send/, 'after opening the messaging app it only says it opened');
    await p.waitForTimeout(300);
    [row] = await openIncidents();
    ok(row.status === 'initiated', 'still initiated in the database: opening is not notifying');
    await p.getByRole('button', { name: 'Yes, I sent it' }).click();
    await seeText(p, /You said you sent it\. 4Life can’t see if it arrived/, 'after "I sent it": the person’s word, not delivery');
    await p.waitForTimeout(300);
    [row] = await openIncidents();
    ok(row.status === 'contact_notified', 'database: contact_notified');

    // Refresh: same incident, from the server
    await p.reload();
    await seeText(p, /Alert saved at/, 'after a refresh the banner shows the alert is still open', 30000);
    await p.getByRole('button', { name: /Alert saved at/ }).click();
    await seeText(p, /You said you sent it/, 'and the status is restored from the server');
    ok((await openIncidents()).length === 1, 'a refresh does not create a second incident');
    await seeText(p, /Found at .*accurate to about 14 m/, 'after a refresh the location is found again, not shown as missing');
    ok(decodeURIComponent((await p.getByRole('link', { name: /^Text Sister Mary/ }).getAttribute('href'))!).includes('maps.google.com'), 'and the message has it');

    // The counsellor acknowledges, for real, as themselves; the client's phone finds out
    await callRpc(pg, THERAPIST, 'emergency_acknowledge', { p_incident: row.id });
    await p.evaluate(() => window.dispatchEvent(new Event('online')));
    await seeText(p, 'Your counsellor has seen your alert', 'the counsellor’s acknowledgement appears');
    await seeText(p, /Dr\. Ama Konadu saw it at/, 'with their name and the time');
    await shot(p, 'acknowledged');
    await seeText(p, /That isn’t an ambulance/, 'and it doesn’t let that sound like an ambulance');

    await p.getByRole('button', { name: 'I’m safe now' }).click();
    await seeText(p, /Alert closed at/, 'resolving closes it');
    ok((await rows(`select status from public.emergency_incidents where id='${row.id}'`))[0].status === 'resolved', 'database: resolved');
    ok(pageErrors.length === 0, `no page errors (${pageErrors.join('; ')})`);
    await ctx.close();
    await closeAll();
  }

  /* ---------- 2. Answer lost after the server saved it ---------- */
  {
    const ctx = await context(REMOTE, { uid: CLIENT, geo: true });
    const p = await ctx.newPage();
    await p.goto('/');
    await openSos(p);
    net.mode.set('emergency_open_incident', 'lose-answer');
    await p.getByRole('button', { name: 'Start alert' }).click();
    await seeText(p, 'Not sure yet if your alert was saved', 'lost answer: it says "not sure", not saved and not failed');
    ok((await p.getByRole('link', { name: /^Text Sister Mary/ }).count()) === 1 && (await p.getByRole('link', { name: /Call 112/ }).count()) >= 1, 'and the call and message buttons still work');
    ok((await openIncidents()).length === 1, 'the server did save it');
    net.mode.clear();
    await seeText(p, /Alert saved at/, 'then the real status is found by asking');
    ok((await openIncidents()).length === 1, 'exactly one incident: no duplicate from retrying');
    ok(net.calls.includes('emergency_by_request'), 'it asked the server before sending again');
    await ctx.close();
    await closeAll();
  }

  /* ---------- 3. Server down, and a refresh during it ---------- */
  {
    const ctx = await context(REMOTE, { uid: CLIENT, geo: true });
    const p = await ctx.newPage();
    await p.goto('/');
    await openSos(p);
    net.mode.set('*', 'http500');
    await p.getByRole('button', { name: 'Start alert' }).click();
    await seeText(p, 'Not sure yet if your alert was saved', 'database down: says "not sure"');
    ok((await openIncidents()).length === 0, 'nothing saved yet');
    await p.reload();
    await seeText(p, 'Not sure yet if your alert was saved', 'a refresh in the middle keeps it going', 30000);
    net.mode.clear();
    await seeText(p, /Alert saved at/, 'saved once the database is back', 40000);
    ok((await openIncidents()).length === 1, 'one incident after recovery');
    await ctx.close();
    await closeAll();
  }

  /* ---------- 4. Offline ---------- */
  {
    const ctx = await context(REMOTE, { uid: CLIENT, geo: true });
    const p = await ctx.newPage();
    await p.goto('/');
    await openSos(p);
    await sosButton(p).waitFor({ state: 'attached' }).catch(() => {});
    await ctx.setOffline(true);
    await p.getByRole('button', { name: 'Start alert' }).click();
    await seeText(p, /You’re offline\. Your alert is not saved yet/, 'offline: says it is not saved yet');
    ok((await p.getByRole('link', { name: /Call 112/ }).count()) >= 1, 'calling still offered');
    ok((await openIncidents()).length === 0, 'really not saved');
    await ctx.setOffline(false);
    await seeText(p, /Alert saved at/, 'sends when back online', 30000);
    ok((await openIncidents()).length === 1, 'one incident');
    await ctx.close();
    await closeAll();
  }

  /* ---------- 5. Session expired ---------- */
  {
    const ctx = await context(REMOTE, { uid: CLIENT });
    const p = await ctx.newPage();
    await p.goto('/');
    await openSos(p);
    net.mode.set('emergency_open_incident', 'expired');
    await p.getByRole('button', { name: 'Start alert' }).click();
    await seeText(p, 'Your alert was not saved', 'expired session: says it was not saved');
    await seeText(p, /sign in again.*No one was told/, 'and that no one was told');
    ok((await p.getByRole('link', { name: /^Text Sister Mary/ }).count()) === 1, 'messaging still works without a session');
    await p.getByRole('dialog').first().press('Escape');
    await p.getByRole('dialog').waitFor({ state: 'detached', timeout: 3000 }).catch(() => {});
    ok(await sosButton(p).isVisible(), 'the screen can be closed: no one is trapped');
    await ctx.close();
    await closeAll();
  }

  /* ---------- 6. Location refused ---------- */
  {
    const ctx = await context(REMOTE, { uid: CLIENT }); // no permission given
    const p = await ctx.newPage();
    const coordsBefore = (await rows(`select id from public.sos_events where client_id='${CLIENT}' and lat is not null`)).length;
    await p.goto('/');
    await openSos(p);
    await p.getByRole('button', { name: 'Start alert' }).click();
    await seeText(p, /Alert saved at/, 'location refused: the alert is still saved');
    await seeText(p, /Location is switched off for this app/, 'and the problem is explained');
    const href = decodeURIComponent((await p.getByRole('link', { name: /^Text Sister Mary/ }).getAttribute('href'))!);
    ok(/couldn't share my exact location/.test(href) && !/maps\.google/.test(href), 'the message says no location, with no made-up one');
    await p.waitForTimeout(300);
    ok((await rows(`select id from public.sos_events where client_id='${CLIENT}' and lat is not null`)).length === coordsBefore, 'no region-centre guess reached the counsellor');
    ok((await openIncidents())[0].location_status === 'denied', 'database: denied');

    await p.getByRole('button', { name: 'Write a landmark' }).click();
    await p.getByLabel(/Where are you/).fill('Near Adum junction');
    await p.getByRole('button', { name: 'Use this' }).click();
    await seeText(p, /You wrote: “Near Adum junction”/, 'a landmark can be written');
    const href2 = decodeURIComponent((await p.getByRole('link', { name: /^Text Sister Mary/ }).getAttribute('href'))!);
    ok(href2.includes('Near Adum junction'), 'and goes in the message');

    await p.getByRole('button', { name: 'Pressed by mistake' }).click();
    await seeText(p, /Alert cancelled at/, 'an accidental alert can be cancelled');
    ok((await openIncidents()).length === 0, 'database: closed');
    await ctx.close();
    await closeAll();
  }

  /* ---------- 7. Closing when the server is unreachable ---------- */
  {
    const ctx = await context(REMOTE, { uid: CLIENT, geo: true });
    const p = await ctx.newPage();
    await p.goto('/');
    await openSos(p);
    await p.getByRole('button', { name: 'Start alert' }).click();
    await seeText(p, /Alert saved at/, 'saved');
    net.mode.set('*', 'down');
    await p.getByRole('button', { name: 'I’m safe now' }).click();
    await seeText(p, /your alert is still open/, 'a close that fails says the alert is still open');
    ok((await openIncidents()).length === 1, 'and it really is');
    net.mode.clear();
    await p.getByRole('button', { name: 'I’m safe now' }).click();
    await seeText(p, /Alert closed at/, 'trying again works');
    await ctx.close();
    await closeAll();
  }

  /* ---------- 8. Two presses, and keyboard use ---------- */
  {
    const ctx = await context(REMOTE, { uid: CLIENT, geo: true });
    const p = await ctx.newPage();
    await p.goto('/');
    await openSos(p);
    await p.getByRole('button', { name: 'Start alert' }).focus();
    await p.keyboard.press('Enter');
    await p.keyboard.press('Enter');
    await seeText(p, /Alert saved at/, 'works from the keyboard');
    ok((await openIncidents()).length === 1 && net.calls.filter(c => c === 'emergency_open_incident').length === 1, 'pressed twice: one request and one incident');
    ok((await p.locator('[role="status"]').filter({ hasText: 'Alert saved' }).count()) >= 1, 'the status is announced to screen readers');
    await ctx.close();
    await closeAll();
  }
  await remoteServer.close();

  /* ---------- 9. No account ---------- */
  {
    const device = await serve(5192, {});
    const ctx = await context('http://localhost:5192', { geo: true, mobile: true });
    const p = await ctx.newPage();
    await p.goto('/');
    await p.locator('a[href="tel:112"]:visible').first().waitFor({ timeout: 30000 });
    ok((await p.locator('a[href="tel:193"]:visible').count()) >= 1, 'signed out on a phone: 112 and 193 are visible phone links, with no sign-in needed');
    await p.getByRole('button', { name: /anonymous guest/ }).click();
    await openSos(p);
    await seeText(p, 'This does not contact an ambulance.', 'guest: same plain statement');
    ok((await p.getByRole('button', { name: 'Start alert' }).count()) === 0, 'guest with no support person: no button that would do nothing');
    ok((await p.getByRole('dialog').getByText(/counsellor/i).count()) === 0, 'guest: no talk of a counsellor being told');
    await ctx.close();
    await device.close();
  }

  console.log(`\nAll ${n} emergency end-to-end checks passed`);
} finally {
  await browser.close();
  await remoteServer.close().catch(() => {});
  await pg.close();
}
process.exit(0);
