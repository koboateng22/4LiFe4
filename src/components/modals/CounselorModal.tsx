import React, { useState } from 'react';
import { CounselorMatch, UserProfile } from '../../types';
import { addSharedRequest } from '../../therapist/data';
import { friendlyError, isRemote } from '../../lib/supabase';
import { requestSession } from '../../lib/db/clientApi';
import { Modal, Button, Avatar, Notice, cx } from '../ui';
import { Phone, Video, Check } from 'lucide-react';

interface CounselorModalProps {
  counselor: CounselorMatch | null;
  isOpen: boolean;
  onClose: () => void;
  profile?: UserProfile;
}

/** Bookable times: the next few working slots from now. */
const makeSlots = () => {
  const out: Array<{ label: string; iso: string }> = [];
  const hours = [10, 14, 16];
  for (let day = 0; out.length < 4 && day < 7; day++) {
    for (const h of hours) {
      const d = new Date();
      d.setDate(d.getDate() + day);
      d.setHours(h, 0, 0, 0);
      if (d.getTime() < Date.now() + 2 * 3600000 || d.getDay() === 0) continue;
      const dayLabel = day === 0 ? 'Today' : day === 1 ? 'Tomorrow' : d.toLocaleDateString([], { weekday: 'long' });
      out.push({ label: `${dayLabel}, ${d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`, iso: d.toISOString() });
      if (out.length === 4) break;
    }
  }
  return out;
};

