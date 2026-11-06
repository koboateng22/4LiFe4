import React, { useState } from 'react';
import { BadgeCheck, Check, Clock, LogOut, Star } from 'lucide-react';
import { Avatar, Badge, Button, Card, Field, Notice, SectionHeader, cx, inputClass, textareaClass } from '../../components/ui';
import type { TherapistProfile } from '../types';
import { APPROACHES, FOCUS_OPTIONS, LANGUAGES, displayName, focusLabel } from '../data';

import { t as tr, T, msg } from '../../i18n';
import { ThemeChoice } from '../../components/ThemeChoice';
import type { ThemePref } from '../../lib/theme';
const pill = (on: boolean) =>
  cx(
    'inline-flex min-h-11 items-center gap-1.5 rounded-full border-2 px-4 text-[0.9375rem] font-semibold transition-colors cursor-pointer',
    on ? 'border-pri bg-pri-soft text-pri-ink' : 'border-line bg-surface text-ink hover:border-pri-text'
  );

/** What clients see, your credentials and your account. */
export const TherapistProfileTab: React.FC<{
  therapist: TherapistProfile;
  onSave: (p: Partial<TherapistProfile>) => void;
  onLogout: () => void;
  theme: ThemePref;
  onChangeTheme: (pref: ThemePref) => void;
}> = ({ therapist, onSave, onLogout, theme, onChangeTheme }) => {
  const [p, setP] = useState({
    title: therapist.title,
    name: therapist.name,
    bio: therapist.bio,
    specialties: therapist.specialties,
    approaches: therapist.approaches,
    languages: therapist.languages,
    practiceLocation: therapist.practiceLocation,
  });
  const [saved, setSaved] = useState(false);
  const set = (patch: Partial<typeof p>) => {
    setP(prev => ({ ...prev, ...patch }));
    setSaved(false);
  };
  const toggle = (key: 'specialties' | 'approaches' | 'languages', v: string) =>
    set({ [key]: p[key].includes(v) ? p[key].filter(x => x !== v) : [...p[key], v] } as Partial<typeof p>);

  const preview = { ...therapist, ...p };

  return (
    <div className="grid gap-6 animate-fadeIn lg:grid-cols-[3fr_2fr]">
      <div className="flex flex-col gap-6">
        {saved && <Notice icon={<Check className="h-5 w-5" />}>{tr("Your profile is saved.")}</Notice>}

        <Card as="section" aria-labelledby="pr-about" className="flex flex-col gap-5">
          <SectionHeader id="pr-about" title={tr("About you")} size="md" />
          <div className="grid gap-4 sm:grid-cols-[8rem_1fr]">
            <Field label={tr("Title")} htmlFor="pr-title">
              <select id="pr-title" value={p.title} onChange={e => set({ title: e.target.value })} className={inputClass}>
                {['Dr.', 'Mr.', 'Ms.', 'Mrs.', ''].map(t => (
                  <option key={t || 'none'} value={t}>
                    {t || tr("None")}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={tr("Full name")} htmlFor="pr-name">
              <input id="pr-name" value={p.name} onChange={e => set({ name: e.target.value })} className={inputClass} />
            </Field>
          </div>
          <Field label={tr("Introduction")} htmlFor="pr-bio" hint={tr("{length} / 400 characters", { length: p.bio.length })}>
            <textarea id="pr-bio" rows={4} maxLength={400} value={p.bio} onChange={e => set({ bio: e.target.value })} className={textareaClass} />
          </Field>
          <Field label={tr("Where you see clients in person")} htmlFor="pr-loc" optional>
            <input id="pr-loc" value={p.practiceLocation} onChange={e => set({ practiceLocation: e.target.value })} className={inputClass} />
          </Field>
        </Card>

        <Card as="section" aria-labelledby="pr-practice" className="flex flex-col gap-5">
          <SectionHeader id="pr-practice" title={tr("Your practice")} size="md" />
          {[
            { key: 'specialties' as const, label: msg('Areas you help with'), items: FOCUS_OPTIONS.map(f => ({ v: f.id, l: f.label })) },
            { key: 'approaches' as const, label: msg('How you work'), items: APPROACHES.map(a => ({ v: a, l: a })) },
            { key: 'languages' as const, label: msg('Languages'), items: LANGUAGES.map(a => ({ v: a, l: a })) },
          ].map(g => (
            <fieldset key={g.key} className="m-0 border-0 p-0">
              <legend className="mb-2 p-0 text-sm font-bold text-ink">{tr(g.label)}</legend>
              <div className="flex flex-wrap gap-2">
                {g.items.map(it => (
                  <button key={it.v} type="button" aria-pressed={p[g.key].includes(it.v)} onClick={() => toggle(g.key, it.v)} className={pill(p[g.key].includes(it.v))}>
                    {p[g.key].includes(it.v) && <Check className="h-4 w-4" aria-hidden="true" />}
                    {it.l}
                  </button>
                ))}
              </div>
            </fieldset>
          ))}
        </Card>

        <Card as="section" aria-labelledby="pr-cred" className="flex flex-col gap-4">
          <SectionHeader id="pr-cred" title={tr("Qualifications")} size="md" subtitle={tr("To change these, contact the 4Life team so we can check them again.")} />
          <dl className="m-0 grid gap-3 sm:grid-cols-2">
            {[
              [tr('Profession'), therapist.profession],
              [tr('Registered with'), therapist.licenseBody],
              [tr('Licence number'), therapist.licenseNumber],
              [tr('Years in practice'), String(therapist.yearsExperience)],
            ].map(([k, v]) => (
              <div key={k} className="rounded-xl bg-bg p-3.5">
                <dt className="text-sm text-ink-3">{k}</dt>
                <dd className="m-0 text-base font-bold text-ink">{v}</dd>
              </div>
            ))}
          </dl>
          {therapist.verification === 'verified' ? (
            <p className="m-0 inline-flex items-center gap-2 text-[0.9375rem] font-semibold text-pri-text">
              <BadgeCheck className="h-5 w-5" aria-hidden="true" /> {tr("Licence verified")}
            </p>
          ) : (
            <p className="m-0 inline-flex items-center gap-2 text-[0.9375rem] font-semibold text-warn">
              <Clock className="h-5 w-5" aria-hidden="true" /> {tr("Verification in progress")}
            </p>
          )}
        </Card>

        {/* The only place in the workspace where the theme is chosen */}
        <Card as="section" aria-labelledby="th-look" className="flex flex-col gap-5">
          <SectionHeader id="th-look" title={tr("Appearance")} subtitle={tr("These apply straight away.")} />
          <ThemeChoice value={theme} onChange={pref => onChangeTheme(pref)} />
        </Card>

        <div className="flex flex-wrap gap-3">
          <Button
            size="lg"
            disabled={!p.name.trim()}
            onClick={() => {
              onSave(p);
              setSaved(true);
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
          >
            {tr("Save profile")}
          </Button>
          <Button size="lg" variant="ghost" icon={<LogOut className="h-5 w-5" />} onClick={onLogout}>
            {tr("Sign out")}
          </Button>
        </div>
      </div>

      {/* Live preview of the public profile */}
      <div className="flex flex-col gap-3 lg:sticky lg:top-24 lg:self-start">
        <p className="m-0 text-sm font-bold text-ink-3">{tr("What clients see")}</p>
        <Card raised className="flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <Avatar tone="muted" name={preview.name} size={56} />
            <div className="min-w-0">
              <p className="m-0 text-base font-bold text-ink">{displayName(preview)}</p>
              <p className="m-0 text-sm text-ink-3">{preview.profession}</p>
            </div>
          </div>
          <p className="m-0 text-[0.9375rem] leading-relaxed text-ink-2">{preview.bio || tr("Your introduction appears here.")}</p>
          <div className="flex flex-wrap gap-1.5">
            {preview.specialties.map(s => (
              <Badge key={s} tone="pri">
                {focusLabel(s)}
              </Badge>
            ))}
          </div>
          <p className="m-0 text-sm text-ink-2">
            {preview.approaches.join(' · ') || tr("No approaches listed")}
            <br />
            {tr("Speaks")} {preview.languages.join(', ') || '—'}
          </p>
          <div className="flex items-center justify-between border-t border-line pt-3.5">
            <p className="m-0 leading-tight">
              <T text="<0>GHS {feeGHS}</0>" parts={[<span className="block text-lg font-extrabold text-ink" />]} vars={{ feeGHS: preview.feeGHS }} />
              <span className="block text-sm text-ink-3">{tr("per session")}{preview.slidingScale ? tr(" · lower fee possible") : ''}</span>
            </p>
            <span className="inline-flex items-center gap-1 text-sm text-ink-3">
              <Star className="h-4 w-4" aria-hidden="true" /> {tr("New")}
            </span>
          </div>
        </Card>
      </div>
    </div>
  );
};
