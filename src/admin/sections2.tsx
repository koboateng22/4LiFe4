/** Admin dashboard: Appointments, Moderation, SOS, Content, System, Admin log */
import React, { useEffect, useState } from 'react';
import { CheckCircle2, CircleSlash, Info, ShieldCheck, XCircle } from 'lucide-react';
import { Button, Card, Modal, Notice, Segmented, cx, inputClass } from '../components/ui';
import { adminApi, type ActionRow, type Appointments, type Content, type ReportItem, type SosDetail, type SosRow } from '../lib/db/adminApi';
import { apiFetch } from '../lib/apiFetch';
import { ConfirmDialog, DataList, LoadState, Status, ago, fmtDate, fmtDateTime, human, useLoad, type ConfirmSpec } from './parts';
import type { SectionProps } from './sections1';

/** A dropdown as wide as its words (inputClass is full width) */
const selectClass = inputClass.replace('w-full', 'w-auto');

/* ================================== Appointments ================================== */
type ApTab = 'sessions' | 'requests' | 'conflicts';
export const AppointmentsSection: React.FC<SectionProps> = () => {
  const [tab, setTab] = useState<ApTab>('sessions');
  const [status, setStatus] = useState('');
  const [days, setDays] = useState(30);
  const { data, error, loading, reload } = useLoad(() => adminApi.appointments(status, days), [status, days]);
  const requests = data?.requests || [];
  return (
    <div className="flex flex-col gap-4">
      <Notice tone="info">Times, status and who is involved. Session topics and notes are the counsellor’s confidential records and are not shown.</Notice>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented<ApTab>
          label="What to show"
          value={tab}
          onChange={setTab}
          options={[
            { value: 'sessions', label: `Sessions${data ? ` (${data.sessions.length})` : ''}` },
            { value: 'requests', label: `Requests${data ? ` (${requests.filter(r => r.status === 'new').length} waiting)` : ''}` },
            { value: 'conflicts', label: `Clashes${data ? ` (${data.conflicts.length})` : ''}` },
          ]}
        />
        <div className="flex gap-2">
          {tab === 'sessions' && (
            <select aria-label="Status" value={status} onChange={e => setStatus(e.target.value)} className={selectClass}>
              <option value="">Any status</option>
              {['scheduled', 'in_progress', 'completed', 'cancelled', 'no_show'].map(s => (
                <option key={s} value={s}>
                  {human(s)}
                </option>
              ))}
            </select>
          )}
          <select aria-label="Period" value={days} onChange={e => setDays(Number(e.target.value))} className={selectClass}>
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
            <option value={365}>Last year</option>
          </select>
        </div>
      </div>
      <LoadState loading={loading} error={error} onRetry={reload}>
        {data && (
          <>
            {data.overdue > 0 && <Notice tone="warn">{data.overdue} past sessions are still marked as booked: their counsellors have not started or closed them.</Notice>}
            {tab === 'sessions' &&
              (data.sessions.length ? (
                <DataList<Appointments['sessions'][number]>
                  caption="Sessions"
                  rows={data.sessions}
                  rowKey={r => r.id}
                  columns={[
                    { key: 'when', label: 'When', primary: true, render: r => fmtDateTime(r.starts_at) },
                    { key: 'status', label: 'Status', render: r => <Status value={r.status} /> },
                    { key: 'therapist', label: 'Therapist', render: r => r.therapist },
                    { key: 'client', label: 'Client', render: r => r.client },
                    { key: 'kind', label: 'Kind', render: r => `${human(r.type)} · ${human(r.format)} · ${r.duration_min} min${r.service ? ` · ${r.service}` : ''}` },
                  ]}
                />
              ) : (
                <Card className="text-ink-2">No sessions in this period.</Card>
              ))}
            {tab === 'requests' &&
              (requests.length ? (
                <DataList<Appointments['requests'][number]>
                  caption="Session requests"
                  rows={requests}
                  rowKey={r => r.id}
                  columns={[
                    { key: 'sent', label: 'Sent', primary: true, render: r => <>{fmtDateTime(r.created_at)} {r.waiting_long && <Status value="pending" label="Over 48 h" />}</> },
                    { key: 'status', label: 'Status', render: r => <Status value={r.status} /> },
                    { key: 'therapist', label: 'Therapist', render: r => r.therapist },
                    { key: 'client', label: 'Client', render: r => r.client },
                    { key: 'wanted', label: 'Asked for', render: r => `${fmtDateTime(r.preferred_time)} · ${human(r.format)}${r.service ? ` · ${r.service}` : ''}` },
                    { key: 'why', label: 'Decline reason', render: r => r.decline_reason || '—' },
                  ]}
                />
              ) : (
                <Card className="text-ink-2">No requests in this period.</Card>
              ))}
            {tab === 'conflicts' &&
              (data.conflicts.length ? (
                <DataList<Appointments['conflicts'][number]>
                  caption="Double bookings"
                  rows={data.conflicts}
                  rowKey={r => r.a + r.b}
                  columns={[
                    { key: 'therapist', label: 'Therapist', primary: true, render: r => r.therapist },
                    { key: 'a', label: 'First', render: r => fmtDateTime(r.a_start) },
                    { key: 'b', label: 'Second', render: r => fmtDateTime(r.b_start) },
                  ]}
                />
              ) : (
                <Card className="flex items-center gap-3 text-ink-2">
                  <CheckCircle2 className="h-6 w-6 text-pri-text" aria-hidden="true" /> No therapist has two sessions booked at the same time. The database refuses new clashes.
                </Card>
              ))}
          </>
        )}
      </LoadState>
    </div>
  );
};

