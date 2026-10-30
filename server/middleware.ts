/**
 * Express middleware for the 4Life API: CORS, sign-in, rate limit and error handling.
 * The checks themselves live in core/guard.ts so the Supabase functions use the same rules.
 */
import type { NextFunction, Request, Response } from 'express';
import type { Env } from './core/ai.js';
import { checkSignIn, rateLimitPerMinute, rateLimiter, signInRequired } from './core/guard.js';

export const processEnv: Env = name => process.env[name];

/**
 * CORS. The web app calls /api on its own address, which needs no CORS at all.
 * To let other sites (a mobile shell, a second domain) call the API, list them in
 * ALLOWED_ORIGINS, comma separated: https://4life.app,https://www.4life.app
 */
export function cors() {
  const allowed = (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map(s => s.trim().replace(/\/$/, ''))
    .filter(Boolean);
  return (req: Request, res: Response, next: NextFunction) => {
    const origin = req.headers.origin;
    if (origin && (allowed.includes('*') || allowed.includes(origin))) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization,apikey,Accept');
    }
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    res.setHeader('Cache-Control', 'no-store');
    next();
  };
}

/** Per-visitor limit on the routes that cost money (the AI ones). */
export function limit() {
  const hit = rateLimiter(rateLimitPerMinute(processEnv));
  return (req: Request, res: Response, next: NextFunction) => {
    const r = hit(req.ip || 'unknown');
    if (r.ok) return next();
    if (r.retryAfter) res.setHeader('Retry-After', String(r.retryAfter));
    res.status(r.status || 429).json({ error: r.error });
  };
}

/** Supabase sign-in check (see core/guard.ts). Sets req.userId when signed in. */
export function signIn() {
  return async (req: Request, res: Response, next: NextFunction) => {
    const r = await checkSignIn(req.headers.authorization, processEnv, signInRequired(processEnv));
    if (!r.ok) return res.status(r.status || 401).json({ error: r.error });
    (req as any).userId = r.userId;
    next();
  };
}

/** Unknown /api routes get JSON, not the web page. */
export function notFound(_req: Request, res: Response) {
  res.status(404).json({ error: 'Not found' });
}

/**
 * Last stop for errors (bad JSON, a body that is too large, anything thrown).
 * People get a short message; the details go to the server logs only.
 */
export function errors(err: any, _req: Request, res: Response, _next: NextFunction) {
  const status = Number(err?.status || err?.statusCode) || 500;
  if (status >= 500) console.error('API error:', err);
  if (res.headersSent) return res.end();
  res.status(status).json({
    error: status === 413 ? 'That message is too long.' : status < 500 ? 'The request could not be read.' : 'Something went wrong. Please try again.',
  });
}
