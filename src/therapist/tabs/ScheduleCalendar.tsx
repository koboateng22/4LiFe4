import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CalendarClock, ChevronLeft, ChevronRight, Clock, Video, XCircle } from 'lucide-react';
import { Avatar, Badge, Button, Field, Modal, Notice, Segmented, cx, inputClass } from '../../components/ui';
import type { TherapistProfile, TherapySession } from '../types';
import type { TherapistStore } from '../useTherapistStore';
import type { TherapistNav } from '../TherapistApp';
import { FORMAT_LABEL, SESSION_TYPE_LABEL, fmtDateLong, fmtTime, toLocalInput } from '../data';
import { FormatIcon, sessionState } from '../parts';
import { dayKey, isTimeOff, isWorkingTime, type Hours } from '../../lib/schedule';

import { t } from '../../i18n';

type Mode = 'day' | 'week' | 'month';
const HOUR_PX = 56;

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const startOfWeek = (d: Date) => addDays(startOfDay(d), -((d.getDay() + 6) % 7)); // Monday
const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();
const active = (s: TherapySession) => s.status === 'scheduled' || s.status === 'in_progress';
/** Ghana-time date of a local calendar day (time off is stored as Ghana dates) */
const ghanaKey = (d: Date) => dayKey(new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12));
/** The therapist's hours (Ghana time) as local hours on this device */
const localHour = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  const d = new Date(Date.UTC(2026, 0, 5, h, m || 0));
  return d.getHours() + d.getMinutes() / 60;
};

/** Side-by-side lanes for sessions that overlap (older records may; new ones can't) */
function lanes(list: TherapySession[]) {
  const sorted = [...list].sort((a, b) => a.start.localeCompare(b.start));
  const ends: number[] = [];
  const out = new Map<string, { lane: number; of: number }>();
  const groups: TherapySession[][] = [];
  let group: TherapySession[] = [];
  let groupEnd = 0;
  for (const s of sorted) {
    const st = new Date(s.start).getTime();
    const en = st + s.durationMin * 60000;
    if (group.length && st >= groupEnd) {
      groups.push(group);
      group = [];
      ends.length = 0;
    }
    let lane = ends.findIndex(e => e <= st);
    if (lane === -1) lane = ends.length;
    ends[lane] = en;
    out.set(s.id, { lane, of: 1 });
    group.push(s);
    groupEnd = Math.max(groupEnd, en);
  }
  if (group.length) groups.push(group);
  for (const g of groups) {
    const n = Math.max(...g.map(s => out.get(s.id)!.lane)) + 1;
    g.forEach(s => (out.get(s.id)!.of = n));
  }
  return out;
}

/**
 * The therapist's calendar: day, week and month. Working hours are white, breaks, days off and
 * closed hours are shaded. Click a session for its details (open, move, cancel); click a free
 * time to book a session there.
 */