/* ================================== Moderation ================================== */
type RState = 'open' | 'resolved' | 'all';
const TYPE_LABEL: Record<string, string> = { post: 'Post', reply: 'Reply', circle_message: 'Circle message' };
export const ModerationSection: React.FC<SectionProps> = ({ flash, go }) => {
  const [state, setState] = useState<RState>('open');
  const { data, error, loading, reload } = useLoad(() => adminApi.reports(state), [state]);
  const [confirm, setConfirm] = useState<ConfirmSpec | null>(null);
  const act = (r: ReportItem, action: 'keep' | 'hide' | 'delete') =>
    setConfirm({
      title: action === 'keep' ? 'Keep it and close the reports?' : action === 'hide' ? 'Hide it?' : 'Remove it?',
      body:
        action === 'keep'
          ? 'The reports are not upheld. It stays (or becomes) visible to everyone.'
          : action === 'hide'
            ? 'Only its author will still see it. You can show it again later.'
            : 'It is deleted for everyone. A short excerpt stays in the admin log.',
      confirm: action === 'keep' ? 'Keep it' : action === 'hide' ? 'Hide it' : 'Remove it',
      danger: action === 'delete',
      reason: action === 'keep' ? 'optional' : 'required',
      run: reason => adminApi.moderate(r.target_type, r.target_id, action, reason),
    });
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented<RState>
          label="Which reports"
          value={state}
          onChange={setState}
          options={[
            { value: 'open', label: 'Open' },
            { value: 'resolved', label: 'Resolved' },
            { value: 'all', label: 'All' },
          ]}
        />
        <button type="button" onClick={() => go('log', 'moderate')} className="min-h-10 text-sm font-bold text-pri-text hover:underline cursor-pointer">
          Moderation history
        </button>
      </div>
      <LoadState loading={loading} error={error} onRetry={reload} empty={!!data && data.length === 0} emptyText={state === 'open' ? 'No reports are waiting. Well done.' : 'Nothing here.'}>
        <ul className="m-0 flex list-none flex-col gap-4 p-0">
          {(data || []).map(r => (
            <li key={r.target_type + r.target_id}>
              <Card as="article" className="flex flex-col gap-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <p className="m-0 text-sm text-ink-3">
                    {TYPE_LABEL[r.target_type]} by <strong className="text-ink">{r.author || 'unknown'}</strong> · posted {fmtDateTime(r.posted_at)}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    <Status value={r.open ? 'open' : 'resolved'} />
                    {r.removed ? <Status value="removed" /> : r.hidden && <Status value="hidden" />}
                    {r.author_suspended && <Status value="suspended" label="Author suspended" />}
                  </div>
                </div>
                {r.removed ? (
                  <p className="m-0 italic text-ink-3">This item has been deleted.</p>
                ) : (
                  <blockquote className="m-0 rounded-xl border-l-4 border-warn bg-muted px-4 py-3 text-[0.9375rem] text-ink">
                    {r.title && <strong className="block">{r.title}</strong>}
                    {r.body}
                  </blockquote>
                )}
                <p className="m-0 text-sm text-ink-2">
                  <strong>{r.reports}</strong> {r.reports === 1 ? 'report' : 'reports'} ({r.reasons.map(human).join(', ')}) · last {ago(r.last_at)}
                </p>
                {r.notes.length > 0 && (
                  <ul className="m-0 flex list-disc flex-col gap-1 pl-5 text-sm text-ink-2">
                    {r.notes.map((n, i) => (
                      <li key={i}>“{n}”</li>
                    ))}
                  </ul>
                )}
                {r.open && (
                  <div className="flex flex-wrap gap-2 border-t border-line pt-3">
                    <Button size="sm" variant="secondary" onClick={() => act(r, 'keep')}>
                      Keep it
                    </Button>
                    {!r.removed && (
                      <Button size="sm" variant="secondary" onClick={() => act(r, 'hide')}>
                        Hide
                      </Button>
                    )}
                    {!r.removed && (
                      <Button size="sm" variant="danger" onClick={() => act(r, 'delete')}>
                        Remove
                      </Button>
                    )}
                    {r.author_id && !r.author_suspended && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          setConfirm({
                            title: `Suspend ${r.author}?`,
                            body: 'They will not be able to post, react, request or book. They keep SOS and their own data.',
                            confirm: 'Suspend author',
                            danger: true,
                            reason: 'required',
                            reasonLabel: 'Reason (shown to them)',
                            run: reason => adminApi.setSuspension(r.author_id!, true, reason),
                          })
                        }
                      >
                        Suspend author
                      </Button>
                    )}
                  </div>
                )}
              </Card>
            </li>
          ))}
        </ul>
      </LoadState>
      <ConfirmDialog spec={confirm} onClose={() => setConfirm(null)} onDone={msg => (flash(msg), reload())} />
    </div>
  );
};

