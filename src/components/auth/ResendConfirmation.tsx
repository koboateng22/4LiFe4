import React, { useState } from 'react';
import { friendlyError } from '../../lib/supabase';
import { resendConfirmation } from '../../lib/db/clientApi';

/** Shown when sign-in is refused because the email isn't confirmed, or the link has expired. */
export const ResendConfirmation: React.FC<{ email: string }> = ({ email }) => {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState('');

  const send = async () => {
    if (!email.includes('@')) return setResult('Please enter your email address above first.');
    setBusy(true);
    setResult('');
    try {
      await resendConfirmation(email);
      setResult(`If that address needs confirming, we sent a new link to ${email.trim()}. Check your spam folder too.`);
    } catch (err) {
      setResult(friendlyError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col items-start gap-1 text-sm">
      <button type="button" onClick={send} disabled={busy} className="min-h-10 font-semibold text-pri-text hover:underline disabled:opacity-60 cursor-pointer">
        {busy ? 'Sending…' : 'Send the confirmation link again'}
      </button>
      {result && <p role="status" className="m-0 leading-relaxed text-ink-2">{result}</p>}
    </div>
  );
};

/** True when an error message means the person needs a new confirmation link. */
export const needsNewLink = (message: string) => /confirm your email|email link/i.test(message);
