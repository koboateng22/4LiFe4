import React, { useCallback, useEffect, useRef, useState } from 'react';
import { LivingBackground } from '../components/LivingBackground';
import { useMovingBackground, useScrolled } from '../lib/motion';
import { CommandPalette, PaletteTrigger, usePaletteShortcut, type PaletteItem } from '../components/CommandPalette';
import { RibbonLoader } from '../components/RibbonMark';
import { Phone, Sparkles, UserRound, Search, Palette, BriefcaseMedical } from 'lucide-react';
import {
  CalendarDays, Clock, Home, Inbox, LifeBuoy, LogOut, Menu, Moon, MoreHorizontal, Sun, UserCog, Users, X, Leaf, ShieldAlert, Map as MapIcon, Siren, ArrowRight,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { ThemePref } from '../lib/theme';
import { Avatar, IconButton, cx } from '../components/ui';
import type { TherapistProfile, TherapistTab } from './types';
import { displayName, saveTherapistAccount } from './data';
import { useTherapistStore } from './useTherapistStore';
import { TodayTab } from './tabs/TodayTab';
import { SessionsTab } from './tabs/SessionsTab';
import { ClientsTab } from './tabs/ClientsTab';
import { RequestsTab } from './tabs/RequestsTab';
import { AvailabilityTab } from './tabs/AvailabilityTab';
import { ServicesTab } from './tabs/ServicesTab';
import { ResourcesTab } from './tabs/ResourcesTab';
import { TherapistProfileTab } from './tabs/TherapistProfileTab';
import { SessionRoom } from './SessionRoom';
import { SafetyMapTab } from './tabs/SafetyMapTab';
import { ago } from './data';
import { friendlyError, isRemote } from '../lib/supabase';
import { updateTherapistProfile } from '../lib/db/therapistApi';
import { RibbonMark } from '../components/RibbonMark';

import { t as tr, T, msg } from '../i18n';
interface NavDef {
  id: TherapistTab;
  label: string;
  short: string;
  subtitle: string;
  icon: LucideIcon;
  group: 'main' | 'practice' | 'account';
}

const NAV: NavDef[] = [
  { id: 'today', label: msg('Today'), short: msg('Today'), subtitle: msg('Your day at a glance'), icon: Home, group: 'main' },
  { id: 'safety', label: msg('Safety map'), short: msg('Map'), subtitle: msg('Clients at high risk and the nearest emergency services'), icon: MapIcon, group: 'main' },
  { id: 'sessions', label: msg('Sessions'), short: msg('Sessions'), subtitle: msg('Your schedule and session notes'), icon: CalendarDays, group: 'main' },
  { id: 'clients', label: msg('Clients'), short: msg('Clients'), subtitle: msg('The people you are supporting'), icon: Users, group: 'main' },
  { id: 'requests', label: msg('Requests'), short: msg('Requests'), subtitle: msg('People asking to work with you'), icon: Inbox, group: 'main' },
  { id: 'availability', label: msg('Availability'), short: msg('Hours'), subtitle: msg('When clients can book you'), icon: Clock, group: 'practice' },
  { id: 'services', label: msg('Services'), short: msg('Services'), subtitle: msg('What you offer, how long, and the price'), icon: BriefcaseMedical, group: 'practice' },
  { id: 'resources', label: msg('Crisis and resources'), short: msg('Resources'), subtitle: msg('Crisis steps, worksheets and referrals'), icon: LifeBuoy, group: 'practice' },
  { id: 'profile', label: msg('Profile and settings'), short: msg('Profile'), subtitle: msg('What clients see, and your account'), icon: UserCog, group: 'account' },
];
const BOTTOM: TherapistTab[] = ['today', 'sessions', 'clients', 'requests'];

export interface TherapistNav {
  go: (tab: TherapistTab) => void;
  openSession: (id: string) => void;
  openClient: (id: string) => void;
  /** Open the safety map focused on one client */
  openSafety: (id?: string) => void;
}

interface TherapistAppProps {
  therapist: TherapistProfile;
  setTherapist: (t: TherapistProfile) => void;
  isDark: boolean;
  /** The theme choice; it is changed on the Profile page */
  theme: ThemePref;
  onChangeTheme: (pref: ThemePref) => void;
  onLogout: () => void;
}

/** The therapist workspace: its own menu, top bar and sections. */
export const TherapistApp: React.FC<TherapistAppProps> = ({ therapist, setTherapist, isDark, theme, onChangeTheme, onLogout }) => {
  const [movingBg, setMovingBg] = useMovingBackground();
  const scrolled = useScrolled();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const openPalette = useCallback(() => setPaletteOpen(true), []);
  usePaletteShortcut(openPalette);
  const store = useTherapistStore(therapist);
  const [tab, setTab] = useState<TherapistTab>('today');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [clientId, setClientId] = useState<string | null>(null);
  const [safetyFocus, setSafetyFocus] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const mainRef = useRef<HTMLElement>(null);

  const newRequests = store.requests.filter(r => r.status === 'new').length;
  const highRisk = store.data.clients.filter(c => c.status === 'active' && c.risk === 'high');
  // A client who pressed SOS in the last 2 hours and whose alert is still open
  const sosAlert = highRisk
    .map(c => ({ c, e: [...(c.escalations || [])].reverse().find(e => e.action.startsWith('Pressed SOS')) }))
    .filter(x => x.e && Date.now() - new Date(x.e.at).getTime() < 2 * 3600000 && !(x.c.escalations || []).some(e => e.at > x.e!.at && e.action.startsWith('Alert closed')))
    .sort((a, b) => b.e!.at.localeCompare(a.e!.at))[0];

  const nav: TherapistNav = {
    go: t => {
      setTab(t);
      setSessionId(null);
      setClientId(null);
      setDrawerOpen(false);
      window.scrollTo({ top: 0 });
    },
    openSession: id => {
      setSessionId(id);
      setDrawerOpen(false);
      window.scrollTo({ top: 0 });
    },
    openSafety: id => {
      setTab('safety');
      setSessionId(null);
      setClientId(null);
      setSafetyFocus(id || null);
      setDrawerOpen(false);
      window.scrollTo({ top: 0 });
    },
    openClient: id => {
      setTab('clients');
      setSessionId(null);
      setClientId(id);
      window.scrollTo({ top: 0 });
    },
  };

  const [profileError, setProfileError] = useState<string | null>(null);
  const updateTherapist = (patch: Partial<TherapistProfile>) => {
    const next = { ...therapist, ...patch };
    setTherapist(next);
    if (isRemote) {
      updateTherapistProfile(therapist.id, patch).catch(e => setProfileError(friendlyError(e)));
    } else {
      saveTherapistAccount(next);
    }
  };
  const syncProblem = store.syncError || profileError;

  useEffect(() => {
    document.title = '4Life · Therapist';
    return () => {
      document.title = '4Life';
    };
  }, []);

  const def = NAV.find(n => n.id === tab)!;
  const session = sessionId ? store.data.sessions.find(s => s.id === sessionId) : undefined;
  const sessionClient = session ? store.data.clients.find(c => c.id === session.clientId) : undefined;
  const title = session ? tr('Session with {name}', { name: sessionClient?.nickname || tr('client') }) : tr(def.label);
  const subtitle = session ? tr('Prepare, run and wrap up the session') : tr(def.subtitle);

  const renderNav = (n: NavDef) => {
    const Icon = n.icon;
    const active = tab === n.id && !session;
    return (
      <button
        key={n.id}
        type="button"
        onClick={() => nav.go(n.id)}
        aria-current={active ? 'page' : undefined}
        className={cx(
          'flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-[0.9375rem] transition-colors cursor-pointer',
          active ? 'bg-pri-soft font-bold text-pri-ink' : 'font-semibold text-ink-2 hover:bg-muted hover:text-ink'
        )}
      >
        <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
        <span className="flex-1 truncate">{tr(n.label)}</span>
        {n.id === 'safety' && highRisk.length > 0 && (
          <span className="rounded-full bg-danger px-2 py-0.5 text-xs font-bold text-[#fff]" aria-label={tr("{length} at high risk", { length: highRisk.length })}>
            {highRisk.length}
          </span>
        )}
        {n.id === 'requests' && newRequests > 0 && (
          <span className="rounded-full bg-pri px-2 py-0.5 text-xs font-bold text-[#fff]" aria-label={`${newRequests} new`}>
            {newRequests}
          </span>
        )}
      </button>
    );
  };

  // Quick search (Ctrl/⌘ K): sections, clients and crisis steps in one box
  const ic = 'h-5 w-5';
  const paletteItems: PaletteItem[] = [
    { id: 'call112', group: msg('Urgent'), tone: 'danger', label: msg('Call 112: emergency'), icon: <Phone className={ic} />, keywords: 'emergency ambulance police 193', run: () => { window.location.href = 'tel:112'; } },
    { id: 'crisis', group: msg('Urgent'), tone: 'danger', label: msg('Crisis steps'), hint: msg('What to do now'), icon: <ShieldAlert className={ic} />, keywords: 'suicide risk danger safety plan protocol', run: () => nav.go('resources') },
    {
      id: 'safety', group: msg('Urgent'), label: highRisk.length ? tr('Safety map: {count} at high risk', { count: highRisk.length }) : msg('Safety map'), icon: <MapIcon className={ic} />,
      keywords: 'sos location high risk map', run: () => nav.openSafety(),
    },
    ...NAV.filter(n => n.id !== 'safety').map(n => {
      const Icon = n.icon;
      return { id: `nav-${n.id}`, group: msg('Go to'), label: n.label, hint: n.subtitle, icon: <Icon className={ic} />, keywords: n.short, run: () => nav.go(n.id) };
    }),
    ...store.data.clients
      .filter(c => c.status !== 'discharged')
      .map(c => ({
        id: `client-${c.id}`, group: msg('Clients'), label: c.nickname,
        hint: c.risk === 'high' ? tr('High risk · {count} days clean', { count: c.streakDays }) : tr('{count} days clean', { count: c.streakDays }),
        icon: <UserRound className={ic} />, keywords: `client ${c.focus} ${c.risk} ${c.status}`, run: () => nav.openClient(c.id),
      })),
    { id: 'theme', group: msg('Settings'), label: msg('Appearance'), hint: msg('Theme'), icon: <Palette className={ic} />, keywords: 'theme night dark light system appearance', run: () => nav.go('profile') },
    { id: 'motion', group: msg('Settings'), label: movingBg ? msg('Turn off the moving background') : msg('Turn on the moving background'), icon: <Sparkles className={ic} />, keywords: 'animation ribbon motion battery', run: () => setMovingBg(!movingBg) },
    { id: 'logout', group: msg('Settings'), label: msg('Sign out'), icon: <LogOut className={ic} />, keywords: 'log out exit', run: onLogout },
  ];

  return (
    <div className="relative isolate min-h-screen bg-bg text-ink">
      {/* Same living background as the client app; still on the safety map and when switched off */}
      <LivingBackground fixed isDark={isDark} density={0.4} still={!movingBg || tab === 'safety'} zoneSelector="#t-main" />
      <T text="<0>Skip to content</0>" parts={[<a href="#t-main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded-xl focus:bg-surface focus:px-4 focus:py-3 focus:font-bold" />]} />

      {drawerOpen && <div className="fixed inset-0 z-40 bg-[rgba(15,23,42,0.55)] backdrop-blur-sm lg:hidden" onClick={() => setDrawerOpen(false)} aria-hidden="true" />}

      {/* Sidebar */}
      <aside
        id="t-nav"
        aria-label={tr("Therapist navigation")}
        className={cx(
          'fixed inset-y-0 left-0 z-50 flex h-[100dvh] w-[272px] flex-col border-r border-line bg-surface/85 backdrop-blur-xl transition-transform duration-300 lg:z-30 lg:translate-x-0',
          drawerOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full'
        )}
      >
        <div className="flex items-center justify-between gap-2 px-4 pb-3 pt-5">
          <span className="flex items-center gap-2.5">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-pri text-[#fff]">
              <Leaf className="h-5 w-5" aria-hidden="true" />
            </span>
            <span className="leading-tight">
              <span className="block font-logo text-[1.25rem] text-pri-text" translate="no">
                4Life
              </span>
              <T text="<0>Therapist workspace</0>" parts={[<span className="block text-xs font-bold text-ink-3" />]} />
            </span>
          </span>
          <span className="lg:hidden">
            <IconButton label={tr("Close menu")} variant="ghost" onClick={() => setDrawerOpen(false)}>
              <X className="h-5 w-5" />
            </IconButton>
          </span>
        </div>

        <nav className="flex-1 overflow-y-auto px-3" aria-label={tr("Sections")}>
          <button
            type="button"
            onClick={() => {
              setDrawerOpen(false);
              openPalette();
            }}
            className="mb-2 flex min-h-11 w-full items-center gap-3 rounded-xl border border-line bg-bg px-3 text-left text-[0.9375rem] font-semibold text-ink-3 sm:hidden cursor-pointer"
          >
            <Search className="h-5 w-5" aria-hidden="true" /> {tr("Search or jump to…")}
          </button>
          <div className="flex flex-col gap-0.5">{NAV.filter(n => n.group === 'main').map(renderNav)}</div>
          <p className="mx-3 mb-1.5 mt-5 text-xs font-bold text-ink-3">{tr("Your practice")}</p>
          <div className="flex flex-col gap-0.5">{NAV.filter(n => n.group === 'practice').map(renderNav)}</div>
        </nav>

        <div className="flex flex-col gap-1 border-t border-line px-3 pb-4 pt-3">
          {NAV.filter(n => n.group === 'account').map(renderNav)}
          <button
            type="button"
            onClick={onLogout}
            className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-[0.9375rem] font-semibold text-ink-2 hover:bg-muted hover:text-ink cursor-pointer"
          >
            <LogOut className="h-5 w-5" aria-hidden="true" /> {tr("Sign out")}
          </button>
          <div className="mt-2 flex items-center gap-3 rounded-xl bg-muted p-3">
            <Avatar tone="muted" name={therapist.name} solid size={40} />
            <span className="min-w-0">
              <span className="block truncate text-[0.9375rem] font-bold text-ink">{displayName(therapist)}</span>
              <span className="block truncate text-sm text-ink-3">{therapist.profession}</span>
            </span>
          </div>
        </div>
      </aside>

      <div className="flex min-h-screen flex-col lg:pl-[272px]">
        {/* Top bar */}
        <header data-scrolled={scrolled} className="topbar sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-line bg-surface/80 px-4 py-3 backdrop-blur-xl sm:px-6 lg:px-10">
          <div className="flex min-w-0 items-center gap-3">
            <IconButton label={tr("Open menu")} onClick={() => setDrawerOpen(true)} className="lg:hidden" aria-controls="t-nav">
              <Menu className="h-5 w-5" />
            </IconButton>
            <div className="min-w-0">
              <p className="m-0 truncate text-lg font-bold leading-tight text-ink sm:text-xl">{tr(title)}</p>
              <p className="m-0 hidden truncate text-sm text-ink-3 md:block">{tr(subtitle)}</p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span className="hidden xl:block"><PaletteTrigger onClick={openPalette} className="w-60" /></span>
            <span className="hidden sm:block xl:hidden"><PaletteTrigger onClick={openPalette} compact /></span>
            <button
              type="button"
              onClick={() => nav.go('resources')}
              className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-danger-soft px-3.5 text-[0.9375rem] font-bold text-danger-text hover:brightness-95 cursor-pointer"
            >
              <ShieldAlert className="h-5 w-5" aria-hidden="true" />
              <T text="<0>Crisis steps</0>" parts={[<span className="hidden sm:inline" />]} />
            </button>
          </div>
        </header>

        {sosAlert && !(tab === 'safety' && !session) && (
          <div role="alert" className="border-b border-danger bg-danger text-[#fff]">
            <div className="mx-auto flex w-full max-w-[1180px] flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5 sm:px-6 lg:px-10">
              <Siren className="h-5 w-5 shrink-0" aria-hidden="true" />
              <p className="m-0 min-w-0 flex-1 basis-[14rem] text-[0.9375rem]">
                <T text="<0>{nickname}</0> pressed SOS" parts={[<strong />]} vars={{ nickname: sosAlert.c.nickname }} /> {ago(sosAlert.e!.at)}
                {sosAlert.c.lastLocation && sosAlert.c.locationConsent ? ` near ${sosAlert.c.lastLocation.area}` : ''}.
              </p>
              <button
                type="button"
                onClick={() => nav.openSafety(sosAlert.c.id)}
                className="inline-flex min-h-10 w-full items-center justify-center gap-1.5 rounded-lg bg-[#fff] px-3.5 text-sm font-bold text-danger-text hover:brightness-95 cursor-pointer sm:w-auto"
              >
                {tr("Open safety map")} <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          </div>
        )}

        <main id="t-main" ref={mainRef} className="mx-auto w-full max-w-[1180px] flex-1 px-4 pb-28 pt-6 sm:px-6 sm:pt-8 lg:px-10 lg:pb-16">
          {syncProblem && (
            <div role="alert" className="mb-6 flex flex-wrap items-center gap-3 rounded-xl bg-warn-soft px-4 py-3 text-[0.9375rem] text-warn">
              <p className="m-0 min-w-0 flex-1">
                <T text="<0>Not saved.</0> {syncProblem}" parts={[<strong />]} vars={{ syncProblem }} />
              </p>
              <button
                type="button"
                className="min-h-10 rounded-lg px-3 font-bold underline cursor-pointer"
                onClick={() => {
                  store.clearError();
                  setProfileError(null);
                  store.reload();
                }}
              >
                {tr("Try again")}
              </button>
            </div>
          )}
          {store.loading ? (
            <div className="flex flex-col gap-4" aria-busy="true" aria-live="polite">
              <RibbonLoader text={tr('Loading your caseload…')} />
              {[0, 1, 2].map(i => (
                <div key={i} className="h-28 animate-pulse rounded-2xl bg-muted" />
              ))}
            </div>
          ) : session && sessionClient ? (
            <SessionRoom
              key={session.id}
              session={session}
              client={sessionClient}
              store={store}
              therapist={therapist}
              onClose={() => setSessionId(null)}
              onOpenClient={() => nav.openClient(sessionClient.id)}
              onOpenSafety={() => nav.openSafety(sessionClient.id)}
            />
          ) : (
            <div key={tab} className="page-in">
              {tab === 'today' && <TodayTab therapist={therapist} store={store} nav={nav} />}
              {tab === 'safety' && <SafetyMapTab therapist={therapist} store={store} nav={nav} focusId={safetyFocus} setFocusId={setSafetyFocus} />}
              {tab === 'sessions' && <SessionsTab therapist={therapist} store={store} nav={nav} />}
              {tab === 'clients' && <ClientsTab therapist={therapist} store={store} nav={nav} clientId={clientId} setClientId={setClientId} />}
              {tab === 'requests' && <RequestsTab therapist={therapist} store={store} nav={nav} />}
              {tab === 'availability' && (
                <AvailabilityTab therapist={therapist} onSave={updateTherapist} timeOff={store.data.timeOff || []} onAddTimeOff={store.addTimeOff} onRemoveTimeOff={store.removeTimeOff} />
              )}
              {tab === 'services' && <ServicesTab therapist={therapist} store={store} />}
              {tab === 'resources' && <ResourcesTab />}
              {tab === 'profile' && <TherapistProfileTab therapist={therapist} onSave={updateTherapist} onLogout={onLogout} theme={theme} onChangeTheme={onChangeTheme} />}
            </div>
          )}
          <footer className="mt-12 flex items-start gap-2 border-t border-line pt-6 text-sm text-ink-3">
            <RibbonMark className="mt-0.5 h-6 w-4" label={tr("Green ribbon: mental health awareness")} />
            <span>
            <T text="4Life therapist workspace · Client information is confidential. In an emergency call <0>112</0> or the ambulance on <1>193</1>." parts={[<strong className="text-ink" />, <strong className="text-ink" />]} />
            </span>
          </footer>
        </main>
      </div>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} items={paletteItems} placeholder={tr("Search sections, clients or crisis steps…")} />

      {/* Mobile bottom bar */}
      <nav
        aria-label={tr("Quick navigation")}
        className="fixed inset-x-0 bottom-0 z-30 flex border-t border-line bg-surface/85 px-1 pb-[max(env(safe-area-inset-bottom),6px)] pt-1 backdrop-blur-xl lg:hidden"
      >
        {BOTTOM.map(id => {
          const n = NAV.find(x => x.id === id)!;
          const Icon = n.icon;
          const active = tab === id && !session;
          return (
            <button
              key={id}
              type="button"
              onClick={() => nav.go(id)}
              aria-current={active ? 'page' : undefined}
              className={cx('relative flex min-h-14 flex-1 flex-col items-center justify-center gap-1 text-xs cursor-pointer', active ? 'font-bold text-pri-text' : 'font-semibold text-ink-3')}
            >
              <span className={cx('flex h-8 w-14 items-center justify-center rounded-full transition-colors duration-200', active && 'bg-pri-soft')}>
                <Icon className="h-6 w-6" aria-hidden="true" />
              </span>
              {tr(n.short)}
              {id === 'requests' && newRequests > 0 && (
                <span className="absolute right-[22%] top-1 rounded-full bg-pri px-1.5 text-[0.6875rem] font-bold leading-5 text-[#fff]">{newRequests}</span>
              )}
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          className={cx('flex min-h-14 flex-1 flex-col items-center justify-center gap-1 text-xs cursor-pointer', !BOTTOM.includes(tab) ? 'font-bold text-pri-text' : 'font-semibold text-ink-3')}
        >
          <span className={cx('flex h-8 w-14 items-center justify-center rounded-full transition-colors duration-200', !BOTTOM.includes(tab) && 'bg-pri-soft')}>
            <MoreHorizontal className="h-6 w-6" aria-hidden="true" />
          </span>
          {tr("More")}
        </button>
      </nav>
    </div>
  );
};
