/**
 * "My safety plan" on the Instant EMS screen: one screen with what to do
 * in a hard moment, step by step. Filled in once (about 5 minutes) and
 * changed any time. A counsellor the person is linked with can help too.
 */
import React, { useEffect, useState } from 'react';
import { Pencil, Phone, ShieldCheck, Plus, Check } from 'lucide-react';
import type { UserProfile } from '../../types';
import { EMPTY_PLAN, PLAN_IDEAS, PLAN_LIMITS, loadSafetyPlan, planIsEmpty, saveSafetyPlan, type MySafetyPlan } from '../../lib/safetyPlan';
import { CHECKED_HOTLINES, telHref } from '../../lib/ems';
import { friendlyError, isRemote } from '../../lib/supabase';
import { useAction } from '../../lib/actions';
import { Button, Card, Field, Modal, Notice, cx, textareaClass } from '../ui';

import { t as tr, msg } from '../../i18n';
type PartKey = keyof Omit<MySafetyPlan, 'updatedAt'>;

const PARTS: Array<{ key: PartKey; title: string; ask: string; hint: string }> = [
  { key: 'warningSigns', title: msg('My warning signs'), ask: msg('What tells you a hard moment is starting?'), hint: msg('Thoughts, feelings, places, times of day.') },
  { key: 'copingSteps', title: msg('Things I can do on my own'), ask: msg('What helps you get through it, by yourself?'), hint: msg('Small, easy things you can do right away.') },
  { key: 'safePlaces', title: msg('Safe places I can go'), ask: msg('Where do you feel safe and away from temptation?'), hint: msg('Places with people around are best.') },
  { key: 'supportPeople', title: msg('People I can call'), ask: msg('Who else can you reach out to?'), hint: msg('Your support people from Settings are already included.') },
  { key: 'reasons', title: msg('My reasons to keep going'), ask: msg('What matters most to you?'), hint: msg('People, hopes, plans — anything that keeps you going.') },
];

const lines = (t: string) =>
  t
    .split(/\n|·|;/)
    .map(x => x.trim())
    .filter(Boolean);

