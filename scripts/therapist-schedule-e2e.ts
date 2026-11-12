/**
 * The therapist's scheduling in real Chrome, on this device (no database needed):
 *  - Services: add one (with checks), see it as a card, pause it and offer it again;
 *  - Availability: a daily break and a blocked day off;
 *  - Sessions: the calendar (week, day, month); a session's details; moving it onto another
 *    session is refused, moving it to a free time works; cancelling it; booking can't overlap;
 *  - the client's booking screen offers the service and only real free times (no break, no day
 *    off), and the request reaches the therapist with the service.
 *   npm run test:therapist-schedule        (needs Chrome: CHROME_PATH or /usr/bin/google-chrome)
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
const PORT = 5196;
const server = await createServer({ server: { port: PORT, strictPort: true }, logLevel: 'error', envDir: '/nonexistent' });
await server.listen();
const URL = `http://localhost:${PORT}/`;
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox'] });

const DATA = '4life_therapist_data_v2_c1';
type S = { id: string; clientId: string; start: string; durationMin: number; status: string; serviceId?: string };
const sessions = (p: Page) => p.evaluate(k => JSON.parse(localStorage.getItem(k) || '{}').sessions as S[], DATA);
const pad = (x: number) => String(x).padStart(2, '0');
/** datetime-local value (the browser runs in Ghana time, so local = UTC) */
const local = (iso: string) => {
  const d = new Date(iso);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
};
/** A working day (Mon–Fri) at least `from` days ahead */
const workingDay = (from: number) => {
  const d = new Date();
  d.setUTCHours(12, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + from);
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6) d.setUTCDate(d.getUTCDate() + 1);
  return d;
};

const signInTherapist = async (p: Page) => {
  await p.getByRole('radio', { name: /Therapist/ }).click();
  await p.locator('button', { hasText: 'Ama Konadu' }).click();
  await p.getByRole('navigation').first().waitFor();
};
const go = async (p: Page, name: string) => {
  await p.locator('nav button', { hasText: new RegExp(`^${name}(\\d+)?$`) }).first().click();
};
const dialog = (p: Page) => p.getByRole('dialog');

