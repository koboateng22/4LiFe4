/**
 * Sign-in illustration: a young person meditating, with five calm icons floating around.
 * Flat, minimal style drawn in code (no image file), so it is crisp at any size
 * and follows the light and dark theme.
 *
 * Interactive:
 *  - the icon for the open side tab glows; tap or hover an icon to open its tab,
 *  - the person breathes slowly, the icons float, the clock's hands turn,
 *  - with a mouse, the icons drift a little with the pointer.
 */
import React, { useRef, useState } from 'react';
import { cx } from '../ui';

import { t } from '../../i18n';
export type CalmIcon = 'chat' | 'people' | 'phone' | 'clock' | 'heart';

const SKIN = '#9A5B34';
const SKIN_SHADE = '#7E4628';
const HAIR = '#1F1A24';
const TOP = '#10B981';
const PANTS = '#344185';
const PANTS_DARK = '#283369';

interface CalmIllustrationProps {
  /** Icon that matches the open side tab */
  active?: CalmIcon;
  /** Called when someone taps an icon that has a tab */
  onPick?: (icon: CalmIcon) => void;
  /** Accessible names for icons that open a tab */
  labels?: Partial<Record<CalmIcon, string>>;
  className?: string;
}

const ICONS: Array<{ id: CalmIcon; x: number; y: number; delay: number }> = [
  { id: 'heart', x: 240, y: 38, delay: 0 },
  { id: 'chat', x: 100, y: 122, delay: 0.8 },
  { id: 'people', x: 382, y: 122, delay: 1.6 },
  { id: 'clock', x: 78, y: 252, delay: 2.4 },
  { id: 'phone', x: 404, y: 252, delay: 3.2 },
];

/** Each icon is drawn around (0, 0), about 64 px across */
const Glyph: React.FC<{ id: CalmIcon }> = ({ id }) => {
  switch (id) {
    case 'heart':
      return (
        <g>
          <path d="M0 26 C-30 6 -34 -10 -26 -20 C-18 -30 -4 -28 0 -16 C4 -28 18 -30 26 -20 C34 -10 30 6 0 26Z" fill="#E11D48" />
          <path d="M-22 -2 H-11 L-6 -12 L1 8 L7 -6 L11 -2 H22" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        </g>
      );
    case 'chat':
      return (
        <g>
          <path d="M-28 -20 Q-28 -28 -20 -28 H20 Q28 -28 28 -20 V8 Q28 16 20 16 H-6 L-18 27 V16 H-20 Q-28 16 -28 8Z" fill="#047857" />
          <circle cx="-11" cy="-6" r="3.6" fill="#ECFDF5" />
          <circle cx="0" cy="-6" r="3.6" fill="#ECFDF5" />
          <circle cx="11" cy="-6" r="3.6" fill="#ECFDF5" />
        </g>
      );
    case 'people':
      return (
        <g>
          <circle cx="-11" cy="-14" r="9" fill="#F59E0B" />
          <path d="M-27 22 Q-27 -2 -11 -2 Q5 -2 5 22Z" fill="#F59E0B" />
          <circle cx="12" cy="-10" r="8" fill="#FBBF24" />
          <path d="M-2 24 Q-2 4 12 4 Q26 4 26 24Z" fill="#FBBF24" />
        </g>
      );
    case 'clock':
      return (
        <g>
          <rect x="-5" y="-34" width="10" height="8" rx="2" fill="var(--ink)" />
          <circle r="27" fill="var(--surface)" stroke="var(--ink)" strokeWidth="5" />
          {/* Hands point to 2 o'clock and turn slowly */}
          <g className="calm-spin-slow">
            <line x1="0" y1="0" x2="0" y2="-18" stroke="var(--ink)" strokeWidth="3" strokeLinecap="round" />
          </g>
          <line x1="0" y1="0" x2="10" y2="-6" stroke="var(--ink)" strokeWidth="3.5" strokeLinecap="round" />
          <circle r="3" fill="#E11D48" />
        </g>
      );
    case 'phone':
      return (
        <g>
          <rect x="-17" y="-28" width="34" height="56" rx="7" fill="var(--ink)" />
          <rect x="-13" y="-22" width="26" height="40" rx="3" fill="var(--surface)" />
          <circle cy="-2" r="9" fill="#E11D48" />
          <path d="M-3.5 -2 h7 M0 -5.5 v7" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" />
          <circle cy="23" r="2" fill="var(--surface)" />
        </g>
      );
  }
};

