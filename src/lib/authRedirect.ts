/**
 * Where Supabase sends people back to after an email link (confirm sign-up, reset password) or a
 * Google sign-in: always 4Life's own callback page, /auth/callback, on a 4Life address.
 *
 * - The trusted address is VITE_APP_URL (the public production site, e.g. https://4lifeee.vercel.app).
 *   The address the person is on is used only if it is on the allowlist (VITE_APP_URL, localhost, and
 *   any extra origins in VITE_AUTH_REDIRECT_ORIGINS for previews). Anything else falls back to VITE_APP_URL,
 *   so a link can never point at a preview, a protected Vercel address or another site.
 * - The page to open afterwards travels as ?next=<section>, and only a real 4Life section id is accepted:
 *   no address from a link or query string is ever followed (no open redirects).
 * - Supabase only honours these addresses if they are on its Redirect URLs list (see SUPABASE.md, section 1).
 */
import type { ActiveTab } from '../types';

export const CALLBACK_PATH = '/auth/callback';

/** The sections a sign-in may continue to (the app's own pages; nothing else is accepted) */
const SECTIONS: ActiveTab[] = ['dashboard', 'chat', 'community', 'learn', 'emergency_map', 'profile_settings'];

let env = (typeof import.meta.env === 'object' ? import.meta.env : {}) as Record<string, string | undefined>;
/** Tests only: settings as a build would have them */
export const __setAuthEnv = (e: Record<string, string | undefined>) => {
  env = e;
};
const origin = (v: unknown): string | null => {
  try {
    const u = new URL(String(v || '').trim().replace(/^["']|["']$/g, ''));
    return u.protocol === 'https:' || u.hostname === 'localhost' || u.hostname === '127.0.0.1' ? u.origin : null;
  } catch {
    return null;
  }
};

/** The public 4Life address (VITE_APP_URL), or null when it isn't set */
export const appOrigin = (): string | null => origin(env.VITE_APP_URL);

/** Origins a sign-in may come back to */
export function trustedOrigins(): string[] {
  const extra = String(env.VITE_AUTH_REDIRECT_ORIGINS || '')
    .split(',')
    .map(origin)
    .filter((o): o is string => !!o);
  const local = ['http://localhost:3000', 'http://localhost:5173', 'http://127.0.0.1:3000'];
  return [...new Set([appOrigin(), ...extra, ...local].filter((o): o is string => !!o))];
}

/** A section id from a link, if it is one of 4Life's own; otherwise null */
export const safeNext = (value: unknown): ActiveTab | null => (SECTIONS.includes(value as ActiveTab) ? (value as ActiveTab) : null);

/**
 * The address to give Supabase as redirectTo / emailRedirectTo: 4Life's callback page on a trusted
 * 4Life address, with the section to open afterwards when there is one.
 * `here` is the current origin (window.location.origin); exported for tests.
 */
export function authRedirectUrl(next: ActiveTab | null = intendedSection(), here: string = typeof window !== 'undefined' ? window.location.origin : ''): string {
  const base = trustedOrigins().includes(here) ? here : appOrigin() || here;
  const section = safeNext(next);
  return `${base}${CALLBACK_PATH}${section ? `?next=${section}` : ''}`;
}

/**
 * The section the person was heading for when they had to sign in: the home-screen shortcuts
 * (?go=ems, ?go=craving, ?go=sos) or ?next=<section>. Kept through the email or Google round trip.
 */
export function intendedSection(search: string = typeof window !== 'undefined' ? window.location.search : ''): ActiveTab | null {
  const q = new URLSearchParams(search);
  const go = q.get('go');
  if (go === 'ems' || go === 'sos') return 'emergency_map';
  if (go === 'craving') return 'chat';
  return safeNext(q.get('next'));
}

/** Is this page load the end of an email link or Google sign-in? And which section to open then. */
export function readCallback(loc: { pathname: string; search: string } = window.location): { isCallback: boolean; next: ActiveTab | null } {
  if (loc.pathname.replace(/\/+$/, '') !== CALLBACK_PATH) return { isCallback: false, next: null };
  return { isCallback: true, next: safeNext(new URLSearchParams(loc.search).get('next')) };
}

/** After the callback is handled: back to the plain app address, so a refresh starts normally */
export function leaveCallback() {
  if (typeof window !== 'undefined' && window.location.pathname.replace(/\/+$/, '') === CALLBACK_PATH) window.history.replaceState(null, '', '/');
}
