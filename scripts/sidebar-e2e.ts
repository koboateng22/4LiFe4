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
  const ctx = await browser.newContext({ viewport: { width, height: 820 }, colorScheme: scheme, hasTouch: touch, serviceWorkers: 'block', reducedMotion: 'reduce' });
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

  // ---------- Tablets and phones: the drawer still works ----------
  for (const width of [768, 390]) {
    const { ctx, p, errors } = await open(width, 'light', 'light');
    const at = `${width}px`;
    ok(!(await onScreen(p)), `${at}: no column on screen; the drawer is closed`);
    await p.getByRole('button', { name: 'Open menu' }).click();
    await p.waitForTimeout(400);
    ok(await onScreen(p), `${at}: the menu button opens the drawer`);
    const names = await rail(p).locator('button.rail-btn').evaluateAll(els => els.map(el => (el as HTMLElement).innerText.split('\n')[0].trim()));
    ok(['Home', 'AI CBT Therapy', 'Global Village', 'Learn', 'Instant EMS', 'Settings'].every(x => names.includes(x)), `${at}: the drawer lists every section with its name`);
    await rail(p).locator('button[aria-label="Learn"]').click();
    await p.locator('#main-content').getByText(/Short videos to help you understand recovery/).waitFor();
    ok(!(await onScreen(p)), `${at}: choosing a section opens it and closes the drawer`);
    ok(errors.length === 0, `${at}: no page errors`);
    await ctx.close();
  }
  console.log(`All ${n} side navigation checks passed`);
} finally {
  await browser.close();
  await server.close();
}
process.exit(0);
