import React, { useMemo, useState } from 'react';
import { UserProfile, UserContact, TriageCategory } from '../../types';
import { USER_AVATARS, AI_AVATARS } from '../../data/forumData';
import { WORLD_RELIGIONS, SELECTABLE_LANGUAGES } from '../../data/religionsData';
import { changeLanguage } from '../../utils/translateUtils';
import { friendlyError, isRemote } from '../../lib/supabase';
import { exportMyData } from '../../lib/db/clientApi';
import { useMovingBackground } from '../../lib/motion';
import { asThemePref } from '../../lib/theme';
import { ThemeChoice } from '../ThemeChoice';
import { useAction } from '../../lib/actions';
import { MAX_AGE, MIN_AGE, ageDigits, ageError } from '../../lib/age';
import { LanguageSwitcherModal } from '../modals/LanguageSwitcherModal';
import { Card, SectionHeader, Button, ChoiceCard, Chip, Field, Notice, Badge, Avatar, IconButton, Switch, inputClass, cx } from '../ui';
import {
  User,
  Target,
  BookOpen,
  Users,
  Globe,
  Sparkles,
  Lock,
  Plus,
  Trash2,
  Check,
  Download,
  RefreshCw,
  LogOut,
  Phone,
  Mail,
  Palette,
} from 'lucide-react';

import { t, T, msg } from '../../i18n';
import { PrivacyLink } from '../privacy/PrivacyLink';
interface SettingsProfileTabProps {
  profile: UserProfile;
  setProfile: React.Dispatch<React.SetStateAction<UserProfile>>;
  onRestartOnboarding: () => void;
  onLogout?: () => void;
  /** Opens the full Language page */
  onOpenLanguage?: () => void;
}

type Section = 'profile' | 'recovery' | 'beliefs' | 'contacts' | 'display' | 'appearance' | 'companion' | 'privacy';

const SECTIONS: Array<{ id: Section; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { id: 'profile', label: msg('Profile'), icon: User },
  { id: 'recovery', label: msg('Recovery focus'), icon: Target },
  { id: 'beliefs', label: msg('Faith and beliefs'), icon: BookOpen },
  { id: 'contacts', label: msg('Support people'), icon: Users },
  { id: 'display', label: msg('Language'), icon: Globe },
  { id: 'appearance', label: msg('Appearance'), icon: Palette },
  { id: 'companion', label: msg('AI companion'), icon: Sparkles },
  { id: 'privacy', label: msg('Privacy and data'), icon: Lock },
];

/* Fields edited as a draft and saved with the "Save changes" bar */
const DRAFT_KEYS: Array<keyof UserProfile> = [
  'name',
  'nickname',
  'age',
  'gender',
  'region',
  'address',
  'userAvatar',
  'currentTriage',
  'sobrietyStreakDays',
  'currentCraving',
  'belief',
  'religion',
  'religionType',
  'aiName',
  'voiceTone',
  'aiAvatar',
  'pinCode',
];

const FOCUS_OPTIONS: Array<{ id: TriageCategory; title: string; description: string }> = [
  { id: 'substance', title: msg('Drugs and alcohol'), description: msg('Craving support, blocked drug and alcohol ads, counselor matching.') },
  { id: 'porn_social', title: msg('Screen time and adult content'), description: msg('Web filter for adult sites and late-night scrolling limits.') },
  { id: 'anger', title: msg('Anger and stress'), description: msg('Heart-rate alerts from your watch and calming prompts.') },
  { id: 'overeating', title: msg('Emotional eating'), description: msg('Food swaps, mindful eating and sugar-craving support.') },
  { id: 'general', title: msg('Stress and anxiety'), description: msg('Everyday calm, sleep and grounding tools.') },
];

const TEXT_SIZES: Array<{ id: 'sm' | 'md' | 'lg' | 'xl'; label: string; preview: string }> = [
  { id: 'sm', label: msg('Small'), preview: 'text-lg' },
  { id: 'md', label: msg('Normal'), preview: 'text-[1.375rem]' },
  { id: 'lg', label: msg('Large'), preview: 'text-[1.625rem]' },
  { id: 'xl', label: msg('Extra large'), preview: 'text-[1.875rem]' },
];

