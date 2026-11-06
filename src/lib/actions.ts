/**
 * Small "do this when you open" requests between parts of the app.
 * The command palette (Ctrl/⌘ K) uses it to say, for example,
 * "open AI therapy and start a thought record": it switches the page,
 * then the page picks up the request as soon as it appears.
 */
import { useEffect, useRef } from 'react';

export type AppAction =
  | 'thought-record' // AI CBT therapy: open the thought record
  | 'craving' // AI CBT therapy: "Ride out a craving", cursor in the message box
  | 'new-post' // Global Village: open "New post"
  | 'circles' // Global Village: show group circles
  | 'checkin' // Home: scroll to today's check-in
  | 'ask' // AI CBT therapy: put the person's words in the message box (they press Send)
  | 'safety-plan' // Instant EMS: show my safety plan
  | 'first-aid' // Instant EMS: show first aid
  | 'appearance'; // Settings: show Appearance (theme, text size)

const EVENT = '4life:action';
let pending: { action: AppAction; text?: string } | null = null;

/** Ask for an action. If the page is already open it runs now; otherwise when the page opens. */
export function requestAction(action: AppAction, text?: string) {
  pending = { action, text };
  window.dispatchEvent(new CustomEvent(EVENT, { detail: pending }));
}

/** Run `handler` when `action` is requested (now, or before this page opened). */
export function useAction(action: AppAction, handler: (text?: string) => void) {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    const run = (text?: string) => {
      pending = null;
      // let the page finish drawing first
      requestAnimationFrame(() => ref.current(text));
    };
    if (pending?.action === action) run(pending.text);
    const onEvent = (e: Event) => {
      const d = (e as CustomEvent).detail as { action: AppAction; text?: string };
      if (d?.action === action) run(d.text);
    };
    window.addEventListener(EVENT, onEvent);
    return () => window.removeEventListener(EVENT, onEvent);
  }, [action]);
}
