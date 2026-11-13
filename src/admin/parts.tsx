/**
 * Building blocks for the admin dashboard, in 4Life's own design system (src/components/ui.tsx):
 * stat cards, an accessible bar chart, tables that become cards on phones, and a confirmation
 * dialog that asks for a reason (the reason goes into the admin log).
 */
import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Inbox, RefreshCw } from 'lucide-react';
import { Badge, Button, Card, Field, Modal, Notice, cx, textareaClass } from '../components/ui';
import { friendlyError } from '../lib/supabase';

/* ---------- formatting (Ghana time, day first) ---------- */
const DT = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Accra' });
const D = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Africa/Accra' });
export const fmtDateTime = (v?: string | null) => (v ? DT.format(new Date(v)) : '—');
export const fmtDate = (v?: string | null) => (v ? D.format(new Date(v)) : '—');
export const ago = (v?: string | null) => {
  if (!v) return 'never';
  const m = Math.round((Date.now() - new Date(v).getTime()) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  if (m < 48 * 60) return `${Math.round(m / 60)} h ago`;
  return `${Math.round(m / 1440)} days ago`;
};
export const human = (s?: string | null) => (s ? s.replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase()) : '—');

/* ---------- loading data ---------- */
export function useLoad<T>(load: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let live = true;
    setLoading(true);
    setError('');
    load()
      .then(d => live && setData(d))
      .catch(e => live && setError(friendlyError(e)))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);
  const reload = useCallback(() => setTick(t => t + 1), []);
  return { data, error, loading, reload, setData };
}

export const LoadState: React.FC<{ loading: boolean; error: string; onRetry: () => void; empty?: boolean; emptyText?: string; children?: React.ReactNode }> = ({
  loading,
  error,
  onRetry,
  empty,
  emptyText = 'Nothing here yet.',
  children,
}) => {
  if (error)
    return (
      <Notice tone="danger" icon={<AlertTriangle className="h-5 w-5" />}>
        <span className="block">{error}</span>
        <button type="button" onClick={onRetry} className="mt-1 inline-flex min-h-10 items-center gap-1.5 font-bold underline cursor-pointer">
          <RefreshCw className="h-4 w-4" aria-hidden="true" /> Try again
        </button>
      </Notice>
    );
  if (loading && !children)
    return (
      <div className="flex flex-col gap-3" role="status" aria-label="Loading">
        {[0, 1, 2].map(i => (
          <div key={i} className="h-16 animate-pulse rounded-2xl bg-muted" />
        ))}
      </div>
    );
  if (empty)
    return (
      <Card className="flex items-center gap-3 text-ink-2">
        <Inbox className="h-6 w-6 text-ink-3" aria-hidden="true" />
        <span>{emptyText}</span>
      </Card>
    );
  return <>{children}</>;
};

/* ---------- stat card ---------- */
export const Stat: React.FC<{ label: string; value: number | string; hint?: string; tone?: 'pri' | 'warn' | 'danger' | 'info' | 'muted'; icon?: React.ReactNode; onClick?: () => void }> = ({
  label,
  value,
  hint,
  tone = 'muted',
  icon,
  onClick,
}) => {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      {...(onClick ? { type: 'button', onClick } : {})}
      className={cx(
        'flex min-w-0 flex-col gap-1 rounded-2xl border border-line bg-surface p-4 text-left shadow-[0_1px_3px_rgba(15,35,26,0.06)] sm:p-5',
        onClick && 'cursor-pointer transition-transform hover:-translate-y-0.5 hover:border-pri-text'
      )}
    >
      <span className="flex items-center justify-between gap-2 text-sm font-semibold text-ink-3">
        {label}
        {icon && (
          <span
            className={cx(
              'flex h-8 w-8 items-center justify-center rounded-xl',
              tone === 'danger' ? 'bg-danger-soft text-danger-text' : tone === 'warn' ? 'bg-warn-soft text-warn' : tone === 'info' ? 'bg-info-soft text-info' : tone === 'pri' ? 'bg-pri-soft text-pri-ink' : 'bg-muted text-ink-2'
            )}
            aria-hidden="true"
          >
            {icon}
          </span>
        )}
      </span>
      <span className={cx('text-2xl font-extrabold tabular-nums sm:text-3xl', tone === 'danger' && Number(value) > 0 ? 'text-danger-text' : 'text-ink')}>{value}</span>
      {hint && <span className="text-sm text-ink-3">{hint}</span>}
    </Tag>
  );
};

