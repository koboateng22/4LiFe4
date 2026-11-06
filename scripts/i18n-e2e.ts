/**
 * Every language in real Chrome, phone-sized: the app opens in it, the page says which
 * language and reading direction it is in, no text is missing, and nothing overflows or is
 * cut off. One language is also switched to from the language menu, to check that the whole
 * app changes at once, that the choice survives a reload, and that the AI is asked to reply in it.
 *   npm run test:i18n:e2e        (needs Chrome: CHROME_PATH or /usr/bin/google-chrome)
 *   LANGS=fr,ar npm run test:i18n:e2e   to check only some
 */
import { readdirSync, readFileSync } from 'node:fs';
import { chromium, type Page } from 'playwright-core';
import { createServer } from 'vite';

let n = 0;
const ok = (c: unknown, w: string) => {
  if (!c) throw new Error('FAIL: ' + w);
  n++;
  console.log('ok ', w);
};

const all = readdirSync('src/locales').filter(d => d !== 'en' && !d.startsWith('.'));
const langs = process.env.LANGS ? process.env.LANGS.split(',') : all;
const words = (lang: string): Record<string, any> =>
  Object.assign({}, ...readdirSync(`src/locales/${lang}`).map(f => JSON.parse(readFileSync(`src/locales/${lang}/${f}`, 'utf8'))));
/** The words for an English text in a language (also when the text sits in a <0>tag</0>) */
const say = (w: Record<string, any>, key: string): string => {
  const v = w[key] ?? w[`<0>${key}</0>`];
  const s = typeof v === 'string' ? v : v?.other || key;
  return s.replace(/<\/?\d+>/g, '');
};

