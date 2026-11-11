/**
 * The AI chat screen in real Chrome, with /api/chat answered by a fake server (no AI quota used):
 * streaming, context on follow-ups, one message per press, and what people see when the AI can't
 * answer (free quota used up, rate limit, no connection, offline), with Try again that never
 * duplicates a message. The real Gemini round trip is checked by `npm run ai:check`.
 *   npm run test:chat        (needs Chrome: CHROME_PATH or /usr/bin/google-chrome)
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
const PORT = 5193;
const server = await createServer({ server: { port: PORT, strictPort: true }, logLevel: 'error', envDir: '/nonexistent' });
await server.listen();
const URL = `http://localhost:${PORT}/`;
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox'] });

type Mode = { kind: 'ok'; text?: string } | { kind: 'error'; code: string; retryAfter?: number } | { kind: 'abort' } | { kind: 'slow' };
const queue: Mode[] = [];
const bodies: any[] = [];
const sse = (events: Array<[string, unknown]>) => events.map(([e, d]) => `event: ${e}\ndata: ${JSON.stringify(d)}\n\n`).join('');

async function chatRoute(r: Route) {
  const body = JSON.parse(r.request().postData() || '{}');
  bodies.push(body);
  const mode = queue.shift() || { kind: 'ok' };
  if (mode.kind === 'abort') return r.abort('internetdisconnected');
  if (mode.kind === 'slow') await new Promise(res => setTimeout(res, 800));
  if (mode.kind === 'error') {
    return r.fulfill({
      status: 200,
      headers: { 'Content-Type': 'text/event-stream' },
      body: sse([['meta', { risk: 'none' }], ['done', { reply: '', suggestions: [], risk: 'none', model: 'gemini-test', mode: 'cbt', error: { code: mode.code, retryAfter: mode.retryAfter } }]]),
    });
  }
  const reply = (mode.kind === 'ok' && mode.text) || `You said: "${body.message}". What happened just before that feeling started?`;
  return r.fulfill({
    status: 200,
    headers: { 'Content-Type': 'text/event-stream' },
    body: sse([
      ['meta', { risk: 'none' }],
      ['delta', { text: reply.slice(0, 20) }],
      ['delta', { text: reply.slice(20) }],
      ['done', { reply, suggestions: ['It was after school', 'I felt alone', 'Help me breathe'], risk: 'none', model: 'gemini-test', mode: 'cbt' }],
    ]),
  });
}

const box = (p: Page) => p.locator('#chat-input');
const sendBtn = (p: Page) => p.getByRole('button', { name: 'Send message' });
const userBubbles = (p: Page) => p.locator('[aria-label="Messages"] .flex-row-reverse');
const send = async (p: Page, text: string) => {
  await box(p).fill(text);
  await sendBtn(p).click();
};
const lastReplyDone = (p: Page) => p.waitForFunction(() => !document.querySelector('[aria-label="Messages"] [role="status"]'));

try {
  for (const width of [360, 1280]) {
    const at = `${width}px`;
    bodies.length = 0;
    queue.length = 0;
    const ctx = await browser.newContext({ viewport: { width, height: 860 }, serviceWorkers: 'block', reducedMotion: 'reduce' });
    await ctx.route('**/*', r => {
      const u = r.request().url();
      if (u.includes('/api/chat')) return chatRoute(r);
      return u.startsWith(URL) ? r.continue() : r.abort();
    });
    const p = await ctx.newPage();
    const errors: string[] = [];
    p.on('pageerror', e => errors.push(e.message));
    await p.goto(URL);
    await p.locator('button', { hasText: 'Kwame Mensah' }).click();
    await p.locator('#main-content').waitFor();
    await p.keyboard.press('Control+k');
    await p.keyboard.type('AI CBT therapy');
    await p.keyboard.press('Enter');
    await box(p).waitFor();
    // start fresh (the demo person may have an earlier chat on this device)
    const fresh = p.getByRole('button', { name: 'Start a new conversation' });
    if (await fresh.isEnabled()) {
      await fresh.click();
      await p.getByRole('dialog').getByRole('button', { name: /Start fresh|Start again|Start a new conversation/ }).last().click();
    }

    // Empty messages are not sent
    ok(await sendBtn(p).isDisabled(), `${at}: Send is off while the box is empty`);

    // 1. A real (streamed) reply, with suggestions
    await send(p, 'My brother says I will never change');
    await p.getByText('What happened just before that feeling started?', { exact: false }).last().waitFor();
    await lastReplyDone(p);
    ok(bodies.length === 1 && bodies[0].stream === true && bodies[0].history.length === 0, `${at}: the message goes to the AI service, streamed`);
    ok(await p.getByRole('button', { name: 'I felt alone' }).isVisible(), `${at}: the reply's suggestions appear`);

    // 2. A follow-up carries the conversation, for context
    await send(p, 'It hurt a lot');
    await p.getByText('You said: "It hurt a lot"', { exact: false }).waitFor();
    await lastReplyDone(p);
    const h = bodies[1].history;
    ok(h.length === 2 && h[0].role === 'user' && h[0].content === 'My brother says I will never change' && h[1].role === 'model', `${at}: a follow-up sends the earlier turns, in order`);

    // 3. One press, one message: Send is off while a reply is coming
    queue.push({ kind: 'slow' });
    await box(p).fill('Pressing send many times');
    await sendBtn(p).click();
    await p.getByRole('button', { name: 'Stop the reply' }).waitFor();
    ok((await sendBtn(p).count()) === 0, `${at}: while a reply is coming, Send is replaced by Stop`);
    await box(p).press('Enter');
    await lastReplyDone(p);
    ok(bodies.length === 3 && (await userBubbles(p).filter({ hasText: 'Pressing send many times' }).count()) === 1, `${at}: pressing again doesn't send the message twice`);

    // 4. Free daily quota used up: said plainly, no made-up reply, no Try again
    queue.push({ kind: 'error', code: 'quota_exhausted' });
    await send(p, 'Are you there?');
    await p.getByRole('alert').filter({ hasText: 'free daily limit' }).waitFor();
    ok((await p.getByRole('alert').filter({ hasText: 'free daily limit' }).getByRole('button', { name: 'Try again' }).count()) === 0, `${at}: a used-up free quota is explained, without a pointless Try again`);
    ok(!(await p.locator('[aria-label="Messages"]').innerText()).includes('breathe in for 4 and out for 6, five times'), `${at}: no built-in reply pretends to be the AI`);

    // 5. Rate limit with a wait, then Try again: the same message, once
    queue.push({ kind: 'error', code: 'rate_limited', retryAfter: 12 });
    await send(p, 'I feel restless tonight');
    const rate = p.getByRole('alert').filter({ hasText: '12 seconds' });
    await rate.waitFor();
    const before = bodies.length;
    await rate.getByRole('button', { name: 'Try again' }).click();
    await p.getByText('You said: "I feel restless tonight"', { exact: false }).waitFor();
    await lastReplyDone(p);
    ok(bodies.length === before + 1 && bodies.at(-1).message === 'I feel restless tonight', `${at}: Try again sends the same message again`);
    ok((await userBubbles(p).filter({ hasText: 'I feel restless tonight' }).count()) === 1 && !(await rate.count()), `${at}: …without a duplicate, and the notice goes away`);
    ok(!bodies.at(-1).history.some((t: any) => t.content === 'Are you there?'), `${at}: a message whose reply failed is left out of the context`);

    // 6. The connection drops: said plainly, and Try again works
    queue.push({ kind: 'abort' });
    await send(p, 'Hello again');
    const net = p.getByRole('alert').filter({ hasText: 'Could not reach the AI service' });
    await net.waitFor();
    await net.getByRole('button', { name: 'Try again' }).click();
    await p.getByText('You said: "Hello again"', { exact: false }).waitFor();
    ok((await userBubbles(p).filter({ hasText: 'Hello again' }).count()) === 1, `${at}: after a dropped connection, Try again works without a duplicate`);
    await lastReplyDone(p);

    // 7. Offline: nothing is sent, the message is kept
    await ctx.setOffline(true);
    const sentBefore = bodies.length;
    await send(p, 'Offline message');
    await p.getByRole('alert').filter({ hasText: "You're offline" }).waitFor();
    ok(bodies.length === sentBefore && (await userBubbles(p).filter({ hasText: 'Offline message' }).count()) === 1, `${at}: offline, nothing is sent and the message stays on screen`);
    await ctx.setOffline(false);

    // 8. A long reply with a long link stays inside the chat
    queue.push({ kind: 'ok', text: 'Here is a plan:\n\n1. **Breathe** slowly.\n2. Read https://www.example.org/a/very/long/link/that/has/no/spaces/at/all/anywhere/in/it\n\n' + 'Small steps count. '.repeat(60) });
    await p.getByRole('alert').filter({ hasText: "You're offline" }).getByRole('button', { name: 'Try again' }).click();
    await p.getByText('Small steps count.', { exact: false }).last().waitFor();
    await lastReplyDone(p);
    const overflow = await p.evaluate(() => {
      const card = document.querySelector('section[aria-label="Conversation"]')!.getBoundingClientRect();
      return [...document.querySelectorAll('[aria-label="Messages"] [class*="overflow-wrap"]')].some(el => el.getBoundingClientRect().right > card.right + 1 || el.scrollWidth > el.clientWidth + 1);
    });
    ok(!overflow && (await p.locator('[aria-label="Messages"] strong', { hasText: 'Breathe' }).count()) === 1, `${at}: a long reply (bold, list, long link) is shown in full, inside the chat`);

    // 9. The conversation stays after a reload (saved on this device)
    await p.reload();
    if (await p.locator('button', { hasText: 'Kwame Mensah' }).count()) await p.locator('button', { hasText: 'Kwame Mensah' }).click();
    await p.locator('#main-content').waitFor();
    await p.keyboard.press('Control+k');
    await p.keyboard.type('AI CBT therapy');
    await p.keyboard.press('Enter');
    await box(p).waitFor();
    ok((await userBubbles(p).filter({ hasText: 'My brother says I will never change' }).count()) === 1, `${at}: the conversation is still there after a reload`);

    // 10. New conversation clears it
    await p.getByRole('button', { name: 'Start a new conversation' }).click();
    await p.getByRole('dialog').getByRole('button', { name: /Start fresh|Start again|Start a new conversation/ }).last().click();
    ok((await userBubbles(p).count()) === 0, `${at}: "Start a new conversation" clears it`);
    ok(errors.length === 0, `${at}: no page errors${errors.length ? ': ' + errors.join('; ') : ''}`);
    await ctx.close();
  }
  console.log(`All ${n} chat checks passed`);
} finally {
  await browser.close();
  await server.close();
}
process.exit(0);
