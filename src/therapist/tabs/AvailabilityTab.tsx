import React, { useState } from 'react';
import { Check } from 'lucide-react';
import { Button, Card, Field, Notice, SectionHeader, Switch, cx, inputClass } from '../../components/ui';
import type { SessionFormat, TherapistProfile, Weekday } from '../types';
import { FORMAT_LABEL, WEEKDAYS } from '../data';

const DAY_NAMES: Record<Weekday, string> = { Mon: 'Monday', Tue: 'Tuesday', Wed: 'Wednesday', Thu: 'Thursday', Fri: 'Friday', Sat: 'Saturday', Sun: 'Sunday' };

const pill = (on: boolean) =>
  cx(
    'inline-flex min-h-11 items-center gap-1.5 rounded-full border-2 px-4 text-[0.9375rem] font-semibold transition-colors cursor-pointer',
    on ? 'border-pri bg-pri-soft text-pri-ink' : 'border-line bg-surface text-ink hover:border-pri-text'
  );

/** When clients can book you, how, and for how much. */
export const AvailabilityTab: React.FC<{ therapist: TherapistProfile; onSave: (p: Partial<TherapistProfile>) => void }> = ({ therapist, onSave }) => {
  const [d, setD] = useState({
    days: therapist.days,
    startTime: therapist.startTime,
    endTime: therapist.endTime,
    sessionLength: therapist.sessionLength,
    formats: therapist.formats,
    feeGHS: therapist.feeGHS,
    slidingScale: therapist.slidingScale,
    acceptingClients: therapist.acceptingClients,
  });
  const [saved, setSaved] = useState(false);
  const set = (p: Partial<typeof d>) => {
    setD(prev => ({ ...prev, ...p }));
    setSaved(false);
  };
  const dirty = JSON.stringify(d) !== JSON.stringify({
    days: therapist.days, startTime: therapist.startTime, endTime: therapist.endTime, sessionLength: therapist.sessionLength,
    formats: therapist.formats, feeGHS: therapist.feeGHS, slidingScale: therapist.slidingScale, acceptingClients: therapist.acceptingClients,
  });
  const invalid = d.startTime >= d.endTime || d.days.length === 0 || d.formats.length === 0;

  // How many sessions fit in a day (with a 10-minute break between sessions)
  const [sh, sm] = d.startTime.split(':').map(Number);
  const [eh, em] = d.endTime.split(':').map(Number);
  const perDay = Math.max(0, Math.floor((eh * 60 + em - (sh * 60 + sm) + 10) / (d.sessionLength + 10)));

  return (
    <div className="flex flex-col gap-6 animate-fadeIn">
      {saved && <Notice icon={<Check className="h-5 w-5" />}>Your availability is saved.</Notice>}

      <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
        <div className="flex flex-col gap-6">
          <Card as="section" aria-label="New clients" className="flex flex-col gap-3">
            <Switch
              checked={d.acceptingClients}
              onChange={v => set({ acceptingClients: v })}
              label="Accept new clients"
              description={d.acceptingClients ? 'People can send you session requests.' : 'Your current clients can still book. New people cannot.'}
            />
          </Card>

          <Card as="section" aria-labelledby="av-days" className="flex flex-col gap-5">
            <SectionHeader id="av-days" title="Working days and hours" size="md" />
            <div className="flex flex-wrap gap-2" role="group" aria-label="Working days">
              {WEEKDAYS.map(day => (
                <button key={day} type="button" aria-pressed={d.days.includes(day)} onClick={() => set({ days: d.days.includes(day) ? d.days.filter(x => x !== day) : WEEKDAYS.filter(x => x === day || d.days.includes(x)) })} className={pill(d.days.includes(day))}>
                  {d.days.includes(day) && <Check className="h-4 w-4" aria-hidden="true" />}
                  {day}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Field label="From" htmlFor="av-s">
                <input id="av-s" type="time" value={d.startTime} onChange={e => set({ startTime: e.target.value })} className={inputClass} />
              </Field>
              <Field label="Until" htmlFor="av-e">
                <input id="av-e" type="time" value={d.endTime} onChange={e => set({ endTime: e.target.value })} className={inputClass} />
              </Field>
            </div>
            <Field label="Session length" htmlFor="av-len" hint={`About ${perDay} sessions fit in a day, with 10 minutes between them.`}>
              <select id="av-len" value={d.sessionLength} onChange={e => set({ sessionLength: Number(e.target.value) })} className={inputClass}>
                {[30, 50, 60].map(m => (
                  <option key={m} value={m}>
                    {m} minutes
                  </option>
                ))}
              </select>
            </Field>
          </Card>

          <Card as="section" aria-labelledby="av-how" className="flex flex-col gap-5">
            <SectionHeader id="av-how" title="How clients can meet you" size="md" />
            <div className="flex flex-wrap gap-2" role="group" aria-label="Session formats">
              {(Object.keys(FORMAT_LABEL) as SessionFormat[]).map(f => (
                <button key={f} type="button" aria-pressed={d.formats.includes(f)} onClick={() => set({ formats: d.formats.includes(f) ? d.formats.filter(x => x !== f) : [...d.formats, f] })} className={pill(d.formats.includes(f))}>
                  {d.formats.includes(f) && <Check className="h-4 w-4" aria-hidden="true" />}
                  {FORMAT_LABEL[f]}
                </button>
              ))}
            </div>
            <Field label="Fee per session (GHS)" htmlFor="av-fee">
              <input id="av-fee" type="number" min={0} value={d.feeGHS} onChange={e => set({ feeGHS: Number(e.target.value) })} className={cx(inputClass, 'sm:w-48')} />
            </Field>
            <Switch checked={d.slidingScale} onChange={v => set({ slidingScale: v })} label="Offer a lower fee when needed" description="Clients can ask for a reduced fee. You decide each time." />
          </Card>
        </div>

        {/* Week preview */}
        <div className="flex flex-col gap-4 lg:sticky lg:top-24 lg:self-start">
          <Card as="section" aria-labelledby="av-week" className="flex flex-col gap-3">
            <SectionHeader id="av-week" title="Your week" size="md" subtitle="What clients see when booking." />
            <ul className="m-0 flex list-none flex-col p-0">
              {WEEKDAYS.map(day => {
                const on = d.days.includes(day);
                return (
                  <li key={day} className="flex items-center justify-between border-b border-line py-2.5 text-[0.9375rem] last:border-0">
                    <span className={on ? 'font-semibold text-ink' : 'text-ink-3'}>{DAY_NAMES[day]}</span>
                    <span className={on ? 'text-ink-2' : 'text-ink-3'}>{on ? `${d.startTime} – ${d.endTime}` : 'Closed'}</span>
                  </li>
                );
              })}
            </ul>
          </Card>
          {invalid && (
            <Notice tone="warn">
              {d.days.length === 0 ? 'Choose at least one working day.' : d.formats.length === 0 ? 'Choose at least one way to meet.' : 'Your finishing time must be after your starting time.'}
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
            Save availability
          </Button>
        </div>
      </div>
    </div>
  );
};
