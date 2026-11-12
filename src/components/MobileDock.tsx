/**
 * The navigation on phones and tablets: a row of floating glass buttons at the bottom of the screen,
 * the same look as the side rail on a computer. Each button shows its short name (there is no hover on
 * a touch screen) and has its full name for screen readers. Styles: .dock / .dock-btn in index.css.
 *
 * While the person is typing (the on-screen keyboard is up), the dock moves out of the way so it never
 * covers what they are writing; it comes back when they leave the field.
 */
import React, { useEffect, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import { haptic } from '../lib/motion';

export interface DockItem {
  id: string;
  /** Full name: read by screen readers, and shown as a tooltip */
  label: string;
  /** Short name shown under the icon */
  short: string;
  icon: LucideIcon;
  active: boolean;
  onSelect: () => void;
  /** A small count on the button (for example new requests) */
  badge?: number;
  /** Extra attributes (for example aria-controls on a "More" button) */
  extra?: React.ButtonHTMLAttributes<HTMLButtonElement>;
}

const TYPING = 'input:not([type=checkbox]):not([type=radio]):not([type=button]):not([type=submit]):not([type=range]):not([type=color]):not([type=file]), textarea, select, [contenteditable="true"]';

/** True while a text field has the keyboard, on a phone or tablet */
function useTyping() {
  const [typing, setTyping] = useState(false);
  useEffect(() => {
    const narrow = () => window.matchMedia('(max-width: 1023.98px)').matches;
    const onIn = (e: FocusEvent) => setTyping(narrow() && !!(e.target as Element | null)?.matches?.(TYPING));
    const onOut = () =>
      // the next field may take focus straight away: check once it has
      requestAnimationFrame(() => setTyping(narrow() && !!document.activeElement?.matches?.(TYPING)));
    document.addEventListener('focusin', onIn);
    document.addEventListener('focusout', onOut);
    return () => {
      document.removeEventListener('focusin', onIn);
      document.removeEventListener('focusout', onOut);
    };
  }, []);
  return typing;
}

export const MobileDock: React.FC<{ label: string; items: DockItem[]; id?: string }> = ({ label, items, id }) => {
  const typing = useTyping();
  return (
    <nav id={id} aria-label={label} className="dock" data-away={typing ? '' : undefined} inert={typing || undefined}>
      <div className="dock-row">
        {items.map(it => {
          const Icon = it.icon;
          return (
            <button
              key={it.id}
              type="button"
              title={it.label}
              aria-label={it.badge ? `${it.label} (${it.badge})` : it.label}
              aria-current={it.active ? 'page' : undefined}
              onClick={() => {
                haptic();
                it.onSelect();
              }}
              className="dock-btn"
              {...it.extra}
            >
              <Icon aria-hidden="true" className={it.active ? 'nav-pop' : undefined} key={it.active ? 'on' : 'off'} />
              <span className="dock-label" aria-hidden="true">
                {it.short}
              </span>
              {!!it.badge && (
                <span className="dock-badge" aria-hidden="true">
                  {it.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
};
