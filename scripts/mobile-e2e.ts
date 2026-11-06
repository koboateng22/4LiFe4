/**
 * Phone-sized checks in real Chrome, on this device's own data (no Supabase, nothing leaves
 * the machine): nothing overflows, sign-up keeps the age, the first-aid popup stays inside
 * the screen however it is tapped, and the welcome tour's photos fit their frames.
 *   npm run test:mobile           (needs Chrome: CHROME_PATH or /usr/bin/google-chrome)
 *
 * Chrome's phone mode has no shrinking browser bars, on-screen keyboard, or iOS double-tap
 * zoom, so those still need a real phone.
 */
import { readFileSync } from 'node:fs';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright-core';
import { createServer } from 'vite';

let n = 0;
const ok = (c: unknown, w: string) => {
  if (!c) throw new Error('FAIL: ' + w);
  n++;
  console.log('ok ', w);
};

for (const k of ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY', 'VITE_SUPABASE_PUBLISHABLE_KEY']) delete process.env[k];
const PORT = 5188;
const server = await createServer({ server: { port: PORT, strictPort: true }, logLevel: 'error', envDir: '/nonexistent' });
await server.listen();
const URL = `http://localhost:${PORT}/`;
const leaflet = readFileSync('node_modules/leaflet/dist/leaflet.css', 'utf8');

// A long channel name is what used to stretch the popup, so these are deliberately long
const VIDEOS = {
  videos: [
    { id: 'abcDEF12345', title: 'How to do hands-only CPR step by step, an official first aid training video with_one_very_long_unbroken_word_in_it_that_keeps_going', channel: 'International Federation of Red Cross and Red Crescent Societies Official Training Channel', thumb: '' },
    { id: 'xyzDEF12345', title: 'Second video', channel: 'St John Ambulance', thumb: '' },
  ],
};

const browser: Browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox'] });

async function open(width: number, height: number, videos: unknown = VIDEOS): Promise<{ ctx: BrowserContext; p: Page; errors: string[] }> {
  const phone = width < 1024;
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2, hasTouch: phone, isMobile: phone, serviceWorkers: 'block', reducedMotion: 'reduce' });
  await ctx.route('**/*', r => {
    const u = r.request().url();
    if (u.includes('unpkg.com') && u.includes('leaflet.css')) return r.fulfill({ contentType: 'text/css', body: leaflet });
    if (u.includes('/api/first-aid/videos')) return r.fulfill({ json: videos });
    return u.startsWith(URL) ? r.continue() : r.abort();
  });
  const p = await ctx.newPage();
  p.setDefaultTimeout(15000);
  const errors: string[] = [];
  p.on('pageerror', e => errors.push(e.message));
  p.on('console', m => {
    if (m.type() === 'error' && !/Failed to load resource|ERR_FAILED/.test(m.text())) errors.push(m.text());
  });
  await p.goto(URL);
  await p.getByRole('button', { name: 'Create Account' }).waitFor();
  return { ctx, p, errors };
}

/** Anything sticking out of the screen, a page that scrolls sideways, or a control cutting off its text. */
const layoutProblems = (p: Page) =>
  p.evaluate(() => {
    const out: string[] = [];
    if (document.documentElement.scrollWidth > innerWidth) out.push(`page is ${document.documentElement.scrollWidth}px wide`);
    for (const el of document.querySelectorAll<HTMLElement>('body *')) {
      if (el.closest('svg, .sr-only, #google_translate_element, [aria-hidden="true"], .leaflet-container, .pointer-events-none')) continue;
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') continue;
      const name = `${el.tagName} "${(el.innerText || '').trim().slice(0, 30)}"`;
      const scroller = ['auto', 'scroll'].includes(cs.overflowX) && el.scrollWidth > el.clientWidth + 1;
      if (scroller && !el.matches('.no-scrollbar, .fade-x') && !el.closest('.no-scrollbar')) out.push(`${name} scrolls sideways (${el.scrollWidth} in ${el.clientWidth})`);
      if (el.matches('button, [role=tab], [role=radio]') && cs.overflowX !== 'visible' && el.scrollWidth > el.clientWidth + 1) out.push(`${name} clips its text`);
      if (!el.matches('button, a, label, input, select, h1, h2, h3, p')) continue;
      let parent = el.parentElement;
      let clippedByParent = false;
      while (parent && parent !== document.body) {
        if (getComputedStyle(parent).overflowX !== 'visible') clippedByParent = !parent.matches('[role=dialog]') && ['auto', 'scroll', 'hidden', 'clip'].includes(getComputedStyle(parent).overflowX) && parent.getBoundingClientRect().right <= innerWidth + 1;
        if (clippedByParent) break;
        parent = parent.parentElement;
      }
      const r = el.getBoundingClientRect();
      if (r.width && !clippedByParent && (r.right > innerWidth + 1 || r.left < -1)) out.push(`${name} leaves the screen [${Math.round(r.left)}, ${Math.round(r.right)}]`);
    }
    return out;
  });

