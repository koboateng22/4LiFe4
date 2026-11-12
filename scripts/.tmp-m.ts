import { chromium } from 'playwright-core';
import { createServer } from 'vite';
for (const k of ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY', 'VITE_SUPABASE_PUBLISHABLE_KEY']) delete process.env[k];
const server = await createServer({ server: { port: 5203, strictPort: true }, logLevel: 'error', envDir: '/nonexistent' });
await server.listen();
const U = 'http://localhost:5203/';
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox'] });
const SIZES: Array<[number, number, boolean]> = [[320, 640, true], [375, 812, true], [414, 896, true], [768, 1024, true], [1280, 800, false]];
const TABS = ['Home', 'AI CBT Therapy', 'Global Village', 'Learn', 'Instant EMS', 'Settings'];
for (const [w, h, mobile] of SIZES) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: mobile ? 2 : 1, serviceWorkers: 'block', reducedMotion: 'reduce' });
  await ctx.route('**/*', r => (r.request().url().startsWith(U) ? r.continue() : r.abort()));
  const p = await ctx.newPage();
  await p.goto(U);
  await p.locator('button', { hasText: 'Kwame Mensah' }).click();
  await p.locator('#main-content').waitFor({ timeout: 60000 });
  for (const name of TABS) {
    const btn = w < 1024 ? p.locator('nav.dock button[aria-label="' + name + '"]') : p.locator('#main-navigation button[aria-label="' + name + '"]');
    await btn.click();
    await p.waitForTimeout(900);
    const m = await p.evaluate(() => {
      const over = document.documentElement.scrollWidth - innerWidth;
      const small = [...document.querySelectorAll('header button, header a, nav.dock button')].filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && (r.width < 40 || r.height < 40); }).map(e => (e.getAttribute('aria-label') || e.textContent || '').trim().slice(0, 20));
      const clipped = [...document.querySelectorAll('header *')].filter(e => e.children.length === 0 && (e as HTMLElement).scrollWidth > (e as HTMLElement).clientWidth + 1 && getComputedStyle(e).textOverflow !== 'ellipsis').length;
      window.scrollTo(0, document.body.scrollHeight);
      return { over, small, clipped };
    });
    await p.waitForTimeout(300);
    const cover = await p.evaluate(() => {
      const dock = document.querySelector('nav.dock .dock-row') as HTMLElement | null;
      if (!dock || getComputedStyle(document.querySelector('nav.dock')!).display === 'none') return 'no dock';
      const top = dock.getBoundingClientRect().top;
      const els = [...document.querySelectorAll('#main-content *')].filter(e => { const r = e.getBoundingClientRect(); return r.height > 0 && r.width > 0 && (e as HTMLElement).innerText !== undefined; });
      const lastBottom = Math.max(...els.map(e => e.getBoundingClientRect().bottom));
      return Math.round(top - lastBottom);
    });
    console.log(w + 'px', name.padEnd(15), 'overflow', m.over, 'small-targets', JSON.stringify(m.small), 'clipped', m.clipped, 'gap-above-dock', cover);
    await p.evaluate(() => window.scrollTo(0, 0));
    await p.waitForTimeout(200);
    await p.screenshot({ path: '/tmp/claude-1000/-home-jojoo-ob-Desktop-4life-v2/dc622e1f-6ad8-4b8f-b0ac-b43f84669122/scratchpad/m/' + w + '-' + name.replace(/\W+/g, '_') + '.png' });
  }
  await ctx.close();
}
await browser.close(); await server.close(); process.exit(0);
