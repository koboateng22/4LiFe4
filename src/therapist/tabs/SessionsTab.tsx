import { newId } from '../../lib/supabase';
import React, { useMemo, useState } from 'react';
import { AlertTriangle, CalendarPlus } from 'lucide-react';
import { Button, Card, Field, Modal, Segmented, inputClass } from '../../components/ui';
import type { SessionFormat, SessionType, TherapistProfile, TherapySession, Weekday } from '../types';
import type { TherapistStore } from '../useTherapistStore';
import type { TherapistNav } from '../TherapistApp';
import { FORMAT_LABEL, SESSION_TYPE_LABEL, WEEKDAYS, at, fmtDateLong, toLocalInput } from '../data';
import { SessionRow, needsNote } from '../parts';

interface Props {
  therapist: TherapistProfile;
  store: TherapistStore;
  nav: TherapistNav;
}

type View = 'upcoming' | 'past' | 'notes';

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
  const [view, setView] = useState<View>('upcoming');
  const [bookOpen, setBookOpen] = useState(false);
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
          label="Which sessions"
          value={view}
          onChange={setView}
          options={[
            { value: 'upcoming', label: `Coming up (${upcoming.length})` },
            { value: 'past', label: 'Past' },
            { value: 'notes', label: `Notes to finish (${notes.length})` },
          ]}
        />
        <Button icon={<CalendarPlus className="h-5 w-5" />} onClick={() => setBookOpen(true)} disabled={clients.length === 0}>
          Book a session
        </Button>
      </div>

      {list.length === 0 ? (
        <Card className="flex flex-col items-start gap-2">
          <p className="m-0 text-base font-bold text-ink">
            {view === 'notes' ? 'All your notes are finished.' : view === 'past' ? 'No past sessions yet.' : 'No sessions booked.'}
          </p>
          <p className="m-0 text-[0.9375rem] text-ink-2">
            {clients.length === 0 ? 'When you accept a request, the first session appears here.' : 'Use “Book a session” to add one for a client.'}
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

      <BookSessionModal isOpen={bookOpen} onClose={() => setBookOpen(false)} therapist={therapist} store={store} />
    </div>
  );
};

/** Book a session for an existing client. Warns (but allows) times outside your hours or overlapping another session. */
export const BookSessionModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  therapist: TherapistProfile;
  store: TherapistStore;
  clientId?: string;
}> = ({ isOpen, onClose, therapist, store, clientId }) => {
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

  const warnings = useMemo(() => {
    const out: string[] = [];
    const d = new Date(when);
    if (isNaN(d.getTime())) return out;
    const day = WEEKDAYS[(d.getDay() + 6) % 7] as Weekday;
    const hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    if (!therapist.days.includes(day) || hm < therapist.startTime || hm >= therapist.endTime) out.push('This is outside your usual hours.');
    const start = d.getTime();
    const end = start + length * 60000;
    const clash = store.data.sessions.find(s => {
      if (s.status === 'cancelled') return false;
      const a = new Date(s.start).getTime();
      return start < a + s.durationMin * 60000 && end > a;
    });
    if (clash) out.push('This overlaps another session.');
    if (start < Date.now()) out.push('This time is in the past.');
    return out;
  }, [when, length, store.data.sessions, therapist]);

  const save = () => {
    if (!client) return;
    store.addSession({
      id: newId(),
      clientId: client,
      start: new Date(when).toISOString(),
      durationMin: length,
      format,
      type,
      status: 'scheduled',
      topic: topic.trim() || undefined,
    });
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Book a session"
      size="sm"
      footer={
        <div className="flex justify-end gap-3">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save} disabled={!client}>
            Book session
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-5">
        <Field label="Client" htmlFor="bk-client">
          <select id="bk-client" value={client} onChange={e => setClient(e.target.value)} className={inputClass}>
            {active.map(c => (
              <option key={c.id} value={c.id}>
                {c.nickname}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Date and time" htmlFor="bk-when">
          <input id="bk-when" type="datetime-local" value={when} onChange={e => setWhen(e.target.value)} className={inputClass} />
        </Field>
        {warnings.length > 0 && (
          <div className="flex items-start gap-2.5 rounded-xl bg-warn-soft px-4 py-3 text-[0.9375rem] text-warn" role="status">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
            <span>{warnings.join(' ')} You can still book it.</span>
          </div>
        )}
        <div className="grid grid-cols-2 gap-4">
          <Field label="Length" htmlFor="bk-len">
            <select id="bk-len" value={length} onChange={e => setLength(Number(e.target.value))} className={inputClass}>
              {[30, 50, 60, 90].map(m => (
                <option key={m} value={m}>
                  {m} minutes
                </option>
              ))}
            </select>
          </Field>
          <Field label="How" htmlFor="bk-fmt">
            <select id="bk-fmt" value={format} onChange={e => setFormat(e.target.value as SessionFormat)} className={inputClass}>
              {(Object.keys(FORMAT_LABEL) as SessionFormat[]).map(f => (
                <option key={f} value={f}>
                  {FORMAT_LABEL[f]}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <Field label="Type of session" htmlFor="bk-type">
          <select id="bk-type" value={type} onChange={e => setType(e.target.value as SessionType)} className={inputClass}>
            {(Object.keys(SESSION_TYPE_LABEL) as SessionType[]).map(t => (
              <option key={t} value={t}>
                {SESSION_TYPE_LABEL[t]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Topic" htmlFor="bk-topic" optional>
          <input id="bk-topic" value={topic} onChange={e => setTopic(e.target.value)} placeholder="e.g. Planning for the weekend" className={inputClass} />
        </Field>
      </div>
    </Modal>
  );
};
