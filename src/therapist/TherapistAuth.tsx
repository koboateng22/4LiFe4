import React, { useState } from 'react';
import { AlertCircle, ArrowLeft, ArrowRight, Check, Eye, EyeOff, KeyRound, ShieldCheck, UserPlus } from 'lucide-react';
import { Field, Switch, cx, inputClass, textareaClass } from '../components/ui';
import type { Profession, SessionFormat, TherapistProfile, Weekday } from './types';
import { friendlyError, isRemote } from '../lib/supabase';
import { signIn, signOut } from '../lib/db/clientApi';
import { loadTherapistProfile, signUpTherapist } from '../lib/db/therapistApi';
import { ResendConfirmation, needsNewLink } from '../components/auth/ResendConfirmation';

/** With Supabase, accounts use a password; on this device only, a short PIN. */
const SECRET = isRemote ? 'password' : 'PIN';
const MIN_SECRET = isRemote ? 8 : 4;
import {
  APPROACHES,
  DEMO_THERAPIST,
  FOCUS_OPTIONS,
  FORMAT_LABEL,
  LANGUAGES,
  LICENSE_BODIES,
  PROFESSIONS,
  WEEKDAYS,
  displayName,
  getTherapistAccounts,
  saveTherapistAccount,
} from './data';

const REGIONS = [
  'Greater Accra', 'Ashanti', 'Western', 'Central', 'Eastern', 'Volta', 'Northern', 'Upper East', 'Upper West',
  'Bono', 'Bono East', 'Ahafo', 'Western North', 'Oti', 'Savannah', 'North East', 'Outside Ghana',
];

const STEPS = [
  { n: 1, short: 'Account', title: 'Your account' },
  { n: 2, short: 'Licence', title: 'Your qualifications' },
  { n: 3, short: 'Practice', title: 'Who you help and how' },
  { n: 4, short: 'Sessions', title: 'Sessions and availability' },
  { n: 5, short: 'Profile', title: 'Your profile and agreement' },
] as const;

type Step = 1 | 2 | 3 | 4 | 5;

/** A pill that toggles one value in a list (focus areas, languages, days…). */
const Toggle: React.FC<{ on: boolean; onClick: () => void; children: React.ReactNode }> = ({ on, onClick, children }) => (
  <button
    type="button"
    aria-pressed={on}
    onClick={onClick}
    className={cx(
      'inline-flex min-h-11 items-center gap-1.5 rounded-full border-2 px-4 text-[0.9375rem] font-semibold transition-colors cursor-pointer',
      on ? 'border-pri bg-pri-soft text-pri-ink' : 'border-line bg-surface text-ink hover:border-pri-text'
    )}
  >
    {on && <Check className="h-4 w-4" aria-hidden="true" />}
    {children}
  </button>
);

const toggleIn = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter(x => x !== v) : [...list, v]);

/**
 * Sign in and sign up for therapists.
 * Sign-up is five short steps; a new account starts as "verification pending".
 */