/** The meditating person, drawn around x = 240 on a 480-wide canvas (feet near y = 320) */
export const MeditatingPerson: React.FC = () => (
  <>
    {/* ---- The person ---- */}
    <g className="calm-breathe">
      {/* Hair at the back (puffs) */}
      <circle cx="240" cy="118" r="30" fill={HAIR} />
      <circle cx="240" cy="90" r="11" fill={HAIR} />
      {/* Arms, resting on the knees */}
      <path d="M212 178 C194 204 186 238 168 262" fill="none" stroke={SKIN} strokeWidth="17" strokeLinecap="round" />
      <path d="M268 178 C286 204 294 238 312 262" fill="none" stroke={SKIN} strokeWidth="17" strokeLinecap="round" />
      {/* Neck and head */}
      <rect x="232" y="140" width="16" height="22" rx="6" fill={SKIN_SHADE} />
      <circle cx="240" cy="128" r="22" fill={SKIN} />
      <path d="M218 122 C220 102 260 100 262 122 C254 112 228 112 218 122Z" fill={HAIR} />
      {/* Closed eyes and a small smile */}
      <path d="M229 130 q4 3 8 0 M243 130 q4 3 8 0" fill="none" stroke={HAIR} strokeWidth="2" strokeLinecap="round" />
      <path d="M235 140 q5 4 10 0" fill="none" stroke={SKIN_SHADE} strokeWidth="2" strokeLinecap="round" />
      {/* Top */}
      <path d="M208 170 Q240 156 272 170 L280 252 Q240 262 200 252Z" fill={TOP} />
      <path d="M226 160 Q240 172 254 160" fill="none" stroke="#059669" strokeWidth="3" />
    </g>
    {/* Crossed legs */}
    <path d="M146 294 C146 264 196 254 240 264 C284 254 334 264 334 294 C334 318 292 324 240 314 C188 324 146 318 146 294Z" fill={PANTS} />
    <path d="M204 252 Q240 246 276 252 L282 282 Q240 296 198 282Z" fill={PANTS_DARK} />
    <path d="M190 312 C214 300 232 300 250 310" fill="none" stroke={SKIN} strokeWidth="14" strokeLinecap="round" />
    <path d="M290 312 C266 300 248 300 230 310" fill="none" stroke={SKIN_SHADE} strokeWidth="14" strokeLinecap="round" />
    {/* Hands in a resting mudra */}
    <circle cx="164" cy="266" r="10" fill={SKIN} />
    <circle cx="164" cy="262" r="4" fill="none" stroke={SKIN_SHADE} strokeWidth="2" />
    <circle cx="316" cy="266" r="10" fill={SKIN} />
    <circle cx="316" cy="262" r="4" fill="none" stroke={SKIN_SHADE} strokeWidth="2" />
  </>
);

export const CalmIllustration: React.FC<CalmIllustrationProps> = ({ active, onPick, labels = {}, className }) => {
  const [hover, setHover] = useState<CalmIcon | null>(null);
  const icons = useRef<SVGGElement>(null);

  const drift = (e: React.PointerEvent<SVGSVGElement>) => {
    if (e.pointerType !== 'mouse' || !icons.current) return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const r = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5;
    const y = (e.clientY - r.top) / r.height - 0.5;
    icons.current.style.transform = `translate(${(x * 10).toFixed(1)}px, ${(y * 8).toFixed(1)}px)`;
  };

  return (
    <svg
      viewBox="0 -8 480 350"
      className={cx('block h-auto w-full overflow-visible', className)}
      role="img"
      aria-label={t("A young person meditating calmly, surrounded by icons for chat, community, emergency help, time and health")}
      onPointerMove={drift}
      onPointerLeave={() => icons.current && (icons.current.style.transform = '')}
    >
      {/* Soft backdrop */}
      <path d="M150 178 C140 110 196 74 246 80 C306 86 344 124 336 186 C330 238 350 270 300 286 C246 304 190 296 162 262 C146 242 156 214 150 178Z" fill="var(--muted)" />
      <ellipse cx="240" cy="328" rx="128" ry="9" fill="var(--line)" opacity="0.7" />

      <MeditatingPerson />

      {/* ---- Floating icons ---- */}
      <g ref={icons} style={{ transition: 'transform 0.6s ease-out' }}>
        {ICONS.map(ic => {
          const on = active === ic.id || hover === ic.id;
          const label = labels[ic.id];
          const pick = label && onPick ? () => onPick(ic.id) : undefined;
          return (
            <g key={ic.id} transform={`translate(${ic.x} ${ic.y})`}>
              <g className="calm-float" style={{ animationDelay: `${ic.delay}s` }}>
                <g
                  role={pick ? 'button' : undefined}
                  tabIndex={pick ? 0 : undefined}
                  aria-label={t(label)}
                  aria-pressed={pick ? active === ic.id : undefined}
                  onClick={pick}
                  onKeyDown={e => {
                    if (pick && (e.key === 'Enter' || e.key === ' ')) {
                      e.preventDefault();
                      pick();
                    }
                  }}
                  onPointerEnter={() => setHover(ic.id)}
                  onPointerLeave={() => setHover(null)}
                  className={cx('calm-icon outline-none', pick && 'cursor-pointer')}
                  style={{ transform: on ? 'scale(1.16)' : 'scale(1)', opacity: active && !on ? 0.72 : 1 }}
                >
                  {/* Glow ring for the open tab */}
                  <circle r="50" fill="var(--pri)" opacity={active === ic.id ? 0.14 : 0} className="transition-opacity duration-500" />
                  <circle r="50" fill="none" stroke="var(--pri)" strokeWidth="2" strokeDasharray="4 7" opacity={active === ic.id ? 0.6 : 0} className="calm-spin transition-opacity duration-500" />
                  <circle r="44" fill="transparent" />
                  <g transform="scale(1.25)">
                    <Glyph id={ic.id} />
                  </g>
                </g>
              </g>
            </g>
          );
        })}
      </g>
    </svg>
  );
};
