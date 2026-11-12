import React, { useEffect, useState } from 'react';
import { apiFetch } from '../../lib/apiFetch';
import { assessRisk } from '../../lib/safety';
import { EMOTIONS, TESTING_QUESTIONS, THINKING_TRAPS, guessTrap, trapLabel, type ThoughtRecord, type TrapId } from '../../lib/cbt';
import { saveThoughtRecord } from '../../lib/cbtStore';
import { friendlyError } from '../../lib/supabase';
import type { UserProfile } from '../../types';
import { Button, Chip, Field, Modal, Notice, Switch, cx, inputClass, textareaClass } from '../ui';
import { ArrowLeft, ArrowRight, Check, Lightbulb, Phone, Sparkles } from 'lucide-react';

import { t as tr, T, msg, getLanguage } from '../../i18n';
import { EnglishSafetyNote } from '../ems/EnglishSafetyNote';
import { suggestProfile } from '../../lib/aiProfile';
interface Props {
  isOpen: boolean;
  onClose: () => void;
  profile: UserProfile;
  onSaved: (r: ThoughtRecord) => void;
  onOpenSos: () => void;
  /** Start with this thought already filled in (e.g. from the chat) */
  initialThought?: string;
}

const STEPS = [msg('What happened'), msg('Thought and feeling'), msg('Thinking trap'), msg('Test the thought'), msg('A fairer thought'), msg('How you feel now')] as const;
/* The quick version: what happened → the thought → a kinder thought (steps 4 and 5 on one screen).
   The thinking trap is guessed for you, and the evidence steps are skipped. */
const QUICK_FLOW = [0, 1, 4] as const;
const FULL_FLOW = [0, 1, 2, 3, 4, 5] as const;
const QUICK_NAMES = [msg('What happened'), msg('The thought'), msg('A kinder thought')];

const IntensitySlider: React.FC<{ id: string; label: string; value: number; onChange: (v: number) => void; hint?: string }> = ({ id, label, value, onChange, hint }) => (
  <div className="flex flex-col gap-2">
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <label htmlFor={id} className="text-base font-bold text-ink">
        {tr(label)}
      </label>
      <T text="<0>{value} of 100</0>" parts={[<span className="text-base font-bold text-pri-text" aria-live="polite" />]} vars={{ value }} />
    </div>
    <input id={id} type="range" min={0} max={100} step={5} value={value} onChange={e => onChange(Number(e.target.value))} className="h-7 w-full cursor-pointer" />
    <div className="flex justify-between text-sm text-ink-3">
      <T text="<0>0 · Not at all</0><1>100 · As strong as it gets</1>" parts={[<span />, <span />]} />
    </div>
    {hint && <p className="m-0 text-sm text-ink-3">{tr(hint)}</p>}
  </div>
);

/**
 * A CBT thought record: a quick 3-step version by default, or the full six steps:
 * situation → thought and feeling → thinking trap → evidence → balanced thought → re-rate.
 * Re-rating at the end shows whether the new thought actually helped.
 */
