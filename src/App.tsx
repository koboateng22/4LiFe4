import React, { useState, useEffect, useCallback, useMemo, lazy, Suspense } from 'react';
import { flushSync } from 'react-dom';
import { UserProfile, CounselorMatch, ActiveTab, TriageCategory } from './types';
import { Sidebar } from './components/Sidebar';
import { TopBar } from './components/TopBar';
import { BottomNav } from './components/BottomNav';
import { DashboardTab } from './components/tabs/DashboardTab';
import { EmergencyMapTab } from './components/tabs/EmergencyMapTab';
import { SosModal } from './components/modals/SosModal';
import { CounselorModal } from './components/modals/CounselorModal';
import { BreathingCalmModal } from './components/modals/BreathingCalmModal';
import { DeveloperFeedbackModal } from './components/DeveloperFeedbackModal';
import { LanguageSwitcherModal } from './components/modals/LanguageSwitcherModal';
import { GoogleTranslateBar } from './components/GoogleTranslateBar';
import { AuthPage } from './components/auth/AuthPage';
import { changeLanguage } from './utils/translateUtils';
import { t, isHandTranslated } from './utils/translations';
import { navItemFor } from './navigation';
import { cx } from './components/ui';
import { LivingBackground } from './components/LivingBackground';
import { useMovingBackground } from './lib/motion';
import { CommandPalette, usePaletteShortcut, type PaletteItem } from './components/CommandPalette';
import { requestAction } from './lib/actions';
import './lib/install'; // catches the browser's "add to home screen" offer as early as possible
import {
  Phone, Siren, MapPin, Home as HomeIcon, MessageCircle, Users, Settings as SettingsIcon, Wind, NotebookPen, Waves, PenSquare,
  CalendarHeart, HeartPulse, Smile, Moon, Sun, Globe, HelpCircle, LogOut, Sparkles, ShieldCheck,
} from 'lucide-react';
import type { TherapistProfile } from './therapist/types';
import { isRemote } from './lib/supabase';
import { signOut } from './lib/db/clientApi';
import { useRemoteSession, useProfileSync, useLocationRequests, PasswordRecoveryModal } from './lib/remoteHooks';
import { useIncident } from './lib/useIncident';
import { ActiveAlertBanner } from './components/ems/EmergencyPanel';
import { STARTER_PROFILE } from './components/auth/AuthPage';
import { RibbonMark } from './components/RibbonMark';
import { BackToTop } from './components/BackToTop';
import { AppErrorBoundary } from './components/AppErrorBoundary';

// Loaded when first opened, so the app starts fast on a phone. Home and Instant EMS
// stay in the first download (EMS must open even on a weak connection).
const named = <T extends Record<string, any>, K extends keyof T>(load: () => Promise<T>, key: K) =>
  lazy(() => load().then(m => ({ default: m[key] as React.ComponentType<any> })));
const OnboardingFlow = named(() => import('./components/OnboardingFlow'), 'OnboardingFlow');
const AiTherapyTab = named(() => import('./components/tabs/AiTherapyTab'), 'AiTherapyTab');
const CommunityVillageTab = named(() => import('./components/tabs/CommunityVillageTab'), 'CommunityVillageTab');
const SettingsProfileTab = named(() => import('./components/tabs/SettingsProfileTab'), 'SettingsProfileTab');
const TherapistApp = named(() => import('./therapist/TherapistApp'), 'TherapistApp');

/** Shown for the moment a page is loading */
const PageLoading = () => (
  <div role="status" aria-busy="true" aria-label="Loading" className="space-y-3 py-2">
    <div className="h-7 w-2/5 animate-pulse rounded-lg bg-muted" />
    <div className="h-24 animate-pulse rounded-xl bg-muted" />
    <div className="h-24 animate-pulse rounded-xl bg-muted" />
  </div>
);
import { ConnectionStatus } from './components/ConnectionStatus';
import { WelcomeTour, isWelcomePending, clearWelcomePending } from './components/WelcomeTour';

