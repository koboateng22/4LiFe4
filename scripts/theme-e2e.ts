/**
 * The theme in real Chrome (device mode): it is chosen only in Settings → Appearance
 * (and the therapist's Profile), applies to the whole app at once, follows the device
 * when "System default" is chosen, and is remembered after a reload and a log out.
 *   npm run test:theme        (needs Chrome: CHROME_PATH or /usr/bin/google-chrome)
 */
import { chromium, type Page } from 'playwright-core';
import { createServer } from 'vite';

let n = 0;
const ok = (c: unknown, w: string) => {
  if (!c) throw new Error('FAIL: ' + w);
  n++;
  console.log('ok ', w);
};

for (const k of ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY', 'VITE_SUPABASE_PUBLISHABLE_KEY']) delete process.env[k];
const PORT = 5187;
const server = await createServer({ server: { port: PORT, strictPort: true }, logLevel: 'error', envDir: '/nonexistent' });
await server.listen();
const URL = `http://localhost:${PORT}/`;
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox'] });

const shown = (p: Page) => p.evaluate(() => (document.documentElement.classList.contains('dark') ? 'dark' : 'light'));
/** The page background really is dark or light (not only the class). Waits up to 3 s for colours to settle. */
const looks = async (p: Page, expect?: 'dark' | 'light') => {
  const read = () =>
    p.evaluate(() => {
      const [r, g, b] = (getComputedStyle(document.body).backgroundColor.match(/\d+/g) || ['255', '255', '255']).map(Number);
      return (r + g + b) / 3 < 100 ? 'dark' : 'light';
    });
  const until = Date.now() + 3000;
  let v = await read();
  while (expect && v !== expect && Date.now() < until) {
    await p.waitForTimeout(150);
    v = await read();
  }
  return v;
};
/** Any control anywhere on screen that switches the theme */
const themeControls = (p: Page) =>
  p.evaluate(
    () =>
      [...document.querySelectorAll('button, [role=menuitem], a')].filter(el => {
        const label = `${el.getAttribute('aria-label') || ''} ${el.getAttribute('title') || ''} ${(el as HTMLElement).innerText || ''}`;
        return /theme|light mode|dark mode/i.test(label) && el.getBoundingClientRect().width > 0;
      }).length
  );
const go = (p: Page, names: string[]) =>
  p.evaluate(names => {
    const b = [...document.querySelectorAll<HTMLButtonElement>('nav button')].find(x => {
      const r = x.getBoundingClientRect();
      const text = x.innerText.trim().split('\n')[0];
      return r.width && r.left >= 0 && r.right <= innerWidth && names.includes(text);
    });
    if (!b) throw new Error('no nav button ' + names);
    b.click();
  }, names);
/** Account menu → Settings and profile → Appearance (works at every screen size) */
const openAppearance = async (p: Page) => {
  const account = p.getByRole('button', { name: /account menu/i });
  if (await account.isVisible()) {
    await account.click();
    await p.getByRole('menuitem', { name: /Settings and profile/ }).click();
  } else {
    // phones: the menu button opens the side menu
    await p.getByRole('button', { name: /^Open menu$/ }).click();
    await p.locator('#main-navigation').getByRole('button', { name: /^Settings/ }).first().click();
  }
  await p.locator('#main-content').getByRole('button', { name: /^Appearance$/ }).click();
};
const signIn = async (p: Page) => {
  await p.locator('button', { hasText: 'Kwame Mensah' }).click();
  await p.locator('#main-content').waitFor();
};

try {
  for (const width of [390, 1280]) {
    const ctx = await browser.newContext({ viewport: { width, height: 860 }, colorScheme: 'light', serviceWorkers: 'block', reducedMotion: 'reduce' });
    await ctx.route('**/*', r => (r.request().url().startsWith(URL) ? r.continue() : r.abort()));
    const p = await ctx.newPage();
    const errors: string[] = [];
    p.on('pageerror', e => errors.push(e.message));
    const at = `${width}px`;

    // 1. Nothing chosen yet: the device decides, on the sign-in page too, and there is no theme button there
    await p.goto(URL);
    await p.locator('button', { hasText: 'Kwame Mensah' }).waitFor();
    ok((await shown(p)) === 'light' && (await looks(p, 'light')) === 'light', `${at}: with nothing chosen, a light device gets the light theme`);
    await p.emulateMedia({ colorScheme: 'dark' });
    await p.waitForFunction(() => document.documentElement.classList.contains('dark'));
    ok((await looks(p, 'dark')) === 'dark', `${at}: …and it follows the device to dark straight away`);
    ok((await themeControls(p)) === 0, `${at}: the sign-in page has no theme button`);
    await p.emulateMedia({ colorScheme: 'light' });

    // 2. Home and the top bar have no theme controls, nor the account menu
    await signIn(p);
    ok((await themeControls(p)) === 0, `${at}: Home and the top bar have no theme controls`);
    await p.getByRole('button', { name: /account menu/i }).click().catch(() => {});
    ok((await themeControls(p)) === 0, `${at}: the account menu has no theme switch`);
    await p.keyboard.press('Escape');

    // 3. Settings → Appearance: three choices; Dark applies everywhere at once
    await openAppearance(p);
    const group = p.getByRole('group', { name: 'Theme' });
    ok((await group.getByRole('button').count()) === 3, `${at}: Appearance offers Light, Dark and System default`);
    ok((await group.getByRole('button', { name: /System default/ }).getAttribute('aria-pressed')) === 'true', `${at}: System default is chosen until the person picks one`);
    await group.getByRole('button', { name: /^Dark/ }).click();
    await p.waitForTimeout(400);
    ok((await shown(p)) === 'dark' && (await looks(p, 'dark')) === 'dark', `${at}: choosing Dark changes the page straight away`);
    ok((await p.evaluate(() => localStorage.getItem('4life_user_theme'))) === 'dark', `${at}: the choice is saved`);
    const sections: Array<[string, string[]]> = [
      ['Home', ['Home']],
      ['AI CBT', ['Therapy', 'AI CBT Therapy']],
      ['Global Village', ['Village', 'Global Village']],
      ['Instant EMS', ['EMS', 'Instant EMS']],
    ];
    for (const [name, labels] of sections) {
      await go(p, labels);
      await p.waitForSelector('#main-content h1, #main-content h2');
      await p.waitForSelector('#main-content [class*="bg-surface"]');
      const card = await p.evaluate(() => {
        // a card on the page (cards use the surface colour)
        const el = document.querySelector('#main-content [class*="bg-surface"]');
        const [r, g, b] = (el ? getComputedStyle(el).backgroundColor : '').match(/\d+/g)?.map(Number) || [255, 255, 255];
        return (r + g + b) / 3;
      });
      ok((await looks(p, 'dark')) === 'dark' && card < 110, `${at}: ${name} is dark too`);
    }
    // a dialog and the quick search follow it
    await p.keyboard.press('Control+k');
    const dlg = p.getByRole('dialog').first();
    await dlg.waitFor();
    const dlgBg = await dlg.evaluate(el => {
      const box = el.querySelector('[class*="bg-surface"]') || el;
      return (getComputedStyle(box).backgroundColor.match(/\d+/g) || []).slice(0, 3).map(Number).reduce((a, b) => a + b, 0) / 3;
    });
    ok(dlgBg < 110, `${at}: dialogs (quick search) are dark too`);
    await p.keyboard.press('Escape');

    // 4. Remembered after a reload, before the app has even started (no flash)
    await p.reload({ waitUntil: 'commit' });
    await p.waitForSelector('html.dark', { state: 'attached', timeout: 5000 });
    ok(await p.evaluate(() => !!document.getElementById('splash') || document.documentElement.classList.contains('dark')), `${at}: after a reload the page is dark from the very first paint`);
    await signIn(p).catch(() => {});
    ok((await shown(p)) === 'dark', `${at}: and stays dark once the app is open`);

    // 5. System default follows the device while the app is open
    await openAppearance(p);
    await p.getByRole('group', { name: 'Theme' }).getByRole('button', { name: /System default/ }).click();
    ok((await shown(p)) === 'light', `${at}: System default on a light device shows light`);
    await p.emulateMedia({ colorScheme: 'dark' });
    await p.waitForFunction(() => document.documentElement.classList.contains('dark'));
    ok(true, `${at}: …and switches to dark when the device does, without a reload`);
    await p.emulateMedia({ colorScheme: 'light' });

    // 6. Log out and back in: the choice is kept
    await p.getByRole('group', { name: 'Theme' }).getByRole('button', { name: /^Light/ }).click();
    await p.emulateMedia({ colorScheme: 'dark' });
    ok((await shown(p)) === 'light', `${at}: Light stays light even on a dark device`);
    if (await p.getByRole('button', { name: /account menu/i }).isVisible()) {
      await p.getByRole('button', { name: /account menu/i }).click();
      await p.getByRole('menuitem', { name: /Log out/ }).click();
    } else {
      await p.locator('#main-content').getByRole('button', { name: /^Log out$/ }).first().click();
    }
    await p.locator('button', { hasText: 'Kwame Mensah' }).waitFor();
    ok((await shown(p)) === 'light', `${at}: after logging out the sign-in page keeps the chosen theme`);
    await signIn(p);
    ok((await shown(p)) === 'light', `${at}: and so does the app after signing back in`);
    await p.emulateMedia({ colorScheme: 'light' });

    // 7. The quick search's "Appearance" opens Settings → Appearance
    await p.keyboard.press('Control+k');
    await p.keyboard.type('appearance');
    await p.keyboard.press('Enter');
    await p.getByRole('group', { name: 'Theme' }).waitFor();
    ok(true, `${at}: quick search "Appearance" opens the theme settings`);
    ok(errors.length === 0, `${at}: no page errors${errors.length ? ': ' + errors.join('; ') : ''}`);
    await ctx.close();
  }

  // 8. The therapist workspace: no theme button in its top bar; Appearance on its Profile page
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 }, colorScheme: 'light', serviceWorkers: 'block', reducedMotion: 'reduce' });
    await ctx.route('**/*', r => (r.request().url().startsWith(URL) ? r.continue() : r.abort()));
    const p = await ctx.newPage();
    await p.goto(URL);
    await p.getByRole('radio', { name: /Therapist/ }).click();
    await p.locator('button', { hasText: 'Ama Konadu' }).click();
    await p.getByRole('navigation').first().waitFor();
    ok((await themeControls(p)) === 0, 'therapist: no theme button in the workspace');
    // quick search → "Appearance" opens the Profile page, where the theme is
    await p.keyboard.press('Control+k');
    await p.keyboard.type('appearance');
    await p.keyboard.press('Enter');
    const group = p.getByRole('group', { name: 'Theme' });
    await group.waitFor();
    ok(true, 'therapist: quick search "Appearance" opens the Profile page with the theme');
    await group.getByRole('button', { name: /^Dark/ }).click();
    ok((await shown(p)) === 'dark' && (await looks(p, 'dark')) === 'dark', 'therapist: choosing Dark on the Profile page applies at once');
    await group.getByRole('button', { name: /System default/ }).click();
    ok((await shown(p)) === 'light', 'therapist: System default follows the device');
    await ctx.close();
  }
  console.log(`All ${n} theme checks passed`);
} finally {
  await browser.close();
  await server.close();
}
process.exit(0);
