/**
 * Shown to someone whose account an admin has suspended: what they can't do, what still works, and why.
 * The database enforces the suspension either way (supabase/migrations/20261113000012_admin.sql);
 * this only explains it.
 */
import React, { useEffect, useState } from 'react';
import { Ban } from 'lucide-react';
import { isRemote } from '../lib/supabase';
import { mySuspension } from '../lib/db/adminApi';
import { privacyContacts } from '../content/privacyPolicy';
import { t } from '../i18n';

export const SuspensionNotice: React.FC<{ userId?: string }> = ({ userId }) => {
  const [s, setS] = useState<{ reason: string } | null>(null);
  useEffect(() => {
    if (!isRemote) return;
    let live = true;
    mySuspension().then(r => live && setS(r));
    return () => {
      live = false;
    };
  }, [userId]);
  if (!s) return null;
  const email = privacyContacts().email;
  return (
    <div role="alert" className="mb-5 flex gap-3 rounded-2xl border-2 border-danger/50 bg-danger-soft px-4 py-3.5 text-[0.9375rem] text-ink">
      <Ban className="mt-0.5 h-5 w-5 shrink-0 text-danger-text" aria-hidden="true" />
      <div className="min-w-0">
        <p className="m-0 font-bold">{t('Your account is suspended')}</p>
        <p className="m-0 mt-1">
          {t('You can’t post or react in the Village, or request or book sessions. SOS and the emergency tools still work, and you can see and download your data.')}
        </p>
        <p className="m-0 mt-1 text-ink-2">
          {t('Reason: {reason}', { reason: s.reason })}
          {email && <> · {t('Questions: {email}', { email })}</>}
        </p>
      </div>
    </div>
  );
};
