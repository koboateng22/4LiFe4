import React, { useState } from 'react';
import { UserProfile, TriageCategory } from '../types';
import { USER_AVATARS, AI_AVATARS } from '../data/forumData';
import { WORLD_RELIGIONS, WORLD_LANGUAGES } from '../data/religionsData';
import { changeLanguage } from '../utils/translateUtils';
import { t } from '../utils/translations';
import { inputClass } from './ui';
import { ageDigits, ageError } from '../lib/age';
import { 
  Shield, Lock, Bell, Heart, Moon, AlertTriangle, Sparkles, Check, 
  ArrowRight, ArrowLeft, Activity, User, Phone, MapPin, Wind, 
  Eye, Zap, BookOpen, Utensils, Waves, Compass, CheckCircle2, ShieldCheck,
  Flame, HelpCircle, MessageSquare, Volume2, Globe
} from 'lucide-react';

interface OnboardingFlowProps {
  profile: UserProfile;
  setProfile: React.Dispatch<React.SetStateAction<UserProfile>>;
  onComplete: (selectedTriage?: TriageCategory, directAction?: string) => void;
}

const GHANA_REGIONS = [
  'Greater Accra',
  'Ashanti',
  'Western',
  'Central',
  'Eastern',
  'Volta',
  'Northern',
  'Upper East',
  'Upper West',
  'Bono',
  'Bono East',
  'Ahafo',
  'Western North',
  'Oti',
  'Savannah',
  'North East',
  'Global / Other Region',
];


