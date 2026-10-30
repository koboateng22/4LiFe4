/**
 * "How strong is the craving?" as five big, clearly named buttons instead of
 * eleven small numbers: one tap, easy to hit on a phone, easy to read.
 * Each level still has a number (0–10) so before/after can be compared.
 */
import React from 'react';
import { cx } from '../ui';

export const CRAVING_LEVELS = [
  { value: 1, label: 'Barely', colour: '#34d399' },
  { value: 3, label: 'Mild', colour: '#a3e635' },
  { value: 5, label: 'Medium', colour: '#fbbf24' },
  { value: 7, label: 'Strong', colour: '#fb923c' },
  { value: 9, label: 'Intense', colour: '#fb7185' },
] as const;

export const cravingLabel = (n?: number) => {
  if (n === undefined) return '';
  const l = [...CRAVING_LEVELS].reverse().find(x => n >= x.value) || CRAVING_LEVELS[0];
  return l.label.toLowerCase();
};

export const CravingLevels: React.FC<{
  value?: number;
  onChange: (v: number) => void;
  labelledBy: string;
  className?: string;
}> = ({ value, onChange, labelledBy, className }) => (
  <div role="radiogroup" aria-labelledby={labelledBy} className={cx('grid grid-cols-5 gap-1.5 sm:gap-2', className)}>
    {CRAVING_LEVELS.map(l => {
      const on = value === l.value;
      return (
        <button
          key={l.value}
          type="button"
          role="radio"
          aria-checked={on}
          onClick={() => onChange(l.value)}
          className={cx(
            'flex min-h-14 min-w-0 flex-col items-center justify-center gap-1 rounded-xl border-2 px-1 text-center transition-colors cursor-pointer',
            on ? 'border-ink bg-surface shadow-card' : 'border-line bg-bg hover:border-ink-3'
          )}
        >
          <span className="h-2.5 w-8 rounded-full" style={{ background: l.colour }} aria-hidden="true" />
          <span className={cx('w-full truncate text-[0.8125rem] sm:text-sm', on ? 'font-extrabold text-ink' : 'font-semibold text-ink-2')}>{l.label}</span>
        </button>
      );
    })}
  </div>
);