/* ================================== SOS ================================== */
export const SosSection: React.FC<SectionProps> = ({ flash }) => {
  const [days, setDays] = useState(30);
  const { data, error, loading, reload } = useLoad(() => adminApi.sos(days), [days]);
  const [asking, setAsking] = useState<SosRow | null>(null);
  const [detail, setDetail] = useState<SosDetail | null>(null);
  const active = (data || []).filter(s => s.active);
  return (
    <div className="flex flex-col gap-4">
      <Card tone="soft" className="flex flex-col gap-2 text-[0.9375rem]">
        <p className="m-0 flex items-start gap-2 font-bold text-ink">
          <Info className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" /> What these records mean
        </p>
        <ul className="m-0 flex list-disc flex-col gap-1 pl-6 text-ink-2">
          <li><strong>Initiated</strong>: the person pressed SOS. <strong>Contact notified</strong>: they say they sent a message from their own phone (4Life cannot confirm delivery). <strong>Acknowledged</strong>: a linked counsellor pressed “I’ve seen this”.</li>
          <li>4Life does <strong>not</strong> contact emergency services or dispatch anyone. “Emergency call opened” only means the phone’s dialler was opened.</li>
          <li><strong>Open now</strong> means raised in the last 24 hours and not closed. Older alerts are history: they expire automatically.</li>
          <li>Locations and contact numbers are never shown here. Who raised an alert is shown only after you give a reason, which is logged.</li>
        </ul>
      </Card>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="m-0 text-[0.9375rem]">
          {active.length ? <strong className="text-danger-text">{active.length} open now</strong> : <span className="text-ink-2">None open now</span>}
        </p>
        <select aria-label="Period" value={days} onChange={e => setDays(Number(e.target.value))} className={selectClass}>
          <option value={7}>Last 7 days</option>
          <option value={30}>Last 30 days</option>
          <option value={90}>Last 90 days</option>
        </select>
      </div>
      <LoadState loading={loading} error={error} onRetry={reload} empty={!!data && data.length === 0} emptyText="No SOS alerts in this period.">
        {data && (
          <DataList<SosRow>
            caption="SOS alerts"
            rows={data}
            rowKey={r => r.id}
            onRowClick={r => setAsking(r)}
            columns={[
              { key: 'ref', label: 'Reference', primary: true, render: r => <span className="font-mono">{r.ref}</span> },
              { key: 'when', label: 'Raised', render: r => `${fmtDateTime(r.created_at)} (${ago(r.created_at)})` },
              { key: 'status', label: 'Status', render: r => <span className="inline-flex flex-wrap gap-1">{r.active && <Status value="initiated" label="Open now" />}<Status value={r.status} /></span> },
              { key: 'counsellor', label: 'Counsellor', render: r => (r.acknowledged_at ? `Seen ${ago(r.acknowledged_at)}` : r.counsellor_notified ? 'Told in app, not yet seen' : 'No linked counsellor') },
              { key: 'contacts', label: 'Support people', render: r => (r.contact_handoffs ? `${r.contact_handoffs} message${r.contact_handoffs === 1 ? '' : 's'} opened${r.reported_sent ? `, ${r.reported_sent} reported sent` : ''}` : 'None') },
              { key: 'call', label: '112 / 193', render: r => (r.emergency_call_opened ? 'Dialler opened' : '—') },
              { key: 'loc', label: 'Location', render: r => (r.location_shared ? 'Shared with counsellor' : human(r.location_status)) },
            ]}
          />
        )}
      </LoadState>
      <ConfirmDialog
        spec={
          asking && {
            title: `Show who raised ${asking.ref}?`,
            body: 'You will see the person’s community name, the counsellors told and the timeline. Never their location or contact numbers. Only do this when it is needed to run 4Life safely.',
            confirm: 'Show details',
            reason: 'required',
            reasonLabel: 'Why you need this',
            run: async reason => setDetail(await adminApi.sosDetail(asking.id, reason)),
          }
        }
        onClose={() => setAsking(null)}
        onDone={() => flash('Details shown. This was recorded in the admin log.')}
      />
      {detail && (
        <Modal isOpen onClose={() => setDetail(null)} title={`SOS ${detail.id.slice(0, 8).toUpperCase()}`} subtitle={`${fmtDateTime(detail.created_at)} · ${human(detail.status)}`} size="md">
          <div className="flex flex-col gap-4 text-[0.9375rem]">
            <p className="m-0">
              Raised by <strong>{detail.client}</strong>. Location: {detail.location_shared ? 'shared with their counsellor' : human(detail.location_status)}.
            </p>
            <section>
              <h3 className="m-0 mb-1 text-base font-bold">Counsellors told</h3>
              {detail.counsellors.length ? detail.counsellors.map((c, i) => <p key={i} className="m-0">{c.therapist}: {c.acknowledged_at ? `saw it ${fmtDateTime(c.acknowledged_at)}` : 'not acknowledged'}</p>) : <p className="m-0 text-ink-3">No linked counsellor.</p>}
            </section>
            <section>
              <h3 className="m-0 mb-1 text-base font-bold">Timeline</h3>
              <ol className="m-0 flex flex-col gap-1 pl-5">
                {[...detail.timeline.map(e => ({ at: e.at, text: `${human(e.kind)}${e.to ? ` → ${human(e.to)}` : ''}` })), ...detail.handoffs.map(h => ({ at: h.at, text: `${human(h.channel)}: ${human(h.status)}` }))]
                  .sort((a, b) => a.at.localeCompare(b.at))
                  .map((e, i) => (
                    <li key={i}>
                      {fmtDateTime(e.at)}: {e.text}
                    </li>
                  ))}
              </ol>
            </section>
          </div>
        </Modal>
      )}
    </div>
  );
};

