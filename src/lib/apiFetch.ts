/**
 * fetch() for the app's backend.
 *
 * Every backend route exists twice, with the same code behind it (server/core):
 *   1. /api/... on this site: the Vercel function, or `npm run dev`
 *   2. a Supabase Edge Function (supabase/functions/<name>)
 * The app calls /api first and uses the Supabase function when /api is missing or
 * down, or (for the AI routes) has no AI key. Set VITE_API_BACKEND=supabase to try
 * Supabase first. If neither backend has an AI key, the first one's honest
 * "not set up" answer is shown.
 *
 * When the person is signed in, their access token goes with the request so the
 * backend can check who is calling.
 */
import { supabase, supabaseKey, supabaseUrl } from './supabase';

const env: Record<string, string | undefined> = (import.meta as any).env || {};
const PREFER_SUPABASE = (env.VITE_API_BACKEND || env.VITE_CHAT_BACKEND) === 'supabase';

/** Which Supabase function answers each /api route */
const FUNCTION_FOR: Record<string, string> = {
  '/api/chat': 'chat',
  '/api/cbt/suggest': 'cbt-suggest',
  '/api/moderate': 'moderate',
  '/api/village/guide': 'village-guide',
  '/api/first-aid/videos': 'first-aid-videos',
  '/api/videos': 'library-videos',
  '/api/health': 'health',
  '/api/client-error': 'client-error',
};

/** Statuses that mean "this backend isn't there or isn't working", so the other one is tried */
const UNAVAILABLE = new Set([404, 405, 500, 502, 503, 504]);

async function accessToken(): Promise<string | undefined> {
  if (!supabase) return undefined;
  try {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token;
  } catch {
    return undefined;
  }
}

/** An AI route on a backend with no AI key says so in this header (see AI_HEADER in server/core/ai.ts) */
const noAi = (res: Response) => (res.headers.get('x-4life-ai') || '').toLowerCase() === 'off';

/** True when a response can't be the API's answer (a static host's page, or a server error). */
function unavailable(res: Response): boolean {
  if (UNAVAILABLE.has(res.status)) return true;
  // Some hosts answer unknown paths with the app's own page
  return res.ok && (res.headers.get('content-type') || '').includes('text/html');
}

function viaApi(path: string, init: RequestInit, token?: string): Promise<Response> {
  const headers = new Headers(init.headers || {});
  if (token) headers.set('Authorization', `Bearer ${token}`);
  return fetch(path, { ...init, headers });
}

function viaFunction(path: string, init: RequestInit, token?: string): Promise<Response> | null {
  const [route, query = ''] = path.split('?');
  const name = FUNCTION_FOR[route];
  if (!name || !supabaseUrl || !supabaseKey) return null;
  const headers = new Headers(init.headers || {});
  headers.set('apikey', supabaseKey);
  headers.set('Authorization', `Bearer ${token || supabaseKey}`);
  return fetch(`${supabaseUrl}/functions/v1/${name}${query ? `?${query}` : ''}`, { ...init, headers });
}

export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const token = await accessToken();
  const attempts = PREFER_SUPABASE
    ? [() => viaFunction(path, init, token), () => viaApi(path, init, token)]
    : [() => viaApi(path, init, token), () => viaFunction(path, init, token)];

  let last: Response | null = null;
  let lastError: unknown = null;
  // A backend with no AI key: its honest answer ("not set up") is kept, and the other backend is asked
  let withoutAi: Response | null = null;
  for (const attempt of attempts) {
    try {
      const pending = attempt();
      if (!pending) continue;
      const res = await pending;
      if (noAi(res)) {
        withoutAi ??= res;
        continue;
      }
      if (!unavailable(res)) {
        withoutAi?.body?.cancel().catch(() => {}); // the other backend answered: drop the "not set up" one
        return res;
      }
      last = res;
    } catch (e: any) {
      // Stop button or closed screen: don't try the other backend
      if (init.signal?.aborted || e?.name === 'AbortError') throw e;
      lastError = e; // network error: try the other backend
    }
  }
  if (withoutAi) return withoutAi;
  if (last) return last;
  throw lastError || new TypeError('The service could not be reached');
}
