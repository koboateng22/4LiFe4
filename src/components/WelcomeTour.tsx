/**
 * The welcome tour: a short, full-screen slideshow shown once after someone
 * creates an account. It says hello, explains the three features in plain words,
 * and promises privacy, with icons and a few photos.
 *
 * Swipe, use the arrow keys, or tap Continue. "Skip" ends it at any time.
 * It can be replayed from quick search (Ctrl/⌘ K → "Show the welcome tour").
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Bot,
  Heart,
  Lock,
  MapPin,
  MessageCircleHeart,
  Phone,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Sprout,
  Users,
  WifiOff,
  Wind,
  type LucideIcon,
} from 'lucide-react';
import { cx } from './ui';
import { RibbonMark } from './RibbonMark';
import { LanguageMenu } from './LanguageMenu';
import { lockPage } from '../lib/motion';
import outdoors from '../assets/photos/outdoors.webp';
import outdoorsSm from '../assets/photos/outdoors-640.webp';
import kitchen from '../assets/photos/kitchen.webp';
import kitchenSm from '../assets/photos/kitchen-640.webp';
import together from '../assets/photos/together.webp';
import togetherSm from '../assets/photos/together-640.webp';

/* ---------- "show it once" flag ---------- */
const KEY = '4life_welcome_pending';
export const markWelcomePending = () => {
  try {
    localStorage.setItem(KEY, '1');
  } catch {}
};
export const isWelcomePending = () => {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
};
export const clearWelcomePending = () => {
  try {
    localStorage.removeItem(KEY);
  } catch {}
};

/* ---------- Visuals ---------- */
const Chip: React.FC<{ icon: LucideIcon; label: string; className?: string; delay?: number; tilt?: number }> = ({ icon: Icon, label, className, delay = 0, tilt = 0 }) => (
  <span
    className={cx(
      'welcome-float absolute inline-flex items-center gap-2 whitespace-nowrap rounded-full border border-[rgba(255,255,255,0.22)] bg-[rgba(6,78,59,0.72)] py-2 pl-2 pr-3.5 text-sm font-bold text-[#ecfdf5] shadow-[0_12px_30px_-10px_rgba(0,0,0,0.6)] backdrop-blur-md',
      className
    )}
    style={{ animationDelay: `${delay}s`, ['--r' as string]: `${tilt}deg` }}
  >
    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#34d399] text-[#022c22]">
      <Icon className="h-4 w-4" aria-hidden="true" />
    </span>
    {label}
  </span>
);

const Photo: React.FC<{ src: string; srcSm: string; pos: string; icon: LucideIcon; chips: Array<[LucideIcon, string]> }> = ({ src, srcSm, pos, icon: Icon, chips }) => (
  <div className="relative mx-auto aspect-[4/5] w-[min(19rem,32dvh,100%)] sm:w-[min(20rem,30dvh)] lg:w-[min(25rem,50dvh)]">
    <div className="absolute inset-0 overflow-hidden rounded-[2rem] shadow-[0_30px_60px_-20px_rgba(0,0,0,0.65)] ring-1 ring-[rgba(255,255,255,0.15)]">
      <img src={src} srcSet={`${srcSm} 640w, ${src} 1100w`} sizes="(min-width: 640px) 336px, 80vw" alt="" className="photo-zoom h-full w-full object-cover" style={{ objectPosition: pos }} draggable={false} />
      <div className="absolute inset-0 bg-[linear-gradient(180deg,transparent_55%,rgba(2,44,34,0.55))]" />
    </div>
    <span className="welcome-float absolute -right-3 -top-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-[#fbbf24] text-[#022c22] shadow-xl" style={{ ['--r' as string]: '8deg' }}>
      <Icon className="h-8 w-8" aria-hidden="true" />
    </span>
    {chips[0] && <Chip icon={chips[0][0]} label={chips[0][1]} className="-left-4 top-[38%]" delay={0.6} tilt={-3} />}
  </div>
);

const Bubble: React.FC<{ icon: LucideIcon; className: string; bg: string; delay: number }> = ({ icon: Icon, className, bg, delay }) => (
  <span className={cx('welcome-float absolute flex h-14 w-14 items-center justify-center rounded-2xl text-[#022c22] shadow-xl', className)} style={{ background: bg, animationDelay: `${delay}s` }}>
    <Icon className="h-7 w-7" aria-hidden="true" />
  </span>
);