const clean = async (p: Page, what: string) => {
  const issues = await layoutProblems(p);
  ok(issues.length === 0, `${what}${issues.length ? ': ' + issues.slice(0, 5).join('; ') : ''}`);
};

const SIZES: Array<[number, number]> = [[320, 568], [360, 640], [390, 844], [430, 932], [768, 1024], [1280, 800], [640, 360]];

const goEms = async (p: Page, width: number) => {
  await p.locator('button', { hasText: 'Kwame Mensah' }).click();
  await p.locator('#main-content').waitFor();
  if (width < 1024) await p.locator('nav[aria-label="Quick navigation"] button', { hasText: 'EMS' }).click();
  else await p.locator('#main-navigation nav button', { hasText: 'EMS' }).click();
  await p.locator('#first-aid').waitFor();
};

const popup = (p: Page) =>
  p.evaluate(() => {
    const d = document.querySelector('[role=dialog]');
    if (!d) return null;
    const r = d.getBoundingClientRect();
    const c = d.querySelector('button[aria-label=Close]')!.getBoundingClientRect();
    const b = d.querySelector('.overflow-y-auto')!;
    return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, closeTop: c.top, closeBottom: c.bottom, closeLeft: c.left, closeRight: c.right, closeW: c.width, closeH: c.height, bodyW: b.scrollWidth, bodyCW: b.clientWidth, bodyScrollH: b.scrollHeight, bodyH: b.clientHeight, vw: innerWidth, vh: innerHeight };
  });

const fits = (r: NonNullable<Awaited<ReturnType<typeof popup>>>) =>
  r.left >= -1 && r.right <= r.vw + 1 && r.top >= -1 && r.bottom <= r.vh + 1 && r.closeTop >= 0 && r.closeBottom <= r.vh && r.closeLeft >= 0 && r.closeRight <= r.vw && r.closeW >= 44 && r.closeH >= 44 && r.bodyW <= r.bodyCW + 1;