/* ---------- bar chart: focus or hover a bar to read it; the numbers are also in a hidden table ---------- */
export const BarChart: React.FC<{ days: string[]; values: number[]; label: string; tone?: 'pri' | 'danger' | 'info' }> = ({ days, values, label, tone = 'pri' }) => {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...values);
  const total = values.reduce((a, b) => a + b, 0);
  const w = 100 / Math.max(1, values.length);
  const fill = tone === 'danger' ? 'var(--danger)' : tone === 'info' ? 'var(--info)' : 'var(--pri)';
  const shown = hover ?? values.length - 1;
  return (
    <figure className="m-0 flex flex-col gap-2">
      <figcaption className="flex flex-wrap items-baseline justify-between gap-2 text-sm text-ink-3">
        <span>
          <strong className="text-ink">{total}</strong> in 30 days
        </span>
        <span aria-live="polite">
          {fmtDate(days[shown])}: <strong className="text-ink">{values[shown]}</strong>
        </span>
      </figcaption>
      <svg viewBox="0 0 100 40" preserveAspectRatio="none" className="h-36 w-full overflow-visible" role="img" aria-label={`${label}: ${total} in the last 30 days`} onMouseLeave={() => setHover(null)}>
        <line x1="0" x2="100" y1="40" y2="40" stroke="var(--line)" strokeWidth="0.3" />
        {values.map((v, i) => {
          const h = (v / max) * 36;
          return (
            <rect
              key={i}
              x={i * w + w * 0.15}
              width={w * 0.7}
              y={40 - Math.max(h, v > 0 ? 0.8 : 0.3)}
              height={Math.max(h, v > 0 ? 0.8 : 0.3)}
              rx={0.6}
              fill={fill}
              opacity={hover === null || hover === i ? 0.9 : 0.35}
              onMouseEnter={() => setHover(i)}
              onFocus={() => setHover(i)}
              tabIndex={0}
              aria-label={`${fmtDate(days[i])}: ${v}`}
            />
          );
        })}
      </svg>
      <table className="sr-only">
        <caption>{label}</caption>
        <tbody>
          {days.map((d, i) => (
            <tr key={d}>
              <th scope="row">{d}</th>
              <td>{values[i]}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
};

/* ---------- status badge ---------- */
const TONES: Record<string, 'pri' | 'warn' | 'danger' | 'info' | 'muted'> = {
  verified: 'pri', active: 'pri', completed: 'pri', accepted: 'pri', resolved: 'pri', open: 'warn',
  pending: 'warn', new: 'warn', scheduled: 'info', in_progress: 'info', initiated: 'danger', contact_notified: 'danger', acknowledged: 'warn',
  rejected: 'danger', suspended: 'danger', cancelled: 'muted', no_show: 'warn', declined: 'muted', withdrawn: 'muted', expired: 'muted', hidden: 'warn', removed: 'muted',
  admin: 'info', therapist: 'pri', client: 'muted',
};
export const Status: React.FC<{ value: string; label?: string }> = ({ value, label }) => (
  <Badge tone={TONES[value] || 'muted'} dot className="whitespace-nowrap text-xs sm:text-sm">
    {label || human(value)}
  </Badge>
);

/* ---------- responsive list: a table on wide screens, cards on phones ---------- */
export interface Column<T> {
  key: string;
  label: string;
  render: (row: T) => React.ReactNode;
  /** shown first on the phone card, bold */
  primary?: boolean;
  className?: string;
}
export function DataList<T>({ rows, columns, rowKey, onRowClick, caption }: { rows: T[]; columns: Column<NoInfer<T>>[]; rowKey: (r: NoInfer<T>) => string; onRowClick?: (r: NoInfer<T>) => void; caption: string }) {
  return (
    <>
      <div className="hidden overflow-x-auto rounded-2xl border border-line bg-surface md:block">
        <table className="w-full border-collapse text-left text-[0.9375rem]">
          <caption className="sr-only">{caption}</caption>
          <thead className="bg-muted text-sm text-ink-2">
            <tr>
              {columns.map(c => (
                <th key={c.key} scope="col" className="whitespace-nowrap px-4 py-3 font-bold">
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr
                key={rowKey(r)}
                onClick={onRowClick ? () => onRowClick(r) : undefined}
                className={cx('border-t border-line align-top', onRowClick && 'cursor-pointer hover:bg-pri-soft/30')}
              >
                {columns.map((c, i) =>
                  i === 0 && onRowClick ? (
                    <td key={c.key} className={cx('px-4 py-3', c.className)}>
                      <button type="button" onClick={e => (e.stopPropagation(), onRowClick(r))} className="text-left font-bold text-ink underline-offset-2 hover:underline cursor-pointer">
                        {c.render(r)}
                      </button>
                    </td>
                  ) : (
                    <td key={c.key} className={cx('px-4 py-3 text-ink-2', c.className)}>
                      {c.render(r)}
                    </td>
                  )
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="m-0 flex list-none flex-col gap-2.5 p-0 md:hidden" aria-label={caption}>
        {rows.map(r => {
          const inner = (
            <>
              {columns.map(c => (
                <span key={c.key} className={cx('flex min-w-0 items-baseline justify-between gap-3 text-[0.9375rem]', c.primary && 'text-base font-bold text-ink')}>
                  {!c.primary && <span className="shrink-0 text-xs font-bold uppercase tracking-wide text-ink-3">{c.label}</span>}
                  <span className={cx('min-w-0 text-right', c.primary ? 'text-left' : 'text-ink-2')}>{c.render(r)}</span>
                </span>
              ))}
            </>
          );
          return (
            <li key={rowKey(r)}>
              {onRowClick ? (
                <button type="button" onClick={() => onRowClick(r)} className="flex w-full flex-col gap-1.5 rounded-2xl border border-line bg-surface p-4 text-left cursor-pointer active:scale-[0.99]">
                  {inner}
                </button>
              ) : (
                <div className="flex flex-col gap-1.5 rounded-2xl border border-line bg-surface p-4">{inner}</div>
              )}
            </li>
          );
        })}
      </ul>
    </>
  );
}

/* ---------- confirm with a reason ---------- */
export interface ConfirmSpec {
  title: string;
  body: React.ReactNode;
  confirm: string;
  danger?: boolean;
  /** ask for a reason (written to the admin log); required unless optional */
  reason?: 'required' | 'optional';
  reasonLabel?: string;
  run: (reason: string) => Promise<unknown>;
}
export const ConfirmDialog: React.FC<{ spec: ConfirmSpec | null; onClose: () => void; onDone: (msg: string) => void }> = ({ spec, onClose, onDone }) => {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    setReason('');
    setError('');
    setBusy(false);
  }, [spec]);
  if (!spec) return null;
  const needs = spec.reason === 'required';
  const go = async () => {
    if (needs && reason.trim().length < 3) {
      setError('Please give a reason (at least 3 characters). It goes into the admin log.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await spec.run(reason.trim());
      onDone(`${spec.confirm}: done.`);
      onClose();
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      isOpen
      onClose={onClose}
      title={spec.title}
      size="sm"
      footer={
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant={spec.danger ? 'danger' : 'primary'} onClick={go} disabled={busy}>
            {busy ? 'Working…' : spec.confirm}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="text-base text-ink-2">{spec.body}</div>
        {spec.reason && (
          <Field label={spec.reasonLabel || 'Reason'} htmlFor="adm-reason" optional={!needs} hint="Saved in the admin log with your name and the time.">
            <textarea id="adm-reason" rows={3} maxLength={500} value={reason} onChange={e => setReason(e.target.value)} className={textareaClass} />
          </Field>
        )}
        {error && <Notice tone="danger">{error}</Notice>}
      </div>
    </Modal>
  );
};