export const TherapistAuth: React.FC<{ onLogin: (t: TherapistProfile) => void; onForgotPassword?: (email: string) => void }> = ({ onLogin, onForgotPassword }) => {
  const [mode, setMode] = useState<'login' | 'signup'>('login');

  /* ----- sign in ----- */
  const [email, setEmail] = useState('');
  const [pin, setPin] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [loginError, setLoginError] = useState('');

  const [busy, setBusy] = useState(false);
  const [confirmSent, setConfirmSent] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isRemote) {
      setBusy(true);
      setLoginError('');
      try {
        const user = await signIn(email, pin.trim());
        if (user.role !== 'therapist') {
          await signOut();
          setLoginError('This is not a therapist account. Choose “I want support” above to sign in.');
          return;
        }
        onLogin(await loadTherapistProfile(user.id));
      } catch (err) {
        setLoginError(friendlyError(err));
      } finally {
        setBusy(false);
      }
      return;
    }
    const found = getTherapistAccounts().find(a => a.email.toLowerCase() === email.trim().toLowerCase());
    if (!found || found.pin !== pin.trim()) {
      setLoginError('That email and PIN do not match a therapist account. Check them, or try the demo account below.');
      return;
    }
    onLogin(found);
  };

  /* ----- sign up ----- */
  const [step, setStep] = useState<Step>(1);
  const [error, setError] = useState('');
  const [f, setF] = useState({
    title: 'Dr.',
    name: '',
    email: '',
    pin: '',
    pin2: '',
    profession: '' as Profession | '',
    licenseBody: LICENSE_BODIES[0],
    licenseNumber: '',
    yearsExperience: '',
    specialties: [] as string[],
    approaches: [] as string[],
    languages: ['English'] as string[],
    formats: ['video', 'voice'] as SessionFormat[],
    days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'] as Weekday[],
    startTime: '09:00',
    endTime: '17:00',
    sessionLength: 50,
    feeGHS: '35',
    slidingScale: true,
    region: 'Greater Accra',
    practiceLocation: '',
    bio: '',
    acceptingClients: true,
    agreeConfidential: false,
    agreeCrisis: false,
    agreeAccurate: false,
  });
  const set = (patch: Partial<typeof f>) => setF(prev => ({ ...prev, ...patch }));

  const stepError = (s: Step): string => {
    if (s === 1) {
      if (!f.name.trim()) return 'Please enter your full name as it appears on your licence.';
      if (!f.email.includes('@')) return 'Please enter a valid work email address.';
      if (!isRemote && getTherapistAccounts().some(a => a.email.toLowerCase() === f.email.trim().toLowerCase())) return 'A therapist account with this email already exists. Please sign in instead.';
      if (f.pin.trim().length < MIN_SECRET) return isRemote ? 'Your password needs at least 8 characters.' : 'Your PIN needs at least 4 digits.';
      if (f.pin.trim() !== f.pin2.trim()) return `The two ${SECRET}s do not match.`;
    }
    if (s === 2) {
      if (!f.profession) return 'Please choose your profession.';
      if (!f.licenseNumber.trim()) return 'Please enter your licence or registration number. We need it to verify you.';
    }
    if (s === 3) {
      if (!f.specialties.length) return 'Choose at least one area you help with.';
      if (!f.languages.length) return 'Choose at least one language you can hold sessions in.';
    }
    if (s === 4) {
      if (!f.formats.length) return 'Choose at least one way to meet clients.';
      if (!f.days.length) return 'Choose at least one day you are available.';
      if (f.startTime >= f.endTime) return 'Your finishing time must be after your starting time.';
      if (f.formats.includes('in_person') && !f.practiceLocation.trim()) return 'Please add where you see clients in person.';
    }
    if (s === 5) {
      if (f.bio.trim().length < 20) return 'Please write a short introduction (at least a sentence) so clients know who you are.';
      if (!f.agreeConfidential || !f.agreeCrisis || !f.agreeAccurate) return 'Please tick all three agreements to finish.';
    }
    return '';
  };

  const go = (s: Step) => {
    setError('');
    setStep(s);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    const err = stepError(step);
    if (err) {
      setError(err);
      return;
    }
    if (step < 5) {
      go((step + 1) as Step);
      return;
    }
    const t: TherapistProfile = {
      id: 'th_' + Date.now(),
      email: f.email.trim().toLowerCase(),
      pin: f.pin.trim(),
      title: f.title,
      name: f.name.trim(),
      profession: f.profession as Profession,
      licenseBody: f.licenseBody,
      licenseNumber: f.licenseNumber.trim(),
      yearsExperience: Number(f.yearsExperience) || 0,
      verification: 'pending',
      specialties: f.specialties,
      approaches: f.approaches,
      languages: f.languages,
      formats: f.formats,
      region: f.region,
      practiceLocation: f.practiceLocation.trim(),
      days: WEEKDAYS.filter(d => f.days.includes(d)),
      startTime: f.startTime,
      endTime: f.endTime,
      sessionLength: f.sessionLength,
      feeGHS: Number(f.feeGHS) || 0,
      slidingScale: f.slidingScale,
      acceptingClients: f.acceptingClients,
      bio: f.bio.trim(),
      createdAt: new Date().toISOString().split('T')[0],
    };
    if (isRemote) {
      setBusy(true);
      try {
        const { userId, needsConfirmation } = await signUpTherapist(t.email, f.pin.trim(), t);
        if (needsConfirmation || !userId) {
          setConfirmSent(t.email);
          return;
        }
        onLogin(await loadTherapistProfile(userId));
      } catch (err) {
        setError(friendlyError(err));
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } finally {
        setBusy(false);
      }
      return;
    }
    saveTherapistAccount(t);
    onLogin(t);
  };

  if (confirmSent) {
    return (
      <div className="flex flex-col items-center gap-4 rounded-2xl bg-pri-soft p-6 text-center text-pri-ink" role="status">
        <Check className="h-8 w-8" aria-hidden="true" />
        <p className="m-0 text-lg font-bold">Check your email</p>
        <p className="m-0 text-[0.9375rem] leading-relaxed">
          We sent a link to <strong>{confirmSent}</strong>. Open it to confirm your account, then sign in here. We will check your licence while you get set up.
        </p>
        <button
          type="button"
          className="min-h-11 rounded-xl bg-pri px-5 font-bold text-[#fff] hover:bg-pri-hover cursor-pointer"
          onClick={() => {
            setConfirmSent('');
            setMode('login');
            setEmail(f.email);
          }}
        >
          Go to sign in
        </button>
      </div>
    );
  }

  const current = STEPS[step - 1];

  return (
    <div className="flex flex-col gap-6 lg:gap-4">
      {/* Sign in / Join */}
      <div role="tablist" aria-label="Therapist account" className="grid grid-cols-2 gap-1 rounded-2xl bg-muted p-1">
        {[
          { id: 'login' as const, label: 'Sign in', icon: <KeyRound className="h-4 w-4" /> },
          { id: 'signup' as const, label: 'Join', icon: <UserPlus className="h-4 w-4" /> },
        ].map(t => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={mode === t.id}
            onClick={() => {
              setMode(t.id);
              setError('');
              setLoginError('');
            }}
            className={cx(
              'flex min-h-11 items-center justify-center gap-2 rounded-xl text-[0.9375rem] font-bold cursor-pointer',
              mode === t.id ? 'bg-pri text-[#fff]' : 'text-ink-2 hover:text-ink'
            )}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {mode === 'login' ? (
        <form onSubmit={handleLogin} className="flex flex-col gap-5 lg:gap-4" noValidate>
          {loginError && <ErrorBox>{loginError}</ErrorBox>}
          {isRemote && needsNewLink(loginError) && <ResendConfirmation email={email} />}
          <Field label="Work email" htmlFor="th-email">
            <input id="th-email" type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="e.g. ama@clinic.org" className={inputClass} />
          </Field>
          <Field label={isRemote ? 'Password' : 'PIN'} htmlFor="th-pin">
            <div className="relative">
              <input
                id="th-pin"
                type={showPin ? 'text' : 'password'}
                inputMode={isRemote ? undefined : 'numeric'}
                autoComplete="current-password"
                value={pin}
                onChange={e => setPin(e.target.value)}
                placeholder={isRemote ? 'Your password' : 'Your PIN'}
                className={cx(inputClass, 'pr-12')}
              />
              <button
                type="button"
                onClick={() => setShowPin(!showPin)}
                aria-label={showPin ? `Hide ${SECRET}` : `Show ${SECRET}`}
                className="absolute right-1 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-lg text-ink-3 hover:text-ink cursor-pointer"
              >
                {showPin ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
              </button>
            </div>
            {isRemote && onForgotPassword && (
              <button type="button" onClick={() => onForgotPassword(email)} className="min-h-10 self-start text-sm font-semibold text-pri-text hover:underline cursor-pointer">
                Forgot password?
              </button>
            )}
          </Field>
          <button type="submit" disabled={busy} className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-pri text-base font-bold text-[#fff] hover:bg-pri-hover disabled:opacity-60 cursor-pointer">
            {busy ? 'Signing in…' : 'Sign in'} <ArrowRight className="h-5 w-5" aria-hidden="true" />
          </button>

          {!isRemote && (
          <div className="flex flex-col gap-2.5 border-t border-line pt-5">
            <p className="m-0 text-center text-sm font-semibold text-ink-3">Try the demo therapist</p>
            <button
              type="button"
              onClick={() => onLogin(DEMO_THERAPIST)}
              className="flex items-center justify-between gap-3 rounded-xl border border-line bg-bg px-4 py-3 text-left hover:border-pri-text cursor-pointer"
            >
              <span className="min-w-0">
                <span className="block text-[0.9375rem] font-bold text-ink">{displayName(DEMO_THERAPIST)}</span>
                <span className="block text-sm text-ink-3">{DEMO_THERAPIST.profession} · 6 clients</span>
              </span>
              <span className="shrink-0 rounded-md bg-pri-soft px-2 py-1 text-sm font-bold text-pri-ink">PIN: 1234</span>
            </button>
          </div>
          )}
        </form>
      ) : (
        <form onSubmit={handleSignup} className="flex flex-col gap-6 lg:gap-4" noValidate>
          {/* Progress */}
          <div className="flex flex-col gap-3 lg:gap-2">
            <ol className="m-0 grid list-none grid-cols-5 gap-1.5 p-0" aria-label="Sign-up steps">
              {STEPS.map(st => {
                const done = st.n < step;
                const active = st.n === step;
                return (
                  <li key={st.n} className="flex flex-col gap-2">
                    <span className={cx('h-1.5 rounded-full', done || active ? 'bg-pri' : 'bg-muted')} aria-hidden="true" />
                    <button
                      type="button"
                      disabled={!done}
                      onClick={() => go(st.n)}
                      aria-current={active ? 'step' : undefined}
                      className={cx(
                        'hidden items-center gap-1 text-left text-xs font-bold sm:flex',
                        active ? 'text-ink' : done ? 'text-pri-text hover:underline cursor-pointer' : 'text-ink-3'
                      )}
                    >
                      {done && <Check className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
                      <span className="truncate">{st.short}</span>
                    </button>
                  </li>
                );
              })}
            </ol>
            <div>
              <p className="m-0 text-sm font-semibold text-ink-3 lg:hidden">Step {step} of 5</p>
              <h3 className="m-0 text-xl font-bold text-ink">{current.title}</h3>
            </div>
          </div>

          {error && <ErrorBox>{error}</ErrorBox>}

          {step === 1 && (
            <div key="t1" className="flex flex-col gap-5 animate-fadeIn lg:gap-4">
              <fieldset className="m-0 border-0 p-0">
                <legend className="mb-2 p-0 text-sm font-bold text-ink">Title</legend>
                <div className="flex flex-wrap gap-2">
                  {['Dr.', 'Mr.', 'Ms.', 'Mrs.', ''].map(tt => (
                    <Toggle key={tt || 'none'} on={f.title === tt} onClick={() => set({ title: tt })}>
                      {tt || 'No title'}
                    </Toggle>
                  ))}
                </div>
              </fieldset>
              <Field label="Full name" htmlFor="ts-name" hint="As it appears on your licence. Clients see this name.">
                <input id="ts-name" autoFocus value={f.name} onChange={e => set({ name: e.target.value })} placeholder="e.g. Ama Konadu" className={inputClass} autoComplete="name" />
              </Field>
              <Field label="Work email" htmlFor="ts-email" hint="Used to sign in and for verification. Not shown to clients.">
                <input id="ts-email" type="email" value={f.email} onChange={e => set({ email: e.target.value })} placeholder="e.g. ama@clinic.org" className={inputClass} autoComplete="email" />
              </Field>
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                <Field label={`Choose a ${SECRET}`} htmlFor="ts-pin" hint={isRemote ? 'At least 8 characters.' : 'At least 4 digits.'}>
                  <input id="ts-pin" type="password" inputMode={isRemote ? undefined : 'numeric'} value={f.pin} onChange={e => set({ pin: e.target.value })} className={inputClass} autoComplete="new-password" maxLength={isRemote ? 72 : 10} />
                </Field>
                <Field label="Type it again" htmlFor="ts-pin2">
                  <input id="ts-pin2" type="password" inputMode={isRemote ? undefined : 'numeric'} value={f.pin2} onChange={e => set({ pin2: e.target.value })} className={inputClass} autoComplete="new-password" maxLength={isRemote ? 72 : 10} />
                </Field>
              </div>
            </div>
          )}

          {step === 2 && (
            <div key="t2" className="flex flex-col gap-5 animate-fadeIn lg:gap-4">
              <fieldset className="m-0 border-0 p-0">
                <legend className="mb-2 p-0 text-sm font-bold text-ink">Profession</legend>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {PROFESSIONS.map(p => (
                    <button
                      key={p}
                      type="button"
                      aria-pressed={f.profession === p}
                      onClick={() => set({ profession: p })}
                      className={cx(
                        'flex min-h-12 items-center justify-between gap-2 rounded-xl border-2 px-4 text-left text-[0.9375rem] font-semibold cursor-pointer',
                        f.profession === p ? 'border-pri bg-pri-soft text-pri-ink' : 'border-line bg-surface text-ink hover:border-pri-text'
                      )}
                    >
                      {p}
                      {f.profession === p && <Check className="h-4 w-4 shrink-0" aria-hidden="true" />}
                    </button>
                  ))}
                </div>
              </fieldset>
              <Field label="Licensing or registration body" htmlFor="ts-body">
                <select id="ts-body" value={f.licenseBody} onChange={e => set({ licenseBody: e.target.value })} className={inputClass}>
                  {LICENSE_BODIES.map(b => (
                    <option key={b}>{b}</option>
                  ))}
                </select>
              </Field>
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-[2fr_1fr]">
                <Field label="Licence or registration number" htmlFor="ts-lic">
                  <input id="ts-lic" value={f.licenseNumber} onChange={e => set({ licenseNumber: e.target.value })} placeholder="e.g. GPC-CP-0412" className={inputClass} />
                </Field>
                <Field label="Years in practice" htmlFor="ts-years">
                  <input id="ts-years" type="number" min={0} max={60} value={f.yearsExperience} onChange={e => set({ yearsExperience: e.target.value })} className={inputClass} />
                </Field>
              </div>
              <div className="flex items-start gap-3 rounded-xl bg-info-soft px-4 py-3 text-[0.9375rem] text-info">
                <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
                <p className="m-0 leading-relaxed">
                  We check every licence before clients can book you. You can set up your account and practise with the tools while you wait.
                </p>
              </div>
            </div>
          )}

          {step === 3 && (
            <div key="t3" className="flex flex-col gap-6 animate-fadeIn lg:gap-4">
              <fieldset className="m-0 border-0 p-0">
                <legend className="mb-1 p-0 text-sm font-bold text-ink">Areas you help with</legend>
                <p className="m-0 mb-2.5 text-sm text-ink-3">Clients are matched to you by these.</p>
                <div className="flex flex-wrap gap-2">
                  {FOCUS_OPTIONS.map(o => (
                    <Toggle key={o.id} on={f.specialties.includes(o.id)} onClick={() => set({ specialties: toggleIn(f.specialties, o.id) })}>
                      {o.label}
                    </Toggle>
                  ))}
                </div>
              </fieldset>
              <fieldset className="m-0 border-0 p-0">
                <legend className="mb-1 p-0 text-sm font-bold text-ink">
                  How you work <span className="font-medium text-ink-3">(optional)</span>
                </legend>
                <p className="m-0 mb-2.5 text-sm text-ink-3">Shown on your profile so clients know what to expect.</p>
                <div className="flex flex-wrap gap-2">
                  {APPROACHES.map(a => (
                    <Toggle key={a} on={f.approaches.includes(a)} onClick={() => set({ approaches: toggleIn(f.approaches, a) })}>
                      {a}
                    </Toggle>
                  ))}
                </div>
              </fieldset>
              <fieldset className="m-0 border-0 p-0">
                <legend className="mb-2.5 p-0 text-sm font-bold text-ink">Languages you hold sessions in</legend>
                <div className="flex flex-wrap gap-2">
                  {LANGUAGES.map(l => (
                    <Toggle key={l} on={f.languages.includes(l)} onClick={() => set({ languages: toggleIn(f.languages, l) })}>
                      <span translate="no">{l}</span>
                    </Toggle>
                  ))}
                </div>
              </fieldset>
            </div>
          )}

          {step === 4 && (
            <div key="t4" className="flex flex-col gap-6 animate-fadeIn lg:gap-4">
              <fieldset className="m-0 border-0 p-0">
                <legend className="mb-2.5 p-0 text-sm font-bold text-ink">How you meet clients</legend>
                <div className="flex flex-wrap gap-2">
                  {(Object.keys(FORMAT_LABEL) as SessionFormat[]).map(fm => (
                    <Toggle key={fm} on={f.formats.includes(fm)} onClick={() => set({ formats: toggleIn(f.formats, fm) })}>
                      {FORMAT_LABEL[fm]}
                    </Toggle>
                  ))}
                </div>
              </fieldset>
              <fieldset className="m-0 border-0 p-0">
                <legend className="mb-2.5 p-0 text-sm font-bold text-ink">Days you are available</legend>
                <div className="flex flex-wrap gap-2">
                  {WEEKDAYS.map(d => (
                    <Toggle key={d} on={f.days.includes(d)} onClick={() => set({ days: toggleIn(f.days, d) })}>
                      {d}
                    </Toggle>
                  ))}
                </div>
              </fieldset>
              <div className="grid grid-cols-2 gap-5">
                <Field label="From" htmlFor="ts-start">
                  <input id="ts-start" type="time" value={f.startTime} onChange={e => set({ startTime: e.target.value })} className={inputClass} />
                </Field>
                <Field label="Until" htmlFor="ts-end">
                  <input id="ts-end" type="time" value={f.endTime} onChange={e => set({ endTime: e.target.value })} className={inputClass} />
                </Field>
              </div>
              <fieldset className="m-0 border-0 p-0">
                <legend className="mb-2.5 p-0 text-sm font-bold text-ink">Session length</legend>
                <div className="flex flex-wrap gap-2">
                  {[30, 50, 60].map(m => (
                    <Toggle key={m} on={f.sessionLength === m} onClick={() => set({ sessionLength: m })}>
                      {m} minutes
                    </Toggle>
                  ))}
                </div>
              </fieldset>
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                <Field label="Fee per session (GHS)" htmlFor="ts-fee" hint="4Life sessions are subsidised. Most counsellors charge GHS 15–50.">
                  <input id="ts-fee" type="number" min={0} value={f.feeGHS} onChange={e => set({ feeGHS: e.target.value })} className={inputClass} />
                </Field>
                <Field label="Region" htmlFor="ts-region">
                  <select id="ts-region" value={f.region} onChange={e => set({ region: e.target.value })} className={inputClass}>
                    {REGIONS.map(r => (
                      <option key={r}>{r}</option>
                    ))}
                  </select>
                </Field>
              </div>
              {f.formats.includes('in_person') && (
                <Field label="Where you see clients in person" htmlFor="ts-loc">
                  <input id="ts-loc" value={f.practiceLocation} onChange={e => set({ practiceLocation: e.target.value })} placeholder="e.g. East Legon, Accra" className={inputClass} />
                </Field>
              )}
              <Switch
                checked={f.slidingScale}
                onChange={v => set({ slidingScale: v })}
                label="Offer a lower fee to clients who cannot afford it"
                description="Clients can ask for a reduced fee. You decide each time."
              />
            </div>
          )}

          {step === 5 && (
            <div key="t5" className="flex flex-col gap-6 animate-fadeIn lg:gap-4">
              <Field label="Introduce yourself to clients" htmlFor="ts-bio" hint={`${f.bio.length} / 400 characters. Warm and plain words work best.`}>
                <textarea
                  id="ts-bio"
                  rows={4}
                  maxLength={400}
                  value={f.bio}
                  onChange={e => set({ bio: e.target.value })}
                  placeholder="e.g. I help young adults step away from alcohol and other habits using CBT. Sessions are calm, practical and confidential."
                  className={textareaClass}
                />
              </Field>
              <Switch
                checked={f.acceptingClients}
                onChange={v => set({ acceptingClients: v })}
                label="Accept new clients"
                description="Once verified, you appear in the list of counsellors people can book."
              />
              <fieldset className="m-0 flex flex-col gap-2.5 border-0 p-0">
                <legend className="mb-2.5 p-0 text-sm font-bold text-ink">Professional agreement</legend>
                {[
                  { k: 'agreeConfidential' as const, text: 'I will keep everything clients share confidential and only use it to support their care.' },
                  { k: 'agreeCrisis' as const, text: 'If a client is at risk of harm, I will follow the 4Life crisis protocol and the law and ethics code of my profession.' },
                  { k: 'agreeAccurate' as const, text: 'The information about my licence and qualifications is true.' },
                ].map(a => (
                  <label key={a.k} className="flex cursor-pointer items-start gap-3 rounded-xl border border-line bg-bg p-4 text-[0.9375rem] leading-relaxed text-ink-2">
                    <input type="checkbox" checked={f[a.k]} onChange={e => set({ [a.k]: e.target.checked } as Partial<typeof f>)} className="mt-1 h-5 w-5 shrink-0 cursor-pointer" />
                    <span>{a.text}</span>
                  </label>
                ))}
              </fieldset>
            </div>
          )}

          <div className="flex items-center gap-3 border-t border-line pt-5">
            {step > 1 && (
              <button type="button" onClick={() => go((step - 1) as Step)} className="flex min-h-12 items-center gap-2 rounded-xl px-4 text-[0.9375rem] font-bold text-ink-2 hover:bg-muted cursor-pointer">
                <ArrowLeft className="h-5 w-5" aria-hidden="true" /> Back
              </button>
            )}
            <button type="submit" disabled={busy} className="ml-auto flex min-h-12 items-center gap-2 rounded-xl bg-pri px-6 text-[0.9375rem] font-bold text-[#fff] hover:bg-pri-hover disabled:opacity-60 cursor-pointer">
              {step < 5 ? (
                <>
                  Continue <ArrowRight className="h-5 w-5" aria-hidden="true" />
                </>
              ) : (
                <>
                  Create therapist account <Check className="h-5 w-5" aria-hidden="true" />
                </>
              )}
            </button>
          </div>
        </form>
      )}
    </div>
  );
};

const ErrorBox: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div role="alert" className="flex items-start gap-2.5 rounded-xl bg-danger-soft px-4 py-3 text-[0.9375rem] text-danger-text animate-fadeIn">
    <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
    <p className="m-0 leading-relaxed">{children}</p>
  </div>
);
