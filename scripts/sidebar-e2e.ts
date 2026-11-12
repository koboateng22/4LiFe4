/**
 * The side navigation in real Chrome. Computers: floating glass buttons (no panel), each with its
 * name on hover, keyboard focus or a touch press, the current page marked, every button opening its
 * page, in light, dark and system themes. Tablets and phones: the drawer still opens and works.
 *   npm run test:sidebar        (needs Chrome: CHROME_PATH or /usr/bin/google-chrome)
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
const PORT = 5194;
const server = await createServer({ server: { port: PORT, strictPort: true }, logLevel: 'error', envDir: '/nonexistent' });
await server.listen();
const URL = `http://localhost:${PORT}/`;
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox'] });

// every section, with the page heading it opens
const ITEMS: Array<[string, RegExp]> = [
  ['Home', /How are you right now\?/],
  ['AI CBT Therapy', /What do you need right now\?|AI CBT therapy/],
  ['Global Village', /You are not alone|Global Village/],
  ['Learn', /Short videos to help you understand recovery/],
  ['Instant EMS', /Instant EMS|Call 112/],
  ['Settings', /Profile|Settings/],
];

const open = async (width: number, scheme: 'light' | 'dark', theme?: 'light' | 'dark' | 'system', touch = false) => {
  const ctx = await browser.newContext({ viewport: { width, height: 820 }, colorScheme: scheme, hasTouch: touch, isMobile: touch && width < 1024, deviceScaleFactor: touch && width < 1024 ? 2 : 1, serviceWorkers: 'block', reducedMotion: 'reduce' });
  await ctx.route('**/*', r => (r.request().url().startsWith(URL) ? r.continue() : r.abort()));
  if (theme) await ctx.addInitScript(t => localStorage.setItem('4life_user_theme', t), theme);
  const p = await ctx.newPage();
  const errors: string[] = [];
  p.on('pageerror', e => errors.push(e.message));
  await p.goto(URL);
  await p.locator('button', { hasText: 'Kwame Mensah' }).click();
  await p.locator('#main-content').waitFor();
  return { ctx, p, errors };
};
const rail = (p: Page) => p.locator('#main-navigation');
const label = (p: Page, name: string) => rail(p).locator(`button[aria-label="${name}"] .rail-label`);
/** The drawer is on screen (slid in), not just present */
const onScreen = async (p: Page) => ((await rail(p).boundingBox())?.x ?? -999) >= -1;
const opacity = (p: Page, name: string) => label(p, name).evaluate(el => Number(getComputedStyle(el).opacity));