export const ScheduleCalendar: React.FC<{
  therapist: TherapistProfile;
  store: TherapistStore;
  nav: TherapistNav;
  onBook: (startIso?: string) => void;
}> = ({ therapist, store, nav, onBook }) => {
  const [mode, setMode] = useState<Mode>(() => (typeof window !== 'undefined' && window.innerWidth < 640 ? 'day' : 'week'));
  const [anchor, setAnchor] = useState(() => startOfDay(new Date()));
  const [openId, setOpenId] = useState<string | null>(null);
  const { sessions, clients } = store.data;
  const timeOff = store.data.timeOff || [];
  const hours: Hours = therapist;
  const clientOf = (id: string) => clients.find(c => c.id === id);

  const days = useMemo(() => {
    if (mode === 'day') return [anchor];
    if (mode === 'week') return Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(anchor), i));
    const first = startOfWeek(new Date(anchor.getFullYear(), anchor.getMonth(), 1));
    return Array.from({ length: 42 }, (_, i) => addDays(first, i));
  }, [mode, anchor]);

  const step = (dir: 1 | -1) =>
    setAnchor(a => (mode === 'day' ? addDays(a, dir) : mode === 'week' ? addDays(a, 7 * dir) : new Date(a.getFullYear(), a.getMonth() + dir, 1)));

  const title =
    mode === 'day'
      ? fmtDateLong(anchor.toISOString())
      : mode === 'week'
        ? `${days[0].toLocaleDateString([], { day: 'numeric', month: 'short' })} – ${days[6].toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' })}`
        : anchor.toLocaleDateString([], { month: 'long', year: 'numeric' });

  const inDay = (d: Date) => sessions.filter(s => sameDay(new Date(s.start), d));

  // Hours shown: at least 8:00–18:00, widened to the working hours and any session in view
  const [fromH, toH] = useMemo(() => {
    let lo = Math.min(8, Math.floor(localHour(therapist.startTime)));
    let hi = Math.max(18, Math.ceil(localHour(therapist.endTime)));
    if (mode !== 'month')
      days.forEach(d =>
        inDay(d).forEach(s => {
          const st = new Date(s.start);
          lo = Math.min(lo, st.getHours());
          hi = Math.max(hi, Math.min(24, Math.ceil(st.getHours() + (st.getMinutes() + s.durationMin) / 60)));
        })
      );
    return [lo, hi];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days, sessions, therapist.startTime, therapist.endTime, mode]);

  const now = new Date();
  const open = sessions.find(s => s.id === openId) || null;

  // The day and week views scroll inside themselves and open at the start of the working day
  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (mode !== 'month' && scroller.current) scroller.current.scrollTop = Math.max(0, (Math.floor(localHour(therapist.startTime)) - fromH) * HOUR_PX);
  }, [mode, anchor, fromH, therapist.startTime]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={() => step(-1)} aria-label={t('Previous')} icon={<ChevronLeft className="h-5 w-5" />} />
          <Button variant="secondary" size="sm" onClick={() => setAnchor(startOfDay(new Date()))}>
            {t('Today')}
          </Button>
          <Button variant="secondary" size="sm" onClick={() => step(1)} aria-label={t('Next')} icon={<ChevronRight className="h-5 w-5" />} />
          <h2 className="m-0 ml-1 text-base font-bold text-ink sm:text-lg" aria-live="polite">
            {title}
          </h2>
        </div>
        <Segmented<Mode>
          label={t('Calendar view')}
          value={mode}
          onChange={setMode}
          options={[
            { value: 'day', label: t('Day') },
            { value: 'week', label: t('Week') },
            { value: 'month', label: t('Month') },
          ]}
        />
      </div>

      {mode === 'month' ? (
        <div className="overflow-hidden rounded-2xl border border-line bg-surface">
          <div className="grid grid-cols-7 border-b border-line bg-muted text-center text-xs font-bold uppercase tracking-wide text-ink-3">
            {days.slice(0, 7).map(d => (
              <div key={d.toISOString()} className="py-2">
                {d.toLocaleDateString([], { weekday: 'short' })}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {days.map(d => {
              const list = inDay(d).filter(s => s.status !== 'cancelled').sort((a, b) => a.start.localeCompare(b.start));
              const off = isTimeOff(ghanaKey(d), timeOff);
              const outside = d.getMonth() !== anchor.getMonth();
              return (
                <button
                  key={d.toISOString()}
                  type="button"
                  onClick={() => {
                    setAnchor(d);
                    setMode('day');
                  }}
                  aria-label={`${fmtDateLong(d.toISOString())}: ${t('{n} sessions', { n: list.length })}${off ? ', ' + t('Day off') : ''}`}
                  className={cx(
                    'flex min-h-[5.5rem] cursor-pointer flex-col items-stretch gap-1 border-b border-r border-line p-1.5 text-left transition-colors hover:bg-pri-soft sm:min-h-[6.5rem]',
                    off ? 'bg-muted' : 'bg-surface',
                    outside && 'opacity-50'
                  )}
                >
                  <span
                    className={cx(
                      'inline-flex h-7 w-7 items-center justify-center self-start rounded-full text-sm font-bold',
                      sameDay(d, now) ? 'bg-pri text-[#fff]' : 'text-ink'
                    )}
                  >
                    {d.getDate()}
                  </span>
                  {off && <span className="truncate text-[0.6875rem] font-semibold text-ink-3">{t('Day off')}</span>}
                  {list.slice(0, 3).map(s => (
                    <span key={s.id} className="hidden truncate rounded-md bg-pri-soft px-1.5 py-0.5 text-xs font-semibold text-pri-ink sm:block">
                      {fmtTime(s.start)} {clientOf(s.clientId)?.nickname || ''}
                    </span>
                  ))}
                  {list.length > 0 && (
                    <span className="text-xs font-semibold text-ink-2 sm:hidden">{t('{n} sessions', { n: list.length })}</span>
                  )}
                  {list.length > 3 && <span className="hidden text-xs font-semibold text-ink-3 sm:block">{t('+{n} more', { n: list.length - 3 })}</span>}
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        <div ref={scroller} className="max-h-[min(70vh,46rem)] overflow-auto overscroll-contain rounded-2xl border border-line bg-surface">
          <div className={cx('flex', mode === 'week' && 'min-w-[46rem]')}>
            {/* hour labels */}
            <div className="w-14 shrink-0 border-r border-line">
              <div className="sticky top-0 z-40 h-12 border-b border-line bg-surface" />
              <div className="relative" style={{ height: (toH - fromH) * HOUR_PX }}>
                {Array.from({ length: toH - fromH }, (_, i) => (
                  <span key={i} className="absolute right-2 -translate-y-1/2 text-xs text-ink-3" style={{ top: i * HOUR_PX }}>
                    {i === 0 ? '' : new Date(2026, 0, 5, fromH + i).toLocaleTimeString([], { hour: 'numeric' })}
                  </span>
                ))}
              </div>
            </div>

            {days.map(d => {
              const list = inDay(d);
              const lane = lanes(list.filter(s => s.status !== 'cancelled'));
              const off = isTimeOff(ghanaKey(d), timeOff);
              const base = new Date(d.getFullYear(), d.getMonth(), d.getDate(), fromH).getTime();
              const blocks = Array.from({ length: (toH - fromH) * 2 }, (_, i) => new Date(base + i * 30 * 60000));
              return (
                <div key={d.toISOString()} className="min-w-0 flex-1 border-r border-line last:border-r-0">
                  <div className={cx('sticky top-0 z-40 flex h-12 flex-col items-center justify-center border-b border-line', sameDay(d, now) ? 'bg-pri-soft' : 'bg-surface')}>
                    <span className="text-xs font-bold uppercase tracking-wide text-ink-3">{d.toLocaleDateString([], { weekday: 'short' })}</span>
                    <span className={cx('text-sm font-bold', sameDay(d, now) ? 'text-pri-ink' : 'text-ink')}>
                      {d.getDate()}
                      {off && <span className="ml-1 text-xs font-semibold text-ink-3">· {t('Day off')}</span>}
                    </span>
                  </div>
                  <div
                    className="relative cursor-copy"
                    style={{ height: (toH - fromH) * HOUR_PX }}
                    onClick={e => {
                      if (e.target !== e.currentTarget) return;
                      const y = e.nativeEvent.offsetY;
                      const mins = Math.floor((y / HOUR_PX) * 4) * 15;
                      onBook(new Date(base + mins * 60000).toISOString());
                    }}
                    title={t('Click a free time to book a session')}
                  >
                    {/* closed hours, breaks and days off */}
                    {blocks.map((b, i) =>
                      isWorkingTime(b, hours, timeOff) ? null : (
                        <div
                          key={i}
                          aria-hidden="true"
                          className="pointer-events-none absolute inset-x-0 bg-[repeating-linear-gradient(135deg,var(--color-muted)_0_6px,transparent_6px_12px)] opacity-80"
                          style={{ top: i * (HOUR_PX / 2), height: HOUR_PX / 2 }}
                        />
                      )
                    )}
                    {Array.from({ length: toH - fromH }, (_, i) => (
                      <div key={i} aria-hidden="true" className="pointer-events-none absolute inset-x-0 border-t border-line" style={{ top: i * HOUR_PX }} />
                    ))}
                    {sameDay(d, now) && now.getHours() >= fromH && now.getHours() < toH && (
                      <div
                        aria-hidden="true"
                        className="pointer-events-none absolute inset-x-0 z-10 border-t-2 border-danger"
                        style={{ top: ((now.getTime() - base) / 3600000) * HOUR_PX }}
                      />
                    )}
                    {list.map(s => {
                      const st = new Date(s.start);
                      const top = ((st.getTime() - base) / 3600000) * HOUR_PX;
                      const h = Math.max(22, (s.durationMin / 60) * HOUR_PX - 2);
                      const l = lane.get(s.id) || { lane: 0, of: 1 };
                      const state = sessionState(s);
                      const client = clientOf(s.clientId);
                      const cancelled = s.status === 'cancelled';
                      return (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => setOpenId(s.id)}
                          aria-label={`${fmtTime(s.start)}, ${s.durationMin} min, ${client?.nickname || t('Client')}, ${t(SESSION_TYPE_LABEL[s.type])}, ${t(state.label)}`}
                          className={cx(
                            'absolute z-20 flex cursor-pointer flex-col overflow-hidden rounded-lg border-l-4 px-2 py-1 text-left text-xs shadow-sm transition-transform hover:z-30 hover:scale-[1.02] focus-visible:z-30',
                            cancelled
                              ? 'border-ink-3 bg-muted text-ink-3 line-through'
                              : state.tone === 'warn'
                                ? 'border-warn-bar bg-warn-soft text-warn'
                                : state.tone === 'info'
                                  ? 'border-info bg-info-soft text-info'
                                  : 'border-pri bg-pri-soft text-pri-ink'
                          )}
                          style={{
                            top,
                            height: h,
                            left: cancelled ? '55%' : `calc(${(l.lane / l.of) * 100}% + 2px)`,
                            width: cancelled ? 'calc(45% - 4px)' : `calc(${100 / l.of}% - 4px)`,
                          }}
                        >
                          <span className="truncate font-bold">
                            {fmtTime(s.start)} {client?.nickname || ''}
                          </span>
                          {h > 40 && (
                            <span className="flex items-center gap-1 truncate">
                              <FormatIcon format={s.format} className="h-3 w-3 shrink-0" />
                              {t(SESSION_TYPE_LABEL[s.type])}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <p className="m-0 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-ink-3">
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden="true" className="inline-block h-3 w-5 rounded-sm border border-line bg-surface" /> {t('Working hours')}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden="true" className="inline-block h-3 w-5 rounded-sm bg-[repeating-linear-gradient(135deg,var(--color-muted)_0_4px,transparent_4px_8px)] border border-line" />{' '}
          {t('Closed, break or day off')}
        </span>
        {mode !== 'month' && <span>{t('Click a free time to book a session.')}</span>}
      </p>

      <SessionDetailModal session={open} therapist={therapist} store={store} nav={nav} onClose={() => setOpenId(null)} />
    </div>
  );
};

/** One session: who, when and how; open it, move it to another time, or cancel it. */
const SessionDetailModal: React.FC<{
  session: TherapySession | null;
  therapist: TherapistProfile;
  store: TherapistStore;
  nav: TherapistNav;
  onClose: () => void;
}> = ({ session, therapist, store, nav, onClose }) => {
  const [step, setStep] = useState<'view' | 'move' | 'cancel'>('view');
  const [when, setWhen] = useState('');
  const [length, setLength] = useState(50);
  const [error, setError] = useState('');

  React.useEffect(() => {
    setStep('view');
    setError('');
    if (session) {
      setWhen(toLocalInput(session.start));
      setLength(session.durationMin);
    }
  }, [session?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!session) return null;
  const client = store.data.clients.find(c => c.id === session.clientId);
  const service = (store.data.services || []).find(x => x.id === session.serviceId);
  const state = sessionState(session);
  const editable = active(session) && session.status !== 'in_progress';
  const moveTo = new Date(when);
  const moveValid = !isNaN(moveTo.getTime());
  const outsideHours = moveValid && !isWorkingTime(moveTo, therapist, store.data.timeOff || []);
  const inPast = moveValid && moveTo.getTime() < Date.now();

  const close = () => {
    setStep('view');
    onClose();
  };

  return (
    <Modal
      isOpen
      onClose={close}
      title={step === 'move' ? t('Move this session') : step === 'cancel' ? t('Cancel this session?') : client?.nickname || t('Session')}
      subtitle={step === 'view' ? `${fmtDateLong(session.start)} · ${fmtTime(session.start)}` : undefined}
      size="sm"
      footer={
        step === 'view' ? (
          <div className="flex flex-wrap justify-end gap-2">
            {editable && (
              <>
                <Button variant="ghost" icon={<XCircle className="h-5 w-5" />} onClick={() => setStep('cancel')}>
                  {t('Cancel session')}
                </Button>
                <Button variant="secondary" icon={<CalendarClock className="h-5 w-5" />} onClick={() => setStep('move')}>
                  {t('Move')}
                </Button>
              </>
            )}
            <Button
              icon={<Video className="h-5 w-5" />}
              onClick={() => {
                close();
                nav.openSession(session.id);
              }}
            >
              {t('Open session')}
            </Button>
          </div>
        ) : step === 'move' ? (
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="ghost" onClick={() => setStep('view')}>
              {t('Back')}
            </Button>
            <Button
              disabled={!moveValid}
              onClick={() => {
                const problem = store.moveSession(session.id, moveTo.toISOString(), length);
                if (problem) setError(problem);
                else close();
              }}
            >
              {t('Move session')}
            </Button>
          </div>
        ) : (
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="ghost" onClick={() => setStep('view')}>
              {t('Keep it')}
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                store.updateSession(session.id, { status: 'cancelled' });
                close();
              }}
            >
              {t('Cancel session')}
            </Button>
          </div>
        )
      }
    >
      {step === 'view' && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <Avatar tone="muted" name={client?.nickname} size={48} />
            <div className="min-w-0">
              <p className="m-0 text-base font-bold text-ink">{client?.nickname || t('Client')}</p>
              <Badge tone={state.tone}>{t(state.label)}</Badge>
            </div>
          </div>
          <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-[0.9375rem]">
            <dt className="text-ink-3">{t('Time')}</dt>
            <dd className="m-0 inline-flex items-center gap-1.5 text-ink">
              <Clock className="h-4 w-4" aria-hidden="true" />
              {fmtTime(session.start)} · {t('{n} min', { n: session.durationMin })}
            </dd>
            <dt className="text-ink-3">{t('How')}</dt>
            <dd className="m-0 inline-flex items-center gap-1.5 text-ink">
              <FormatIcon format={session.format} />
              {t(FORMAT_LABEL[session.format])}
            </dd>
            <dt className="text-ink-3">{t('Type')}</dt>
            <dd className="m-0 text-ink">{t(SESSION_TYPE_LABEL[session.type])}</dd>
            {service && (
              <>
                <dt className="text-ink-3">{t('Service')}</dt>
                <dd className="m-0 text-ink">{service.name}</dd>
              </>
            )}
            {session.topic && (
              <>
                <dt className="text-ink-3">{t('Topic')}</dt>
                <dd className="m-0 text-ink">{session.topic}</dd>
              </>
            )}
          </dl>
        </div>
      )}
      {step === 'move' && (
        <div className="flex flex-col gap-4">
          <Field label={t('New date and time')} htmlFor="mv-when">
            <input id="mv-when" type="datetime-local" value={when} onChange={e => (setWhen(e.target.value), setError(''))} className={inputClass} />
          </Field>
          <Field label={t('Length')} htmlFor="mv-len">
            <select id="mv-len" value={length} onChange={e => (setLength(Number(e.target.value)), setError(''))} className={inputClass}>
              {[...new Set([30, 45, 50, 60, 90, session.durationMin])].sort((a, b) => a - b).map(m => (
                <option key={m} value={m}>
                  {t('{m} minutes', { m })}
                </option>
              ))}
            </select>
          </Field>
          {(outsideHours || inPast) && (
            <Notice tone="warn">
              {inPast ? t('This time is in the past.') : t('This is outside your usual hours.')} {t('You can still move it.')}
            </Notice>
          )}
          {error && (
            <Notice tone="danger">
              {t(error)}
            </Notice>
          )}
          <p className="m-0 text-sm text-ink-3">{t('Let the client know about the new time.')}</p>
        </div>
      )}
      {step === 'cancel' && (
        <p className="m-0 text-base text-ink-2">
          {t('The session on {day} at {time} with {name} will be cancelled and the time becomes free to book.', {
            day: fmtDateLong(session.start),
            time: fmtTime(session.start),
            name: client?.nickname || t('Client'),
          })}
        </p>
      )}
    </Modal>
  );
};

