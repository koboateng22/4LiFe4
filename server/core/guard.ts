/**
 * Protection shared by every runtime: the Supabase sign-in check and a simple rate limit.
 */
import type { Env } from './ai.js';

/** The answer from a check: allowed, or refused with a status and a message for the person. */
export interface Guard {
  ok: boolean;
  userId?: string;
  status?: number;
  error?: string;
  retryAfter?: number;
}

/* ---------- Sign-in ---------- */

const trimUrl = (v: string | undefined) => (v || '').trim().replace(/^["']|["']$/g, '').replace(/\/+$/, '');

/** Where the Supabase project is. Works with the app's VITE_ names and with Supabase's own. */
export function supabaseSettings(env: Env) {
  return {
    url: trimUrl(env('SUPABASE_URL') || env('VITE_SUPABASE_URL')),
    anonKey: (env('SUPABASE_ANON_KEY') || env('VITE_SUPABASE_ANON_KEY') || env('SUPABASE_PUBLISHABLE_KEY') || '').trim(),
  };
}

// Tokens already checked recently, so each message doesn't wait for an extra round trip
const checked = new Map<string, { userId: string; until: number }>();
const CHECK_TTL_MS = 60_000;

/**
 * Checks the "Authorization: Bearer <token>" header against Supabase.
 * - No Supabase settings: everyone is allowed (device mode, local development).
 * - No token: allowed unless `required` (REQUIRE_SIGN_IN).
 * - A token that Supabase rejects: refused, so the app asks the person to sign in again.
 */
export async function checkSignIn(
  authorization: string | null | undefined,
  env: Env,
  required: boolean,
  /** The project key the app sent (the "apikey" header), used if the server has none set */
  requestApiKey?: string | null
): Promise<Guard> {
  const settings = supabaseSettings(env);
  const url = settings.url;
  const anonKey = settings.anonKey || (requestApiKey || '').trim();
  const token = (authorization || '').startsWith('Bearer ') ? (authorization as string).slice(7).trim() : '';
  if (!url || !anonKey) return required ? { ok: false, status: 503, error: 'Sign-in is not set up on the server yet.' } : { ok: true };
  // A person's access token is a JWT (three parts). The project's public key on its own
  // (sb_publishable_… or the anon key) is not a signed-in person.
  const isUserToken = token.split('.').length === 3 && token !== anonKey && token !== requestApiKey;
  if (!isUserToken) return required ? { ok: false, status: 401, error: 'Please sign in' } : { ok: true };

  const now = Date.now();
  const hit = checked.get(token);
  if (hit && hit.until > now) return { ok: true, userId: hit.userId };

  try {
    const r = await fetch(`${url}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${token}`, apikey: anonKey },
      signal: AbortSignal.timeout(5000),
    });
    if (!r.ok) return { ok: false, status: 401, error: 'Your session has expired. Please sign in again.' };
    const userId = String(((await r.json()) as any)?.id || '');
    checked.set(token, { userId, until: now + CHECK_TTL_MS });
    if (checked.size > 2000) for (const [k, v] of checked) if (v.until < now) checked.delete(k);
    return { ok: true, userId };
  } catch (e) {
    console.error('Sign-in check failed:', e);
    return { ok: false, status: 503, error: 'Could not check your sign-in right now. Please try again.' };
  }
}

export const signInRequired = (env: Env) => (env('REQUIRE_SIGN_IN') || '').trim().toLowerCase() === 'true';

/* ---------- Rate limit ---------- */

/**
 * Allows `max` requests per visitor per minute. It lives in memory, so each running
 * server instance counts on its own: a brake against runaway use, not a hard quota.
 * (On Vercel, a Firewall rate-limit rule is the stronger option.)
 */
export function rateLimiter(max: number, windowMs = 60_000) {
  const hits = new Map<string, { n: number; reset: number }>();
  return (visitor: string): Guard => {
    const now = Date.now();
    const h = hits.get(visitor);
    if (!h || h.reset < now) {
      hits.set(visitor, { n: 1, reset: now + windowMs });
      if (hits.size > 5000) for (const [k, v] of hits) if (v.reset < now) hits.delete(k);
      return { ok: true };
    }
    if (++h.n > max) {
      return { ok: false, status: 429, error: "You're sending messages very fast. Please wait a moment and try again.", retryAfter: Math.ceil((h.reset - now) / 1000) };
    }
    return { ok: true };
  };
}

export const rateLimitPerMinute = (env: Env) => Number(env('RATE_LIMIT_PER_MINUTE')) || 30;
