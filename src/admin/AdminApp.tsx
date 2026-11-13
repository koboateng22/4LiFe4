/**
 * The admin dashboard, at /admin. Separate from the client app and the therapist workspace.
 *
 * Who gets in: the database decides. Every number and every action comes from a database function that
 * checks public.is_admin() (profiles.role = 'admin'), and refuses everyone else. The check here only
 * chooses what to show: a signed-out visitor sees "sign in", a non-admin sees "no access", and nothing
 * is loaded for them.
 *
 * Sections are in the address (/admin#people), so a refresh or a shared link opens the same place.
 * The admin interface is in English.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, BadgeCheck, CalendarClock, Flag, LayoutDashboard, Leaf, Lock, ScrollText, Server, Siren, SquareLibrary, Users } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Card, Notice, cx } from '../components/ui';
import { isRemote } from '../lib/supabase';
import { adminSession } from '../lib/db/adminApi';
import { OverviewSection, PeopleSection, TherapistsSection, type SectionProps } from './sections1';
import { AppointmentsSection, ContentSection, LogSection, ModerationSection, SosSection, SystemSection } from './sections2';

interface SectionDef {
  id: string;
  label: string;
  icon: LucideIcon;
  intro: string;
  view: React.FC<SectionProps & { initialFilter?: string }>;
}
const SECTIONS: SectionDef[] = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard, intro: 'How 4Life is doing, and what needs you.', view: OverviewSection },
  { id: 'people', label: 'People', icon: Users, intro: 'Accounts: find someone, see their activity in numbers, suspend or restore, give or remove admin rights.', view: PeopleSection },
  { id: 'therapists', label: 'Therapists', icon: BadgeCheck, intro: 'Licence checks, approvals and suspensions.', view: TherapistsSection },
  { id: 'appointments', label: 'Appointments', icon: CalendarClock, intro: 'Sessions and requests across 4Life, and anything stuck.', view: AppointmentsSection },
  { id: 'moderation', label: 'Moderation', icon: Flag, intro: 'Reports from the Global Village.', view: ModerationSection },
  { id: 'sos', label: 'SOS', icon: Siren, intro: 'SOS alerts: status and timing only.', view: SosSection },
  { id: 'content', label: 'Content', icon: SquareLibrary, intro: 'Group circles, helplines and emergency centres.', view: ContentSection },
  { id: 'system', label: 'System', icon: Server, intro: 'Servers, database updates, scheduled clean-ups and admin accounts.', view: SystemSection },
  { id: 'log', label: 'Admin log', icon: ScrollText, intro: 'Every admin action, who did it, when and why.', view: LogSection },
];

const readHash = () => {
  const [id, filter] = window.location.hash.replace(/^#/, '').split(':');
  return { id: SECTIONS.some(s => s.id === id) ? id : 'overview', filter: filter || '' };
};

type Gate = { state: 'loading' } | { state: 'device' } | { state: 'signed-out' } | { state: 'no-access' } | { state: 'admin'; nickname?: string };

export default function AdminApp() {
  const [gate, setGate] = useState<Gate>({ state: 'loading' });
  const [{ id, filter }, setRoute] = useState(readHash);
  const [flashMsg, setFlashMsg] = useState('');

  useEffect(() => {
    const before = document.title;
    document.title = 'Admin · 4Life';
    if (!isRemote) {
      setGate({ state: 'device' });
      return;
    }
    adminSession()
      .then(s => setGate(!s.signedIn ? { state: 'signed-out' } : s.isAdmin ? { state: 'admin', nickname: s.nickname } : { state: 'no-access' }))
      .catch(() => setGate({ state: 'signed-out' }));
    const onHash = () => setRoute(readHash());
    window.addEventListener('hashchange', onHash);
    return () => {
      document.title = before;
      window.removeEventListener('hashchange', onHash);
    };
  }, []);

  const go = useCallback((section: string, f?: string) => {
    window.location.hash = f ? `${section}:${f}` : section;
    window.scrollTo({ top: 0 });
  }, []);
  // a message about one section doesn't follow you to the next
  useEffect(() => setFlashMsg(''), [id]);
  const flash = useCallback((m: string) => {
    setFlashMsg(m);
    window.setTimeout(() => setFlashMsg(''), 4000);
  }, []);

  if (gate.state !== 'admin') return <Gatekeeper gate={gate} />;

  const def = SECTIONS.find(s => s.id === id)!;
  const View = def.view;
  return (
    <div className="min-h-screen bg-bg text-ink">
      <header className="sticky top-0 z-30 border-b border-line bg-surface/85 pt-[env(safe-area-inset-top)] backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1400px] items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <a href="/admin" className="flex min-w-0 items-center gap-2.5" aria-label="Admin dashboard home">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-pri text-[#fff]" aria-hidden="true">
              <Leaf className="h-5 w-5" />
            </span>
            <span className="min-w-0">
              <span className="block text-lg font-extrabold leading-tight" translate="no">
                4Life Admin
              </span>
              <span className="block truncate text-xs text-ink-3">Signed in as {gate.nickname}</span>
            </span>
          </a>
          <a href="/" className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-xl border border-line bg-surface px-3.5 text-[0.9375rem] font-semibold hover:border-pri-text">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" /> <span className="hidden sm:inline">Back to 4Life</span>
            <span className="sm:hidden">4Life</span>
          </a>
        </div>
        {/* phones and tablets: the sections in a row you can scroll */}
        <nav aria-label="Admin sections" className="no-scrollbar flex gap-1.5 overflow-x-auto px-3 pb-2.5 lg:hidden">
          {SECTIONS.map(s => {
            const Icon = s.icon;
            const on = s.id === id;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => go(s.id)}
                aria-current={on ? 'page' : undefined}
                className={cx(
                  'inline-flex min-h-11 shrink-0 items-center gap-2 rounded-xl border px-3.5 text-sm font-semibold cursor-pointer',
                  on ? 'glass-btn glass-btn-on text-pri-ink' : 'border-line bg-surface text-ink-2'
                )}
              >
                <Icon className="h-4 w-4" aria-hidden="true" />
                {s.label}
              </button>
            );
          })}
        </nav>
      </header>

      <div className="mx-auto grid max-w-[1400px] gap-6 px-4 pb-16 pt-6 sm:px-6 lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-10 lg:pt-8">
        {/* computers: a labelled column */}
        <nav aria-label="Admin sections" className="hidden lg:sticky lg:top-24 lg:flex lg:flex-col lg:gap-1 lg:self-start">
          {SECTIONS.map(s => {
            const Icon = s.icon;
            const on = s.id === id;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => go(s.id)}
                aria-current={on ? 'page' : undefined}
                className={cx(
                  'flex min-h-11 items-center gap-3 rounded-xl px-3 text-left text-[0.9375rem] cursor-pointer',
                  on ? 'glass-btn glass-btn-on border font-bold text-pri-ink' : 'font-semibold text-ink-2 hover:bg-muted hover:text-ink'
                )}
              >
                <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
                {s.label}
              </button>
            );
          })}
        </nav>

        <main id="admin-main" className="min-w-0">
          <h1 className="m-0 text-2xl font-extrabold tracking-tight sm:text-3xl">{def.label}</h1>
          <p className="m-0 mb-6 mt-1 text-[0.9375rem] text-ink-3">{def.intro}</p>
          {flashMsg && (
            <div role="status" className="mb-4">
              <Notice>{flashMsg}</Notice>
            </div>
          )}
          <View key={id + filter} go={go} flash={flash} initialFilter={filter} />
        </main>
      </div>
    </div>
  );
}

