/**
 * Light, dark, or the same as the device ("system").
 *
 * The choice is saved on this device (so the sign-in screen and guests get it too) and,
 * for people with an account, in their profile, so it follows them to other devices.
 * index.html applies the saved choice before the app loads, so there is no flash.
 */
import { useEffect, useState } from 'react';

export type ThemePref = 'light' | 'dark' | 'system';
export const THEME_KEY = '4life_user_theme';

export const asThemePref = (v: unknown): ThemePref => (v === 'light' || v === 'dark' || v === 'system' ? v : 'system');

/** The choice saved on this device; "system" when there is none. */
export function savedThemePref(): ThemePref {
  try {
    return asThemePref(localStorage.getItem(THEME_KEY));
  } catch {
    return 'system';
  }
}

const darkQuery = () => (typeof window !== 'undefined' ? window.matchMedia?.('(prefers-color-scheme: dark)') : undefined);

/** The theme actually shown for a choice. */
export const resolveTheme = (pref: ThemePref | undefined, deviceDark = !!darkQuery()?.matches): 'light' | 'dark' =>
  pref === 'dark' || (pref !== 'light' && deviceDark) ? 'dark' : 'light';

/** The theme shown now. With "system" it changes when the device switches between light and dark. */
export function useResolvedTheme(pref: ThemePref | undefined): 'light' | 'dark' {
  const [deviceDark, setDeviceDark] = useState(() => !!darkQuery()?.matches);
  useEffect(() => {
    const q = darkQuery();
    if (!q) return;
    const on = () => setDeviceDark(q.matches);
    q.addEventListener?.('change', on);
    return () => q.removeEventListener?.('change', on);
  }, []);
  return resolveTheme(pref, deviceDark);
}

/** Puts the theme on the page and remembers the choice on this device. */
export function applyTheme(pref: ThemePref, shown: 'light' | 'dark') {
  const root = document.documentElement;
  root.classList.toggle('dark', shown === 'dark');
  root.classList.toggle('light', shown !== 'dark');
  root.style.colorScheme = shown;
  try {
    localStorage.setItem(THEME_KEY, pref);
  } catch {}
}

/** Changes the theme with a short cross-fade where the browser supports it. */
export function withThemeTransition(change: () => void) {
  const doc = document as Document & { startViewTransition?: (cb: () => void) => unknown };
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  if (doc.startViewTransition && !reduce) doc.startViewTransition(change);
  else change();
}
