/**
 * The admin dashboard (/admin) in real Chrome, against a pretend Supabase (nothing leaves the machine).
 * The pretend database answers the admin functions only for the admin account, like the real one
 * (whose rules are tested in npm run test:admin-db).
 *  - Signed out: "Sign in first". A client or a therapist: "No access", and not one admin call is made.
 *    Writing role: admin into the browser's storage or profile settings changes nothing.
 *  - An admin: the overview with real numbers, alerts and a chart; people (search, details, suspend with
 *    a reason); therapist approval; moderation; SOS without locations; content; system; the log.
 *  - Sections live in the address and survive a refresh; phones get a scrollable section row and cards;
 *    dark theme; the account menu shows "Admin dashboard" to admins only.
 *   npm run test:admin        (needs Chrome: CHROME_PATH or /usr/bin/google-chrome)
 */
import { createHmac } from 'node:crypto';
import { chromium, type Page, type Route } from 'playwright-core';
import { createServer } from 'vite';

let n = 0;
const ok = (c: unknown, w: string) => {
  if (!c) throw new Error('FAIL: ' + w);
  n++;
  console.log('ok ', w);
};

const FAKE = 'https://fake4life.supabase.co';
const PORT = 5205;
const HERE = `http://localhost:${PORT}`;
for (const k of ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY', 'VITE_SUPABASE_PUBLISHABLE_KEY']) delete process.env[k];
Object.assign(process.env, { VITE_SUPABASE_URL: FAKE, VITE_SUPABASE_ANON_KEY: 'anon-test-key', VITE_APP_URL: HERE });
const server = await createServer({ server: { port: PORT, strictPort: true }, logLevel: 'error', envDir: '/nonexistent' });
await server.listen();
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox'] });

const IDS = { admin: 'a0000000-0000-4000-8000-000000000001', client: 'c0000000-0000-4000-8000-000000000002', therapist: 't0000000-0000-4000-8000-000000000003'.replace('t', 'b') };
type Who = keyof typeof IDS;
const jwt = (sub: string) => {
  const b = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const head = b({ alg: 'HS256', typ: 'JWT' });
  const body = b({ sub, role: 'authenticated', aud: 'authenticated', exp: Math.floor(Date.now() / 1000) + 7200 });
  return `${head}.${body}.${createHmac('sha256', 'test').update(`${head}.${body}`).digest('base64url')}`;
};
const profileOf = (who: Who) => ({
  id: IDS[who], role: who, display_name: who === 'admin' ? 'Adwoa Admin' : 'Kofi', nickname: who === 'admin' ? 'Admin_Adwoa' : who === 'client' ? 'Kofi_W' : 'dr_ama',
  age: 30, language: 'en', theme: 'system', font_size: 'md', current_triage: 'general', streak_days: 3, share_location_in_crisis: false,
  // what a person could write into their own editable settings: must change nothing
  settings: who === 'admin' ? {} : { role: 'admin', isAdmin: true },
});

const day = (i: number) => new Date(Date.now() - (29 - i) * 86400000).toISOString().slice(0, 10);
const now = new Date().toISOString();
const OVERVIEW = {
  generated_at: now,
  users: { total: 128, clients: 110, therapists: 16, admins: 2, new_7d: 9, new_30d: 31, deletion_requested: 1, suspended: 2, active_30d: 77 },
  therapists: { verified: 12, pending: 3, rejected: 1, accepting: 10 },
  sessions: { total: 240, upcoming: 18, overdue: 2, completed: 190, cancelled: 25, no_show: 5 },
  requests: { pending: 6, accepted: 70, declined: 8, withdrawn: 2, pending_over_48h: 2 },
  village: { posts_7d: 14, replies_7d: 52, posts_total: 300, hidden: 4, open_reports: 2 },
  sos: { active: 1, last_30d: 5, acknowledged_30d: 4, resolved_30d: 3, cancelled_30d: 1, expired_30d: 0 },
  series: { days: Array.from({ length: 30 }, (_, i) => day(i)), signups: Array.from({ length: 30 }, (_, i) => i % 4), sessions: Array.from({ length: 30 }, (_, i) => (i * 3) % 7), posts: Array.from({ length: 30 }, () => 1), sos: Array.from({ length: 30 }, (_, i) => (i === 29 ? 1 : 0)) },
  recent_actions: [{ at: now, action: 'approve_therapist', target_type: 'user', target_id: 'x', reason: 'Checked', admin: 'Admin_Adwoa' }],
};
const USERS = {
  total: 2,
  rows: [
    { id: IDS.client, nickname: 'Kofi_W', display_name: 'Kofi Wiredu', role: 'client', created_at: now, deletion_requested_at: null, email: 'kofi@example.org', last_sign_in_at: now, suspension_reason: null, suspended_at: null, verification: null },
    { id: IDS.therapist, nickname: 'dr_ama', display_name: 'Ama Konadu', role: 'therapist', created_at: now, deletion_requested_at: null, email: 'ama@example.org', last_sign_in_at: null, suspension_reason: null, suspended_at: null, verification: 'pending' },
  ],
};
const DETAIL = { id: IDS.client, nickname: 'Kofi_W', display_name: 'Kofi Wiredu', role: 'client', age: 21, region: 'Ashanti', language: 'en', created_at: now, deletion_requested_at: null, email: 'kofi@example.org', last_sign_in_at: now, suspension: null, activity: { checkins: 12, last_checkin: day(29), thought_records: 3, village_posts: 2, village_replies: 5, reports_made: 0, reports_about_them: 1, counsellors: 1, clients: 0, sessions: 4, sos_30d: 0 }, history: [] };
const THERAPISTS = [{ id: IDS.therapist, title: 'Dr.', full_name: 'Ama Konadu', nickname: 'dr_ama', email: 'ama@example.org', profession: 'Clinical psychologist', years_experience: 8, verification: 'pending', verified_at: null, specialties: ['substance'], approaches: ['CBT'], languages: ['English', 'Twi'], formats: ['video'], region: 'Greater Accra', practice_location: 'Osu', fee_ghs: 80, accepting_clients: true, bio: 'CBT for young adults.', created_at: now, suspended: false, licence: { license_body: 'Ghana Psychology Council', license_number: 'GPC-123', agreed_confidentiality_at: now, agreed_crisis_protocol_at: now, agreed_accuracy_at: now, reviewed_at: null, review_note: null, reviewer: null }, services: [{ name: 'First consultation', duration_min: 50, fee_ghs: 80, formats: ['video'], active: true }], active_clients: 0, upcoming_sessions: 0, completed_sessions: 0, pending_requests: 1 }];
const REPORTS = [{ target_type: 'post', target_id: 'p0000000-0000-4000-8000-000000000009'.replace('p', 'd'), reports: 3, open: true, reasons: ['unkind'], notes: ['Name-calling'], first_at: now, last_at: now, resolved_at: null, title: 'Rude post', body: 'Something unkind here', author: 'Yaw_B', author_id: 'e0000000-0000-4000-8000-000000000010', hidden: true, posted_at: now, removed: false, author_suspended: false }];
const SOS = [{ id: 'f0000000-0000-4000-8000-000000000011', ref: 'F0000000', created_at: now, status: 'initiated', location_status: 'fresh', location_shared: true, closed_at: null, active: true, counsellor_notified: true, acknowledged_at: null, contact_handoffs: 1, reported_sent: 0, emergency_call_opened: true }];
const SOS_DETAIL = { id: SOS[0].id, created_at: now, status: 'initiated', client: 'Kofi_W', client_id: IDS.client, location_status: 'fresh', location_shared: true, closed_at: null, counsellors: [{ therapist: 'Dr. Ama Konadu', status: 'recorded', acknowledged_at: null }], handoffs: [{ channel: 'sms_handoff', status: 'opened', at: now }], timeline: [{ at: now, kind: 'created', from: null, to: 'initiated' }] };
const CONTENT = { circles: [{ id: 'circle-1', title: 'Sober evenings', topic: 'substance', host_name: 'Dr. Ama', host_role: 'Psychologist', description: 'Evenings', weekday: 3, start_time: '19:00:00', duration_min: 60, active: true, rsvps: 4 }], hotlines: [{ id: 'gh-mha', label: 'Mental Health Authority', number: '0800 678 678', description: '', verified_at: null, source: null }], centres: [{ id: 'ems-1', name: 'Korle Bu', type: 'hospital', region: 'Greater Accra', phone: '030 000 0000', verified_at: null }] };
const SYSTEM = { cron_available: false, jobs: [], cleanups: [{ name: 'SOS locations after 30 days', function: 'purge_expired_locations', scheduled: false }], migrations: [{ name: 'Admin (0012)', present: true }], unverified_hotlines: 1, unverified_centres: 1, database_time: now };
const ACTIONS = { total: 1, rows: [{ id: 1, at: now, action: 'suspend_account', target_type: 'user', target_id: IDS.client, reason: 'Harassment', details: {}, admin: 'Admin_Adwoa', target_name: 'Kofi_W' }] };
const ANSWERS: Record<string, unknown> = {
  admin_overview: OVERVIEW, admin_list_users: USERS, admin_user_detail: DETAIL, admin_list_therapists: THERAPISTS, admin_reports: REPORTS, admin_sos: SOS, admin_sos_detail: SOS_DETAIL,
  admin_content: CONTENT, admin_system: SYSTEM, admin_list_actions: ACTIONS, admin_appointments: { sessions: [], requests: [], conflicts: [], overdue: 0 },
  admin_set_suspension: null, review_therapist: null, admin_moderate: null, admin_set_admin: null, admin_verify_contact: null, admin_set_circle_active: null,
};

let current: Who | null = null;
const calls: Array<{ fn: string; args: any; who: Who | null }> = [];

async function fakeSupabase(r: Route) {
  const req = r.request();
  const url = new URL(req.url());
  const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*', 'access-control-expose-headers': '*', 'content-type': 'application/json' };
  if (req.method() === 'OPTIONS') return r.fulfill({ status: 204, headers: cors });
  const json = (status: number, body: unknown) => r.fulfill({ status, headers: cors, body: JSON.stringify(body) });
  const p = url.pathname;
  if (p === '/auth/v1/user') return current ? json(200, { id: IDS[current], email: `${current}@it.test`, aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: { role: 'admin' }, created_at: now }) : json(401, {});
  if (p === '/auth/v1/logout') return r.fulfill({ status: 204, headers: cors });
  if (p.startsWith('/rest/v1/profiles')) {
    if (!current) return json(200, []);
    const one = (req.headers()['accept'] || '').includes('vnd.pgrst.object');
    return json(200, one ? profileOf(current) : [profileOf(current)]);
  }
  if (p.startsWith('/rest/v1/rpc/')) {
    const fn = p.split('/').pop()!;
    if (fn.startsWith('admin_') || fn === 'review_therapist') {
      calls.push({ fn, args: JSON.parse(req.postData() || '{}'), who: current });
      // like the real database: only an admin gets an answer
      if (current !== 'admin') return json(400, { code: '42501', message: 'Admins only' });
      return json(200, ANSWERS[fn] ?? null);
    }
    return json(200, null);
  }
  if (p.startsWith('/rest/v1/')) return json(200, []);
  if (p.startsWith('/realtime/')) return r.abort();
  return json(404, {});
}

const context = async (width: number, who: Who | null, scheme: 'light' | 'dark' = 'light') => {
  const mobile = width < 1024;
  const ctx = await browser.newContext({ viewport: { width, height: 860 }, colorScheme: scheme, isMobile: mobile, hasTouch: mobile, serviceWorkers: 'block', reducedMotion: 'reduce' });
  await ctx.route('**/*', r => {
    const u = r.request().url();
    if (u.startsWith(FAKE)) return fakeSupabase(r);
    if (u.startsWith(`${HERE}/api/`)) return r.fulfill({ status: 200, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ok: true, groq: true, gemini: false, youtube: false, supabaseProject: 'fake', models: { groq: 'openai/gpt-oss-120b' } }) });
    return u.startsWith(HERE) ? r.continue() : r.abort();
  });
  current = who;
  const p = await ctx.newPage();
  const errors: string[] = [];
  p.on('pageerror', e => errors.push(e.message));
  if (who) {
    // sign in through the app's own callback, then go to /admin (the session is kept in the browser)
    await p.goto(`${HERE}/auth/callback#access_token=${jwt(IDS[who])}&refresh_token=r&expires_in=3600&expires_at=${Math.floor(Date.now() / 1000) + 3600}&token_type=bearer&type=signup`);
    await p.waitForTimeout(2500);
  }
  return { ctx, p, errors };
};
const wide = (p: Page) => p.evaluate(() => document.documentElement.scrollWidth - innerWidth);