/* ================================== Content ================================== */
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const ContentSection: React.FC<SectionProps> = ({ flash }) => {
  const { data, error, loading, reload } = useLoad(adminApi.content, []);
  const [confirm, setConfirm] = useState<ConfirmSpec | null>(null);
  return (
    <div className="flex flex-col gap-6">
      <Notice tone="info">These are the things in 4Life that admins manage. Learning videos come from YouTube searches and are not edited here.</Notice>
      <LoadState loading={loading} error={error} onRetry={reload}>
        {data && (
          <>
            <section aria-labelledby="c-circles" className="flex flex-col gap-3">
              <h2 id="c-circles" className="m-0 text-lg font-bold">Group circles (Global Village)</h2>
              <ul className="m-0 grid list-none gap-3 p-0 md:grid-cols-2">
                {data.circles.map(c => (
                  <li key={c.id}>
                    <Card className={cx('flex h-full flex-col gap-2', !c.active && 'opacity-75')}>
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="m-0 text-base font-bold">{c.title}</h3>
                        <Status value={c.active ? 'active' : 'cancelled'} label={c.active ? 'On' : 'Off'} />
                      </div>
                      <p className="m-0 text-sm text-ink-2">
                        {DAYS[c.weekday]} {c.start_time.slice(0, 5)} (Ghana) · {c.duration_min} min · host {c.host_name} · {c.rsvps} signed up
                      </p>
                      <p className="m-0 text-sm text-ink-3">{c.description}</p>
                      <div className="mt-auto pt-1">
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() =>
                            setConfirm({
                              title: c.active ? `Switch off “${c.title}”?` : `Switch on “${c.title}”?`,
                              body: c.active ? 'It disappears from the Village until you switch it on again.' : 'It shows in the Village again.',
                              confirm: c.active ? 'Switch off' : 'Switch on',
                              reason: 'optional',
                              run: r => adminApi.setCircle(c.id, !c.active, r),
                            })
                          }
                        >
                          {c.active ? 'Switch off' : 'Switch on'}
                        </Button>
                      </div>
                    </Card>
                  </li>
                ))}
              </ul>
            </section>
            <section aria-labelledby="c-hot" className="flex flex-col gap-3">
              <h2 id="c-hot" className="m-0 text-lg font-bold">Helplines</h2>
              <p className="m-0 text-sm text-ink-3">The app shows only helplines marked as checked. Call each number yourself before checking it.</p>
              <DataList<Content['hotlines'][number]>
                caption="Helplines"
                rows={data.hotlines}
                rowKey={h => h.id}
                columns={[
                  { key: 'name', label: 'Helpline', primary: true, render: h => `${h.label} · ${h.number}` },
                  { key: 'status', label: 'Status', render: h => (h.verified_at ? <Status value="verified" label={`Checked ${fmtDate(h.verified_at)}`} /> : <Status value="pending" label="Not checked (hidden)" />) },
                  { key: 'source', label: 'How checked', render: h => h.source || '—' },
                  {
                    key: 'act',
                    label: 'Action',
                    render: h => (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() =>
                          setConfirm(
                            h.verified_at
                              ? { title: `Hide ${h.label}?`, body: 'It will no longer be shown in the app.', confirm: 'Mark not checked', danger: true, reason: 'optional', run: r => adminApi.verifyContact('hotline', h.id, false, r) }
                              : { title: `Show ${h.label} in the app?`, body: `Only if you called ${h.number} and it is answered by this service.`, confirm: 'Mark checked', reason: 'required', reasonLabel: 'How you checked it (who called, when)', run: r => adminApi.verifyContact('hotline', h.id, true, r) }
                          )
                        }
                      >
                        {h.verified_at ? 'Mark not checked' : 'Mark checked'}
                      </Button>
                    ),
                  },
                ]}
              />
            </section>
            <section aria-labelledby="c-centres" className="flex flex-col gap-3">
              <h2 id="c-centres" className="m-0 text-lg font-bold">Emergency centres</h2>
              <DataList<Content['centres'][number]>
                caption="Emergency centres"
                rows={data.centres}
                rowKey={c => c.id}
                columns={[
                  { key: 'name', label: 'Centre', primary: true, render: c => c.name },
                  { key: 'where', label: 'Region', render: c => `${c.region} · ${human(c.type)}` },
                  { key: 'phone', label: 'Phone', render: c => c.phone },
                  { key: 'status', label: 'Status', render: c => (c.verified_at ? <Status value="verified" label={`Checked ${fmtDate(c.verified_at)}`} /> : <Status value="pending" label="Not checked" />) },
                  {
                    key: 'act',
                    label: 'Action',
                    render: c => (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() =>
                          setConfirm(
                            c.verified_at
                              ? { title: `Mark ${c.name} as not checked?`, body: 'It stays on the map, without the “checked” mark.', confirm: 'Mark not checked', reason: 'optional', run: r => adminApi.verifyContact('centre', c.id, false, r) }
                              : { title: `Mark ${c.name} as checked?`, body: `Only if you confirmed its address, opening hours and ${c.phone}.`, confirm: 'Mark checked', reason: 'required', reasonLabel: 'How you checked it', run: r => adminApi.verifyContact('centre', c.id, true, r) }
                          )
                        }
                      >
                        {c.verified_at ? 'Mark not checked' : 'Mark checked'}
                      </Button>
                    ),
                  },
                ]}
              />
            </section>
          </>
        )}
      </LoadState>
      <ConfirmDialog spec={confirm} onClose={() => setConfirm(null)} onDone={msg => (flash(msg), reload())} />
    </div>
  );
};

