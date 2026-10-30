import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle, Ambulance, Check, ClipboardCopy, ExternalLink, EyeOff, LocateFixed, MapPin, Phone, ShieldCheck, History,
} from 'lucide-react';
import { Avatar, Button, Card, Field, Modal, Notice, SectionHeader, cx, textareaClass } from '../../components/ui';
import type { EmergencyCenter } from '../../types';
import { EMERGENCY_CENTERS } from '../../data/counselors';
import type { ClientRecord, TherapistProfile } from '../types';
import type { TherapistStore } from '../useTherapistStore';
import type { TherapistNav } from '../TherapistApp';
import { ago, displayName, distanceKm, fmtTime, focusLabel, fmtDayInline, roughDriveMins } from '../data';
import { RiskBadge } from '../parts';
import { SafetyMap } from '../SafetyMap';

interface Props {
  therapist: TherapistProfile;
  store: TherapistStore;
  nav: TherapistNav;
  focusId: string | null;
  setFocusId: (id: string | null) => void;
}

/** Places that respond to emergencies: hospitals and ambulance stations (helplines and day rehab centres are left out). */
const SERVICES = EMERGENCY_CENTERS.filter(c => c.type === 'hospital' || c.type === 'ems_station');

const STALE_MIN = 30;

const servicesByDistance = (c: ClientRecord) =>
  c.lastLocation
    ? SERVICES.map(s => ({ s, km: distanceKm(c.lastLocation!, s) })).sort((a, b) => a.km - b.km)
    : [];

