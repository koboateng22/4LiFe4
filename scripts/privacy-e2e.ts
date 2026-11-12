/**
 * The Privacy Policy in real Chrome:
 *  - /privacy opens directly, without signing in, survives a refresh, and has its title, date, summary,
 *    contents and 18 sections; contents links and an address with #section go to the section; search
 *    narrows the sections; outside links are https and open in a new tab; missing operator details show as
 *    marked placeholders; light and dark themes; phones: folded contents and no sideways scrolling.
 *  - Links open it from the sign-in page, sign-up (next to the safe-space promise), Settings → Privacy and
 *    data, the app footer, the therapist workspace footer and quick search.
 *  - The corrected statements are shown, and the old ones are gone.
 *   npm run test:privacy        (needs Chrome: CHROME_PATH or /usr/bin/google-chrome)
 */
import { chromium, type BrowserContext, type Page } from 'playwright-core';
import { createServer } from 'vite';

let n = 0;
const ok = (c: unknown, w: string) => {
  if (!c) throw new Error('FAIL: ' + w);
  n++;
  console.log('ok ', w);
};

for (const k of ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY', 'VITE_SUPABASE_PUBLISHABLE_KEY', 'VITE_PRIVACY_OPERATOR', 'VITE_PRIVACY_EMAIL', 'VITE_PRIVACY_ADDRESS']) delete process.env[k];
const PORT = 5200;
const server = await createServer({ server: { port: PORT, strictPort: true }, logLevel: 'error', envDir: '/nonexistent' });
await server.listen();
const HERE = `http://localhost:${PORT}`;
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox'] });

const context = async (width: number, scheme: 'light' | 'dark' = 'light') => {
  const ctx = await browser.newContext({ viewport: { width, height: 860 }, colorScheme: scheme, serviceWorkers: 'block', reducedMotion: 'reduce' });
  await ctx.route('**/*', r => (r.request().url().startsWith(HERE) ? r.continue() : r.abort()));
  return ctx;
};
/** Click something that opens the policy in a new tab; return that tab once the policy shows */
const opensPolicy = async (ctx: BrowserContext, click: () => Promise<unknown>) => {
  const [tab] = await Promise.all([ctx.waitForEvent('page'), click()]);
  await tab.getByRole('heading', { level: 1, name: 'Privacy Policy' }).waitFor({ timeout: 30000 });
  const url = new URL(tab.url()).pathname;
  await tab.close();
  return url === '/privacy';
};
const wide = (p: Page) => p.evaluate(() => document.documentElement.scrollWidth - innerWidth);

try {
  // ---------- The page itself, on a computer ----------
  {
    const ctx = await context(1280);
    const p = await ctx.newPage();
    const errors: string[] = [];
    p.on('pageerror', e => errors.push(e.message));
    await p.goto(`${HERE}/privacy`);
    await p.getByRole('heading', { level: 1, name: 'Privacy Policy' }).waitFor({ timeout: 30000 });
    ok(true, '/privacy opens directly, without signing in');
    ok((await p.title()).startsWith('Privacy Policy'), `the tab has a descriptive title (${await p.title()})`);
    ok(await p.getByText(/Last updated 12 November 2026/).isVisible(), 'it shows when it was last updated');
    ok(await p.getByRole('heading', { name: 'In short' }).isVisible(), 'a short summary comes first');
    const h2 = await p.locator('main section[id] h2').count();
    ok(h2 === 18, `all 18 sections are there (${h2})`);
    ok(await p.getByText('Draft under review.').isVisible(), 'it says plainly that it is a draft under review');
    const placeholders = await p.locator('mark[data-placeholder]').count();
    ok(placeholders >= 3 && (await p.getByTestId('missing-contacts').isVisible()), `missing operator details show as marked placeholders, not invented ones (${placeholders})`);
    ok((await p.locator('[data-pending="true"]').count()) > 0, 'open questions are shown as “To be confirmed”');

    const toc = p.getByRole('navigation', { name: 'Contents' });
    ok((await toc.locator('a[href^="#"]:visible').count()) === 18, 'the contents list every section');
    const tocBox = await toc.boundingBox();
    await toc.getByRole('link', { name: 'AI processing and AI providers' }).click();
    await p.waitForTimeout(400);
    const top = await p.locator('#ai-processing').evaluate(el => el.getBoundingClientRect().top);
    ok(top >= 0 && top < 200 && p.url().endsWith('#ai-processing'), `a contents link goes to its section (${Math.round(top)}px from the top)`);
    const tocBox2 = await toc.boundingBox();
    ok(tocBox && tocBox2 && Math.abs(tocBox2.y - 96) < 40, 'the contents stay beside the text while reading');

    await p.reload();
    await p.getByRole('heading', { level: 1, name: 'Privacy Policy' }).waitFor();
    await p.waitForTimeout(400);
    const after = await p.locator('#ai-processing').evaluate(el => el.getBoundingClientRect().top);
    ok(after >= -5 && after < 200, 'a refresh keeps the page, and an address with #section opens at that section');

    await p.getByRole('searchbox', { name: 'Search the policy' }).fill('Gemini');
    const found = await p.locator('main section[id] h2').count();
    ok(found > 1 && found < 18 && (await p.getByText(/sections mention “Gemini”/).isVisible()), `search narrows the sections (${found} mention Gemini)`);
    await p.getByRole('searchbox', { name: 'Search the policy' }).fill('zzzz-nothing');
    ok(await p.getByText('No section mentions “zzzz-nothing”.').isVisible(), 'a search with no match says so');
    await p.getByRole('searchbox', { name: 'Search the policy' }).fill('');

    const outside = await p.locator('main a[href^="http"]').evaluateAll(as => as.map(a => ({ href: (a as HTMLAnchorElement).href, target: a.getAttribute('target'), rel: a.getAttribute('rel') || '' })));
    ok(outside.length >= 8 && outside.every(a => a.href.startsWith('https://') && a.target === '_blank' && /noopener/.test(a.rel)), `outside policy links are https and open in a new tab (${outside.length})`);
    const hosts = new Set(outside.map(a => new URL(a.href).hostname));
    ok(['supabase.com', 'vercel.com', 'groq.com', 'ai.google.dev', 'policies.google.com', 'osmfoundation.org', 'dataprotection.org.gh'].every(h => hosts.has(h)), 'it links to each provider’s own policy and to the Data Protection Commission');

    // What it says about the things that matter most
    const text = await p.locator('main').innerText();
    ok(/Groq\*?\*? is the main provider/i.test(text.replace(/\*\*/g, '')) || /Groq is the main provider/.test(text), 'AI: Groq is named as the main provider');
    ok(/Google Gemini is the backup/.test(text) && /only when Groq cannot answer/.test(text), 'AI: Gemini is named as the backup, used only when Groq cannot answer');
    ok(/4Life does not contact emergency services or send an ambulance for you/.test(text), 'SOS: it says 4Life does not contact emergency services');
    ok(/Counsellors cannot see your AI chat conversations/.test(text), 'counsellors: what they cannot see is listed');
    ok(!/Private and confidential|stays on this device unless you choose/.test(text), 'none of the old, inaccurate claims');

    await p.locator('a', { hasText: 'Back to 4Life' }).click();
    await p.getByRole('button', { name: /Sign In/ }).first().waitFor({ timeout: 30000 });
    ok(new URL(p.url()).pathname === '/', '“Back to 4Life” returns to the app');
    ok(errors.length === 0, `no page errors${errors.length ? ': ' + errors.join('; ') : ''}`);
    await ctx.close();
  }

  // ---------- Dark theme ----------
  {
    const ctx = await context(1280, 'dark');
    const p = await ctx.newPage();
    await p.goto(`${HERE}/privacy`);
    await p.getByRole('heading', { level: 1, name: 'Privacy Policy' }).waitFor({ timeout: 30000 });
    const look = await p.evaluate(() => ({ dark: document.documentElement.classList.contains('dark'), bg: getComputedStyle(document.querySelector('.min-h-screen')!).backgroundColor, ink: getComputedStyle(document.querySelector('h1')!).color }));
    const lum = (c: string) => { const [r, g, b] = (c.match(/\d+/g) || []).map(Number); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
    ok(look.dark && lum(look.bg) < 60 && lum(look.ink) > 180, `the system dark theme applies (background ${look.bg}, text ${look.ink})`);
    await ctx.close();
  }

  // ---------- Phones ----------
  {
    const ctx = await context(390);
    const p = await ctx.newPage();
    await p.goto(`${HERE}/privacy`);
    await p.getByRole('heading', { level: 1, name: 'Privacy Policy' }).waitFor({ timeout: 30000 });
    ok((await wide(p)) <= 1, '390px: no sideways scrolling');
    const contents = p.getByRole('button', { name: 'Contents' });
    ok((await contents.getAttribute('aria-expanded')) === 'false', '390px: the contents are folded away');
    await contents.click();
    await p.getByRole('navigation', { name: 'Contents' }).getByRole('link', { name: 'Children and young people' }).click();
    await p.waitForTimeout(400);
    const top = await p.locator('#young-people').evaluate(el => el.getBoundingClientRect().top);
    ok(top >= 0 && top < 200 && (await contents.getAttribute('aria-expanded')) === 'false', '390px: picking a section goes there and folds the contents again');
    ok((await p.locator('table:visible').count()) === 0 && (await p.locator('main ul.sm\\:hidden li:visible').count()) > 10, '390px: tables become readable cards');
    ok((await wide(p)) <= 1, '390px: still no sideways scrolling with the cards');
    await ctx.close();
  }

  // ---------- Links from the app ----------
  {
    const ctx = await context(1280);
    const p = await ctx.newPage();
    await p.goto(HERE);
    // sign-in page
    const signInLink = p.locator('a[href="/privacy"]', { hasText: 'Privacy Policy' }).first();
    await signInLink.waitFor({ timeout: 30000 });
    ok(await opensPolicy(ctx, () => signInLink.click()), 'sign-in page: the Privacy Policy link opens the policy in a new tab');
    ok(!(await p.getByText('Private and confidential').count()), 'sign-in page: “Private and confidential” is gone');

    // sign-up: next to the safe-space promise
    await p.getByRole('button', { name: 'Create Account' }).click();
    await p.getByLabel('Your name').fill('Esi Owusu');
    await p.getByLabel('Your age').fill('22');
    const next = p.getByRole('button', { name: 'Continue' });
    await next.click();
    await p.getByLabel('Email address').fill('esi@example.org');
    await next.click();
    await p.getByLabel('Choose a PIN').fill('5678');
    await p.getByLabel('Type it again').fill('5678');
    await next.click();
    await next.click();
    const promise = p.getByText(/I agree to the safe-space promise: I will treat others/);
    await promise.waitFor();
    ok(!(await p.getByText(/my recovery data stays private/).count()), 'sign-up: the promise no longer claims “my recovery data stays private”');
    const signUpLink = p.getByText(/Before you create your account, please read the/).getByRole('link', { name: 'Privacy Policy' });
    ok(await opensPolicy(ctx, () => signUpLink.click()), 'sign-up: the link next to the promise opens the policy (and the form stays as it was)');
    ok((await p.getByLabel('Choose a PIN').count()) === 0 && (await promise.isVisible()), 'sign-up: the person is still on the last step afterwards');
    await ctx.close();
  }
  {
    const ctx = await context(1280);
    const p = await ctx.newPage();
    await p.goto(HERE);
    await p.locator('button', { hasText: 'Kwame Mensah' }).click();
    await p.locator('#main-content').waitFor({ timeout: 30000 });
    // quick search (first, while the page has the keyboard)
    await p.keyboard.press('Control+k');
    await p.getByRole('dialog').waitFor();
    await p.keyboard.type('privacy policy');
    ok(await opensPolicy(ctx, () => p.keyboard.press('Enter')), 'quick search: “Privacy Policy” opens the policy');
    ok((await p.getByRole('dialog').count()) === 0, 'quick search closes after opening it');
    // footer
    ok(await opensPolicy(ctx, () => p.locator('footer a[href="/privacy"]').click()), 'app footer: the Privacy Policy link opens the policy');
    ok(!(await p.getByText('Confidential and non-judgmental').count()), 'app footer: “Confidential” is gone');
    // Settings → Privacy and data
    await p.bringToFront();
    await p.locator('#main-navigation button[aria-label="Settings"]').click();
    await p.getByRole('navigation', { name: 'Settings sections' }).getByRole('button', { name: 'Privacy and data' }).click();
    await p.getByText(/kept in 4Life’s cloud database, protected by access rules/).waitFor();
    ok(!(await p.getByText('Your information stays on this device unless you choose to share it.').count()), 'Settings: the inaccurate “stays on this device” sentence is replaced');
    ok(await opensPolicy(ctx, () => p.getByText(/to see exactly what is stored/).getByRole('link', { name: 'Privacy Policy' }).click()), 'Settings → Privacy and data: the link opens the policy');
    await ctx.close();
  }
  {
    const ctx = await context(390);
    const p = await ctx.newPage();
    await p.goto(HERE);
    await p.getByRole('radio', { name: /Therapist/ }).click();
    await p.locator('button', { hasText: 'Ama Konadu' }).click();
    const link = p.locator('footer a[href="/privacy"]');
    await link.waitFor({ timeout: 30000 });
    ok(await opensPolicy(ctx, () => link.click()), '390px therapist workspace: the footer link opens the policy');
    ok(await p.getByText(/Keep client information confidential/).isVisible(), 'therapist footer: the wording is an instruction, not a promise');
    await ctx.close();
  }
  console.log(`All ${n} privacy page checks passed`);
} finally {
  await browser.close();
  await server.close();
}
process.exit(0);