const INITIAL_PROFILE: UserProfile = {
  id: 'usr_demo_1',
  name: 'Kwame Mensah',
  nickname: 'SoberWarrior_GH',
  userAvatar: '🌱',
  aiAvatar: '🌿',
  aiName: '4Life',
  pinCode: '1234',
  pin: '1234',
  age: 19,
  region: 'Greater Accra',
  belief: 'theist',
  religion: 'christianity',
  religionType: 'Christian',
  language: 'en',
  theme: 'light',
  fontSize: 'md',
  currentTriage: 'substance',
  sobrietyStreakDays: 12,
  hr: 74,
  watchConnected: true,
  adBlockCount: 342,
  nsfwBlockCount: 18,
  shieldingActive: true,
  customBlockedUrls: ['adult-trigger-hub.com', 'endless-doomscroll.xyz', 'obscure-leak-mirror.net'],
  permBrowserBlock: true,
  permAds: true,
  windDownActive: false,
  sleepStart: '22:30',
  wakeTime: '06:30',
  reminderTime: '18:00',
  calmTriggers: ['4-7-8 Deep Breathing', 'Rainforest Soundscape', 'Calling a Trusted Friend', 'Praying or Serenity Reflection'],
  currentMood: 'recovering',
  currentCraving: 3,
  completedCheckinsCount: 24,
  mindfulnessMinutes: 45,
  calmingGamesPlayed: 6,
  xpPoints: 3450,
  shareLocationInCrisis: true,
  contacts: [
    {
      id: 'c1',
      name: 'Sister Mary (Support)',
      phone: '+233 24 456 7890',
      email: 'mary.support@familycare.org',
      relationship: 'Sibling / Accountability Mentor',
      isPrimary: true,
      autoDailyCheckin: true,
      autoPromptEnabled: true,
    },
    {
      id: 'c2',
      name: 'Mentor Kofi (Recovery Guide)',
      phone: '+233 20 876 5432',
      email: 'kofi.mentor@recoveryghana.org',
      relationship: 'Peer Mentor',
      isPrimary: false,
      autoDailyCheckin: true,
      autoPromptEnabled: true,
    },
  ],
};

const readStored = (key: string) => {
  try {
    return typeof window !== 'undefined' ? localStorage.getItem(key) : null;
  } catch {
    return null;
  }
};