const Gatekeeper: React.FC<{ gate: Gate }> = ({ gate }) => (
  <div className="flex min-h-screen items-center justify-center bg-bg p-4 text-ink">
    <Card className="flex w-full max-w-md flex-col items-start gap-4">
      <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-pri text-[#fff]" aria-hidden="true">
        {gate.state === 'loading' ? <Leaf className="h-6 w-6" /> : <Lock className="h-6 w-6" />}
      </span>
      {gate.state === 'loading' && (
        <p className="m-0 text-base" role="status">
          Checking your access…
        </p>
      )}
      {gate.state === 'device' && (
        <>
          <h1 className="m-0 text-xl font-bold">The admin dashboard needs the online database</h1>
          <p className="m-0 text-ink-2">This copy of 4Life keeps everything on this device, so there is nothing to administer. Set up Supabase (SUPABASE.md) to use it.</p>
        </>
      )}
      {gate.state === 'signed-out' && (
        <>
          <h1 className="m-0 text-xl font-bold">Sign in first</h1>
          <p className="m-0 text-ink-2">Sign in to 4Life with an admin account, then come back to this page (or choose “Admin dashboard” in your account menu).</p>
        </>
      )}
      {gate.state === 'no-access' && (
        <>
          <h1 className="m-0 text-xl font-bold">No access</h1>
          <p className="m-0 text-ink-2">This page is for 4Life administrators. Your account doesn’t have admin rights.</p>
        </>
      )}
      {gate.state !== 'loading' && (
        <a href="/" className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-pri px-4 font-bold text-[#fff] no-underline">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Go to 4Life
        </a>
      )}
    </Card>
  </div>
);
