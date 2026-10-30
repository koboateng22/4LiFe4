/**
 * Quick search (Ctrl K or ⌘ K, or "/"): one box to jump anywhere or do
 * something, in the style of Linear, Raycast and Notion.
 * It understands everyday words too ("urge", "panic", "hospital", "friends"),
 * and "Get help now" actions always come first.
 */
import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CornerDownLeft, Search, Sparkles } from 'lucide-react';
import { cx } from './ui';
import { lockPage } from '../lib/motion';

export interface PaletteItem {
  id: string;
  label: string;
  group: string;
  icon: React.ReactNode;
  /** Other words people might type */
  keywords?: string;
  /** Short note on the right */
  hint?: string;
  tone?: 'danger';
  run: () => void;
}

const isMac = () => typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
export const shortcutLabel = () => (isMac() ? '⌘ K' : 'Ctrl K');

const norm = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[’']/g, '');

/** Open the palette with Ctrl/⌘ K, or "/" when not typing. */
export function usePaletteShortcut(open: () => void, enabled = true) {
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement | null)?.closest?.('input, textarea, select, [contenteditable="true"]');
      if ((e.key === 'k' || e.key === 'K') && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        open();
      } else if (e.key === '/' && !typing && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        open();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, enabled]);
}

/** The button that opens the palette (top bar / sidebar). */
export const PaletteTrigger: React.FC<{ onClick: () => void; className?: string; compact?: boolean }> = ({ onClick, className, compact }) => (
  <button
    type="button"
    onClick={onClick}
    aria-label={`Search or jump to (${shortcutLabel()})`}
    aria-keyshortcuts="Control+K Meta+K"
    className={cx(
      'group inline-flex min-h-11 items-center gap-2.5 rounded-xl border border-line bg-surface/70 text-[0.9375rem] font-semibold text-ink-3 transition-colors hover:border-pri hover:text-ink cursor-pointer',
      compact ? 'w-11 justify-center' : 'px-3',
      className
    )}
  >
    <Search className="h-5 w-5 shrink-0" aria-hidden="true" />
    {!compact && (
      <>
        <span className="flex-1 text-left">Search</span>
        <kbd className="hidden rounded-md border border-line bg-muted px-1.5 py-0.5 font-sans text-xs font-bold text-ink-3 sm:inline">{shortcutLabel()}</kbd>
      </>
    )}
  </button>
);

interface PaletteProps {
  open: boolean;
  onClose: () => void;
  items: PaletteItem[];
  placeholder?: string;
  /** Offer to send what was typed to the AI (student app) */
  onAsk?: (text: string) => void;
  footer?: React.ReactNode;
}

/** Mounted fresh each time it opens, so it always starts empty */
export const CommandPalette: React.FC<PaletteProps> = props => (props.open ? <PalettePanel {...props} /> : null);