export const ThoughtRecordModal: React.FC<Props> = ({ isOpen, onClose, profile, onSaved, onOpenSos, initialThought }) => {
  const [pos, setPos] = useState(0);
  const [quick, setQuick] = useState(true);
  const flow: readonly number[] = quick ? QUICK_FLOW : FULL_FLOW;
  const step = flow[Math.min(pos, flow.length - 1)];
  const setStep = (f: (p: number) => number) => setPos(f);
  const [situation, setSituation] = useState('');
  const [thought, setThought] = useState('');
  const [emotion, setEmotion] = useState('');
  const [before, setBefore] = useState(70);
  const [trap, setTrap] = useState<TrapId | ''>('');
  const [questions, setQuestions] = useState<string[]>(TESTING_QUESTIONS);
  const [evidenceFor, setEvidenceFor] = useState('');
  const [evidenceAgainst, setEvidenceAgainst] = useState('');
  const [balanced, setBalanced] = useState('');
  const [suggestion, setSuggestion] = useState('');
  const [insight, setInsight] = useState('');
  const [after, setAfter] = useState(50);
  const [shared, setShared] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    setPos(0);
    setQuick(true);
    setSituation('');
    setThought((initialThought || '').slice(0, 600));
    setEmotion('');
    setBefore(70);
    setTrap('');
    setQuestions(TESTING_QUESTIONS);
    setEvidenceFor('');
    setEvidenceAgainst('');
    setBalanced('');
    setSuggestion('');
    setInsight('');
    setAfter(50);
    setShared(false);
    setError('');
  }, [isOpen, initialThought]);

  const crisis = assessRisk(`${situation} ${thought}`).level === 'crisis';

  const suggest = async () => {
    if (!thought.trim() || suggesting) return;
    setSuggesting(true);
    try {
      const res = await apiFetch('/api/cbt/suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ situation, thought, emotion, userProfile: suggestProfile(profile) }),
      });
      if (!res.ok) throw new Error(String(res.status));
      const data = await res.json();
      if (!trap && data.trap) setTrap(data.trap);
      if (Array.isArray(data.questions) && data.questions.length) setQuestions(data.questions);
      if (data.balancedThought) setSuggestion(data.balancedThought);
      if (data.insight) setInsight(data.insight);
    } catch {
      // Offline: a simple guess so the person can keep going
      if (!trap) setTrap(guessTrap(thought));
    } finally {
      setSuggesting(false);
    }
  };

  // Ask for suggestions once, when the person reaches the thinking-trap step (or the kinder-thought step in the quick version)
  useEffect(() => {
    if (isOpen && (step === 2 || (quick && step === 4)) && !trap && thought.trim()) suggest();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  const canNext = [true, !!thought.trim() && !!emotion, !!trap, true, !!balanced.trim(), true][step];
  const isLast = pos >= flow.length - 1;

  const save = async () => {
    const useTrap = trap || guessTrap(thought);
    if (!balanced.trim() || !thought.trim()) return;
    setSaving(true);
    setError('');
    try {
      const rec = await saveThoughtRecord(profile.id || 'guest', profile.nickname, {
        situation: situation.trim(),
        thought: thought.trim(),
        emotion,
        intensityBefore: before,
        trap: useTrap,
        evidenceFor: evidenceFor.trim(),
        evidenceAgainst: evidenceAgainst.trim(),
        balancedThought: balanced.trim(),
        intensityAfter: after,
        shared,
      });
      onSaved(rec);
      onClose();
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setSaving(false);
    }
  };

  const diff = before - after;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={tr("Thought record")}
      subtitle={tr("Step {v0} of {length} · {v2}", { v0: pos + 1, length: flow.length, v2: tr(quick ? QUICK_NAMES[pos] : STEPS[step]) })}
      footer={
        <div className="flex w-full items-center justify-between gap-3">
          {pos > 0 ? (
            <Button variant="ghost" onClick={() => setStep(s => s - 1)} icon={<ArrowLeft className="h-5 w-5" />}>
              {tr("Back")}
            </Button>
          ) : (
            <Button variant="ghost" onClick={onClose}>
              {tr("Cancel")}
            </Button>
          )}
          {!isLast ? (
            <Button onClick={() => setStep(s => s + 1)} disabled={!canNext}>
              {tr("Next")} <ArrowRight className="h-5 w-5" />
            </Button>
          ) : (
            <Button onClick={save} disabled={saving || !balanced.trim()} icon={<Check className="h-5 w-5" />}>
              {saving ? tr("Saving…") : tr("Save thought record")}
            </Button>
          )}
        </div>
      }
    >
      <div className="flex flex-col gap-5">
        {/* Progress */}
        <ol className="m-0 flex list-none gap-1.5 p-0" aria-label={tr("Progress")}>
          {flow.map((f, i) => (
            <li key={f} className={cx('h-1.5 flex-1 rounded-full', i <= pos ? 'bg-pri' : 'bg-muted')}>
              <span className="sr-only">
                {tr(quick ? QUICK_NAMES[i] : STEPS[f])}
                {i < pos ? ` (${tr('done')})` : i === pos ? ` (${tr('current step')})` : ''}
              </span>
            </li>
          ))}
        </ol>
        {pos === 0 && (
          <p className="m-0 -mt-2 text-sm text-ink-3">
            {quick ? tr('Quick version: 3 steps.') : tr('Full version: 6 steps, with thinking traps and evidence.')}{' '}
            <button type="button" onClick={() => setQuick(q => !q)} className="min-h-10 font-bold text-pri-text underline cursor-pointer">
              {quick ? tr("Use all 6 steps") : tr("Use the quick version")}
            </button>
          </p>
        )}

        {crisis && (
          <Notice tone="danger" icon={<Phone className="h-5 w-5" />}>
            <p lang="en" className="m-0 font-bold">It sounds like you might be in danger right now.</p>
            <p lang="en" className="m-0 mt-1">Please call 112, or press SOS to reach your support person. The thought record can wait.</p>
            <EnglishSafetyNote className="mt-2" />
            <div className="mt-3 flex flex-wrap gap-2">
              <T text="<0>Call 112</0>" parts={[<a href="tel:112" className="inline-flex min-h-11 items-center rounded-xl bg-danger px-4 font-bold text-[#fff] no-underline" />]} />
              <Button variant="secondary" onClick={onOpenSos}>
                {tr("Open SOS")}
              </Button>
            </div>
          </Notice>
        )}

        {step === 0 && (
          <Field label={tr("What was happening when the feeling started?")} htmlFor="tr-sit" hint={tr("Where were you, who were you with, what had just happened? You can skip this.")}>
            <textarea
              id="tr-sit"
              rows={3}
              maxLength={600}
              value={situation}
              onChange={e => setSituation(e.target.value)}
              placeholder={tr("For example: Friday evening, walking past the drinking spot after lectures.")}
              className={textareaClass}
            />
          </Field>
        )}

        {step === 1 && (
          <>
            <Field label={tr("What went through your mind?")} htmlFor="tr-thought" hint={tr("Write it exactly as it sounds in your head.")}>
              <textarea
                id="tr-thought"
                rows={2}
                maxLength={600}
                value={thought}
                onChange={e => setThought(e.target.value)}
                placeholder={tr("For example: I've had a hard week, so one drink won't hurt.")}
                className={textareaClass}
              />
            </Field>
            <div className="flex flex-col gap-2.5">
              <p className="m-0 text-base font-bold text-ink" id="tr-emotion-label">
                {tr("What did you feel?")}
              </p>
              <div className="flex flex-wrap gap-2" role="group" aria-labelledby="tr-emotion-label">
                {EMOTIONS.map(e => (
                  <Chip key={e} selected={emotion === e} onClick={() => setEmotion(e)}>
                    {e}
                  </Chip>
                ))}
              </div>
            </div>
            <IntensitySlider id="tr-before" label={tr("How strong was the feeling{v0}?", { v0: emotion ? ` (${tr(emotion).toLocaleLowerCase(getLanguage())})` : '' })} value={before} onChange={setBefore} />
          </>
        )}

        {step === 2 && (
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="m-0 text-base font-bold text-ink">{tr("Which thinking trap fits best?")}</p>
              <Button variant="soft" size="sm" onClick={suggest} disabled={suggesting} icon={<Sparkles className="h-4 w-4" />}>
                {suggesting ? tr("Thinking…") : tr("Suggest one")}
              </Button>
            </div>
            <p className="m-0 rounded-xl bg-bg px-4 py-3 text-[0.9375rem] text-ink-2">
              “{thought}”
            </p>
            <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label={tr("Thinking trap")}>
              {THINKING_TRAPS.map(t => (
                <button
                  key={t.id}
                  type="button"
                  role="radio"
                  aria-checked={trap === t.id}
                  onClick={() => setTrap(t.id)}
                  className={cx(
                    'flex flex-col gap-0.5 rounded-xl border p-3 text-left cursor-pointer',
                    trap === t.id ? 'border-pri-text bg-pri-soft' : 'border-line bg-surface hover:border-pri-text'
                  )}
                >
                  <span className="text-[0.9375rem] font-bold text-ink">{tr(t.label)}</span>
                  <span className="text-sm text-ink-3">{tr(t.example)}</span>
                </button>
              ))}
            </div>
            {insight && (
              <Notice icon={<Lightbulb className="h-5 w-5" />} className="text-[0.9375rem]">
                {insight}
              </Notice>
            )}
          </div>
        )}

        {step === 3 && (
          <>
            <div className="rounded-xl bg-bg px-4 py-3">
              <p className="m-0 text-sm font-bold text-ink-3">{tr("Questions to test it")}</p>
              <ul className="m-0 mt-1.5 flex flex-col gap-1 pl-5 text-[0.9375rem] text-ink">
                {questions.map(q => (
                  <li key={q}>{q}</li>
                ))}
              </ul>
            </div>
            <Field label={tr("What makes the thought seem true?")} htmlFor="tr-for">
              <textarea id="tr-for" rows={2} maxLength={1000} value={evidenceFor} onChange={e => setEvidenceFor(e.target.value)} className={textareaClass} placeholder={tr("Facts only — things that happened.")} />
            </Field>
            <Field label={tr("What doesn't fit the thought?")} htmlFor="tr-against" hint={tr("Times it wasn't true, things you've done well, what you know happens next.")}>
              <textarea
                id="tr-against"
                rows={3}
                maxLength={1000}
                value={evidenceAgainst}
                onChange={e => setEvidenceAgainst(e.target.value)}
                className={textareaClass}
                placeholder={tr("For example: Last time 'one drink' became the whole night. I've stayed clean for 12 days.")}
              />
            </Field>
          </>
        )}

        {step === 4 && (
          <>
            {quick && thought.trim() && (
              <div className="flex flex-col gap-1 rounded-xl bg-bg px-4 py-3">
                <p className="m-0 text-sm font-bold text-ink-3">{tr("The heavy thought")}</p>
                <p className="m-0 text-[0.9375rem] text-ink">“{thought}”</p>
                <p className="m-0 mt-1 text-sm text-ink-3">{tr("Ask: what would I say to a friend who thought this?")}</p>
              </div>
            )}
            <Field label={tr("A fairer, more balanced thought")} htmlFor="tr-balanced" hint={tr("It doesn't have to be positive — just fair and true for you.")}>
              <textarea
                id="tr-balanced"
                rows={3}
                maxLength={600}
                value={balanced}
                onChange={e => setBalanced(e.target.value)}
                className={textareaClass}
                placeholder={tr("For example: I'm tired and want relief, but one drink usually leads to more. I can wait 20 minutes and call Mary.")}
              />
            </Field>
            {suggestion && suggestion !== balanced && (
              <div className="flex flex-col gap-2 rounded-xl border border-line bg-surface p-4">
                <p className="m-0 text-sm font-bold text-ink-3">{tr('A suggestion from {aiName}', { aiName: profile.aiName || '4Life' })}</p>
                <p className="m-0 text-[0.9375rem] text-ink">{suggestion}</p>
                <Button variant="link" className="self-start" onClick={() => setBalanced(suggestion)}>
                  {tr("Use this and edit it")}
                </Button>
              </div>
            )}
          </>
        )}

        {(step === 5 || (quick && step === 4 && balanced.trim())) && (
          <>
            {!quick && (
              <div className="flex flex-col gap-1.5 rounded-xl bg-bg px-4 py-3.5">
                <p className="m-0 text-sm font-bold text-ink-3">{tr("Your fairer thought")}</p>
                <p className="m-0 text-base text-ink">“{balanced}”</p>
              </div>
            )}
            <IntensitySlider
              id="tr-after"
              label={tr("Read it again. How strong is the feeling{v0} now?", { v0: emotion ? ` (${tr(emotion).toLocaleLowerCase(getLanguage())})` : '' })}
              value={after}
              onChange={setAfter}
            />
            <p className="m-0 text-[0.9375rem] font-semibold text-ink" aria-live="polite">
              {diff > 0
                ? tr("Down {diff} points, from {before} to {after}. That's the thought record working.", { diff, before, after })
                : diff === 0
                  ? tr("No change yet — that’s normal. Coming back to this thought later often helps.")
                  : tr("It feels stronger right now. That can happen. Consider breathing first, or talking it through.")}
            </p>
            <Switch
              checked={shared}
              onChange={setShared}
              label={tr("Share with my counsellor")}
              description={tr("Only counsellors you are booked with can see shared records. You can change this later.")}
            />
            {(trap || thought.trim()) && <p className="m-0 text-sm text-ink-3">{tr("Thinking trap:")} {trapLabel(trap || guessTrap(thought))}</p>}
          </>
        )}

        {error && <Notice tone="warn">{tr(error)}</Notice>}
      </div>
    </Modal>
  );
};