try {
  // ---------- Layout at every size ----------
  for (const [w, h] of SIZES) {
    const { ctx, p, errors } = await open(w, h);
    const at = `${w}x${h}`;
    await clean(p, `${at} sign in`);
    await p.getByRole('button', { name: 'Create Account' }).click();
    await clean(p, `${at} sign-up step 1`);
    await p.getByRole('radio', { name: /Therapist/ }).click();
    await clean(p, `${at} therapist sign in`);
    await p.getByRole('radio', { name: /Student/ }).click();
    await p.getByRole('button', { name: 'Sign In', exact: true }).click();
    await p.getByRole('button', { name: /Forgot/ }).click();
    await clean(p, `${at} forgot PIN`);
    await p.getByRole('button', { name: 'Close', exact: true }).first().click();
    await goEms(p, w);
    await clean(p, `${at} Instant EMS`);
    ok(errors.length === 0, `${at} no console errors${errors.length ? ': ' + errors[0].slice(0, 200) : ''}`);
    await ctx.close();
  }

  // ---------- Sign-up: the age ----------
  {
    const { ctx, p } = await open(320, 568);
    await p.getByRole('button', { name: 'Create Account' }).click();
    const age = p.getByLabel('Your age');
    await age.waitFor();
    ok((await age.getAttribute('inputmode')) === 'numeric', 'the age field is on step 1 and opens the number keypad');
    await p.getByLabel('Your name').fill('Kofi Asante');
    const next = p.getByRole('button', { name: 'Continue' });
    await next.click();
    ok(await p.getByRole('alert').filter({ hasText: 'enter your age' }).isVisible(), 'a missing age is explained, and stops the step');
    await age.fill('12');
    await next.click();
    ok(await p.getByRole('alert').filter({ hasText: '13 or older' }).isVisible(), 'someone under 13 is told why, and stops the step');
    await age.fill('');
    await age.pressSequentially('2x1');
    ok((await age.inputValue()) === '21', 'letters cannot be typed into the age');
    await next.click();
    await p.getByLabel('Email address').fill('kofi@example.org');
    await p.getByRole('button', { name: 'Back' }).click();
    ok((await age.inputValue()) === '21', 'the age is still there after going forward and back');
    await next.click();
    await p.getByLabel('Choose a PIN').fill('5678');
    await p.getByLabel('Type it again').fill('5678');
    await next.click();
    await next.click();
    await clean(p, '320x568 sign-up last step');
    await p.getByRole('checkbox').check();
    await p.getByRole('button', { name: 'Create my account' }).click();
    await p.getByText('Akwaaba').waitFor();
    const stored = await p.evaluate(() => JSON.parse(localStorage.getItem('4life_auth_accounts') || '[]').find((a: any) => a.email === 'kofi@example.org')?.profile?.age);
    ok(stored === 21, 'the age typed at sign-up is the one saved on the new account');

    // ---------- Welcome tour photos, right after a real sign-up ----------
    const seen: string[] = [];
    for (let i = 0; i < 6; i++) {
      await p.waitForFunction(() => {
        const el = document.querySelector<HTMLImageElement>('[role=dialog] img');
        return !el || (el.complete && el.naturalWidth > 0);
      });
      const img = await p.evaluate(() => {
        const el = document.querySelector<HTMLImageElement>('[role=dialog] img');
        if (!el) return null;
        const r = el.parentElement!.getBoundingClientRect();
        const file = el.currentSrc.split('/').pop()!.split('?')[0];
        return { file, ok: el.complete && el.naturalWidth > 0, fit: getComputedStyle(el).objectFit, ratio: r.width / r.height };
      });
      if (img) {
        seen.push(img.file);
        ok(img.ok && img.fit === 'cover' && Math.abs(img.ratio - 4 / 3) < 0.02, `tour photo ${img.file} loads in a 4:3 frame`);
      }
      await clean(p, `320x568 tour slide ${i + 1}`);
      await p.locator('[role=dialog] button.flex-1').last().click();
    }
    ok(seen.some(f => f.startsWith('outdoors')) && seen.some(f => f.startsWith('kitchen')) && seen.some(f => f.startsWith('together')), 'all three supplied photos appear in the tour');
    await ctx.close();
  }

  // ---------- Age in Settings and onboarding ----------
  {
    const { ctx, p } = await open(320, 568);
    await p.locator('button', { hasText: 'Kwame Mensah' }).click();
    await p.locator('#main-content').waitFor();
    await p.locator('nav[aria-label="Quick navigation"] button').last().click();
    await p.locator('#main-navigation button', { hasText: 'Settings' }).first().click();
    const age = p.locator('#f-age');
    ok((await age.inputValue()) === '19', 'Settings shows the saved age');
    await age.fill('12');
    await p.getByRole('button', { name: 'Save changes' }).click();
    ok(await p.getByRole('alert').filter({ hasText: '13 or older' }).isVisible(), 'Settings explains an age that is too low');
    await p.getByRole('button', { name: 'Discard' }).click();
    ok((await age.inputValue()) === '19', 'and the wrong age was not saved');
    await age.fill('30');
    await p.getByRole('button', { name: 'Save changes' }).click();
    ok(await p.getByText('Your changes are saved.').isVisible(), 'Settings saves a good age');

    await p.getByRole('button', { name: /Privacy and data/ }).click();
    await p.getByRole('button', { name: 'Run setup' }).click();
    const setupAge = p.locator('#onboard-age');
    ok((await setupAge.inputValue()) === '30', 'setup shows the age saved in Settings');
    await clean(p, '320x568 setup step 1');
    await setupAge.fill('5');
    await p.getByRole('button', { name: 'Continue' }).click();
    ok(await p.getByRole('alert').filter({ hasText: '13 or older' }).isVisible(), 'setup explains an age that is too low, and stays on the step');
    await setupAge.fill('');
    await p.getByRole('button', { name: 'Continue' }).click();
    ok(await p.getByText('Step 2 of 4').isVisible(), 'setup can still go on with the age left blank');
    await ctx.close();
  }

  // ---------- First aid popup ----------
  for (const [w, h] of [[320, 568], [360, 640], [390, 844], [430, 932], [768, 1024], [640, 360]] as Array<[number, number]>) {
    const at = `${w}x${h}`;
    const { ctx, p } = await open(w, h);
    await goEms(p, w);
    const trigger = p.locator('#first-aid button', { hasText: 'CPR' }).first();
    for (let round = 1; round <= 3; round++) {
      await trigger.scrollIntoViewIfNeeded();
      await trigger.tap();
      await p.getByRole('dialog').getByText('Second video').waitFor();
      await p.waitForTimeout(350); // the overlay's 4px fade-in has finished
      const r = await popup(p);
      ok(r && fits(r), `${at} popup fits, opening time ${round}${r && !fits(r) ? ' ' + JSON.stringify(r) : ''}`);
      ok(r!.bodyScrollH <= r!.bodyH || (await p.evaluate(() => { const b = document.querySelector('[role=dialog] .overflow-y-auto')!; b.scrollTop = 1e6; return b.scrollTop > 0; })), `${at} long content scrolls inside the popup`);
      const end = await popup(p);
      ok(end && fits(end), `${at} Close stays put after scrolling to the end`);
      await p.getByRole('dialog').getByRole('button', { name: 'Close' }).tap();
      ok((await p.getByRole('dialog').count()) === 0, `${at} Close closes it, time ${round}`);
    }
    await trigger.tap();
    await p.getByRole('dialog').getByText('Second video').tap();
    await p.waitForTimeout(150);
    const playing = await popup(p);
    ok(playing && fits(playing), `${at} popup still fits with a video playing`);
    await ctx.close();
  }

  // A quick second tap lands on whatever opened under the finger (Call 112, on a small phone)
  {
    const { ctx, p } = await open(320, 568);
    await goEms(p, 320);
    const trigger = p.locator('#first-aid button', { hasText: 'CPR' }).first();
    await trigger.scrollIntoViewIfNeeded();
    const box = (await trigger.boundingBox())!;
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    // Counts link taps that get through the popup, and stops a test ever following a tel: link.
    // A tap the popup ignores is stopped on its way down, so it never gets back up to document.
    await p.evaluate(() => {
      (window as any).__linkTaps = 0;
      document.addEventListener('click', e => {
        if ((e.target as Element).closest?.('a')) (window as any).__linkTaps++;
        e.preventDefault();
      });
    });
    const linkTaps = () => p.evaluate(() => (window as any).__linkTaps as number);
    await p.touchscreen.tap(x, y);
    await p.touchscreen.tap(x, y);
    await p.waitForTimeout(350);
    const r = await popup(p);
    ok(r && fits(r), 'double tap on a topic opens the popup once, the same size');
    await p.getByRole('dialog').getByRole('button', { name: 'Close' }).tap();
    const tapsBefore = await linkTaps();
    // Pressed from inside the page, two frames after opening, so a slow machine can't turn it into a slow second tap
    await p.evaluate(
      () =>
        new Promise<void>(done => {
          [...document.querySelectorAll<HTMLElement>('#first-aid button')].find(b => b.innerText.includes('CPR'))!.click();
          requestAnimationFrame(() =>
            requestAnimationFrame(() => {
              document.querySelector<HTMLElement>('[role=dialog] a[href="tel:112"]')!.click();
              done();
            })
          );
        })
    );
    ok((await linkTaps()) === tapsBefore, 'a quick second tap does not press Call 112 in the popup');
    await p.waitForTimeout(500);
    const call = p.getByRole('dialog').getByRole('link', { name: 'Call 112' });
    const callOpen = await call.boundingBox();
    await p.touchscreen.tap(callOpen!.x + callOpen!.width / 2, callOpen!.y + callOpen!.height / 2);
    await p.waitForTimeout(50);
    ok((await linkTaps()) === tapsBefore + 1, 'a deliberate tap on Call 112 works straight after');
    await p.getByRole('dialog').getByRole('button', { name: 'Close' }).tap();

    // Tapping outside closes it, and doesn't also press what is underneath
    await trigger.scrollIntoViewIfNeeded();
    await trigger.tap();
    await p.waitForTimeout(450);
    const before = await popup(p);
    ok(before!.top > 10, 'there is backdrop above the sheet to tap');
    // Right above the SOS button in the top bar, the worst thing for a tap to fall through to
    const under = await p.evaluate((top: number) => {
      const sos = [...document.querySelectorAll('button')].find(b => /SOS/.test(b.innerText) && b.getBoundingClientRect().top < top && b.getBoundingClientRect().width > 0)!.getBoundingClientRect();
      return { x: sos.left + sos.width / 2, y: Math.min(sos.top + sos.height / 2, top - 4) };
    }, before!.top);
    await p.touchscreen.tap(under.x, under.y);
    await p.waitForTimeout(400);
    ok((await p.getByRole('dialog').count()) === 0, 'tapping the backdrop closes the popup, and does not press the SOS button under it');
    await trigger.tap();
    await p.waitForTimeout(350);
    const again = await popup(p);
    ok(again && fits(again), 'it reopens normally afterwards');

    // A re-render of the page behind (here, a language change) used to pull focus back to the panel
    await p.getByRole('dialog').getByRole('button', { name: 'Close' }).focus();
    await p.evaluate(() => window.dispatchEvent(new CustomEvent('4life-language-changed', { detail: 'ak' })));
    await p.waitForTimeout(500);
    ok(await p.evaluate(() => document.activeElement?.getAttribute('aria-label') === 'Close' && document.documentElement.style.overflow === 'hidden'), 'focus stays where it was and the page stays locked');
    await p.keyboard.press('Escape');
    ok((await p.getByRole('dialog').count()) === 0 && (await p.evaluate(() => document.documentElement.style.overflow !== 'hidden')), 'Escape closes it and frees the page');
    ok((await p.evaluate(() => getComputedStyle(document.documentElement).touchAction)) === 'manipulation', 'double-tap zoom is off and pinch zoom stays on');
    await ctx.close();
  }

  console.log(`All ${n} mobile checks passed`);
} finally {
  await browser.close();
  await server.close();
}
process.exit(0);
