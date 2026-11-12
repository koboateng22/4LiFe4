import React, { useState } from 'react';
import { CalendarOff, Check, Trash2 } from 'lucide-react';
import { Button, Card, Field, Notice, SectionHeader, Switch, cx, inputClass } from '../../components/ui';
import type { SessionFormat, TherapistProfile, TimeOffEntry, Weekday } from '../types';
import { FORMAT_LABEL, WEEKDAYS } from '../data';
import { daySlots } from '../../lib/schedule';
import { newId } from '../../lib/supabase';

import { t } from '../../i18n';
const DAY_NAMES: Record<Weekday, string> = { Mon: 'Monday', Tue: 'Tuesday', Wed: 'Wednesday', Thu: 'Thursday', Fri: 'Friday', Sat: 'Saturday', Sun: 'Sunday' };

const pill = (on: boolean) =>
  cx(
    'inline-flex min-h-11 items-center gap-1.5 rounded-full border-2 px-4 text-[0.9375rem] font-semibold transition-colors cursor-pointer',
    on ? 'border-pri bg-pri-soft text-pri-ink' : 'border-line bg-surface text-ink hover:border-pri-text'
  );

const fromProfile = (p: TherapistProfile) => ({
  days: p.days,
  startTime: p.startTime,
  endTime: p.endTime,
  sessionLength: p.sessionLength,
  breakStart: p.breakStart || null,
  breakEnd: p.breakEnd || null,
  formats: p.formats,
  feeGHS: p.feeGHS,
  slidingScale: p.slidingScale,
  acceptingClients: p.acceptingClients,
});

const todayKey = () => new Date().toISOString().slice(0, 10);
const dateName = (key: string) => new Date(key + 'T12:00:00Z').toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });

