/**
 * Supabase pieces the main App uses: restoring the signed-in session,
 * saving the client's profile in the background, answering location
 * requests during a crisis, and setting a new password from a reset link.
 * Each one does nothing in device mode.
 */
import React, { useEffect, useRef, useState } from 'react';
import type { UserProfile } from '../types';
import type { TherapistProfile } from '../therapist/types';
import { db, friendlyError, isRemote } from './supabase';
import * as clientApi from './db/clientApi';
import { loadTherapistProfile } from './db/therapistApi';
import { getCrisisLocation } from './location';
import { Button, Field, Modal, Notice, inputClass } from '../components/ui';

const isUuid = (id?: string) => !!id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

/** Restore a saved session on load, and react to sign-out or password-reset links. */
export function useRemoteSession(opts: {
  base: UserProfile;
  onClient: (p: UserProfile) => void;
  onTherapist: (t: TherapistProfile) => void;
  onSignedOut: () => void;
}) {
  const [checking, setChecking] = useState(isRemote);
  const [passwordRecovery, setPasswordRecovery] = useState(false);
  const ref = useRef(opts);
  ref.current = opts;

  useEffect(() => {
    if (!isRemote) return;
    let alive = true;
    (async () => {
      try {
        const user = await clientApi.getSignedInUser();
        if (!user || !alive) return;
        if (user.role === 'therapist') ref.current.onTherapist(await loadTherapistProfile(user.id));
        else ref.current.onClient(await clientApi.loadClientProfile(user.id, ref.current.base));
      } catch (e) {
        console.warn('Could not restore the session', e);
      } finally {
        if (alive) setChecking(false);
      }
    })();
    const { data } = db().auth.onAuthStateChange(event => {
      if (event === 'SIGNED_OUT') ref.current.onSignedOut();
      if (event === 'PASSWORD_RECOVERY') setPasswordRecovery(true);
    });
    return () => {
      alive = false;
      data.subscription.unsubscribe();
    };
  }, []);

  return { checking, passwordRecovery, closePasswordRecovery: () => setPasswordRecovery(false) };
}

/** Save the client's profile and support contacts a moment after they change. */
export function useProfileSync(profile: UserProfile, enabled: boolean) {
  const [error, setError] = useState<string | null>(null);
  const lastContacts = useRef<string>('');
  const first = useRef(true);

  useEffect(() => {
    if (!isRemote || !enabled || !isUuid(profile.id)) return;
    // Skip the save straight after loading
    if (first.current) {
      first.current = false;
      lastContacts.current = JSON.stringify(profile.contacts);
      return;
    }
    const t = setTimeout(async () => {
      try {
        await clientApi.saveClientProfile(profile.id!, profile);
        const contacts = JSON.stringify(profile.contacts);
        if (contacts !== lastContacts.current) {
          await clientApi.saveSupportContacts(profile.id!, profile.contacts);
          lastContacts.current = contacts;
        }
        setError(null);
      } catch (e) {
        setError(friendlyError(e));
      }
    }, 1000);
    return () => clearTimeout(t);
  }, [profile, enabled]);

  useEffect(() => {
    if (!enabled) first.current = true;
  }, [enabled]);

  return { error, clearError: () => setError(null) };
}

/** During a crisis, a counsellor can ask for an updated location; answer only if the person agreed. */
export function useLocationRequests(profile: UserProfile, enabled: boolean) {
  const latest = useRef(profile);
  latest.current = profile;
  useEffect(() => {
    if (!isRemote || !enabled || !isUuid(profile.id)) return;
    return clientApi.listenForLocationRequests(profile.id!, () => getCrisisLocation(latest.current, 'requested'));
  }, [enabled, profile.id]);
}

/** Shown after someone opens a password-reset link from their email. */
export const PasswordRecoveryModal: React.FC<{ isOpen: boolean; onClose: () => void }> = ({ isOpen, onClose }) => {
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (pw.length < 8) return setMsg({ ok: false, text: 'Please use at least 8 characters.' });
    if (pw !== pw2) return setMsg({ ok: false, text: 'The two passwords do not match.' });
    setBusy(true);
    const { error } = await db().auth.updateUser({ password: pw });
    setBusy(false);
    if (error) return setMsg({ ok: false, text: friendlyError(error) });
    setMsg({ ok: true, text: 'Your new password is saved.' });
    setTimeout(onClose, 1500);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Set a new password"
      size="sm"
      footer={
        <div className="flex justify-end">
          <Button onClick={save} disabled={busy}>
            {busy ? 'Saving…' : 'Save password'}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        {msg && <Notice tone={msg.ok ? 'pri' : 'warn'}>{msg.text}</Notice>}
        <Field label="New password" htmlFor="rp-1" hint="At least 8 characters.">
          <input id="rp-1" type="password" autoComplete="new-password" value={pw} onChange={e => setPw(e.target.value)} className={inputClass} />
        </Field>
        <Field label="Type it again" htmlFor="rp-2">
          <input id="rp-2" type="password" autoComplete="new-password" value={pw2} onChange={e => setPw2(e.target.value)} className={inputClass} />
        </Field>
      </div>
    </Modal>
  );
};
