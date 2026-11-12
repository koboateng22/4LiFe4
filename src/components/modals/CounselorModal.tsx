import React, { useEffect, useMemo, useState } from 'react';
import { CounselorMatch, UserProfile } from '../../types';
import { addSharedRequest, deviceBooking } from '../../therapist/data';
import type { SessionFormat, TherapyService } from '../../therapist/types';
import { friendlyError, isRemote } from '../../lib/supabase';
import { freeTimes, listServices, requestSession } from '../../lib/db/clientApi';
import { freeSlots } from '../../lib/schedule';
import { Modal, Button, Avatar, Notice, cx } from '../ui';
import { Phone, Video, Check, Users, MessageSquare } from 'lucide-react';

import { t, T } from '../../i18n';
interface CounselorModalProps {
  counselor: CounselorMatch | null;
  isOpen: boolean;
  onClose: () => void;
  profile?: UserProfile;
}

const FORMAT_ICON: Record<SessionFormat, React.ReactNode> = {
  voice: <Phone className="h-5 w-5" aria-hidden="true" />,
  video: <Video className="h-5 w-5" aria-hidden="true" />,
  in_person: <Users className="h-5 w-5" aria-hidden="true" />,
  chat: <MessageSquare className="h-5 w-5" aria-hidden="true" />,
};
const FORMAT_NAME: Record<SessionFormat, string> = { voice: 'Voice call', video: 'Video call', in_person: 'In person', chat: 'Text chat' };

const localDay = (iso: string) => new Date(iso).toDateString();
const dayName = (iso: string) => {
  const d = new Date(iso);
  const today = new Date();
  const tomorrow = new Date(Date.now() + 86400000);
  if (d.toDateString() === today.toDateString()) return t('Today');
  if (d.toDateString() === tomorrow.toDateString()) return t('Tomorrow');
  return d.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'short' });
};
const timeName = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

/**
 * Book a session: the counsellor's services (if they list any) and the times they are really free —
 * their working days and hours, minus their break, days off and booked sessions. In Supabase mode
 * the database works the times out; it also refuses a booked time when the request is accepted.
 */
