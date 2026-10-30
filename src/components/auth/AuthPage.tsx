import { markWelcomePending } from '../WelcomeTour';
import React, { useState } from 'react';
import { UserProfile, TriageCategory, BeliefSystem, AuthAccount } from '../../types';
import { 
  Shield, Lock, Mail, User, Eye, EyeOff, Sparkles, CheckCircle2, 
  ArrowRight, KeyRound, HelpCircle, Heart, Waves, Zap, Phone,
  Sun, Moon, Globe, AlertCircle, ShieldCheck, ArrowLeft, Check
} from 'lucide-react';
import { WORLD_LANGUAGES } from '../../data/religionsData';
import { changeLanguage } from '../../utils/translateUtils';
import { Field, inputClass, cx } from '../ui';
import { TherapistAuth } from '../../therapist/TherapistAuth';
import { AuthShell } from './AuthShell';
import { ResendConfirmation, needsNewLink } from './ResendConfirmation';
import { db, friendlyError, isRemote } from '../../lib/supabase';
import * as clientApi from '../../lib/db/clientApi';
import { loadTherapistProfile } from '../../lib/db/therapistApi';

/** Neutral starting values for a new or freshly loaded account. */
export const STARTER_PROFILE: UserProfile = {
  name: '',
  nickname: '',
  age: '',
  region: 'Greater Accra',
  belief: 'theist',
  language: 'en',
  theme: 'light',
  fontSize: 'md',
  currentTriage: 'general',
  sobrietyStreakDays: 0,
  hr: 75,
  watchConnected: false,
  adBlockCount: 0,
  nsfwBlockCount: 0,
  shieldingActive: true,
  customBlockedUrls: [],
  permBrowserBlock: true,
  permAds: true,
  windDownActive: false,
  sleepStart: '22:30',
  wakeTime: '06:30',
  reminderTime: '18:00',
  calmTriggers: ['4-7-8 Deep Breathing'],
  currentMood: 'okay',
  currentCraving: 3,
  completedCheckinsCount: 0,
  mindfulnessMinutes: 0,
  calmingGamesPlayed: 0,
  xpPoints: 0,
  userAvatar: '🌱',
  aiAvatar: '🌿',
  aiName: '4Life',
  contacts: [],
};

/** With Supabase, accounts use a password; on this device only, a short PIN. */
const SECRET = isRemote ? 'password' : 'PIN';
import type { TherapistProfile } from '../../therapist/types';
import { Stethoscope } from 'lucide-react';

interface AuthPageProps {
  onLoginSuccess: (profile: UserProfile) => void;
  currentTheme: 'light' | 'dark';
  onToggleTheme: () => void;
  currentLanguage: string;
  onChangeLanguage: (lang: string) => void;
  /** Called when a therapist signs in or finishes signing up */
  onTherapistLogin?: (t: TherapistProfile) => void;
  /** A problem to show straight away, such as an expired email link */
  initialError?: string;
}

const DEMO_ACCOUNTS: AuthAccount[] = [
  {
    id: 'usr_demo_1',
    email: 'kwame@4life.org',
    pin: '1234',
    name: 'Kwame Mensah',
    nickname: 'SoberWarrior_GH',
    createdAt: '2026-01-10',
    profile: {
      id: 'usr_demo_1',
      name: 'Kwame Mensah',
      nickname: 'SoberWarrior_GH',
      email: 'kwame@4life.org',
      pin: '1234',
      pinCode: '1234',
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
      userAvatar: '🌱',
      aiAvatar: '🌿',
      aiName: '4Life',
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
    },
  },
  {
    id: 'usr_demo_2',
    email: 'ama@4life.org',
    pin: '1234',
    name: 'Ama Serwaa',
    nickname: 'FocusPioneer_Ama',
    createdAt: '2026-02-01',
    profile: {
      id: 'usr_demo_2',
      name: 'Ama Serwaa',
      nickname: 'FocusPioneer_Ama',
      email: 'ama@4life.org',
      pin: '1234',
      pinCode: '1234',
      age: 22,
      region: 'Ashanti',
      belief: 'secular',
      religion: 'Secular / Agnostic',
      religionType: 'Secular / Agnostic',
      language: 'en',
      theme: 'light',
      fontSize: 'md',
      currentTriage: 'social_media',
      sobrietyStreakDays: 28,
      hr: 68,
      watchConnected: false,
      adBlockCount: 719,
      nsfwBlockCount: 42,
      shieldingActive: true,
      customBlockedUrls: ['tiktok.com', 'instagram.com/reels', 'doomscroll-feeds.com'],
      permBrowserBlock: true,
      permAds: true,
      windDownActive: true,
      sleepStart: '23:00',
      wakeTime: '07:00',
      reminderTime: '19:00',
      calmTriggers: ['Box Breathing', 'Digital Fasting Walk', 'Journaling'],
      currentMood: 'empowered',
      currentCraving: 2,
      completedCheckinsCount: 56,
      mindfulnessMinutes: 120,
      calmingGamesPlayed: 14,
      xpPoints: 5820,
      shareLocationInCrisis: true,
      userAvatar: '🌸',
      aiAvatar: '🌿',
      aiName: 'Gemini Recovery Guide',
      contacts: [
        {
          id: 'c_ama_1',
          name: 'Dr. Evelyn Mensah',
          phone: '+233 50 123 4567',
          email: 'evelyn@clinicalcare.org',
          relationship: 'Therapist',
          isPrimary: true,
        }
      ],
    },
  },
];