export const CounselorModal: React.FC<CounselorModalProps> = ({ counselor, isOpen, onClose, profile }) => {
  const [slots] = useState(makeSlots);
  const [selectedSlot, setSelectedSlot] = useState<string>(slots[1]?.label || slots[0]?.label || '');
  const [message, setMessage] = useState('');
  const [shareCheckins, setShareCheckins] = useState(true);
  const [sessionType, setSessionType] = useState<'voice' | 'video'>('voice');
  const [isBooked, setIsBooked] = useState(false);
  const [bookError, setBookError] = useState('');
  const [sending, setSending] = useState(false);

  if (!isOpen || !counselor) return null;

  const handleConfirmBooking = async () => {
    const slot = slots.find(s => s.label === selectedSlot) || slots[0];
    setBookError('');
    if (isRemote) {
      // Sent to the counsellor's workspace; the database adds your check-ins only if you chose to share
      setSending(true);
      try {
        await requestSession({
          therapistId: counselor.id,
          preferredTime: slot.iso,
          format: sessionType,
          message: message.trim(),
          sharesCheckins: shareCheckins,
          focus: profile?.currentTriage || 'general',
        });
      } catch (e) {
        setBookError(friendlyError(e));
        return;
      } finally {
        setSending(false);
      }
      setIsBooked(true);
      setTimeout(() => {
        setIsBooked(false);
        onClose();
      }, 2800);
      return;
    }
    // Device mode: stored in this browser so the therapist workspace on this device sees it
    addSharedRequest({
      id: 'rq_' + Date.now(),
      therapistId: counselor.id,
      clientNickname: profile?.nickname || 'Anonymous',
      focus: profile?.currentTriage || 'general',
      preferredTime: slot.iso,
      preferredLabel: slot.label,
      format: sessionType,
      message: message.trim(),
      sharesCheckins: shareCheckins,
      createdAt: new Date().toISOString(),
      status: 'new',
      snapshot:
        shareCheckins && profile
          ? { streakDays: profile.sobrietyStreakDays, mood: [], craving: [profile.currentCraving] }
          : undefined,
    });
    setIsBooked(true);
    setTimeout(() => {
      setIsBooked(false);
      onClose();
    }, 2800);
  };

  const option = (on: boolean) =>
    cx(
      'flex min-h-12 items-center justify-center gap-2 rounded-xl border-2 px-3 text-[0.9375rem] font-semibold cursor-pointer',
      on ? 'border-pri bg-pri-soft text-pri-ink' : 'border-line bg-surface text-ink hover:border-pri-text'
    );

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Book a session"
      size="sm"
      footer={
        <Button block size="lg" onClick={handleConfirmBooking} disabled={isBooked || sending} icon={isBooked ? <Check className="h-5 w-5" /> : undefined} className="disabled:opacity-100">
          {isBooked ? 'Request sent' : `Request ${selectedSlot}`}
        </Button>
      }
    >
      <div className="flex flex-col gap-6">
        <div className="flex items-center gap-3.5 rounded-2xl bg-bg p-4">
          <Avatar src={counselor.avatar} name={counselor.name} size={56} />
          <div className="min-w-0">
            <p className="m-0 text-base font-bold text-ink">{counselor.name}</p>
            <p className="m-0 text-[0.9375rem] text-ink-2">{counselor.specialty}</p>
            <p className="m-0 text-sm text-ink-3">{counselor.location}</p>
          </div>
        </div>

        <fieldset className="m-0 flex flex-col gap-2.5 border-0 p-0">
          <legend className="mb-2.5 text-sm font-bold text-ink">Choose a time</legend>
          <div className="grid grid-cols-2 gap-2.5">
            {slots.map(({ label }) => (
              <button key={label} type="button" aria-pressed={selectedSlot === label} onClick={() => setSelectedSlot(label)} className={option(selectedSlot === label)}>
                {label}
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset className="m-0 flex flex-col gap-2.5 border-0 p-0">
          <legend className="mb-2.5 text-sm font-bold text-ink">How would you like to talk?</legend>
          <div className="grid grid-cols-2 gap-2.5">
            <button type="button" aria-pressed={sessionType === 'voice'} onClick={() => setSessionType('voice')} className={option(sessionType === 'voice')}>
              <Phone className="h-5 w-5" aria-hidden="true" /> Voice call
            </button>
            <button type="button" aria-pressed={sessionType === 'video'} onClick={() => setSessionType('video')} className={option(sessionType === 'video')}>
              <Video className="h-5 w-5" aria-hidden="true" /> Video call
            </button>
          </div>
          <p className="m-0 text-sm text-ink-3">Voice calls work better on slow connections.</p>
        </fieldset>

        <div className="flex flex-col gap-2">
          <label htmlFor="bk-msg" className="text-sm font-bold text-ink">
            Anything you would like them to know? <span className="font-medium text-ink-3">(optional)</span>
          </label>
          <textarea
            id="bk-msg"
            rows={3}
            value={message}
            onChange={e => setMessage(e.target.value)}
            placeholder="e.g. I want help planning for weekends."
            className="w-full rounded-xl border border-line bg-bg px-4 py-3 text-base text-ink focus:border-pri-text focus:outline-none"
          />
        </div>

        <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-line bg-bg p-4 text-[0.9375rem] leading-relaxed text-ink-2">
          <input type="checkbox" checked={shareCheckins} onChange={e => setShareCheckins(e.target.checked)} className="mt-1 h-5 w-5 shrink-0 cursor-pointer" />
          <span>
            <strong className="text-ink">Share my check-ins with this counsellor</strong>
            <br />
            Your streak, mood and craving scores help them prepare. Your chats with the AI companion are never shared. You can stop sharing any time.
          </span>
        </label>

        <div className="flex items-center justify-between rounded-2xl border border-line px-4 py-3.5">
          <div>
            <p className="m-0 text-sm text-ink-3">Subsidised price</p>
            <p className="m-0 text-xl font-extrabold text-ink">
              GHS {counselor.feeGHS} <span className="text-sm font-medium text-ink-3">(about ${counselor.feeUSD})</span>
            </p>
          </div>
          <span className="text-sm text-ink-3">per session</span>
        </div>

        {bookError && <Notice tone="warn">{bookError}</Notice>}
        {isBooked && (
          <Notice icon={<Check className="h-5 w-5" />}>
            Your request has been sent to {counselor.name.split(',')[0]} for {selectedSlot}.
          </Notice>
        )}
      </div>
    </Modal>
  );
};
