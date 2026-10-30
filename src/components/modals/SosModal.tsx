import React, { useEffect, useState } from 'react';
import { UserProfile } from '../../types';
import { CHECKED_HOTLINES, getPosition, locationMessage, smsHref, telHref, whatsappHref, type Fix } from '../../lib/ems';
import { addSosEvent } from '../../therapist/data';
import { getCrisisLocation } from '../../lib/location';
import { isRemote } from '../../lib/supabase';
import { sendSos } from '../../lib/db/clientApi';
import { Modal, cx } from '../ui';
import { Phone, Send, Wind, MessageCircle, MapPin, Check, X, ShieldCheck } from 'lucide-react';

interface SosModalProps {
  profile: UserProfile;
  isOpen: boolean;
  onClose: () => void;
  onOpenCalm: () => void;
  onOpenChat?: () => void;
  onOpenHelpNearby?: () => void;
  /** Open "My safety plan" on the Instant EMS screen */
  onOpenSafetyPlan?: () => void;
}

const COUNTDOWN = 5;

/**
 * The SOS screen: a few large, clear choices — never a wall of options.
 * Order: call for help, alert a trusted person, calm down, talk.
 */
export const SosModal: React.FC<SosModalProps> = ({ profile, isOpen, onClose, onOpenCalm, onOpenChat, onOpenHelpNearby, onOpenSafetyPlan }) => {
  // 'counting' = a short countdown with Cancel, so a stray tap doesn't alert anyone
  // 'ready' = the phone's messaging app was opened with the message (the person presses send)
  const [alertState, setAlertState] = useState<'idle' | 'counting' | 'preparing' | 'ready'>('idle');
  const [left, setLeft] = useState(COUNTDOWN);
  const [alertText, setAlertText] = useState('');

  const [counsellorTold, setCounsellorTold] = useState(false);

  const contact = profile.contacts.find(c => c.isPrimary) || profile.contacts[0];

  /** Let your counsellor know you pressed SOS — with your location only if you agreed in Settings. */
  const tellCounsellor = () => {
    if (counsellorTold) return;
    setCounsellorTold(true);
    getCrisisLocation(profile, 'sos').then(location => {
      if (isRemote) {
        // The database raises your counsellor's alert; it also removes the location if you have not agreed to share it
        sendSos(location).catch(e => console.warn('Could not send SOS to your counsellor', e));
      } else {
        addSosEvent({ id: 'sos_' + Date.now(), nickname: profile.nickname, at: new Date().toISOString(), location });
      }
    });
  };
  const contactFirstName = contact?.name.split('(')[0].trim();

  // Start fresh each time SOS opens
  useEffect(() => {
    if (!isOpen) {
      setAlertState(s => (s === 'counting' ? 'idle' : s));
      setLeft(COUNTDOWN);
    }
  }, [isOpen]);

  // The countdown: alert when it reaches zero
  useEffect(() => {
    if (alertState !== 'counting') return;
    if (left <= 0) {
      handleAlertContact();
      return;
    }
    const t = setTimeout(() => setLeft(n => n - 1), 1000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alertState, left]);

  const startCountdown = () => {
    setLeft(COUNTDOWN);
    setAlertState('counting');
  };

  /** Opens the phone's messaging app with a help message and, if possible, a map link to where you are. */
  const handleAlertContact = async () => {
    if (!contact || alertState === 'preparing' || alertState === 'ready') return;
    setAlertState('preparing');
    tellCounsellor();
    let fix: Fix | null = null;
    try {
      fix = await getPosition(6000);
    } catch {
      /* no location: the message says so */
    }
    const text = locationMessage(profile.nickname || profile.name || 'Your friend', fix);
    setAlertText(text);
    setAlertState('ready');
    window.location.href = smsHref(contact.phone, text);
  };

  const bigOption = 'flex w-full min-h-[76px] items-center gap-4 rounded-2xl px-5 py-3 text-left no-underline transition-colors cursor-pointer';

  const helplines = CHECKED_HOTLINES.filter(h => h.id === 'gh-193' || h.id === 'gh-yonkodo');

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="You are not alone" subtitle="Choose what you need right now. Help is available 24 hours a day." size="sm">
      <div className="flex flex-col gap-3">
        <a href="tel:112" onClick={tellCounsellor} className={cx(bigOption, 'bg-danger text-[#fff] hover:bg-danger-hover')}>
          <Phone className="h-7 w-7 shrink-0" aria-hidden="true" />
          <span>
            <span className="block text-xl font-extrabold">Call 112</span>
            <span className="block text-[0.9375rem] opacity-95">Ambulance and emergency help</span>
          </span>
        </a>

        {contact ? (
          alertState === 'ready' ? (
            <div className={cx(bigOption, 'flex-col items-start gap-3 border-2 border-pri bg-pri-soft text-pri-ink')} role="status">
              <span className="flex items-center gap-3">
                <Check className="h-7 w-7 shrink-0" aria-hidden="true" />
                <span>
                  <span className="block text-[1.1875rem] font-extrabold">Message ready for {contactFirstName}</span>
                  <span className="block text-[0.9375rem]">Press send in your messaging app. If it didn’t open, use a button below.</span>
                </span>
              </span>
              <span className="flex flex-wrap gap-2">
                <a href={smsHref(contact.phone, alertText)} className="inline-flex min-h-11 items-center rounded-xl bg-pri px-4 font-bold text-[#fff] no-underline">
                  Text message
                </a>
                <a href={whatsappHref(contact.phone, alertText)} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center rounded-xl border border-line bg-surface px-4 font-bold text-ink no-underline">
                  WhatsApp
                </a>
                <a href={telHref(contact.phone)} className="inline-flex min-h-11 items-center rounded-xl border border-line bg-surface px-4 font-bold text-ink no-underline">
                  Call {contactFirstName}
                </a>
              </span>
            </div>
          ) : alertState === 'counting' ? (
            <div className={cx(bigOption, 'flex-col items-stretch gap-3 border-2 border-danger bg-danger-soft text-danger-text')} role="alert">
              <span className="flex items-center gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-danger text-xl font-extrabold tabular-nums text-[#fff]" aria-hidden="true">
                  {left}
                </span>
                <span>
                  <span className="block text-[1.1875rem] font-extrabold">Alerting {contactFirstName} in {left}…</span>
                  <span className="block text-[0.9375rem] opacity-90">Your counsellor will be told too.</span>
                </span>
              </span>
              <span className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setAlertState('idle')}
                  className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-line bg-surface font-bold text-ink cursor-pointer"
                >
                  <X className="h-5 w-5" aria-hidden="true" /> Cancel
                </button>
                <button type="button" onClick={handleAlertContact} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-danger font-bold text-[#fff] cursor-pointer">
                  <Send className="h-5 w-5" aria-hidden="true" /> Send now
                </button>
              </span>
            </div>
          ) : (
            <button
              type="button"
              onClick={startCountdown}
              disabled={alertState === 'preparing'}
              className={cx(bigOption, 'border-2 border-danger bg-danger-soft text-danger-text hover:brightness-95 disabled:cursor-wait')}
            >
              <Send className="h-7 w-7 shrink-0" aria-hidden="true" />
              <span>
                <span className="block text-[1.1875rem] font-extrabold">{alertState === 'preparing' ? 'Finding your location…' : `Alert ${contactFirstName}`}</span>
                <span className="block text-[0.9375rem] opacity-90">Opens a text to them with where you are</span>
              </span>
            </button>
          )
        ) : (
          <p className="m-0 rounded-2xl bg-warn-soft px-5 py-4 text-base text-ink">
            Add a support person in Settings so you can alert them with one tap.
          </p>
        )}

        <p className="m-0 -mt-1 px-1 text-sm text-ink-3" role="status">
          {counsellorTold
            ? profile.shareLocationInCrisis
              ? 'Your counsellor has been told, with your location.'
              : 'Your counsellor has been told. Your location was not shared.'
            : profile.shareLocationInCrisis
            ? 'Calling 112 or alerting someone also tells your counsellor where you are.'
            : 'Calling 112 or alerting someone also tells your counsellor. Your location is not shared (change this in Settings).'}
        </p>

        <button
          type="button"
          onClick={() => {
            onClose();
            onOpenCalm();
          }}
          className={cx(bigOption, 'bg-pri-soft text-pri-ink hover:brightness-95')}
        >
          <Wind className="h-7 w-7 shrink-0" aria-hidden="true" />
          <span>
            <span className="block text-[1.1875rem] font-extrabold">Breathe with me</span>
            <span className="block text-[0.9375rem] opacity-90">A 2-minute calming exercise</span>
          </span>
        </button>

        {onOpenChat && (
          <button type="button" onClick={onOpenChat} className={cx(bigOption, 'border border-line bg-surface text-ink hover:bg-muted')}>
            <MessageCircle className="h-7 w-7 shrink-0 text-pri-text" aria-hidden="true" />
            <span>
              <span className="block text-[1.1875rem] font-extrabold">Talk to {profile.aiName || '4Life'}</span>
              <span className="block text-[0.9375rem] text-ink-2">Private support, right now</span>
            </span>
          </button>
        )}

        <div className="mt-2 flex flex-col">
          <h3 className="m-0 mb-1 text-base font-bold text-ink">More numbers</h3>
          {helplines.map(h => (
            <a
              key={h.id}
              href={telHref(h.number)}
              className="flex min-h-14 items-center justify-between gap-3 border-t border-line no-underline"
            >
              <span className="text-[0.9375rem] font-semibold text-ink">{h.label}</span>
              <span className="shrink-0 text-[0.9375rem] font-extrabold text-pri-text">{h.number}</span>
            </a>
          ))}
          {onOpenSafetyPlan && (
            <button
              type="button"
              onClick={onOpenSafetyPlan}
              className="flex min-h-14 items-center gap-2 border-t border-line text-left text-[0.9375rem] font-bold text-pri-text hover:underline cursor-pointer"
            >
              <ShieldCheck className="h-5 w-5" aria-hidden="true" /> Open my safety plan
            </button>
          )}
          {onOpenHelpNearby && (
            <button
              type="button"
              onClick={onOpenHelpNearby}
              className="flex min-h-14 items-center gap-2 border-t border-line text-left text-[0.9375rem] font-bold text-pri-text hover:underline cursor-pointer"
            >
              <MapPin className="h-5 w-5" aria-hidden="true" /> Find hospitals and recovery centres near me
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
};