export const OnboardingFlow: React.FC<OnboardingFlowProps> = ({
  profile,
  setProfile,
  onComplete,
}) => {
  // 1: Demographics & Faith, 2: Security & Contacts, 3: Problem Triage, 4: Specific Triage Deep-Dive & Action
  const [step, setStep] = useState<number>(1);
  const [selectedTriage, setSelectedTriage] = useState<TriageCategory>('substance');
  const [newContactName, setNewContactName] = useState('');
  const [newContactPhone, setNewContactPhone] = useState('');
  const [newContactEmail, setNewContactEmail] = useState('');
  const [newContactRel, setNewContactRel] = useState('Family');
  const [codeSent, setCodeSent] = useState(false);
  const [showAgeError, setShowAgeError] = useState(false);
  // Age can be left blank here (it can be added later in Settings), but not left wrong
  const ageProblem = String(profile.age ?? '').trim() ? ageError(profile.age) : '';

  const handleAddContact = () => {
    if (!newContactName.trim()) return;
    const newContact = {
      id: 'c_' + Date.now(),
      name: newContactName.trim(),
      phone: newContactPhone.trim() || '+233 24 000 0000',
      email: newContactEmail.trim() || undefined,
      relationship: newContactRel,
      isPrimary: profile.contacts.length === 0,
      autoDailyCheckin: true,
    };
    setProfile(prev => ({
      ...prev,
      contacts: [...prev.contacts, newContact],
    }));
    setNewContactName('');
    setNewContactPhone('');
    setNewContactEmail('');
  };

  const handleRemoveContact = (id: string) => {
    setProfile(prev => ({
      ...prev,
      contacts: prev.contacts.filter(c => c.id !== id),
    }));
  };

  const handleFinishOnboarding = (directAction?: string) => {
    setProfile(prev => ({
      ...prev,
      currentTriage: selectedTriage,
    }));
    onComplete(selectedTriage, directAction);
  };

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center p-4 sm:p-6 lg:p-8">
      <div className="w-full max-w-3xl bg-surface rounded-3xl border border-line shadow-2xl overflow-hidden animate-fadeIn">
        
        {/* Header: where you are in setup */}
        <div className="border-b border-line p-6 sm:p-8">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="hidden h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-pri text-[#fff] sm:flex" aria-hidden="true">
                <Sparkles className="h-5 w-5" />
              </span>
              <div>
                <h1 className="m-0 text-xl font-bold text-ink sm:text-2xl">Set up <span translate="no">4Life</span></h1>
                <p className="m-0 mt-0.5 text-base text-ink-2">
                  Step {step} of 4 · {['About you', 'Privacy and support people', 'What you’re working on', 'Your support'][step - 1]}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => handleFinishOnboarding()}
              className="min-h-11 shrink-0 rounded-xl px-3 text-sm font-bold text-ink-2 hover:bg-muted cursor-pointer"
            >
              <span className="sm:hidden">Skip</span>
              <span className="hidden sm:inline">Skip for now</span>
            </button>
          </div>
          <div className="mt-5 flex gap-2" role="progressbar" aria-valuemin={1} aria-valuemax={4} aria-valuenow={step} aria-label={`Step ${step} of 4`}>
            {[1, 2, 3, 4].map(s => (
              <span key={s} className={`h-1.5 flex-1 rounded-full ${s <= step ? 'bg-pri' : 'bg-muted'}`} />
            ))}
          </div>
        </div>

        {/* Form Body */}
        <div className="p-6 sm:p-8 space-y-6">
          
          {/* STEP 1: Demographics, Outlook & Belief */}
          {step === 1 && (
            <div className="space-y-5 animate-fadeIn">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-bold text-ink">About you</h2>
                  <span className="text-sm font-semibold text-pri-text bg-pri-soft px-2 py-0.5 rounded-md border border-pri/30">
                    Private
                  </span>
                </div>
                <p className="text-sm text-ink-3 mt-0.5">
                  This helps AI therapy speak to you in a way that fits you. Only you can see it.
                </p>
              </div>

              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-bold text-ink mb-1.5">
                      Your name (private)
                    </label>
                    <input
                      type="text"
                      value={profile.name}
                      onChange={e => setProfile({ ...profile, name: e.target.value })}
                      placeholder="e.g. Kwadwo Mensah"
                      className={inputClass}
                    />
                  </div>

                  <div>
                    <label htmlFor="onboard-age" className="block text-sm font-bold text-ink mb-1.5">
                      Age
                    </label>
                    <input
                      id="onboard-age"
                      type="text"
                      inputMode="numeric"
                      autoComplete="off"
                      maxLength={3}
                      value={profile.age ?? ''}
                      onChange={e => setProfile({ ...profile, age: ageDigits(e.target.value) })}
                      aria-invalid={showAgeError && !!ageProblem}
                      placeholder="e.g. 22"
                      className={inputClass}
                    />
                    {showAgeError && ageProblem && (
                      <p role="alert" className="m-0 mt-1.5 text-sm text-danger-text">{ageProblem}</p>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-bold text-ink mb-1.5 flex items-center justify-between">
                      <span className="flex items-center gap-1.5">
                        <Globe className="w-3.5 h-3.5 text-pri-text" />
                        <span>{t('preferred_lang', profile.language)}</span>
                      </span>
                    </label>
                    <select
                      value={profile.language || 'en'}
                      onChange={e => {
                        const newLang = e.target.value;
                        setProfile({ ...profile, language: newLang });
                        changeLanguage(newLang);
                        try {
                          localStorage.setItem('4life_user_language', newLang);
                        } catch {}
                      }}
                      className={inputClass}
                    >
                      {WORLD_LANGUAGES.map(l => (
                        <option key={l.code} value={l.code}>
                          {l.name}{l.nativeName !== l.name ? ` (${l.nativeName})` : ''}
                        </option>
                      ))}
                    </select>

                    {/* Quick popular language buttons */}
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {[
                        { code: 'en', label: 'English' },
                        { code: 'ak', label: 'Twi' },
                        { code: 'fat', label: 'Fante' },
                        { code: 'gaa', label: 'Ga' },
                        { code: 'ee', label: 'Ewe' },
                        { code: 'dag', label: 'Dagbani' },
                        { code: 'ha', label: 'Hausa' },
                        { code: 'fr', label: 'Français' },
                        { code: 'es', label: 'Español' },
                      ].map(ql => (
                        <button
                          key={ql.code}
                          type="button"
                          onClick={() => {
                            setProfile({ ...profile, language: ql.code });
                            changeLanguage(ql.code);
                            try {
                              localStorage.setItem('4life_user_language', ql.code);
                            } catch {}
                          }}
                          className={`px-2 py-1 rounded-lg text-sm font-bold border transition-all cursor-pointer ${
                            (profile.language || 'en') === ql.code
                              ? 'bg-pri text-[#fff] border-pri shadow-2xs'
                              : 'bg-surface text-ink-2 border-line hover:bg-pri-soft'
                          }`}
                        >
                          {ql.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-bold text-ink mb-1.5 flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5 text-pri-text" />
                      <span>Region</span>
                    </label>
                    <select
                      value={profile.region}
                      onChange={e => setProfile({ ...profile, region: e.target.value })}
                      className={inputClass}
                    >
                      {GHANA_REGIONS.map(r => (
                        <option key={r} value={r}>{r}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Comprehensive World Religions Dropdown */}
                <div>
                  <label className="block text-sm font-bold text-ink mb-1.5 flex items-center justify-between">
                    <span>Faith or tradition</span>
                  </label>
                  <select
                    value={profile.religion || (profile.belief === 'secular' ? 'secular_atheist' : 'christianity')}
                    onChange={e => {
                      const relId = e.target.value;
                      const selectedRel = WORLD_RELIGIONS.find(r => r.id === relId);
                      const isSec = relId === 'secular_atheist' || relId === 'agnostic';
                      setProfile({
                        ...profile,
                        religion: relId,
                        belief: isSec ? 'secular' : 'theist',
                        religionType: (selectedRel?.name as any) || 'Other',
                      });
                    }}
                    className={inputClass}
                  >
                    {WORLD_RELIGIONS.map(r => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                  </select>
                  
                  {/* Selected Religion Description Pill */}
                  {(() => {
                    const activeRel = WORLD_RELIGIONS.find(r => r.id === (profile.religion || (profile.belief === 'secular' ? 'secular_atheist' : 'christianity'))) || WORLD_RELIGIONS[0];
                    return (
                      <p className="mt-2 mb-0 text-sm leading-relaxed text-ink-3">{activeRel.description}</p>
                    );
                  })()}
                </div>

                {/* Belief System Mode Selection (Quick Switch) */}
                <div>
                  <label className="block text-sm font-bold text-ink mb-1.5">
                    How should AI therapy encourage you?
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setProfile({ 
                        ...profile, 
                        belief: 'theist', 
                        religion: profile.religion === 'secular_atheist' ? 'christianity' : profile.religion || 'christianity',
                        religionType: 'Christian' 
                      })}
                      className={`p-3.5 rounded-2xl border text-left flex flex-col gap-1 transition-all ${
                        profile.belief === 'theist'
                          ? 'border-pri bg-pri-soft text-pri-ink ring-2 ring-pri/20 shadow-xs'
                          : 'border-line bg-bg hover:bg-muted text-ink-2'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-bold flex items-center gap-1.5">
                          With my faith
                        </span>
                        {profile.belief === 'theist' && <Check className="w-4 h-4 text-pri-text" />}
                      </div>
                      <span className="text-sm text-ink-2">
                        Hope, prayer and words from your faith, alongside practical CBT steps.
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setProfile({ 
                        ...profile, 
                        belief: 'secular', 
                        religion: 'secular_atheist',
                        religionType: 'Secular / Agnostic' 
                      })}
                      className={`p-3.5 rounded-2xl border text-left flex flex-col gap-1 transition-all ${
                        profile.belief === 'secular'
                          ? 'border-pri bg-pri-soft text-pri-ink ring-2 ring-pri/20 shadow-xs'
                          : 'border-line bg-bg hover:bg-muted text-ink-2'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-bold flex items-center gap-1.5">
                          With practical science
                        </span>
                        {profile.belief === 'secular' && <Check className="w-4 h-4 text-pri-text" />}
                      </div>
                      <span className="text-sm text-ink-2">
                        Evidence-based CBT steps and plain explanations, without religion.
                      </span>
                    </button>
                  </div>
                </div>

                {/* Avatar Selection */}
                <div>
                  <label className="block text-sm font-bold text-ink mb-1.5">
                    Your avatar in the Village
                  </label>
                  <div className="flex flex-wrap gap-2.5">
                    {USER_AVATARS.map(av => (
                      <button
                        key={av.id}
                        type="button"
                        onClick={() => setProfile({ ...profile, userAvatar: av.emoji })}
                        className={`w-11 h-11 rounded-xl text-xl flex items-center justify-center transition-all ${
                          profile.userAvatar === av.emoji
                            ? 'bg-pri text-[#fff] scale-110 shadow-md ring-2 ring-pri'
                            : 'bg-muted border border-line hover:scale-105'
                        }`}
                        title={av.label}
                      >
                        {av.emoji}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Font Size & Theme Adjuster during Onboarding */}
                <div className="p-4 bg-bg border border-line rounded-2xl space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold text-ink flex items-center gap-1.5">
                      <span>Text size and theme</span>
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* Font Size Buttons */}
                    <div>
                      <label className="block text-sm font-semibold text-ink-2 mb-1.5">
                        Text size
                      </label>
                      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
                        {[
                          { id: 'sm', label: 'Small', preview: 'A' },
                          { id: 'md', label: 'Normal', preview: 'A+' },
                          { id: 'lg', label: 'Large', preview: 'A++' },
                          { id: 'xl', label: 'X-Large', preview: 'A+++' },
                        ].map(f => (
                          <button
                            key={f.id}
                            type="button"
                            onClick={() => setProfile({ ...profile, fontSize: f.id as any })}
                            className={`py-2 px-1 rounded-xl text-sm font-bold flex flex-col items-center justify-center border transition-all ${
                              (profile.fontSize || 'md') === f.id
                                ? 'bg-pri text-[#fff] border-pri shadow-2xs'
                                : 'bg-surface text-ink-2 border-line hover:bg-muted'
                            }`}
                          >
                            <span className="text-sm">{f.preview}</span>
                            <span className="text-sm mt-0.5">{f.label}</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Theme Selector (Forest/Emerald Dark vs Light) */}
                    <div>
                      <label className="block text-sm font-semibold text-ink-2 mb-1.5">
                        Theme
                      </label>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => setProfile({ ...profile, theme: 'light' })}
                          className={`p-2.5 rounded-xl border text-left flex items-center gap-2 transition-all ${
                            profile.theme !== 'dark'
                              ? 'bg-[#fff] text-[#0f172a] border-pri ring-2 ring-pri/30 shadow-2xs'
                              : 'bg-[#fff] text-[#0f172a] border-[#e2e8f0]'
                          }`}
                        >
                          <span className="text-lg">☀️</span>
                          <div>
                            <span className="text-sm font-bold block">Light</span>
                            <span className="text-sm text-[#475569]">Slate & Emerald</span>
                          </div>
                        </button>

                        <button
                          type="button"
                          onClick={() => setProfile({ ...profile, theme: 'dark' })}
                          className={`p-2.5 rounded-xl border text-left flex items-center gap-2 transition-all ${
                            profile.theme === 'dark'
                              ? 'bg-[#07110b] text-[#f8fafc] border-pri ring-2 ring-pri/30 shadow-2xs'
                              : 'bg-[#07110b] text-[#f8fafc] border-[#1b3a28]'
                          }`}
                        >
                          <span className="text-lg">🌙</span>
                          <div>
                            <span className="text-sm font-bold block">Dark</span>
                            <span className="text-sm text-[#34d399] font-semibold">Forest & Emerald</span>
                          </div>
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Live preview banner */}
                  <div className={`p-2.5 rounded-xl border text-ink-2 transition-all ${
                    profile.fontSize === 'sm' ? 'text-sm' : 
                    profile.fontSize === 'lg' ? 'text-base' : 
                    profile.fontSize === 'xl' ? 'text-lg' : 'text-sm'
                  } bg-surface border-line`}>
                    <span className="font-pacifico text-pri-text mr-2">4Life:</span>
                    <span>"Welcome to your healing journey. One day at a time, one mindful moment at a time."</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* STEP 2: Anonymous Security & Safety Net */}
          {step === 2 && (
            <div className="space-y-5 animate-fadeIn">
              <div>
                <h2 className="text-lg font-bold text-ink">Privacy and support people</h2>
                <p className="text-sm text-ink-3 mt-0.5">
                  Choose the name others see, and add someone you trust. In an emergency you can text them your location in one tap.
                </p>
              </div>

              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-bold text-ink mb-1.5">
                      Community name
                    </label>
                    <input
                      type="text"
                      value={profile.nickname}
                      onChange={e => setProfile({ ...profile, nickname: e.target.value })}
                      placeholder="e.g. HopefulWarrior_GH"
                      className={inputClass}
                    />
                    <span className="text-sm text-ink-3 mt-1 block">Shown in the Village instead of your real name</span>
                  </div>

                  <div>
                    <label className="block text-sm font-bold text-ink mb-1.5">
                      4-digit PIN
                    </label>
                    <input
                      type="text"
                      maxLength={4}
                      value={profile.pinCode}
                      onChange={e => setProfile({ ...profile, pinCode: e.target.value })}
                      placeholder="e.g. 5291"
                      className={inputClass}
                    />
                    <span className="text-sm text-ink-3 mt-1 block">Used to sign in on this device</span>
                  </div>
                </div>

                {/* Add Trusted Contact / Accountability Partner */}
                <div className="p-4 rounded-2xl bg-pri-soft border border-pri/30 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-bold text-pri-ink flex items-center gap-1.5">
                      <Phone className="w-3.5 h-3.5 text-pri-text" />
                      <span>Support people</span>
                    </p>
                  </div>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <input
                      type="text"
                      value={newContactName}
                      onChange={e => setNewContactName(e.target.value)}
                      placeholder="Name, e.g. Sister Ama"
                      aria-label="Support person’s name"
                      className={inputClass}
                    />
                    <input
                      type="tel"
                      value={newContactPhone}
                      onChange={e => setNewContactPhone(e.target.value)}
                      placeholder="Phone, e.g. 024 123 4567"
                      aria-label="Phone number"
                      className={inputClass}
                    />
                    <input
                      type="email"
                      value={newContactEmail}
                      onChange={e => setNewContactEmail(e.target.value)}
                      placeholder="Email (optional)"
                      aria-label="Email (optional)"
                      className={inputClass}
                    />
                    <button
                      type="button"
                      onClick={handleAddContact}
                      className="min-h-12 px-4 bg-pri hover:bg-pri-hover text-[#fff] rounded-xl text-base font-bold transition-colors cursor-pointer"
                    >
                      Add support person
                    </button>
                  </div>

                  {/* List of Contacts */}
                  <div className="space-y-1.5 pt-1">
                    {profile.contacts.map(c => (
                      <div key={c.id} className="flex items-center justify-between px-3 py-2 bg-surface rounded-xl border border-pri/25 text-sm">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-ink">{c.name}</span>
                          <span className="text-ink-3 text-sm">({c.phone})</span>
                          {c.email && (
                            <span className="text-ink-3 text-sm truncate max-w-[140px]">
                              {c.email}
                            </span>
                          )}
                          {c.isPrimary && (
                            <span className="bg-pri-soft text-pri-ink text-sm px-1.5 py-0.5 rounded-sm font-semibold">Primary</span>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRemoveContact(c.id)}
                          className="text-danger-text hover:underline font-bold text-sm"
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                {/* AI Companion Choice */}
                <div>
                  <label className="block text-sm font-bold text-ink mb-1.5">
                    Choose your AI companion
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {AI_AVATARS.map(av => (
                      <button
                        key={av.id}
                        type="button"
                        onClick={() => setProfile({ ...profile, aiName: av.name.split(' ')[0], aiAvatar: av.emoji })}
                        className={`p-3 rounded-xl border text-left flex items-start gap-2.5 transition-all ${
                          profile.aiAvatar === av.emoji
                            ? 'border-pri bg-pri-soft ring-2 ring-pri/20'
                            : 'border-line bg-bg hover:bg-muted'
                        }`}
                      >
                        <span className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm bg-pri-soft`}>
                          {av.emoji}
                        </span>
                        <div>
                          <p className="text-sm font-bold text-ink">{av.name}</p>
                          <p className="text-sm text-ink-3 leading-tight mt-0.5">{av.desc}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* STEP 3: Problem Triage Selection */}
          {step === 3 && (
            <div className="space-y-5 animate-fadeIn">
              <div>
                <h2 className="text-lg font-bold text-ink">What are you working on?</h2>
                <p className="text-sm text-ink-3 mt-0.5">
                  Choose your main focus. AI therapy and the Village will be tailored to it. You can change it later in Settings.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                
                {/* 1. Drug / Alcohol Issue */}
                <button
                  type="button"
                  onClick={() => setSelectedTriage('substance')}
                  className={`p-4 rounded-2xl border-2 text-left transition-all ${
                    selectedTriage === 'substance'
                      ? 'border-pri bg-pri-soft shadow-md ring-2 ring-pri/20'
                      : 'border-line bg-bg hover:bg-muted'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-2xl">💊🍷</span>
                    {selectedTriage === 'substance' && <CheckCircle2 className="w-5 h-5 text-pri-text" />}
                  </div>
                  <h3 className="font-bold text-sm text-ink">Drugs or alcohol</h3>
                  <p className="text-sm text-ink-2 mt-1">
                    Alcohol, cannabis, tramadol or other drugs. Help riding out cravings and the thoughts behind them.
                  </p>
                </button>

                {/* 2. Porn Addiction */}
                <button
                  type="button"
                  onClick={() => setSelectedTriage('porn')}
                  className={`p-4 rounded-2xl border-2 text-left transition-all ${
                    selectedTriage === 'porn'
                      ? 'border-pri bg-pri-soft shadow-md ring-2 ring-pri/20'
                      : 'border-line bg-bg hover:bg-muted'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-2xl">🔞🔒</span>
                    {selectedTriage === 'porn' && <CheckCircle2 className="w-5 h-5 text-pri-text" />}
                  </div>
                  <h3 className="font-bold text-sm text-ink">Porn or explicit content</h3>
                  <p className="text-sm text-ink-2 mt-1">
                    Compulsive use of explicit content. Private support for urges, shame and late-night triggers.
                  </p>
                </button>

                {/* 3. Social Media Addiction */}
                <button
                  type="button"
                  onClick={() => setSelectedTriage('social_media')}
                  className={`p-4 rounded-2xl border-2 text-left transition-all ${
                    selectedTriage === 'social_media'
                      ? 'border-pri bg-pri-soft shadow-md ring-2 ring-pri/20'
                      : 'border-line bg-bg hover:bg-muted'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-2xl">📱⌛</span>
                    {selectedTriage === 'social_media' && <CheckCircle2 className="w-5 h-5 text-pri-text" />}
                  </div>
                  <h3 className="font-bold text-sm text-ink">Social media and scrolling</h3>
                  <p className="text-sm text-ink-2 mt-1">
                    Endless scrolling that eats into your sleep, studies and focus.
                  </p>
                </button>

                {/* 4. Anger Issues */}
                <button
                  type="button"
                  onClick={() => setSelectedTriage('anger')}
                  className={`p-4 rounded-2xl border-2 text-left transition-all ${
                    selectedTriage === 'anger'
                      ? 'border-pri bg-pri-soft shadow-md ring-2 ring-pri/20'
                      : 'border-line bg-bg hover:bg-muted'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-2xl">🌊🧘</span>
                    {selectedTriage === 'anger' && <CheckCircle2 className="w-5 h-5 text-pri-text" />}
                  </div>
                  <h3 className="font-bold text-sm text-ink">Anger and stress</h3>
                  <p className="text-sm text-ink-2 mt-1">
                    Anger or stress that boils over. Calming steps and help with heated thoughts.
                  </p>
                </button>

                {/* 5. Overeating / Food Addiction */}
                <button
                  type="button"
                  onClick={() => setSelectedTriage('overeating')}
                  className={`p-4 rounded-2xl border-2 text-left transition-all ${
                    selectedTriage === 'overeating'
                      ? 'border-pri bg-pri-soft shadow-md ring-2 ring-pri/20'
                      : 'border-line bg-bg hover:bg-muted'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-2xl">🥗🏃</span>
                    {selectedTriage === 'overeating' && <CheckCircle2 className="w-5 h-5 text-pri-text" />}
                  </div>
                  <h3 className="font-bold text-sm text-ink">Emotional eating</h3>
                  <p className="text-sm text-ink-2 mt-1">
                    Eating to cope with feelings. Help noticing emotional hunger and what triggers it.
                  </p>
                </button>

              </div>
            </div>
          )}

          {/* STEP 4: The three ways 4Life supports you */}
          {step === 4 && (
            <div className="space-y-5 animate-fadeIn">
              <div>
                <h2 className="text-lg font-bold text-ink">Your support is ready</h2>
                <p className="text-sm text-ink-2 mt-1">
                  4Life gives you three kinds of help. Pick where you would like to start — you can reach all three from the menu at any time.
                </p>
              </div>

              <div className="grid grid-cols-1 gap-3">
                {[
                  {
                    id: 'chat',
                    icon: <MessageSquare className="w-6 h-6" />,
                    title: 'AI CBT therapy',
                    text: `Talk to ${profile.aiName || '4Life'} any time. Ride out a craving, or work through a thought step by step with a CBT thought record.`,
                  },
                  {
                    id: 'community',
                    icon: <Globe className="w-6 h-6" />,
                    title: 'Global Village',
                    text: 'Share and read stories anonymously, and join live group circles with other people in recovery.',
                  },
                  {
                    id: 'emergency_map',
                    icon: <Phone className="w-6 h-6" />,
                    title: 'Instant EMS',
                    text: 'Call 112 in one tap, send your location to your support person, and find the nearest hospital or ambulance.',
                  },
                ].map(f => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => handleFinishOnboarding(f.id)}
                    className="flex items-start gap-4 p-4 rounded-2xl border border-line bg-bg hover:border-pri-text hover:bg-pri-soft text-left transition-colors cursor-pointer"
                  >
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-pri text-[#fff]" aria-hidden="true">
                      {f.icon}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-base font-bold text-ink">{f.title}</span>
                      <span className="block text-sm text-ink-2 mt-0.5 leading-relaxed">{f.text}</span>
                    </span>
                    <ArrowRight className="w-5 h-5 text-pri-text shrink-0 mt-3" aria-hidden="true" />
                  </button>
                ))}
              </div>

              <div className="p-4 rounded-2xl bg-danger-soft border border-danger/20 flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-danger-text shrink-0 mt-0.5" aria-hidden="true" />
                <p className="text-sm text-ink leading-relaxed m-0">
                  <strong>In danger right now?</strong> Call <a href="tel:112" className="font-bold text-danger-text underline">112</a>. The red SOS button is on every screen.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer Navigation Buttons */}
        <div className="bg-bg p-4 sm:p-6 border-t border-line flex items-center justify-between">
          {step > 1 ? (
            <button
              type="button"
              onClick={() => setStep(step - 1)}
              className="flex min-h-12 items-center gap-1.5 px-4 rounded-xl text-ink-2 hover:bg-muted font-bold text-base transition-colors cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
              Back
            </button>
          ) : (
            <div></div>
          )}

          {step < 4 ? (
            <button
              type="button"
              onClick={() => {
                if (step === 1 && ageProblem) {
                  setShowAgeError(true);
                  return;
                }
                setStep(step + 1);
              }}
              className="flex min-h-12 items-center gap-1.5 px-6 rounded-xl bg-pri hover:bg-pri-hover text-[#fff] font-bold text-base transition-colors ml-auto cursor-pointer"
            >
              <span>Continue</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => handleFinishOnboarding()}
              className="flex min-h-12 items-center gap-1.5 px-6 rounded-xl bg-pri hover:bg-pri-hover text-[#fff] font-bold text-base transition-colors ml-auto cursor-pointer"
            >
              <span>Go to Home</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          )}
        </div>

      </div>
    </div>
  );
};
