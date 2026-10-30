/**
 * The /api routes for Express. Each one hands the work to core/handlers.ts,
 * which the Supabase functions use too, so both backends behave the same.
 */
import { Router, type Request, type Response } from 'express';
import { cbtSuggest, clientError, firstAidVideos, health, moderate, readChat, runChat, villageGuide, type Result } from './core/handlers.js';
import { limit, processEnv, signIn } from './middleware.js';

const ctx = { env: processEnv };

/** Sends a handler's result. */
function reply(res: Response, r: Result) {
  if (r.cache) res.setHeader('Cache-Control', r.cache);
  if (r.status === 204) return res.status(204).end();
  res.status(r.status).json(r.body);
}

/** Wraps an async handler so a thrown error reaches the error middleware. */
const handle = (fn: (req: Request) => Promise<Result> | Result) => (req: Request, res: Response, next: (e?: unknown) => void) => {
  Promise.resolve(fn(req)).then(r => reply(res, r), next);
};

export function apiRoutes() {
  const r = Router();
  const ai = [limit(), signIn()];

  // Open to everyone: no AI cost and nothing personal
  r.get('/health', handle(() => health(ctx)));
  r.get('/first-aid/videos', handle(req => firstAidVideos(req.query.topic, ctx)));
  r.post('/client-error', limit(), handle(req => clientError(req.body)));

  // 1. AI CBT therapy (streamed as server-sent events when the app asks for it)
  r.post('/chat', ...ai, async (req, res, next) => {
    const read = readChat(req.body);
    if ('error' in read) return reply(res, read.error);
    const { input } = read;

    // Stop asking the AI if the person closes the app or presses Stop
    const aborter = new AbortController();
    res.on('close', () => {
      if (!res.writableEnded) aborter.abort();
    });

    try {
      if (!input.stream) return res.json(await runChat(input, ctx, () => {}, aborter.signal));

      res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('X-Accel-Buffering', 'no');
      res.flushHeaders?.();
      const send = (event: string, data: unknown) => {
        if (!res.writableEnded) res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      };
      const done = await runChat(input, ctx, send, aborter.signal);
      send('done', done);
      res.end();
    } catch (e) {
      next(e);
    }
  });

  // 2. Thought record helper
  r.post('/cbt/suggest', ...ai, handle(req => cbtSuggest(req.body, ctx)));

  // 3–4. Global Village
  r.post('/moderate', ...ai, handle(req => moderate(req.body, ctx)));
  r.post('/village/guide', ...ai, handle(req => villageGuide(req.body, ctx)));

  return r;
}
