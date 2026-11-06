/**
 * 4Life shared UI building blocks.
 * Every screen uses these so spacing, text sizes and colours stay consistent.
 * Colours come from the tokens in index.css (bg-surface, text-ink, bg-pri …),
 * so light and dark mode work without extra classes.
 */
import React, { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { lockPage } from '../lib/motion';

import { t as tr } from '../i18n';

/** Shared components translate text they are given as plain strings (texts kept in data with msg()). */
const tx = (v: React.ReactNode) => (typeof v === 'string' ? tr(v) : v);
export const cx = (...parts: Array<string | false | null | undefined>) => parts.filter(Boolean).join(' ');

/* ---------- Cards & headings ---------- */

type CardTone = 'default' | 'soft' | 'danger' | 'warn' | 'night' | 'plain';

const CARD_TONES: Record<CardTone, string> = {
  default: 'bg-surface border border-line/70 shadow-card',
  soft: 'bg-pri-soft',
  danger: 'bg-danger-soft',
  warn: 'bg-warn-soft',
  night: 'bg-night text-[#eaf4ee]',
  plain: 'bg-bg',
};

export const Card: React.FC<
  React.HTMLAttributes<HTMLElement> & { as?: 'section' | 'article' | 'div' | 'aside'; tone?: CardTone; padded?: boolean; raised?: boolean }
> = ({ as = 'section', tone = 'default', padded = true, raised = false, className, children, ...rest }) => {
  const Tag = as as any;
  return (
    <Tag
      className={cx('reveal rounded-2xl', CARD_TONES[tone], padded && 'p-5 sm:p-6', raised && 'shadow-lift', className)}
      {...rest}
    >
      {children}
    </Tag>
  );
};

export const SectionHeader: React.FC<{
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  action?: React.ReactNode;
  id?: string;
  as?: 'h1' | 'h2' | 'h3';
  size?: 'lg' | 'md';
  className?: string;
}> = ({ title, subtitle, action, id, as = 'h2', size = 'lg', className }) => {
  const H = as as any;
  return (
    <div className={cx('flex flex-wrap items-start justify-between gap-3', className)}>
      <div className="min-w-0">
        <H id={id} className={cx('m-0 font-bold text-ink', size === 'lg' ? 'text-xl sm:text-[1.375rem] leading-snug' : 'text-lg leading-snug')}>
          {tx(title)}
        </H>
        {subtitle && <p className="mt-1 text-base text-ink-3">{tx(subtitle)}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
};

/* ---------- Buttons ---------- */

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'soft' | 'link';
type ButtonSize = 'sm' | 'md' | 'lg';

const BTN_VARIANTS: Record<ButtonVariant, string> = {
  primary: 'btn-shine bg-pri text-[#fff] hover:bg-pri-hover',
  secondary: 'bg-surface text-ink border border-line hover:bg-muted',
  danger: 'btn-shine bg-danger text-[#fff] hover:bg-danger-hover',
  ghost: 'bg-transparent text-ink-2 hover:bg-muted',
  soft: 'bg-pri-soft text-pri-ink hover:brightness-95',
  link: 'bg-transparent text-pri-text hover:underline px-0',
};

const BTN_SIZES: Record<ButtonSize, string> = {
  sm: 'min-h-10 px-3.5 text-sm rounded-lg gap-1.5',
  md: 'min-h-11 px-4 text-sm rounded-xl gap-2',
  lg: 'min-h-12 px-5 text-base rounded-xl gap-2',
};

export const buttonClass = (variant: ButtonVariant = 'primary', size: ButtonSize = 'md', block = false) =>
  cx(
    'inline-flex items-center justify-center font-bold transition-[color,background-color,border-color,box-shadow,transform] duration-200 cursor-pointer select-none',
    'disabled:opacity-45 disabled:cursor-not-allowed',
    BTN_VARIANTS[variant],
    variant === 'link' ? 'min-h-11 text-sm gap-1.5' : BTN_SIZES[size],
    block && 'w-full'
  );

export const Button: React.FC<
  Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'size'> & { variant?: ButtonVariant; size?: ButtonSize; block?: boolean; icon?: React.ReactNode }
> = ({ variant = 'primary', size = 'md', block, icon, className, children, type = 'button', ...rest }) => (
  <button type={type} className={cx(buttonClass(variant as ButtonVariant, size as ButtonSize, block), className)} {...rest}>
    {icon}
    {children}
  </button>
);

export const ButtonLink: React.FC<
  Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, 'size'> & { variant?: ButtonVariant; size?: ButtonSize; block?: boolean; icon?: React.ReactNode }
> = ({ variant = 'primary', size = 'md', block, icon, className, children, ...rest }) => (
  <a className={cx(buttonClass(variant as ButtonVariant, size as ButtonSize, block), 'no-underline', className)} {...rest}>
    {icon}
    {children}
  </a>
);

export const IconButton: React.FC<
  React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string; variant?: 'secondary' | 'ghost' | 'primary' | 'danger' }
> = ({ label, variant = 'secondary', className, children, type = 'button', ...rest }) => (
  <button
    type={type}
    aria-label={tr(label)}
    title={tr(label)}
    className={cx(
      'inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition-colors cursor-pointer',
      BTN_VARIANTS[variant],
      className
    )}
    {...rest}
  >
    {children}
  </button>
);

/* ---------- Choice controls ---------- */

/** A pill that can be switched on and off (mood choices, filters). */
export const Chip: React.FC<
  React.ButtonHTMLAttributes<HTMLButtonElement> & { selected?: boolean; tone?: 'pri' | 'ink' }
> = ({ selected, tone = 'pri', className, children, type = 'button', ...rest }) => (
  <button
    type={type}
    aria-pressed={!!selected}
    className={cx(
      'inline-flex min-h-11 items-center gap-2 rounded-full border px-4 text-sm font-semibold transition-colors cursor-pointer',
      selected
        ? tone === 'pri'
          ? 'border-pri bg-pri text-[#fff]'
          : 'border-ink bg-ink text-surface'
        : 'border-line bg-surface text-ink hover:border-pri-text',
      className
    )}
    {...rest}
  >
    {children}
  </button>
);

/** Two to four options side by side, one selected (Faith / Science, Light / Dark). */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
  className,
}: {
  options: Array<{ value: T; label: React.ReactNode; icon?: React.ReactNode }>;
  value: T;
  onChange: (v: T) => void;
  label: string;
  className?: string;
}) {
  return (
    <div role="group" aria-label={tr(label)} className={cx('inline-flex flex-wrap gap-1 rounded-2xl bg-muted p-1', className)}>
      {options.map(o => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(o.value)}
            className={cx(
              'inline-flex min-h-11 items-center gap-2 rounded-xl px-4 text-sm font-bold transition-colors cursor-pointer',
              on ? 'bg-surface text-ink shadow-[0_1px_3px_rgba(15,35,26,0.12)]' : 'text-ink-2 hover:text-ink'
            )}
          >
            {o.icon}
            {tx(o.label)}
          </button>
        );
      })}
    </div>
  );
}

