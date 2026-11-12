/**
 * Which backend answers the AI chat, in real Chrome against a pretend Supabase (nothing leaves the machine).
 * The app can reach two backends: this site's /api (Vercel) and the Supabase functions. Each AI answer says
 * in its X-4Life-AI header whether that server has an AI key. This checks that:
 *  - when /api has no key but the Supabase function has one, the chat gets the function's real answer
 *    (the live fault: Vercel had no key, Supabase did, and the app stopped at Vercel's "not set up");
 *  - when /api has a key, the function is never asked;
 *  - when neither has a key, the honest "not set up" message is shown, with no made-up reply;
 *  - when the main AI and its backup both fail, the person is told so;
 *  - the chat's disclosure names Groq first and Gemini as the backup.
 *   npm run test:ai-backend        (needs Chrome: CHROME_PATH or /usr/bin/google-chrome)
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
const PORT = 5199;
const HERE = `http://localhost:${PORT}`;
for (const k of ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY', 'VITE_SUPABASE_PUBLISHABLE_KEY', 'VITE_API_BACKEND', 'VITE_CHAT_BACKEND']) delete process.env[k];
Object.assign(process.env, { VITE_SUPABASE_URL: FAKE, VITE_SUPABASE_ANON_KEY: 'anon-test-key', VITE_APP_URL: HERE });
const server = await createServer({ server: { port: PORT, strictPort: true }, logLevel: 'error', envDir: '/nonexistent' });
await server.listen();
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox'] });

const UID = '33333333-3333-4333-8333-333333333333';
const jwt = (sub: string) => {
  const b = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const head = b({ alg: 'HS256', typ: 'JWT' });
  const body = b({ sub, role: 'authenticated', aud: 'authenticated', exp: Math.floor(Date.now() / 1000) + 7200 });
  return `${head}.${body}.${createHmac('sha256', 'test').update(`${head}.${body}`).digest('base64url')}`;
};
const TOKEN = jwt(UID);
const profile = { id: UID, role: 'client', display_name: 'Esi', nickname: 'Esi_K', age: 24, language: 'en', theme: 'light', font_size: 'md', current_triage: 'general', streak_days: 2, share_location_in_crisis: false, settings: {} };

type Backend = { ai: 'on' | 'off'; reply?: string; error?: Record<string, unknown> };
let api: Backend = { ai: 'off' };
let fn: Backend = { ai: 'on' };
const calls: Array<{ to: 'api' | 'function'; auth: string; message: string; history: number }> = [];

const sse = (events: Array<[string, unknown]>) => events.map(([e, d]) => `event: ${e}\ndata: ${JSON.stringify(d)}\n\n`).join('');
/** What runChat sends: a reply, an error, or "not set up" when the server has no key */
function chatAnswer(b: Backend, cors: Record<string, string>) {
  const headers = { ...cors, 'Content-Type': 'text/event-stream', 'X-4Life-AI': b.ai };
  if (b.ai === 'off') {
    return { status: 200, headers, body: sse([['meta', { risk: 'none' }], ['done', { reply: '', suggestions: [], risk: 'none', model: 'openai/gpt-oss-120b', mode: 'cbt', error: { code: 'not_configured' } }]]) };
  }
  if (b.error) {
    return { status: 200, headers, body: sse([['meta', { risk: 'none' }], ['done', { reply: '', suggestions: [], risk: 'none', model: 'gemini-test', mode: 'cbt', error: b.error }]]) };
  }
  const reply = b.reply || 'A real answer.';
  return {
    status: 200,
    headers,
    body: sse([
      ['meta', { risk: 'none' }],
      ['delta', { text: reply.slice(0, 12) }],
      ['delta', { text: reply.slice(12) }],
      ['done', { reply, suggestions: ['Tell me more', 'Help me breathe', 'I feel better'], risk: 'none', model: 'openai/gpt-oss-120b', provider: 'groq', mode: 'cbt' }],
    ]),
  };
}

