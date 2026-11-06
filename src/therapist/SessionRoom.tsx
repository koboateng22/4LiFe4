import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft, CalendarPlus, Check, ClipboardCheck, FileText, Pencil, Play, ShieldAlert, Square, UserX, XCircle,
} from 'lucide-react';
import { Badge, Button, Card, Field, Notice, ProgressBar, SectionHeader, Tabs, cx, inputClass, textareaClass } from '../components/ui';
import type { ClientRecord, ClientRisk, SessionNote, TherapistProfile, TherapySession } from './types';
import type { TherapistStore } from './useTherapistStore';
import { FORMAT_LABEL, SESSION_AGENDA, SESSION_TYPE_LABEL, at, fmtDateLong, fmtDay, fmtDayInline, fmtTime, focusLabel, toLocalInput } from './data';
import { FormatIcon, RISK_INFO, RiskBadge, SharingNote, sessionState } from './parts';
import { TrendChart } from './TrendChart';

import { t as tr, T, msg } from '../i18n';
type Phase = 'prepare' | 'during' | 'wrap';

interface Props {
  session: TherapySession;
  client: ClientRecord;
  store: TherapistStore;
  therapist: TherapistProfile;
  onClose: () => void;
  onOpenClient: () => void;
  onOpenSafety?: () => void;
}

const emptyNote = (risk: ClientRisk): SessionNote => ({
  data: '',
  assessment: '',
  plan: '',
  moodRating: 3,
  riskLevel: risk,
  homework: '',
  agendaDone: [],
});

const MOODS = [msg('Very low'), msg('Low'), msg('Okay'), msg('Good'), msg('Very good')];

/**
 * One therapy session, in the order it happens:
 * 1. Prepare — what has happened since last time
 * 2. In session — timer, agenda, risk check, quick notes
 * 3. Wrap up — DAP note, homework and the next appointment
 */