export const SafetyPlanCard: React.FC<{ profile: UserProfile; id?: string }> = ({ profile, id = 'safety-plan' }) => {
  const [plan, setPlan] = useState<MySafetyPlan>(EMPTY_PLAN);
  const [loaded, setLoaded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<MySafetyPlan>(EMPTY_PLAN);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    loadSafetyPlan(profile)
      .then(setPlan)
      .catch(e => setError(friendlyError(e)))
      .finally(() => setLoaded(true));
  }, [profile.id]);

  // From quick search: "My safety plan"
  useAction('safety-plan', () => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }));

  const contacts = profile.contacts || [];
  const pros = CHECKED_HOTLINES.filter(h => ['gh-112', 'gh-193', 'gh-yonkodo'].includes(h.id));
  const empty = planIsEmpty(plan);

  const open = () => {
    setDraft(plan);
    setError('');
    setEditing(true);
  };
  const addIdea = (k: PartKey, idea: string) =>
    setDraft(d => {
      const cur = d[k].trim();
      if (lines(cur).includes(idea)) return d;
      return { ...d, [k]: (cur ? `${cur}\n${idea}` : idea).slice(0, PLAN_LIMITS[k]) };
    });
  const save = async () => {
    setSaving(true);
    setError('');
    try {
      setPlan(await saveSafetyPlan(profile, draft));
      setEditing(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 5000);
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card as="section" raised id={id} aria-labelledby={`${id}-h`} className="flex scroll-mt-24 flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id={`${id}-h`} className="m-0 flex items-center gap-2 text-xl font-bold text-ink">
            <ShieldCheck className="h-6 w-6 text-pri-text" aria-hidden="true" /> {tr("My safety plan")}
          </h2>
          <p className="m-0 mt-1 text-[0.9375rem] text-ink-2">
            {empty ? tr("Your steps for a hard moment, in one place. It takes about 5 minutes.") : tr("Go through it from the top. Move on to the next step if one doesn’t help.")}
          </p>
        </div>
        {loaded && (
          <Button variant={empty ? 'primary' : 'secondary'} icon={empty ? <Plus className="h-5 w-5" /> : <Pencil className="h-4 w-4" />} onClick={open}>
            {empty ? tr("Make my plan") : tr("Edit")}
          </Button>
        )}
      </div>

      {saved && (
        <Notice icon={<Check className="h-5 w-5" />} className="font-bold">
          {tr("Your safety plan is saved")}{isRemote ? tr(" — your counsellor can see it and help with it") : tr(" on this phone")}.
        </Notice>
      )}
      {error && !editing && <Notice tone="warn">{tr(error)}</Notice>}

      {!empty && (
        <ol className="m-0 flex list-none flex-col gap-3 p-0">
          {PARTS.map((part, i) => {
            const items = lines(plan[part.key]);
            const showContacts = part.key === 'supportPeople' && contacts.length > 0;
            if (!items.length && !showContacts) return null;
            return (
              <li key={part.key} className="flex gap-3.5 rounded-xl bg-bg p-4">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-pri text-sm font-extrabold text-[#fff]" aria-hidden="true">
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <h3 className="m-0 text-base font-bold text-ink">{tr(part.title)}</h3>
                  {items.length > 0 && (
                    <ul className="m-0 mt-1.5 flex flex-col gap-1 pl-4 text-[0.9375rem] leading-relaxed text-ink-2">
                      {items.map(x => (
                        <li key={x}>{x}</li>
                      ))}
                    </ul>
                  )}
                  {showContacts && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {contacts.map(c => (
                        <a
                          key={c.id}
                          href={telHref(c.phone)}
                          className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-line bg-surface px-3.5 text-[0.9375rem] font-bold text-ink no-underline hover:border-pri-text"
                        >
                          <Phone className="h-4 w-4 text-pri-text" aria-hidden="true" /> {c.name.split(' (')[0]}
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              </li>
            );
          })}
          <li className="flex gap-3.5 rounded-xl bg-danger-soft p-4">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-danger text-sm font-extrabold text-[#fff]" aria-hidden="true">
              {PARTS.length + 1}
            </span>
            <div className="min-w-0 flex-1">
              <h3 className="m-0 text-base font-bold text-ink">{tr("Professional help, any time")}</h3>
              <div className="mt-2 flex flex-wrap gap-2">
                {pros.map(h => (
                  <a
                    key={h.id}
                    href={telHref(h.number)}
                    className={cx(
                      'inline-flex min-h-11 items-center gap-2 rounded-xl px-3.5 text-[0.9375rem] font-bold no-underline',
                      h.id === 'gh-112' ? 'bg-danger text-[#fff] hover:bg-danger-hover' : 'border border-line bg-surface text-ink hover:border-pri-text'
                    )}
                  >
                    <Phone className="h-4 w-4" aria-hidden="true" /> {h.number} · {tr(h.label)}
                  </a>
                ))}
              </div>
            </div>
          </li>
        </ol>
      )}

      <Modal
        isOpen={editing}
        onClose={() => setEditing(false)}
        title={tr("My safety plan")}
        subtitle={tr("Write in your own words. Tap an idea to add it. You can change this any time.")}
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditing(false)}>
              {tr("Cancel")}
            </Button>
            <Button onClick={save} disabled={saving} icon={<Check className="h-5 w-5" />}>
              {saving ? tr("Saving…") : tr("Save my plan")}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-6">
          {error && <Notice tone="warn">{tr(error)}</Notice>}
          {PARTS.map((part, i) => (
            <div key={part.key} className="flex flex-col gap-2">
              <Field label={`${i + 1}. ${tr(part.ask)}`} htmlFor={`sp-${part.key}`} hint={tr(part.hint)}>
                <textarea
                  id={`sp-${part.key}`}
                  rows={2}
                  maxLength={PLAN_LIMITS[part.key]}
                  value={draft[part.key]}
                  onChange={e => setDraft(d => ({ ...d, [part.key]: e.target.value }))}
                  className={textareaClass}
                  placeholder={tr("One idea per line")}
                />
              </Field>
              {PLAN_IDEAS[part.key].length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {PLAN_IDEAS[part.key].map(idea => (
                    <button
                      key={idea}
                      type="button"
                      onClick={() => addIdea(part.key, tr(idea))}
                      className="inline-flex min-h-10 items-center rounded-full border border-dashed border-line px-3 text-sm font-semibold text-ink-2 hover:border-pri-text hover:text-ink cursor-pointer"
                    >
                      + {tr(idea)}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
          <p className="m-0 text-sm text-ink-3">
            {isRemote ? tr("Saved to your account. A counsellor you are linked with can see it and help with it.") : tr("Saved on this phone only.")}
          </p>
        </div>
      </Modal>
    </Card>
  );
};
