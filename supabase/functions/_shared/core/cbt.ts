// GENERATED from src/lib/cbt.ts by scripts/sync-functions.mjs. Do not edit: change the original, then run `npm run sync:functions`.
/**
 * CBT building blocks shared by the app and the server: the thinking traps,
 * the four ways AI therapy can help, and a simple offline guess at which
 * thinking trap a thought shows (used when Gemini is not available).
 */

export type TherapyMode = 'cbt' | 'urge_surfing' | 'mindfulness' | 'accountability';

export type TrapId =
  | 'all_or_nothing'
  | 'expecting_worst'
  | 'permission_giving'
  | 'feelings_as_facts'
  | 'mind_reading'
  | 'ignoring_positive'
  | 'overgeneralising'
  | 'should_statements';

export const THINKING_TRAPS: Array<{ id: TrapId; label: string; example: string }> = [
  { id: 'permission_giving', label: 'Permission-giving', example: '“Just once won’t hurt.” “I deserve it after today.”' },
  { id: 'all_or_nothing', label: 'All-or-nothing', example: '“I slipped, so I’ve ruined everything.”' },
  { id: 'expecting_worst', label: 'Expecting the worst', example: '“I’ll never get through tonight.”' },
  { id: 'feelings_as_facts', label: 'Feelings as facts', example: '“I feel guilty, so I must be a bad person.”' },
  { id: 'mind_reading', label: 'Mind reading', example: '“They all think I’m weak.”' },
  { id: 'ignoring_positive', label: 'Ignoring the positive', example: '“Twelve days clean doesn’t count for anything.”' },
  { id: 'overgeneralising', label: 'Overgeneralising', example: '“I always fail. Nothing ever works for me.”' },
  { id: 'should_statements', label: '“Should” statements', example: '“I should be over this by now.”' },
];

export const trapLabel = (id?: string) => THINKING_TRAPS.find(t => t.id === id)?.label || '';
export const isTrapId = (v: unknown): v is TrapId => THINKING_TRAPS.some(t => t.id === v);

/** Questions that help test a thought, whatever the trap. */
export const TESTING_QUESTIONS = [
  'What would I say to a friend who had this thought?',
  'What has happened the other times I felt this way?',
  'Will this matter in a week? In a year?',
];

/** A rough offline guess at the thinking trap in a thought. */
export function guessTrap(thought: string): TrapId {
  const t = (thought || '').toLowerCase().replace(/[’‘]/g, "'");
  if (/(just (once|one)|(one|a)( \w+){0,2} (won'?t|will not|can'?t|doesn'?t) hurt|i deserve (it|a)|only (a little|one)|nobody will know|i('ll| will) start (again )?tomorrow)/.test(t)) return 'permission_giving';
  if (/(ruined|wasted|failure|all for nothing|back to (zero|square one)|completely|totally)/.test(t)) return 'all_or_nothing';
  if (/(they (all )?think|everyone thinks|people think|they('ll| will) think|he thinks|she thinks)/.test(t)) return 'mind_reading';
  if (/(should|must|ought to|supposed to)/.test(t)) return 'should_statements';
  if (/(always|never|every time|nothing ever|everything always)/.test(t)) return 'overgeneralising';
  if (/(i feel .* so i|because i feel|i feel like a)/.test(t)) return 'feelings_as_facts';
  if (/(doesn'?t (count|matter)|means nothing|so what)/.test(t)) return 'ignoring_positive';
  return 'expecting_worst';
}

/** A completed CBT thought record. */
export interface ThoughtRecord {
  id: string;
  createdAt: string;
  situation: string;
  thought: string;
  emotion: string;
  /** How strong the feeling was before (0–100) */
  intensityBefore: number;
  trap: TrapId;
  evidenceFor: string;
  evidenceAgainst: string;
  balancedThought: string;
  /** How strong the feeling is after writing the balanced thought (0–100) */
  intensityAfter: number;
  /** Shared with the person's counsellor (only in Supabase mode) */
  shared: boolean;
}

export const EMOTIONS = ['Anxious', 'Ashamed', 'Guilty', 'Sad', 'Angry', 'Lonely', 'Bored', 'Stressed', 'Hopeless', 'Tempted'];