/* ================================== System ================================== */
type Health = { ok?: boolean; groq?: boolean; gemini?: boolean; youtube?: boolean; supabaseProject?: string | null; models?: Record<string, string> };
/** This site's /api/health (or the Supabase function's, when /api is not there): never shows keys */
const useHealth = () => {
  const [h, setH] = useState<Health | 'down' | null>(null);
  useEffect(() => {
    apiFetch('/api/health')
      .then(async r => setH(r.ok && (r.headers.get('content-type') || '').includes('json') ? await r.json() : 'down'))
      .catch(() => setH('down'));
  }, []);
  return h;
};
const Yes: React.FC<{ on?: boolean; yes: string; no: string }> = ({ on, yes, no }) => (
  <span className={cx('inline-flex items-center gap-1.5', on ? 'text-pri-text' : 'text-danger-text')}>
    {on ? <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> : <XCircle className="h-4 w-4" aria-hidden="true" />} {on ? yes : no}
  </span>
);
export const SystemSection: React.FC<SectionProps> = ({ go }) => {
  const { data, error, loading, reload } = useLoad(adminApi.system, []);
  const site = useHealth();
  const admins = useLoad(() => adminApi.users({ role: 'admin', limit: 50 }), []);
  const h = site && site !== 'down' ? site : null;
  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-4 md:grid-cols-2">
        <Card className="flex flex-col gap-2 text-[0.9375rem]">
          <h2 className="m-0 text-lg font-bold">This site’s server</h2>
          {site === null ? (
            <p className="m-0 text-ink-3">Checking…</p>
          ) : site === 'down' ? (
            <Yes on={false} yes="" no="The server’s health check did not answer" />
          ) : (
            <>
              <Yes on={h?.ok} yes="Answering" no="Not answering" />
              <Yes on={h?.groq} yes={`Groq (main AI): ${h?.models?.groq || 'on'}`} no="Groq (main AI): no key" />
              <Yes on={h?.gemini} yes={`Gemini (backup AI): ${h?.models?.gemini || 'on'}`} no="Gemini (backup AI): no key" />
              <Yes on={h?.youtube} yes="YouTube videos: on" no="YouTube videos: no key" />
              <p className="m-0 text-ink-3">Supabase project: {h?.supabaseProject || '—'}</p>
            </>
          )}
        </Card>
        <LoadState loading={loading} error={error} onRetry={reload}>
          {data && (
            <Card className="flex flex-col gap-2 text-[0.9375rem]">
              <h2 className="m-0 text-lg font-bold">Database</h2>
              {data.migrations.map(m => (
                <Yes key={m.name} on={m.present} yes={`${m.name}: applied`} no={`${m.name}: not applied`} />
              ))}
              <p className="m-0 mt-2 font-bold">Scheduled clean-ups</p>
              {data.cleanups.map(c => (
                <Yes key={c.function} on={c.scheduled} yes={`${c.name}: scheduled`} no={`${c.name}: not scheduled`} />
              ))}
              {!data.cleanups.every(c => c.scheduled) && (
                <p className="m-0 text-sm text-ink-3">
                  {data.cron_available ? 'pg_cron is on, but these jobs are missing.' : 'pg_cron is not switched on.'} See SUPABASE.md, step 8, for the commands to run in the SQL editor. The Privacy Policy depends on them.
                </p>
              )}
              <p className="m-0 mt-2 text-ink-2">
                {data.unverified_hotlines} helplines and {data.unverified_centres} centres not checked yet.{' '}
                <button type="button" onClick={() => go('content')} className="font-bold text-pri-text underline cursor-pointer">
                  Check them
                </button>
              </p>
              <p className="m-0 text-sm text-ink-3">Database time: {fmtDateTime(data.database_time)}</p>
            </Card>
          )}
        </LoadState>
      </div>
      <Card className="flex flex-col gap-3">
        <h2 className="m-0 flex items-center gap-2 text-lg font-bold">
          <ShieldCheck className="h-5 w-5 text-pri-text" aria-hidden="true" /> Admin accounts
        </h2>
        <p className="m-0 text-[0.9375rem] text-ink-2">
          The first admin is made by the project owner in the Supabase SQL editor (SUPABASE.md, step 7). After that, admins can give or take admin rights in People; every change is logged.
          Nobody can give themselves admin rights.
        </p>
        <LoadState loading={admins.loading} error={admins.error} onRetry={admins.reload}>
          <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
            {(admins.data?.rows || []).map(a => (
              <li key={a.id} className="text-[0.9375rem]">
                <strong>{a.nickname}</strong> <span className="text-ink-3">· {a.email} · last sign-in {ago(a.last_sign_in_at)}</span>
              </li>
            ))}
          </ul>
        </LoadState>
      </Card>
    </div>
  );
};