export default function App() {
  const [profile, setProfile] = useState<UserProfile>(() => ({
    ...INITIAL_PROFILE,
    language: readStored('4life_user_language') || INITIAL_PROFILE.language || 'en',
    theme: (readStored('4life_user_theme') as 'light' | 'dark') || INITIAL_PROFILE.theme || 'light',
  }));
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  // Set when a therapist is signed in; they get their own workspace
  const [therapist, setTherapist] = useState<TherapistProfile | null>(null);
  const [isOnboarded, setIsOnboarded] = useState<boolean>(true);
  const [activeTab, setActiveTab] = useState<ActiveTab>('dashboard');

  // Navigation layout state
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(false);
  const [isOpenMobileSidebar, setIsOpenMobileSidebar] = useState<boolean>(false);

  // Modals
  const [isSosOpen, setIsSosOpen] = useState<boolean>(false);
  const [isCalmOpen, setIsCalmOpen] = useState<boolean>(false);
  const [isFeedbackOpen, setIsFeedbackOpen] = useState<boolean>(false);
  const [isLangModalOpen, setIsLangModalOpen] = useState<boolean>(false);
  // The welcome tour shows once, the first time a new account opens the app
  const [showWelcome, setShowWelcome] = useState<boolean>(false);
  useEffect(() => {
    if (isAuthenticated && isWelcomePending()) setShowWelcome(true);
  }, [isAuthenticated]);
  const finishWelcome = useCallback(() => {
    clearWelcomePending();
    setShowWelcome(false);
    window.scrollTo({ top: 0 });
  }, []);
  const [selectedCounselor, setSelectedCounselor] = useState<CounselorMatch | null>(null);
  const [isPaletteOpen, setIsPaletteOpen] = useState<boolean>(false);

  const isDarkMode = profile.theme === 'dark';
  const [movingBg, setMovingBg] = useMovingBackground();

  // Theme: one class on <html>; colours come from the CSS tokens
  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('dark', isDarkMode);
    root.classList.toggle('light', !isDarkMode);
    document.body.style.backgroundColor = '';
    document.body.style.color = '';
    try {
      localStorage.setItem('4life_user_theme', profile.theme || 'light');
    } catch {}
  }, [isDarkMode, profile.theme]);

  // Text size setting scales every rem-based size in the app
  useEffect(() => {
    const root = document.documentElement;
    ['sm', 'md', 'lg', 'xl'].forEach(s => root.classList.remove(`text-size-${s}`));
    root.classList.add(`text-size-${profile.fontSize || 'md'}`);
  }, [profile.fontSize]);

  // Keep the language in sync with Google Translate and local storage
  useEffect(() => {
    if (profile.language) {
      try {
        localStorage.setItem('4life_user_language', profile.language);
      } catch {}
      changeLanguage(profile.language);
    }

    const handleLanguageChanged = (e: any) => {
      const code = e?.detail;
      if (code && code !== profile.language) {
        setProfile(p => ({ ...p, language: code }));
      }
    };

    window.addEventListener('4life-language-changed', handleLanguageChanged);
    return () => window.removeEventListener('4life-language-changed', handleLanguageChanged);
  }, [profile.language]);

  const navigate = useCallback((tab: ActiveTab) => {
    setActiveTab(tab);
    setIsOpenMobileSidebar(false);
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, []);

  // Home-screen shortcuts open the app with ?go=sos, ?go=ems or ?go=craving
  useEffect(() => {
    if (!isAuthenticated || therapist) return;
    const params = new URLSearchParams(window.location.search);
    const go = params.get('go');
    if (!go) return;
    if (go === 'sos') setIsSosOpen(true);
    else if (go === 'ems') navigate('emergency_map');
    else if (go === 'craving') {
      navigate('chat');
      requestAction('craving');
    }
    params.delete('go');
    const rest = params.toString();
    window.history.replaceState(null, '', window.location.pathname + (rest ? `?${rest}` : '') + window.location.hash);
  }, [isAuthenticated, therapist, navigate]);

  const handleLogout = () => {
    try {
      localStorage.removeItem('4life_current_user_id');
    } catch {}
    if (isRemote) signOut();
    setIsAuthenticated(false);
  };

  // Supabase: restore the saved session, keep the profile saved, answer location requests
  const session = useRemoteSession({
    base: { ...STARTER_PROFILE, theme: profile.theme, language: profile.language },
    onClient: p => {
      setProfile(p);
      setIsAuthenticated(true);
    },
    onTherapist: t => setTherapist(t),
    onSignedOut: () => {
      setIsAuthenticated(false);
      setTherapist(null);
    },
  });
  const profileSync = useProfileSync(profile, isAuthenticated);
  useLocationRequests(profile, isAuthenticated);
  const incident = useIncident(profile, isAuthenticated);

  const handleOnboardingComplete = (_selectedTriage?: TriageCategory, directAction?: string) => {
    setIsOnboarded(true);
    if (directAction === 'chat' || directAction === 'community' || directAction === 'emergency_map') navigate(directAction);
    else navigate('dashboard');
  };

  const handleRestartOnboarding = () => setIsOnboarded(false);

  const handleHeartRateCalmed = (newHr: number) => {
    const todayStr = new Date().toISOString().split('T')[0];
    setProfile(prev => {
      const currentRewards =
        prev.dailyRewardsClaimed?.date === todayStr ? prev.dailyRewardsClaimed : { date: todayStr, login: false, checkin: false, calm: false };

      return {
        ...prev,
        hr: newHr,
        currentCraving: Math.max(1, prev.currentCraving - 1),
        mindfulnessMinutes: (prev.mindfulnessMinutes || 0) + 3,
        dailyRewardsClaimed: { ...currentRewards, date: todayStr, calm: true },
      };
    });
  };

  // Theme switch cross-fades where the browser supports it (View Transitions)
  const toggleTheme = () => {
    const next = profile.theme === 'dark' ? 'light' : 'dark';
    const apply = () => {
      document.documentElement.classList.toggle('dark', next === 'dark');
      document.documentElement.classList.toggle('light', next !== 'dark');
      flushSync(() => setProfile(p => ({ ...p, theme: next })));
    };
    const doc = document as Document & { startViewTransition?: (cb: () => void) => unknown };
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (doc.startViewTransition && !reduce) doc.startViewTransition(apply);
    else apply();
  };

  // Quick search (Ctrl/⌘ K): everything in one place, help first
  const openPalette = useCallback(() => setIsPaletteOpen(true), []);
  usePaletteShortcut(openPalette, isAuthenticated && !therapist && isOnboarded);
  const goAndDo = (tab: ActiveTab, action?: Parameters<typeof requestAction>[0], text?: string) => {
    navigate(tab);
    if (action) requestAction(action, text);
  };
  const paletteItems: PaletteItem[] = useMemo(() => {
    const ic = 'h-5 w-5';
    const help = 'Get help now';
    const go = 'Go to';
    const doIt = 'Things you can do';
    const prefs = 'Settings';
    return [
      { id: 'call112', group: help, tone: 'danger', label: 'Call 112: free, 24 hours', hint: 'Emergency', icon: <Phone className={ic} />, keywords: 'emergency ambulance police danger crisis unsafe hurt suicide overdose 193', run: () => { window.location.href = 'tel:112'; } },
      { id: 'sos', group: help, tone: 'danger', label: 'SOS: alert my support person', hint: 'Sends your location', icon: <Siren className={ic} />, keywords: 'help contact sister family text location panic', run: () => setIsSosOpen(true) },
      { id: 'plan', group: help, label: 'My safety plan', hint: 'Instant EMS', icon: <ShieldCheck className={ic} />, keywords: 'plan warning signs reasons safe places people to call', run: () => goAndDo('emergency_map', 'safety-plan') },
      { id: 'firstaid', group: help, label: 'First aid: overdose, CPR, choking…', hint: 'Steps and videos', icon: <HeartPulse className={ic} />, keywords: 'first aid cpr choking bleeding burn seizure fit faint overdose drunk alcohol video youtube', run: () => goAndDo('emergency_map', 'first-aid') },
      { id: 'nearest', group: help, label: 'Find the nearest hospital or help', hint: 'Instant EMS', icon: <MapPin className={ic} />, keywords: 'map hospital clinic ems near rehab ambulance', run: () => navigate('emergency_map') },
      { id: 'craving', group: doIt, label: 'Ride out a craving', hint: 'AI CBT therapy', icon: <Waves className={ic} />, keywords: 'urge crave drink alcohol smoke weed drugs relapse want to use tempted', run: () => goAndDo('chat', 'craving') },
      { id: 'breathe', group: doIt, label: 'Breathe with me', hint: '2 minutes', icon: <Wind className={ic} />, keywords: 'calm anxious anxiety panic stress breathe relax heart', run: () => setIsCalmOpen(true) },
      { id: 'record', group: doIt, label: 'Start a thought record', hint: 'CBT', icon: <NotebookPen className={ic} />, keywords: 'cbt thought negative reframe worry journal write', run: () => goAndDo('chat', 'thought-record') },
      { id: 'checkin', group: doIt, label: 'Check in: how am I today?', hint: 'Home', icon: <Smile className={ic} />, keywords: 'mood feeling craving log diary', run: () => goAndDo('dashboard', 'checkin') },
      { id: 'post', group: doIt, label: 'Write a Village post', hint: 'Anonymous', icon: <PenSquare className={ic} />, keywords: 'new share story post forum community write', run: () => goAndDo('community', 'new-post') },
      { id: 'circles', group: doIt, label: 'Join a group circle', hint: 'Global Village', icon: <CalendarHeart className={ic} />, keywords: 'group meeting circle support peers', run: () => goAndDo('community', 'circles') },
      { id: 'home', group: go, label: 'Home', icon: <HomeIcon className={ic} />, keywords: 'dashboard streak start', run: () => navigate('dashboard') },
      { id: 'chat', group: go, label: 'AI CBT therapy', icon: <MessageCircle className={ic} />, keywords: 'chat talk ai therapist cbt counsellor', run: () => navigate('chat') },
      { id: 'village', group: go, label: 'Global Village', icon: <Users className={ic} />, keywords: 'community friends forum people peers', run: () => navigate('community') },
      { id: 'ems', group: go, label: 'Instant EMS', icon: <Siren className={ic} />, keywords: 'emergency map hotlines', run: () => navigate('emergency_map') },
      { id: 'settings', group: go, label: 'Settings and profile', icon: <SettingsIcon className={ic} />, keywords: 'account contacts privacy text size', run: () => navigate('profile_settings') },
      { id: 'theme', group: prefs, label: isDarkMode ? 'Switch to light theme' : 'Switch to dark theme', icon: isDarkMode ? <Sun className={ic} /> : <Moon className={ic} />, keywords: 'theme night dark light mode', run: toggleTheme },
      { id: 'lang', group: prefs, label: 'Change language', icon: <Globe className={ic} />, keywords: 'twi ga ewe hausa dagbani french translate', run: () => setIsLangModalOpen(true) },
      { id: 'tour', group: prefs, label: 'Show the welcome tour', icon: <Sparkles className={ic} />, keywords: 'welcome intro tour help start onboarding', run: () => setShowWelcome(true) },
      { id: 'motion', group: prefs, label: movingBg ? 'Turn off the moving background' : 'Turn on the moving background', icon: <Sparkles className={ic} />, keywords: 'animation ribbon motion battery', run: () => setMovingBg(!movingBg) },
      { id: 'feedback', group: prefs, label: 'Ask the developers', icon: <HelpCircle className={ic} />, keywords: 'feedback bug help question faq', run: () => setIsFeedbackOpen(true) },
      { id: 'logout', group: prefs, label: 'Log out', icon: <LogOut className={ic} />, keywords: 'sign out exit', run: handleLogout },
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDarkMode, movingBg, profile.theme]);

  if (session.checking) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-bg text-ink-2" aria-busy="true">
        <RibbonMark breathe className="h-16 w-10" />
        <p role="status" className="m-0 flex items-center gap-3 text-base font-semibold">
          Opening <span translate="no">4Life</span>
          <span className="dot-pulse inline-flex items-center gap-1" aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
        </p>
      </div>
    );
  }

  if (therapist) {
    return (
      <>
      <PasswordRecoveryModal isOpen={session.passwordRecovery} onClose={session.closePasswordRecovery} />
      <Suspense fallback={<div className="mx-auto max-w-3xl p-6"><PageLoading /></div>}>
      <TherapistApp
        therapist={therapist}
        setTherapist={setTherapist}
        isDark={isDarkMode}
        onToggleTheme={toggleTheme}
        onLogout={() => {
          if (isRemote) signOut();
          setTherapist(null);
          window.scrollTo({ top: 0 });
        }}
      />
      </Suspense>
      </>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="flex min-h-screen flex-col bg-bg text-ink">
        <AuthPage
          onLoginSuccess={newProfile => {
            const chosenLang = profile.language || readStored('4life_user_language') || 'en';
            const chosenTheme = profile.theme || (readStored('4life_user_theme') as 'light' | 'dark') || 'light';
            setProfile({ ...newProfile, language: chosenLang, theme: chosenTheme });
            setIsAuthenticated(true);
            setActiveTab('dashboard');
            window.scrollTo({ top: 0 });
          }}
          currentTheme={profile.theme || 'light'}
          onToggleTheme={toggleTheme}
          currentLanguage={profile.language || 'en'}
          onChangeLanguage={lang => setProfile(p => ({ ...p, language: lang }))}
          initialError={session.linkError}
          onTherapistLogin={t => {
            setTherapist(t);
            window.scrollTo({ top: 0 });
          }}
        />
        <PasswordRecoveryModal isOpen={session.passwordRecovery} onClose={session.closePasswordRecovery} />
        <ConnectionStatus />
      </div>
    );
  }

  const nav = navItemFor(activeTab);
  const pageTitle = t(nav.labelKey, profile.language);
  const pageSubtitle = t(nav.subtitleKey, profile.language);

  return (
    <div className="relative isolate min-h-screen bg-bg text-ink">
      {/* Living background: calm on the emergency screen, in a crisis, or if switched off */}
      <LivingBackground
        fixed
        isDark={isDarkMode}
        density={0.5}
        still={!movingBg || activeTab === 'emergency_map' || isSosOpen}
        zoneSelector="#main-content"
      />
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded-xl focus:bg-surface focus:px-4 focus:py-3 focus:font-bold focus:text-ink focus:shadow-xl"
      >
        Skip to content
      </a>

      {!isOnboarded ? (
        <div className="flex min-h-screen items-center justify-center p-3 sm:p-6 md:p-10">
          <Suspense fallback={<div className="w-full max-w-2xl"><PageLoading /></div>}>
            <OnboardingFlow profile={profile} setProfile={setProfile} onComplete={handleOnboardingComplete} />
          </Suspense>
        </div>
      ) : (
        <div className="flex min-h-screen">
          <Sidebar
            activeTab={activeTab}
            onNavigate={navigate}
            isCollapsed={isSidebarCollapsed}
            onToggleCollapsed={() => setIsSidebarCollapsed(c => !c)}
            isOpenMobile={isOpenMobileSidebar}
            onCloseMobile={() => setIsOpenMobileSidebar(false)}
            profile={profile}
            onOpenSos={() => setIsSosOpen(true)}
            onOpenSearch={openPalette}
            onOpenCalm={() => setIsCalmOpen(true)}
          />

          <div className={cx('flex min-w-0 flex-1 flex-col transition-[padding] duration-300', isSidebarCollapsed ? 'lg:pl-20' : 'lg:pl-[272px]')}>
            <TopBar
              title={pageTitle}
              shortTitle={profile.language && profile.language !== 'en' ? undefined : nav.id === 'chat' ? 'AI Therapy' : nav.id === 'community' ? 'Village' : undefined}
              subtitle={pageSubtitle}
              titleTranslate={isHandTranslated(nav.labelKey, profile.language) ? 'no' : undefined}
              subtitleTranslate={isHandTranslated(nav.subtitleKey, profile.language) ? 'no' : undefined}
              profile={profile}
              onOpenMenu={() => setIsOpenMobileSidebar(true)}
              onOpenLanguage={() => setIsLangModalOpen(true)}
              onOpenCalm={() => setIsCalmOpen(true)}
              onOpenSos={() => setIsSosOpen(true)}
              onOpenSettings={() => navigate('profile_settings')}
              onOpenFeedback={() => setIsFeedbackOpen(true)}
              onToggleTheme={toggleTheme}
              onLogout={handleLogout}
              onOpenSearch={openPalette}
            />

            {/* Shown only when the app is translated, with a quick way back to English */}
            <GoogleTranslateBar profile={profile} setProfile={setProfile} onOpenLanguageTab={() => setIsLangModalOpen(true)} />

            <main id="main-content" tabIndex={-1} className="mx-auto w-full max-w-[1180px] flex-1 px-4 pb-28 pt-6 outline-none sm:px-6 sm:pt-8 lg:px-10 lg:pb-16">
              <ActiveAlertBanner view={incident.view} onOpen={() => setIsSosOpen(true)} />
              {/* each page fades in gently when you open it */}
              <div key={activeTab} className="page-in">
              <AppErrorBoundary inline>
              <Suspense fallback={<PageLoading />}>
              {activeTab === 'dashboard' && (
                <DashboardTab
                  profile={profile}
                  setProfile={setProfile}
                  onNavigate={navigate}
                  onOpenCalm={() => setIsCalmOpen(true)}
                  onOpenCounselor={c => setSelectedCounselor(c)}
                  onOpenSos={() => setIsSosOpen(true)}
                />
              )}

              {activeTab === 'chat' && (
                <AiTherapyTab key={profile.id} profile={profile} setProfile={setProfile} onOpenSos={() => setIsSosOpen(true)} onOpenCalm={() => setIsCalmOpen(true)} />
              )}

              {activeTab === 'community' && (
                <CommunityVillageTab key={profile.id} profile={profile} onOpenSos={() => setIsSosOpen(true)} onNavigate={navigate} onOpenCounselor={c => setSelectedCounselor(c)} />
              )}

              {activeTab === 'emergency_map' && (
                <EmergencyMapTab profile={profile} onOpenSos={() => setIsSosOpen(true)} onOpenCalm={() => setIsCalmOpen(true)} onNavigate={navigate} />
              )}

              {activeTab === 'profile_settings' && (
                <SettingsProfileTab
                  profile={profile}
                  setProfile={setProfile}
                  onRestartOnboarding={handleRestartOnboarding}
                  onLogout={handleLogout}
                  onOpenLanguage={() => setIsLangModalOpen(true)}
                />
              )}
              </Suspense>
              </AppErrorBoundary>
              </div>

              <footer className="mt-12 flex flex-col gap-2 border-t border-line pt-6 text-sm text-ink-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="m-0 flex items-center gap-2">
                  <RibbonMark className="h-6 w-4" label="Green ribbon: mental health awareness" />
                  <span>4Life · Mental health matters · Confidential and non-judgmental</span>
                </p>
                <p className="m-0 flex flex-wrap items-center gap-x-4 gap-y-1">
                  <span>
                    In crisis? Call <a href="tel:112" className="font-bold text-ink">112</a> or <a href="tel:193" className="font-bold text-ink">193</a> (ambulance)
                  </span>
                  <button type="button" onClick={() => setIsFeedbackOpen(true)} className="min-h-11 font-semibold text-pri-text hover:underline cursor-pointer">
                    Ask the developers
                  </button>
                </p>
              </footer>
            </main>
          </div>

          <BottomNav activeTab={activeTab} onNavigate={navigate} onOpenMore={() => setIsOpenMobileSidebar(true)} />
        </div>
      )}

      {/* Global modals */}
      <CommandPalette
        open={isPaletteOpen}
        onClose={() => setIsPaletteOpen(false)}
        items={paletteItems}
        placeholder="Search, or type how you feel…"
        onAsk={text => goAndDo('chat', 'ask', text)}
        footer={
          <a href="tel:112" className="font-bold text-danger-text no-underline hover:underline">
            In danger? Call 112
          </a>
        }
      />
      <SosModal
        profile={profile}
        controller={incident.controller}
        view={incident.view}
        isOpen={isSosOpen}
        onClose={() => setIsSosOpen(false)}
        onOpenCalm={() => {
          setIsSosOpen(false);
          setIsCalmOpen(true);
        }}
        onOpenChat={() => {
          setIsSosOpen(false);
          navigate('chat');
        }}
        onOpenSafetyPlan={() => {
          setIsSosOpen(false);
          goAndDo('emergency_map', 'safety-plan');
        }}
        onOpenHelpNearby={() => {
          setIsSosOpen(false);
          navigate('emergency_map');
        }}
      />

      <CounselorModal counselor={selectedCounselor} isOpen={!!selectedCounselor} onClose={() => setSelectedCounselor(null)} profile={profile} />

      <BreathingCalmModal isOpen={isCalmOpen} onClose={() => setIsCalmOpen(false)} onHeartRateCalmed={handleHeartRateCalmed} />

      <DeveloperFeedbackModal isOpen={isFeedbackOpen} onClose={() => setIsFeedbackOpen(false)} profile={profile} />

      <PasswordRecoveryModal isOpen={session.passwordRecovery} onClose={session.closePasswordRecovery} />
      {profileSync.error && (
        <div role="alert" className="fixed inset-x-4 bottom-24 z-[60] mx-auto flex max-w-xl items-center gap-3 rounded-xl bg-warn-soft px-4 py-3 text-[0.9375rem] text-warn shadow-xl lg:bottom-6">
          <p className="m-0 min-w-0 flex-1">
            <strong>Not saved.</strong> {profileSync.error}
          </p>
          <button type="button" onClick={profileSync.clearError} className="min-h-10 rounded-lg px-3 font-bold underline cursor-pointer">
            Dismiss
          </button>
        </div>
      )}
      <LanguageSwitcherModal isOpen={isLangModalOpen} onClose={() => setIsLangModalOpen(false)} profile={profile} setProfile={setProfile} />
      <ConnectionStatus />
      <BackToTop hidden={!isOnboarded || isSosOpen || showWelcome || activeTab === 'chat' || activeTab === 'emergency_map'} />
      {showWelcome && (
        <WelcomeTour
          name={profile.name}
          language={profile.language || 'en'}
          onChangeLanguage={lang => setProfile(p => ({ ...p, language: lang }))}
          onDone={finishWelcome}
        />
      )}
    </div>
  );
}