export const AuthPage: React.FC<AuthPageProps> = ({
  onLoginSuccess,
  currentTheme,
  onToggleTheme,
  currentLanguage,
  onChangeLanguage,
  onTherapistLogin,
  initialError,
}) => {
  // Who is signing in: a person in recovery, or a therapist
  const [role, setRole] = useState<'client' | 'therapist'>('client');
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');
  
  // Login Form States
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPin, setLoginPin] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [showLoginPin, setShowLoginPin] = useState(false);
  const [loginError, setLoginError] = useState(initialError || '');

  // Signup Form States
  const [signupName, setSignupName] = useState('');
  const [signupNickname, setSignupNickname] = useState('');
  const [signupEmail, setSignupEmail] = useState('');
  const [signupPin, setSignupPin] = useState('');
  const [signupConfirmPin, setSignupConfirmPin] = useState('');
  const [showSignupPin, setShowSignupPin] = useState(false);
  const [signupTriage, setSignupTriage] = useState<TriageCategory>('substance');
  const [signupBelief, setSignupBelief] = useState<BeliefSystem>('theist');
  const [signupReligionType, setSignupReligionType] = useState<'Christian' | 'Muslim' | 'Traditional' | 'Secular / Agnostic' | 'Other'>('Christian');
  const [emergencyEmail, setEmergencyEmail] = useState('');
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [signupError, setSignupError] = useState('');
  // Sign-up is split into three short steps instead of one long form
  const [signupStep, setSignupStep] = useState<1 | 2 | 3 | 4>(1);

  // Forgot PIN Modal
  const [forgotModalOpen, setForgotModalOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotSuccess, setForgotSuccess] = useState('');

  const isDark = currentTheme === 'dark';

  // Load saved accounts from localStorage or initialize with defaults
  const getSavedAccounts = (): AuthAccount[] => {
    try {
      const stored = localStorage.getItem('4life_auth_accounts');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
    } catch (e) {
      console.warn('Could not read saved accounts:', e);
    }
    return DEMO_ACCOUNTS;
  };

  const saveAccounts = (accounts: AuthAccount[]) => {
    try {
      localStorage.setItem('4life_auth_accounts', JSON.stringify(accounts));
    } catch (e) {
      console.warn('Could not save accounts:', e);
    }
  };

  // Handle Login Submit
  const [authBusy, setAuthBusy] = useState(false);
  const [confirmSent, setConfirmSent] = useState('');

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');

    const cleanEmail = loginEmail.trim().toLowerCase();
    const cleanPin = loginPin.trim();

    if (isRemote) {
      if (!cleanEmail.includes('@') || !cleanPin) {
        setLoginError('Please enter your email address and password.');
        return;
      }
      setAuthBusy(true);
      try {
        const user = await clientApi.signIn(cleanEmail, cleanPin);
        if (user.role === 'therapist') {
          if (onTherapistLogin) onTherapistLogin(await loadTherapistProfile(user.id));
          return;
        }
        const loaded = await clientApi.loadClientProfile(user.id, { ...STARTER_PROFILE, theme: currentTheme, language: currentLanguage });
        onLoginSuccess(loaded);
      } catch (err) {
        setLoginError(friendlyError(err));
      } finally {
        setAuthBusy(false);
      }
      return;
    }

    if (!cleanEmail) {
      setLoginError('Please enter your email or recovery username.');
      return;
    }

    if (!cleanPin) {
      setLoginError('Please enter your 4-digit security PIN or password.');
      return;
    }

    const accounts = getSavedAccounts();
    const found = accounts.find(
      acc => acc.email.toLowerCase() === cleanEmail || acc.nickname.toLowerCase() === cleanEmail
    );

    if (!found) {
      setLoginError('No recovery account found with this email or username. You can sign up or try demo credentials.');
      return;
    }

    if (found.pin !== cleanPin && found.password !== cleanPin) {
      setLoginError('Incorrect Security PIN. If forgotten, click "Reset PIN" below or try default PIN "1234".');
      return;
    }

    // Success
    const activeProfile: UserProfile = {
      ...found.profile,
      theme: currentTheme,
      language: currentLanguage,
    };

    if (rememberMe) {
      try {
        localStorage.setItem('4life_current_user_id', found.id);
      } catch {}
    }

    onLoginSuccess(activeProfile);
  };

  // Handle Quick Demo Login
  const handleQuickLogin = (demo: AuthAccount) => {
    setLoginError('');
    const activeProfile: UserProfile = {
      ...demo.profile,
      theme: currentTheme,
      language: currentLanguage,
    };
    onLoginSuccess(activeProfile);
  };

  // Handle Guest Mode
  const handleGuestLogin = () => {
    const guestId = 'guest_' + Math.floor(1000 + Math.random() * 9000);
    const guestProfile: UserProfile = {
      id: guestId,
      name: 'Sanctuary Guest',
      nickname: `Guest_${guestId.slice(-4)}`,
      email: `${guestId}@sanctuary.local`,
      isGuest: true,
      age: 20,
      region: 'Greater Accra',
      belief: 'theist',
      religionType: 'Christian',
      language: currentLanguage,
      theme: currentTheme,
      fontSize: 'md',
      currentTriage: 'substance',
      sobrietyStreakDays: 1,
      hr: 72,
      watchConnected: false,
      adBlockCount: 0,
      nsfwBlockCount: 0,
      shieldingActive: true,
      customBlockedUrls: ['adult-trigger-hub.com', 'endless-doomscroll.xyz'],
      permBrowserBlock: true,
      permAds: true,
      windDownActive: false,
      sleepStart: '22:30',
      wakeTime: '06:30',
      reminderTime: '18:00',
      calmTriggers: ['4-7-8 Deep Breathing', 'Rainforest Soundscape'],
      currentMood: 'hopeful',
      currentCraving: 3,
      completedCheckinsCount: 1,
      mindfulnessMinutes: 10,
      calmingGamesPlayed: 1,
      xpPoints: 100,
      userAvatar: '🌱',
      aiAvatar: '🌿',
      aiName: 'Gemini Recovery Guide',
      contacts: [],
    };

    onLoginSuccess(guestProfile);
  };

  // Sign-up checks, one group per step, so each mistake is shown on the step it belongs to
  const signupStepError = (step: 1 | 2 | 3 | 4): string => {
    if (step === 1) {
      if (!signupName.trim()) return 'Please enter your name, or a name you would like us to call you.';
      return '';
    }
    if (step === 2) {
      const emailClean = signupEmail.trim().toLowerCase();
      if (!emailClean || !emailClean.includes('@')) return 'Please enter a valid email address. We only use it to help you get back into your account.';
      if (!isRemote && getSavedAccounts().some(a => a.email.toLowerCase() === emailClean)) return 'An account with this email already exists. Please sign in instead.';
      const pinClean = signupPin.trim();
      if (isRemote && pinClean.length < 8) return 'Your password needs at least 8 characters.';
      if (!isRemote && (!pinClean || pinClean.length < 4)) return 'Your PIN needs at least 4 digits.';
      if (pinClean !== signupConfirmPin.trim()) return `The two ${SECRET}s do not match. Please type them again.`;
      return '';
    }
    if (step === 3) return '';
    if (!agreedToTerms) return 'Please tick the safe-space promise to continue.';
    return '';
  };

  const goToSignupStep = (step: 1 | 2 | 3 | 4) => {
    setSignupError('');
    setSignupStep(step);
  };

  const handleSignupNext = () => {
    const err = signupStepError(signupStep);
    if (err) {
      setSignupError(err);
      return;
    }
    goToSignupStep((signupStep + 1) as 1 | 2 | 3 | 4);
  };

  // Handle Sign Up Submit
  const handleSignupSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSignupError('');

    // Pressing Enter on steps 1 and 2 moves to the next step
    if (signupStep < 4) {
      handleSignupNext();
      return;
    }

    // Final check of every step; jump back to the first one that needs attention
    for (const step of [1, 2, 3, 4] as const) {
      const err = signupStepError(step);
      if (err) {
        setSignupStep(step);
        setSignupError(err);
        return;
      }
    }

    const emailClean = signupEmail.trim().toLowerCase();
    const pinClean = signupPin.trim();
    const existingAccounts = getSavedAccounts();

    const newId = 'usr_' + Date.now();
    const finalNickname = signupNickname.trim() || signupName.trim().split(' ')[0] + '_Warrior';

    const newProfile: UserProfile = {
      id: newId,
      name: signupName.trim(),
      nickname: finalNickname,
      email: emailClean,
      pin: pinClean,
      pinCode: pinClean,
      age: 20,
      region: 'Greater Accra',
      belief: signupBelief,
      religionType: signupReligionType,
      language: currentLanguage,
      theme: currentTheme,
      fontSize: 'md',
      currentTriage: signupTriage,
      sobrietyStreakDays: 1,
      hr: 75,
      watchConnected: false,
      adBlockCount: 0,
      nsfwBlockCount: 0,
      shieldingActive: true,
      customBlockedUrls: ['adult-trigger-hub.com', 'endless-doomscroll.xyz'],
      permBrowserBlock: true,
      permAds: true,
      windDownActive: false,
      sleepStart: '22:30',
      wakeTime: '06:30',
      reminderTime: '18:00',
      calmTriggers: ['4-7-8 Deep Breathing', 'Rainforest Soundscape'],
      currentMood: 'hopeful',
      currentCraving: 4,
      completedCheckinsCount: 1,
      mindfulnessMinutes: 5,
      calmingGamesPlayed: 0,
      xpPoints: 250,
      userAvatar: '🌱',
      aiAvatar: '🌿',
      aiName: 'Gemini Recovery Guide',
      contacts: emergencyEmail.trim() ? [
        {
          id: 'c_em_' + Date.now(),
          name: 'Primary Emergency Support',
          phone: '+233 24 000 0000',
          email: emergencyEmail.trim(),
          relationship: 'Emergency Contact',
          isPrimary: true,
          autoDailyCheckin: true,
          autoPromptEnabled: true,
        }
      ] : [],
    };

    if (isRemote) {
      setAuthBusy(true);
      try {
        const { userId, needsConfirmation } = await clientApi.signUpClient(emailClean, pinClean, {
          name: signupName.trim(),
          nickname: finalNickname,
          currentTriage: signupTriage,
          belief: signupBelief,
          religionType: signupReligionType,
          language: currentLanguage,
          theme: currentTheme,
          region: 'Greater Accra',
        });
        // Show the welcome tour the first time this new account opens the app
        markWelcomePending();
        if (needsConfirmation || !userId) {
          setConfirmSent(emailClean);
          return;
        }
        // The fake placeholder phone used on this device is never saved to the database
        onLoginSuccess(await clientApi.loadClientProfile(userId, { ...newProfile, contacts: [] }));
      } catch (err) {
        setSignupError(friendlyError(err));
        if (/community name/.test(friendlyError(err))) setSignupStep(1);
        else if (/email|password/i.test(friendlyError(err))) setSignupStep(2);
      } finally {
        setAuthBusy(false);
      }
      return;
    }

    const newAccount: AuthAccount = {
      id: newId,
      email: emailClean,
      pin: pinClean,
      name: signupName.trim(),
      nickname: finalNickname,
      profile: newProfile,
      createdAt: new Date().toISOString().split('T')[0],
    };

    const updatedList = [...existingAccounts, newAccount];
    saveAccounts(updatedList);

    try {
      localStorage.setItem('4life_current_user_id', newId);
    } catch {}

    markWelcomePending();
    onLoginSuccess(newProfile);
  };

  // Handle Forgot PIN / Reset
  const handleForgotSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setForgotSuccess('');
    const emailToReset = forgotEmail.trim().toLowerCase();
    if (isRemote) {
      if (!emailToReset.includes('@')) {
        setForgotSuccess('Please enter the email address you signed up with.');
        return;
      }
      const { error } = await db().auth.resetPasswordForEmail(emailToReset, { redirectTo: window.location.origin });
      setForgotSuccess(
        error ? friendlyError(error) : `If an account exists for ${emailToReset}, we have sent a link to set a new password. Check your email.`
      );
      return;
    }
    const accounts = getSavedAccounts();
    const found = accounts.find(a => a.email.toLowerCase() === emailToReset);

    if (found) {
      setForgotSuccess(`Account located! Your registered 4-Digit Security PIN is: "${found.pin}". You can now log in securely.`);
    } else {
      setForgotSuccess(`We could not find an account with "${emailToReset}". You can log in with demo account kwame@4life.org (PIN: 1234) or create a new account.`);
    }
  };

  const shellTitle =
    role === 'therapist' ? 'Therapist workspace' : authMode === 'login' ? 'Welcome back' : 'Create your account';
  const shellSubtitle =
    role === 'therapist'
      ? 'Sign in, or join in five short steps. New accounts are checked before clients can book.'
      : authMode === 'login'
        ? 'Sign in to AI therapy, the Global Village and Instant EMS.'
        : 'Four short steps. Only you — and a counsellor you choose — can see your information.';

  return (
    <>
    <AuthShell
      role={role}
      onRoleChange={onTherapistLogin ? setRole : undefined}
      isDark={isDark}
      onToggleTheme={onToggleTheme}
      language={currentLanguage}
      onChangeLanguage={code => {
        onChangeLanguage(code);
        changeLanguage(code);
      }}
      title={shellTitle}
      subtitle={shellSubtitle}
    >
      {role === 'therapist' && onTherapistLogin ? (
        <TherapistAuth
          onLogin={onTherapistLogin}
          onForgotPassword={email => {
            setForgotEmail(email);
            setForgotSuccess('');
            setForgotModalOpen(true);
          }}
        />
      ) : (
        <div>
          {/* Mode Switcher Tabs */}
          <div className="flex rounded-2xl bg-muted p-1.5 mb-6 border border-line lg:mb-4">
            <button
              type="button"
              onClick={() => {
                setAuthMode('login');
                setLoginError('');
              }}
              className={`flex-1 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center justify-center gap-2 cursor-pointer ${
                authMode === 'login'
                  ? 'bg-pri  text-[#fff] shadow-xs'
                  : 'text-ink-2  hover:text-ink '
              }`}
            >
              <KeyRound className="w-4 h-4" />
              <span>Sign In</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setAuthMode('signup');
                setSignupError('');
              }}
              className={`flex-1 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center justify-center gap-2 cursor-pointer ${
                authMode === 'signup'
                  ? 'bg-pri  text-[#fff] shadow-xs'
                  : 'text-ink-2  hover:text-ink '
              }`}
            >
              <User className="w-4 h-4" />
              <span>Create Account</span>
            </button>
          </div>

          {/* 1. LOGIN VIEW */}
          {authMode === 'login' && (
            <form onSubmit={handleLoginSubmit} className="space-y-4 lg:space-y-3">
              
              {loginError && (
                <div className="p-3.5 rounded-2xl bg-danger-soft border border-danger text-danger-text text-xs flex items-start gap-2.5 animate-fadeIn">
                  <AlertCircle className="w-4 h-4 text-danger-text shrink-0 mt-0.5" />
                  <div className="leading-relaxed">{loginError}</div>
                </div>
              )}
              {isRemote && needsNewLink(loginError) && <ResendConfirmation email={loginEmail} />}

              {/* Email / Username */}
              <div>
                <label className="block text-sm font-bold text-ink mb-1.5">
                  {isRemote ? 'Email address' : 'Email or community name'}
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-ink-3 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    autoComplete="username"
                    value={loginEmail}
                    onChange={(e) => setLoginEmail(e.target.value)}
                    placeholder={isRemote ? 'e.g. kwame@gmail.com' : 'e.g. kwame@4life.org or SoberWarrior_GH'}
                    className={cx(inputClass, 'pl-11')}
                  />
                </div>
              </div>

              {/* Password / 4-Digit PIN */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-sm font-bold text-ink">
                    {isRemote ? 'Password' : 'PIN or password'}
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setForgotEmail(loginEmail || (isRemote ? '' : 'kwame@4life.org'));
                      setForgotSuccess('');
                      setForgotModalOpen(true);
                    }}
                    className="-my-2.5 inline-flex min-h-10 items-center text-sm font-semibold text-pri-text hover:underline cursor-pointer"
                  >
                    {isRemote ? 'Forgot password?' : 'Forgot your PIN?'}
                  </button>
                </div>
                <div className="relative">
                  <Lock className="w-4 h-4 text-ink-3 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type={showLoginPin ? 'text' : 'password'}
                    value={loginPin}
                    onChange={(e) => setLoginPin(e.target.value)}
                    autoComplete="current-password"
                    placeholder={isRemote ? 'Your password' : 'Enter your 4-digit PIN (Demo: 1234)'}
                    maxLength={isRemote ? 72 : 20}
                    className={cx(inputClass, 'pl-11 pr-11')}
                  />
                  <button
                    type="button"
                    onClick={() => setShowLoginPin(!showLoginPin)}
                    aria-label={showLoginPin ? `Hide ${SECRET}` : `Show ${SECRET}`}
                    aria-pressed={showLoginPin}
                    className="absolute right-1 top-1/2 flex h-10 w-10 -translate-y-1/2 cursor-pointer items-center justify-center rounded-lg text-ink-3 hover:text-ink-2"
                  >
                    {showLoginPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Remember Me */}
              <div className="flex items-center justify-between pt-1">
                <label className="flex items-center gap-2 text-xs text-ink-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="w-4 h-4 rounded text-pri-text border-line focus:ring-pri"
                  />
                  <span>Remember this device</span>
                </label>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={authBusy}
                className="w-full py-3 bg-pri hover:bg-pri-hover text-[#fff] font-bold rounded-2xl text-sm shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-98 disabled:opacity-60"
              >
                <span>{authBusy ? 'Signing in…' : 'Sign in'}</span>
                <ArrowRight className="w-4 h-4" />
              </button>

              {/* Demo Profiles Bar (device mode only) */}
              <div className={isRemote ? 'hidden' : undefined}>
              <div className="pt-4 border-t border-line space-y-2.5 lg:pt-3 lg:space-y-2">
                <p className="text-sm font-bold text-ink-3 text-center">
                  Try a demo account
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {DEMO_ACCOUNTS.map((acc) => (
                    <button
                      key={acc.id}
                      type="button"
                      onClick={() => handleQuickLogin(acc)}
                      className="p-2.5 rounded-xl bg-bg hover:bg-pri-soft border border-line text-left transition-all flex items-center justify-between group cursor-pointer"
                    >
                      <div className="min-w-0">
                        <div className="font-bold text-sm text-ink flex items-center gap-1.5 truncate">
                          <span>{acc.profile.userAvatar}</span>
                          <span>{acc.name}</span>
                        </div>
                        <p className="text-xs text-ink-3 truncate">
                          {acc.profile.sobrietyStreakDays} days clean · PIN {acc.pin}
                        </p>
                      </div>
                      <ArrowRight className="h-4 w-4 shrink-0 text-pri-text transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                    </button>
                  ))}
                </div>
              </div>
              </div>

              {/* Anonymous Guest Access */}
              <div className="text-center pt-2 lg:pt-0">
                <button
                  type="button"
                  onClick={handleGuestLogin}
                  className="text-xs font-semibold text-ink-3 hover:text-pri-text underline cursor-pointer"
                >
                  Or continue as an anonymous guest (no account needed)
                </button>
              </div>

            </form>
          )}

          {authMode === 'signup' && confirmSent && (
            <div className="flex flex-col items-center gap-4 rounded-2xl bg-pri-soft p-6 text-center text-pri-ink" role="status">
              <Check className="h-8 w-8" aria-hidden="true" />
              <p className="m-0 text-lg font-bold">Check your email</p>
              <p className="m-0 text-[0.9375rem] leading-relaxed">
                We sent a link to <strong>{confirmSent}</strong>. Open it to confirm your account, then sign in.
              </p>
              <button
                type="button"
                className="min-h-11 rounded-xl bg-pri px-5 font-bold text-[#fff] hover:bg-pri-hover cursor-pointer"
                onClick={() => {
                  setLoginEmail(confirmSent);
                  setConfirmSent('');
                  setAuthMode('login');
                }}
              >
                Go to sign in
              </button>
            </div>
          )}

          {/* 2. SIGN UP VIEW — four short steps */}
          {authMode === 'signup' && !confirmSent && (() => {
            const STEPS = [
              { n: 1, short: 'You', title: 'About you' },
              { n: 2, short: 'Security', title: 'Secure your account' },
              { n: 3, short: 'Focus', title: 'What would you like help with?' },
              { n: 4, short: 'Support', title: 'Support and safe space' },
            ] as const;
            const current = STEPS[signupStep - 1];
            const pathways = [
              { id: 'substance', label: 'Drugs or alcohol', icon: '🌿' },
              { id: 'porn', label: 'Adult content', icon: '🛡️' },
              { id: 'social_media', label: 'Screens and gaming', icon: '📱' },
              { id: 'anger', label: 'Anger and stress', icon: '🕊️' },
              { id: 'general', label: 'General wellbeing', icon: '⚖️' },
            ];
            const beliefs: Array<{ id: BeliefSystem; label: string; desc: string }> = [
              { id: 'theist', label: 'Faith and prayer', desc: 'Scripture, prayer and spiritual hope' },
              { id: 'secular', label: 'Science and psychology', desc: 'Evidence-based tools and brain science' },
              { id: 'undecided', label: 'Not sure yet', desc: 'A mix of both — change it any time' },
            ];

            return (
              <form onSubmit={handleSignupSubmit} className="flex flex-col gap-6 lg:gap-4" noValidate>
                {/* Progress: where you are and what is next */}
                <div className="flex flex-col gap-3 lg:gap-2">
                  <ol className="m-0 grid list-none grid-cols-4 gap-2 p-0" aria-label="Sign-up steps">
                    {STEPS.map(st => {
                      const done = st.n < signupStep;
                      const active = st.n === signupStep;
                      return (
                        <li key={st.n} className="flex flex-col gap-2">
                          <span className={cx('h-1.5 rounded-full', done || active ? 'bg-pri' : 'bg-muted')} aria-hidden="true" />
                          <button
                            type="button"
                            disabled={!done}
                            onClick={() => goToSignupStep(st.n)}
                            aria-current={active ? 'step' : undefined}
                            className={cx(
                              'hidden items-center gap-1.5 text-left text-xs font-bold sm:flex',
                              active ? 'text-ink' : done ? 'text-pri-text cursor-pointer hover:underline' : 'text-ink-3'
                            )}
                          >
                            {done ? <Check className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /> : <span aria-hidden="true">{st.n}.</span>}
                            <span className="truncate">{st.short}</span>
                          </button>
                        </li>
                      );
                    })}
                  </ol>
                  <div>
                    <p className="m-0 text-sm font-semibold text-ink-3 lg:hidden">Step {signupStep} of 4</p>
                    <h3 className="m-0 text-xl font-bold text-ink">{current.title}</h3>
                  </div>
                </div>

                {signupError && (
                  <div role="alert" className="flex items-start gap-2.5 rounded-xl bg-danger-soft px-4 py-3 text-[0.9375rem] text-danger-text animate-fadeIn">
                    <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
                    <p className="m-0 leading-relaxed">{signupError}</p>
                  </div>
                )}

                {/* STEP 1 — About you */}
                {signupStep === 1 && (
                  <div key="s1" className="flex flex-col gap-5 animate-fadeIn lg:gap-4">
                    <Field label="Your name" htmlFor="su-name" hint="Your real name or any name you are comfortable with. Only you see it.">
                      <input
                        id="su-name"
                        type="text"
                        autoFocus
                        autoComplete="name"
                        value={signupName}
                        onChange={e => setSignupName(e.target.value)}
                        placeholder="e.g. Kofi Asante"
                        className={inputClass}
                      />
                    </Field>
                    <Field
                      label="Community name"
                      htmlFor="su-handle"
                      optional
                      hint={`What others see in the Village. Leave it blank and we'll use ${(signupName.trim().split(' ')[0] || 'Kofi')}_Warrior.`}
                    >
                      <input
                        id="su-handle"
                        type="text"
                        value={signupNickname}
                        onChange={e => setSignupNickname(e.target.value)}
                        placeholder="e.g. Asante_Warrior"
                        className={inputClass}
                      />
                    </Field>
                  </div>
                )}

                {/* STEP 2 — Secure your account */}
                {signupStep === 2 && (
                  <div key="s2" className="flex flex-col gap-5 animate-fadeIn lg:gap-4">
                    <Field label="Email address" htmlFor="su-email" hint={`Used to sign in, and to help you get back in if you forget your ${SECRET}.`}>
                      <input
                        id="su-email"
                        type="email"
                        autoFocus
                        autoComplete="email"
                        value={signupEmail}
                        onChange={e => setSignupEmail(e.target.value)}
                        placeholder="e.g. kofi@gmail.com"
                        className={inputClass}
                      />
                    </Field>
                    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                      <Field label={`Choose a ${SECRET}`} htmlFor="su-pin" hint={isRemote ? 'At least 8 characters.' : 'At least 4 digits.'}>
                        <input
                          id="su-pin"
                          type={showSignupPin ? 'text' : 'password'}
                          inputMode={isRemote ? undefined : 'numeric'}
                          autoComplete="new-password"
                          value={signupPin}
                          onChange={e => setSignupPin(e.target.value)}
                          placeholder={isRemote ? '' : 'e.g. 5678'}
                          maxLength={isRemote ? 72 : 10}
                          className={inputClass}
                        />
                      </Field>
                      <Field label="Type it again" htmlFor="su-pin2">
                        <input
                          id="su-pin2"
                          type={showSignupPin ? 'text' : 'password'}
                          inputMode={isRemote ? undefined : 'numeric'}
                          autoComplete="new-password"
                          value={signupConfirmPin}
                          onChange={e => setSignupConfirmPin(e.target.value)}
                          placeholder={`Repeat your ${SECRET}`}
                          maxLength={isRemote ? 72 : 10}
                          className={inputClass}
                        />
                      </Field>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowSignupPin(!showSignupPin)}
                      className="flex min-h-11 items-center gap-2 self-start text-[0.9375rem] font-semibold text-pri-text hover:underline cursor-pointer"
                    >
                      {showSignupPin ? <EyeOff className="h-5 w-5" aria-hidden="true" /> : <Eye className="h-5 w-5" aria-hidden="true" />}
                      {showSignupPin ? `Hide ${SECRET}` : `Show ${SECRET}`}
                    </button>
                  </div>
                )}

                {/* STEP 3 — What to focus on */}
                {signupStep === 3 && (
                  <div key="s3" className="flex flex-col gap-6 animate-fadeIn lg:gap-4">
                    <fieldset className="m-0 flex flex-col gap-2.5 border-0 p-0">
                      <legend className="mb-2.5 p-0 text-sm font-bold text-ink lg:mb-1.5">Choose the one that fits best</legend>
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        {pathways.map(pw => {
                          const selected = signupTriage === pw.id;
                          return (
                            <button
                              key={pw.id}
                              type="button"
                              aria-pressed={selected}
                              onClick={() => setSignupTriage(pw.id as TriageCategory)}
                              className={cx(
                                'flex min-h-12 items-center gap-3 rounded-xl border-2 px-3.5 text-left text-[0.9375rem] font-semibold transition-colors lg:min-h-10 cursor-pointer',
                                selected ? 'border-pri bg-pri-soft text-pri-ink' : 'border-line bg-surface text-ink hover:border-pri-text'
                              )}
                            >
                              <span className="text-lg" aria-hidden="true">{pw.icon}</span>
                              <span className="flex-1">{pw.label}</span>
                              {selected && <Check className="h-4 w-4 shrink-0" aria-hidden="true" />}
                            </button>
                          );
                        })}
                      </div>
                      <p className="m-0 text-sm text-ink-3 lg:hidden">You can change this later in Settings.</p>
                    </fieldset>

                    <fieldset className="m-0 flex flex-col gap-2.5 border-0 p-0">
                      <legend className="mb-2.5 p-0 text-sm font-bold text-ink lg:mb-1.5">What kind of encouragement suits you?</legend>
                      <div className="flex flex-col gap-2 lg:grid lg:grid-cols-3">
                        {beliefs.map(bl => {
                          const selected = signupBelief === bl.id;
                          return (
                            <button
                              key={bl.id}
                              type="button"
                              aria-pressed={selected}
                              onClick={() => setSignupBelief(bl.id)}
                              title={bl.desc}
                              className={cx(
                                'flex min-h-12 items-center gap-3 rounded-xl border-2 px-3.5 py-2.5 text-left transition-colors lg:min-h-11 lg:justify-center lg:px-2 lg:py-2 lg:text-center cursor-pointer',
                                selected ? 'border-pri bg-pri-soft' : 'border-line bg-surface hover:border-pri-text'
                              )}
                            >
                              <span className="min-w-0 flex-1">
                                <span className={cx('block text-[0.9375rem] font-bold', selected ? 'text-pri-ink' : 'text-ink')}>{bl.label}</span>
                                <span className={cx('block text-sm lg:sr-only', selected ? 'text-pri-ink' : 'text-ink-3')}>{bl.desc}</span>
                              </span>
                              {selected && <Check className="h-4 w-4 shrink-0 text-pri-ink lg:hidden" aria-hidden="true" />}
                            </button>
                          );
                        })}
                      </div>
                    </fieldset>
                  </div>
                )}

                {/* STEP 4 — Support and safe space */}
                {signupStep === 4 && (
                  <div key="s4" className="flex flex-col gap-6 animate-fadeIn">
                    <Field
                      label="Email of someone who supports you"
                      htmlFor="su-support"
                      optional
                      hint="A friend, family member or mentor we can alert if you press SOS. You can add more people later."
                    >
                      <input
                        id="su-support"
                        type="email"
                        value={emergencyEmail}
                        onChange={e => setEmergencyEmail(e.target.value)}
                        placeholder="e.g. mentor@family.org"
                        className={inputClass}
                      />
                    </Field>

                    <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-line bg-bg p-4 text-[0.9375rem] leading-relaxed text-ink-2">
                      <input
                        type="checkbox"
                        checked={agreedToTerms}
                        onChange={e => setAgreedToTerms(e.target.checked)}
                        className="mt-1 h-5 w-5 shrink-0 cursor-pointer"
                      />
                      <span>
                        I agree to the <strong className="text-ink">safe-space promise</strong>: my recovery data stays private, and I will treat
                        others in the community with respect.
                      </span>
                    </label>
                  </div>
                )}

                {/* Navigation */}
                <div className="flex items-center gap-3 border-t border-line pt-5">
                  {signupStep > 1 && (
                    <button
                      type="button"
                      onClick={() => goToSignupStep((signupStep - 1) as 1 | 2 | 3 | 4)}
                      className="flex min-h-12 items-center gap-2 rounded-xl px-4 text-[0.9375rem] font-bold text-ink-2 hover:bg-muted cursor-pointer"
                    >
                      <ArrowLeft className="h-5 w-5" aria-hidden="true" />
                      Back
                    </button>
                  )}
                  <button
                    type="submit"
                    disabled={authBusy}
                    className="ml-auto flex min-h-12 items-center justify-center gap-2 rounded-xl bg-pri px-6 text-[0.9375rem] font-bold text-[#fff] hover:bg-pri-hover disabled:opacity-60 cursor-pointer"
                  >
                    {signupStep < 4 ? (
                      <>
                        Continue
                        <ArrowRight className="h-5 w-5" aria-hidden="true" />
                      </>
                    ) : (
                      <>
                        Create my account
                        <Check className="h-5 w-5" aria-hidden="true" />
                      </>
                    )}
                  </button>
                </div>
              </form>
            );
          })()}

        </div>
      )}
    </AuthShell>

      {/* Forgot PIN Recovery Modal */}
      {forgotModalOpen && (
        <div className="fixed inset-0 z-50 bg-[rgba(15,23,42,0.6)] backdrop-blur-sm flex items-center justify-center p-3 sm:p-6 overflow-y-auto animate-fadeIn">
          <div className="w-full max-w-md max-h-[85vh] my-auto overflow-y-auto bg-surface rounded-3xl p-6 sm:p-8 shadow-2xl border border-line space-y-4">
            
            <div className="flex items-center justify-between border-b border-line pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-pri-soft text-pri-text flex items-center justify-center">
                  <KeyRound className="w-5 h-5 text-pri-text" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-ink">{isRemote ? 'Reset your password' : 'PIN Recovery'}</h3>
                  <p className="text-xs text-ink-3">{isRemote ? 'We will email you a link' : 'Find your 4-digit PIN'}</p>
                </div>
              </div>
              <button
                onClick={() => setForgotModalOpen(false)}
                className="text-ink-3 hover:text-ink-2 text-lg font-bold p-1"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleForgotSubmit} className="space-y-3">
              <div>
                <label className="block text-sm font-bold text-ink mb-1.5">
                  The email you signed up with
                </label>
                <input
                  type="email"
                  value={forgotEmail}
                  onChange={(e) => setForgotEmail(e.target.value)}
                  placeholder={isRemote ? 'e.g. kwame@gmail.com' : 'e.g. kwame@4life.org'}
                  className={inputClass}
                />
              </div>

              {forgotSuccess && (
                <div className="p-3 bg-pri-soft border border-line rounded-xl text-xs text-pri-ink leading-relaxed animate-fadeIn">
                  {forgotSuccess}
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-line">
                <button
                  type="button"
                  onClick={() => setForgotModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-ink-2 hover:bg-muted"
                >
                  Close
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-pri hover:bg-pri-hover text-[#fff] text-xs font-bold shadow-xs"
                >
                  {isRemote ? 'Send the link' : 'Find my PIN'}
                </button>
              </div>
            </form>

          </div>
        </div>
      )}


    </>
  );
};
