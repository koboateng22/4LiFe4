/**
 * Five friendly faces for picking a mood (struggling → great), from rose
 * through amber to emerald. Bigger targets and clearer than text chips.
 */
import React from 'react';
import { cx } from './ui';

export const MOOD_FACES = [
  { id: 'struggling', label: 'Struggling', bg: '#fb7185', mouth: 'M20 45 q12 -12 24 0' },
  { id: 'low', label: 'Low', bg: '#f59e0b', mouth: 'M21 44 q11 -6 22 0' },
  { id: 'okay', label: 'Okay', bg: '#fcd34d', mouth: 'M22 42 h20' },
  { id: 'good', label: 'Good', bg: '#6ee7b7', mouth: 'M21 39 q11 8 22 0' },
  { id: 'great', label: 'Great', bg: '#34d399', mouth: 'M19 37 q13 14 26 0' },
] as const;

export const MoodFaces: React.FC<{ value: string; onChange: (id: string) => void; labelledBy?: string }> = ({ value, onChange, labelledBy }) => (
  <div className="grid grid-cols-5 gap-2 sm:flex sm:gap-4" role="radiogroup" aria-labelledby={labelledBy}>
    {MOOD_FACES.map(m => {
      const on = value === m.id;
      return (
        <button
          key={m.id}
          type="button"
          role="radio"
          aria-checked={on}
          onClick={() => onChange(m.id)}
          className="group flex min-w-0 flex-col items-center gap-1.5 rounded-2xl p-1 cursor-pointer"
        >
          <span
            className={cx(
              'block h-12 w-12 rounded-full transition-all duration-300 sm:h-16 sm:w-16',
              on ? 'scale-110 shadow-lg ring-4 ring-pri/30' : value ? 'scale-95 opacity-70 group-hover:opacity-100' : 'group-hover:-translate-y-1'
            )}
            style={{ background: m.bg }}
          >
            <svg viewBox="0 0 64 64" className="h-full w-full" aria-hidden="true">
              <circle cx="23" cy="27" r="4" fill="#022c22" />
              <circle cx="41" cy="27" r="4" fill="#022c22" />
              <path d={m.mouth} stroke="#022c22" strokeWidth="4" fill="none" strokeLinecap="round" />
            </svg>
          </span>
          <span className={cx('truncate text-xs font-bold sm:text-sm', on ? 'text-ink' : 'text-ink-3')}>{m.label}</span>
        </button>
      );
    })}
  </div>
);