try {
  // ---------- Computers: light, dark and system ----------
  for (const [scheme, theme] of [['light', 'light'], ['dark', 'dark'], ['dark', 'system']] as const) {
    const at = `1280px ${theme}${theme === 'system' ? ' (device dark)' : ''}`;
    const { ctx, p, errors } = await open(1280, scheme, theme);
    const shownDark = await p.evaluate(() => document.documentElement.classList.contains('dark'));
    ok(shownDark === (scheme === 'dark'), `${at}: the theme is applied`);

    // no panel: the column itself is see-through, the buttons are separate
    const pane = await rail(p).evaluate(el => {
      const cs = getComputedStyle(el);
      return { bg: cs.backgroundImage === 'none' && /rgba\(0, 0, 0, 0\)|transparent/.test(cs.backgroundColor), border: cs.borderRightWidth, width: el.getBoundingClientRect().width };
    });
    ok(pane.bg && pane.border === '0px' && pane.width <= 100, `${at}: no long panel any more, just a narrow column`);
    const boxes = await rail(p).locator('button.rail-btn').evaluateAll(els =>
      els.map(el => {
        const r = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        return { w: Math.round(r.width), h: Math.round(r.height), x: Math.round(r.left), radius: parseFloat(cs.borderTopLeftRadius), blur: cs.backdropFilter, hasBg: cs.backgroundImage !== 'none' };
      })
    );
    ok(boxes.length === ITEMS.length + 1 && boxes.every(b => b.w === 48 && b.h === 48 && b.radius >= 14 && b.hasBg && /blur/.test(b.blur)), `${at}: every item is its own rounded glass button, all the same size`);
    ok(new Set(boxes.map(b => b.x)).size === 1, `${at}: the buttons line up in one column`);

    // every item: present, labelled on hover, opens its page, marked as current
    for (const [name, heading] of ITEMS) {
      const btn = rail(p).locator(`button[aria-label="${name}"]`);
      ok((await btn.count()) === 1, `${at}: "${name}" is there`);
      await btn.hover();
      await p.waitForTimeout(400);
      ok((await opacity(p, name)) === 1 && (await label(p, name).innerText()) === name, `${at}: hovering shows "${name}"`);
      const lr = await label(p, name).boundingBox();
      const br = await btn.boundingBox();
      ok(lr && br && lr.x > br.x + br.width && lr.x + lr.width < 1280, `${at}: the "${name}" label sits beside its button, on screen`);
      await btn.click();
      await p.locator('#main-content').getByText(heading).first().waitFor();
      ok((await btn.getAttribute('aria-current')) === 'page' && (await rail(p).locator('[aria-current="page"]').count()) === 1, `${at}: "${name}" opens its page and is marked as current`);
    }
    // the current page looks different from the others
    const [onBg, offBg] = await Promise.all([
      rail(p).locator('[aria-current="page"]').evaluate(el => getComputedStyle(el).backgroundImage + getComputedStyle(el).boxShadow),
      rail(p).locator('button[aria-label="Home"]').evaluate(el => getComputedStyle(el).backgroundImage + getComputedStyle(el).boxShadow),
    ]);
    ok(onBg !== offBg, `${at}: the current page's button stands out`);

    // moving away hides the label again; the logo still goes home
    await p.mouse.move(700, 500);
    await p.waitForTimeout(300);
    ok((await opacity(p, 'Instant EMS')) === 0, `${at}: labels hide when the pointer leaves`);
    await rail(p).getByRole('button', { name: '4Life home' }).click();
    await p.locator('#main-content').getByText(/How are you right now\?/).waitFor();
    ok(true, `${at}: the logo goes home`);

    // keyboard: Tab reaches the buttons, shows the label and a visible focus ring
    await p.locator('#main-navigation button[aria-label="Global Village"]').focus();
    await p.keyboard.press('Shift+Tab');
    await p.keyboard.press('Tab');
    await p.waitForTimeout(300);
    const focus = await p.evaluate(() => {
      const el = document.activeElement as HTMLElement;
      const cs = getComputedStyle(el);
      return { name: el.getAttribute('aria-label'), outline: cs.outlineStyle, label: Number(getComputedStyle(el.querySelector('.rail-label')!).opacity) };
    });
    ok(focus.name === 'Global Village' && focus.outline !== 'none' && focus.label === 1, `${at}: with the keyboard, focus is visible and the name shows`);

    // nothing is blocked: the content starts right of the column
    const content = await p.locator('#main-content').boundingBox();
    const right = Math.max(...boxes.map(b => b.x + b.w));
    ok(content && content.x >= right + 8, `${at}: the buttons never cover the page`);
    ok(errors.length === 0, `${at}: no page errors${errors.length ? ': ' + errors.join('; ') : ''}`);
    await ctx.close();
  }

  // ---------- Touch screen at computer size: a press shows the name ----------
  {
    const { ctx, p } = await open(1280, 'light', 'light', true);
    const btn = rail(p).locator('button[aria-label="Global Village"]');
    await btn.dispatchEvent('pointerdown', { pointerType: 'touch' });
    await p.waitForTimeout(350);
    ok((await opacity(p, 'Global Village')) === 1, '1280px touch: a press shows the name for a moment');
    await p.waitForTimeout(1300);
    ok((await opacity(p, 'Global Village')) === 0, '1280px touch: then it hides again');
    await ctx.close();
  }

  // ---------- Tablets and phones: the dock of glass buttons at the bottom ----------
  for (const [width, scheme] of [[768, 'light'], [390, 'dark'], [320, 'light']] as const) {
    const { ctx, p, errors } = await open(width, scheme, scheme, true);
    const at = `${width}px ${scheme}`;
    const dock = p.locator('nav.dock');
    ok(!(await rail(p).isVisible()), `${at}: the side column is not shown`);
    ok(!(await p.getByRole('button', { name: 'Open menu' }).count()), `${at}: no menu button needed: every section is in the dock`);
    const btns = await dock.locator('button.dock-btn').evaluateAll(els =>
      els.map(el => {
        const r = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        const label = el.querySelector('.dock-label') as HTMLElement;
        return { name: el.getAttribute('aria-label'), w: r.width, h: r.height, x: r.left, right: r.right, bottom: r.bottom, radius: parseFloat(cs.borderTopLeftRadius), blur: cs.backdropFilter, cut: label.scrollWidth > label.clientWidth + 1, text: label.innerText };
      })
    );
    ok(btns.map(b => b.name).join() === ITEMS.map(([n]) => n).join(), `${at}: the dock has every section, in order`);
    ok(btns.every(b => b.h >= 48 && b.w >= 44 && b.radius >= 14 && /blur/.test(b.blur)), `${at}: each is its own rounded glass button, big enough to tap (${Math.round(Math.min(...btns.map(b => b.w)))}×${Math.round(btns[0].h)}px)`);
    ok(btns.every(b => b.x >= 0 && b.right <= width && b.bottom <= 820), `${at}: all of them fit on the screen`);
    ok(btns.every(b => !b.cut && b.text.length > 0), `${at}: each shows its whole short name (${btns.map(b => b.text).join(', ')})`);
    ok((await p.evaluate(() => document.documentElement.scrollWidth - innerWidth)) <= 1, `${at}: no sideways scrolling`);
    const panel = await dock.evaluate(el => getComputedStyle(el.querySelector('.dock-row')!).backgroundColor);
    ok(/rgba\(0, 0, 0, 0\)|transparent/.test(panel), `${at}: no panel behind the buttons`);
    for (const [name, heading] of ITEMS) {
      await dock.locator(`button[aria-label="${name}"]`).tap();
      await p.locator('#main-content').getByText(heading).first().waitFor();
      ok((await dock.locator(`button[aria-label="${name}"]`).getAttribute('aria-current')) === 'page' && (await dock.locator('[aria-current="page"]').count()) === 1, `${at}: tapping “${name}” opens it and marks it as current`);
    }
    const [onBg, offBg] = await Promise.all([
      dock.locator('[aria-current="page"]').evaluate(el => getComputedStyle(el).backgroundImage + getComputedStyle(el).boxShadow),
      dock.locator('button[aria-label="Home"]').evaluate(el => getComputedStyle(el).backgroundImage + getComputedStyle(el).boxShadow),
    ]);
    ok(onBg !== offBg, `${at}: the current page's button stands out`);
    // the page's last line is never hidden behind the dock
    await p.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await p.waitForTimeout(300);
    const gap = await p.evaluate(() => {
      const top = document.querySelector('nav.dock .dock-row')!.getBoundingClientRect().top;
      const last = document.querySelector('#main-content')!.lastElementChild!.getBoundingClientRect().bottom;
      return top - last;
    });
    ok(gap >= 0, `${at}: at the end of a page nothing is hidden behind the dock (${Math.round(gap)}px clear)`);
    // typing: the dock moves away so it never covers the keyboard or the message box
    await dock.locator('button[aria-label="AI CBT Therapy"]').tap();
    await p.locator('#chat-input').focus();
    await p.waitForTimeout(400);
    const away = await dock.evaluate(el => ({ away: el.hasAttribute('data-away'), inert: el.hasAttribute('inert') }));
    ok(away.away && away.inert, `${at}: while typing, the dock steps aside`);
    await p.locator('#chat-input').blur();
    await p.waitForTimeout(400);
    ok(!(await dock.evaluate(el => el.hasAttribute('data-away'))), `${at}: …and comes back afterwards`);
    // the header keeps search, breathing, SOS and the account menu within reach
    for (const name of [/search/i, /^Breathe/, /SOS/, /Account menu/]) ok(await p.locator('header').getByRole('button', { name }).first().isVisible(), `${at}: the top bar has ${name.source.replace(/[\^$\/]/g, '')}`);
    ok(errors.length === 0, `${at}: no page errors${errors.length ? ': ' + errors.join('; ') : ''}`);
    await ctx.close();
  }
  console.log(`All ${n} side navigation checks passed`);
} finally {
  await browser.close();
  await server.close();
}
process.exit(0);
