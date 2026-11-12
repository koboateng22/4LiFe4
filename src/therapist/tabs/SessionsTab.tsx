import { newId } from '../../lib/supabase';
import React, { useMemo, useState } from 'react';
import { AlertTriangle, CalendarPlus, XCircle } from 'lucide-react';
import { Button, Card, Field, Modal, Segmented, inputClass } from '../../components/ui';
import type { SessionFormat, SessionType, TherapistProfile, TherapySession } from '../types';
import type { TherapistStore } from '../useTherapistStore';
import type { TherapistNav } from '../TherapistApp';
import { FORMAT_LABEL, SESSION_TYPE_LABEL, at, fmtDateLong, toLocalInput } from '../data';
import { SessionRow, needsNote } from '../parts';
import { ScheduleCalendar } from './ScheduleCalendar';
import { clash as findClash, isWorkingTime } from '../../lib/schedule';

import { t as tr, msg } from '../../i18n';
interface Props {
  therapist: TherapistProfile;
  store: TherapistStore;
  nav: TherapistNav;
}

type View = 'calendar' | 'upcoming' | 'past' | 'notes';

const groupByDay = (list: TherapySession[]) => {
  const groups: Array<{ day: string; items: TherapySession[] }> = [];
  list.forEach(s => {
    const day = new Date(s.start).toDateString();
    const g = groups.find(x => x.day === day);
    if (g) g.items.push(s);
    else groups.push({ day, items: [s] });
  });
  return groups;
};

export const SessionsTab: React.FC<Props> = ({ therapist, store, nav }) => {
  const [view, setView] = useState<View>('calendar');
  const [bookOpen, setBookOpen] = useState(false);
  const [bookAt, setBookAt] = useState<string | undefined>();
  const book = (startIso?: string) => {
    setBookAt(startIso);
    setBookOpen(true);
  };
  const { sessions, clients } = store.data;
  const clientOf = (id: string) => clients.find(c => c.id === id);

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const upcoming = sessions
    .filter(s => (s.status === 'scheduled' || s.status === 'in_progress') && new Date(s.start) >= startOfToday)
    .sort((a, b) => a.start.localeCompare(b.start));
  const past = sessions
    .filter(s => s.status === 'completed' || s.status === 'cancelled' || s.status === 'no_show' || (s.status === 'scheduled' && new Date(s.start) < startOfToday))
    .sort((a, b) => b.start.localeCompare(a.start));
  const notes = sessions.filter(needsNote).sort((a, b) => b.start.localeCompare(a.start));

  const list = view === 'upcoming' ? upcoming : view === 'past' ? past : notes;
  const groups = groupByDay(list);

  return (
    <div className="flex flex-col gap-6 animate-fadeIn">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented<View>
          label={tr("Which sessions")}
          value={view}
          onChange={setView}
          options={[
            { value: 'calendar', label: msg('Calendar') },
            { value: 'upcoming', label: tr('Coming up ({count})', { count: upcoming.length }) },
            { value: 'past', label: msg('Past') },
            { value: 'notes', label: tr('Notes to finish ({count})', { count: notes.length }) },
          ]}
        />
        <Button icon={<CalendarPlus className="h-5 w-5" />} onClick={() => book()} disabled={clients.length === 0}>
          {tr("Book a session")}
        </Button>
      </div>

      {view === 'calendar' ? (
        <ScheduleCalendar therapist={therapist} store={store} nav={nav} onBook={iso => clients.length > 0 && book(iso)} />
      ) : list.length === 0 ? (
        <Card className="flex flex-col items-start gap-2">
          <p className="m-0 text-base font-bold text-ink">
            {view === 'notes' ? tr("All your notes are finished.") : view === 'past' ? tr("No past sessions yet.") : tr("No sessions booked.")}
          </p>
          <p className="m-0 text-[0.9375rem] text-ink-2">
            {clients.length === 0 ? tr("When you accept a request, the first session appears here.") : tr("Use “Book a session” to add one for a client.")}
          </p>
        </Card>
      ) : (
        groups.map(g => (
          <Card as="section" key={g.day} className="flex flex-col gap-1" aria-label={fmtDateLong(g.items[0].start)}>
            <h2 className="m-0 mb-1 text-base font-bold text-ink-2">{fmtDateLong(g.items[0].start)}</h2>
            <div className="-mx-3 flex flex-col divide-y divide-line">
              {g.items.map(s => (
                <SessionRow key={s.id} session={s} client={clientOf(s.clientId)} onOpen={() => nav.openSession(s.id)} />
              ))}
            </div>
          </Card>
        ))
      )}

      <BookSessionModal isOpen={bookOpen} onClose={() => setBookOpen(false)} therapist={therapist} store={store} startAt={bookAt} />
    </div>
  );
};

/**
 * Book a session for an existing client. Warns (but allows) a time outside your hours; a time that
 * overlaps another session can't be booked (the database refuses it too).
 */