const fmtKm = (km: number) => (km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(km < 10 ? 1 : 0)} km`);

const CLOSE_OUTCOMES = [
  'Client is safe — lower to “watch closely”',
  'Handed over to EMS or hospital',
  'Support person is with the client',
  'Other (add a note)',
];

/**
 * Safety map: where high-risk clients are (only if they agreed to share),
 * the nearest emergency services, and a record of every step taken.
 */
export const SafetyMapTab: React.FC<Props> = ({ therapist, store, nav, focusId, setFocusId }) => {
  const [includeWatch, setIncludeWatch] = useState(false);
  const [copied, setCopied] = useState(false);
  const [closing, setClosing] = useState(false);
  const [outcome, setOutcome] = useState(CLOSE_OUTCOMES[0]);
  const [closeNote, setCloseNote] = useState('');
  const [locating, setLocating] = useState(false);
  const [, setTick] = useState(0);

  // Refresh "x min ago" labels
  useEffect(() => {
    const t = setInterval(() => setTick(n => n + 1), 30000);
    return () => clearInterval(t);
  }, []);

  const atRisk = store.data.clients
    .filter(c => c.status === 'active' && (c.risk === 'high' || (includeWatch && c.risk === 'moderate')))
    .sort((a, b) => (a.risk === b.risk ? 0 : a.risk === 'high' ? -1 : 1));
  const located = atRisk.filter(c => c.locationConsent && c.lastLocation);
  const notShared = atRisk.filter(c => !c.locationConsent || !c.lastLocation);
  const highCount = atRisk.filter(c => c.risk === 'high').length;

  const nearest = useMemo(() => {
    const out: Record<string, EmergencyCenter | undefined> = {};
    located.forEach(c => (out[c.id] = servicesByDistance(c)[0]?.s));
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [located.map(c => c.id + c.lastLocation?.lat + c.lastLocation?.lng).join()]);

  // Default selection: the requested client, else the most urgent
  const selected = atRisk.find(c => c.id === focusId) || located[0] || atRisk[0];
  const select = useCallback((id: string) => setFocusId(id), [setFocusId]);

  const sel = selected;
  const services = sel ? servicesByDistance(sel).slice(0, 3) : [];
  const loc = sel?.lastLocation && sel.locationConsent ? sel.lastLocation : undefined;
  const minsOld = loc ? Math.round((Date.now() - new Date(loc.at).getTime()) / 60000) : 0;
  const mapsUrl = loc ? `https://www.google.com/maps?q=${loc.lat.toFixed(5)},${loc.lng.toFixed(5)}` : '';

  const dispatchText = sel
    ? [
        'MENTAL HEALTH EMERGENCY — 4Life',
        `Person: ${sel.nickname} (client of ${displayName(therapist)}, ${therapist.profession})`,
        loc
          ? `Location: ${loc.area} — ${loc.lat.toFixed(5)}, ${loc.lng.toFixed(5)} (within about ${loc.accuracyM} m), shared ${ago(loc.at)}`
          : 'Location: not shared',
        loc ? `Map: ${mapsUrl}` : '',
        `Concern: high risk of harm. Focus: ${focusLabel(sel.focus)}.`,
        services[0] ? `Nearest service: ${services[0].s.name} (${fmtKm(services[0].km)} away)` : '',
      ]
        .filter(Boolean)
        .join('\n')
    : '';

  const copyDetails = async () => {
    if (!sel) return;
    try {
      await navigator.clipboard.writeText(dispatchText);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = dispatchText;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
    setCopied(true);
    store.logEscalation(sel.id, 'Copied location details for emergency services');
    setTimeout(() => setCopied(false), 2500);
  };

  const requestLocation = () => {
    if (!sel || !sel.lastLocation) return;
    setLocating(true);
    store.requestLocation(sel, () => setLocating(false));
  };

  const closeAlert = () => {
    if (!sel) return;
    if (outcome === CLOSE_OUTCOMES[0]) store.updateClient(sel.id, { risk: 'moderate' });
    store.logEscalation(sel.id, `Alert closed: ${outcome}`, closeNote.trim() || undefined);
    setClosing(false);
    setCloseNote('');
  };

  return (
    <div className="flex flex-col gap-6 animate-fadeIn">
      <Notice tone="info" icon={<ShieldCheck className="h-5 w-5" />}>
        <p className="m-0 font-bold">For emergencies only</p>
        <p className="m-0 mt-1">
          Locations appear only for clients at high risk who agreed to share them in a crisis. Use them only to get the person help. Every step you take is
          recorded.
        </p>
      </Notice>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="m-0 text-base text-ink-2">
          <strong className="text-ink">{highCount}</strong> {highCount === 1 ? 'client' : 'clients'} at high risk ·{' '}
          <strong className="text-ink">{located.length}</strong> sharing location
        </p>
        <label className="flex min-h-11 cursor-pointer items-center gap-3 text-[0.9375rem] font-semibold text-ink">
          <input type="checkbox" checked={includeWatch} onChange={e => setIncludeWatch(e.target.checked)} className="h-5 w-5 cursor-pointer" />
          Also show clients to watch closely
        </label>
      </div>

      {atRisk.length === 0 ? (
        <Card className="flex flex-col items-start gap-2">
          <ShieldCheck className="h-6 w-6 text-pri-text" aria-hidden="true" />
          <p className="m-0 text-base font-bold text-ink">No clients at high risk right now.</p>
          <p className="m-0 text-[0.9375rem] text-ink-2">If a client presses SOS or you mark them high risk, they will appear here.</p>
        </Card>
      ) : (
        <>
          <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
            {/* Map */}
            <div className="flex flex-col gap-3">
              {located.length > 0 ? (
                <SafetyMap clients={located} centres={SERVICES} selectedId={sel?.id || null} nearest={nearest} onSelect={select} />
              ) : (
                <Card className="flex h-[260px] items-center justify-center text-center">
                  <p className="m-0 max-w-sm text-[0.9375rem] text-ink-2">None of these clients is sharing a location. Use the phone numbers in their safety plan.</p>
                </Card>
              )}
              <ul className="m-0 flex list-none flex-wrap gap-x-5 gap-y-1 p-0 text-sm text-ink-2" aria-label="Map key">
                <li className="inline-flex items-center gap-2">
                  <span className="h-3.5 w-3.5 rounded-full border-2 border-[#fff] bg-danger shadow" aria-hidden="true" /> Client at high risk
                </li>
                {includeWatch && (
                  <li className="inline-flex items-center gap-2">
                    <span className="h-3.5 w-3.5 rounded-full border-2 border-[#fff] bg-warn-bar shadow" aria-hidden="true" /> Watch closely
                  </li>
                )}
                <li className="inline-flex items-center gap-2">
                  <span className="flex h-4 w-4 items-center justify-center rounded border-2 border-[#0284c7] text-[0.625rem] font-extrabold text-info" aria-hidden="true">
                    +
                  </span>
                  Emergency service
                </li>
                <li className="inline-flex items-center gap-2">
                  <span className="w-6 border-t-2 border-dashed border-[#0284c7]" aria-hidden="true" /> Nearest service
                </li>
                <li className="inline-flex items-center gap-2">
                  <span className="h-3.5 w-3.5 rounded-full border border-danger bg-danger-soft" aria-hidden="true" /> How precise the location is
                </li>
              </ul>
            </div>

            {/* Alert list */}
            <section aria-labelledby="sm-list" className="flex flex-col gap-3">
              <h2 id="sm-list" className="sr-only">
                Clients at risk
              </h2>
              {atRisk.map(c => {
                const near = servicesByDistance(c)[0];
                const shares = c.locationConsent && c.lastLocation;
                const old = shares ? Math.round((Date.now() - new Date(c.lastLocation!.at).getTime()) / 60000) : 0;
                const active = sel?.id === c.id;
                return (
                  <button
                    key={c.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => select(c.id)}
                    className={cx(
                      'flex w-full flex-col gap-2.5 rounded-2xl border-2 bg-surface p-4 text-left transition-colors cursor-pointer',
                      active ? (c.risk === 'high' ? 'border-danger' : 'border-warn-bar') : 'border-line hover:border-pri-text'
                    )}
                  >
                    <span className="flex items-center gap-3">
                      <Avatar tone="muted" name={c.nickname} size={40} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-base font-bold text-ink">{c.nickname}</span>
                        <span className="block text-sm text-ink-3">{focusLabel(c.focus)}</span>
                      </span>
                      <RiskBadge risk={c.risk} />
                    </span>
                    {shares ? (
                      <span className="flex flex-col gap-1 text-[0.9375rem] text-ink-2">
                        <span className="inline-flex items-center gap-2">
                          <MapPin className="h-4 w-4 shrink-0 text-danger-text" aria-hidden="true" />
                          {c.lastLocation!.area}
                          <span className={cx('text-sm', old > STALE_MIN ? 'font-bold text-warn' : 'text-ink-3')}>· {ago(c.lastLocation!.at)}</span>
                        </span>
                        {near && (
                          <span className="inline-flex items-center gap-2">
                            <Ambulance className="h-4 w-4 shrink-0 text-info" aria-hidden="true" />
                            {near.s.name.split('(')[0].trim()} · {fmtKm(near.km)}
                          </span>
                        )}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-2 text-[0.9375rem] text-warn">
                        <EyeOff className="h-4 w-4 shrink-0" aria-hidden="true" />
                        {c.locationConsent ? 'No location shared yet' : 'Has not agreed to share location'}
                      </span>
                    )}
                  </button>
                );
              })}
            </section>
          </div>

          {/* Respond */}
          {sel && (
            <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
              <Card as="section" aria-labelledby="sm-resp" raised className="flex flex-col gap-5">
                <SectionHeader
                  id="sm-resp"
                  title={`Respond: ${sel.nickname}`}
                  size="md"
                  action={
                    <Button variant="link" onClick={() => nav.openClient(sel.id)}>
                      Open client record
                    </Button>
                  }
                />

                {loc ? (
                  <div className="flex flex-col gap-3 rounded-xl bg-bg p-4">
                    <p className="m-0 flex flex-wrap items-center gap-x-2 text-base text-ink">
                      <MapPin className="h-5 w-5 text-danger-text" aria-hidden="true" />
                      <strong>{loc.area}</strong>
                      <span className="text-[0.9375rem] text-ink-3">
                        {loc.lat.toFixed(5)}, {loc.lng.toFixed(5)} · within about {loc.accuracyM} m
                      </span>
                    </p>
                    <p className={cx('m-0 text-[0.9375rem]', minsOld > STALE_MIN ? 'font-bold text-warn' : 'text-ink-2')}>
                      {minsOld > STALE_MIN && <AlertTriangle className="mr-1.5 inline h-4 w-4 align-[-2px]" aria-hidden="true" />}
                      Shared {ago(loc.at)} ({fmtDayInline(loc.at)} at {fmtTime(loc.at)}){loc.source === 'sos' ? ' when they pressed SOS' : ''}
                      {loc.approximate ? ' · approximate (from their region)' : ''}
                      {minsOld > STALE_MIN ? ' — this may be out of date' : ''}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <Button variant="secondary" size="sm" icon={<LocateFixed className="h-4 w-4" />} onClick={requestLocation} disabled={locating}>
                        {locating ? 'Asking…' : 'Ask for updated location'}
                      </Button>
                      <a
                        href={mapsUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-line bg-surface px-3.5 text-sm font-bold text-ink no-underline hover:bg-muted"
                      >
                        <ExternalLink className="h-4 w-4" aria-hidden="true" /> Open in Google Maps
                      </a>
                    </div>
                  </div>
                ) : (
                  <Notice tone="warn" icon={<EyeOff className="h-5 w-5" />}>
                    {sel.locationConsent
                      ? 'They agreed to share their location, but none has been received. Call them, or ask their support person where they are.'
                      : 'They have not agreed to share their location. Call them, or contact the support person on their safety plan.'}
                  </Notice>
                )}

                {/* Steps */}
                <div className="grid gap-3 sm:grid-cols-2">
                  <a
                    href="tel:112"
                    onClick={() => store.logEscalation(sel.id, 'Called 112')}
                    className="flex min-h-14 items-center justify-center gap-2 rounded-xl bg-danger px-4 text-base font-bold text-[#fff] no-underline hover:bg-danger-hover"
                  >
                    <Phone className="h-5 w-5" aria-hidden="true" /> Call 112
                  </a>
                  <a
                    href="tel:193"
                    onClick={() => store.logEscalation(sel.id, 'Called the ambulance service (193)')}
                    className="flex min-h-14 items-center justify-center gap-2 rounded-xl border-2 border-danger bg-danger-soft px-4 text-base font-bold text-danger-text no-underline hover:brightness-95"
                  >
                    <Ambulance className="h-5 w-5" aria-hidden="true" /> Ambulance 193
                  </a>
                  <Button size="lg" variant="secondary" icon={copied ? <Check className="h-5 w-5" /> : <ClipboardCopy className="h-5 w-5" />} onClick={copyDetails}>
                    {copied ? 'Copied' : 'Copy details for EMS'}
                  </Button>
                  <Button size="lg" variant="secondary" icon={<Check className="h-5 w-5" />} onClick={() => store.logEscalation(sel.id, 'Emergency services contacted and on their way')}>
                    EMS is on the way
                  </Button>
                </div>
                <p className="m-0 text-sm text-ink-3">
                  The copied details include the location and a map link. Give EMS the client’s full name and phone number from your own records.
                </p>

                {services.length > 0 && (
                  <div className="flex flex-col gap-2">
                    <h3 className="m-0 text-sm font-bold text-ink">Nearest emergency services</h3>
                    <ol className="m-0 flex list-none flex-col gap-2 p-0">
                      {services.map(({ s, km }, i) => (
                        <li key={s.id} className={cx('flex flex-col gap-1 rounded-xl border px-4 py-3 sm:flex-row sm:items-center sm:gap-3', i === 0 ? 'border-[#0284c7] bg-info-soft' : 'border-line')}>
                          <span className="min-w-0 flex-1">
                            <span className="block text-[0.9375rem] font-bold text-ink">{s.name}</span>
                            <span className="block text-sm text-ink-2">
                              {fmtKm(km)} away · about {roughDriveMins(km)} min by road (rough estimate) · {s.hours}
                            </span>
                          </span>
                          <a href={`tel:${s.phone.split('/')[0].replace(/\s+/g, '')}`} className="inline-flex min-h-10 shrink-0 items-center gap-1.5 self-start rounded-lg text-sm font-bold text-pri-text no-underline hover:underline sm:self-center sm:px-2">
                            <Phone className="h-4 w-4" aria-hidden="true" /> {s.phone.split('/')[0].trim()}
                          </a>
                        </li>
                      ))}
                    </ol>
                  </div>
                )}

                <div className="flex flex-wrap gap-3 border-t border-line pt-4">
                  <Button variant="ghost" onClick={() => setClosing(true)}>
                    Close this alert
                  </Button>
                </div>
              </Card>

              <div className="flex flex-col gap-6">
                {(sel.safetyPlan.supportPeople || sel.safetyPlan.copingSteps) && (
                  <Card as="section" tone="warn" aria-labelledby="sm-plan" className="flex flex-col gap-2">
                    <h2 id="sm-plan" className="m-0 text-base font-bold text-warn">
                      Safety plan
                    </h2>
                    {sel.safetyPlan.supportPeople && (
                      <p className="m-0 text-[0.9375rem] text-ink-2">
                        <strong className="text-ink">People who can help:</strong> {sel.safetyPlan.supportPeople}
                      </p>
                    )}
                    {sel.safetyPlan.copingSteps && (
                      <p className="m-0 text-[0.9375rem] text-ink-2">
                        <strong className="text-ink">What helps:</strong> {sel.safetyPlan.copingSteps}
                      </p>
                    )}
                  </Card>
                )}

                <Card as="section" aria-labelledby="sm-log" className="flex flex-col gap-3">
                  <h2 id="sm-log" className="m-0 flex items-center gap-2 text-lg font-bold text-ink">
                    <History className="h-5 w-5 text-ink-3" aria-hidden="true" /> What has happened
                  </h2>
                  {(sel.escalations || []).length === 0 ? (
                    <p className="m-0 text-[0.9375rem] text-ink-3">No steps recorded yet.</p>
                  ) : (
                    <ol className="m-0 flex list-none flex-col gap-0 p-0">
                      {[...(sel.escalations || [])].reverse().map((e, i, arr) => (
                        <li key={e.id} className="relative flex gap-3 pb-4 last:pb-0">
                          {i < arr.length - 1 && <span className="absolute left-[7px] top-4 h-full w-px bg-line" aria-hidden="true" />}
                          <span className={cx('relative mt-1 h-[15px] w-[15px] shrink-0 rounded-full border-2', i === 0 ? 'border-danger bg-danger' : 'border-line bg-surface')} aria-hidden="true" />
                          <span className="min-w-0">
                            <span className="block text-[0.9375rem] font-semibold text-ink">{e.action}</span>
                            <span className="block text-sm text-ink-3">
                              {fmtTime(e.at)} · {ago(e.at)}
                            </span>
                            {e.note && <span className="mt-1 block text-[0.9375rem] text-ink-2">{e.note}</span>}
                          </span>
                        </li>
                      ))}
                    </ol>
                  )}
                </Card>
              </div>
            </div>
          )}
        </>
      )}

      <Modal
        isOpen={closing}
        onClose={() => setClosing(false)}
        title={`Close the alert for ${sel?.nickname || ''}?`}
        size="sm"
        footer={
          <div className="flex justify-end gap-3">
            <Button variant="ghost" onClick={() => setClosing(false)}>
              Keep open
            </Button>
            <Button onClick={closeAlert} disabled={outcome === CLOSE_OUTCOMES[3] && !closeNote.trim()}>
              Close alert
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-4">
          <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
            <legend className="mb-2 p-0 text-sm font-bold text-ink">What happened?</legend>
            {CLOSE_OUTCOMES.map(o => (
              <label key={o} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border border-line px-4 py-2 text-[0.9375rem] text-ink">
                <input type="radio" name="close-outcome" checked={outcome === o} onChange={() => setOutcome(o)} className="h-5 w-5" />
                {o}
              </label>
            ))}
          </fieldset>
          <Field label="Note" htmlFor="sm-note" optional={outcome !== CLOSE_OUTCOMES[3]}>
            <textarea id="sm-note" rows={3} value={closeNote} onChange={e => setCloseNote(e.target.value)} className={textareaClass} />
          </Field>
          <p className="m-0 text-sm text-ink-3">
            Only the first choice lowers their risk level. Remember to write a session note and book a check-in within 24–48 hours.
          </p>
        </div>
      </Modal>
    </div>
  );
};