try {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, timezoneId: 'Africa/Accra', locale: 'en-GB', serviceWorkers: 'block', reducedMotion: 'reduce' });
  await ctx.route('**/*', r => (r.request().url().startsWith(URL) ? r.continue() : r.abort()));
  const p = await ctx.newPage();
  const errors: string[] = [];
  p.on('pageerror', e => errors.push(e.message));
  await p.goto(URL);
  await signInTherapist(p);

  // ---------- Services ----------
  await go(p, 'Services');
  await p.getByText('No services yet').waitFor();
  ok(true, 'Services: a clear empty state that says what clients book until a service is added');
  await p.getByRole('button', { name: 'Add your first service' }).click();
  await dialog(p).getByRole('button', { name: 'Add service' }).click();
  ok(await dialog(p).getByText('Give the service a name.').isVisible(), 'Services: a service without a name is explained and not saved');
  await dialog(p).getByLabel('Name').fill('Short check-in');
  await dialog(p).getByLabel('Length').selectOption('30');
  await dialog(p).getByLabel('Price (GHS)').fill('40');
  await dialog(p).getByRole('button', { name: 'Text chat' }).click();
  await dialog(p).getByRole('button', { name: 'Add service' }).click();
  const card = p.getByRole('article', { name: 'Short check-in' });
  await card.waitFor();
  const cardText = await card.innerText();
  ok(/30 min/.test(cardText) && /GHS 40/.test(cardText) && /Offered/.test(cardText)  && /Text chat/.test(cardText) && /In person/.test(cardText), `Services: the new service shows as a card with its length, price and ways to meet`);
  await card.getByRole('button', { name: 'Pause' }).click();
  ok(/Paused/.test(await card.innerText()), 'Services: a service can be paused');
  await card.getByRole('button', { name: 'Offer again' }).click();
  ok(/Offered/.test(await card.innerText()), '…and offered again');
  await card.getByRole('button', { name: 'Edit Short check-in' }).click();
  await dialog(p).getByLabel('Price (GHS)').fill('45');
  await dialog(p).getByRole('button', { name: 'Save changes' }).click();
  await card.getByText('GHS 45').waitFor();
  ok(true, 'Services: editing a service updates its card');

  // ---------- Availability: a break and a day off ----------
  await go(p, 'Availability');
  await p.getByRole('switch', { name: /Daily break/ }).click();
  ok((await p.getByLabel('Break from').inputValue()) === '13:00' && (await p.getByLabel('Break until').inputValue()) === '14:00', 'Availability: a daily break can be switched on (13:00–14:00 to start)');
  await p.getByLabel('Break until').fill('12:30');
  ok(await p.getByRole('button', { name: 'Save availability' }).isDisabled(), 'Availability: a break that ends before it starts cannot be saved');
  await p.getByLabel('Break until').fill('14:00');
  await p.getByRole('button', { name: 'Save availability' }).click();
  await p.getByText('Your availability is saved.').waitFor();
  ok((await p.getByText('Break 13:00 – 14:00').count()) === 5, 'Availability: the week preview shows the break on each working day');
  const off = workingDay(4);
  const offKey = off.toISOString().slice(0, 10);
  await p.getByLabel('First day off').fill(offKey);
  await p.getByLabel('Note (only you see this)').fill('Training');
  await p.getByRole('button', { name: 'Block these dates' }).click();
  await p.getByRole('list', { name: 'Blocked dates' }).getByText('Training').waitFor();
  ok(true, 'Availability: a day off is added and listed');

  // ---------- Sessions: the calendar ----------
  await go(p, 'Sessions');
  await p.getByRole('group', { name: 'Calendar view' }).waitFor();
  ok((await p.getByRole('group', { name: 'Calendar view' }).getByRole('button', { name: 'Week', exact: true }).getAttribute('aria-pressed')) === 'true', 'Sessions: the calendar opens on the week (on a computer)');
  const weekEvents = await p.locator('#t-main button[aria-label*=" min, "]').count();
  ok(weekEvents > 0, `Sessions: this week's sessions are on the calendar (${weekEvents})`);
  const hatched = await p.locator('#t-main div[aria-hidden="true"][class*="repeating-linear-gradient"]').count();
  ok(hatched > 0, 'Sessions: closed hours, the break and days off are shaded');

  const upcoming = (await sessions(p)).filter(s => s.status === 'scheduled' && new Date(s.start).getTime() > Date.now() + 3600000).sort((a, b) => a.start.localeCompare(b.start));
  ok(upcoming.length >= 3, `there are upcoming sessions to work with (${upcoming.length})`);
  const [s1, s2, s3] = upcoming;
  const openSession = async (s: S) => {
    // month view → that day → the session
    await p.getByRole('group', { name: 'Calendar view' }).getByRole('button', { name: 'Month' }).click();
    const d = new Date(s.start);
    for (let i = 0; i < 3; i++) {
      const label = await p.evaluate(iso => new Date(iso).toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' }), s.start);
      const cell = p.locator(`#t-main button[aria-label^="${label}:"]`);
      if (await cell.count()) {
        await cell.first().click();
        break;
      }
      await p.getByRole('button', { name: 'Next' }).click();
      void d;
    }
    const time = await p.evaluate(iso => new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }), s.start);
    await p.locator(`#t-main button[aria-label^="${time}, ${s.durationMin} min"]`).first().click();
    await dialog(p).waitFor();
  };

  await openSession(s1);
  ok(await dialog(p).getByRole('button', { name: 'Open session' }).isVisible(), 'Sessions: clicking a session shows its details, with Open, Move and Cancel');
  await dialog(p).getByRole('button', { name: 'Move', exact: true }).click();
  await dialog(p).getByLabel('New date and time').fill(local(s2.start));
  await dialog(p).getByRole('button', { name: 'Move session' }).click();
  await dialog(p).getByText('That time overlaps another session. Please choose another time.').waitFor();
  ok((await sessions(p)).find(s => s.id === s1.id)!.start === s1.start, 'Sessions: moving a session onto another one is refused, and nothing changes');
  const free = new Date(workingDay(20));
  free.setUTCHours(10, 0, 0, 0);
  await dialog(p).getByLabel('New date and time').fill(local(free.toISOString()));
  await dialog(p).getByRole('button', { name: 'Move session' }).click();
  await dialog(p).waitFor({ state: 'detached' });
  ok(new Date((await sessions(p)).find(s => s.id === s1.id)!.start).getTime() === free.getTime(), 'Sessions: moving a session to a free time works');

  await openSession(s2);
  await dialog(p).getByRole('button', { name: 'Cancel session' }).click();
  await dialog(p).getByText(/will be cancelled/).waitFor();
  await dialog(p).getByRole('button', { name: 'Cancel session' }).click();
  await dialog(p).waitFor({ state: 'detached' });
  ok((await sessions(p)).find(s => s.id === s2.id)!.status === 'cancelled', 'Sessions: a session can be cancelled (after a confirmation)');

  await p.getByRole('group', { name: 'Calendar view' }).getByRole('button', { name: 'Day' }).click();
  ok((await p.getByRole('group', { name: 'Calendar view' }).getByRole('button', { name: 'Day' }).getAttribute('aria-pressed')) === 'true', 'Sessions: the day view opens');

  await p.getByRole('button', { name: 'Book a session' }).first().click();
  await dialog(p).getByLabel('Date and time').fill(local(s3.start));
  await dialog(p).getByRole('alert').getByText(/overlaps another session/).waitFor();
  ok(await dialog(p).getByRole('button', { name: 'Book session' }).isDisabled(), 'Sessions: booking a time that overlaps a session is not possible');
  await dialog(p).getByRole('button', { name: 'Cancel' }).click();
  ok(errors.length === 0, `therapist: no page errors${errors.length ? ': ' + errors.join('; ') : ''}`);

  // ---------- The client books: the service and real free times ----------
  await p.getByRole('button', { name: 'Sign out' }).first().click();
  await p.locator('button', { hasText: 'Kwame Mensah' }).click();
  await p.locator('#main-content').waitFor();
  await p.locator('#main-content').getByRole('button', { name: /^Book/ }).first().click();
  await dialog(p).getByText('Dr. Ama Konadu, PhD').waitFor();
  const svc = dialog(p).getByRole('button', { name: /Short check-in/ });
  ok((await svc.getAttribute('aria-pressed')) === 'true' && /GHS 45/.test(await svc.innerText()), 'client: the counsellor\'s service is offered, with its price');
  const chips = dialog(p).getByRole('group', { name: 'Days' }).getByRole('button');
  await chips.first().waitFor();
  const offLabel = await p.evaluate(iso => new Date(iso).toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'short' }), off.toISOString());
  const dayNames = await chips.allInnerTexts();
  ok(!dayNames.some(x => x.startsWith(offLabel)), `client: the therapist's day off is not offered (${offLabel})`);
  const times: string[] = [];
  for (let i = 0; i < Math.min(await chips.count(), 6); i++) {
    await chips.nth(i).click();
    times.push(...(await dialog(p).locator('.grid-cols-3 button').allInnerTexts()).map(x => x.trim().replace(/^0/, '')));
  }
  ok(times.length > 0 && !times.some(x => /^13:/.test(x)), `client: no times in the break, 30-minute times as the service says (${times.slice(0, 8).join(' ')})`);
  ok(times.includes('9:40') || times.includes('10:20') || times.includes('11:00'), 'client: times follow the 30-minute service with 10 minutes between');
  await dialog(p).locator('.grid-cols-3 button').first().click();
  await dialog(p).getByRole('button', { name: /^Request / }).click();
  await dialog(p).getByText(/Your request has been sent/).waitFor();
  const req = await p.evaluate(() => JSON.parse(localStorage.getItem('4life_session_requests') || '[]').pop());
  ok(req?.serviceName === 'Short check-in' && req?.serviceMin === 30, 'client: the request carries the chosen service');

  // ---------- …and the therapist sees it ----------
  await p.evaluate(() => localStorage.removeItem('4life_current_user_id'));
  await p.reload();
  await signInTherapist(p);
  await go(p, 'Requests');
  const reqCard = p.getByRole('article').filter({ hasText: 'Short check-in' });
  await reqCard.first().waitFor();
  ok(/30 min/.test(await reqCard.first().innerText()), 'therapist: the request shows the service and its length');
  await reqCard.first().getByRole('button', { name: 'Accept' }).click();
  ok(await dialog(p).getByText('Length: 30 minutes').isVisible(), 'therapist: accepting books the service\'s length');
  await dialog(p).getByRole('button', { name: 'Accept and book' }).click();
  await p.getByText(/is now your client/).waitFor();
  const booked = (await sessions(p)).find(s => s.start === req.preferredTime);
  ok(booked?.durationMin === 30 && booked?.status === 'scheduled', 'therapist: the accepted session is booked for 30 minutes at the chosen time');
  ok(errors.length === 0, `no page errors${errors.length ? ': ' + errors.join('; ') : ''}`);
  await ctx.close();

  // ---------- Phones: the calendar opens on the day, and nothing spills off the screen ----------
  {
    const c = await browser.newContext({ viewport: { width: 390, height: 844 }, timezoneId: 'Africa/Accra', serviceWorkers: 'block', reducedMotion: 'reduce' });
    await c.route('**/*', r => (r.request().url().startsWith(URL) ? r.continue() : r.abort()));
    const m = await c.newPage();
    await m.goto(URL);
    await signInTherapist(m);
    await m.getByRole('button', { name: 'Sessions' }).last().click();
    await m.getByRole('group', { name: 'Calendar view' }).waitFor();
    ok((await m.getByRole('group', { name: 'Calendar view' }).getByRole('button', { name: 'Day' }).getAttribute('aria-pressed')) === 'true', '390px: the calendar opens on the day view');
    const wide = await m.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    ok(wide <= 1, `390px: no sideways scrolling (${wide}px)`);
    await m.getByRole('group', { name: 'Calendar view' }).getByRole('button', { name: 'Month' }).click();
    const wide2 = await m.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    ok(wide2 <= 1, `390px: the month view fits too (${wide2}px)`);
    await c.close();
  }
  console.log(`All ${n} therapist scheduling checks passed`);
} finally {
  await browser.close();
  await server.close();
}
process.exit(0);