const HelloVisual = () => (
  <div className="relative mx-auto aspect-square w-[min(19rem,38dvh,100%)] sm:w-[min(20rem,36dvh)] lg:w-[min(30rem,58dvh)]">
    <div className="absolute inset-[6%] rounded-full border border-[rgba(52,211,153,0.25)]" />
    <div className="absolute inset-[20%] rounded-full border border-dashed border-[rgba(52,211,153,0.35)]" />
    <div className="absolute inset-[30%] rounded-full bg-[radial-gradient(circle,rgba(16,185,129,0.45),transparent_70%)]" />
    <RibbonMark tone="onDark" breathe className="absolute left-1/2 top-1/2 h-40 w-24 -translate-x-1/2 -translate-y-1/2" />
    <Bubble icon={MessageCircleHeart} className="left-[4%] top-[18%]" bg="#a7f3d0" delay={0} />
    <Bubble icon={Users} className="right-[2%] top-[30%]" bg="#fbbf24" delay={0.8} />
    <Bubble icon={Phone} className="bottom-[8%] left-[22%]" bg="#fda4af" delay={1.6} />
  </div>
);

const HelpVisual = () => (
  <div className="relative mx-auto aspect-square w-[min(19rem,38dvh,100%)] sm:w-[min(20rem,36dvh)] lg:w-[min(30rem,58dvh)]">
    <div className="absolute left-1/2 top-1/2 h-28 w-28 -translate-x-1/2 -translate-y-1/2 sm:h-32 sm:w-32 lg:h-40 lg:w-40">
      <span className="auth-ring absolute inset-0 rounded-full bg-[#e11d48]" />
      <span className="auth-ring absolute inset-0 rounded-full bg-[#e11d48] [animation-delay:1.1s]" />
      <span className="absolute inset-0 flex flex-col items-center justify-center rounded-full bg-[#e11d48] text-[#fff] shadow-[0_20px_50px_-10px_rgba(225,29,72,0.7)]">
        <Phone className="h-8 w-8" aria-hidden="true" />
        <span className="mt-0.5 text-xl font-extrabold tracking-wider">SOS</span>
      </span>
    </div>
    <Chip icon={Phone} label="Call 112" className="left-0 top-[4%]" delay={0} tilt={-3} />
    <Chip icon={WifiOff} label="Works offline" className="right-0 top-[16%]" delay={0.7} tilt={3} />
    <Chip icon={MapPin} label="Share location" className="bottom-[2%] left-[6%]" delay={1.4} tilt={-2} />
  </div>
);

const PrivacyVisual = () => (
  <div className="relative mx-auto aspect-square w-[min(19rem,38dvh,100%)] sm:w-[min(20rem,36dvh)] lg:w-[min(30rem,58dvh)]">
    <div className="absolute inset-[18%] rounded-[2.5rem] bg-[radial-gradient(circle_at_50%_40%,rgba(52,211,153,0.35),rgba(6,78,59,0.2)_70%)] ring-1 ring-[rgba(255,255,255,0.12)]" />
    <span className="absolute left-1/2 top-1/2 flex h-28 w-28 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-[2rem] bg-[#ecfdf5] text-[#047857] shadow-2xl">
      <Lock className="h-14 w-14" aria-hidden="true" />
    </span>
    <Chip icon={Smartphone} label="Chats saved only on your phone" className="left-0 top-[6%]" delay={0} tilt={-2} />
    <Chip icon={ShieldCheck} label="Shared only if you say so" className="right-0 top-[66%]" delay={0.8} tilt={2} />
    <Chip icon={Bot} label="Always says it’s an AI" className="bottom-[2%] left-[4%]" delay={1.6} tilt={-2} />
  </div>
);

/* ---------- Slides ---------- */
interface Slide {
  id: string;
  eyebrow: string;
  title: (name: string) => string;
  text: string;
  visual: React.ReactNode;
  glow: string;
}