async function fakeSupabase(r: Route) {
  const req = r.request();
  const url = new URL(req.url());
  const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*', 'access-control-expose-headers': 'x-4life-ai' };
  if (req.method() === 'OPTIONS') return r.fulfill({ status: 204, headers: cors });
  const json = (status: number, body: unknown) => r.fulfill({ status, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const p = url.pathname;
  if (p === '/functions/v1/chat') {
    const body = JSON.parse(req.postData() || '{}');
    calls.push({ to: 'function', auth: req.headers()['authorization'] || '', message: body.message, history: (body.history || []).length });
    return r.fulfill(chatAnswer(fn, cors));
  }
  if (p === '/auth/v1/user') return json(200, { id: UID, email: 'esi@it.test', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' });
  if (p === '/auth/v1/logout') return r.fulfill({ status: 204, headers: cors });
  if (p.startsWith('/rest/v1/profiles')) {
    const one = (req.headers()['accept'] || '').includes('vnd.pgrst.object');
    return json(200, one ? profile : [profile]);
  }
  if (p.startsWith('/rest/v1/rpc/')) return json(200, null);
  if (p.startsWith('/rest/v1/')) return json(200, []);
  if (p.startsWith('/realtime/')) return r.abort();
  return json(404, {});
}

async function apiRoute(r: Route) {
  const body = JSON.parse(r.request().postData() || '{}');
  calls.push({ to: 'api', auth: r.request().headers()['authorization'] || '', message: body.message, history: (body.history || []).length });
  return r.fulfill(chatAnswer(api, {}));
}

const box = (p: Page) => p.locator('#chat-input');
const send = async (p: Page, text: string) => {
  await box(p).fill(text);
  await p.getByRole('button', { name: 'Send message' }).click();
};
const settled = (p: Page) => p.waitForFunction(() => !document.querySelector('[aria-label="Messages"] [role="status"]'), null, { timeout: 30000 });

try {
  for (const width of [390, 1280]) {
    const at = `${width}px`;
    const ctx = await browser.newContext({ viewport: { width, height: 860 }, serviceWorkers: 'block', reducedMotion: 'reduce' });
    await ctx.route('**/*', r => {
      const u = r.request().url();
      if (u.startsWith(FAKE)) return fakeSupabase(r);
      if (u.startsWith(`${HERE}/api/chat`)) return apiRoute(r);
      return u.startsWith(HERE) ? r.continue() : r.abort();
    });
    const p = await ctx.newPage();
    const errors: string[] = [];
    p.on('pageerror', e => errors.push(e.message));
    await p.goto(`${HERE}/auth/callback?next=chat#access_token=${TOKEN}&refresh_token=r1&expires_in=3600&expires_at=${Math.floor(Date.now() / 1000) + 3600}&token_type=bearer&type=signup`);
    await box(p).waitFor({ timeout: 60000 }); // the first load can be slow on a busy machine

    // The disclosure
    const note = await p.getByText(/is an AI\. It supports your recovery/).first().innerText();
    ok(/Groq, our main AI provider/.test(note) && /Google Gemini if Groq can’t answer/.test(note) && /saved only on this device/.test(note) && !/powered by Google Gemini/.test(note), `${at}: the disclosure says Groq first, Gemini as backup, chats saved on the device`);

    // 1. The live fault: /api has no key, the Supabase function has one
    calls.length = 0;
    api = { ai: 'off' };
    fn = { ai: 'on', reply: 'That sounds heavy. What happened just before the craving started?' };
    await send(p, 'I had a strong craving after work');
    await p.getByText('What happened just before the craving started?').last().waitFor();
    await settled(p);
    ok(calls.length === 2 && calls[0].to === 'api' && calls[1].to === 'function', `${at}: /api said it has no AI key, so the app asked the Supabase function`);
    ok(calls[1].auth === `Bearer ${TOKEN}`, `${at}: the function gets the person's sign-in, not just the public key`);
    ok((await p.getByText("isn't set up on this server yet").count()) === 0, `${at}: no "not set up" message when the other backend answered`);

    // 2. A follow-up keeps the conversation and goes the same way
    fn = { ai: 'on', reply: 'You noticed the pattern. What could you do differently tomorrow at that time?' };
    await send(p, 'It was right when I got home');
    await p.getByText('What could you do differently tomorrow').last().waitFor();
    await settled(p);
    ok(calls[3]?.to === 'function' && calls[3].history === 2, `${at}: the follow-up carries the earlier turns`);

    // 3. /api has a key: the function is never asked
    calls.length = 0;
    api = { ai: 'on', reply: 'Answered by this site. Shall we try a breathing exercise?' };
    await send(p, 'Thanks');
    await p.getByText('Shall we try a breathing exercise?').last().waitFor();
    await settled(p);
    ok(calls.length === 1 && calls[0].to === 'api', `${at}: when /api has a key, only /api is asked`);

    // 4. Main and backup both failed (on the backend that has keys)
    calls.length = 0;
    api = { ai: 'off' };
    fn = { ai: 'on', error: { code: 'overloaded', backupFailed: true } };
    await send(p, 'Are you there?');
    await p.getByText('Both our main AI service and its backup are unavailable right now').waitFor();
    await settled(p);
    ok(true, `${at}: when Groq and Gemini both fail, the person is told plainly`);

    // 5. Neither backend has a key: the honest message, no made-up reply
    calls.length = 0;
    api = { ai: 'off' };
    fn = { ai: 'off' };
    const bubbles = await p.locator('[aria-label="Messages"] > *').count();
    await send(p, 'Hello?');
    await p.getByText("The AI companion isn't set up on this server yet").last().waitFor();
    await settled(p);
    ok(calls.length === 2, `${at}: with no key anywhere, both backends were asked once each`);
    const added = (await p.locator('[aria-label="Messages"] > *').count()) - bubbles;
    ok(added <= 2, `${at}: only the person's message and the notice were added (no made-up reply)`);
    ok(errors.length === 0, `${at}: no page errors${errors.length ? ': ' + errors.join('; ') : ''}`);
    await ctx.close();
  }
  console.log(`All ${n} AI backend checks passed`);
} finally {
  await browser.close();
  await server.close();
}
process.exit(0);
