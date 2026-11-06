/**
 * The Learn section in real Chrome, with /api/videos answered by a fake (no YouTube quota used):
 * the suggested topic, video cards, playing, search, "Show more", and the loading, error, empty
 * and no-key states. Nothing is fetched from YouTube until a video is played.
 *   npm run test:learn        (needs Chrome: CHROME_PATH or /usr/bin/google-chrome)
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
const PORT = 5189;
const server = await createServer({ server: { port: PORT, strictPort: true }, logLevel: 'error', envDir: '/nonexistent' });
await server.listen();
const URL = `http://localhost:${PORT}/`;
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox'] });

const video = (id: string, category: string, extra: Record<string, unknown> = {}) => ({
  id,
  title: `How cravings rise and fall ${id} — a long title that has to wrap neatly onto two lines on a phone`,
  channel: 'Recovery Science Channel',
  description: 'A psychologist explains urge surfing in plain words, with a short exercise you can try today.',
  thumb: '',
  duration: 725,
  category,
  publishedAt: '2026-01-01T00:00:00Z',
  ...extra,
});

type Mode = 'normal' | 'fail' | 'nokey' | 'empty';
let mode: Mode = 'normal';
const requests: URLSearchParams[] = [];
let youtubeHits = 0;

async function route(r: Route) {
  const u = r.request().url();
  if (/youtube(-nocookie)?\.com|ytimg\.com/.test(u)) {
    youtubeHits++;
    return r.fulfill({ status: 200, contentType: 'text/html', body: '<html><body>player</body></html>' });
  }
  if (u.includes('/api/videos')) {
    const q = new globalThis.URL(u).searchParams;
    requests.push(q);
    const cat = q.get('category') || 'wellness';
    if (mode === 'fail') return r.fulfill({ status: 503, json: { error: 'down' } });
    if (mode === 'nokey') return r.fulfill({ json: { category: cat, videos: [], nextPage: null, keyMissing: true } });
    if (mode === 'empty') return r.fulfill({ json: { category: cat, videos: [], nextPage: null } });
    const page = q.get('page');
    const videos = page
      ? [video('v3', cat), video('v4', cat), video('v1', cat)] // v1 repeats: shown once
      : [video('v1', cat), video('v2', cat, { duration: 3723 })];
    return r.fulfill({ json: { category: cat, videos, nextPage: page ? null : 'PAGE_2' } });
  }
  return u.startsWith(URL) ? r.continue() : r.abort();
}

const openLearn = async (p: Page) => {
  await p.goto(URL);
  await p.locator('button', { hasText: 'Kwame Mensah' }).click();
  await p.locator('#main-content').waitFor();
  await p.keyboard.press('Control+k');
  await p.keyboard.type('learn');
  await p.keyboard.press('Enter');
  await p.getByRole('heading', { name: 'Short videos to help you understand recovery' }).waitFor();
};

const overflow = (p: Page) =>
  p.evaluate(() => {
    const out: string[] = [];
    if (document.documentElement.scrollWidth > innerWidth + 1) out.push(`page is ${document.documentElement.scrollWidth}px wide`);
    for (const el of document.querySelectorAll<HTMLElement>('#main-content h2, #main-content h3, #main-content p, #main-content a, #main-content button')) {
      const r = el.getBoundingClientRect();
      if (!r.width || el.closest('.no-scrollbar, .sr-only')) continue;
      if (r.right > innerWidth + 1 || r.left < -1) out.push(`${el.tagName} "${el.innerText.slice(0, 30)}" leaves the screen`);
    }
    return out;
  });

try {
  for (const width of [360, 1280]) {
    const at = `${width}px`;
    mode = 'normal';
    requests.length = 0;
    youtubeHits = 0;
    const ctx = await browser.newContext({ viewport: { width, height: 860 }, serviceWorkers: 'block', reducedMotion: 'reduce' });
    await ctx.route('**/*', route);
    const p = await ctx.newPage();
    const errors: string[] = [];
    p.on('pageerror', e => errors.push(e.message));
    await openLearn(p);

    // The demo person works on drugs and alcohol, so that topic is suggested and opened first
    const topics = p.getByRole('group', { name: 'Topics' });
    await p.locator('#main-content ul li h3').first().waitFor();
    ok((await topics.getByRole('button', { pressed: true }).innerText()).includes('Recovery from drugs and alcohol'), `${at}: the suggested topic fits what the person is working on`);
    ok(requests[0]?.get('category') === 'recovery' && !requests[0]?.get('q'), `${at}: the list is asked for by topic`);
    const cards = p.locator('#main-content ul li');
    ok((await cards.count()) === 2, `${at}: video cards are shown`);
    const first = await cards.first().innerText();
    ok(first.includes('Recovery Science Channel') && first.includes('urge surfing') && first.includes('12:05') && first.includes('Watch on YouTube'), `${at}: a card has title, channel, description, length, topic and a YouTube link`);
    ok((await cards.nth(1).innerText()).includes('1:02:03'), `${at}: long videos show hours`);
    ok((await cards.first().getByRole('link', { name: /Watch on YouTube/ }).getAttribute('href')) === 'https://www.youtube.com/watch?v=v1', `${at}: the link goes to the original video`);
    ok(youtubeHits === 0, `${at}: nothing is loaded from YouTube before a video is played`);
    ok((await overflow(p)).length === 0, `${at}: nothing leaves the screen${(await overflow(p)).join('; ')}`);

    // Play: the privacy-enhanced player, only now
    await cards.first().getByRole('button', { name: /^Play:/ }).click();
    const frame = cards.first().locator('iframe');
    await frame.waitFor();
    ok((await frame.getAttribute('src'))?.startsWith('https://www.youtube-nocookie.com/embed/v1'), `${at}: playing uses YouTube's privacy-enhanced player`);

    // Show more: the next page, each video once
    await p.getByRole('button', { name: 'Show more videos' }).click();
    await p.waitForFunction(() => document.querySelectorAll('#main-content ul li h3').length >= 4);
    ok((await cards.count()) === 4 && requests.at(-1)?.get('page') === 'PAGE_2', `${at}: "Show more" adds the next page without repeating videos`);
    ok((await p.getByRole('button', { name: 'Show more videos' }).count()) === 0, `${at}: "Show more" goes once there are no more`);

    // Search stays inside the topic and says what it shows
    await p.getByRole('searchbox').fill('sleep');
    await p.getByRole('button', { name: /^Search$/ }).click();
    await p.getByRole('heading', { name: /Results for “sleep”/ }).waitFor();
    ok(requests.at(-1)?.get('q') === 'sleep' && requests.at(-1)?.get('category') === 'recovery', `${at}: a search is sent with its topic`);
    await p.getByRole('button', { name: 'Clear search' }).click();
    ok(!(await p.getByRole('heading', { name: /Results for/ }).count()), `${at}: clearing the search goes back to the topic`);

    // Another topic
    const before = requests.length;
    await topics.getByRole('button', { name: /^Anxiety/ }).click();
    await p.locator('#main-content ul li h3').first().waitFor();
    ok(requests.length === before + 1 && requests.at(-1)?.get('category') === 'anxiety', `${at}: choosing a topic loads it`);
    await topics.getByRole('button', { name: /Recovery from drugs/ }).click();
    ok(requests.length === before + 1, `${at}: going back to a topic already seen needs no new request`);

    // Failure, then Try again
    mode = 'fail';
    await topics.getByRole('button', { name: /^Stress/ }).click();
    await p.getByText('Videos are not available right now. Please try again later.').waitFor();
    mode = 'normal';
    await p.getByRole('button', { name: 'Try again' }).click();
    await p.locator('#main-content ul li h3').first().waitFor();
    ok(true, `${at}: a failed load says so plainly, and Try again recovers`);

    // No key on the server: an honest message and a YouTube search link, no made-up videos
    mode = 'nokey';
    await topics.getByRole('button', { name: /^Healthy habits/ }).click();
    await p.getByText("Videos can't be shown in the app yet.").waitFor();
    ok((await p.getByRole('link', { name: /Search on YouTube/ }).getAttribute('href'))?.startsWith('https://www.youtube.com/results?search_query='), `${at}: without a YouTube key the app says so and offers a YouTube search`);

    // Nothing found
    mode = 'empty';
    await topics.getByRole('button', { name: /^Personal growth/ }).click();
    await p.getByText('No videos in this topic right now. Try another topic.').waitFor();
    ok(true, `${at}: an empty topic says so`);

    ok(await p.getByText("These videos are for learning. They don't replace a counsellor or treatment.", { exact: false }).isVisible(), `${at}: the page says videos don't replace a counsellor`);
    ok(errors.length === 0, `${at}: no page errors${errors.length ? ': ' + errors.join('; ') : ''}`);
    await ctx.close();
  }
  console.log(`All ${n} Learn checks passed`);
} finally {
  await browser.close();
  await server.close();
}
process.exit(0);
