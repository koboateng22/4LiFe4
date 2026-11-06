/**
 * "Continue with Google" and "Use my phone number" on the sign-in page (Supabase only, and only
 * when switched on: see lib/features.ts). Both end in a normal Supabase session.
 */
import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, MessageSquareText, Smartphone } from 'lucide-react';
import { Button, Field, cx, inputClass } from '../ui';
import { friendlyError } from '../../lib/supabase';
import * as clientApi from '../../lib/db/clientApi';
import { COUNTRIES, RESEND_SECONDS, cleanCode, countryByCode, showPhone, toE164 } from '../../lib/phone';
import { GOOGLE_SIGN_IN, PHONE_SIGN_IN } from '../../lib/features';
import { t } from '../../i18n';

/** Google's "G", in Google's colours (their sign-in button guidelines ask for it) */
const GoogleMark = () => (
  <svg viewBox="0 0 48 48" className="h-5 w-5" aria-hidden="true">
    <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.6 5.4 2.7 13.3l7.9 6.1C12.5 13.6 17.8 9.5 24 9.5z" />
    <path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 2.9-2.2 5.3-4.6 6.9l7.4 5.7c4.3-4 6.9-9.9 6.9-17.1z" />
    <path fill="#FBBC05" d="M10.6 28.6c-.5-1.4-.8-3-.8-4.6s.3-3.2.8-4.6l-7.9-6.1C1 16.6 0 20.2 0 24s1 7.4 2.7 10.7l7.9-6.1z" />
    <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.8-5.8l-7.4-5.7c-2.1 1.4-4.8 2.3-8.4 2.3-6.2 0-11.5-4.1-13.4-9.9l-7.9 6.1C6.6 42.6 14.6 48 24 48z" />
  </svg>
);

export const OtherSignIn: React.FC<{ onSignedIn: (user: { id: string; role: 'client' | 'therapist' | 'admin' }) => void }> = ({ onSignedIn }) => {
  const [phoneOpen, setPhoneOpen] = useState(false);
  const [country, setCountry] = useState('GH');
  const [number, setNumber] = useState('');
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState<'google' | 'send' | 'verify' | null>(null);
  const [error, setError] = useState('');
  const [wait, setWait] = useState(0);
  const codeRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (wait <= 0) return;
    const id = setTimeout(() => setWait(w => w - 1), 1000);
    return () => clearTimeout(id);
  }, [wait]);

  if (!GOOGLE_SIGN_IN && !PHONE_SIGN_IN) return null;

  const google = async () => {
    setError('');
    setBusy('google');
    try {
      await clientApi.signInWithGoogle(); // the page goes to Google and comes back signed in
    } catch (e) {
      setError(friendlyError(e));
      setBusy(null);
    }
  };

  const send = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setError('');
    const e164 = toE164(countryByCode(country), number);
    if (!e164) return setError(t('Please check the phone number, including the country.'));
    setBusy('send');
    try {
      await clientApi.sendPhoneCode(e164);
      setSentTo(e164);
      setCode('');
      setWait(RESEND_SECONDS);
      requestAnimationFrame(() => codeRef.current?.focus());
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(null);
    }
  };

  const verify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sentTo) return;
    setError('');
    if (cleanCode(code).length !== 6) return setError(t('Please enter the 6-digit code from the text message.'));
    setBusy('verify');
    try {
      onSignedIn(await clientApi.verifyPhoneCode(sentTo, cleanCode(code)));
    } catch (err) {
      setError(friendlyError(err));
      setBusy(null);
    }
  };

  return (
    <div className="flex flex-col gap-3 border-t border-line pt-4">
      <p className="m-0 text-center text-sm font-bold text-ink-3">{t('Or sign in another way')}</p>
      {error && (
        <p role="alert" className="m-0 rounded-xl bg-danger-soft px-3.5 py-2.5 text-sm font-semibold text-danger-text">
          {error}
        </p>
      )}
      {GOOGLE_SIGN_IN && !phoneOpen && (
        <Button variant="secondary" block onClick={google} disabled={busy === 'google'} icon={<GoogleMark />}>
          {busy === 'google' ? t('Opening Google…') : t('Continue with Google')}
        </Button>
      )}
      {PHONE_SIGN_IN && !phoneOpen && (
        <Button variant="secondary" block onClick={() => setPhoneOpen(true)} icon={<Smartphone className="h-5 w-5" />}>
          {t('Use my phone number')}
        </Button>
      )}

      {PHONE_SIGN_IN && phoneOpen && !sentTo && (
        <form onSubmit={send} className="flex flex-col gap-3" noValidate>
          <Field label={t('Phone number')} htmlFor="otp-phone" hint={t('We will text you a 6-digit code. Text message charges may apply.')}>
            <div className="flex gap-2">
              <label htmlFor="otp-country" className="sr-only">
                {t('Country')}
              </label>
              <select id="otp-country" value={country} onChange={e => setCountry(e.target.value)} className={cx(inputClass, 'w-[7.5rem] shrink-0')}>
                {COUNTRIES.map(c => (
                  <option key={c.code} value={c.code}>
                    {c.code} +{c.dial}
                  </option>
                ))}
              </select>
              <input
                id="otp-phone"
                type="tel"
                inputMode="tel"
                autoComplete="tel-national"
                value={number}
                onChange={e => setNumber(e.target.value)}
                placeholder={t('e.g. 024 123 4567')}
                className={cx(inputClass, 'min-w-0 flex-1')}
                maxLength={20}
              />
            </div>
          </Field>
          <Button type="submit" block disabled={busy === 'send'} icon={<MessageSquareText className="h-5 w-5" />}>
            {busy === 'send' ? t('Sending…') : t('Text me a code')}
          </Button>
          <button type="button" onClick={() => setPhoneOpen(false)} className="inline-flex min-h-10 items-center gap-1.5 self-center text-sm font-semibold text-ink-2 hover:underline cursor-pointer">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" /> {t('Back')}
          </button>
        </form>
      )}

      {PHONE_SIGN_IN && phoneOpen && sentTo && (
        <form onSubmit={verify} className="flex flex-col gap-3" noValidate>
          <p className="m-0 text-sm text-ink-2" role="status">
            {t('We sent a code to {phone}. It works for a few minutes.', { phone: showPhone(sentTo) })}
          </p>
          <Field label={t('Code from the text message')} htmlFor="otp-code">
            <input
              id="otp-code"
              ref={codeRef}
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]*"
              value={code}
              onChange={e => setCode(cleanCode(e.target.value))}
              className={cx(inputClass, 'text-center text-xl font-bold tracking-[0.4em] tabular-nums')}
              maxLength={6}
            />
          </Field>
          <Button type="submit" block disabled={busy === 'verify'}>
            {busy === 'verify' ? t('Checking…') : t('Sign in')}
          </Button>
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <button type="button" onClick={() => setSentTo(null)} className="inline-flex min-h-10 items-center gap-1.5 font-semibold text-ink-2 hover:underline cursor-pointer">
              <ArrowLeft className="h-4 w-4" aria-hidden="true" /> {t('Change number')}
            </button>
            <button
              type="button"
              onClick={() => send()}
              disabled={wait > 0 || busy === 'send'}
              className="min-h-10 font-semibold text-pri-text hover:underline disabled:text-ink-3 disabled:no-underline cursor-pointer disabled:cursor-default"
            >
              {wait > 0 ? t('Send a new code in {seconds} s', { seconds: wait }) : t('Send a new code')}
            </button>
          </div>
        </form>
      )}
    </div>
  );
};
