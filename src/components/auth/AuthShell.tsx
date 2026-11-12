/**
 * The sign-in / sign-up screen layout, for students and therapists:
 *  - a softly moving colour background,
 *  - one split card: the form (with the 4Life logo centred at the top) and, on a computer,
 *    a side panel of flat illustrations with no words,
 *  - no visible page title (it stays for screen readers), so the form fits the screen,
 *  - the emergency numbers (112, ambulance 193) in the fine print.
 * Everything uses the Universal Color System.
 */
import React from 'react';
import { GraduationCap, Leaf, Stethoscope } from 'lucide-react';
import { cx } from '../ui';
import { LivingBackground } from '../LivingBackground';
import { LoginArt } from './LoginArt';
import { PRIVACY_PATH } from '../privacy/PrivacyLink';

import { t, T, msg } from '../../i18n';
export type AuthRole = 'client' | 'therapist';

/** The 4Life logo and name, centred at the top of the form */
const Brand: React.FC = () => (
  <div className="flex items-center justify-center gap-3">
    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-pri text-[#fff] shadow-[0_8px_20px_-10px_rgba(4,120,87,0.7)]" aria-hidden="true">
      <Leaf className="h-6 w-6" />
    </span>
    <span className="text-[1.625rem] font-extrabold leading-none tracking-tight text-ink" translate="no">
      4Life
    </span>
  </div>
);

/** Privacy and emergency numbers */
const FinePrint: React.FC = () => (
  <>
    <span translate="no">4Life</span> <T text="· <0>Privacy Policy</0> · In danger? No account needed: <1>Call 112</1> · <2>Ambulance 193</2>" parts={[<a href={PRIVACY_PATH} target="_blank" rel="noopener" className="inline-flex min-h-11 items-center px-1 font-semibold text-pri-text underline" />, <a href="tel:112" className="inline-flex min-h-11 items-center px-1 font-bold text-danger-text underline" />, <a href="tel:193" className="inline-flex min-h-11 items-center px-1 font-bold text-danger-text underline" />]} />
  </>
);

/** The side panel on a computer: the illustrations (no words) and the fine print */
const SidePanel: React.FC = () => (
  <aside aria-label={t("Illustrations")} className="relative order-2 hidden min-w-0 flex-col bg-pri-soft/35 lg:m-3 lg:flex lg:rounded-2xl lg:px-7 lg:pb-5 lg:pt-6">
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
  language: string;
  onChangeLanguage: (code: string) => void;
  title: string;
  subtitle: string;
  children: React.ReactNode;
}

export const AuthShell: React.FC<AuthShellProps> = ({ role, onRoleChange, isDark, language, onChangeLanguage, title, subtitle, children }) => {
  return (
  <div className="relative min-h-screen overflow-hidden bg-bg">
    {/* Living background: a 3D helix that follows the pointer; drag or tap it */}
    <LivingBackground isDark={isDark} />

    <div className="pointer-events-none relative mx-auto flex min-h-screen max-w-6xl flex-col gap-4 px-3 py-3 min-[360px]:px-4 min-[360px]:py-4 sm:px-6 sm:py-8 lg:h-[100dvh] lg:min-h-0 lg:py-3">
      <main className="pointer-events-auto grid flex-1 grid-cols-1 overflow-hidden lg:min-h-0 rounded-3xl border border-line bg-surface lg:bg-surface/80 lg:backdrop-blur-2xl shadow-[0_30px_80px_-30px_rgba(2,44,34,0.45)] lg:grid-cols-[minmax(0,1fr)_minmax(0,0.95fr)]">
        {/* ---------- Form side ---------- */}
        <section className="auth-form order-1 flex min-w-0 flex-col gap-6 p-4 min-[360px]:p-5 sm:p-10 lg:min-h-0 lg:overflow-y-auto lg:gap-4 lg:px-10 lg:py-5" aria-labelledby="auth-title">
          {/* The logo, centred */}
          <div className="pb-1 pt-1 lg:pb-2">
            <Brand />
          </div>

          {/* On phones and tablets the illustrations sit under the logo */}
          <div className="relative -mb-2 lg:hidden">
            <div className="mx-auto w-full max-w-[17rem] sm:max-w-[21rem]">
              <LoginArt compact />
            </div>
          </div>

          {/* Who is signing in */}
          {onRoleChange && (
            <div role="radiogroup" aria-label={t("I am a")} className="grid grid-cols-2 gap-1.5 rounded-2xl bg-muted p-1.5">
              {[
                { id: 'client' as const, label: msg('Student'), sub: msg('I want support'), icon: <GraduationCap className="h-5 w-5" aria-hidden="true" /> },
                { id: 'therapist' as const, label: msg('Therapist'), sub: msg('I give support'), icon: <Stethoscope className="h-5 w-5" aria-hidden="true" /> },
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
                      'flex min-h-14 min-w-0 flex-wrap items-center justify-center gap-1.5 rounded-xl px-1.5 py-1 text-left transition-all lg:min-h-12 cursor-pointer min-[390px]:gap-2.5 min-[390px]:px-3',
                      on ? 'bg-surface text-ink shadow-card ring-1 ring-line' : 'text-ink-2 hover:text-ink'
                    )}
                  >
                    <span className={cx('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg min-[390px]:h-9 min-[390px]:w-9', on ? 'bg-pri text-[#fff]' : 'bg-surface text-ink-3')}>{o.icon}</span>
                    <span className="min-w-0">
                      <span className="block text-[0.9375rem] font-bold leading-tight">{t(o.label)}</span>
                      <span className="hidden text-xs text-ink-3 sm:block">{t(o.sub)}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {/* The page title stays for screen readers only, so the form starts higher up */}
          <div className="sr-only">
            <h1 id="auth-title">{t(title)}</h1>
            <p>{t(subtitle)}</p>
          </div>

          <div key={role} className="animate-fadeIn">
            {children}
          </div>
        </section>

        {/* ---------- Illustrations (no words) ---------- */}
        <SidePanel />
      </main>

      <footer className="flex flex-col items-center gap-1 text-center text-sm text-ink-3 lg:hidden">
        <span className="pointer-events-auto rounded-2xl bg-bg/70 px-3 py-1 backdrop-blur-sm">
          <FinePrint />
        </span>
      </footer>
    </div>
  </div>
  );
};
