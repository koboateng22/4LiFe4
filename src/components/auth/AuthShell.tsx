/**
 * The sign-in / sign-up screen layout, for students and therapists:
 *  - a softly moving colour background,
 *  - one split card: the form (with the 4Life logo centred at the top) and, on a computer,
 *    a side panel of flat illustrations with no words,
 *  - the light / dark theme button in the top-right corner of the illustrations,
 *  - no visible page title (it stays for screen readers), so the form fits the screen,
 *  - the emergency numbers (112, ambulance 193) in the fine print.
 * Everything uses the Universal Color System.
 */
import React from 'react';
import { GraduationCap, Leaf, Moon, Stethoscope, Sun } from 'lucide-react';
import { cx } from '../ui';
import { LivingBackground } from '../LivingBackground';
import { LoginArt } from './LoginArt';

export type AuthRole = 'client' | 'therapist';

/** The 4Life logo and name, centred at the top of the form */
const Brand: React.FC = () => (
  <div className="flex items-center justify-center gap-3">
    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-pri text-[#fff] shadow-[0_8px_20px_-10px_rgba(4,120,87,0.7)]" aria-hidden="true">
      <Leaf className="h-6 w-6" />
    </span>
    <span className="text-[1.625rem] font-extrabold leading-none tracking-tight text-ink" translate="no">
      4Life
    </span>
  </div>
);

/** Light / dark theme button (sits in the top-right corner of the illustrations) */
const ThemeButton: React.FC<{ isDark: boolean; onToggleTheme: () => void; className?: string }> = ({ isDark, onToggleTheme, className }) => (
  <button
    type="button"
    onClick={onToggleTheme}
    aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
    title={isDark ? 'Light theme' : 'Dark theme'}
    className={cx('glass-btn flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border text-pri-text cursor-pointer', className)}
  >
    {isDark ? <Sun className="h-5 w-5 text-[#f59e0b]" /> : <Moon className="h-5 w-5" />}
  </button>
);

/** Privacy and emergency numbers */
const FinePrint: React.FC = () => (
  <>
    <span translate="no">4Life</span> · Private and confidential · In danger? No account needed:{' '}
    <a href="tel:112" className="inline-flex min-h-11 items-center px-1 font-bold text-danger-text underline">
      Call 112
    </a>{' '}
    ·{' '}
    <a href="tel:193" className="inline-flex min-h-11 items-center px-1 font-bold text-danger-text underline">
      Ambulance 193
    </a>
  </>
);

/** The side panel on a computer: the illustrations (no words), the theme button and the fine print */
const SidePanel: React.FC<{ isDark: boolean; onToggleTheme: () => void }> = ({ isDark, onToggleTheme }) => (
  <aside aria-label="Illustrations" className="relative order-2 hidden min-w-0 flex-col bg-pri-soft/35 lg:m-3 lg:flex lg:rounded-[22px] lg:px-7 lg:pb-5 lg:pt-6">
    <ThemeButton isDark={isDark} onToggleTheme={onToggleTheme} className="absolute right-4 top-4 z-10" />
    <div className="flex min-h-0 flex-1 items-center justify-center py-4">
      <LoginArt className="w-full max-w-[32rem]" />
    </div>
    <p className="m-0 text-center text-sm text-ink-3">
      <FinePrint />
    </p>
  </aside>
);

/* ------------------------------------------------------------------ */

interface AuthShellProps {
  role: AuthRole;
  onRoleChange?: (r: AuthRole) => void;
  isDark: boolean;
  onToggleTheme: () => void;
  language: string;
  onChangeLanguage: (code: string) => void;
  title: string;
  subtitle: string;
  children: React.ReactNode;
}

export const AuthShell: React.FC<AuthShellProps> = ({ role, onRoleChange, isDark, onToggleTheme, language, onChangeLanguage, title, subtitle, children }) => {
  return (
  <div className="relative min-h-screen overflow-hidden bg-bg">
    {/* Living background: a 3D helix that follows the pointer; drag or tap it */}
    <LivingBackground isDark={isDark} />

    <div className="pointer-events-none relative mx-auto flex min-h-screen max-w-6xl flex-col gap-4 px-4 py-4 sm:px-6 sm:py-8 lg:h-[100dvh] lg:min-h-0 lg:py-3">
      <main className="pointer-events-auto grid flex-1 grid-cols-1 overflow-hidden lg:min-h-0 rounded-[28px] border border-line bg-surface lg:bg-surface/80 lg:backdrop-blur-2xl shadow-[0_30px_80px_-30px_rgba(2,44,34,0.45)] lg:grid-cols-[minmax(0,1fr)_minmax(0,0.95fr)]">
        {/* ---------- Form side ---------- */}
        <section className="auth-form order-1 flex min-w-0 flex-col gap-6 p-5 sm:p-10 lg:min-h-0 lg:overflow-y-auto lg:gap-4 lg:px-10 lg:py-5" aria-labelledby="auth-title">
          {/* The logo, centred */}
          <div className="pb-1 pt-1 lg:pb-2">
            <Brand />
          </div>

          {/* On phones and tablets the illustrations sit under the logo, with the theme button in their corner */}
          <div className="relative -mb-2 lg:hidden">
            <ThemeButton isDark={isDark} onToggleTheme={onToggleTheme} className="absolute right-0 top-0 z-10" />
            <div className="mx-auto w-full max-w-[17rem] sm:max-w-[21rem]">
              <LoginArt compact />
            </div>
          </div>

          {/* Who is signing in */}
          {onRoleChange && (
            <div role="radiogroup" aria-label="I am a" className="grid grid-cols-2 gap-1.5 rounded-2xl bg-muted p-1.5">
              {[
                { id: 'client' as const, label: 'Student', sub: 'I want support', icon: <GraduationCap className="h-5 w-5" aria-hidden="true" /> },
                { id: 'therapist' as const, label: 'Therapist', sub: 'I give support', icon: <Stethoscope className="h-5 w-5" aria-hidden="true" /> },
              ].map(o => {
                const on = role === o.id;
                return (
                  <button
                    key={o.id}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => onRoleChange(o.id)}
                    className={cx(
                      'flex min-h-14 items-center justify-center gap-2.5 rounded-xl px-3 text-left transition-all lg:min-h-12 cursor-pointer',
                      on ? 'bg-surface text-ink shadow-card ring-1 ring-line' : 'text-ink-2 hover:text-ink'
                    )}
                  >
                    <span className={cx('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', on ? 'bg-pri text-[#fff]' : 'bg-surface text-ink-3')}>{o.icon}</span>
                    <span className="min-w-0">
                      <span className="block text-[0.9375rem] font-bold leading-tight">{o.label}</span>
                      <span className="hidden text-xs text-ink-3 sm:block">{o.sub}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {/* The page title stays for screen readers only, so the form starts higher up */}
          <div className="sr-only">
            <h1 id="auth-title">{title}</h1>
            <p>{subtitle}</p>
          </div>

          <div key={role} className="animate-fadeIn">
            {children}
          </div>
        </section>

        {/* ---------- Illustrations (no words) ---------- */}
        <SidePanel isDark={isDark} onToggleTheme={onToggleTheme} />
      </main>

      <footer className="flex flex-col items-center gap-1 text-center text-sm text-ink-3 lg:hidden">
        <span className="pointer-events-auto rounded-full bg-bg/70 px-3 py-1 backdrop-blur-sm">
          <FinePrint />
        </span>
      </footer>
    </div>
  </div>
  );
};