export const SessionRoom: React.FC<Props> = ({ session, client, store, therapist, onClose, onOpenClient, onOpenSafety }) => {
  const initialPhase: Phase = session.status === 'in_progress' ? 'during' : session.status === 'completed' ? 'wrap' : 'prepare';
  const [phase, setPhase] = useState<Phase>(initialPhase);
  const [note, setNote] = useState<SessionNote>(session.note || emptyNote(client.risk));
  const [editing, setEditing] = useState(!session.note?.signedAt);
  const [topic, setTopic] = useState(session.topic || '');
  const [bookNext, setBookNext] = useState(true);
  const [nextWhen, setNextWhen] = useState(toLocalInput(at(7, new Date(session.start).getHours(), new Date(session.start).getMinutes())));
  const [savedMsg, setSavedMsg] = useState('');
  const [now, setNow] = useState(Date.now());

  const setN = (patch: Partial<SessionNote>) => setNote(n => ({ ...n, ...patch }));

  // Keep a draft as you type
  useEffect(() => {
    const t = setTimeout(() => {
      if (!note.signedAt) store.updateSession(session.id, { note, topic: topic.trim() || undefined });
    }, 600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note, topic]);

  // Session timer
  useEffect(() => {
    if (session.status !== 'in_progress') return;
    const t = setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(t);
  }, [session.status]);

  const history = useMemo(
    () =>
      store.data.sessions
        .filter(s => s.clientId === client.id && s.id !== session.id && s.status === 'completed' && s.start < session.start)
        .sort((a, b) => b.start.localeCompare(a.start)),
    [store.data.sessions, client.id, session.id, session.start]
  );
  const last = history[0];
  const st = sessionState(session);
  const elapsed = session.startedAt ? Math.max(0, Math.round((now - new Date(session.startedAt).getTime()) / 60000)) : 0;

  const start = () => {
    store.updateSession(session.id, { status: 'in_progress', startedAt: new Date().toISOString(), topic: topic.trim() || undefined });
    setNow(Date.now());
    setPhase('during');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const end = () => {
    store.updateSession(session.id, { status: 'completed', note });
    setPhase('wrap');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const markNoShow = () => store.updateSession(session.id, { status: 'no_show' });
  const cancel = () => store.updateSession(session.id, { status: 'cancelled' });

  const sign = () => {
    // Closes the session and carries risk, homework and the next booking into the client's record
    store.signNote(session, client, note, bookNext ? new Date(nextWhen).toISOString() : null, topic.trim() || undefined);
    setNote({ ...note, signedAt: new Date().toISOString() });
    setEditing(false);
    setSavedMsg(tr('Note signed and saved. Homework and risk level were added to the client’s record.'));
  };

  const toggleAgenda = (item: string) =>
    setN({ agendaDone: note.agendaDone.includes(item) ? note.agendaDone.filter(i => i !== item) : [...note.agendaDone, item] });

  const closed = session.status === 'cancelled' || session.status === 'no_show';

  return (
    <div className="flex flex-col gap-6 animate-fadeIn">
      <button type="button" onClick={onClose} className="flex min-h-11 items-center gap-2 self-start text-[0.9375rem] font-bold text-pri-text hover:underline cursor-pointer">
        <ArrowLeft className="h-5 w-5" aria-hidden="true" /> {tr("Back")}
      </button>

      {/* Session header */}
      <Card raised className="flex flex-col gap-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="m-0 text-sm font-semibold text-ink-3">
              {fmtDay(session.start)}, {fmtTime(session.start)} {tr("· {durationMin} min", { durationMin: session.durationMin })}
            </p>
            <h1 className="m-0 mt-0.5 text-xl font-bold text-ink sm:text-2xl">{client.nickname}</h1>
            <p className="m-0 mt-1 flex flex-wrap items-center gap-x-2 text-[0.9375rem] text-ink-2">
              <span>{SESSION_TYPE_LABEL[session.type]}</span>
              <span aria-hidden="true">·</span>
              <span className="inline-flex items-center gap-1">
                <FormatIcon format={session.format} /> {FORMAT_LABEL[session.format]}
              </span>
              <span aria-hidden="true">·</span>
              <span>{focusLabel(client.focus)}</span>
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <RiskBadge risk={client.risk} />
            <Badge tone={st.tone}>{tr(st.label)}</Badge>
          </div>
        </div>

        {session.status === 'in_progress' && (
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between text-sm">
              <T text="<0>{elapsed} of {durationMin} minutes</0>" parts={[<span className="font-bold text-ink" />]} vars={{ elapsed, durationMin: session.durationMin }} />
              <span className="text-ink-3">{Math.max(0, session.durationMin - elapsed)} {tr("min left")}</span>
            </div>
            <ProgressBar value={Math.min(100, (elapsed / session.durationMin) * 100)} tone={elapsed > session.durationMin ? 'warn' : 'pri'} label={tr("Session time")} />
          </div>
        )}

        {closed ? (
          <Notice tone="warn" icon={<XCircle className="h-5 w-5" />}>
            {tr("This session was")} {session.status === 'no_show' ? tr("missed — the client did not attend") : 'cancelled'}{tr(". Book another from the client’s page.")}
          </Notice>
        ) : (
          <Tabs<Phase>
            label={tr("Session steps")}
            value={phase}
            onChange={setPhase}
            tabs={[
              { value: 'prepare', label: msg('1. Prepare') },
              { value: 'during', label: msg('2. In session') },
              { value: 'wrap', label: msg('3. Wrap up'), badge: session.status === 'completed' && !note.signedAt ? tr('Note due') : undefined },
            ]}
          />
        )}
      </Card>

      {/* 1. PREPARE */}
      {!closed && phase === 'prepare' && (
        <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
          <div className="flex flex-col gap-6">
            <Card as="section" aria-labelledby="p-since" className="flex flex-col gap-5">
              <SectionHeader id="p-since" title={tr("Since the last session")} size="md" subtitle={last ? tr("Last session: {v0}", { v0: fmtDateLong(last.start) }) : tr("This is your first session together.")} />
              <SharingNote shares={client.sharesCheckins} />
              {client.sharesCheckins ? (
                <div className="grid gap-6 sm:grid-cols-2">
                  <TrendChart title={tr("Mood")} values={client.mood} min={1} max={5} ticks={{ 1: tr('Low'), 3: tr('Okay'), 5: tr('Great') }} describe={v => tr('Mood: {mood}', { mood: MOODS[v - 1] ? tr(MOODS[v - 1]) : v })} summary={tr('1 = very low, 5 = very good')} />
                  <TrendChart title={tr("Cravings")} values={client.craving} min={0} max={10} ticks={{ 0: '0', 5: '5', 10: '10' }} describe={v => tr('Craving {v} of 10', { v })} summary={tr('0 = none, 10 = overwhelming')} />
                </div>
              ) : (
                <p className="m-0 rounded-xl bg-bg p-4 text-[0.9375rem] text-ink-2">
                  {tr("{nickname} has not chosen to share daily check-ins. Ask how the week went at the start of the session.", { nickname: client.nickname })}
                </p>
              )}
            </Card>

            {last?.note && (
              <Card as="section" aria-labelledby="p-last" className="flex flex-col gap-3">
                <SectionHeader id="p-last" title={tr("Last session’s plan")} size="md" />
                <p className="m-0 text-base leading-relaxed text-ink-2">{last.note.plan || tr("No plan written.")}</p>
                {last.note.homework && (
                  <p className="m-0 text-[0.9375rem] text-ink-2">
                    <T text="<0>Homework set:</0> {homework}" parts={[<strong className="text-ink" />]} vars={{ homework: last.note.homework }} />
                  </p>
                )}
              </Card>
            )}
          </div>

          <div className="flex flex-col gap-6">
            <Card as="section" aria-labelledby="p-plan" className="flex flex-col gap-4">
              <SectionHeader id="p-plan" title={tr("Plan for today")} size="md" />
              <Field label={tr("Main topic")} htmlFor="p-topic" optional>
                <input id="p-topic" value={topic} onChange={e => setTopic(e.target.value)} placeholder={tr("e.g. How the weekend went")} className={inputClass} />
              </Field>
              <div>
                <p className="m-0 mb-2 text-sm font-bold text-ink">{tr("Homework to review")}</p>
                {client.homework.length === 0 ? (
                  <p className="m-0 text-[0.9375rem] text-ink-3">{tr("No homework set.")}</p>
                ) : (
                  <ul className="m-0 flex list-none flex-col gap-2 p-0">
                    {client.homework.map(h => (
                      <li key={h.id} className="flex items-start gap-2 text-[0.9375rem] text-ink-2">
                        {h.done ? <Check className="mt-0.5 h-4 w-4 shrink-0 text-pri-text" aria-hidden="true" /> : <Square className="mt-0.5 h-4 w-4 shrink-0 text-ink-3" aria-hidden="true" />}
                        <span>
                          {tr(h.text)} <span className="text-ink-3">· {h.done ? 'done' : tr("not done yet")}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              {client.goals.length > 0 && (
                <div>
                  <p className="m-0 mb-2 text-sm font-bold text-ink">{tr("Their goals")}</p>
                  <ul className="m-0 list-disc pl-5 text-[0.9375rem] text-ink-2">
                    {client.goals.map(g => (
                      <li key={g}>{g}</li>
                    ))}
                  </ul>
                </div>
              )}
            </Card>

            {client.risk !== 'low' && client.safetyPlan.copingSteps && (
              <Card as="section" tone="warn" aria-labelledby="p-safety" className="flex flex-col gap-2">
                <h2 id="p-safety" className="m-0 flex items-center gap-2 text-base font-bold text-warn">
                  <ShieldAlert className="h-5 w-5" aria-hidden="true" /> {tr("Safety plan")}
                </h2>
                <p className="m-0 text-[0.9375rem] text-ink-2">
                  <T text="<0>Warning signs:</0> {warningSigns}" parts={[<strong className="text-ink" />]} vars={{ warningSigns: client.safetyPlan.warningSigns }} />
                </p>
                <p className="m-0 text-[0.9375rem] text-ink-2">
                  <T text="<0>What helps:</0> {copingSteps}" parts={[<strong className="text-ink" />]} vars={{ copingSteps: client.safetyPlan.copingSteps }} />
                </p>
              </Card>
            )}

            <div className="flex flex-col gap-3">
              {session.status === 'scheduled' && (
                <Button size="lg" block icon={<Play className="h-5 w-5" />} onClick={start}>
                  {tr("Start session")}
                </Button>
              )}
              {session.status !== 'scheduled' && (
                <Button size="lg" block onClick={() => setPhase(session.status === 'completed' ? 'wrap' : 'during')}>
                  {tr("Continue to")} {session.status === 'completed' ? tr("wrap up") : 'session'}
                </Button>
              )}
              <Button variant="secondary" block onClick={onOpenClient}>
                {tr("Open full client record")}
              </Button>
              {session.status === 'scheduled' && (
                <div className="flex flex-wrap justify-center gap-2">
                  <Button variant="ghost" size="sm" icon={<UserX className="h-4 w-4" />} onClick={markNoShow}>
                    {tr("Client did not attend")}
                  </Button>
                  <Button variant="ghost" size="sm" icon={<XCircle className="h-4 w-4" />} onClick={cancel}>
                    {tr("Cancel session")}
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 2. IN SESSION */}
      {!closed && phase === 'during' && (
        <div className="grid gap-6 lg:grid-cols-[2fr_3fr]">
          <div className="flex flex-col gap-6">
            <Card as="section" aria-labelledby="d-agenda" className="flex flex-col gap-3">
              <SectionHeader id="d-agenda" title={tr("Session agenda")} size="md" subtitle={tr("{length} of {length2} done", { length: note.agendaDone.length, length2: SESSION_AGENDA.length })} />
              <ul className="m-0 flex list-none flex-col gap-1 p-0">
                {SESSION_AGENDA.map(item => {
                  const done = note.agendaDone.includes(item);
                  return (
                    <li key={item}>
                      <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-2 hover:bg-muted">
                        <input type="checkbox" checked={done} onChange={() => toggleAgenda(item)} className="h-5 w-5 shrink-0 cursor-pointer" />
                        <span className={cx('text-[0.9375rem]', done ? 'text-ink-3 line-through' : 'text-ink')}>{item}</span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </Card>

            <Card as="section" aria-labelledby="d-risk" className="flex flex-col gap-3">
              <SectionHeader id="d-risk" title={tr("Safety check")} size="md" subtitle={tr("How would you rate their risk today?")} />
              <div className="grid grid-cols-3 gap-2" role="group" aria-label={tr("Risk today")}>
                {(['low', 'moderate', 'high'] as ClientRisk[]).map(r => (
                  <button
                    key={r}
                    type="button"
                    aria-pressed={note.riskLevel === r}
                    onClick={() => {
                      setN({ riskLevel: r });
                      // High risk takes effect straight away, so the client shows on the safety map
                      if (r === 'high' && client.risk !== 'high') {
                        store.updateClient(client.id, { risk: 'high' });
                        store.logEscalation(client.id, 'Marked high risk during a session');
                      }
                    }}
                    className={cx(
                      'min-h-12 rounded-xl border-2 px-2 text-sm font-bold cursor-pointer',
                      note.riskLevel === r
                        ? r === 'high'
                          ? 'border-danger bg-danger-soft text-danger-text'
                          : r === 'moderate'
                          ? 'border-warn-bar bg-warn-soft text-warn'
                          : 'border-pri bg-pri-soft text-pri-ink'
                        : 'border-line bg-surface text-ink hover:border-pri-text'
                    )}
                  >
                    {tr(RISK_INFO[r].label)}
                  </button>
                ))}
              </div>
              {note.riskLevel === 'high' && (
                <Notice tone="danger" icon={<ShieldAlert className="h-5 w-5" />}>
                  {tr("Follow the crisis steps: ask directly about harm, agree a safety plan, involve their support person, and call 112 if there is immediate danger.")}
                  {onOpenSafety && (
                    <button type="button" onClick={onOpenSafety} className="font-bold underline cursor-pointer">
                      {tr("Open safety map")}
                    </button>
                  )}
                </Notice>
              )}
            </Card>

            <Card as="section" aria-labelledby="d-mood" className="flex flex-col gap-3">
              <SectionHeader id="d-mood" title={tr("Mood you observed")} size="md" />
              <div className="grid grid-cols-5 gap-1.5" role="group" aria-label={tr("Observed mood")}>
                {MOODS.map((m, i) => (
                  <button
                    key={m}
                    type="button"
                    aria-pressed={note.moodRating === i + 1}
                    onClick={() => setN({ moodRating: i + 1 })}
                    className={cx(
                      'flex min-h-12 flex-col items-center justify-center rounded-xl border-2 px-1 text-xs font-bold cursor-pointer',
                      note.moodRating === i + 1 ? 'border-pri bg-pri-soft text-pri-ink' : 'border-line bg-surface text-ink-2 hover:border-pri-text'
                    )}
                  >
                    <span className="text-base">{i + 1}</span>
                    <span className="leading-tight">{m}</span>
                  </button>
                ))}
              </div>
            </Card>
          </div>

          <div className="flex flex-col gap-6">
            <Card as="section" aria-labelledby="d-notes" className="flex flex-col gap-4">
              <SectionHeader id="d-notes" title={tr("Quick notes")} size="md" subtitle={tr("Only you can see these. They become the first part of your session note.")} />
              <textarea
                aria-labelledby="d-notes"
                rows={10}
                value={note.data}
                onChange={e => setN({ data: e.target.value })}
                placeholder={tr("What the client says, what you notice, key moments…")}
                className={textareaClass}
              />
              <Field label={tr("Homework for next time")} htmlFor="d-hw" optional>
                <input id="d-hw" value={note.homework || ''} onChange={e => setN({ homework: e.target.value })} placeholder={tr("e.g. Thought record for any craving above 6")} className={inputClass} />
              </Field>
            </Card>

            {session.status === 'in_progress' ? (
              <Button size="lg" block icon={<ClipboardCheck className="h-5 w-5" />} onClick={end}>
                {tr("End session and write note")}
              </Button>
            ) : session.status === 'scheduled' ? (
              <Button size="lg" block icon={<Play className="h-5 w-5" />} onClick={start}>
                {tr("Start session")}
              </Button>
            ) : (
              <Button size="lg" block onClick={() => setPhase('wrap')}>
                {tr("Go to wrap up")}
              </Button>
            )}
          </div>
        </div>
      )}

      {/* 3. WRAP UP */}
      {!closed && phase === 'wrap' && (
        <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
          <Card as="section" aria-labelledby="w-note" className="flex flex-col gap-5">
            <SectionHeader
              id="w-note"
              title={tr("Session note")}
              size="md"
              subtitle={tr("DAP format: what happened, what you think, what comes next.")}
              action={
                note.signedAt && !editing ? (
                  <Button variant="secondary" size="sm" icon={<Pencil className="h-4 w-4" />} onClick={() => setEditing(true)}>
                    {tr("Edit")}
                  </Button>
                ) : undefined
              }
            />
            {savedMsg && <Notice icon={<Check className="h-5 w-5" />}>{savedMsg}</Notice>}
            {session.status === 'scheduled' && (
              <Notice tone="info" icon={<FileText className="h-5 w-5" />}>
                {tr("This session has not started yet. You can draft the note now and sign it after the session.")}
              </Notice>
            )}

            {editing ? (
              <>
                <Field label={tr("Data — what happened")} htmlFor="w-d" hint={tr("What the client said and did, and what you observed.")}>
                  <textarea id="w-d" rows={5} value={note.data} onChange={e => setN({ data: e.target.value })} className={textareaClass} />
                </Field>
                <Field label={tr("Assessment — what you think")} htmlFor="w-a" hint={tr("Your clinical view: progress, patterns, risk.")}>
                  <textarea id="w-a" rows={4} value={note.assessment} onChange={e => setN({ assessment: e.target.value })} className={textareaClass} />
                </Field>
                <Field label={tr("Plan — what comes next")} htmlFor="w-p" hint={tr("Focus for next session, referrals, anything to follow up.")}>
                  <textarea id="w-p" rows={3} value={note.plan} onChange={e => setN({ plan: e.target.value })} className={textareaClass} />
                </Field>
              </>
            ) : (
              <dl className="m-0 flex flex-col gap-4">
                {[
                  ['Data', note.data],
                  ['Assessment', note.assessment],
                  ['Plan', note.plan],
                ].map(([k, v]) => (
                  <div key={k}>
                    <dt className="text-sm font-bold text-ink-3">{k}</dt>
                    <dd className="m-0 whitespace-pre-wrap text-base leading-relaxed text-ink">{v || '—'}</dd>
                  </div>
                ))}
              </dl>
            )}
          </Card>

          <div className="flex flex-col gap-6">
            <Card as="section" aria-labelledby="w-out" className="flex flex-col gap-4">
              <SectionHeader id="w-out" title={tr("Outcome")} size="md" />
              <div className="flex flex-wrap gap-2 text-[0.9375rem] text-ink-2">
                <span>
                  {tr("Risk:")} <RiskBadge risk={note.riskLevel} />
                </span>
                <span>
                  {tr("· Mood:")} <strong className="text-ink">{MOODS[note.moodRating - 1]}</strong>
                </span>
              </div>
              {editing && (
                <Field label={tr("Homework")} htmlFor="w-hw" optional hint={tr("Added to the client’s homework list when you sign.")}>
                  <input id="w-hw" value={note.homework || ''} onChange={e => setN({ homework: e.target.value })} className={inputClass} />
                </Field>
              )}
              {!editing && note.homework && (
                <p className="m-0 text-[0.9375rem] text-ink-2">
                  <T text="<0>Homework:</0> {homework}" parts={[<strong className="text-ink" />]} vars={{ homework: note.homework }} />
                </p>
              )}
              {editing && !note.signedAt && (
                <div className="flex flex-col gap-3 rounded-xl border border-line p-4">
                  <label className="flex cursor-pointer items-center gap-3 text-[0.9375rem] font-semibold text-ink">
                    <input type="checkbox" checked={bookNext} onChange={e => setBookNext(e.target.checked)} className="h-5 w-5 cursor-pointer" />
                    <CalendarPlus className="h-5 w-5 text-pri-text" aria-hidden="true" /> {tr("Book the next session")}
                  </label>
                  {bookNext && <input type="datetime-local" aria-label={tr("Next session date and time")} value={nextWhen} onChange={e => setNextWhen(e.target.value)} className={inputClass} />}
                </div>
              )}
            </Card>

            {editing ? (
              <div className="flex flex-col gap-3">
                <Button size="lg" block icon={<Check className="h-5 w-5" />} onClick={sign} disabled={!note.data.trim() || session.status === 'scheduled'}>
                  {tr("Sign and save note")}
                </Button>
                <p className="m-0 text-center text-sm text-ink-3">
                  {session.status === 'scheduled' ? tr("You can sign once the session has taken place.") : tr("Your draft saves automatically as you type.")}
                </p>
              </div>
            ) : (
              <>
                {(() => {
                  const nextS = store.data.sessions
                    .filter(s => s.clientId === client.id && s.status === 'scheduled' && s.start > session.start)
                    .sort((a, b) => a.start.localeCompare(b.start))[0];
                  return nextS ? (
                    <Card className="flex items-center gap-3">
                      <CalendarPlus className="h-5 w-5 shrink-0 text-pri-text" aria-hidden="true" />
                      <p className="m-0 text-[0.9375rem] text-ink-2">
                        {tr("Next session")} <strong className="text-ink">{fmtDayInline(nextS.start)}, {fmtTime(nextS.start)}</strong>
                      </p>
                    </Card>
                  ) : null;
                })()}
              <p className="m-0 text-sm text-ink-3">{tr("Signed")} {note.signedAt ? `${fmtDayInline(note.signedAt)} at ${fmtTime(note.signedAt)}` : ''}.</p>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
