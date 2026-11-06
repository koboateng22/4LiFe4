/**
 * The green ribbon: the international symbol of mental health awareness.
 * 4Life uses it as its design element: in page banners, the opening
 * screen, loading states and footers, and as the 3D background.
 * An original drawing in the Universal Color System.
 */
import React from 'react';
import { cx } from './ui';
import { t as tr } from '../i18n';

type Tone = 'brand' | 'onDark' | 'soft';

const TONES: Record<Tone, { back: string; front: string; backOpacity?: number }> = {
  brand: { back: '#047857', front: '#10b981' }, // on light surfaces
  onDark: { back: '#6ee7b7', front: '#a7f3d0', backOpacity: 0.55 }, // on the forest-green banners
  soft: { back: '#a7f3d0', front: '#d1fae5' }, // quiet decoration
};

export const RibbonMark: React.FC<{
  className?: string;
  tone?: Tone;
  /** Gently grow and shrink: in for 4 seconds, out for 6 */
  breathe?: boolean;
  /** Read out by screen readers; leave empty for decoration */
  label?: string;
}> = ({ className, tone = 'brand', breathe = false, label }) => {
  const t = TONES[tone];
  return (
    <svg
      viewBox="0 0 60 100"
      className={cx('shrink-0', breathe && 'ribbon-breathe', className)}
      role={label ? 'img' : undefined}
      aria-label={tr(label)}
      aria-hidden={label ? undefined : true}
      focusable="false"
    >
      {/* the strand that goes behind: left tail, up and over the loop */}
      <path d="M15 94 L30 58 C36 44 44 32 42 20 C40 8 20 8 18 20" fill="none" stroke={t.back} strokeOpacity={t.backOpacity ?? 1} strokeWidth="11" strokeLinejoin="round" />
      {/* the strand in front: down from the loop to the right tail */}
      <path d="M18 20 C16 32 24 44 30 58 L45 94" fill="none" stroke={t.front} strokeWidth="11" />
    </svg>
  );
};

/** A calm loading indicator: the ribbon breathing, with a short message. */
export const RibbonLoader: React.FC<{ text: string; className?: string }> = ({ text, className }) => (
  <p role="status" className={cx('m-0 flex items-center gap-3 text-base text-ink-3', className)}>
    <RibbonMark breathe className="h-8 w-5" />
    {text}
  </p>
);
