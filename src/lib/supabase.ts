/**
 * Supabase connection.
 *
 * Set these in .env.local (see .env.example):
 *   VITE_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
 *   VITE_SUPABASE_ANON_KEY=your public anon / publishable key
 *
 * Without them the app runs in "device mode": everything is stored in this
 * browser only, exactly as the prototype did. Never put the service-role key here.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const env = (import.meta as any).env || {};
// Trimmed, because a stray space or quote pasted into a hosting dashboard is easy to miss
const clean = (v: unknown) => String(v ?? '').trim().replace(/^["']|["']$/g, '').replace(/\/+$/, '') || undefined;
const url = clean(env.VITE_SUPABASE_URL);
const key = clean(env.VITE_SUPABASE_ANON_KEY || env.VITE_SUPABASE_PUBLISHABLE_KEY);

/** The project address and public key, for calling the Edge Functions directly */
export const supabaseUrl = url;
export const supabaseKey = key;

export let supabase: SupabaseClient | null =
  url && key
    ? createClient(url, key, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
        realtime: { params: { eventsPerSecond: 5 } },
      })
    : null;

/** True when the app is connected to Supabase. */
export const isRemote = !!supabase;

/** Checked at call time (tests can switch in a client after start-up). */
export const hasRemote = () => !!supabase;

/** The connected client. Only call this when `isRemote` is true. */
export const db = (): SupabaseClient => {
  if (!supabase) throw new Error('Supabase is not configured');
  return supabase;
};

/** For automated tests only: point the data layer at a test database. */
export const __useTestClient = (client: SupabaseClient) => {
  supabase = client;
};

/** A new id that works for both Supabase (uuid columns) and device mode. */
export const newId = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const r = (Math.random() * 16) | 0;
        return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
      });

/** Turn database and auth errors into short, plain messages people can act on. */
export function friendlyError(e: unknown): string {
  const msg = String((e as any)?.message || e || '');
  if (/Invalid login credentials/i.test(msg)) return 'That email and password do not match. Check them and try again.';
  if (/Email not confirmed/i.test(msg)) return 'Please confirm your email first — we sent you a link.';
  if (/User already registered/i.test(msg)) return 'An account with this email already exists. Please sign in instead.';
  if (/profiles_nickname_key|duplicate key.*nickname/i.test(msg)) return 'That community name is already taken. Please choose another.';
  if (/Password should be/i.test(msg)) return 'Please choose a longer password (at least 8 characters).';
  if (/rate limit/i.test(msg)) return 'Too many tries. Please wait a minute and try again.';
  if (/Failed to fetch|NetworkError|network/i.test(msg)) return 'Could not reach the server. Check your internet connection.';
  if (/licen[cs]e/i.test(msg)) return 'Please add your licensing body and licence number.';
  if (/agreements/i.test(msg)) return 'Please tick all three professional agreements.';
  return msg || 'Something went wrong. Please try again.';
}