const SLIDES: Slide[] = [
  {
    id: 'hello',
    eyebrow: 'Welcome',
    title: name => (name ? `Akwaaba, ${name}` : 'Akwaaba'),
    text: 'Help that’s there at 2 a.m. 4Life is your private space to recover from substance use, one day at a time. Here’s a quick look around.',
    visual: <HelloVisual />,
    glow: 'rgba(16,185,129,0.45)',
  },
  {
    id: 'ai',
    eyebrow: 'AI CBT therapy',
    title: () => 'Talk it through, any hour',
    text: 'When a craving or a heavy thought hits, your AI coach uses CBT to help you ride it out, day or night.',
    visual: <Photo src={outdoors} srcSm={outdoorsSm} pos="42% 28%" icon={MessageCircleHeart} chips={[[Wind, 'Ride the wave']]} />,
    glow: 'rgba(52,211,153,0.4)',
  },
  {
    id: 'village',
    eyebrow: 'Global Village',
    title: () => 'You are not alone',
    text: 'Share your story without your name, cheer others on, and join a weekly circle with people who understand.',
    visual: <Photo src={kitchen} srcSm={kitchenSm} pos="50% 30%" icon={Users} chips={[[Heart, 'Anonymous stories']]} />,
    glow: 'rgba(251,191,36,0.35)',
  },
  {
    id: 'help',
    eyebrow: 'Instant EMS',
    title: () => 'Help in one tap',
    text: 'SOS calls 112, texts your location to someone you trust and finds the nearest hospital, even without internet.',
    visual: <HelpVisual />,
    glow: 'rgba(225,29,72,0.4)',
  },
  {
    id: 'private',
    eyebrow: 'Private by design',
    title: () => 'Your story stays yours',
    text: 'Your AI chats are saved only on your phone. Nothing goes to a counsellor unless you choose to share it.',
    visual: <PrivacyVisual />,
    glow: 'rgba(56,189,248,0.35)',
  },
  {
    id: 'ready',
    eyebrow: 'You’re all set',
    title: () => 'Enjoy the good days again',
    text: 'Start with a quick check-in on your home screen. Small steps add up, and we’ll be here for every one.',
    visual: <Photo src={together} srcSm={togetherSm} pos="52% 30%" icon={Sprout} chips={[[Sparkles, 'Daily check-in']]} />,
    glow: 'rgba(16,185,129,0.45)',
  },
];

interface WelcomeTourProps {
  name?: string;
  language: string;
  onChangeLanguage: (code: string) => void;
  onDone: () => void;
}