const PalettePanel: React.FC<PaletteProps> = ({ onClose, items, placeholder = 'Search or jump to…', onAsk, footer }) => {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const lastFocus = useRef<Element | null>(null);
  const uid = useId();

  // remember where focus was, and stop the page scrolling behind the panel
  if (lastFocus.current === null && typeof document !== 'undefined') lastFocus.current = document.activeElement;
  useEffect(() => {
    const unlock = lockPage();
    const back = lastFocus.current as HTMLElement | null;
    return () => {
      unlock();
      back?.focus?.({ preventScroll: true });
    };
  }, []);

  // Filter: every word typed must appear in the label, its keywords or its group
  const results = useMemo(() => {
    // little words like "I", "my" or "to" don't help find anything
    const STOP = new Set(['i', 'im', 'a', 'an', 'the', 'to', 'my', 'me', 'is', 'am', 'and', 'of', 'in', 'on', 'it', 'so', 'do', 'go', 'be', 'at', 'for', 'want']);
    const words = norm(query).split(/[^a-z0-9]+/).filter(w => w.length > 1 && !STOP.has(w));
    const rank = (needAll: boolean) =>
      items
        .map((it, order) => {
          const label = norm(it.label);
          const hay = `${label} ${norm(it.keywords || '')} ${norm(it.group)}`;
          const hits = words.filter(w => hay.includes(w)).length;
          if (words.length && (needAll ? hits < words.length : hits === 0)) return null;
          const score = (words.length - hits) * 3 + (words.length === 0 ? 0 : label.startsWith(words[0]) ? 0 : label.includes(words[0]) ? 1 : 2);
          return { it, score, order };
        })
        .filter((x): x is { it: PaletteItem; score: number; order: number } => !!x);
    // every word must match; if nothing does, show anything that matches some of the words
    let scored = rank(true);
    const partial = !scored.length && words.length > 0;
    if (partial) scored = rank(false);
    // keep groups together, in the order they were given; best matches first inside each group
    const groupOrder = [...new Set(items.map(i => i.group))];
    scored.sort((a, b) => groupOrder.indexOf(a.it.group) - groupOrder.indexOf(b.it.group) || a.score - b.score || a.order - b.order);
    const list = scored.map(s => s.it);
    if (onAsk && query.trim().length > 1) {
      // when nothing fits exactly, the person is probably describing how they feel: offer the AI first
      list[partial || !words.length ? 'unshift' : 'push']({
        id: '__ask',
        label: `Ask 4Life: “${query.trim()}”`,
        group: 'Talk it through',
        icon: <Sparkles className="h-5 w-5" />,
        run: () => onAsk(query.trim()),
      });
    }
    return list;
  }, [items, query, onAsk]);

  useEffect(() => setActive(0), [query]);
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const choose = (it: PaletteItem | undefined) => {
    if (!it) return;
    onClose();
    // run after the palette has closed so focus and scrolling go to the new place
    setTimeout(it.run, 0);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive(a => Math.min(results.length - 1, a + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive(a => Math.max(0, a - 1));
    } else if (e.key === 'Home') {
      setActive(0);
    } else if (e.key === 'End') {
      setActive(results.length - 1);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      choose(results[active]);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    } else if (e.key === 'Tab') {
      e.preventDefault(); // keep focus in the box
    }
  };

  let lastGroup = '';
  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-start justify-center px-3 pt-[10vh] sm:pt-[14vh]" onKeyDown={onKeyDown}>
      <div className="palette-backdrop absolute inset-0 bg-[rgba(2,20,14,0.45)] backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Search or jump to"
        className="palette-panel relative flex max-h-[min(560px,78vh)] w-full max-w-[620px] flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-pop"
      >
        <div className="flex items-center gap-3 border-b border-line px-4">
          <Search className="h-5 w-5 shrink-0 text-ink-3" aria-hidden="true" />
          <input
            ref={inputRef}
            autoFocus
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder={placeholder}
            role="combobox"
            aria-expanded="true"
            aria-controls={`${uid}-list`}
            aria-activedescendant={results[active] ? `${uid}-${active}` : undefined}
            aria-autocomplete="list"
            className="min-h-14 flex-1 bg-transparent text-[1.0625rem] text-ink outline-none placeholder:text-ink-3"
            style={{ outline: 'none' }}
          />
          <kbd className="rounded-md border border-line bg-muted px-1.5 py-0.5 font-sans text-xs font-bold text-ink-3">Esc</kbd>
        </div>

        <div ref={listRef} id={`${uid}-list`} role="listbox" aria-label="Results" className="flex-1 overflow-y-auto overscroll-contain p-2">
          {results.length === 0 && (
            <p className="m-0 px-3 py-6 text-center text-base text-ink-3">Nothing matches “{query}”. Try a simpler word.</p>
          )}
          {results.map((it, i) => {
            const header = it.group !== lastGroup ? it.group : null;
            lastGroup = it.group;
            const on = i === active;
            return (
              <React.Fragment key={it.id}>
                {header && <p className="m-0 px-3 pb-1.5 pt-3 text-xs font-bold text-ink-3 first:pt-1">{header}</p>}
                <div
                  id={`${uid}-${i}`}
                  data-index={i}
                  role="option"
                  aria-selected={on}
                  onMouseMove={() => active !== i && setActive(i)}
                  onClick={() => choose(it)}
                  className={cx(
                    'flex min-h-12 items-center gap-3 rounded-xl px-3 cursor-pointer',
                    on ? (it.tone === 'danger' ? 'bg-danger-soft' : 'bg-pri-soft') : ''
                  )}
                >
                  <span
                    className={cx(
                      'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
                      it.tone === 'danger' ? 'bg-danger text-[#fff]' : on ? 'bg-pri text-[#fff]' : 'bg-muted text-ink-2'
                    )}
                    aria-hidden="true"
                  >
                    {it.icon}
                  </span>
                  <span className={cx('min-w-0 flex-1 truncate text-[0.9375rem] font-semibold', it.tone === 'danger' ? 'text-danger-text' : on ? 'text-pri-ink' : 'text-ink')}>
                    {it.label}
                  </span>
                  {it.hint && <span className="hidden shrink-0 text-sm text-ink-3 sm:inline">{it.hint}</span>}
                  {on && <CornerDownLeft className="h-4 w-4 shrink-0 text-ink-3" aria-hidden="true" />}
                </div>
              </React.Fragment>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line bg-muted/60 px-4 py-2.5 text-xs text-ink-3">
          <span className="hidden sm:inline">
            <kbd className="font-sans font-bold">↑</kbd> <kbd className="font-sans font-bold">↓</kbd> to move · <kbd className="font-sans font-bold">Enter</kbd> to open ·{' '}
            <kbd className="font-sans font-bold">Esc</kbd> to close
          </span>
          {footer}
        </div>
      </div>
    </div>,
    document.body
  );
};
