/**
 * The only profile details sent with an AI request. Each AI feature gets just what its prompt uses
 * (server/core/prompts.ts), never the whole profile: no email, real name, contacts, area, age or
 * sign-in details. Keep these in step with the prompts, and with the Privacy Policy
 * (src/content/privacyPolicy.ts, "AI processing").
 */
import type { UserProfile } from '../types';

/** The AI companion chat: how to address the person and tailor the reply */
export const chatProfile = (p: UserProfile, copingThatHelped: string[] = []) => ({
  nickname: p.nickname,
  aiName: p.aiName,
  language: p.language,
  currentTriage: p.currentTriage,
  currentMood: p.currentMood,
  currentCraving: p.currentCraving,
  belief: p.belief,
  religionType: p.religionType,
  region: p.region,
  copingThatHelped,
});

/** The thought-record helper: only the language to answer in */
export const suggestProfile = (p: UserProfile) => ({ language: p.language });

/** The circle guide: the community name and the language */
export const guideProfile = (p: UserProfile) => ({ nickname: p.nickname, language: p.language });
