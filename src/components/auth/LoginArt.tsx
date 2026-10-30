/**
 * The sign-in artwork: a slideshow of flat, text-free illustrations drawn in code.
 * No words on purpose: the explanations live in the welcome tour after sign-up.
 *
 * Scenes: meditating calmly · friends holding up wellbeing icons · a joyful,
 * healthy day around a big heart · a care team.
 *
 * Interactive: it moves on by itself every few seconds (pausing only while you press and hold,
 * or while the browser tab is hidden), you can
 * swipe, tap the picture for the next one, or tap a dot. Icons float and react
 * to the pointer. With reduced motion it still moves on, a little slower and without the slide.
 */
import React, { useEffect, useRef, useState } from 'react';
import { cx } from '../ui';
import { CalmIllustration, MeditatingPerson } from './CalmIllustration';

/* ------------------------------------------------------------------ */
/* A simple standing person (feet at 0,0; about 230 units tall)        */
/* ------------------------------------------------------------------ */
type Hair = 'short' | 'long' | 'puff' | 'bun' | 'curly';
type Pt = [number, number];

interface PersonProps {
  x: number;
  y: number;
  s?: number;
  skin: string;
  hair: Hair;
  hairColor?: string;
  top: string;
  bottom: string;
  dress?: boolean;
  /** Left and right hand positions (local units) */
  l: Pt;
  r: Pt;
  legs?: 'stand' | 'jump';
  /** Drawn between the body and the arms, so hands hold it */
  holding?: React.ReactNode;
  /** Extra details drawn on the body (a stethoscope, an inner shirt) */
  extra?: React.ReactNode;
  className?: string;
}

const SHOE = '#1F2433';

const arm = (sh: Pt, h: Pt): string => {
  const out = sh[0] < 0 ? -1 : 1;
  const ex = (sh[0] + h[0]) / 2 + out * 10;
  const ey = (sh[1] + h[1]) / 2 + 6;
  return `M${sh[0]} ${sh[1]} Q${ex} ${ey} ${h[0]} ${h[1]}`;
};

