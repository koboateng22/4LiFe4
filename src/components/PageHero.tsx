/**
 * A calm forest-green banner at the top of a page, with an illustration —
 * the same look as the sign-in story panel, so the app feels like one place.
 */
import React from 'react';
import { cx } from './ui';
import { RibbonMark } from './RibbonMark';

export const PageHero: React.FC<{
  eyebrow?: string;
  title: React.ReactNode;
  text?: React.ReactNode;
  art?: React.ReactNode;
  actions?: React.ReactNode;
  aside?: React.ReactNode;
  className?: string;
  id?: string;
}> = ({ eyebrow, title, text, art, actions, aside, className, id }) => (
  <section
    aria-labelledby={id}
    className={cx(
      'relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#064e3b] via-[#053d2e] to-[#022c22] p-5 text-[#fff] shadow-[0_24px_60px_-30px_rgba(2,44,34,0.6)] sm:p-8',
      className
    )}
  >
    <div aria-hidden="true" className="pointer-events-none absolute inset-0">
      <RibbonMark tone="onDark" breathe className="absolute -right-14 -top-16 h-72 w-44 rotate-[14deg] opacity-[0.16]" />
      <div className="absolute -bottom-10 left-1/3 h-28 w-28 rounded-full border-[12px] border-[#38bdf8] opacity-10" />
      <div className="absolute right-6 top-6 hidden h-2 w-2 rounded-full bg-[#fbbf24] md:block" />
    </div>
    <div className="relative grid items-center gap-5 sm:gap-6 md:grid-cols-[minmax(0,1fr)_auto]">
      <div className="flex min-w-0 flex-col gap-3">
        {eyebrow && <span className="inline-flex self-start rounded-full bg-[rgba(255,255,255,0.12)] px-3 py-1 text-sm font-bold text-[#a7f3d0]">{eyebrow}</span>}
        <h1 id={id} className="m-0 text-[1.6rem] font-extrabold leading-tight tracking-tight sm:text-[2.125rem]">
          {title}
        </h1>
        {text && <p className="m-0 max-w-xl text-[15px] leading-relaxed text-[#d1fae5] sm:text-lg">{text}</p>}
        {actions && <div className="mt-1 flex flex-wrap gap-2.5 sm:mt-2 sm:gap-3 [&>*]:grow sm:[&>*]:grow-0">{actions}</div>}
      </div>
      {(art || aside) && (
        <div className="flex items-center gap-5">
          {aside}
          {art && <div className={cx('hidden h-44 w-56 shrink-0 lg:h-48 lg:w-64', aside ? '2xl:block' : 'md:block')}>{art}</div>}
        </div>
      )}
    </div>
  </section>
);

/** Buttons that read well on the dark banner */
export const heroPrimary =
  'inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#fbbf24] px-4 text-[0.9375rem] sm:px-5 sm:text-base font-bold text-[#022c22] transition-transform hover:-translate-y-0.5 hover:bg-[#fcd34d] cursor-pointer';
export const heroSecondary =
  'inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[rgba(255,255,255,0.12)] px-4 text-[0.9375rem] sm:px-5 sm:text-base font-bold text-[#fff] transition-colors hover:bg-[rgba(255,255,255,0.2)] cursor-pointer';