/* ================================== Admin log ================================== */
const ACTION_GROUPS: Array<[string, string]> = [
  ['', 'Everything'],
  ['suspend', 'Suspensions'],
  ['restore', 'Restorations'],
  ['approve', 'Therapist approvals'],
  ['reject', 'Therapist rejections'],
  ['moderate', 'Moderation'],
  ['direct', 'Direct changes'],
  ['grant', 'Admin rights given'],
  ['revoke', 'Admin rights removed'],
  ['role_change', 'Role changes'],
  ['view', 'Views of people and SOS'],
  ['verify', 'Helplines and centres'],
  ['circle', 'Circles'],
];
export const LogSection: React.FC<SectionProps & { initialFilter?: string }> = ({ initialFilter = '' }) => {
  const [action, setAction] = useState(initialFilter);
  const [page, setPage] = useState(0);
  useEffect(() => setPage(0), [action]);
  const { data, error, loading, reload } = useLoad(() => adminApi.actions({ action, limit: 100, offset: page * 100 }), [action, page]);
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="m-0 flex items-center gap-2 text-[0.9375rem] text-ink-2">
          <CircleSlash className="h-4 w-4" aria-hidden="true" /> This log cannot be edited or deleted, not even by the database owner.
        </p>
        <select aria-label="Show" value={action} onChange={e => setAction(e.target.value)} className={selectClass}>
          {ACTION_GROUPS.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
      </div>
      <LoadState loading={loading} error={error} onRetry={reload} empty={!!data && data.rows.length === 0} emptyText="No admin actions recorded yet.">
        {data && (
          <>
            <DataList<ActionRow>
              caption="Admin log"
              rows={data.rows}
              rowKey={r => String(r.id)}
              columns={[
                { key: 'what', label: 'Action', primary: true, render: r => human(r.action) },
                { key: 'when', label: 'When', render: r => fmtDateTime(r.at) },
                { key: 'who', label: 'By', render: r => r.admin || ((r.details as any)?.via === 'sql_editor' ? 'Project owner (SQL editor)' : '—') },
                { key: 'target', label: 'About', render: r => (r.target_name ? `${r.target_name}` : r.target_type ? `${human(r.target_type)} ${String(r.target_id || '').slice(0, 8)}` : '—') },
                { key: 'why', label: 'Reason', render: r => r.reason || ((r.details as any)?.excerpt ? `“${(r.details as any).excerpt}”` : '—') },
              ]}
            />
            {data.total > 100 && (
              <div className="flex items-center justify-between gap-3">
                <Button variant="secondary" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}>
                  Newer
                </Button>
                <span className="text-sm text-ink-3">{data.total} entries</span>
                <Button variant="secondary" size="sm" disabled={(page + 1) * 100 >= data.total} onClick={() => setPage(p => p + 1)}>
                  Older
                </Button>
              </div>
            )}
          </>
        )}
      </LoadState>
    </div>
  );
};

