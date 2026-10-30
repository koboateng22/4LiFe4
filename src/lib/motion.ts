/**
 * "Moving background" preference (Settings → Language and display).
 * Saved on this device. The device's own "reduce motion" setting always wins.
 */
import { useEffect, useState } from 'react';

const KEY = '4life_moving_background';
const EVENT = '4life:motion-pref';

export function getMovingBackground(): boolean {
  try {
    return localStorage.getItem(KEY) !== 'off';
  } catch {
    return true;
  }
}

export function setMovingBackground(on: boolean) {
  try {
    localStorage.setItem(KEY, on ? 'on' : 'off');
  } catch {}
  window.dispatchEvent(new CustomEvent(EVENT));
}

export function useMovingBackground(): [boolean, (on: boolean) => void] {
  const [on, setOn] = useState(getMovingBackground);
  useEffect(() => {
    const sync = () => setOn(getMovingBackground());
    window.addEventListener(EVENT, sync);
    return () => window.removeEventListener(EVENT, sync);
  }, []);
  return [on, setMovingBackground];
}

/** True once the page has been scrolled a little (used to frost the top bar) */
export function useScrolled(threshold = 6) {
  const [scrolled, setScrolled] = useState(() => typeof window !== 'undefined' && window.scrollY > threshold);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > threshold);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [threshold]);
  return scrolled;
}

/**
 * Stop the page scrolling behind a dialog, and tell the moving background
 * to rest while something covers it (saves battery; the blur behind
 * dialogs is also cheaper when nothing moves under it).
 * Returns a function that undoes it. Safe to nest.
 */
let overlays = 0;
let savedOverflow = '';
export function lockPage(): () => void {
  const root = document.documentElement;
  if (overlays === 0) savedOverflow = root.style.overflow;
  overlays++;
  root.style.overflow = 'hidden';
  root.dataset.overlay = 'open';
  let done = false;
  return () => {
    if (done) return;
    done = true;
    overlays = Math.max(0, overlays - 1);
    if (overlays === 0) {
      root.style.overflow = savedOverflow;
      delete root.dataset.overlay;
    }
  };
}

const prefersReduced = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/**
 * Counts up from 0 to `target` with a gentle ease-out (for numbers like days clean).
 * With "reduce motion" it shows the number straight away.
 */
export function useCountUp(target: number, ms = 900): number {
  const [value, setValue] = useState(() => (prefersReduced() ? target : 0));
  useEffect(() => {
    if (prefersReduced() || target <= 0) {
      setValue(target);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / ms);
      setValue(Math.round(target * (1 - Math.pow(1 - t, 3))));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return value;
}

/** True one frame after mount: lets bars and rings animate in from empty */
export function useMounted(): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const raf = requestAnimationFrame(() => setOn(true));
    return () => cancelAnimationFrame(raf);
  }, []);
  return on;
}

/** A tiny tap you can feel on phones that support it (Android). Silent elsewhere. */
export function haptic(ms = 8) {
  try {
    if (!prefersReduced()) navigator.vibrate?.(ms);
  } catch {}
}