const Person: React.FC<PersonProps> = ({ x, y, s = 1, skin, hair, hairColor = '#1F1A24', top, bottom, dress, l, r, legs = 'stand', holding, extra, className }) => {
  const hip = dress ? -84 : -96;
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`} className={className}>
      {/* Hair that falls behind the head */}
      {hair === 'long' && <path d="M-21 -204 Q-24 -232 0 -232 Q24 -232 21 -204 L24 -168 Q0 -160 -24 -168Z" fill={hairColor} />}
      {hair === 'puff' && <circle cx="0" cy="-212" r="23" fill={hairColor} />}
      {/* Legs */}
      {legs === 'stand' ? (
        <>
          <rect x="-16" y={hip} width="12" height={-hip - 6} rx="5" fill={dress ? skin : bottom} />
          <rect x="4" y={hip} width="12" height={-hip - 6} rx="5" fill={dress ? skin : bottom} />
          <ellipse cx="-12" cy="-4" rx="11" ry="5" fill={SHOE} />
          <ellipse cx="12" cy="-4" rx="11" ry="5" fill={SHOE} />
        </>
      ) : (
        <>
          <path d="M-8 -96 L-22 -48 L-8 -14" fill="none" stroke={bottom} strokeWidth="13" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M8 -96 L28 -58 L44 -74" fill="none" stroke={bottom} strokeWidth="13" strokeLinecap="round" strokeLinejoin="round" />
          <ellipse cx="-4" cy="-10" rx="11" ry="5" fill={SHOE} />
          <ellipse cx="48" cy="-78" rx="11" ry="5" fill={SHOE} transform="rotate(-30 48 -78)" />
        </>
      )}
      {/* Body */}
      {dress ? (
        <path d="M-22 -178 Q0 -186 22 -178 L34 -84 Q0 -78 -34 -84Z" fill={top} />
      ) : (
        <>
          <path d="M-22 -178 Q0 -186 22 -178 L26 -96 L-26 -96Z" fill={top} />
          <path d="M-26 -100 L26 -100 L27 -88 L-27 -88Z" fill={bottom} />
        </>
      )}
      {extra}
      {/* Neck and head */}
      <rect x="-5" y="-196" width="10" height="20" rx="4" fill={skin} />
      <circle cx="0" cy="-206" r="17" fill={skin} />
      {/* Hair on top */}
      {(hair === 'short' || hair === 'long' || hair === 'bun') && <path d="M-18 -206 Q-20 -228 0 -228 Q20 -228 18 -206 Q10 -216 0 -216 Q-10 -216 -18 -206Z" fill={hairColor} />}
      {hair === 'short' && <path d="M-18 -208 Q-20 -222 -10 -224 L-14 -200Z" fill={hairColor} />}
      {hair === 'bun' && <circle cx="0" cy="-230" r="8" fill={hairColor} />}
      {hair === 'puff' && <path d="M-17 -206 Q-16 -226 0 -226 Q16 -226 17 -206 Q8 -214 0 -214 Q-8 -214 -17 -206Z" fill={hairColor} />}
      {hair === 'curly' && (
        <g fill={hairColor}>
          <circle cx="-12" cy="-220" r="8" />
          <circle cx="0" cy="-225" r="9" />
          <circle cx="12" cy="-220" r="8" />
          <circle cx="-17" cy="-209" r="6" />
          <circle cx="17" cy="-209" r="6" />
        </g>
      )}
      {holding}
      {/* Arms (long sleeves) and hands */}
      <path d={arm([-20, -172], l)} fill="none" stroke={top} strokeWidth="12" strokeLinecap="round" />
      <path d={arm([20, -172], r)} fill="none" stroke={top} strokeWidth="12" strokeLinecap="round" />
      <circle cx={l[0]} cy={l[1]} r="6.5" fill={skin} />
      <circle cx={r[0]} cy={r[1]} r="6.5" fill={skin} />
    </g>
  );
};

/* ------------------------------------------------------------------ */
/* Props held or placed in the scenes                                  */
/* ------------------------------------------------------------------ */
const Heart: React.FC<{ x: number; y: number; s?: number; fill?: string; pulse?: boolean; className?: string }> = ({ x, y, s = 1, fill = '#F06C83', pulse = true, className }) => (
  <g transform={`translate(${x} ${y}) scale(${s})`}>
    <g className={className}>
      <path d="M0 40 C-46 12 -54 -14 -42 -30 C-30 -46 -8 -44 0 -26 C8 -44 30 -46 42 -30 C54 -14 46 12 0 40Z" fill={fill} />
      <path d="M26 -34 C38 -32 44 -20 40 -8" fill="none" stroke="#fff" strokeOpacity="0.35" strokeWidth="5" strokeLinecap="round" />
      {pulse && <path d="M-36 -4 H-16 L-9 -20 L0 12 L9 -12 L14 -4 H36" fill="none" stroke="#fff" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />}
    </g>
  </g>
);

const Clock: React.FC<{ x: number; y: number; s?: number }> = ({ x, y, s = 1 }) => (
  <g transform={`translate(${x} ${y}) scale(${s})`}>
    <circle r="34" fill="#fff" stroke="#2E2A7A" strokeWidth="7" />
    <g className="calm-spin-slow">
      <line x1="0" y1="0" x2="0" y2="-22" stroke="#2E2A7A" strokeWidth="4" strokeLinecap="round" />
    </g>
    <line x1="0" y1="0" x2="18" y2="0" stroke="#F06C83" strokeWidth="4" strokeLinecap="round" />
    <circle r="4" fill="#2E2A7A" />
  </g>
);

const Chat: React.FC<{ x: number; y: number; s?: number }> = ({ x, y, s = 1 }) => (
  <g transform={`translate(${x} ${y}) scale(${s})`}>
    <path d="M-48 -30 Q-48 -40 -38 -40 H38 Q48 -40 48 -30 V16 Q48 26 38 26 H-8 L-26 42 V26 H-38 Q-48 26 -48 16Z" fill="#2E2A7A" />
    <path d="M-48 -30 Q-48 -40 -38 -40 H0 V26 H-38 Q-48 26 -48 16Z" fill="#EEF0F6" />
    <path d="M-24 -7 h16 M-16 -15 v16" stroke="#2E2A7A" strokeWidth="6" strokeLinecap="round" />
    <circle cx="14" cy="-7" r="4.5" fill="#fff" />
    <circle cx="28" cy="-7" r="4.5" fill="#fff" />
  </g>
);

const Sprout: React.FC<{ x: number; y: number; s?: number }> = ({ x, y, s = 1 }) => (
  <g transform={`translate(${x} ${y}) scale(${s})`}>
    <path d="M0 -6 C0 -30 -2 -40 0 -54" fill="none" stroke="#15803D" strokeWidth="5" strokeLinecap="round" />
    <path d="M0 -40 C-30 -48 -36 -70 -30 -76 C-12 -76 2 -62 0 -40Z" fill="#22C55E" />
    <path d="M0 -50 C26 -62 36 -84 30 -90 C10 -90 -2 -74 0 -50Z" fill="#4ADE80" />
    <path d="M-30 -8 H30 L24 34 Q0 40 -24 34Z" fill="#E07A5F" />
    <rect x="-34" y="-12" width="68" height="12" rx="4" fill="#C8644A" />
  </g>
);

const Dumbbell: React.FC<{ x: number; y: number; s?: number; r?: number }> = ({ x, y, s = 1, r = 0 }) => (
  <g transform={`translate(${x} ${y}) rotate(${r}) scale(${s})`}>
    <rect x="-34" y="-4" width="68" height="8" rx="3" fill="#2E2A7A" />
    <rect x="-46" y="-18" width="12" height="36" rx="4" fill="#3B3F9E" />
    <rect x="-56" y="-13" width="10" height="26" rx="4" fill="#3B3F9E" />
    <rect x="34" y="-18" width="12" height="36" rx="4" fill="#3B3F9E" />
    <rect x="46" y="-13" width="10" height="26" rx="4" fill="#3B3F9E" />
  </g>
);

const Apple: React.FC<{ x: number; y: number; s?: number }> = ({ x, y, s = 1 }) => (
  <g transform={`translate(${x} ${y}) scale(${s})`}>
    <path d="M0 -18 C-8 -26 -30 -26 -30 2 C-30 26 -12 32 0 26 C12 32 30 26 30 2 C30 -26 8 -26 0 -18Z" fill="#EF4444" />
    <path d="M0 -18 C0 -26 2 -32 6 -36" fill="none" stroke="#7C4A2D" strokeWidth="3" strokeLinecap="round" />
    <path d="M4 -28 C10 -40 24 -40 26 -34 C20 -26 10 -26 4 -28Z" fill="#22C55E" />
  </g>
);

const Carrot: React.FC<{ x: number; y: number; r?: number }> = ({ x, y, r = 0 }) => (
  <g transform={`translate(${x} ${y}) rotate(${r})`}>
    <path d="M-9 0 L9 0 L0 52Z" fill="#F97316" />
    <path d="M-2 0 C-10 -14 -6 -22 -2 -20 M2 0 C8 -16 14 -16 12 -10 M0 0 L0 -18" fill="none" stroke="#22C55E" strokeWidth="4" strokeLinecap="round" />
  </g>
);

const Leaves: React.FC<{ x: number; y: number; s?: number; flip?: boolean }> = ({ x, y, s = 1, flip }) => (
  <g transform={`translate(${x} ${y}) scale(${flip ? -s : s} ${s})`}>
    <path d="M0 0 C-6 -40 -30 -60 -40 -58 C-40 -34 -24 -10 0 0Z" fill="#16A34A" />
    <path d="M0 0 C4 -50 20 -74 30 -72 C34 -46 22 -16 0 0Z" fill="#22C55E" />
    <path d="M0 0 C16 -24 40 -34 48 -28 C42 -12 22 -2 0 0Z" fill="#4ADE80" />
  </g>
);

const Flower: React.FC<{ x: number; y: number; s?: number }> = ({ x, y, s = 1 }) => (
  <g transform={`translate(${x} ${y}) scale(${s})`}>
    {[0, 60, 120, 180, 240, 300].map(a => (
      <ellipse key={a} cx="0" cy="-6" rx="3.5" ry="6" fill="#fff" transform={`rotate(${a})`} />
    ))}
    <circle r="3.2" fill="#F9A8D4" />
  </g>
);

/* ------------------------------------------------------------------ */
/* Scenes (480 × 400)                                                  */
/* ------------------------------------------------------------------ */
const FriendsScene = () => (
  <>
    <ellipse cx="240" cy="372" rx="220" ry="16" fill="var(--muted)" />
    <Person
      x={82} y={368} s={0.95} skin="#8D5524" hair="short" top="#6CA6E8" bottom="#B8BCC6" l={[-24, -112]} r={[32, -262]}
      holding={<g className="calm-float" style={{ animationDelay: '0.4s' }}><Clock x={42} y={-292} /></g>}
    />
    <Person
      x={182} y={370} s={0.95} skin="#C68642" hair="long" top="#F27493" bottom="#F27493" dress l={[-52, -138]} r={[52, -138]}
      holding={<Chat x={0} y={-140} s={1.05} />}
    />
    <Person
      x={292} y={370} skin="#6B3E26" hair="puff" top="#3B4CC0" bottom="#B8BCC6" l={[-38, -262]} r={[38, -262]}
      holding={<Heart x={0} y={-300} s={1.15} className="heart-beat" />}
    />
    <Person
      x={398} y={370} s={0.95} skin="#A0673C" hair="curly" top="#4B5BD6" bottom="#2E3A8C" l={[-30, -126]} r={[30, -126]}
      extra={<path d="M-10 -178 L0 -150 L10 -178Z" fill="#fff" />}
      holding={<Sprout x={0} y={-118} s={0.9} />}
    />
  </>
);

const JoyScene = () => (
  <>
    <circle cx="240" cy="190" r="168" fill="var(--muted)" />
    <Flower x={70} y={90} /> <Flower x={418} y={70} s={1.2} /> <Flower x={440} y={180} s={0.8} /> <Flower x={50} y={200} s={0.9} />
    <Heart x={240} y={182} s={3.2} fill="#E8457A" pulse={false} className="heart-beat" />
    <path d="M70 196 H170 L190 150 L214 240 L238 120 L262 220 L278 196 H410" fill="none" stroke="#fff" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M178 96 h18 M187 87 v18 M300 76 h22 M311 65 v22" stroke="#fff" strokeWidth="6" strokeLinecap="round" />
    <ellipse cx="240" cy="366" rx="210" ry="18" fill="#BBF7D0" />
    <Leaves x={440} y={360} s={1.1} />
    <Carrot x={40} y={300} r={-25} /> <Carrot x={62} y={296} r={-8} />
    {/* Jumping for joy */}
    <g className="joy-hop">
      <Person x={118} y={346} s={0.92} skin="#C68642" hair="long" top="#F9A8D4" bottom="#2E3A8C" l={[-46, -248]} r={[40, -254]} legs="jump" />
    </g>
    {/* Meditating in the middle */}
    <g transform="translate(240 372) scale(0.6) translate(-240 -326)">
      <MeditatingPerson />
    </g>
    {/* Lifting a dumbbell */}
    <Person
      x={372} y={364} s={0.92} skin="#6B3E26" hair="short" top="#2DD4BF" bottom="#2E3A8C" l={[-28, -116]} r={[30, -262]}
      holding={<g className="calm-float"><Dumbbell x={30} y={-268} s={0.8} /></g>}
    />
    <Apple x={428} y={340} s={0.9} />
  </>
);

const CareScene = () => (
  <>
    <ellipse cx="240" cy="372" rx="215" ry="16" fill="var(--muted)" />
    {/* A care card with a cross and a pulse (no words) */}
    <Person
      x={112} y={370} skin="#C68642" hair="long" hairColor="#8B4A2B" top="#6FAF9A" bottom="#6FAF9A" dress l={[52, -138]} r={[34, -262]}
      holding={<g className="calm-float"><Heart x={44} y={-290} s={0.9} fill="#D9285E" className="heart-beat" /></g>}
    />
    <Person
      x={246} y={370} skin="#6B3E26" hair="puff" top="#8A8F98" bottom="#B5583A" l={[-34, -140]} r={[30, -140]}
      extra={<path d="M-12 -178 L-6 -100 L6 -100 L12 -178Z" fill="#F5F5F5" />}
    />
    <g>
      <rect x="140" y="204" width="236" height="68" rx="34" fill="#EEF0F6" />
      <path d="M258 204 H342 A34 34 0 0 1 342 272 H258Z" fill="#3D8FD1" />
      <path d="M182 238 h36 M200 220 v36" stroke="#3D8FD1" strokeWidth="11" strokeLinecap="round" />
      <path d="M270 238 H290 L298 222 L310 254 L320 232 L326 238 H350" fill="none" stroke="#fff" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
    </g>
    {/* Hands over the card */}
    <circle cx="212" cy="230" r="6.5" fill="#6B3E26" />
    <circle cx="276" cy="230" r="6.5" fill="#6B3E26" />
    <circle cx="164" cy="232" r="6.5" fill="#C68642" />
    <Person
      x={380} y={370} skin="#8D5524" hair="short" top="#F2C230" bottom="#4B5563" l={[-30, -132]} r={[56, -150]}
      extra={
        <>
          <path d="M-10 -178 L0 -100 L10 -178Z" fill="#fff" />
          <path d="M-12 -182 C-22 -150 -16 -130 -2 -130 M12 -182 C22 -150 18 -136 30 -136 C48 -136 54 -146 56 -150" fill="none" stroke="#2563EB" strokeWidth="4" strokeLinecap="round" />
        </>
      }
      holding={<circle cx={60} cy={-152} r="11" fill="#fff" stroke="#1F2433" strokeWidth="5" />}
    />
  </>
);

const SCENES: Array<{ id: string; label: string; art: React.ReactNode }> = [
  { id: 'calm', label: 'A young person meditating calmly, with floating icons for chat, friends, help, time and health', art: null },
  { id: 'friends', label: 'Four friends holding up a clock, a chat bubble, a heart and a growing plant', art: <FriendsScene /> },
  { id: 'joy', label: 'Friends having a healthy, joyful day around a big heart: jumping, meditating and exercising', art: <JoyScene /> },
  { id: 'care', label: 'A caring team holding a heart and a health card, one with a stethoscope', art: <CareScene /> },
];

const SLIDE_MS = 5000;
const SLIDE_MS_CALM = 8000; // with "reduce motion"

export const LoginArt: React.FC<{ className?: string; compact?: boolean }> = ({ className, compact }) => {
  const [index, setIndex] = useState(0);
  const [held, setHeld] = useState(false);
  const [hidden, setHidden] = useState(() => typeof document !== 'undefined' && document.visibilityState === 'hidden');
  const [reduce] = useState(() => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
  const start = useRef<{ x: number; t: number } | null>(null);
  const drift = useRef<HTMLDivElement>(null);
  const go = (d: number) => setIndex(i => (i + d + SCENES.length) % SCENES.length);
  const running = !held && !hidden;

  // Pause while the browser tab is in the background
  useEffect(() => {
    const onVis = () => setHidden(document.visibilityState === 'hidden');
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  // Move on to the next picture every few seconds (a little slower with "reduce motion")
  useEffect(() => {
    if (!running) return;
    const t = setTimeout(() => go(1), reduce ? SLIDE_MS_CALM : SLIDE_MS);
    return () => clearTimeout(t);
  }, [index, running, reduce]);

  return (
    <div
      className={cx('relative select-none touch-pan-y', className)}
      aria-roledescription="carousel"
      aria-label="Illustrations"
      onMouseLeave={() => {
        if (drift.current) drift.current.style.transform = '';
      }}
      onPointerMove={e => {
        if (reduce || e.pointerType !== 'mouse' || !drift.current) return;
        const r = e.currentTarget.getBoundingClientRect();
        const x = (e.clientX - r.left) / r.width - 0.5;
        const y = (e.clientY - r.top) / r.height - 0.5;
        drift.current.style.transform = `translate3d(${(x * 10).toFixed(1)}px, ${(y * 8).toFixed(1)}px, 0)`;
      }}
      onPointerDown={e => {
        if (e.target instanceof Element && e.target.closest('button')) return;
        start.current = { x: e.clientX, t: Date.now() };
        setHeld(true);
      }}
      onPointerCancel={() => {
        start.current = null;
        setHeld(false);
      }}
      onPointerLeave={() => setHeld(false)}
      onPointerUp={e => {
        const s = start.current;
        start.current = null;
        setHeld(false);
        if (!s) return;
        const dx = e.clientX - s.x;
        if (Math.abs(dx) > 40) go(dx < 0 ? 1 : -1);
        else if (Date.now() - s.t < 350) go(1);
      }}
      onKeyDown={e => {
        if (e.key === 'ArrowRight') go(1);
        if (e.key === 'ArrowLeft') go(-1);
      }}
    >
      <div ref={drift} className="relative grid transition-transform duration-700 ease-out cursor-pointer">
        {SCENES.map((sc, i) => {
          const on = i === index;
          return (
            <div
              key={sc.id}
              aria-hidden={!on}
              className={cx('col-start-1 row-start-1 self-center transition-[opacity,transform] duration-700 ease-out', on ? 'opacity-100 translate-x-0 scale-100' : 'pointer-events-none opacity-0 translate-x-6 scale-[0.98]')}
            >
              {sc.id === 'calm' ? (
                <CalmIllustration />
              ) : (
                <svg viewBox="0 0 480 400" className="block h-auto w-full overflow-visible" role="img" aria-label={sc.label}>
                  {sc.art}
                </svg>
              )}
            </div>
          );
        })}
      </div>

      {/* Dots (no words) */}
      <div className={cx('flex justify-center gap-0.5', compact ? 'mt-1' : 'mt-6')} role="tablist" aria-label="Choose an illustration">
        {SCENES.map((sc, i) => (
          <button
            key={sc.id}
            type="button"
            role="tab"
            aria-selected={i === index}
            aria-label={sc.label}
            onClick={() => setIndex(i)}
            className="flex h-7 min-w-7 items-center justify-center px-1.5 cursor-pointer"
          >
            <span className={cx('block h-2 rounded-full transition-all duration-300', i === index ? 'w-7 bg-pri' : 'w-2 bg-ink-3/40 hover:bg-ink-3/70')} />
          </button>
        ))}
      </div>
    </div>
  );
};
