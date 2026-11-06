import { isRemote, newId } from '../../lib/supabase';
import { sharedThoughtsOnDevice } from '../../lib/cbtStore';
import { trapLabel } from '../../lib/cbt';
import React, { useState } from 'react';
import { ArrowLeft, CalendarPlus, Check, Plus, Search, Trash2 } from 'lucide-react';
import { Avatar, Badge, Button, Card, Field, Notice, SectionHeader, Segmented, Tabs, cx, inputClass, textareaClass } from '../../components/ui';
import type { ClientRecord, ClientRisk, TherapistProfile } from '../types';
import type { TherapistStore } from '../useTherapistStore';
import type { TherapistNav } from '../TherapistApp';
import { ago, fmtDateLong, fmtDay, fmtDayInline, fmtTime, focusLabel } from '../data';
import { ClientLine, RISK_INFO, RiskBadge, SessionRow, SharingNote, missedCheckins, trend } from '../parts';
import { TrendChart } from '../TrendChart';
import { BookSessionModal } from './SessionsTab';

import { t, T, msg } from '../../i18n';
interface Props {
  therapist: TherapistProfile;
  store: TherapistStore;
  nav: TherapistNav;
  clientId: string | null;
  setClientId: (id: string | null) => void;
}

type Filter = 'all' | 'attention' | 'paused';

const needsAttention = (c: ClientRecord) => {
  const tr = c.sharesCheckins ? trend(c.craving) : null;
  return c.risk !== 'low' || (tr != null && tr >= 1.5) || (c.sharesCheckins && missedCheckins(c.craving) >= 2);
};