try {
  // ---------- 1. Who gets in ----------
  {
    const { ctx, p } = await context(1280, null);
    await p.goto(`${HERE}/admin`);
    await p.getByRole('heading', { name: 'Sign in first' }).waitFor({ timeout: 30000 });
    ok(calls.length === 0, 'signed out: “Sign in first”, and no admin call is made');
    await ctx.close();
  }
  for (const who of ['client', 'therapist'] as const) {
    calls.length = 0;
    const { ctx, p } = await context(1280, who);
    // try to fool the app: role "admin" in the browser's storage and in the profile settings (see profileOf)
    await p.evaluate(() => {
      localStorage.setItem('role', 'admin');
      localStorage.setItem('4life_role', 'admin');
      sessionStorage.setItem('isAdmin', 'true');
    });
    await p.goto(`${HERE}/admin#people`);
    await p.getByRole('heading', { name: 'No access' }).waitFor({ timeout: 30000 });
    ok(calls.filter(c => c.fn !== 'is_suspended').length === 0, `${who}: “No access”, and not one admin call is made, even with “admin” written into the browser and their settings`);
    // and if they call the database directly anyway, it refuses (like the real one)
    const direct = await p.evaluate(async (fake: string) => {
      const key = Object.keys(localStorage).find(k => k.includes('auth-token'));
      const token = key ? JSON.parse(localStorage.getItem(key)!).access_token : '';
      const r = await fetch(`${fake}/rest/v1/rpc/admin_overview`, { method: 'POST', headers: { apikey: 'anon-test-key', Authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: '{}' });
      return { status: r.status, body: await r.text() };
    }, FAKE);
    ok(direct.status === 400 && direct.body.includes('Admins only'), `${who}: calling the admin function directly is refused`);
    await ctx.close();
  }

  // ---------- 2. The admin dashboard on a computer ----------
  {
    calls.length = 0;
    const { ctx, p, errors } = await context(1280, 'admin');
    // the account menu shows the way in
    await p.getByRole('button', { name: 'Account menu' }).click();
    ok(await p.getByRole('menuitem', { name: 'Admin dashboard' }).isVisible(), 'an admin sees “Admin dashboard” in the account menu');
    await p.getByRole('menuitem', { name: 'Admin dashboard' }).click();
    await p.waitForURL(`${HERE}/admin`);
    await p.getByRole('heading', { level: 1, name: 'Overview' }).waitFor({ timeout: 30000 });
    ok(await p.getByText('Signed in as Admin_Adwoa').isVisible(), 'it opens the admin dashboard, signed in as the admin');
    ok((await p.locator('section[aria-label="Key numbers"]').innerText()).includes('128') && (await p.locator('section[aria-label="Key numbers"]').innerText()).includes('77'), 'the overview shows the numbers from the database (128 people, 77 signed in)');
    const alerts = await p.locator('section[aria-label="Needs attention"]').innerText();
    ok(/1 SOS alert is open now/.test(alerts) && /does not contact emergency services/.test(alerts) && /3 therapist applications/.test(alerts) && /2 reported Village items/.test(alerts), 'alerts: an open SOS (without claiming dispatch), waiting therapists and reports');
    ok((await p.locator('figure svg rect').count()) === 30, 'the chart has 30 days');
    await p.getByRole('group', { name: 'Which numbers' }).getByRole('button', { name: 'SOS' }).click();
    ok(await p.locator('figure figcaption').getByText(/1 in 30 days|^1$/).first().isVisible(), 'switching the chart to SOS shows its total');

    // People: search, details, suspend with a reason
    await p.getByRole('navigation', { name: 'Admin sections' }).last().getByRole('button', { name: 'People' }).click();
    await p.getByRole('table').getByText('kofi@example.org').waitFor();
    ok(p.url().endsWith('#people'), 'the section is in the address');
    await p.getByRole('button', { name: 'Kofi_W · Kofi Wiredu' }).first().click();
    const dlg = p.getByRole('dialog');
    await dlg.getByText('Counts only. What people write, rate or say to the AI is not shown here.').waitFor();
    ok((await dlg.innerText()).includes('Check-ins') && (await dlg.innerText()).includes('12'), 'a person’s details show their activity as counts');
    await dlg.getByRole('button', { name: 'Suspend account' }).click();
    const confirm = p.getByRole('dialog').last();
    await confirm.getByRole('button', { name: 'Suspend account' }).click();
    ok(await confirm.getByText(/Please give a reason/).isVisible() && !calls.some(c => c.fn === 'admin_set_suspension'), 'suspending without a reason is stopped before anything is sent');
    await confirm.getByLabel(/Reason/).fill('Repeated harassment in the Village');
    await confirm.getByRole('button', { name: 'Suspend account' }).click();
    await p.waitForTimeout(500);
    const sus = calls.find(c => c.fn === 'admin_set_suspension');
    ok(sus && sus.args.p_user === IDS.client && sus.args.p_suspend === true && sus.args.p_reason === 'Repeated harassment in the Village', 'suspending calls the database with the person and the reason');
    await p.keyboard.press('Escape');

    // Therapists: approve
    await p.goto(`${HERE}/admin#therapists`);
    await p.getByRole('article', { name: 'Dr. Ama Konadu' }).waitFor({ timeout: 30000 });
    ok(true, 'a refresh with #therapists opens Therapists');
    ok((await p.getByRole('article', { name: 'Dr. Ama Konadu' }).innerText()).includes('Ghana Psychology Council, no. GPC-123'), 'the licence to check is shown');
    await p.getByRole('article', { name: 'Dr. Ama Konadu' }).getByRole('button', { name: 'Approve' }).click();
    await p.getByRole('dialog').getByLabel(/How you checked/).fill('Checked on the GPC register');
    await p.getByRole('dialog').getByRole('button', { name: 'Approve' }).click();
    await p.waitForTimeout(500);
    ok(calls.some(c => c.fn === 'review_therapist' && c.args.p_verified === true && c.args.p_note === 'Checked on the GPC register'), 'approving calls review_therapist with the note');

    // Moderation: remove needs a reason
    await p.goto(`${HERE}/admin#moderation`);
    await p.getByText('Something unkind here').waitFor({ timeout: 30000 });
    await p.getByRole('button', { name: 'Remove' }).click();
    await p.getByRole('dialog').getByRole('button', { name: 'Remove it' }).click();
    ok(await p.getByRole('dialog').getByText(/Please give a reason/).isVisible(), 'removing a post needs a reason');
    await p.getByRole('dialog').getByLabel(/Reason/).fill('Insults: breaks the house rules');
    await p.getByRole('dialog').getByRole('button', { name: 'Remove it' }).click();
    await p.waitForTimeout(500);
    ok(calls.some(c => c.fn === 'admin_moderate' && c.args.p_action === 'delete' && c.args.p_reason.startsWith('Insults')), 'removing calls the database with the action and reason');

    // SOS: no locations; details only with a reason
    await p.goto(`${HERE}/admin#sos`);
    await p.getByText('F0000000').first().waitFor({ timeout: 30000 });
    const sosText = await p.locator('#admin-main').innerText();
    ok(/Open now/.test(sosText) && /does not contact emergency services/.test(sosText) && !/Kofi|5\.6|-0\.1/.test(sosText), 'SOS: open alerts are marked, no dispatch is claimed, no name or location is shown');
    await p.getByRole('button', { name: 'F0000000' }).first().click();
    await p.getByRole('dialog').getByRole('button', { name: 'Show details' }).click();
    ok(await p.getByRole('dialog').getByText(/Please give a reason/).isVisible(), 'who raised an SOS is only shown with a reason');
    await p.getByRole('dialog').getByLabel(/Why you need this/).fill('Counsellor asked us to check the alert reached them');
    await p.getByRole('dialog').getByRole('button', { name: 'Show details' }).click();
    await p.getByRole('dialog').getByText('Raised by').waitFor();
    ok(calls.some(c => c.fn === 'admin_sos_detail' && c.args.p_reason.startsWith('Counsellor')), 'with a reason, the details are fetched (and the database logs it)');
    await p.keyboard.press('Escape');

    // Content, System, Log render
    for (const [hash, text] of [['content', 'Mental Health Authority'], ['system', 'Scheduled clean-ups'], ['log', 'Harassment']] as const) {
      await p.goto(`${HERE}/admin#${hash}`);
      await p.getByText(text).first().waitFor({ timeout: 30000 });
      ok(true, `${hash}: shows its data`);
    }
    ok(await p.getByText('This log cannot be edited or deleted').isVisible(), 'the log says it cannot be changed');
    ok(errors.length === 0, `no page errors${errors.length ? ': ' + errors.join('; ') : ''}`);
    await ctx.close();
  }

  // ---------- 3. Phones and dark theme ----------
  {
    const { ctx, p, errors } = await context(390, 'admin', 'dark');
    await p.goto(`${HERE}/admin#people`);
    await p.getByRole('heading', { level: 1, name: 'People' }).waitFor({ timeout: 30000 });
    ok(await p.evaluate(() => document.documentElement.classList.contains('dark')), '390px: the dark theme applies');
    ok((await wide(p)) <= 1, '390px: no sideways scrolling');
    ok((await p.locator('table:visible').count()) === 0 && (await p.locator('#admin-main ul li button:visible').count()) >= 2, '390px: people are cards, not a wide table');
    const nav = p.getByRole('navigation', { name: 'Admin sections' }).first();
    ok(await nav.isVisible() && (await nav.getByRole('button').count()) === 9, '390px: all 9 sections are in a row you can scroll');
    await nav.getByRole('button', { name: 'SOS' }).tap();
    await p.getByRole('heading', { level: 1, name: 'SOS' }).waitFor();
    ok((await wide(p)) <= 1, '390px: the SOS page fits too');
    ok(errors.length === 0, '390px: no page errors');
    await ctx.close();
  }

  // ---------- 4. Clients don't see the way in ----------
  {
    const { ctx, p } = await context(1280, 'client');
    await p.getByRole('button', { name: 'Account menu' }).click();
    ok(!(await p.getByRole('menuitem', { name: 'Admin dashboard' }).count()), 'a client does not see “Admin dashboard”');
    await ctx.close();
  }
  console.log(`All ${n} admin dashboard checks passed`);
} finally {
  await browser.close();
  await server.close();
}
process.exit(0);