const REGIONS = [
  msg('Greater Accra (Accra, Tema, Madina)'),
  msg('Ashanti Region (Kumasi, Obuasi)'),
  msg('Western Region (Sekondi-Takoradi)'),
  msg('Central Region (Cape Coast, Winneba)'),
  msg('Northern Region (Tamale)'),
  msg('Eastern Region (Koforidua)'),
  msg('Volta Region (Ho, Keta)'),
  msg('Bono Region (Sunyani)'),
  msg('Upper East / Upper West'),
  msg('Diaspora / International'),
];

export const SettingsProfileTab: React.FC<SettingsProfileTabProps> = ({ profile, setProfile, onRestartOnboarding, onLogout, onOpenLanguage }) => {
  const [movingBg, setMovingBg] = useMovingBackground();
  const [section, setSection] = useState<Section>('profile');
  const theme = asThemePref(profile.theme);
  useAction('appearance', () => setSection('appearance')); // from quick search (Ctrl/⌘ K)
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [isLangModalOpen, setIsLangModalOpen] = useState(false);
  const [exported, setExported] = useState(false);

  // New contact form
  const [showAddContact, setShowAddContact] = useState(false);
  const [newContactName, setNewContactName] = useState('');
  const [newContactPhone, setNewContactPhone] = useState('');
  const [newContactEmail, setNewContactEmail] = useState('');
  const [newContactRelation, setNewContactRelation] = useState(msg('Close Friend'));
  const [newContactPrimary, setNewContactPrimary] = useState(false);

  // Draft copy for easy editing
  const [localProfile, setLocalProfile] = useState<UserProfile>({ ...profile });
  const draft = (patch: Partial<UserProfile>) => setLocalProfile(prev => ({ ...prev, ...patch }));

  // Age can be blank, but a wrong one is not saved (the database would quietly drop it)
  const ageProblem = String(localProfile.age ?? '').trim() ? ageError(localProfile.age) : '';
  const isDirty = useMemo(() => DRAFT_KEYS.some(k => JSON.stringify(localProfile[k]) !== JSON.stringify(profile[k])), [localProfile, profile]);

  const flash = (msg: string) => {
    setSaveMessage(msg);
    setTimeout(() => setSaveMessage(null), 3000);
  };

  /** Settings that apply straight away (language, theme, text size, contacts) also update the draft. */
  const applyNow = (patch: Partial<UserProfile>, msg = 'Saved') => {
    setLocalProfile(prev => ({ ...prev, ...patch }));
    setProfile(prev => ({ ...prev, ...patch }));
    flash(msg);
  };

  const handleSave = () => {
    if (ageProblem) {
      setSection('profile');
      return;
    }
    const patch: Partial<UserProfile> = {};
    DRAFT_KEYS.forEach(k => ((patch as any)[k] = localProfile[k]));
    setProfile(prev => ({ ...prev, ...patch }));
    flash(msg('Your changes are saved.'));
  };

  const handleDiscard = () => {
    setLocalProfile(prev => {
      const reset = { ...prev };
      DRAFT_KEYS.forEach(k => ((reset as any)[k] = profile[k]));
      return reset;
    });
  };

  const handleLanguageChange = (code: string) => {
    applyNow({ language: code }, msg('Language updated'));
    changeLanguage(code);
  };

  const handleAddContact = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newContactName.trim() || !newContactPhone.trim()) return;
    const contacts = localProfile.contacts || [];
    const makePrimary = newContactPrimary || contacts.length === 0;
    const newContact: UserContact = {
      id: 'contact_' + Date.now(),
      name: newContactName.trim(),
      phone: newContactPhone.trim(),
      email: newContactEmail.trim() || undefined,
      relationship: newContactRelation,
      relation: newContactRelation,
      isPrimary: makePrimary,
      autoDailyCheckin: true,
      autoPromptEnabled: true,
    };
    const updated = [...contacts.map(c => (makePrimary ? { ...c, isPrimary: false } : c)), newContact];
    applyNow({ contacts: updated }, `${newContact.name} added`);
    setNewContactName('');
    setNewContactPhone('');
    setNewContactEmail('');
    setNewContactRelation(msg('Close Friend'));
    setNewContactPrimary(false);
    setShowAddContact(false);
  };

  const handleRemoveContact = (id: string) => applyNow({ contacts: (localProfile.contacts || []).filter(c => c.id !== id) }, msg('Support person removed'));

  const handleMakePrimary = (id: string) => applyNow({ contacts: (localProfile.contacts || []).map(c => ({ ...c, isPrimary: c.id === id })) }, msg('Main contact updated'));

  const handleExportData = async () => {
    // With Supabase: everything stored about you on the server. On this device: your profile.
    let payload: unknown = profile;
    if (isRemote) {
      try {
        payload = await exportMyData();
      } catch (e) {
        flash(friendlyError(e));
        return;
      }
    }
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(payload, null, 2));
    const a = document.createElement('a');
    a.setAttribute('href', dataStr);
    a.setAttribute('download', `4life_recovery_profile_${profile.nickname || 'user'}.json`);
    document.body.appendChild(a);
    a.click();
    a.remove();
    setExported(true);
    setTimeout(() => setExported(false), 3000);
  };

  const currentLang = SELECTABLE_LANGUAGES.find(l => l.code === (profile.language || 'en')) || SELECTABLE_LANGUAGES[0];
  const regionalLanguages = SELECTABLE_LANGUAGES.filter(l => ['en', 'fr', 'yo', 'ig', 'sw', 'ar', 'pt', 'es'].includes(l.code));
  const contacts = localProfile.contacts || [];

  return (
    <div className="flex flex-col gap-6 animate-fadeIn">
      <div className="grid items-start gap-6 lg:grid-cols-[230px_minmax(0,1fr)] lg:gap-8">
        {/* Section menu: a list on desktop, a scrolling row on phones */}
        <nav aria-label={t("Settings sections")} className="no-scrollbar fade-x -mx-1 flex gap-1 overflow-x-auto px-1 pb-1 lg:sticky lg:top-24 lg:mx-0 lg:flex-col lg:overflow-visible lg:px-0">
          {SECTIONS.map(s => {
            const Icon = s.icon;
            const on = section === s.id;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => setSection(s.id)}
                aria-current={on ? 'page' : undefined}
                className={cx(
                  'flex min-h-11 shrink-0 items-center gap-3 whitespace-nowrap rounded-xl px-3.5 text-left text-[0.9375rem] cursor-pointer',
                  on ? 'bg-surface font-bold text-ink shadow-card ring-1 ring-line' : 'font-semibold text-ink-2 hover:bg-muted'
                )}
              >
                <Icon className={cx('h-5 w-5 shrink-0', on ? 'text-pri-text' : 'text-ink-3')} aria-hidden="true" />
                {t(s.label)}
              </button>
            );
          })}
          {onLogout && (
            <button
              type="button"
              onClick={onLogout}
              className="flex min-h-11 shrink-0 items-center gap-3 whitespace-nowrap rounded-xl px-3.5 text-[0.9375rem] font-bold text-danger-text hover:bg-danger-soft lg:mt-4 cursor-pointer"
            >
              <LogOut className="h-5 w-5" aria-hidden="true" /> {t("Log out")}
            </button>
          )}
        </nav>

        <div className="flex min-w-0 flex-col gap-6">
          {saveMessage && <Notice icon={<Check className="h-5 w-5" />} className="font-bold">{t(saveMessage)}</Notice>}

          {/* PROFILE */}
          {section === 'profile' && (
            <Card as="section" aria-labelledby="s-profile" className="flex flex-col gap-6">
              <SectionHeader id="s-profile" title={t("Profile")} subtitle={t("Only your nickname and avatar are shown to others in the Village.")} />
              <div className="grid gap-5 sm:grid-cols-2">
                <Field label={t("Full name")} htmlFor="f-name" hint={t("Private — never shown to others.")}>
                  <input id="f-name" type="text" value={localProfile.name || ''} onChange={e => draft({ name: e.target.value })} className={inputClass} />
                </Field>
                <Field label={t("Nickname")} htmlFor="f-nick" hint={t("How you appear in the Village.")}>
                  <input id="f-nick" type="text" value={localProfile.nickname || ''} onChange={e => draft({ nickname: e.target.value })} className={inputClass} />
                </Field>
                <Field label={t("Age")} htmlFor="f-age" hint={ageProblem ? undefined : t("In years, from {MIN_AGE} to {MAX_AGE}.", { MIN_AGE, MAX_AGE })}>
                  <input id="f-age" type="text" inputMode="numeric" autoComplete="off" maxLength={3} aria-invalid={!!ageProblem} value={localProfile.age || ''} onChange={e => draft({ age: ageDigits(e.target.value) })} className={inputClass} />
                  {ageProblem && <p role="alert" className="m-0 text-sm text-danger-text">{t(ageProblem)}</p>}
                </Field>
                <Field label={t("Gender")} htmlFor="f-gender">
                  <select id="f-gender" value={localProfile.gender || 'Prefer not to say'} onChange={e => draft({ gender: e.target.value })} className={inputClass}>
                    <option value="Male">{t("Male")}</option>
                    <option value="Female">{t("Female")}</option>
                    <option value="Non-Binary">{t("Non-Binary")}</option>
                    <option value="Prefer not to say">{t("Prefer not to say")}</option>
                  </select>
                </Field>
                <Field label={t("Region")} htmlFor="f-region">
                  <select id="f-region" value={localProfile.region || REGIONS[0]} onChange={e => draft({ region: e.target.value })} className={inputClass}>
                    {!REGIONS.includes(localProfile.region) && localProfile.region && <option value={localProfile.region}>{localProfile.region}</option>}
                    {REGIONS.map(r => (
                      <option key={r} value={r}>{t(r)}</option>
                    ))}
                  </select>
                </Field>
                <Field label={t("Area or suburb")} htmlFor="f-area" optional hint={t("Helps emergency services find you faster.")}>
                  <input id="f-area" type="text" value={localProfile.address || ''} onChange={e => draft({ address: e.target.value })} placeholder={t("for example: East Legon, Accra")} className={inputClass} />
                </Field>
              </div>
              <div className="flex flex-col gap-2.5">
                <p className="m-0 text-sm font-bold text-ink">{t("Village avatar")}</p>
                <div className="flex flex-wrap gap-2" role="group" aria-label={t("Village avatar")}>
                  {USER_AVATARS.map(av => {
                    const on = localProfile.userAvatar === av.emoji;
                    return (
                      <button
                        key={av.id}
                        type="button"
                        aria-pressed={on}
                        aria-label={t(av.label)}
                        title={t(av.label)}
                        onClick={() => draft({ userAvatar: av.emoji })}
                        className={cx('flex h-12 w-12 items-center justify-center rounded-full border-2 text-2xl cursor-pointer', on ? 'border-pri bg-pri-soft' : 'border-line bg-surface hover:border-pri-text')}
                      >
                        <span aria-hidden="true">{av.emoji}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </Card>
          )}

          {/* RECOVERY FOCUS */}
          {section === 'recovery' && (
            <Card as="section" aria-labelledby="s-rec" className="flex flex-col gap-6">
              <SectionHeader id="s-rec" title={t("Recovery focus")} subtitle={t("This shapes the advice you get from AI therapy and the Village.")} />
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" role="group" aria-label={t("Main focus")}>
                {FOCUS_OPTIONS.map(f => (
                  <ChoiceCard key={f.id} selected={localProfile.currentTriage === f.id} onClick={() => draft({ currentTriage: f.id })} title={t(f.title)} description={t(f.description)} />
                ))}
              </div>
              <div className="grid gap-5 sm:grid-cols-2">
                <Field label={t("Days clean")} htmlFor="f-streak" hint={t("Change this if you want to restart or correct your streak.")}>
                  <input
                    id="f-streak"
                    type="number"
                    min={0}
                    value={localProfile.sobrietyStreakDays}
                    onChange={e => draft({ sobrietyStreakDays: parseInt(e.target.value, 10) || 0 })}
                    className={inputClass}
                  />
                </Field>
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-baseline justify-between">
                    <label htmlFor="f-craving" className="text-sm font-bold text-ink">
                      {t("Usual craving level")}
                    </label>
                    <T text="<0>{currentCraving} of 10</0>" parts={[<span className="text-sm font-bold text-pri-text" />]} vars={{ currentCraving: localProfile.currentCraving }} />
                  </div>
                  <input
                    id="f-craving"
                    type="range"
                    min={1}
                    max={10}
                    value={localProfile.currentCraving}
                    onChange={e => draft({ currentCraving: parseInt(e.target.value, 10) || 1 })}
                    className="h-12 w-full cursor-pointer"
                  />
                  <div className="flex justify-between text-sm text-ink-3">
                    <T text="<0>1 · Calm</0><1>10 · Severe</1>" parts={[<span />, <span />]} />
                  </div>
                </div>
              </div>
            </Card>
          )}

          {/* BELIEFS */}
          {section === 'beliefs' && (
            <Card as="section" aria-labelledby="s-bel" className="flex flex-col gap-6">
              <SectionHeader id="s-bel" title={t("Faith and beliefs")} subtitle={t("Shapes how AI therapy encourages you: with your faith, or with practical science. Change it any time.")} />
              <div className="grid gap-3 sm:grid-cols-2" role="group" aria-label={t("Kind of encouragement")}>
                <ChoiceCard
                  selected={localProfile.belief === 'theist'}
                  onClick={() => draft({ belief: 'theist' })}
                  title={t("Faith-based")}
                  description={t("Scripture, prayer and trust in a higher power.")}
                />
                <ChoiceCard
                  selected={localProfile.belief === 'secular'}
                  onClick={() => draft({ belief: 'secular' })}
                  title={t("Science-based")}
                  description={t("How the brain heals, habits and practical psychology.")}
                />
              </div>
              <Field label={t("Religion or tradition")} htmlFor="f-religion">
                <select
                  id="f-religion"
                  value={localProfile.religion || 'christianity'}
                  onChange={e => {
                    const val = e.target.value;
                    const found = WORLD_RELIGIONS.find(r => r.id === val);
                    draft({
                      religion: val,
                      religionType: (found ? found.name : val) as any,
                      belief: ['secular_atheist', 'science', 'humanism'].includes(val) ? 'secular' : 'theist',
                    });
                  }}
                  className={inputClass}
                >
                  {WORLD_RELIGIONS.map(r => (
                    <option key={r.id} value={r.id}>
                      {t(r.name)}
                    </option>
                  ))}
                </select>
              </Field>
            </Card>
          )}

          {/* SUPPORT PEOPLE */}
          {section === 'contacts' && (
            <Card as="section" aria-labelledby="s-con" className="flex flex-col gap-5">
              <SectionHeader
                id="s-con"
                title={t("Support people")}
                subtitle={t("When you press SOS, the app gets a message ready for them. You press send, on your own phone.")}
                action={
                  !showAddContact && (
                    <Button variant="secondary" onClick={() => setShowAddContact(true)} icon={<Plus className="h-5 w-5" />}>
                      {t("Add person")}
                    </Button>
                  )
                }
              />

              {showAddContact && (
                <form onSubmit={handleAddContact} className="flex flex-col gap-4 rounded-2xl bg-bg p-5 animate-fadeIn">
                  <h3 className="m-0 text-lg font-bold text-ink">{t("Add a support person")}</h3>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label={t("Name")} htmlFor="c-name">
                      <input id="c-name" type="text" required value={newContactName} onChange={e => setNewContactName(e.target.value)} placeholder={t("for example: Pastor Samuel")} className={cx(inputClass, 'bg-surface')} />
                    </Field>
                    <Field label={t("Phone number")} htmlFor="c-phone">
                      <input id="c-phone" type="tel" required value={newContactPhone} onChange={e => setNewContactPhone(e.target.value)} placeholder="+233 24 123 4567" className={cx(inputClass, 'bg-surface')} />
                    </Field>
                    <Field label={t("Email")} htmlFor="c-email" optional>
                      <input id="c-email" type="email" value={newContactEmail} onChange={e => setNewContactEmail(e.target.value)} className={cx(inputClass, 'bg-surface')} />
                    </Field>
                    <Field label={t("Relationship")} htmlFor="c-rel">
                      <select id="c-rel" value={newContactRelation} onChange={e => setNewContactRelation(e.target.value)} className={cx(inputClass, 'bg-surface')}>
                        <option value="Sponsor / Mentor">{t("Sponsor / Mentor")}</option>
                        <option value="Parent / Family">{t("Parent / Family")}</option>
                        <option value="Spouse / Partner">{t("Spouse / Partner")}</option>
                        <option value="Therapist / Doctor">{t("Therapist / Doctor")}</option>
                        <option value="Close Friend">{t("Close Friend")}</option>
                        <option value="Religious Leader">{t("Religious Leader")}</option>
                      </select>
                    </Field>
                  </div>
                  <label className="flex min-h-11 items-center gap-3 text-base font-semibold text-ink cursor-pointer">
                    <input type="checkbox" checked={newContactPrimary} onChange={e => setNewContactPrimary(e.target.checked)} className="h-5 w-5" />
                    {t("Make this my main SOS contact")}
                  </label>
                  <div className="flex flex-wrap justify-end gap-3">
                    <Button variant="ghost" onClick={() => setShowAddContact(false)}>
                      {t("Cancel")}
                    </Button>
                    <Button type="submit">{t("Save person")}</Button>
                  </div>
                </form>
              )}

              {contacts.length === 0 ? (
                <Notice tone="warn">{t("You have not added anyone yet. Add at least one person you trust.")}</Notice>
              ) : (
                <ul className="m-0 flex list-none flex-col p-0">
                  {contacts.map((c, i) => (
                    <li key={c.id} className={cx('flex flex-wrap items-center gap-4 py-4', i > 0 && 'border-t border-line')}>
                      <Avatar name={c.name} size={48} />
                      <div className="min-w-[200px] flex-1">
                        <p className="m-0 flex flex-wrap items-center gap-2 text-base font-bold text-ink">
                          {c.name}
                          {c.isPrimary && <Badge tone="pri" className="px-2.5 py-0.5 text-xs">{t("Main contact")}</Badge>}
                        </p>
                        <p className="m-0 text-[0.9375rem] text-ink-2">{c.relationship || c.relation || t("Support person")}</p>
                        <p className="m-0 mt-0.5 flex flex-wrap gap-x-4 text-[0.9375rem] text-ink-3">
                          <span className="inline-flex items-center gap-1.5">
                            <Phone className="h-4 w-4" aria-hidden="true" /> {c.phone}
                          </span>
                          {c.email && (
                            <span className="inline-flex items-center gap-1.5">
                              <Mail className="h-4 w-4" aria-hidden="true" /> {c.email}
                            </span>
                          )}
                        </p>
                      </div>
                      <div className="flex items-center gap-1">
                        {!c.isPrimary && (
                          <Button variant="ghost" size="sm" onClick={() => handleMakePrimary(c.id)}>
                            {t("Make main contact")}
                          </Button>
                        )}
                        <IconButton label={t("Remove {name}", { name: c.name })} variant="ghost" onClick={() => handleRemoveContact(c.id)}>
                          <Trash2 className="h-5 w-5" />
                        </IconButton>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          )}

          {/* BLOCKED SITES */}

          {/* LANGUAGE & DISPLAY */}
          {section === 'display' && (
            <Card as="section" aria-labelledby="s-disp" className="flex flex-col gap-7">
              <SectionHeader id="s-disp" title={t("Language")} subtitle={t("These apply straight away.")} />

              <div className="flex flex-col gap-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="m-0 text-sm font-bold text-ink">{t("Language")}</p>
                    <p className="m-0 text-base text-ink-2">
                      <span translate="no">{currentLang.name}</span> <span className="text-ink-3" translate="no">· {currentLang.nativeName}</span>
                    </p>
                  </div>
                  <Button variant="secondary" onClick={() => (onOpenLanguage ? onOpenLanguage() : setIsLangModalOpen(true))} icon={<Globe className="h-5 w-5" />}>
                    {t("All languages")}
                  </Button>
                </div>
                <div className="flex flex-wrap gap-2" role="group" aria-label={t('Popular languages')}>
                  {regionalLanguages.map(l => (
                    <Chip key={l.code} selected={(profile.language || 'en') === l.code} onClick={() => handleLanguageChange(l.code)}>
                      <span>{l.nativeName}</span>
                    </Chip>
                  ))}
                </div>
              </div>

            </Card>
          )}

          {/* APPEARANCE: the only place the theme is chosen */}
          {section === 'appearance' && (
            <Card as="section" id="appearance" aria-labelledby="s-look" className="flex flex-col gap-7">
              <SectionHeader id="s-look" title={t("Appearance")} subtitle={t("These apply straight away.")} />

              <ThemeChoice value={theme} onChange={(pref, done) => applyNow({ theme: pref }, done)} />

              <div className="flex flex-col gap-3">
                <p className="m-0 text-sm font-bold text-ink">{t("Text size")}</p>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4" role="group" aria-label={t("Text size")}>
                  {TEXT_SIZES.map(s => {
                    const on = (profile.fontSize || 'md') === s.id;
                    return (
                      <button
                        key={s.id}
                        type="button"
                        aria-pressed={on}
                        onClick={() => applyNow({ fontSize: s.id }, t('Text size: {size}', { size: t(s.label) }))}
                        className={cx('flex flex-col items-center gap-1.5 rounded-2xl border-2 p-4 cursor-pointer', on ? 'border-pri bg-pri-soft' : 'border-line bg-surface hover:border-pri-text')}
                      >
                        <T text="<0>Aa</0><1>{label}</1>" parts={[<span className={cx('font-extrabold leading-none text-ink', s.preview)} aria-hidden="true" />, <span className="text-[0.9375rem] font-semibold text-ink" />]} vars={{ label: t(s.label) }} />
                      </button>
                    );
                  })}
                </div>
              </div>

              <Switch
                checked={movingBg}
                onChange={setMovingBg}
                label={t("Moving background")}
                description={t("The green ribbon of mental health awareness, in 3D. It breathes slowly, lifts towards your pointer, flows when you scroll and ripples when you tap empty space. It always stays still on the emergency screen and if your phone is set to reduce motion. Turn it off to save battery.")}
              />
            </Card>
          )}

          {/* AI COMPANION */}
          {section === 'companion' && (
            <Card as="section" aria-labelledby="s-ai" className="flex flex-col gap-6">
              <SectionHeader id="s-ai" title={t("AI companion")} subtitle={t("Give your companion a name and choose how it talks to you.")} />
              <div className="grid gap-5 sm:grid-cols-2">
                <Field label={t("Companion name")} htmlFor="f-ainame">
                  <input id="f-ainame" type="text" value={localProfile.aiName || '4Life'} onChange={e => draft({ aiName: e.target.value })} className={inputClass} />
                </Field>
                <Field label={t("Tone")} htmlFor="f-tone">
                  <select id="f-tone" value={localProfile.voiceTone || 'empathic'} onChange={e => draft({ voiceTone: e.target.value as any })} className={inputClass}>
                    <option value="empathic">{t("Warm and caring")}</option>
                    <option value="grounding">{t("Calm and steady")}</option>
                    <option value="firm_coach">{t("Direct coach")}</option>
                  </select>
                </Field>
              </div>
              <div className="flex flex-col gap-2.5">
                <p className="m-0 text-sm font-bold text-ink">{t("Personality")}</p>
                <div className="grid gap-3 sm:grid-cols-2" role="group" aria-label={t("Companion personality")}>
                  {AI_AVATARS.map(av => (
                    <ChoiceCard
                      key={av.id}
                      selected={localProfile.aiAvatar === av.emoji}
                      onClick={() => draft({ aiAvatar: av.emoji, aiName: av.name.split(' ')[0] })}
                      title={av.name}
                      description={t(av.desc)}
                    />
                  ))}
                </div>
              </div>
            </Card>
          )}

          {/* PRIVACY */}
          {section === 'privacy' && (
            <Card as="section" aria-labelledby="s-priv" className="flex flex-col gap-6">
              <SectionHeader id="s-priv" title={t("Privacy and data")} subtitle={t("Your account and recovery records are kept in 4Life’s cloud database, protected by access rules. Your AI chat stays on this device. Counsellors see only what you choose to share.")} />
              <p className="m-0 -mt-2 text-[0.9375rem] text-ink-2">
                <T text="Read the <0>Privacy Policy</0> to see exactly what is stored, where, who can see it, and your rights." parts={[<PrivacyLink />]} />
              </p>
              <Field label={t("4-digit app PIN")} htmlFor="f-pin" hint={t("Protects your private notes if someone else picks up your phone.")}>
                <input
                  id="f-pin"
                  type="password"
                  inputMode="numeric"
                  maxLength={4}
                  value={localProfile.pinCode || ''}
                  onChange={e => draft({ pinCode: e.target.value.replace(/\D/g, '') })}
                  className={cx(inputClass, 'max-w-[12rem] tracking-[0.4em]')}
                />
              </Field>
              <Switch
                checked={!!profile.shareLocationInCrisis}
                onChange={v => applyNow({ shareLocationInCrisis: v }, v ? msg('Location sharing in a crisis is on') : msg('Location sharing is off'))}
                label={t("Share my location with my counsellor if I press SOS")}
                description={t("Only while an SOS alert you started is open, and only with a counsellor you have booked. It helps them tell emergency services where you are. You can turn this off at any time.")}
              />
              <div className="flex flex-col gap-3 border-t border-line pt-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="m-0 text-base font-bold text-ink">{t("Download my data")}</p>
                    <p className="m-0 text-[0.9375rem] text-ink-3">{t("A copy of the information 4Life holds about your account, as a file.")}</p>
                  </div>
                  <Button variant="secondary" onClick={handleExportData} icon={exported ? <Check className="h-5 w-5" /> : <Download className="h-5 w-5" />}>
                    {exported ? t("Downloaded") : t("Download")}
                  </Button>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
                  <div>
                    <p className="m-0 text-base font-bold text-ink">{t("Run setup again")}</p>
                    <p className="m-0 text-[0.9375rem] text-ink-3">{t("Go back through the welcome steps.")}</p>
                  </div>
                  <Button variant="secondary" onClick={onRestartOnboarding} icon={<RefreshCw className="h-5 w-5" />}>
                    {t("Run setup")}
                  </Button>
                </div>
                {onLogout && (
                  <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
                    <div>
                      <p className="m-0 text-base font-bold text-ink">{t("Log out")}</p>
                      <p className="m-0 text-[0.9375rem] text-ink-3">{t("Sign out of 4Life on this device.")}</p>
                    </div>
                    <Button variant="secondary" onClick={onLogout} icon={<LogOut className="h-5 w-5 text-danger-text" />}>
                      {t("Log out")}
                    </Button>
                  </div>
                )}
              </div>
            </Card>
          )}
        </div>
      </div>

      {/* Save bar: only shown when there is something to save */}
      {isDirty && (
        <div className="sticky bottom-20 z-20 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-surface px-5 py-3.5 shadow-xl lg:bottom-4 animate-fadeIn">
          <p className="m-0 text-base font-semibold text-ink">{t("You have unsaved changes")}</p>
          <div className="flex gap-2.5">
            <Button variant="ghost" onClick={handleDiscard}>
              {t("Discard")}
            </Button>
            <Button onClick={handleSave}>{t("Save changes")}</Button>
          </div>
        </div>
      )}

      <LanguageSwitcherModal isOpen={isLangModalOpen} onClose={() => setIsLangModalOpen(false)} profile={profile} setProfile={setProfile} />
    </div>
  );
};
