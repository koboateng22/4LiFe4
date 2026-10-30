import React from 'react';
import { AlertTriangle, ChevronRight, Eye, ShieldCheck, Video, Phone, MapPin, MessageSquare } from 'lucide-react';
import { Avatar, Badge, cx } from '../components/ui';
import type { ClientRecord, ClientRisk, SessionFormat, TherapySession } from './types';
import { FORMAT_LABEL, SESSION_TYPE_LABEL, fmtDay, fmtTime, focusLabel } from './data';

export const RISK_INFO: Record<ClientRisk, { label: string; tone: 'pri' | 'warn' | 'danger' }> = {
  low: { label: 'Low risk', tone: 'pri' },
  moderate: { label: 'Watch closely', tone: 'warn' },
  high: { label: 'High risk', tone: 'danger' },
};

/** Risk is always shown as a word plus an icon, never colour alone. */
export const RiskBadge: React.FC<{ risk: ClientRisk }> = ({ risk }) => {
  const info = RISK_INFO[risk];
  return (
    <Badge tone={info.tone}>
      {risk === 'low' ? <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" /> : <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />}
      {info.label}
    </Badge>
  );
};

export const FormatIcon: React.FC<{ format: SessionFormat; className?: string }> = ({ format, className = 'h-4 w-4' }) => {
  const Icon = format === 'video' ? Video : format === 'voice' ? Phone : format === 'in_person' ? MapPin : MessageSquare;
  return <Icon className={className} aria-hidden="true" />;
};

/** What state a session is in, in plain words. */
export function sessionState(s: TherapySession): { label: string; tone: 'pri' | 'warn' | 'danger' | 'info' | 'muted' } {
  const end = new Date(s.start).getTime() + s.durationMin * 60000;
  if (s.status === 'in_progress') return { label: 'In progress', tone: 'info' };
  if (s.status === 'completed') return s.note?.signedAt ? { label: 'Done', tone: 'muted' } : { label: 'Note to finish', tone: 'warn' };
  if (s.status === 'cancelled') return { label: 'Cancelled', tone: 'muted' };
  if (s.status === 'no_show') return { label: 'Did not attend', tone: 'muted' };
  if (Date.now() > end) return { label: 'Not started', tone: 'warn' };
  if (Date.now() > new Date(s.start).getTime() - 15 * 60000) return { label: 'Starting soon', tone: 'pri' };
  return { label: 'Booked', tone: 'muted' };
}

export const needsNote = (s: TherapySession) => s.status === 'completed' && !s.note?.signedAt;

/** One session as a row: time, client, type and state. */
export const SessionRow: React.FC<{
  session: TherapySession;
  client?: ClientRecord;
  showDay?: boolean;
  onOpen: () => void;
}> = ({ session, client, showDay, onOpen }) => {
  const st = sessionState(session);
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full items-center gap-4 rounded-xl px-3 py-3 text-left transition-colors hover:bg-muted cursor-pointer"
    >
      <span className="w-[5.25rem] shrink-0 whitespace-nowrap leading-tight">
        {showDay && <span className="block text-sm font-semibold text-ink-3">{fmtDay(session.start)}</span>}
        <span className="block text-base font-bold text-ink">{fmtTime(session.start)}</span>
        <span className="block text-sm text-ink-3">{session.durationMin} min</span>
      </span>
      <Avatar tone="muted" name={client?.nickname} size={40} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-base font-bold text-ink">{client?.nickname || 'Client'}</span>
        <span className="flex flex-wrap items-center gap-x-2 text-sm text-ink-3">
          <span>{SESSION_TYPE_LABEL[session.type]}</span>
          <span aria-hidden="true">·</span>
          <span className="inline-flex items-center gap-1">
            <FormatIcon format={session.format} className="h-3.5 w-3.5" />
            {FORMAT_LABEL[session.format]}
          </span>
          {session.topic && (
            <>
              <span aria-hidden="true">·</span>
              <span className="truncate">{session.topic}</span>
            </>
          )}
        </span>
      </span>
      <span className="hidden sm:block">
        <Badge tone={st.tone}>{st.label}</Badge>
      </span>
      <ChevronRight className="h-5 w-5 shrink-0 text-ink-3" aria-hidden="true" />
    </button>
  );
};

/** Short client line used in lists. */
export const ClientLine: React.FC<{ client: ClientRecord }> = ({ client }) => (
  <span className="text-sm text-ink-3">
    {focusLabel(client.focus)} · {client.streakDays} {client.streakDays === 1 ? 'day' : 'days'} clean
  </span>
);

/** Shows what a client has agreed to share. */
export const SharingNote: React.FC<{ shares: boolean; className?: string }> = ({ shares, className }) => (
  <span className={cx('inline-flex items-center gap-1.5 text-sm', shares ? 'text-ink-3' : 'text-warn', className)}>
    <Eye className="h-4 w-4" aria-hidden="true" />
    {shares ? 'Shares daily check-ins with you' : 'Has not shared check-ins'}
  </span>
);

export const avg = (arr: Array<number | null>) => {
  const v = arr.filter((x): x is number => x != null);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
};

/** Compare the last 7 days with the 7 before. */
export const trend = (arr: Array<number | null>) => {
  const a = avg(arr.slice(-7));
  const b = avg(arr.slice(-14, -7));
  if (a == null || b == null) return null;
  return a - b;
};

export const missedCheckins = (arr: Array<number | null>) => arr.slice(-7).filter(v => v == null).length;
