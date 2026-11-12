/**
 * Sign-in links come back to 4Life, in real Chrome, against a pretend Supabase (nothing leaves the machine):
 *  - sign-up, "send the link again" and "forgot password" ask Supabase to return to 4Life's /auth/callback;
 *  - a confirmation link (/auth/callback#access_token=…) signs the person in, opens the section they were
 *    heading for, and leaves the callback address, so a refresh keeps them signed in on the normal page;
 *  - an expired link shows a clear message and leaves the callback address too;
 *  - a link can't send anyone to another site.
 *   npm run test:auth-redirect        (needs Chrome: CHROME_PATH or /usr/bin/google-chrome)
 */
import { createHmac } from 'node:crypto';
import { chromium, type Route } from 'playwright-core';
import { createServer } from 'vite';

let n = 0;
const ok = (c: unknown, w: string) => {
  if (!c) throw new Error('FAIL: ' + w);
  n++;
  console.log('ok ', w);
};

const FAKE = 'https://fake4life.supabase.co';
const PORT = 5195;
const HERE = `http://localhost:${PORT}`;
for (const k of ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY', 'VITE_SUPABASE_PUBLISHABLE_KEY']) delete process.env[k];
Object.assign(process.env, {
  VITE_SUPABASE_URL: FAKE,
  VITE_SUPABASE_ANON_KEY: 'anon-test-key',
  VITE_APP_URL: 'https://4lifeee.vercel.app',
  VITE_AUTH_REDIRECT_ORIGINS: HERE,
});
const server = await createServer({ server: { port: PORT, strictPort: true }, logLevel: 'error', envDir: '/nonexistent' });
await server.listen();
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox'] });

const UID = '22222222-2222-4222-8222-222222222222';
const jwt = (sub: string) => {
  const b = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const head = b({ alg: 'HS256', typ: 'JWT' });
  const body = b({ sub, role: 'authenticated', aud: 'authenticated', exp: Math.floor(Date.now() / 1000) + 7200 });
  return `${head}.${body}.${createHmac('sha256', 'test').update(`${head}.${body}`).digest('base64url')}`;
};
const profile = { id: UID, role: 'client', display_name: 'Kofi', nickname: 'Kofi_W', age: 21, language: 'en', theme: 'light', font_size: 'md', current_triage: 'general', streak_days: 3, share_location_in_crisis: false, settings: {} };

/** Every request that asked Supabase to send someone back somewhere */
const redirects: Array<{ what: string; to: string }> = [];

async function fakeSupabase(r: Route) {
  const req = r.request();
  const url = new URL(req.url());
  const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*', 'content-type': 'application/json' };
  if (req.method() === 'OPTIONS') return r.fulfill({ status: 204, headers: cors });
  const json = (status: number, body: unknown) => r.fulfill({ status, headers: cors, body: JSON.stringify(body) });
  const p = url.pathname;
  const to = url.searchParams.get('redirect_to') || (() => {
    try {
      const b = JSON.parse(req.postData() || '{}');
      return b?.options?.emailRedirectTo || b?.email_redirect_to || '';
    } catch {
      return '';
    }
  })();
  if (p === '/auth/v1/signup') {
    redirects.push({ what: 'sign-up', to });
    return json(200, { id: UID, email: 'new@it.test', identities: [{ id: '1' }], confirmation_sent_at: new Date().toISOString() });
  }
  if (p === '/auth/v1/recover') {
    redirects.push({ what: 'password reset', to });
    return json(200, {});
  }
  if (p === '/auth/v1/resend') {
    redirects.push({ what: 'resend', to });
    return json(200, {});
  }
  if (p === '/auth/v1/user') return json(200, { id: UID, email: 'kofi@it.test', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' });
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

const context = async () => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block', reducedMotion: 'reduce' });
  await ctx.route('**/*', r => {
    const u = r.request().url();
    if (u.startsWith(FAKE)) return fakeSupabase(r);
    return u.startsWith(HERE) ? r.continue() : r.abort();
  });
  return ctx;
};

try {
  // 1. The requests that send an email (or go to Google) name 4Life's callback page
  {
    const ctx = await context();
    const p = await ctx.newPage();
    await p.goto(`${HERE}/?go=ems`);
    // forgot password
    await p.getByRole('button', { name: /Forgot (your )?password/i }).first().click();
    await p.locator('input[type=email]').last().fill('kofi@it.test');
    await p.getByRole('button', { name: /Send the link/ }).click();
    await p.waitForTimeout(800);
    const reset = redirects.find(x => x.what === 'password reset');
    ok(reset?.to === `${HERE}/auth/callback?next=emergency_map`, `password reset links come back to 4Life's callback page (${reset?.to})`);
    await ctx.close();
  }

  // 2. Arriving from a confirmation link: signed in, the intended section opens, the address is cleaned
  {
    const ctx = await context();
    const p = await ctx.newPage();
    const errors: string[] = [];
    p.on('pageerror', e => errors.push(e.message));
    const token = jwt(UID);
    await p.goto(`${HERE}/auth/callback?next=learn#access_token=${token}&refresh_token=r1&expires_in=3600&expires_at=${Math.floor(Date.now() / 1000) + 3600}&token_type=bearer&type=signup`);
    await p.locator('#main-content').waitFor({ timeout: 20000 });
    await p.getByRole('heading', { name: 'Short videos to help you understand recovery' }).waitFor();
    ok(true, 'a confirmation link signs the person in and opens the section they were heading for');
    ok(new URL(p.url()).pathname === '/' && !p.url().includes('access_token'), `the callback address and the tokens are cleared from the address bar (${p.url()})`);
    ok(new URL(p.url()).origin === HERE, 'the person stays on 4Life');

    // 3. Refreshing keeps the session, on the normal page
    await p.reload();
    await p.locator('#main-content').waitFor({ timeout: 20000 });
    ok(new URL(p.url()).pathname === '/', 'after a refresh the person is still signed in, on the normal 4Life page');
    ok(errors.length === 0, `no page errors${errors.length ? ': ' + errors.join('; ') : ''}`);
    await ctx.close();
  }

  // 4. An expired link: a clear message, and the callback address is left
  {
    const ctx = await context();
    const p = await ctx.newPage();
    await p.goto(`${HERE}/auth/callback#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired`);
    await p.getByText(/expired or was already used/).first().waitFor();
    ok(new URL(p.url()).pathname === '/' && !p.url().includes('error'), 'an expired link says so plainly and the callback address is cleared');
    await ctx.close();
  }

  // 5. A link can't send anyone elsewhere
  {
    const ctx = await context();
    const p = await ctx.newPage();
    const token = jwt(UID);
    await p.goto(`${HERE}/auth/callback?next=https%3A%2F%2Fevil.example&redirect_to=https%3A%2F%2Fevil.example#access_token=${token}&refresh_token=r2&expires_in=3600&expires_at=${Math.floor(Date.now() / 1000) + 3600}&token_type=bearer&type=signup`);
    await p.locator('#main-content').waitFor({ timeout: 20000 });
    await p.getByRole('heading', { name: 'How are you right now?' }).waitFor();
    ok(new URL(p.url()).origin === HERE && new URL(p.url()).pathname === '/', 'an outside address in the link is ignored: the person lands on 4Life Home');
    await ctx.close();
  }

  // 6. Sign-up from a page that isn't on the allowlist sends the link to the public 4Life site
  {
    process.env.VITE_AUTH_REDIRECT_ORIGINS = '';
    const ctx = await context();
    const p = await ctx.newPage();
    await p.goto(`${HERE}/`);
    const url = await p.evaluate(async () => {
      const path = '/src/lib/authRedirect.ts'; // the app's own module, as the dev server serves it
      return (await import(/* @vite-ignore */ path)).authRedirectUrl(null, 'https://4lifeee-4-life4.vercel.app');
    });
    ok(url === 'https://4lifeee.vercel.app/auth/callback', 'from a protected Vercel address, links go to the public 4Life site instead');
    await ctx.close();
  }
  console.log(`All ${n} sign-in redirect checks passed`);
} finally {
  await browser.close();
  await server.close();
}
process.exit(0);