export const CounselorModal: React.FC<CounselorModalProps> = ({ counselor, isOpen, onClose, profile }) => {
  const [services, setServices] = useState<TherapyService[]>([]);
  const [serviceId, setServiceId] = useState<string | null>(null);
  const [times, setTimes] = useState<string[] | null>(null); // null while loading
  const [timesError, setTimesError] = useState('');
  const [day, setDay] = useState('');
  const [selectedIso, setSelectedIso] = useState('');
  const [message, setMessage] = useState('');
  const [shareCheckins, setShareCheckins] = useState(true);
  const [sessionType, setSessionType] = useState<SessionFormat>('voice');
  const [isBooked, setIsBooked] = useState(false);
  const [bookError, setBookError] = useState('');
  const [sending, setSending] = useState(false);
  const [tries, setTries] = useState(0);
  const [servicesFor, setServicesFor] = useState<string | null>(null); // whose services are loaded

  const service = services.find(x => x.id === serviceId) || null;
  const formats: SessionFormat[] = service ? service.formats : ['voice', 'video'];
  const counsellorId = isOpen ? counselor?.id : undefined;

  // The counsellor's services, when the screen opens
  useEffect(() => {
    if (!counsellorId) return;
    let live = true;
    setServices([]);
    setServiceId(null);
    setServicesFor(null);
    const done = (list: TherapyService[]) => {
      if (!live) return;
      setServices(list);
      setServiceId(list[0]?.id ?? null);
      setServicesFor(counsellorId);
    };
    if (isRemote) listServices(counsellorId).then(done).catch(() => done([]));
    else done(deviceBooking(counsellorId).services);
    return () => {
      live = false;
    };
  }, [counsellorId]);

  // Free times for the chosen service's length (once the services are known, so they are fetched once)
  const duration = service?.durationMin;
  useEffect(() => {
    if (!counsellorId || servicesFor !== counsellorId) return;
    let live = true;
    setTimes(null);
    setTimesError('');
    const done = (list: string[]) => {
      if (!live) return;
      setTimes(list);
      setDay(list[0] ? localDay(list[0]) : '');
      setSelectedIso(list[0] || '');
    };
    if (isRemote) {
      freeTimes(counsellorId, duration)
        .then(done)
        .catch(e => live && (setTimes([]), setTimesError(friendlyError(e))));
    } else {
      const b = deviceBooking(counsellorId);
      done(freeSlots(b.hours, b.timeOff, b.busy, { durationMin: duration }).map(d => d.toISOString()));
    }
    return () => {
      live = false;
    };
  }, [counsellorId, servicesFor, duration, tries]);

  // Keep the talking format one the service offers
  useEffect(() => {
    if (!formats.includes(sessionType)) setSessionType(formats[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serviceId, services]);

  const days = useMemo(() => {
    const out: Array<{ key: string; first: string; count: number }> = [];
    for (const iso of times || []) {
      const key = localDay(iso);
      const last = out[out.length - 1];
      if (last?.key === key) last.count++;
      else out.push({ key, first: iso, count: 1 });
    }
    return out;
  }, [times]);
  const dayTimes = (times || []).filter(iso => localDay(iso) === day);

  if (!isOpen || !counselor) return null;

  const selectedSlot = selectedIso ? `${dayName(selectedIso)}, ${timeName(selectedIso)}` : '';
  const fee = service ? service.feeGHS : counselor.feeGHS;
  const feeUSD = Math.max(1, Math.round(fee / 15));

  const handleConfirmBooking = async () => {
    if (!selectedIso) return;
    setBookError('');
    if (isRemote) {
      // Sent to the counsellor's workspace; the database adds your check-ins only if you chose to share
      setSending(true);
      try {
        await requestSession({
          therapistId: counselor.id,
          preferredTime: selectedIso,
          format: sessionType,
          message: message.trim(),
          sharesCheckins: shareCheckins,
          focus: profile?.currentTriage || 'general',
          serviceId: service?.id ?? null,
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
      preferredTime: selectedIso,
      preferredLabel: selectedSlot,
      format: sessionType,
      message: message.trim(),
      sharesCheckins: shareCheckins,
      createdAt: new Date().toISOString(),
      status: 'new',
      serviceId: service?.id,
      serviceName: service?.name,
      serviceMin: service?.durationMin,
      snapshot:
        shareCheckins && profile
          ? { streakDays: profile.sobrietyStreakDays, mood: [], craving: profile.currentCraving >= 1 ? [profile.currentCraving] : [] }
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
      title={t("Book a session")}
      size="sm"
      footer={
        <Button block size="lg" onClick={handleConfirmBooking} disabled={isBooked || sending || !selectedIso} icon={isBooked ? <Check className="h-5 w-5" /> : undefined} className={isBooked ? 'disabled:opacity-100' : undefined}>
          {isBooked ? t("Request sent") : selectedIso ? t("Request {selectedSlot}", { selectedSlot }) : t("Choose a time")}
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

        {services.length > 0 && (
          <fieldset className="m-0 flex flex-col gap-2.5 border-0 p-0">
            <legend className="mb-2.5 text-sm font-bold text-ink">{t("Choose a service")}</legend>
            <div className="flex flex-col gap-2">
              {services.map(sv => (
                <button
                  key={sv.id}
                  type="button"
                  aria-pressed={serviceId === sv.id}
                  onClick={() => setServiceId(sv.id)}
                  className={cx(
                    'flex w-full cursor-pointer flex-col items-start gap-0.5 rounded-xl border-2 px-4 py-3 text-left',
                    serviceId === sv.id ? 'border-pri bg-pri-soft' : 'border-line bg-surface hover:border-pri-text'
                  )}
                >
                  <span className="text-[0.9375rem] font-bold text-ink">{sv.name}</span>
                  <span className="text-sm text-ink-2">
                    {t("{n} min", { n: sv.durationMin })} · {sv.feeGHS > 0 ? t("GHS {fee}", { fee: sv.feeGHS }) : t("Free")}
                  </span>
                  {sv.description && <span className="text-sm text-ink-3">{sv.description}</span>}
                </button>
              ))}
            </div>
          </fieldset>
        )}

        <fieldset className="m-0 flex flex-col gap-2.5 border-0 p-0">
          <legend className="mb-2.5 text-sm font-bold text-ink">{t("Choose a time")}</legend>
          {times === null ? (
            <p className="m-0 text-[0.9375rem] text-ink-3" role="status">{t("Finding free times…")}</p>
          ) : timesError ? (
            <Notice tone="warn">
              {t(timesError)}{' '}
              <button type="button" onClick={() => setTries(n => n + 1)} className="cursor-pointer font-bold text-pri-text underline">
                {t("Try again")}
              </button>
            </Notice>
          ) : !times.length ? (
            <Notice tone="info">{t("No free times in the next two weeks. Please try another counsellor or check back later.")}</Notice>
          ) : (
            <>
              <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1" role="group" aria-label={t("Days")}>
                {days.map(d => (
                  <button
                    key={d.key}
                    type="button"
                    aria-pressed={day === d.key}
                    onClick={() => {
                      setDay(d.key);
                      setSelectedIso(d.first);
                    }}
                    className={cx(
                      'flex min-h-12 shrink-0 cursor-pointer flex-col items-center justify-center rounded-xl border-2 px-3 py-1.5 text-sm font-semibold',
                      day === d.key ? 'border-pri bg-pri-soft text-pri-ink' : 'border-line bg-surface text-ink hover:border-pri-text'
                    )}
                  >
                    <span>{dayName(d.first)}</span>
                    <span className="text-xs font-medium text-ink-3">{t("{n} free", { n: d.count })}</span>
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-3 gap-2.5">
                {dayTimes.map(iso => (
                  <button key={iso} type="button" aria-pressed={selectedIso === iso} onClick={() => setSelectedIso(iso)} className={option(selectedIso === iso)}>
                    {timeName(iso)}
                  </button>
                ))}
              </div>
            </>
          )}
        </fieldset>

        <fieldset className="m-0 flex flex-col gap-2.5 border-0 p-0">
          <legend className="mb-2.5 text-sm font-bold text-ink">{t("How would you like to talk?")}</legend>
          <div className="grid grid-cols-2 gap-2.5">
            {formats.map(f => (
              <button key={f} type="button" aria-pressed={sessionType === f} onClick={() => setSessionType(f)} className={option(sessionType === f)}>
                {FORMAT_ICON[f]} {t(FORMAT_NAME[f])}
              </button>
            ))}
          </div>
          {formats.includes('voice') && <p className="m-0 text-sm text-ink-3">{t("Voice calls work better on slow connections.")}</p>}
        </fieldset>

        <div className="flex flex-col gap-2">
          <label htmlFor="bk-msg" className="text-sm font-bold text-ink">
            <T text="Anything you would like them to know? <0>(optional)</0>" parts={[<span className="font-medium text-ink-3" />]} />
          </label>
          <textarea
            id="bk-msg"
            rows={3}
            value={message}
            onChange={e => setMessage(e.target.value)}
            placeholder={t("e.g. I want help planning for weekends.")}
            className="w-full rounded-xl border border-line bg-bg px-4 py-3 text-base text-ink focus:border-pri-text focus:outline-none"
          />
        </div>

        <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-line bg-bg p-4 text-[0.9375rem] leading-relaxed text-ink-2">
          <input type="checkbox" checked={shareCheckins} onChange={e => setShareCheckins(e.target.checked)} className="mt-1 h-5 w-5 shrink-0 cursor-pointer" />
          <span>
            <T text="<0>Share my check-ins with this counsellor</0>" parts={[<strong className="text-ink" />]} />
            <br />
            {t("Your streak, mood and craving scores help them prepare. Your chats with the AI companion are never shared. You can stop sharing any time.")}
          </span>
        </label>

        <div className="flex items-center justify-between rounded-2xl border border-line px-4 py-3.5">
          <div>
            <p className="m-0 text-sm text-ink-3">{service ? t("Price") : t("Subsidised price")}</p>
            <p className="m-0 text-xl font-extrabold text-ink">
              <T text="GHS {feeGHS} <0>(about ${feeUSD})</0>" parts={[<span className="text-sm font-medium text-ink-3" />]} vars={{ feeGHS: fee, feeUSD }} />
            </p>
          </div>
          <T text="<0>per session</0>" parts={[<span className="text-sm text-ink-3" />]} />
        </div>

        {bookError && <Notice tone="warn">{t(bookError)}</Notice>}
        {isBooked && (
          <Notice icon={<Check className="h-5 w-5" />}>
            {t("Your request has been sent to {v1} for {selectedSlot}.", { v1: counselor.name.split(',')[0], selectedSlot })}
          </Notice>
        )}
      </div>
    </Modal>
  );
};
