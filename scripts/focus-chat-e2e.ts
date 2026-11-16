/**
 * Phones: the AI chat's focus mode, and Instant EMS without the floating buttons. Real Chrome emulating
 * phones (touch, mobile viewport, high-density screen); /api/chat answered by a fake server.
 *  Chat: "Expand chat" fills the screen with only the chat; the rest of the page is inert; the draft,
 *  messages, scroll position and a reply still arriving all survive expanding and minimizing; no message
 *  is sent twice; "Minimize" returns to the same page position with focus on "Expand chat"; it fits above a
 *  (simulated) keyboard, in landscape and in dark mode; reduced motion has no animation; SOS still opens.
 *  EMS: the floating Call 112 / SOS / Nearest help group is gone, with no spacer left; the three actions are
 *  in the page (tested with stubs: nothing is dialled or sent); the EMS tab still works.
 *  Computers: no expand button; the EMS buttons are unchanged.
 *   npm run test:focus-chat        (needs Chrome: CHROME_PATH or /usr/bin/google-chrome)
 */
import { chromium, type Page, type Route } from 'playwright-core';
import { createServer } from 'vite';

let n = 0;
const ok = (c: unknown, w: string) => {
  if (!c) throw new Error('FAIL: ' + w);
  n++;
  console.log('ok ', w);
};

