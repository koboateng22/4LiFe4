/**
 * A "Translate" button that opens a small menu of languages.
 * Ghanaian languages come first; picking one translates the whole app
 * (through the Google Translate helper in utils/translateUtils).
 */
import React, { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, Languages } from 'lucide-react';
import { WORLD_LANGUAGES } from '../data/religionsData';
import { cx } from './ui';

const GHANA = ['en', 'ak', 'fat', 'gaa', 'ee', 'ha', 'dag'];

interface LanguageMenuProps {
  value: string;
  onChange: (code: string) => void;
  /** 'surface' sits on the page; 'glass' sits on a photo or dark panel */
  tone?: 'surface' | 'glass';
  /** Show the language name next to the icon (otherwise only the short code) */
  showName?: boolean;
  className?: string;
}

export const LanguageMenu: React.FC<LanguageMenuProps> = ({ value, onChange, tone = 'surface', showName = true, className }) => {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const current = WORLD_LANGUAGES.find(l => l.code === value) || WORLD_LANGUAGES[0];
  const ghana = WORLD_LANGUAGES.filter(l => GHANA.includes(l.code));
  const others = WORLD_LANGUAGES.filter(l => !GHANA.includes(l.code));

  // Close on outside click or Escape
  useEffect(() => {
    if (!open) return;
    const down = (e: PointerEvent) => wrap.current && !wrap.current.contains(e.target as Node) && setOpen(false);
    const key = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('pointerdown', down);
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('pointerdown', down);
      document.removeEventListener('keydown', key);
    };
  }, [open]);

  const item = (l: (typeof WORLD_LANGUAGES)[number]) => {
    const on = l.code === current.code;
    return (
      <button
        key={l.code}
        type="button"
        role="menuitemradio"
        aria-checked={on}
        onClick={() => {
          onChange(l.code);
          setOpen(false);
        }}
        className={cx(
          'flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-left cursor-pointer',
          on ? 'bg-pri-soft text-pri-ink' : 'text-ink hover:bg-muted'
        )}
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[0.9375rem] font-bold" translate="no">{l.nativeName}</span>
          <span className="block truncate text-xs text-ink-3" translate="no">{l.name}</span>
        </span>
        {on && <Check className="h-4 w-4 shrink-0" aria-hidden="true" />}
      </button>
    );
  };

  return (
    <div ref={wrap} className={cx('relative', className)}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Translate. Current language: ${current.name}`}
        title="Translate"
        className={cx(
          'flex h-10 min-w-10 items-center justify-center gap-1.5 rounded-xl px-2.5 text-sm font-bold transition-colors cursor-pointer',
          tone === 'glass'
            ? 'border border-[rgba(255,255,255,0.28)] bg-[rgba(2,44,34,0.35)] text-[#fff] backdrop-blur-md hover:bg-[rgba(2,44,34,0.55)]'
            : 'border border-line bg-bg text-ink-2 hover:bg-muted'
        )}
      >
        <Languages className={cx('h-[18px] w-[18px]', tone === 'glass' ? 'text-[#a7f3d0]' : 'text-pri-text')} aria-hidden="true" />
        {showName ? (
          <>
            <span className="hidden max-w-[6.5rem] truncate sm:inline" translate="no">{current.code === 'en' ? 'Translate' : current.name}</span>
            <span className="uppercase sm:hidden" translate="no">{current.code.slice(0, 3)}</span>
          </>
        ) : (
          <span className="uppercase" translate="no">{current.code === 'fat' ? 'FAT' : current.code.slice(0, 3)}</span>
        )}
        <ChevronDown className="hidden h-3.5 w-3.5 opacity-70 sm:block" aria-hidden="true" />
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Choose a language"
          className="absolute right-0 top-[calc(100%+8px)] z-50 max-h-[min(26rem,70vh)] w-64 overflow-y-auto overscroll-contain rounded-2xl border border-line bg-surface p-2 text-ink shadow-xl animate-fadeIn"
        >
          <p className="m-0 px-3 pb-1 pt-1.5 text-xs font-bold uppercase tracking-wider text-ink-3">Ghana</p>
          {ghana.map(item)}
          <div className="my-1.5 h-px bg-line" />
          <p className="m-0 px-3 pb-1 pt-1 text-xs font-bold uppercase tracking-wider text-ink-3">More languages</p>
          {others.map(item)}
          <p className="m-0 px-3 pb-1 pt-2 text-xs leading-snug text-ink-3">Translated automatically. Some words may not be perfect.</p>
        </div>
      )}
    </div>
  );
};