/** When clients can book you, how, and for how much; your daily break and the dates you are away. */
export const AvailabilityTab: React.FC<{
  therapist: TherapistProfile;
  onSave: (p: Partial<TherapistProfile>) => void;
  timeOff?: TimeOffEntry[];
  onAddTimeOff?: (o: TimeOffEntry) => void;
  onRemoveTimeOff?: (id: string) => void;
}> = ({ therapist, onSave, timeOff = [], onAddTimeOff, onRemoveTimeOff }) => {
  const [d, setD] = useState(() => fromProfile(therapist));
  const [saved, setSaved] = useState(false);
  const set = (p: Partial<typeof d>) => {
    setD(prev => ({ ...prev, ...p }));
    setSaved(false);
  };
  const dirty = JSON.stringify(d) !== JSON.stringify(fromProfile(therapist));
  const hasBreak = !!(d.breakStart && d.breakEnd);
  const breakBad = hasBreak && (d.breakEnd! <= d.breakStart! || d.breakStart! < d.startTime || d.breakEnd! > d.endTime);
  const invalid = d.startTime >= d.endTime || d.days.length === 0 || d.formats.length === 0 || breakBad;

  // How many sessions fit in a day: the same rule the booking screen uses (10 minutes between sessions, the break left free)
  const perDay = d.startTime < d.endTime ? daySlots(new Date(Date.UTC(2026, 0, 5)), { ...d, days: ['Mon'] }).length : 0;

  // Days off
  const [offFrom, setOffFrom] = useState('');
  const [offTo, setOffTo] = useState('');
  const [offNote, setOffNote] = useState('');
  const upcomingOff = timeOff.filter(o => o.endsOn >= todayKey());
  const offBad = !!offFrom && !!offTo && offTo < offFrom;
  const addOff = () => {
    if (!offFrom || offBad || !onAddTimeOff) return;
    onAddTimeOff({ id: newId(), startsOn: offFrom, endsOn: offTo || offFrom, note: offNote.trim().slice(0, 120) });
    setOffFrom('');
    setOffTo('');
    setOffNote('');
  };

  return (
    <div className="flex flex-col gap-6 animate-fadeIn">
      {saved && <Notice icon={<Check className="h-5 w-5" />}>{t("Your availability is saved.")}</Notice>}

      <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
        <div className="flex flex-col gap-6">
          <Card as="section" aria-label={t("New clients")} className="flex flex-col gap-3">
            <Switch
              checked={d.acceptingClients}
              onChange={v => set({ acceptingClients: v })}
              label={t("Accept new clients")}
              description={d.acceptingClients ? t("People can send you session requests.") : t("Your current clients can still book. New people cannot.")}
            />
          </Card>

          <Card as="section" aria-labelledby="av-days" className="flex flex-col gap-5">
            <SectionHeader id="av-days" title={t("Working days and hours")} size="md" />
            <div className="flex flex-wrap gap-2" role="group" aria-label={t("Working days")}>
              {WEEKDAYS.map(day => (
                <button key={day} type="button" aria-pressed={d.days.includes(day)} onClick={() => set({ days: d.days.includes(day) ? d.days.filter(x => x !== day) : WEEKDAYS.filter(x => x === day || d.days.includes(x)) })} className={pill(d.days.includes(day))}>
                  {d.days.includes(day) && <Check className="h-4 w-4" aria-hidden="true" />}
                  {day}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Field label={t("From")} htmlFor="av-s">
                <input id="av-s" type="time" value={d.startTime} onChange={e => set({ startTime: e.target.value })} className={inputClass} />
              </Field>
              <Field label={t("Until")} htmlFor="av-e">
                <input id="av-e" type="time" value={d.endTime} onChange={e => set({ endTime: e.target.value })} className={inputClass} />
              </Field>
            </div>
            <div className="flex flex-col gap-3 rounded-xl border border-line p-4">
              <Switch
                checked={hasBreak}
                onChange={v => set(v ? { breakStart: '13:00', breakEnd: '14:00' } : { breakStart: null, breakEnd: null })}
                label={t("Daily break")}
                description={t("No sessions are booked during your break.")}
              />
              {hasBreak && (
                <div className="grid grid-cols-2 gap-4">
                  <Field label={t("Break from")} htmlFor="av-bs">
                    <input id="av-bs" type="time" value={d.breakStart || ''} onChange={e => set({ breakStart: e.target.value })} className={inputClass} />
                  </Field>
                  <Field label={t("Break until")} htmlFor="av-be">
                    <input id="av-be" type="time" value={d.breakEnd || ''} onChange={e => set({ breakEnd: e.target.value })} className={inputClass} />
                  </Field>
                </div>
              )}
            </div>
            <Field label={t("Session length")} htmlFor="av-len" hint={t("About {perDay} sessions fit in a day, with 10 minutes between them.", { perDay })}>
              <select id="av-len" value={d.sessionLength} onChange={e => set({ sessionLength: Number(e.target.value) })} className={inputClass}>
                {[30, 50, 60].map(m => (
                  <option key={m} value={m}>
                    {t("{m} minutes", { m })}
                  </option>
                ))}
              </select>
            </Field>
          </Card>

          <Card as="section" aria-labelledby="av-how" className="flex flex-col gap-5">
            <SectionHeader id="av-how" title={t("How clients can meet you")} size="md" />
            <div className="flex flex-wrap gap-2" role="group" aria-label={t("Session formats")}>
              {(Object.keys(FORMAT_LABEL) as SessionFormat[]).map(f => (
                <button key={f} type="button" aria-pressed={d.formats.includes(f)} onClick={() => set({ formats: d.formats.includes(f) ? d.formats.filter(x => x !== f) : [...d.formats, f] })} className={pill(d.formats.includes(f))}>
                  {d.formats.includes(f) && <Check className="h-4 w-4" aria-hidden="true" />}
                  {FORMAT_LABEL[f]}
                </button>
              ))}
            </div>
            <Field label={t("Fee per session (GHS)")} htmlFor="av-fee">
              <input id="av-fee" type="number" min={0} value={d.feeGHS} onChange={e => set({ feeGHS: Number(e.target.value) })} className={cx(inputClass, 'sm:w-48')} />
            </Field>
            <Switch checked={d.slidingScale} onChange={v => set({ slidingScale: v })} label={t("Offer a lower fee when needed")} description={t("Clients can ask for a reduced fee. You decide each time.")} />
          </Card>

          {onAddTimeOff && (
            <Card as="section" aria-labelledby="av-off" className="flex flex-col gap-4">
              <SectionHeader id="av-off" title={t("Days off")} size="md" subtitle={t("Holidays, training or sick days. Clients cannot book these dates. Sessions you already booked stay, so move or cancel them in Sessions.")} />
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={t("First day off")} htmlFor="av-of">
                  <input id="av-of" type="date" min={todayKey()} value={offFrom} onChange={e => setOffFrom(e.target.value)} className={inputClass} />
                </Field>
                <Field label={t("Last day off")} htmlFor="av-ot" hint={t("Leave empty for one day.")}>
                  <input id="av-ot" type="date" min={offFrom || todayKey()} value={offTo} onChange={e => setOffTo(e.target.value)} className={inputClass} />
                </Field>
              </div>
              <Field label={t("Note (only you see this)")} htmlFor="av-on">
                <input id="av-on" type="text" maxLength={120} value={offNote} onChange={e => setOffNote(e.target.value)} placeholder={t("e.g. Annual leave")} className={inputClass} />
              </Field>
              {offBad && <Notice tone="warn">{t("The last day off must be on or after the first.")}</Notice>}
              <div>
                <Button variant="secondary" icon={<CalendarOff className="h-5 w-5" />} disabled={!offFrom || offBad} onClick={addOff}>
                  {t("Block these dates")}
                </Button>
              </div>
              {upcomingOff.length > 0 ? (
                <ul className="m-0 flex list-none flex-col p-0" aria-label={t("Blocked dates")}>
                  {upcomingOff.map(o => (
                    <li key={o.id} className="flex items-center justify-between gap-3 border-b border-line py-2.5 last:border-0">
                      <span className="min-w-0">
                        <span className="block text-[0.9375rem] font-semibold text-ink">
                          {o.startsOn === o.endsOn ? dateName(o.startsOn) : `${dateName(o.startsOn)} – ${dateName(o.endsOn)}`}
                        </span>
                        {o.note && <span className="block text-sm text-ink-3">{o.note}</span>}
                      </span>
                      <Button variant="ghost" size="sm" icon={<Trash2 className="h-4 w-4" />} onClick={() => onRemoveTimeOff?.(o.id)} aria-label={t("Remove days off {dates}", { dates: dateName(o.startsOn) })}>
                        {t("Remove")}
                      </Button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="m-0 text-[0.9375rem] text-ink-3">{t("No days off planned.")}</p>
              )}
            </Card>
          )}
        </div>

        {/* Week preview */}
        <div className="flex flex-col gap-4 lg:sticky lg:top-24 lg:self-start">
          <Card as="section" aria-labelledby="av-week" className="flex flex-col gap-3">
            <SectionHeader id="av-week" title={t("Your week")} size="md" subtitle={t("What clients see when booking.")} />
            <ul className="m-0 flex list-none flex-col p-0">
              {WEEKDAYS.map(day => {
                const on = d.days.includes(day);
                return (
                  <li key={day} className="flex items-center justify-between border-b border-line py-2.5 text-[0.9375rem] last:border-0">
                    <span className={on ? 'font-semibold text-ink' : 'text-ink-3'}>{DAY_NAMES[day]}</span>
                    <span className={cx('text-right', on ? 'text-ink-2' : 'text-ink-3')}>
                      {on ? `${d.startTime} – ${d.endTime}` : t("Closed")}
                      {on && hasBreak && <span className="block text-xs text-ink-3">{t("Break {from} – {to}", { from: d.breakStart, to: d.breakEnd })}</span>}
                    </span>
                  </li>
                );
              })}
            </ul>
          </Card>
          {invalid && (
            <Notice tone="warn">
              {d.days.length === 0
                ? t("Choose at least one working day.")
                : d.formats.length === 0
                  ? t("Choose at least one way to meet.")
                  : d.startTime >= d.endTime
                    ? t("Your finishing time must be after your starting time.")
                    : t("Your break must end after it starts, within your working hours.")}
            </Notice>
          )}
          <Button
            size="lg"
            block
            disabled={!dirty || invalid}
            onClick={() => {
              onSave(d);
              setSaved(true);
            }}
          >
            {t("Save availability")}
          </Button>
        </div>
      </div>
    </div>
  );
};