for (const k of ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY', 'VITE_SUPABASE_PUBLISHABLE_KEY']) delete process.env[k];
const PORT = 5207;
const server = await createServer({ server: { port: PORT, strictPort: true }, logLevel: 'error', envDir: '/nonexistent' });
await server.listen();
const URL = `http://localhost:${PORT}/`;
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox'] });

const bodies: any[] = [];
let slow = 0;
const sse = (events: Array<[string, unknown]>) => events.map(([e, d]) => `event: ${e}\ndata: ${JSON.stringify(d)}\n\n`).join('');
async function chatRoute(r: Route) {
  const body = JSON.parse(r.request().postData() || '{}');
  bodies.push(body);
  if (slow) await new Promise(res => setTimeout(res, slow));
  const reply = `Reply ${bodies.length}: I hear you. ${'Tell me a little more about that. '.repeat(3)}`;
  return r.fulfill({
    status: 200,
    headers: { 'Content-Type': 'text/event-stream' },
    body: sse([['meta', { risk: 'none' }], ['delta', { text: reply }], ['done', { reply, suggestions: ['Go on', 'Help me breathe', 'I feel better'], risk: 'none', model: 'test', mode: 'cbt' }]]),
  });
}

const open = async (width: number, height: number, opts: { scheme?: 'light' | 'dark'; motion?: 'reduce' | 'no-preference' } = {}) => {
  const mobile = width < 1024 || height < 500;
  const ctx = await browser.newContext({ viewport: { width, height }, isMobile: mobile && width < 1024, hasTouch: mobile, deviceScaleFactor: mobile ? 2 : 1, colorScheme: opts.scheme || 'light', serviceWorkers: 'block', reducedMotion: opts.motion || 'reduce' });
  await ctx.route('**/*', r => {
    const u = r.request().url();
    if (u.includes('/api/chat')) return chatRoute(r);
    return u.startsWith(URL) ? r.continue() : r.abort();
  });
  // stubs: nothing is dialled, texted or opened for real
  await ctx.addInitScript(() => {
    (window as any).__opened = [];
    window.open = ((url: string) => ((window as any).__opened.push(url), null)) as any;
  });
  if (opts.scheme) await ctx.addInitScript(t => localStorage.setItem('4life_user_theme', t), opts.scheme);
  const p = await ctx.newPage();
  const errors: string[] = [];
  p.on('pageerror', e => errors.push(e.message));
  await p.goto(URL);
  await p.locator('button', { hasText: 'Kwame Mensah' }).click();
  await p.locator('#main-content').waitFor({ timeout: 60000 });
  return { ctx, p, errors };
};
const goTab = async (p: Page, name: string, width: number) => {
  if (width < 1024) await p.locator(`nav.dock button[aria-label="${name}"]`).tap();
  else await p.locator(`#main-navigation button[aria-label="${name}"]`).click();
};
const card = (p: Page) => p.locator('section[aria-label="Conversation"]');
const box = (p: Page) => p.locator('#chat-input');
const settled = (p: Page) => p.waitForFunction(() => !document.querySelector('[aria-label="Messages"] [role="status"]'), null, { timeout: 30000 });
const send = async (p: Page, text: string) => {
  await box(p).fill(text);
  await p.getByRole('button', { name: 'Send message' }).click();
};
const bubbles = (p: Page) => p.locator('[aria-label="Messages"] > div').count();
const inViewport = (p: Page, sel: string) =>
  p.evaluate(s => {
    const el = document.querySelector(s);
    if (!el) return false;
    const r = el.getBoundingClientRect();
    const vh = window.visualViewport?.height ?? innerHeight;
    return r.top >= -1 && r.bottom <= vh + 1 && r.left >= -1 && r.right <= innerWidth + 1 && r.width > 0;
  }, sel);

try {
  // ---------- Chat focus mode on phones ----------
  for (const [width, height, scheme] of [[390, 844, 'light'], [320, 640, 'dark']] as const) {
    const at = `${width}px ${scheme}`;
    bodies.length = 0;
    slow = 0;
    const { ctx, p, errors } = await open(width, height, { scheme });
    await goTab(p, 'AI CBT Therapy', width);
    await box(p).waitFor();
    // a conversation with something to scroll
    await send(p, 'I had a hard day at school');
    await settled(p);
    await send(p, 'My friends wanted to go drinking');
    await settled(p);
    const expand = card(p).getByRole('button', { name: 'Expand chat' });
    const eb = await expand.boundingBox();
    ok(eb && eb.width >= 44 && eb.height >= 44, `${at}: the header has an “Expand chat” button big enough to tap`);
    await p.evaluate(() => window.scrollTo(0, 300));
    await p.waitForTimeout(200);
    const pageY = await p.evaluate(() => window.scrollY);
    // let the chat's own smooth scroll to the newest reply finish first, then pick a position
    await p.waitForTimeout(900);
    await p.locator('[aria-label="Messages"]').evaluate(el => (el.scrollTop = 40));
    await p.waitForTimeout(300);
    await box(p).fill('A half-written thought');
    await p.evaluate(() => (document.activeElement as HTMLElement)?.blur());
    const before = await bubbles(p);
    const msgY = await p.locator('[aria-label="Messages"]').evaluate(el => el.scrollTop); // right before expanding

    await expand.tap();
    await p.waitForTimeout(400);
    const geo = await card(p).evaluate(el => {
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height, pos: getComputedStyle(el).position, cls: el.className };
    });
    ok(geo.pos === 'fixed' && Math.abs(geo.x) < 1 && Math.abs(geo.y) < 1 && Math.abs(geo.w - width) < 2 && Math.abs(geo.h - height) < 2, `${at}: the chat fills the screen (${Math.round(geo.w)}×${Math.round(geo.h)})`);
    ok((await inViewport(p, 'section[aria-label="Conversation"] .chat-head')) && (await inViewport(p, '#chat-input')) && (await inViewport(p, 'section[aria-label="Conversation"] [aria-label="Messages"]')), `${at}: header, conversation and composer are all on screen`);
    const iso = await p.evaluate(() => ({
      dock: document.querySelector('nav.dock')?.closest('[inert]') !== null,
      top: document.querySelector('header.topbar')?.closest('[inert]') !== null,
      cardFree: document.querySelector('section[aria-label="Conversation"]')?.closest('[inert]') === null,
      locked: getComputedStyle(document.documentElement).overflow === 'hidden',
    }));
    ok(iso.dock && iso.top && iso.cardFree && iso.locked, `${at}: the rest of the page (navigation, top bar) is out of reach and the page can't scroll behind`);
    ok((await box(p).inputValue()) === 'A half-written thought' && (await bubbles(p)) === before, `${at}: the draft and every message are still there`);
    ok(Math.abs((await p.locator('[aria-label="Messages"]').evaluate(el => el.scrollTop)) - msgY) < 2, `${at}: the conversation keeps its scroll position`);
    const focused = await p.evaluate(() => document.activeElement?.getAttribute('aria-label'));
    ok(focused === 'Exit expanded chat', `${at}: focus moves to the exit button`);
    const exitBox = await card(p).getByRole('button', { name: 'Exit expanded chat' }).boundingBox();
    ok(exitBox && exitBox.width >= 44 && exitBox.height >= 44 && exitBox.y >= 0, `${at}: the exit button is visible and big enough`);
    ok((await p.evaluate(() => document.documentElement.scrollWidth - innerWidth)) <= 1, `${at}: nothing spills sideways`);
    if (scheme === 'dark') {
      const bg = await card(p).evaluate(el => getComputedStyle(el).backgroundColor);
      ok(/rgb\((\d+), (\d+), (\d+)\)/.test(bg) && Number(bg.match(/\d+/)![0]) < 60, `${at}: dark theme in focus mode (${bg})`);
    }

    // keyboard up (simulated by a shorter screen): the composer and the exit button stay reachable
    await box(p).focus();
    await p.setViewportSize({ width, height: Math.round(height * 0.55) });
    await p.waitForTimeout(400);
    ok((await inViewport(p, '#chat-input')) && (await inViewport(p, 'section[aria-label="Conversation"] button[aria-label="Exit expanded chat"]')) && (await inViewport(p, 'section[aria-label="Conversation"] button[aria-label="Send message"]')), `${at}: with the keyboard up, the message box, send and exit are all still on screen`);
    await p.setViewportSize({ width, height });
    await p.waitForTimeout(300);

    // a reply still arriving carries on through minimize and expand, and nothing is sent twice
    slow = 1500;
    await box(p).fill('Can you help me plan tonight?');
    await p.getByRole('button', { name: 'Send message' }).click();
    await card(p).getByRole('button', { name: 'Stop the reply' }).waitFor();
    const sent = bodies.length;
    await card(p).getByRole('button', { name: 'Exit expanded chat' }).tap();
    await p.waitForTimeout(200);
    ok(!(await card(p).evaluate(el => el.classList.contains('chat-card-expanded'))), `${at}: “Minimize” returns the chat to its place in one tap`);
    const pageY2 = await p.evaluate(() => window.scrollY); // where they are when they expand again
    await card(p).getByRole('button', { name: 'Expand chat' }).tap();
    await settled(p);
    await card(p).getByText(`Reply ${sent}: I hear you`).waitFor();
    ok(bodies.length === sent, `${at}: the reply that was arriving finished, and the message was sent only once`);
    slow = 0;
    await box(p).fill('Still typing this');

    // minimize: same page position, focus back on Expand chat, page usable again
    await card(p).getByRole('button', { name: 'Exit expanded chat' }).tap();
    await p.waitForTimeout(400);
    const back = await p.evaluate(() => ({
      y: window.scrollY,
      focus: document.activeElement?.getAttribute('aria-label'),
      inert: document.querySelectorAll('[inert]').length,
      pos: getComputedStyle(document.querySelector('section[aria-label="Conversation"]')!).position,
    }));
    ok(back.pos !== 'fixed' && Math.abs(back.y - pageY2) < 3, `${at}: back in the page, where they were when they expanded (${Math.round(back.y)} / ${Math.round(pageY2)})`);
    ok(back.focus === 'Expand chat' && back.inert === 0, `${at}: focus returns to “Expand chat” and the page is reachable again`);
    ok((await box(p).inputValue()) === 'Still typing this', `${at}: the draft survives minimizing`);
    await goTab(p, 'Home', width);
    await p.getByRole('heading', { name: 'How are you right now?' }).waitFor();
    ok(true, `${at}: the dock works again`);

    // keyboard users: Escape closes it
    await goTab(p, 'AI CBT Therapy', width);
    await card(p).getByRole('button', { name: 'Expand chat' }).tap();
    await p.keyboard.press('Escape');
    await p.waitForTimeout(300);
    ok(!(await card(p).evaluate(el => el.classList.contains('chat-card-expanded'))), `${at}: Escape also closes it`);

    // SOS stays one tap away and opens above the chat
    await card(p).getByRole('button', { name: 'Expand chat' }).tap();
    await card(p).getByRole('button', { name: /SOS/ }).tap();
    await p.getByRole('dialog').first().waitFor();
    ok(await p.getByRole('dialog').first().isVisible(), `${at}: SOS in the expanded header opens the SOS screen on top`);
    ok(errors.length === 0, `${at}: no page errors${errors.length ? ': ' + errors.join('; ') : ''}`);
    await ctx.close();
  }

  // ---------- Landscape, and the animation ----------
  {
    const { ctx, p } = await open(844, 390, { motion: 'no-preference' });
    await goTab(p, 'AI CBT Therapy', 844);
    await card(p).getByRole('button', { name: 'Expand chat' }).tap();
    await p.waitForTimeout(400);
    ok((await inViewport(p, '#chat-input')) && (await inViewport(p, 'section[aria-label="Conversation"] button[aria-label="Exit expanded chat"]')), 'landscape (844×390): the composer and exit fit');
    const anim = await card(p).evaluate(el => getComputedStyle(el).animationName);
    ok(anim === 'chat-expand', `a short entrance animation plays normally (${anim})`);
    await ctx.close();
    const r = await open(390, 844, { motion: 'reduce' });
    await goTab(r.p, 'AI CBT Therapy', 390);
    await card(r.p).getByRole('button', { name: 'Expand chat' }).tap();
    ok((await card(r.p).evaluate(el => getComputedStyle(el).animationName)) === 'none', '…and none with “reduce motion”');
    await r.ctx.close();
  }

  // ---------- Instant EMS on phones ----------
  for (const width of [390, 320]) {
    const at = `${width}px EMS`;
    const { ctx, p, errors } = await open(width, 800);
    await goTab(p, 'Instant EMS', width);
    await p.getByRole('heading', { name: 'In danger right now?' }).waitFor();
    ok(true, `${at}: the EMS tab in the dock still opens Instant EMS`);
    ok((await p.locator('nav[aria-label="Emergency actions"]').count()) === 0, `${at}: the floating Call 112 / SOS / Nearest help group is gone`);
    const fixedActions = await p.evaluate(() =>
      [...document.querySelectorAll('#main-content *')].filter(el => getComputedStyle(el).position === 'fixed' && /Call 112|Nearest help|SOS/.test((el as HTMLElement).innerText || '')).length
    );
    ok(fixedActions === 0, `${at}: nothing with those actions floats over the page`);
    const spacer = await p.evaluate(() => document.querySelectorAll('#main-content [aria-hidden="true"].h-\\[4\\.75rem\\]').length);
    ok(spacer === 0, `${at}: no empty spacer is left behind`);
    // the three actions, in the page
    const urgent = p.locator('section[aria-labelledby="urgent-h"]');
    const call = urgent.getByRole('link', { name: 'Call 112' });
    ok((await call.getAttribute('href')) === 'tel:112' && (await call.evaluate(el => getComputedStyle(el).position)) !== 'fixed', `${at}: Call 112 is the main button at the top (tel:112, not dialled in the test)`);
    const nearest = urgent.getByRole('button', { name: 'Nearest help' });
    ok(await nearest.isVisible(), `${at}: Nearest help is in the page, in the emergency box`);
    const [callBg, nearBg] = await Promise.all([call.evaluate(el => getComputedStyle(el).backgroundColor), nearest.evaluate(el => getComputedStyle(el).backgroundColor)]);
    ok(callBg !== nearBg, `${at}: Call 112 is the primary (red) action; the others are secondary`);
    await nearest.tap();
    await p.waitForTimeout(600);
    const went = await p.evaluate(() => ({ opened: (window as any).__opened as string[], near: document.getElementById('near-h')?.getBoundingClientRect().top ?? 9999 }));
    ok(went.opened.some(u => u.includes('google.com/maps')) || went.near < 400, `${at}: Nearest help does what it did before (directions, or the list of places)`);
    await urgent.getByRole('button', { name: /Alert Sister|Open SOS/ }).tap();
    await p.getByRole('dialog').first().waitFor();
    ok(true, `${at}: the SOS action opens the SOS screen (nothing sent in the test)`);
    await p.keyboard.press('Escape');
    const text = p.getByRole('link', { name: /^Text / }).first();
    ok((await text.count()) === 1 && /^sms:/.test((await text.getAttribute('href')) || ''), `${at}: texting the support person is in the page (sms link, not opened)`);
    ok((await p.evaluate(() => document.documentElement.scrollWidth - innerWidth)) <= 1, `${at}: no sideways scrolling`);
    ok(errors.length === 0, `${at}: no page errors`);
    await ctx.close();
  }

  // ---------- Computers: unchanged ----------
  {
    const { ctx, p } = await open(1280, 860);
    await goTab(p, 'AI CBT Therapy', 1280);
    await box(p).waitFor();
    ok(!(await card(p).getByRole('button', { name: 'Expand chat' }).isVisible()), '1280px: no expand button on a computer');
    await goTab(p, 'Instant EMS', 1280);
    await p.getByRole('heading', { name: 'In danger right now?' }).waitFor();
    const urgent = p.locator('section[aria-labelledby="urgent-h"]');
    const visible = await urgent.locator('a:visible, button:visible').evaluateAll(els => els.map(e => (e as HTMLElement).innerText.trim()));
    ok(visible.join('|') === 'Call 112|Ambulance 193|Alert Sister Mary|Breathe', `1280px: the EMS buttons are as before (${visible.join(', ')})`);
    await ctx.close();
  }
  console.log(`All ${n} focus-chat and EMS checks passed`);
} finally {
  await browser.close();
  await server.close();
}
process.exit(0);
