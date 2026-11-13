/** Admin dashboard: Overview, People, Therapists */
import React, { useEffect, useState } from 'react';
import { AlertTriangle, BadgeCheck, CalendarClock, Flag, MessagesSquare, Search, ShieldAlert, Siren, UserPlus, Users } from 'lucide-react';
import { Button, Card, Modal, Notice, Segmented, cx, inputClass } from '../components/ui';
import { adminApi, type TherapistRow, type UserRow } from '../lib/db/adminApi';
import { BarChart, ConfirmDialog, DataList, LoadState, Stat, Status, ago, fmtDate, fmtDateTime, human, useLoad, type ConfirmSpec } from './parts';

export type Go = (section: string, filter?: string) => void;
export interface SectionProps {
  go: Go;
  flash: (msg: string) => void;
}

/* ================================== Overview ================================== */
type Series = 'signups' | 'sessions' | 'posts' | 'sos';
export const OverviewSection: React.FC<SectionProps> = ({ go }) => {
  const { data: o, error, loading, reload } = useLoad(adminApi.overview, []);
  const [series, setSeries] = useState<Series>('signups');
  const alerts: Array<{ tone: 'danger' | 'warn' | 'info'; text: string; to: string }> = [];
  if (o) {
    if (o.sos.active) alerts.push({ tone: 'danger', text: `${o.sos.active} SOS ${o.sos.active === 1 ? 'alert is' : 'alerts are'} open now (raised in the last 24 hours). Linked counsellors see it in their workspace; 4Life does not contact emergency services.`, to: 'sos' });
    if (o.therapists.pending) alerts.push({ tone: 'warn', text: `${o.therapists.pending} therapist ${o.therapists.pending === 1 ? 'application is' : 'applications are'} waiting for a licence check.`, to: 'therapists' });
    if (o.village.open_reports) alerts.push({ tone: 'warn', text: `${o.village.open_reports} reported Village ${o.village.open_reports === 1 ? 'item needs' : 'items need'} a decision.`, to: 'moderation' });
    if (o.requests.pending_over_48h) alerts.push({ tone: 'warn', text: `${o.requests.pending_over_48h} session ${o.requests.pending_over_48h === 1 ? 'request has' : 'requests have'} waited more than 48 hours for an answer.`, to: 'appointments' });
    if (o.sessions.overdue) alerts.push({ tone: 'info', text: `${o.sessions.overdue} past ${o.sessions.overdue === 1 ? 'session is' : 'sessions are'} still marked as booked.`, to: 'appointments' });
    if (o.users.deletion_requested) alerts.push({ tone: 'info', text: `${o.users.deletion_requested} ${o.users.deletion_requested === 1 ? 'person has' : 'people have'} asked for their account to be deleted.`, to: 'people' });
  }
  return (
    <LoadState loading={loading} error={error} onRetry={reload}>
      {o && (
        <div className="flex flex-col gap-6">
          {alerts.length > 0 && (
            <section aria-label="Needs attention" className="flex flex-col gap-2">
              {alerts.map(a => (
                <button
                  key={a.text}
                  type="button"
                  onClick={() => go(a.to)}
                  className={cx(
                    'flex min-h-12 items-start gap-3 rounded-2xl border px-4 py-3 text-left text-[0.9375rem] cursor-pointer',
                    a.tone === 'danger' ? 'border-danger/40 bg-danger-soft text-ink' : a.tone === 'warn' ? 'border-warn/40 bg-warn-soft text-ink' : 'border-line bg-surface text-ink-2'
                  )}
                >
                  <AlertTriangle className={cx('mt-0.5 h-5 w-5 shrink-0', a.tone === 'danger' ? 'text-danger-text' : a.tone === 'warn' ? 'text-warn' : 'text-ink-3')} aria-hidden="true" />
                  <span>{a.text}</span>
                </button>
              ))}
            </section>
          )}

          <section aria-label="Key numbers" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="People" value={o.users.total} hint={`${o.users.new_7d} new this week`} icon={<Users className="h-4 w-4" />} onClick={() => go('people')} />
            <Stat label="Signed in, 30 days" value={o.users.active_30d} hint={`${o.users.suspended} suspended`} icon={<UserPlus className="h-4 w-4" />} tone="pri" />
            <Stat label="Verified therapists" value={o.therapists.verified} hint={`${o.therapists.pending} waiting · ${o.therapists.accepting} taking clients`} icon={<BadgeCheck className="h-4 w-4" />} tone="pri" onClick={() => go('therapists')} />
            <Stat label="Upcoming sessions" value={o.sessions.upcoming} hint={`${o.requests.pending} requests waiting · ${o.sessions.completed} completed`} icon={<CalendarClock className="h-4 w-4" />} tone="info" onClick={() => go('appointments')} />
            <Stat label="Village posts, 7 days" value={o.village.posts_7d} hint={`${o.village.replies_7d} replies · ${o.village.hidden} hidden`} icon={<MessagesSquare className="h-4 w-4" />} onClick={() => go('moderation')} />
            <Stat label="Open reports" value={o.village.open_reports} tone={o.village.open_reports ? 'warn' : 'muted'} icon={<Flag className="h-4 w-4" />} onClick={() => go('moderation')} />
            <Stat label="SOS open now" value={o.sos.active} hint="Raised in the last 24 hours, not yet closed" tone={o.sos.active ? 'danger' : 'muted'} icon={<Siren className="h-4 w-4" />} onClick={() => go('sos')} />
            <Stat label="SOS, 30 days" value={o.sos.last_30d} hint={`${o.sos.acknowledged_30d} seen by a counsellor · ${o.sos.resolved_30d} resolved`} icon={<ShieldAlert className="h-4 w-4" />} onClick={() => go('sos')} />
          </section>

          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
            <Card className="flex min-w-0 flex-col gap-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="m-0 text-lg font-bold">Last 30 days</h2>
                <Segmented<Series>
                  label="Which numbers"
                  value={series}
                  onChange={setSeries}
                  options={[
                    { value: 'signups', label: 'Sign-ups' },
                    { value: 'sessions', label: 'Sessions' },
                    { value: 'posts', label: 'Posts' },
                    { value: 'sos', label: 'SOS' },
                  ]}
                />
              </div>
              <BarChart days={o.series.days} values={o.series[series]} label={`${human(series)} per day`} tone={series === 'sos' ? 'danger' : series === 'sessions' ? 'info' : 'pri'} />
            </Card>
            <Card className="flex flex-col gap-3">
              <div className="flex items-center justify-between gap-2">
                <h2 className="m-0 text-lg font-bold">Recent admin actions</h2>
                <button type="button" onClick={() => go('log')} className="min-h-10 text-sm font-bold text-pri-text hover:underline cursor-pointer">
                  Full log
                </button>
              </div>
              {o.recent_actions.length ? (
                <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
                  {o.recent_actions.map((a, i) => (
                    <li key={i} className="flex flex-col border-b border-line pb-2.5 text-[0.9375rem] last:border-0">
                      <span className="font-semibold text-ink">{human(a.action)}</span>
                      <span className="text-sm text-ink-3">
                        {a.admin || 'Project owner'} · {ago(a.at)}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="m-0 text-ink-3">No admin actions yet.</p>
              )}
            </Card>
          </div>
          <p className="m-0 text-sm text-ink-3">Figures come straight from the database (as of {fmtDateTime(o.generated_at)}).</p>
        </div>
      )}
    </LoadState>
  );
};

/* ================================== People ================================== */
const useDebounced = (v: string, ms = 300) => {
  const [d, setD] = useState(v);
  useEffect(() => {
    const t = setTimeout(() => setD(v), ms);
    return () => clearTimeout(t);
  }, [v, ms]);
  return d;
};
const PAGE = 50;

export const PeopleSection: React.FC<SectionProps> = ({ flash }) => {
  const [query, setQuery] = useState('');
  const [role, setRole] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(0);
  const q = useDebounced(query);
  useEffect(() => setPage(0), [q, role, status]);
  const { data, error, loading, reload } = useLoad(() => adminApi.users({ query: q, role, status, limit: PAGE, offset: page * PAGE }), [q, role, status, page]);
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
        <label className="relative block">
          <span className="sr-only">Search people</span>
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3" aria-hidden="true" />
          <input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search by name, community name or email" className={cx(inputClass, 'pl-10')} />
        </label>
        <select aria-label="Role" value={role} onChange={e => setRole(e.target.value)} className={inputClass}>
          <option value="">Every role</option>
          <option value="client">Clients</option>
          <option value="therapist">Therapists</option>
          <option value="admin">Admins</option>
        </select>
        <select aria-label="Status" value={status} onChange={e => setStatus(e.target.value)} className={inputClass}>
          <option value="">Any status</option>
          <option value="active">Active</option>
          <option value="suspended">Suspended</option>
          <option value="deletion_requested">Asked to be deleted</option>
        </select>
      </div>
      <LoadState loading={loading} error={error} onRetry={reload} empty={!!data && data.rows.length === 0} emptyText="No one matches.">
        {data && (
          <>
            <p className="m-0 text-sm text-ink-3" role="status">
              {data.total} {data.total === 1 ? 'person' : 'people'}
            </p>
            <DataList<UserRow>
              caption="People"
              rows={data.rows}
              rowKey={r => r.id}
              onRowClick={r => setOpenId(r.id)}
              columns={[
                { key: 'name', label: 'Name', primary: true, render: r => <>{r.nickname}{r.display_name && r.display_name !== r.nickname ? <span className="font-normal text-ink-3"> · {r.display_name}</span> : null}</> },
                { key: 'email', label: 'Email', render: r => <span className="break-all">{r.email || '—'}</span> },
                { key: 'role', label: 'Role', render: r => <Status value={r.role} /> },
                { key: 'status', label: 'Status', render: r => (r.suspended_at ? <Status value="suspended" /> : r.deletion_requested_at ? <Status value="pending" label="Asked to delete" /> : <Status value="active" />) },
                { key: 'joined', label: 'Joined', render: r => fmtDate(r.created_at) },
                { key: 'seen', label: 'Last sign-in', render: r => ago(r.last_sign_in_at) },
              ]}
            />
            {data.total > PAGE && (
              <div className="flex items-center justify-between gap-3">
                <Button variant="secondary" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}>
                  Previous
                </Button>
                <span className="text-sm text-ink-3">
                  {page * PAGE + 1}–{Math.min(data.total, (page + 1) * PAGE)} of {data.total}
                </span>
                <Button variant="secondary" size="sm" disabled={(page + 1) * PAGE >= data.total} onClick={() => setPage(p => p + 1)}>
                  Next
                </Button>
              </div>
            )}
          </>
        )}
      </LoadState>
      {openId && <PersonDetail id={openId} onClose={() => setOpenId(null)} onChanged={msg => (flash(msg), reload())} />}
    </div>
  );
};

const ACTIVITY_LABELS: Record<string, string> = {
  checkins: 'Check-ins', last_checkin: 'Last check-in', thought_records: 'Thought records', village_posts: 'Village posts', village_replies: 'Village replies',
  reports_made: 'Reports made', reports_about_them: 'Reports about their posts', counsellors: 'Counsellors', clients: 'Clients (as therapist)', sessions: 'Sessions', sos_30d: 'SOS alerts, 30 days',
};

const PersonDetail: React.FC<{ id: string; onClose: () => void; onChanged: (msg: string) => void }> = ({ id, onClose, onChanged }) => {
  const { data: u, error, loading, reload } = useLoad(() => adminApi.user(id), [id]);
  const [confirm, setConfirm] = useState<ConfirmSpec | null>(null);
  return (
    <Modal isOpen onClose={onClose} title={u ? u.nickname : 'Person'} subtitle={u ? `${human(u.role)} · joined ${fmtDate(u.created_at)}` : undefined} size="lg">
      <LoadState loading={loading} error={error} onRetry={reload}>
        {u && (
          <div className="flex flex-col gap-5">
            {u.suspension && (
              <Notice tone="danger">
                <strong>Suspended</strong> since {fmtDateTime(u.suspension.suspended_at)}: {u.suspension.reason}
              </Notice>
            )}
            {u.deletion_requested_at && (
              <Notice tone="warn">
                Asked for their account to be deleted on {fmtDate(u.deletion_requested_at)}. Deletion is done by the project owner, following PRIVACY-AUDIT.md (some counselling records
                cannot be deleted yet).
              </Notice>
            )}
            <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-[0.9375rem]">
              {[
                ['Email', u.email || '—'],
                ['Full name', u.display_name || '—'],
                ['Age', u.age ?? '—'],
                ['Region', u.region || '—'],
                ['Language', u.language],
                ['Last sign-in', u.last_sign_in_at ? `${fmtDateTime(u.last_sign_in_at)} (${ago(u.last_sign_in_at)})` : 'Never recorded'],
                ['Account ID', <code className="break-all text-sm">{u.id}</code>],
              ].map(([k, v]) => (
                <React.Fragment key={String(k)}>
                  <dt className="text-ink-3">{k}</dt>
                  <dd className="m-0 min-w-0 text-ink">{v}</dd>
                </React.Fragment>
              ))}
            </dl>
            <section aria-label="Activity">
              <h3 className="m-0 mb-2 text-base font-bold">Activity</h3>
              <p className="m-0 mb-3 text-sm text-ink-3">Counts only. What people write, rate or say to the AI is not shown here.</p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {Object.entries(u.activity).map(([k, v]) => (
                  <div key={k} className="rounded-xl bg-muted px-3 py-2">
                    <span className="block text-xs font-semibold text-ink-3">{ACTIVITY_LABELS[k] || human(k)}</span>
                    <span className="font-bold text-ink">{k === 'last_checkin' ? fmtDate(v as string) : v ?? '—'}</span>
                  </div>
                ))}
              </div>
            </section>
            {u.history.length > 0 && (
              <section aria-label="Admin history">
                <h3 className="m-0 mb-2 text-base font-bold">Admin history</h3>
                <ul className="m-0 flex list-none flex-col gap-2 p-0 text-[0.9375rem]">
                  {u.history.map((h, i) => (
                    <li key={i}>
                      <strong>{human(h.action)}</strong> by {h.admin || 'the project owner'}, {fmtDateTime(h.at)}
                      {h.reason && <span className="text-ink-3"> · “{h.reason}”</span>}
                    </li>
                  ))}
                </ul>
              </section>
            )}
            <div className="flex flex-wrap gap-2 border-t border-line pt-4">
              {u.suspension ? (
                <Button
                  variant="secondary"
                  onClick={() =>
                    setConfirm({ title: `Restore ${u.nickname}?`, body: 'They will be able to post, react and book sessions again.', confirm: 'Restore account', reason: 'required', run: r => adminApi.setSuspension(u.id, false, r) })
                  }
                >
                  Restore account
                </Button>
              ) : (
                u.role !== 'admin' && (
                  <Button
                    variant="danger"
                    onClick={() =>
                      setConfirm({
                        title: `Suspend ${u.nickname}?`,
                        body: (
                          <>
                            They will not be able to post, react, request or book sessions{u.role === 'therapist' ? ', and they will be hidden from the therapist directory' : ''}. They can still sign in, see and download their
                            data, and use SOS and the emergency tools. They will see the reason.
                          </>
                        ),
                        confirm: 'Suspend account',
                        danger: true,
                        reason: 'required',
                        reasonLabel: 'Reason (shown to them)',
                        run: r => adminApi.setSuspension(u.id, true, r),
                      })
                    }
                  >
                    Suspend account
                  </Button>
                )
              )}
              {u.role === 'admin' ? (
                <Button variant="secondary" onClick={() => setConfirm({ title: `Remove admin rights from ${u.nickname}?`, body: 'They become an ordinary client account.', confirm: 'Remove admin rights', danger: true, reason: 'required', run: r => adminApi.setAdmin(u.id, false, r) })}>
                  Remove admin rights
                </Button>
              ) : (
                u.role === 'client' &&
                !u.suspension && (
                  <Button
                    variant="ghost"
                    onClick={() =>
                      setConfirm({
                        title: `Make ${u.nickname} an admin?`,
                        body: 'Admins can see account details, suspend people, review therapists, moderate the Village and read SOS records. Only do this for someone who runs 4Life with you.',
                        confirm: 'Make admin',
                        danger: true,
                        reason: 'required',
                        run: r => adminApi.setAdmin(u.id, true, r),
                      })
                    }
                  >
                    Make admin
                  </Button>
                )
              )}
            </div>
          </div>
        )}
      </LoadState>
      <ConfirmDialog
        spec={confirm}
        onClose={() => setConfirm(null)}
        onDone={msg => {
          onChanged(msg);
          reload();
        }}
      />
    </Modal>
  );
};

/* ================================== Therapists ================================== */
type TStatus = 'pending' | 'verified' | 'rejected' | 'suspended' | '';
export const TherapistsSection: React.FC<SectionProps> = ({ flash }) => {
  const [status, setStatus] = useState<TStatus>('pending');
  const [query, setQuery] = useState('');
  const q = useDebounced(query);
  const { data, error, loading, reload } = useLoad(() => adminApi.therapists(status, q), [status, q]);
  const [confirm, setConfirm] = useState<ConfirmSpec | null>(null);
  return (
    <div className="flex flex-col gap-4">
      <Notice tone="info">Approve a therapist only after checking their licence with the body that issued it. 4Life cannot check licences by itself.</Notice>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented<TStatus>
          label="Which therapists"
          value={status}
          onChange={setStatus}
          options={[
            { value: 'pending', label: 'Waiting' },
            { value: 'verified', label: 'Verified' },
            { value: 'rejected', label: 'Rejected' },
            { value: 'suspended', label: 'Suspended' },
            { value: '', label: 'All' },
          ]}
        />
        <label className="relative block w-full sm:w-72">
          <span className="sr-only">Search therapists</span>
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3" aria-hidden="true" />
          <input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Name or email" className={cx(inputClass, 'pl-10')} />
        </label>
      </div>
      <LoadState loading={loading} error={error} onRetry={reload} empty={!!data && data.length === 0} emptyText={status === 'pending' ? 'No applications are waiting.' : 'No therapists here.'}>
        <ul className="m-0 grid list-none gap-4 p-0 xl:grid-cols-2">
          {(data || []).map(t => (
            <li key={t.id}>
              <TherapistCard t={t} onConfirm={setConfirm} />
            </li>
          ))}
        </ul>
      </LoadState>
      <ConfirmDialog spec={confirm} onClose={() => setConfirm(null)} onDone={msg => (flash(msg), reload())} />
    </div>
  );
};

const TherapistCard: React.FC<{ t: TherapistRow; onConfirm: (c: ConfirmSpec) => void }> = ({ t, onConfirm }) => {
  const name = [t.title, t.full_name].filter(Boolean).join(' ');
  return (
    <Card as="article" aria-label={name} className="flex h-full flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="m-0 text-lg font-bold leading-snug">{name}</h3>
          <p className="m-0 text-[0.9375rem] text-ink-2">
            {t.profession} · {t.years_experience} years · {t.region || 'no region'}
          </p>
          <p className="m-0 break-all text-sm text-ink-3">
            {t.email} · {t.nickname}
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Status value={t.verification} />
          {t.suspended && <Status value="suspended" />}
        </div>
      </div>
      <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 rounded-xl bg-muted p-3 text-[0.9375rem]">
        <dt className="text-ink-3">Licence</dt>
        <dd className="m-0 font-semibold text-ink">{t.licence ? `${t.licence.license_body}, no. ${t.licence.license_number}` : 'None given'}</dd>
        <dt className="text-ink-3">Agreed</dt>
        <dd className="m-0 text-ink-2">{t.licence ? `Confidentiality, crisis steps and accuracy on ${fmtDate(t.licence.agreed_confidentiality_at)}` : '—'}</dd>
        {t.licence?.reviewed_at && (
          <>
            <dt className="text-ink-3">Reviewed</dt>
            <dd className="m-0 text-ink-2">
              {fmtDate(t.licence.reviewed_at)} by {t.licence.reviewer || 'an admin'}
              {t.licence.review_note && <> · “{t.licence.review_note}”</>}
            </dd>
          </>
        )}
      </dl>
      {t.bio && <p className="m-0 text-[0.9375rem] text-ink-2">{t.bio}</p>}
      <p className="m-0 text-sm text-ink-3">
        Specialties: {t.specialties.join(', ') || '—'} · Languages: {t.languages.join(', ') || '—'} · Fee: GHS {t.fee_ghs} · {t.accepting_clients ? 'Taking new clients' : 'Not taking new clients'}
      </p>
      {t.services.length > 0 && (
        <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0" aria-label="Services">
          {t.services.map(s => (
            <li key={s.name} className={cx('rounded-full border border-line px-3 py-1 text-sm', !s.active && 'opacity-60')}>
              {s.name} · {s.duration_min} min · GHS {s.fee_ghs}
              {!s.active && ' (paused)'}
            </li>
          ))}
        </ul>
      )}
      <p className="m-0 text-sm text-ink-2">
        {t.active_clients} active clients · {t.upcoming_sessions} upcoming sessions · {t.completed_sessions} completed · {t.pending_requests} requests waiting
      </p>
      <div className="mt-auto flex flex-wrap gap-2 border-t border-line pt-4">
        {t.verification !== 'verified' && (
          <Button
            size="sm"
            onClick={() =>
              onConfirm({
                title: `Approve ${name}?`,
                body: `They will appear in the directory and clients can book them. Confirm you checked licence no. ${t.licence?.license_number || '(none)'} with ${t.licence?.license_body || 'the issuing body'}.`,
                confirm: 'Approve',
                reason: 'optional',
                reasonLabel: 'How you checked (recommended)',
                run: r => adminApi.reviewTherapist(t.id, true, r),
              })
            }
          >
            Approve
          </Button>
        )}
        {t.verification !== 'rejected' && (
          <Button
            size="sm"
            variant="secondary"
            onClick={() =>
              onConfirm({ title: `Reject ${name}?`, body: 'They will not be listed. They stay pending again if they change their licence details.', confirm: 'Reject', danger: true, reason: 'required', run: r => adminApi.reviewTherapist(t.id, false, r) })
            }
          >
            Reject
          </Button>
        )}
        {t.suspended ? (
          <Button size="sm" variant="ghost" onClick={() => onConfirm({ title: `Restore ${name}?`, body: 'They will appear in the directory again (if verified).', confirm: 'Restore', reason: 'required', run: r => adminApi.setSuspension(t.id, false, r) })}>
            Restore
          </Button>
        ) : (
          <Button
            size="sm"
            variant="ghost"
            onClick={() =>
              onConfirm({
                title: `Suspend ${name}?`,
                body: 'They will be hidden from the directory, offer no free times, and cannot book or accept sessions. Their current clients can still see them.',
                confirm: 'Suspend',
                danger: true,
                reason: 'required',
                run: r => adminApi.setSuspension(t.id, true, r),
              })
            }
          >
            Suspend
          </Button>
        )}
      </div>
    </Card>
  );
};
