import React, { useState } from 'react';
import { BriefcaseMedical, Check, Clock, Inbox, X } from 'lucide-react';
import { Avatar, Badge, Button, Card, Field, Modal, Notice, Segmented, inputClass } from '../../components/ui';
import type { SessionRequest, TherapistProfile } from '../types';
import type { TherapistStore } from '../useTherapistStore';
import type { TherapistNav } from '../TherapistApp';
import { FORMAT_LABEL, ago, fmtDay, fmtTime, focusLabel, toLocalInput } from '../data';
import { FormatIcon, SharingNote, avg } from '../parts';
import { clash, isWorkingTime } from '../../lib/schedule';

import { t, T, msg } from '../../i18n';
interface Props {
  therapist: TherapistProfile;
  store: TherapistStore;
  nav: TherapistNav;
}

const DECLINE_REASONS = [msg('My schedule is full right now'), msg('This is outside my area of practice'), msg('I may not be the right fit'), msg('Other reason')];

export const RequestsTab: React.FC<Props> = ({ therapist, store, nav }) => {
  const [view, setView] = useState<'new' | 'done'>('new');
  const [accepting, setAccepting] = useState<SessionRequest | null>(null);
  const [declining, setDeclining] = useState<SessionRequest | null>(null);
  const [when, setWhen] = useState('');
  const [reason, setReason] = useState(DECLINE_REASONS[0]);
  const [done, setDone] = useState('');

  const fresh = store.requests.filter(r => r.status === 'new');
  const handled = store.requests.filter(r => r.status !== 'new');
  const list = view === 'new' ? fresh : handled;

  /** The service asked for (name and length), if any */
  const serviceOf = (r: SessionRequest) => {
    const sv = (store.data.services || []).find(x => x.id === r.serviceId);
    return r.serviceId || r.serviceName ? { name: sv?.name || r.serviceName || '', min: sv?.durationMin || r.serviceMin || therapist.sessionLength } : null;
  };
  const acceptLen = accepting ? serviceOf(accepting)?.min || therapist.sessionLength : therapist.sessionLength;
  const acceptAt = new Date(when);
  const acceptValid = !isNaN(acceptAt.getTime());
  const acceptClash =
    acceptValid && !!clash(acceptAt.toISOString(), acceptLen, store.data.sessions.filter(x => x.status === 'scheduled' || x.status === 'in_progress'));
  const acceptOutside = acceptValid && !isWorkingTime(acceptAt, therapist, store.data.timeOff || []);

  const openAccept = (r: SessionRequest) => {
    setWhen(toLocalInput(r.preferredTime));
    setAccepting(r);
  };

  return (
    <div className="flex flex-col gap-6 animate-fadeIn">
      <Segmented
        label={t("Which requests")}
        value={view}
        onChange={v => setView(v as 'new' | 'done')}
        options={[
          { value: 'new', label: `New (${fresh.length})` },
          { value: 'done', label: `Answered (${handled.length})` },
        ]}
      />

      {done && (
        <Notice icon={<Check className="h-5 w-5" />}>
          {done}{' '}
          <button type="button" className="font-bold underline cursor-pointer" onClick={() => nav.go('sessions')}>
            {t("See sessions")}
          </button>
        </Notice>
      )}

      {list.length === 0 ? (
        <Card className="flex flex-col items-start gap-2">
          <Inbox className="h-6 w-6 text-ink-3" aria-hidden="true" />
          <p className="m-0 text-base font-bold text-ink">{view === 'new' ? t("No new requests") : t("Nothing answered yet")}</p>
          <p className="m-0 text-[0.9375rem] text-ink-2">{t("When someone books you from the 4Life app, their request appears here.")}</p>
        </Card>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-4 p-0">
          {list.map(r => {
            const recentCraving = r.snapshot ? avg(r.snapshot.craving) : null;
            return (
              <li key={r.id}>
                <Card as="article" className="flex flex-col gap-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <Avatar tone="muted" name={r.clientNickname} size={48} />
                      <div className="min-w-0">
                        <h2 className="m-0 truncate text-lg font-bold text-ink">{r.clientNickname}</h2>
                        <p className="m-0 text-[0.9375rem] text-ink-2">
                          {t("Wants help with")} <strong className="text-ink">{focusLabel(r.focus).toLowerCase()}</strong> {t("· sent")} {ago(r.createdAt)}
                        </p>
                      </div>
                    </div>
                    {r.status !== 'new' && <Badge tone={r.status === 'accepted' ? 'pri' : 'muted'}>{r.status === 'accepted' ? t("Accepted") : t("Declined")}</Badge>}
                  </div>

                  {r.message && <blockquote className="m-0 rounded-xl border-l-4 border-pri bg-bg px-4 py-3 text-base leading-relaxed text-ink-2">“{t(r.message)}”</blockquote>}

                  <div className="flex flex-wrap gap-x-6 gap-y-2 text-[0.9375rem] text-ink-2">
                    <span className="inline-flex items-center gap-2">
                      <Clock className="h-4 w-4 text-ink-3" aria-hidden="true" />
                      {t("Prefers")} <strong className="text-ink">{fmtDay(r.preferredTime)}, {fmtTime(r.preferredTime)}</strong>
                    </span>
                    <span className="inline-flex items-center gap-2">
                      <FormatIcon format={r.format} className="h-4 w-4 text-ink-3" />
                      {FORMAT_LABEL[r.format]}
                    </span>
                    {serviceOf(r)?.name && (
                      <span className="inline-flex items-center gap-2">
                        <BriefcaseMedical className="h-4 w-4 text-ink-3" aria-hidden="true" />
                        <strong className="text-ink">{serviceOf(r)!.name}</strong> · {t("{n} min", { n: serviceOf(r)!.min })}
                      </span>
                    )}
                    <SharingNote shares={r.sharesCheckins} />
                  </div>

                  {r.sharesCheckins && r.snapshot && (
                    <p className="m-0 rounded-xl bg-bg px-4 py-3 text-[0.9375rem] text-ink-2">
                      <T text="<0>{streakDays} days</0> clean · average craving last week" parts={[<strong className="text-ink" />]} vars={{ streakDays: r.snapshot.streakDays }} />
                      <strong className="text-ink">{recentCraving != null ? t("{v0} of 10", { v0: recentCraving.toFixed(1) }) : '—'}</strong>
                    </p>
                  )}

                  {r.status === 'new' && (
                    <div className="flex flex-wrap gap-3 border-t border-line pt-4">
                      <Button icon={<Check className="h-5 w-5" />} onClick={() => openAccept(r)}>
                        {t("Accept")}
                      </Button>
                      <Button variant="secondary" icon={<X className="h-5 w-5" />} onClick={() => setDeclining(r)}>
                        {t("Decline")}
                      </Button>
                    </div>
                  )}
                </Card>
              </li>
            );
          })}
        </ul>
      )}

      {/* Accept: confirm or change the time */}
      <Modal
        isOpen={!!accepting}
        onClose={() => setAccepting(null)}
        title={t("Accept {v0}", { v0: accepting?.clientNickname || '' })}
        size="sm"
        footer={
          <div className="flex justify-end gap-3">
            <Button variant="ghost" onClick={() => setAccepting(null)}>
              {t("Cancel")}
            </Button>
            <Button
              disabled={!acceptValid || acceptClash}
              onClick={() => {
                if (!accepting || !acceptValid || acceptClash) return;
                store.resolveRequest(accepting, 'accepted', new Date(when).toISOString());
                setDone(t('{name} is now your client. Their first session is booked for {day}, {time}.', { name: accepting.clientNickname, day: fmtDay(new Date(when).toISOString()), time: fmtTime(new Date(when).toISOString()) }));
                setAccepting(null);
              }}
            >
              {t("Accept and book")}
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-4">
          <p className="m-0 text-base text-ink-2">{t("The first session is a getting-to-know-you session. Keep their preferred time or choose another.")}</p>
          <Field label={t("First session")} htmlFor="ac-when">
            <input id="ac-when" type="datetime-local" value={when} onChange={e => setWhen(e.target.value)} className={inputClass} />
          </Field>
          <p className="m-0 text-sm text-ink-3">{t("Length: {n} minutes", { n: acceptLen })}</p>
          {acceptClash ? (
            <Notice tone="danger">{t("That time overlaps another session. Please choose another time.")}</Notice>
          ) : (
            acceptOutside && <Notice tone="warn">{t("This is outside your usual hours.")} {t("You can still book it.")}</Notice>
          )}
        </div>
      </Modal>

      {/* Decline with a reason */}
      <Modal
        isOpen={!!declining}
        onClose={() => setDeclining(null)}
        title={t("Decline {v0}?", { v0: declining?.clientNickname || '' })}
        size="sm"
        footer={
          <div className="flex justify-end gap-3">
            <Button variant="ghost" onClick={() => setDeclining(null)}>
              {t("Keep request")}
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                if (!declining) return;
                store.resolveRequest(declining, 'declined', undefined, reason);
                setDone(t("You declined {name}'s request.", { name: declining.clientNickname }));
                setDeclining(null);
              }}
            >
              {t("Decline request")}
            </Button>
          </div>
        }
      >
        <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
          <legend className="mb-2 p-0 text-sm font-bold text-ink">{t("Reason")}</legend>
          {DECLINE_REASONS.map(r => (
            <label key={r} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border border-line px-4 text-[0.9375rem] text-ink">
              <input type="radio" name="decline" checked={reason === r} onChange={() => setReason(r)} className="h-5 w-5" />
              {r}
            </label>
          ))}
          <p className="m-0 mt-1 text-sm text-ink-3">{t("The reason helps us match people better. It is not shown to the client.")}</p>
        </fieldset>
      </Modal>
    </div>
  );
};