export const WelcomeTour: React.FC<WelcomeTourProps> = ({ name = '', language, onChangeLanguage, onDone }) => {
  const [index, setIndex] = useState(0);
  const [dir, setDir] = useState(1);
  const startX = useRef<number | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const slide = SLIDES[index];
  const last = index === SLIDES.length - 1;
  const firstName = name.trim().split(/\s+/)[0] || '';

  const go = useCallback(
    (d: number) => {
      const next = index + d;
      if (next >= SLIDES.length) return onDone();
      if (next < 0) return;
      setDir(d);
      setIndex(next);
    },
    [index, onDone]
  );

  useEffect(() => lockPage(), []);
  useEffect(() => heading.current?.focus({ preventScroll: true }), [index]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof Element && e.target.closest('[role="menu"]')) return;
      if (e.key === 'ArrowRight') go(1);
      if (e.key === 'ArrowLeft') go(-1);
      if (e.key === 'Escape') onDone();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go, onDone]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="welcome-title"
      className="fixed inset-0 z-[80] overflow-y-auto overscroll-contain bg-[#021f18] text-[#fff]"
      onPointerDown={e => {
        if (e.target instanceof Element && e.target.closest('button, a, [role="menu"]')) return;
        startX.current = e.clientX;
      }}
      onPointerUp={e => {
        if (startX.current == null) return;
        const dx = e.clientX - startX.current;
        startX.current = null;
        if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1);
      }}
    >
      {/* Soft glow that changes colour with each slide */}
      <div aria-hidden="true" className="pointer-events-none fixed inset-0">
        <div className="absolute left-1/2 top-[30%] h-[42rem] w-[42rem] -translate-x-1/2 -translate-y-1/2 rounded-full blur-3xl lg:left-[30%] lg:top-1/2 lg:h-[52rem] lg:w-[52rem] transition-[background] duration-700" style={{ background: `radial-gradient(circle, ${slide.glow}, transparent 65%)` }} />
        <div className="absolute inset-x-0 bottom-0 h-1/2 bg-[linear-gradient(180deg,transparent,rgba(2,31,24,0.9))]" />
      </div>

      <div className="relative mx-auto flex min-h-full w-full max-w-lg touch-pan-y select-none flex-col px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))] sm:px-8 sm:py-8 lg:max-w-6xl lg:px-14 lg:py-10">
        {/* Progress */}
        <div className="flex gap-1.5" role="tablist" aria-label="Welcome steps">
          {SLIDES.map((s, i) => (
            <button
              key={s.id}
              type="button"
              role="tab"
              aria-selected={i === index}
              aria-label={`Step ${i + 1} of ${SLIDES.length}: ${s.eyebrow}`}
              onClick={() => {
                setDir(i > index ? 1 : -1);
                setIndex(i);
              }}
              className="flex h-6 flex-1 items-center cursor-pointer"
            >
              <span className={cx('block h-1 w-full rounded-full transition-colors duration-500', i <= index ? 'bg-[#34d399]' : 'bg-[rgba(255,255,255,0.2)]')} />
            </button>
          ))}
        </div>

        <div className="mt-2 flex items-center justify-between gap-3">
          <span className="flex items-center gap-2 text-sm font-bold text-[#a7f3d0]">
            <RibbonMark tone="onDark" className="h-6 w-4" />
            <span translate="no">4Life</span>
          </span>
          <div className="flex items-center gap-2">
            <LanguageMenu value={language} onChange={onChangeLanguage} tone="glass" showName={false} />
            {!last && (
              <button type="button" onClick={onDone} className="min-h-10 rounded-xl px-3 text-sm font-bold text-[#d1fae5] hover:bg-[rgba(255,255,255,0.08)] cursor-pointer">
                Skip
              </button>
            )}
          </div>
        </div>

        {/* Body: stacked on phones; picture left and words right on a computer */}
        <div className="flex flex-1 flex-col lg:grid lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:items-center lg:gap-16 lg:py-6">
        {/* Visual */}
        <div key={`v-${slide.id}`} className="welcome-pop flex flex-1 items-center justify-center py-5 sm:py-6 lg:py-0">
          <div className="w-full px-4">{slide.visual}</div>
        </div>

        <div className="lg:max-w-md">
        {/* Words */}
        <div key={`t-${slide.id}`} className="auth-slide-in text-center lg:text-left">
          <p className="m-0 text-sm font-bold uppercase tracking-[0.18em] text-[#34d399]">{slide.eyebrow}</p>
          <h2 id="welcome-title" ref={heading} tabIndex={-1} className="m-0 mt-2 text-[2rem] font-extrabold leading-[1.1] tracking-tight outline-none sm:text-[2.25rem] lg:mt-3 lg:text-[3rem] lg:leading-[1.05]">
            {slide.title(firstName)}
          </h2>
          <p className="mx-auto mb-0 mt-3 max-w-sm text-[1.0625rem] leading-relaxed text-[#cdeee0] lg:mx-0 lg:mt-5 lg:max-w-md lg:text-[1.1875rem]">{slide.text}</p>
        </div>

        {/* Buttons */}
        <div className="mt-7 flex items-center gap-3 lg:mt-10">
          {index > 0 && (
            <button
              type="button"
              onClick={() => go(-1)}
              aria-label="Back"
              className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full border border-[rgba(255,255,255,0.2)] text-[#fff] hover:bg-[rgba(255,255,255,0.08)] cursor-pointer"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
          )}
          <button
            type="button"
            onClick={() => go(1)}
            className="flex h-14 flex-1 items-center justify-center gap-2 rounded-full bg-[#fff] text-[1.0625rem] font-extrabold text-[#022c22] shadow-[0_16px_40px_-12px_rgba(52,211,153,0.6)] transition-transform hover:-translate-y-0.5 cursor-pointer"
          >
            {index === 0 ? 'Show me around' : last ? 'Start my journey' : 'Continue'}
            <ArrowRight className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
        <p className="m-0 mt-3 text-center text-xs text-[#9fbdb0] lg:text-left lg:text-sm">
          In danger right now? Call <a href="tel:112" className="font-bold text-[#fff]">112</a>, free, 24 hours.
        </p>
        </div>
        </div>
      </div>
    </div>
  );
};
