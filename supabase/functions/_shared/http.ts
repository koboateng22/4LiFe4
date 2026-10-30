/**
 * The small Deno layer every 4Life Edge Function shares: CORS, method check,
 * sign-in check, rate limit, JSON in and out. The real work is in ./core
 * (generated from server/core, the same code the Vercel API runs).
 */
import { corsHeaders } from './cors.ts';
import { checkSignIn, rateLimitPerMinute, rateLimiter } from './core/guard.ts';
import type { Ctx, Result } from './core/handlers.ts';
import type { Env } from './core/ai.ts';

/** Settings come from Supabase secrets: `supabase secrets set NAME=value` */
export const env: Env = name => Deno.env.get(name);
export const ctx: Ctx = { env };

/**
 * Sign-in is required by default here, because these functions have a public URL.
 * Set the secret REQUIRE_SIGN_IN=false to allow callers who are not signed in.
 */
const signInRequired = () => (env('REQUIRE_SIGN_IN') || '').trim().toLowerCase() !== 'false';

export function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers },
  });
}

/** Sends a core handler's result. */
export const fromResult = (r: Result) => json(r.body, r.status, r.cache ? { 'Cache-Control': r.cache } : {});

/** The visitor's address, for the rate limit. */
const visitor = (req: Request) => (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'unknown';

interface Options {
  /** HTTP method this function answers (besides OPTIONS) */
  method: 'GET' | 'POST';
  /** Costs money or reads personal data: rate-limited and needs sign-in */
  protected?: boolean;
  /** Rate-limited even though it is open to everyone */
  limited?: boolean;
}

/**
 * Starts a function. `handler` gets the request and its parsed JSON body (POST)
 * and returns a Response. Errors are logged and answered with a short message.
 */
export function serveFunction(options: Options, handler: (req: Request, body: any) => Promise<Response> | Response) {
  const limit = options.protected || options.limited ? rateLimiter(rateLimitPerMinute(env)) : null;

  Deno.serve(async (req: Request) => {
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
    if (req.method !== options.method) return json({ error: `Use ${options.method}` }, 405, { Allow: `${options.method}, OPTIONS` });

    if (limit) {
      const r = limit(visitor(req));
      if (!r.ok) return json({ error: r.error }, r.status || 429, r.retryAfter ? { 'Retry-After': String(r.retryAfter) } : {});
    }
    if (options.protected) {
      const r = await checkSignIn(req.headers.get('Authorization'), env, signInRequired(), req.headers.get('apikey'));
      if (!r.ok) return json({ error: r.error }, r.status || 401);
    }

    let body: any = null;
    if (req.method === 'POST') {
      const text = await req.text();
      if (text.length > 100_000) return json({ error: 'That message is too long.' }, 413);
      try {
        body = text ? JSON.parse(text) : {};
      } catch {
        return json({ error: 'The request could not be read.' }, 400);
      }
    }

    try {
      return await handler(req, body);
    } catch (error) {
      console.error('Function error:', error);
      return json({ error: 'Something went wrong. Please try again.' }, 500);
    }
  });
}
