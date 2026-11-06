/**
 * After signing in with Google or a phone code for the first time, the account has no community
 * name of the person's choosing (the database gave it "member_…") and no age. Both are asked here,
 * with the same rules as the sign-up form, before the app opens: the age keeps 4Life to people
 * aged 13 and over, and the community name is what others see instead of a real name.
 */
import React, { useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import type { UserProfile } from '../../types';
import { Button, Card, Field, inputClass } from '../ui';
import { BrandMark } from '../Sidebar';
import { MIN_AGE, ageDigits, ageError, parseAge } from '../../lib/age';
import { friendlyError } from '../../lib/supabase';
import { saveClientProfile } from '../../lib/db/clientApi';
import { t, T } from '../../i18n';

/**
 * A first Google or phone sign-in: the account still has the placeholder community name the
 * database gives ("member_…"). Older accounts without an age are not stopped here; nothing may
 * ever stand between someone and the app's emergency help.
 */
export const needsAccountSetup = (p: UserProfile) => /^member_[0-9a-f]{8}$/.test(p.nickname || '');

export const FinishSetup: React.FC<{ profile: UserProfile; onDone: (p: UserProfile) => void; onSignOut: () => void }> = ({ profile, onDone, onSignOut }) => {
  const [nickname, setNickname] = useState(/^member_/.test(profile.nickname) ? '' : profile.nickname);
  const [age, setAge] = useState(String(profile.age || ''));
  const [promise, setPromise] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [tooYoung, setTooYoung] = useState(false);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const nick = nickname.trim();
    if (nick.length < 2 || nick.length > 40) return setError(t('Please enter your name, or a name you would like us to call you.'));
    // decided on Continue, not while typing ("1" on the way to "19" is not too young)
    if (/^\d+$/.test(age.trim()) && Number(age) < MIN_AGE) return setTooYoung(true);
    const ageProblem = ageError(age);
    if (ageProblem) return setError(ageProblem);
    if (!promise) return setError(t('Please tick the safe-space promise to continue.'));
    const next = { ...profile, nickname: nick, name: profile.name || nick, age: parseAge(age) ?? '' };
    setBusy(true);
    try {
      await saveClientProfile(profile.id!, next);
      onDone(next);
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg p-4 text-ink">
      <Card className="flex w-full max-w-md flex-col gap-5">
        <BrandMark />
        {/* Emergency help is always one tap away, here too */}
        <p className="m-0 rounded-xl bg-danger-soft px-3.5 py-2.5 text-sm text-ink">
          <T
            text="In danger right now? Call <0>112</0> or <1>193</1> (ambulance)."
            parts={[<a href="tel:112" className="font-bold text-danger-text underline" />, <a href="tel:193" className="font-bold text-danger-text underline" />]}
          />
        </p>
        <div>
          <h1 className="m-0 text-2xl font-extrabold">{t('Finish setting up')}</h1>
          <p className="m-0 mt-1 text-base text-ink-2">{t('Two quick things before you start. Only your community name is ever shown to others.')}</p>
        </div>
        {tooYoung ? (
          <div className="flex flex-col gap-4">
            <p role="alert" className="m-0 rounded-xl bg-warn-soft px-4 py-3 text-base text-ink">
              {t('4Life is for people aged {min} or older. If you need support now, please talk to an adult you trust, or call 112 in an emergency.', { min: MIN_AGE })}
            </p>
            <Button variant="secondary" onClick={onSignOut}>
              {t('Log out')}
            </Button>
          </div>
        ) : (
          <form onSubmit={save} className="flex flex-col gap-4" noValidate>
            {error && (
              <p role="alert" className="m-0 rounded-xl bg-danger-soft px-3.5 py-2.5 text-sm font-semibold text-danger-text">
                {error}
              </p>
            )}
            <Field label={t('Community name')} htmlFor="fs-nick" hint={t('What others see in the Village. Please don’t use your real name.')}>
              <input id="fs-nick" value={nickname} onChange={e => setNickname(e.target.value)} maxLength={40} className={inputClass} placeholder={t('e.g. HopefulWarrior_GH')} autoComplete="nickname" />
            </Field>
            <Field label={t('Your age')} htmlFor="fs-age" hint={t('In years, from {MIN_AGE} to {MAX_AGE}.', { MIN_AGE, MAX_AGE: 120 })}>
              <input id="fs-age" inputMode="numeric" value={age} onChange={e => setAge(ageDigits(e.target.value))} className={inputClass} placeholder={t('e.g. 22')} />
            </Field>
            <label className="flex items-start gap-3 text-[0.9375rem] text-ink-2">
              <input type="checkbox" checked={promise} onChange={e => setPromise(e.target.checked)} className="mt-1 h-5 w-5 shrink-0 accent-[var(--pri)]" />
              <span>
                <T text="I agree to the <0>safe-space promise</0>: my recovery data stays private, and I will treat others in the community with respect." parts={[<strong className="text-ink" />]} />
              </span>
            </label>
            <Button type="submit" size="lg" disabled={busy} icon={<ShieldCheck className="h-5 w-5" />}>
              {busy ? t('Saving…') : t('Continue')}
            </Button>
            <button type="button" onClick={onSignOut} className="min-h-10 self-center text-sm font-semibold text-ink-3 hover:underline cursor-pointer">
              {t('Log out')}
            </button>
          </form>
        )}
      </Card>
    </div>
  );
};