/** Underlined tabs for switching between parts of one page. */
export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
  label,
  className,
}: {
  tabs: Array<{ value: T; label: React.ReactNode; icon?: React.ReactNode; badge?: React.ReactNode }>;
  value: T;
  onChange: (v: T) => void;
  label: string;
  className?: string;
}) {
  return (
    <div role="tablist" aria-label={tr(label)} className={cx('no-scrollbar fade-x flex gap-1 overflow-x-auto border-b border-line', className)}>
      {tabs.map(t => {
        const on = t.value === value;
        return (
          <button
            key={t.value}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onChange(t.value)}
            className={cx(
              '-mb-px inline-flex min-h-12 shrink-0 items-center gap-2 border-b-[3px] px-4 text-base font-bold whitespace-nowrap transition-colors cursor-pointer',
              on ? 'border-pri text-pri-text' : 'border-transparent text-ink-3 hover:text-ink'
            )}
          >
            {t.icon}
            {tx(t.label)}
            {t.badge != null && (
              <span className={cx('rounded-full px-2 py-0.5 text-xs font-bold', on ? 'bg-pri-soft text-pri-ink' : 'bg-muted text-ink-2')}>
                {t.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/** A large selectable card (recovery focus, game picker, chat mode). */
export const ChoiceCard: React.FC<
  React.ButtonHTMLAttributes<HTMLButtonElement> & { selected?: boolean; icon?: React.ReactNode; title: React.ReactNode; description?: React.ReactNode }
> = ({ selected, icon, title, description, className, type = 'button', ...rest }) => (
  <button
    type={type}
    aria-pressed={!!selected}
    className={cx(
      'flex h-full flex-col items-start gap-2 rounded-2xl border-2 p-4 text-left transition-colors cursor-pointer',
      selected ? 'border-pri bg-pri-soft text-pri-ink' : 'border-line bg-surface text-ink hover:border-pri-text',
      className
    )}
    {...rest}
  >
    {icon}
    <span className="text-base font-bold">{tx(title)}</span>
    {description && <span className="text-sm leading-snug opacity-85">{tx(description)}</span>}
  </button>
);

/** Accessible on/off switch. */
export const Switch: React.FC<{ checked: boolean; onChange: (v: boolean) => void; label: string; description?: string; tone?: 'default' | 'night' }> = ({
  checked,
  onChange,
  label,
  description,
  tone = 'default',
}) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    onClick={() => onChange(!checked)}
    className={cx(
      'flex w-full min-h-13 items-center justify-between gap-4 rounded-xl px-4 py-3 text-left cursor-pointer',
      tone === 'night' ? 'border border-[rgba(255,255,255,0.18)] bg-[rgba(255,255,255,0.06)] text-[#fff]' : 'border border-line bg-surface text-ink'
    )}
  >
    <span>
      <span className="block text-base font-bold">{tr(label)}</span>
      {description && <span className={cx('block text-sm', tone === 'night' ? 'text-[#c2d6cb]' : 'text-ink-3')}>{tr(description)}</span>}
    </span>
    <span
      className={cx(
        'flex h-7 w-12 shrink-0 items-center rounded-full p-[3px] transition-colors',
        checked ? 'justify-end bg-pri' : tone === 'night' ? 'justify-start bg-[rgba(255,255,255,0.25)]' : 'justify-start bg-line'
      )}
    >
      <span className="h-[22px] w-[22px] rounded-full bg-[#ffffff] shadow" />
    </span>
  </button>
);

/* ---------- Form fields ---------- */

export const inputClass =
  'w-full min-h-12 rounded-xl border border-line bg-bg px-4 text-base text-ink transition-colors focus:border-pri-text focus:outline-none';

export const textareaClass =
  'w-full rounded-xl border border-line bg-bg px-4 py-3 text-base leading-relaxed text-ink transition-colors focus:border-pri-text focus:outline-none';

export const Field: React.FC<{
  label: React.ReactNode;
  hint?: React.ReactNode;
  htmlFor?: string;
  optional?: boolean;
  className?: string;
  children: React.ReactNode;
}> = ({ label, hint, htmlFor, optional, className, children }) => (
  <div className={cx('flex flex-col gap-1.5', className)}>
    <label htmlFor={htmlFor} className="text-sm font-bold text-ink">
      {tx(label)}
      {optional && <span className="ml-1 font-medium text-ink-3">{tr("(optional)")}</span>}
    </label>
    {children}
    {hint && <p className="text-sm text-ink-3">{tx(hint)}</p>}
  </div>
);

/* ---------- Display ---------- */

type Tone = 'pri' | 'warn' | 'danger' | 'info' | 'muted';

const TONE_SOFT: Record<Tone, string> = {
  pri: 'bg-pri-soft text-pri-ink',
  warn: 'bg-warn-soft text-warn',
  danger: 'bg-danger-soft text-danger-text',
  info: 'bg-info-soft text-info',
  muted: 'bg-muted text-ink-2',
};

export const Badge: React.FC<{ tone?: Tone; dot?: boolean; className?: string; children: React.ReactNode }> = ({
  tone = 'pri',
  dot,
  className,
  children,
}) => (
  <span className={cx('inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-bold', TONE_SOFT[tone], className)}>
    {dot && (
      <span
        className={cx(
          'h-2 w-2 rounded-full',
          tone === 'pri' ? 'bg-pri' : tone === 'warn' ? 'bg-warn-bar' : tone === 'danger' ? 'bg-danger' : tone === 'info' ? 'bg-info' : 'bg-ink-3'
        )}
      />
    )}
    {children}
  </span>
);

export const IconBadge: React.FC<{ tone?: Tone; size?: 'sm' | 'md' | 'lg'; className?: string; children: React.ReactNode }> = ({
  tone = 'pri',
  size = 'md',
  className,
  children,
}) => (
  <span
    className={cx(
      'inline-flex shrink-0 items-center justify-center',
      size === 'sm' ? 'h-8 w-8 rounded-lg' : size === 'md' ? 'h-10 w-10 rounded-lg' : 'h-12 w-12 rounded-xl',
      TONE_SOFT[tone],
      className
    )}
  >
    {children}
  </span>
);

export const ProgressBar: React.FC<{ value: number; tone?: 'pri' | 'warn' | 'danger'; label?: string; className?: string; thick?: boolean }> = ({
  value,
  tone = 'pri',
  label,
  className,
  thick,
}) => (
  <div
    role="progressbar"
    aria-valuemin={0}
    aria-valuemax={100}
    aria-valuenow={Math.round(value)}
    aria-label={label}
    className={cx('overflow-hidden rounded-full bg-muted', thick ? 'h-3' : 'h-2', className)}
  >
    <div
      className={cx('h-full rounded-full transition-[width] duration-500', tone === 'pri' ? 'bg-pri' : tone === 'warn' ? 'bg-warn-bar' : 'bg-danger')}
      style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
    />
  </div>
);

/** "Kwame Mensah" → KM, "ClearMind_24" → CM, "Dr. Ama Konadu" → AK */
export const initialsOf = (name?: string) => {
  const words = (name || '')
    .split(',')[0]
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .split(/[^A-Za-z]+/)
    .filter(w => w && !/^(dr|mr|mrs|ms|prof)$/i.test(w));
  return words.slice(0, 2).map(w => w[0]!.toUpperCase()).join('') || '?';
};

const AVATAR_TONES: Tone[] = ['pri', 'info', 'warn', 'danger'];

export const Avatar: React.FC<{ name?: string; src?: string; emoji?: string; size?: number; tone?: Tone; solid?: boolean; className?: string }> = ({
  name,
  src,
  emoji,
  size = 44,
  tone,
  solid,
  className,
}) => {
  const [imgFailed, setImgFailed] = React.useState(false);
  const auto = AVATAR_TONES[(name || '').length % AVATAR_TONES.length];
  const style = { width: size, height: size, fontSize: Math.round(size * 0.36) };
  if (src && !imgFailed) {
    return <img src={src} alt="" onError={() => setImgFailed(true)} className={cx('shrink-0 rounded-full bg-muted object-cover', className)} style={style} />;
  }
  return (
    <span
      aria-hidden="true"
      className={cx(
        'inline-flex shrink-0 items-center justify-center rounded-full font-bold',
        solid ? 'bg-pri text-[#fff]' : TONE_SOFT[tone || auto],
        className
      )}
      style={emoji ? { ...style, fontSize: Math.round(size * 0.5) } : style}
    >
      {emoji || initialsOf(name)}
    </span>
  );
};

/** A small confirmation or warning line shown after an action. */
export const Notice: React.FC<{ tone?: 'pri' | 'warn' | 'danger' | 'info'; icon?: React.ReactNode; className?: string; children: React.ReactNode }> = ({
  tone = 'pri',
  icon,
  className,
  children,
}) => (
  <div role="status" className={cx('flex items-start gap-3 rounded-xl px-4 py-3 text-base animate-fadeIn', TONE_SOFT[tone], className)}>
    {icon && <span className="mt-0.5 shrink-0">{icon}</span>}
    <div className="min-w-0 flex-1">{children}</div>
  </div>
);

/* ---------- Modal ---------- */

export const Modal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  size?: 'sm' | 'md' | 'lg';
  tone?: 'default' | 'danger';
  footer?: React.ReactNode;
  hideTitle?: boolean;
  children: React.ReactNode;
}> = ({ isOpen, onClose, title, subtitle, size = 'md', footer, hideTitle, children }) => {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const pressedBackdrop = useRef(false);
  // Most callers pass a new onClose on every render. Reading it from a ref means a parent
  // re-render doesn't release the page lock or pull focus back to the panel.
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeRef.current();
    };
    document.addEventListener('keydown', onKey);
    const unlock = lockPage();
    panelRef.current?.focus({ preventScroll: true });
    return () => {
      document.removeEventListener('keydown', onKey);
      unlock();
    };
  }, [isOpen]);

  if (!isOpen) return null;

  // Rendered at the end of <body> so it always sits above the page and the mobile bottom bar
  return createPortal(
    <div
      className="modal-overlay fixed inset-0 z-[70] flex items-end justify-center bg-[rgba(2,20,14,0.5)] p-0 backdrop-blur-sm sm:items-center sm:p-6 animate-fadeIn"
      onPointerDown={e => {
        pressedBackdrop.current = e.target === e.currentTarget;
      }}
      // Closes on the click, not the press: closing on the press removes the backdrop mid-tap,
      // and the rest of the tap lands on whatever is underneath it
      onClick={e => {
        if (e.target === e.currentTarget && pressedBackdrop.current) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={cx(
          'modal-panel relative flex w-full min-w-0 flex-col overflow-hidden rounded-t-3xl border border-line bg-surface text-ink shadow-pop outline-none sm:rounded-3xl',
          size === 'sm' ? 'sm:max-w-md' : size === 'md' ? 'sm:max-w-lg' : 'sm:max-w-3xl'
        )}
      >
        {/* grab handle on phones, like an iOS sheet */}
        <span className="mx-auto mt-2.5 block h-1.5 w-10 rounded-full bg-line sm:hidden" aria-hidden="true" />
        <div className={cx('flex shrink-0 items-start justify-between gap-4 px-6 pt-5 sm:pt-6', hideTitle ? 'pb-0' : 'pb-4')}>
          <div className={cx('min-w-0', hideTitle && 'sr-only')}>
            <h2 id={titleId} className="m-0 text-xl font-bold leading-snug text-ink">
              {tx(title)}
            </h2>
            {subtitle && <p className="mt-1 text-base text-ink-3">{tx(subtitle)}</p>}
          </div>
          <IconButton label={tr("Close")} variant="ghost" onClick={onClose} className="-mr-2 -mt-2 ml-auto">
            <X className="h-5 w-5" />
          </IconButton>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]">{children}</div>
        {footer && (
          <div className="flex flex-wrap items-center justify-end gap-3 border-t border-line px-6 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">{footer}</div>
        )}
      </div>
    </div>,
    document.body
  );
};