export const ClientsTab: React.FC<Props> = props => {
  const { store, clientId, setClientId, nav } = props;
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const client = clientId ? store.data.clients.find(c => c.id === clientId) : undefined;

  if (client) return <ClientDetail {...props} client={client} onBack={() => setClientId(null)} />;

  const nextSessionOf = (id: string) =>
    store.data.sessions
      .filter(s => s.clientId === id && s.status === 'scheduled' && new Date(s.start).getTime() > Date.now() - 3600000)
      .sort((a, b) => a.start.localeCompare(b.start))[0];

  const riskOrder: Record<ClientRisk, number> = { high: 0, moderate: 1, low: 2 };
  const list = store.data.clients
    .filter(c => (filter === 'paused' ? c.status !== 'active' : c.status === 'active'))
    .filter(c => filter !== 'attention' || needsAttention(c))
    .filter(c => !query || c.nickname.toLowerCase().includes(query.toLowerCase()) || focusLabel(c.focus).toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => riskOrder[a.risk] - riskOrder[b.risk] || a.nickname.localeCompare(b.nickname));

  return (
    <div className="flex flex-col gap-6 animate-fadeIn">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Segmented<Filter>
          label={t("Filter clients")}
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: msg('Active') },
            { value: 'attention', label: t('Needs attention ({count})', { count: store.data.clients.filter(c => c.status === 'active' && needsAttention(c)).length }) },
            { value: 'paused', label: msg('Paused or closed') },
          ]}
        />
        <div className="relative sm:w-72">
          <label htmlFor="cl-search" className="sr-only">
            {t("Search clients")}
          </label>
          <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-3" aria-hidden="true" />
          <input id="cl-search" type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder={t("Search by name or focus")} className={cx(inputClass, 'bg-surface pl-12')} />
        </div>
      </div>

      {list.length === 0 ? (
        <Card className="flex flex-col items-start gap-3">
          <p className="m-0 text-base font-bold text-ink">{store.data.clients.length === 0 ? t("No clients yet") : t("No clients match")}</p>
          <p className="m-0 text-[0.9375rem] text-ink-2">
            {store.data.clients.length === 0 ? t("People who book you appear in Requests. Accept a request to add them here.") : t("Try another filter or search.")}
          </p>
          {store.data.clients.length === 0 && (
            <Button variant="secondary" onClick={() => nav.go('requests')}>
              {t("Go to requests")}
            </Button>
          )}
        </Card>
      ) : (
        <ul className="m-0 grid list-none gap-4 p-0 sm:grid-cols-2 xl:grid-cols-3">
          {list.map(c => {
            const next = nextSessionOf(c.id);
            return (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => setClientId(c.id)}
                  className="flex h-full w-full flex-col gap-4 rounded-2xl border border-line bg-surface p-5 text-left transition-colors hover:border-pri-text cursor-pointer"
                >
                  <span className="flex items-center gap-3">
                    <Avatar tone="muted" name={c.nickname} size={44} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-base font-bold text-ink">{c.nickname}</span>
                      <ClientLine client={c} />
                    </span>
                  </span>
                  <span className="flex flex-wrap gap-2">
                    <RiskBadge risk={c.risk} />
                    {!c.sharesCheckins && <Badge tone="muted">{t("Check-ins private")}</Badge>}
                  </span>
                  <span className="mt-auto grid grid-cols-2 gap-3 border-t border-line pt-3 text-sm">
                    <span>
                      <T text="<0>Next session</0>" parts={[<span className="block text-ink-3" />]} />
                      <span className="block font-bold text-ink">{next ? `${fmtDay(next.start)}, ${fmtTime(next.start)}` : t("Not booked")}</span>
                    </span>
                    <span>
                      <T text="<0>Last check-in</0>" parts={[<span className="block text-ink-3" />]} />
                      <span className="block font-bold text-ink">{c.sharesCheckins ? ago(c.lastCheckin) : '—'}</span>
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};

/* ---------------- Client record ---------------- */

type Section = 'overview' | 'sessions' | 'safety' | 'notes';

const ClientDetail: React.FC<Props & { client: ClientRecord; onBack: () => void }> = ({ therapist, store, nav, client, onBack }) => {
  // Supabase: loaded with the caseload. On this device: shared from the demo client app.
  const thoughts = client.thoughtRecords ?? (isRemote ? [] : sharedThoughtsOnDevice(client.nickname));
  const [section, setSection] = useState<Section>('overview');
  const [bookOpen, setBookOpen] = useState(false);
  const [newGoal, setNewGoal] = useState('');
  const [newHw, setNewHw] = useState('');
  const [plan, setPlan] = useState(client.safetyPlan);
  const [privateNote, setPrivateNote] = useState(client.privateNote || '');
  const [saved, setSaved] = useState('');

  const update = (patch: Partial<ClientRecord>) => store.updateClient(client.id, patch);
  const flash = (m: string) => {
    setSaved(m);
    setTimeout(() => setSaved(''), 2500);
  };

  const sessions = store.data.sessions.filter(s => s.clientId === client.id).sort((a, b) => b.start.localeCompare(a.start));
  const upcoming = sessions.filter(s => s.status === 'scheduled' && new Date(s.start).getTime() > Date.now() - 3600000).reverse();
  const past = sessions.filter(s => !upcoming.includes(s));
  const crTrend = client.sharesCheckins ? trend(client.craving) : null;

  return (
    <div className="flex flex-col gap-6 animate-fadeIn">
      <button type="button" onClick={onBack} className="flex min-h-11 items-center gap-2 self-start text-[0.9375rem] font-bold text-pri-text hover:underline cursor-pointer">
        <ArrowLeft className="h-5 w-5" aria-hidden="true" /> {t("All clients")}
      </button>

      {client.risk === 'high' && (
        <div role="alert" className="flex flex-wrap items-center gap-3 rounded-2xl bg-danger-soft px-4 py-3 text-danger-text">
          <p className="m-0 min-w-0 flex-1 text-[0.9375rem] font-semibold">
            {t("{nickname} is at high risk.", { nickname: client.nickname })}
            {client.locationConsent ? (client.lastLocation ? t("Their location is on the safety map.") : t("No location shared yet.")) : t("They have not agreed to share their location.")}
          </p>
          <Button variant="danger" size="sm" onClick={() => nav.openSafety(client.id)}>
            {t("Open safety map")}
          </Button>
        </div>
      )}

      <Card raised className="flex flex-col gap-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-center gap-4">
            <Avatar tone="muted" name={client.nickname} size={56} />
            <div className="min-w-0">
              <h1 className="m-0 truncate text-xl font-bold text-ink sm:text-2xl">{client.nickname}</h1>
              <p className="m-0 text-[0.9375rem] text-ink-2">
                {focusLabel(client.focus)}
                {client.age ? t(" · {age} years", { age: client.age }) : ''} {t("· with you since")} {new Date(client.startedAt).toLocaleDateString([], { month: 'long', year: 'numeric' })}
              </p>
              <SharingNote shares={client.sharesCheckins} className="mt-1" />
            </div>
          </div>
          <Button icon={<CalendarPlus className="h-5 w-5" />} onClick={() => setBookOpen(true)}>
            {t("Book session")}
          </Button>
        </div>
        <dl className="m-0 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-xl bg-bg p-3.5">
            <dt className="text-sm text-ink-3">{t("Clean streak")}</dt>
            <dd className="m-0 text-lg font-extrabold text-ink">{t("{streakDays} days", { streakDays: client.streakDays })}</dd>
          </div>
          <div className="rounded-xl bg-bg p-3.5">
            <dt className="text-sm text-ink-3">{t("Risk")}</dt>
            <dd className="m-0 mt-1">
              <RiskBadge risk={client.risk} />
            </dd>
          </div>
          <div className="rounded-xl bg-bg p-3.5">
            <dt className="text-sm text-ink-3">{t("Sessions")}</dt>
            <dd className="m-0 text-lg font-extrabold text-ink">{t("{length} done", { length: sessions.filter(s => s.status === 'completed').length })}</dd>
          </div>
          <div className="rounded-xl bg-bg p-3.5">
            <dt className="text-sm text-ink-3">{t("Cravings vs last week")}</dt>
            <dd className="m-0 text-lg font-extrabold text-ink">{crTrend == null ? '—' : crTrend > 0.4 ? t("Up {v0}", { v0: crTrend.toFixed(1) }) : crTrend < -0.4 ? t("Down {v0}", { v0: Math.abs(crTrend).toFixed(1) }) : t("About the same")}</dd>
          </div>
        </dl>
        <Tabs<Section>
          label={t("Client record")}
          value={section}
          onChange={setSection}
          tabs={[
            { value: 'overview', label: msg('Progress') },
            { value: 'sessions', label: msg('Sessions'), badge: sessions.length },
            { value: 'safety', label: msg('Safety plan') },
            { value: 'notes', label: msg('Private notes') },
          ]}
        />
      </Card>

      {saved && <Notice icon={<Check className="h-5 w-5" />}>{saved}</Notice>}

      {section === 'overview' && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card as="section" aria-labelledby="c-trend" className="flex flex-col gap-5 lg:col-span-2">
            <SectionHeader id="c-trend" title={t("Daily check-ins")} size="md" subtitle={t("Last 14 days. Gaps are days without a check-in.")} />
            {client.sharesCheckins ? (
              <div className="grid gap-6 sm:grid-cols-2">
                <TrendChart title={t("Mood")} values={client.mood} min={1} max={5} ticks={{ 1: t('Low'), 3: t('Okay'), 5: t('Great') }} describe={v => t('Mood {v} of 5', { v })} summary={t('1 = very low, 5 = very good')} />
                <TrendChart title={t("Cravings")} values={client.craving} min={0} max={10} ticks={{ 0: '0', 5: '5', 10: '10' }} describe={v => t('Craving {v} of 10', { v })} summary={t('0 = none, 10 = overwhelming')} />
              </div>
            ) : (
              <p className="m-0 rounded-xl bg-bg p-4 text-[0.9375rem] text-ink-2">
                {t("{nickname} keeps daily check-ins private. They can choose to share them from their own Settings.", { nickname: client.nickname })}
              </p>
            )}
          </Card>

          <Card as="section" aria-labelledby="c-thoughts" className="flex flex-col gap-4 lg:col-span-2">
            <SectionHeader
              id="c-thoughts"
              title={t("Thought records")}
              size="md"
              subtitle={t("CBT thought records the client chose to share from AI therapy. Useful to review together in session.")}
            />
            {thoughts.length === 0 ? (
              <p className="m-0 rounded-xl bg-bg p-4 text-[0.9375rem] text-ink-2">{t("No shared thought records yet.")}</p>
            ) : (
              <ul className="m-0 grid list-none gap-3 p-0 md:grid-cols-2">
                {thoughts.slice(0, 6).map(r => (
                  <li key={r.id} className="flex flex-col gap-1.5 rounded-xl border border-line p-4">
                    <p className="m-0 text-sm text-ink-3 first-letter:uppercase">
                      {fmtDayInline(r.createdAt)} · {trapLabel(r.trap)} · {r.emotion || t("Feeling")}{' '}
                      <strong className={cx(r.intensityAfter < r.intensityBefore ? 'text-pri-text' : 'text-warn')}>
                        {r.intensityBefore} → {r.intensityAfter}
                      </strong>
                    </p>
                    {r.situation && <p className="m-0 text-[0.9375rem] text-ink-2">{r.situation}</p>}
                    <p className="m-0 text-[0.9375rem] text-ink">
                      <T text="<0>Thought:</0> {thought}" parts={[<span className="font-bold" />]} vars={{ thought: r.thought }} />
                    </p>
                    <p className="m-0 text-[0.9375rem] text-ink">
                      <T text="<0>Fairer thought:</0> {balancedThought}" parts={[<span className="font-bold" />]} vars={{ balancedThought: r.balancedThought }} />
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card as="section" aria-labelledby="c-goals" className="flex flex-col gap-4">
            <SectionHeader id="c-goals" title={t("Goals")} size="md" subtitle={t("Agreed together with the client.")} />
            <ul className="m-0 flex list-none flex-col gap-2 p-0">
              {client.goals.map(g => (
                <li key={g} className="flex items-center gap-3 rounded-xl bg-bg px-4 py-2.5">
                  <span className="flex-1 text-[0.9375rem] text-ink">{g}</span>
                  <button type="button" aria-label={t("Remove goal: {g}", { g })} onClick={() => update({ goals: client.goals.filter(x => x !== g) })} className="flex h-10 w-10 items-center justify-center rounded-lg text-ink-3 hover:bg-muted hover:text-danger-text cursor-pointer">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </li>
              ))}
              {client.goals.length === 0 && <li className="text-[0.9375rem] text-ink-3">{t("No goals yet.")}</li>}
            </ul>
            <form
              className="flex gap-2"
              onSubmit={e => {
                e.preventDefault();
                if (!newGoal.trim()) return;
                update({ goals: [...client.goals, newGoal.trim()] });
                setNewGoal('');
              }}
            >
              <label htmlFor="c-ng" className="sr-only">
                {t("New goal")}
              </label>
              <input id="c-ng" value={newGoal} onChange={e => setNewGoal(e.target.value)} placeholder={t("Add a goal")} className={inputClass} />
              <Button type="submit" variant="secondary" icon={<Plus className="h-5 w-5" />}>
                {t("Add")}
              </Button>
            </form>
          </Card>

          <Card as="section" aria-labelledby="c-hw" className="flex flex-col gap-4">
            <SectionHeader id="c-hw" title={t("Homework")} size="md" subtitle={t("The client sees these in their app.")} />
            <ul className="m-0 flex list-none flex-col gap-2 p-0">
              {client.homework.map(h => (
                <li key={h.id}>
                  <label className="flex cursor-pointer items-start gap-3 rounded-xl bg-bg px-4 py-3">
                    <input
                      type="checkbox"
                      checked={h.done}
                      onChange={() => update({ homework: client.homework.map(x => (x.id === h.id ? { ...x, done: !x.done } : x)) })}
                      className="mt-0.5 h-5 w-5 shrink-0 cursor-pointer"
                    />
                    <span className="min-w-0 flex-1">
                      <span className={cx('block text-[0.9375rem]', h.done ? 'text-ink-3 line-through' : 'text-ink')}>{t(h.text)}</span>
                      <span className="block text-sm text-ink-3">{t("Set")} {fmtDayInline(h.setOn)}</span>
                    </span>
                  </label>
                </li>
              ))}
              {client.homework.length === 0 && <li className="text-[0.9375rem] text-ink-3">{t("No homework set.")}</li>}
            </ul>
            <form
              className="flex gap-2"
              onSubmit={e => {
                e.preventDefault();
                if (!newHw.trim()) return;
                update({ homework: [...client.homework, { id: newId(), text: newHw.trim(), done: false, setOn: new Date().toISOString() }] });
                setNewHw('');
              }}
            >
              <label htmlFor="c-nh" className="sr-only">
                {t("New homework")}
              </label>
              <input id="c-nh" value={newHw} onChange={e => setNewHw(e.target.value)} placeholder={t("Add homework")} className={inputClass} />
              <Button type="submit" variant="secondary" icon={<Plus className="h-5 w-5" />}>
                {t("Add")}
              </Button>
            </form>
          </Card>
        </div>
      )}

      {section === 'sessions' && (
        <div className="flex flex-col gap-6">
          <Card as="section" aria-labelledby="c-up" className="flex flex-col gap-2">
            <SectionHeader id="c-up" title={t("Coming up")} size="md" />
            {upcoming.length === 0 ? (
              <p className="m-0 text-[0.9375rem] text-ink-3">{t("Nothing booked.")}</p>
            ) : (
              <div className="-mx-3 flex flex-col divide-y divide-line">
                {upcoming.map(s => (
                  <SessionRow key={s.id} session={s} client={client} showDay onOpen={() => nav.openSession(s.id)} />
                ))}
              </div>
            )}
          </Card>
          <Card as="section" aria-labelledby="c-past" className="flex flex-col gap-3">
            <SectionHeader id="c-past" title={t("Session history")} size="md" />
            {past.length === 0 ? (
              <p className="m-0 text-[0.9375rem] text-ink-3">{t("No past sessions.")}</p>
            ) : (
              <ol className="m-0 flex list-none flex-col gap-3 p-0">
                {past.map(s => (
                  <li key={s.id} className="rounded-xl border border-line p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="m-0 text-base font-bold text-ink">
                        {fmtDateLong(s.start)} · {s.topic || t("Session")}
                      </p>
                      <Button variant="link" onClick={() => nav.openSession(s.id)}>
                        {s.note?.signedAt ? t("Open note") : s.status === 'completed' ? t("Finish note") : t("Open")}
                      </Button>
                    </div>
                    {s.note?.signedAt ? (
                      <p className="m-0 mt-1 text-[0.9375rem] leading-relaxed text-ink-2">
                        <T text="<0>Plan:</0>" parts={[<strong className="text-ink" />]} /> {s.note.plan || '—'}
                      </p>
                    ) : (
                      <p className="m-0 mt-1 text-[0.9375rem] text-ink-3">
                        {s.status === 'no_show' ? t("Did not attend") : s.status === 'cancelled' ? t("Cancelled") : t("Note not finished")}
                      </p>
                    )}
                  </li>
                ))}
              </ol>
            )}
          </Card>
        </div>
      )}

      {section === 'safety' && (
        <Card as="section" aria-labelledby="c-safe" className="flex flex-col gap-5">
          <SectionHeader
            id="c-safe"
            title={t("Safety plan")}
            size="md"
            subtitle={plan.updatedAt ? t("Last updated {v0}. Build it together with the client.", { v0: fmtDayInline(plan.updatedAt) }) : t("Build it together with the client.")}
          />
          <fieldset className="m-0 border-0 p-0">
            <legend className="mb-2 p-0 text-sm font-bold text-ink">{t("Risk level")}</legend>
            <div className="grid grid-cols-3 gap-2">
              {(['low', 'moderate', 'high'] as ClientRisk[]).map(r => (
                <button
                  key={r}
                  type="button"
                  aria-pressed={client.risk === r}
                  onClick={() => update({ risk: r })}
                  className={cx(
                    'min-h-12 rounded-xl border-2 px-2 text-sm font-bold cursor-pointer',
                    client.risk === r ? 'border-pri bg-pri-soft text-pri-ink' : 'border-line bg-surface text-ink hover:border-pri-text'
                  )}
                >
                  {t(RISK_INFO[r].label)}
                </button>
              ))}
            </div>
          </fieldset>
          <Field label={t("Warning signs")} htmlFor="sp-w" hint={t("Thoughts, feelings or situations that come before a crisis or relapse.")}>
            <textarea id="sp-w" rows={3} value={plan.warningSigns} onChange={e => setPlan({ ...plan, warningSigns: e.target.value })} className={textareaClass} />
          </Field>
          <Field label={t("What helps")} htmlFor="sp-c" hint={t("Steps the client can take on their own.")}>
            <textarea id="sp-c" rows={3} value={plan.copingSteps} onChange={e => setPlan({ ...plan, copingSteps: e.target.value })} className={textareaClass} />
          </Field>
          <Field label={t("People who can help")} htmlFor="sp-p" hint={t("Names only. Phone numbers stay in the client’s app.")}>
            <textarea id="sp-p" rows={2} value={plan.supportPeople} onChange={e => setPlan({ ...plan, supportPeople: e.target.value })} className={textareaClass} />
          </Field>
          <Button
            className="self-start"
            onClick={() => {
              const next = { ...plan, updatedAt: new Date().toISOString() };
              setPlan(next);
              update({ safetyPlan: next });
              flash(t('Safety plan saved.'));
            }}
          >
            {t("Save safety plan")}
          </Button>
        </Card>
      )}

      {section === 'notes' && (
        <Card as="section" aria-labelledby="c-notes" className="flex flex-col gap-5">
          <SectionHeader id="c-notes" title={t("Private notes")} size="md" subtitle={t("Only you can see these. They are not shared with the client.")} />
          <textarea aria-labelledby="c-notes" rows={8} value={privateNote} onChange={e => setPrivateNote(e.target.value)} className={textareaClass} placeholder={t("Background, formulation, things to remember…")} />
          <Field label={t("Status")} htmlFor="c-status">
            <select id="c-status" value={client.status} onChange={e => update({ status: e.target.value as ClientRecord['status'] })} className={inputClass}>
              <option value="active">{t("Active")}</option>
              <option value="paused">{t("Paused (taking a break)")}</option>
              <option value="discharged">{t("Closed (finished working together)")}</option>
            </select>
          </Field>
          <Button
            className="self-start"
            onClick={() => {
              update({ privateNote });
              flash(t('Notes saved.'));
            }}
          >
            {t("Save notes")}
          </Button>
        </Card>
      )}

      <BookSessionModal isOpen={bookOpen} onClose={() => setBookOpen(false)} therapist={therapist} store={store} clientId={client.id} />
    </div>
  );
};