export const BookSessionModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  therapist: TherapistProfile;
  store: TherapistStore;
  clientId?: string;
  /** Start here (from a click on the calendar) */
  startAt?: string;
}> = ({ isOpen, onClose, therapist, store, clientId, startAt }) => {
  const services = (store.data.services || []).filter(x => x.active);
  const [serviceId, setServiceId] = useState('');
  const active = store.data.clients.filter(c => c.status !== 'discharged');
  const [client, setClient] = useState(clientId || active[0]?.id || '');
  const [when, setWhen] = useState(toLocalInput(at(1, Number(therapist.startTime.split(':')[0]) || 10)));
  const [length, setLength] = useState(therapist.sessionLength);
  const [format, setFormat] = useState<SessionFormat>(therapist.formats[0] || 'video');
  const [type, setType] = useState<SessionType>('follow_up');
  const [topic, setTopic] = useState('');

  React.useEffect(() => {
    if (isOpen && clientId) setClient(clientId);
  }, [isOpen, clientId]);
  React.useEffect(() => {
    if (isOpen && startAt) setWhen(toLocalInput(startAt));
  }, [isOpen, startAt]);

  const chooseService = (id: string) => {
    setServiceId(id);
    const sv = services.find(x => x.id === id);
    if (sv) {
      setLength(sv.durationMin);
      if (!sv.formats.includes(format)) setFormat(sv.formats[0]);
    }
  };

  const { warnings, overlap } = useMemo(() => {
    const out: string[] = [];
    const d = new Date(when);
    if (isNaN(d.getTime())) return { warnings: out, overlap: false };
    if (!isWorkingTime(d, therapist, store.data.timeOff || [])) out.push(tr('This is outside your usual hours.'));
    if (d.getTime() < Date.now()) out.push(tr('This time is in the past.'));
    const busy = store.data.sessions.filter(s => s.status === 'scheduled' || s.status === 'in_progress');
    return { warnings: out, overlap: !!findClash(d.toISOString(), length, busy) };
  }, [when, length, store.data.sessions, store.data.timeOff, therapist]);

  const save = () => {
    if (!client || overlap) return;
    store.addSession({
      id: newId(),
      clientId: client,
      start: new Date(when).toISOString(),
      durationMin: length,
      format,
      type,
      status: 'scheduled',
      topic: topic.trim() || undefined,
      serviceId: serviceId || undefined,
    });
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={tr("Book a session")}
      size="sm"
      footer={
        <div className="flex justify-end gap-3">
          <Button variant="ghost" onClick={onClose}>
            {tr("Cancel")}
          </Button>
          <Button onClick={save} disabled={!client || overlap}>
            {tr("Book session")}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-5">
        <Field label={tr("Client")} htmlFor="bk-client">
          <select id="bk-client" value={client} onChange={e => setClient(e.target.value)} className={inputClass}>
            {active.map(c => (
              <option key={c.id} value={c.id}>
                {c.nickname}
              </option>
            ))}
          </select>
        </Field>
        <Field label={tr("Date and time")} htmlFor="bk-when">
          <input id="bk-when" type="datetime-local" value={when} onChange={e => setWhen(e.target.value)} className={inputClass} />
        </Field>
        {overlap && (
          <div className="flex items-start gap-2.5 rounded-xl bg-danger-soft px-4 py-3 text-[0.9375rem] text-danger-text" role="alert">
            <XCircle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
            <span>{tr("That time overlaps another session. Please choose another time.")}</span>
          </div>
        )}
        {!overlap && warnings.length > 0 && (
          <div className="flex items-start gap-2.5 rounded-xl bg-warn-soft px-4 py-3 text-[0.9375rem] text-warn" role="status">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
            <span>{warnings.join(' ')} {tr("You can still book it.")}</span>
          </div>
        )}
        {services.length > 0 && (
          <Field label={tr("Service")} htmlFor="bk-svc" optional>
            <select id="bk-svc" value={serviceId} onChange={e => chooseService(e.target.value)} className={inputClass}>
              <option value="">{tr("No particular service")}</option>
              {services.map(sv => (
                <option key={sv.id} value={sv.id}>
                  {sv.name} · {tr("{n} min", { n: sv.durationMin })}
                </option>
              ))}
            </select>
          </Field>
        )}
        <div className="grid grid-cols-2 gap-4">
          <Field label={tr("Length")} htmlFor="bk-len">
            <select id="bk-len" value={length} onChange={e => setLength(Number(e.target.value))} className={inputClass}>
              {[...new Set([30, 50, 60, 90, length])].sort((a, b) => a - b).map(m => (
                <option key={m} value={m}>
                  {tr("{m} minutes", { m })}
                </option>
              ))}
            </select>
          </Field>
          <Field label={tr("How")} htmlFor="bk-fmt">
            <select id="bk-fmt" value={format} onChange={e => setFormat(e.target.value as SessionFormat)} className={inputClass}>
              {(Object.keys(FORMAT_LABEL) as SessionFormat[]).map(f => (
                <option key={f} value={f}>
                  {FORMAT_LABEL[f]}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <Field label={tr("Type of session")} htmlFor="bk-type">
          <select id="bk-type" value={type} onChange={e => setType(e.target.value as SessionType)} className={inputClass}>
            {(Object.keys(SESSION_TYPE_LABEL) as SessionType[]).map(t => (
              <option key={t} value={t}>
                {SESSION_TYPE_LABEL[t]}
              </option>
            ))}
          </select>
        </Field>
        <Field label={tr("Topic")} htmlFor="bk-topic" optional>
          <input id="bk-topic" value={topic} onChange={e => setTopic(e.target.value)} placeholder={tr("e.g. Planning for the weekend")} className={inputClass} />
        </Field>
      </div>
    </Modal>
  );
};