for (const k of ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY', 'VITE_SUPABASE_PUBLISHABLE_KEY']) delete process.env[k];
const PORT = 5186;
const server = await createServer({ server: { port: PORT, strictPort: true }, logLevel: 'error', envDir: '/nonexistent' });
await server.listen();
const URL = `http://localhost:${PORT}/`;
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox'] });

/** Controls that cut off their own text, things outside the screen, or a page that scrolls sideways */
const layoutProblems = (p: Page) =>
  p.evaluate(() => {
    const out: string[] = [];
    if (document.documentElement.scrollWidth > innerWidth + 1) out.push(`page is ${document.documentElement.scrollWidth}px wide`);
    for (const el of document.querySelectorAll<HTMLElement>('button, [role=tab], [role=radio], a, h1, h2, h3, label')) {
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden' || el.closest('.sr-only, [aria-hidden="true"], .leaflet-container, .no-scrollbar, .fade-x')) continue;
      const r = el.getBoundingClientRect();
      if (!r.width) continue;
      const name = `${el.tagName} "${(el.innerText || '').trim().slice(0, 30)}"`;
      if (cs.overflowX !== 'visible' && !el.matches('.truncate, .line-clamp-2') && el.scrollWidth > el.clientWidth + 2) out.push(`${name} cuts off its text`);
      let parent = el.parentElement;
      let clipped = false;
      while (parent && parent !== document.body) {
        if (getComputedStyle(parent).overflowX !== 'visible') {
          clipped = true;
          break;
        }
        parent = parent.parentElement;
      }
      if (!clipped && (r.right > innerWidth + 1 || r.left < -1)) out.push(`${name} leaves the screen`);
    }
    return [...new Set(out)];
  });

try {
  for (const lang of langs) {
    const w = words(lang);
    const ctx = await browser.newContext({ viewport: { width: 360, height: 740 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, serviceWorkers: 'block', reducedMotion: 'reduce' });
    await ctx.route('**/*', r => (r.request().url().startsWith(URL) ? r.continue() : r.abort()));
    const p = await ctx.newPage();
    p.setDefaultTimeout(15000);
    const problems: string[] = [];
    p.on('console', m => /\[i18n\]/.test(m.text()) && problems.push(m.text()));
    p.on('pageerror', e => problems.push(e.message));
    await p.goto(URL);
    await p.evaluate(l => localStorage.setItem('4life_user_language', l), lang);
    await p.reload();
    const signIn = say(w, 'Sign In');
    // the Sign In / Create Account switch (some languages use the same words for the tab and the button)
    const tabs = p.locator('button[aria-pressed]');
    await tabs.filter({ hasText: signIn }).first().waitFor();
    const html = await p.evaluate(() => ({ lang: document.documentElement.lang, dir: document.documentElement.dir }));
    ok(html.lang === lang && html.dir === (['ar', 'ur'].includes(lang) ? 'rtl' : 'ltr'), `${lang}: the page is marked as ${lang}, ${html.dir}`);
    const bad: string[] = [...(await layoutProblems(p)).map(x => `sign in: ${x}`)];
    await tabs.filter({ hasText: say(w, 'Create Account') }).first().click();
    bad.push(...(await layoutProblems(p)).map(x => `sign-up: ${x}`));
    await tabs.filter({ hasText: signIn }).first().click();
    await p.locator('button', { hasText: 'Kwame Mensah' }).click();
    await p.locator('#main-content').waitFor();
    bad.push(...(await layoutProblems(p)).map(x => `home: ${x}`));
    for (const key of ['Therapy', 'Village', 'EMS']) {
      await p.locator('nav[aria-label] button', { hasText: say(w, key) }).last().click();
      await p.waitForTimeout(300);
      bad.push(...(await layoutProblems(p)).map(x => `${key}: ${x}`));
    }
    ok(bad.length === 0, `${lang}: nothing cut off or off-screen at 360 px${bad.length ? ': ' + bad.slice(0, 6).join('; ') : ''}`);
    ok(problems.length === 0, `${lang}: no missing texts or errors${problems.length ? ': ' + problems.slice(0, 3).join('; ') : ''}`);
    await ctx.close();
  }

  // Switching from the menu: the whole app changes at once, it is remembered, and the AI is told
  {
    const lang = all.includes('fr') ? 'fr' : all[0];
    const w = words(lang);
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 }, serviceWorkers: 'block', reducedMotion: 'reduce' });
    let chatBody: any = null;
    await ctx.route('**/*', r => {
      const u = r.request().url();
      if (u.includes('/api/chat')) {
        chatBody = JSON.parse(r.request().postData() || '{}');
        return r.abort();
      }
      return u.startsWith(URL) ? r.continue() : r.abort();
    });
    const p = await ctx.newPage();
    p.setDefaultTimeout(15000);
    await p.goto(URL);
    await p.locator('button', { hasText: 'Kwame Mensah' }).click();
    await p.locator('#main-content').waitFor();
    ok(await p.getByRole('heading', { name: 'How are you right now?' }).isVisible(), 'the app starts in English');
    await p.keyboard.press('Control+k');
    await p.keyboard.type('language');
    await p.keyboard.press('Enter');
    await p.getByRole('dialog').getByRole('button', { name: new RegExp(JSON.parse(JSON.stringify(lang === 'fr' ? 'Français' : lang))) }).first().click();
    await p.getByRole('heading', { name: say(w, 'How are you right now?') }).waitFor();
    ok(true, `${lang}: choosing it changes the page straight away, without a reload`);
    ok(await p.locator('#main-navigation').getByText(say(w, 'Global Village')).isVisible(), `${lang}: the menu changes too`);
    await p.reload();
    await p.locator('button', { hasText: 'Kwame Mensah' }).click();
    await p.getByRole('heading', { name: say(w, 'How are you right now?') }).waitFor();
    ok(true, `${lang}: the choice is still there after a reload`);
    await p.locator('#main-navigation button', { hasText: say(w, 'AI CBT Therapy') }).click();
    const box = p.getByRole('textbox').last();
    await box.fill('Bonjour');
    await box.press('Enter');
    await p.waitForTimeout(800);
    ok(chatBody?.userProfile?.language === lang, `${lang}: the chat request asks the AI to reply in ${lang}`);
    await ctx.close();
  }
  console.log(`All ${n} language checks passed`);
} finally {
  await browser.close();
  await server.close();
}
process.exit(0);
