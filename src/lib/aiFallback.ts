/**
 * The built-in replies the server sends when no AI key is set or the AI does not answer
 * (server/core/prompts.ts, offlineReply and FALLBACK_SUGGESTIONS). They are written in English
 * there, so the app shows them in the person's language from here. Crisis replies stay in English,
 * like every emergency step (see EnglishSafetyNote). Keep the wording the same as the server's.
 */
import { getLanguage, msg, t } from '../i18n';
import type { TherapyMode } from './cbt';

const OFFLINE_REPLY: Record<TherapyMode, string> = {
  urge_surfing: msg("Thank you for reaching out, {name}. Cravings rise like a wave, peak, and pass — usually within 20 to 30 minutes if you don't act on them.\n\n1. Where do you feel the urge in your body? Rate it from 0 to 10.\n2. Breathe in for 4 and out for 6, five times.\n3. For the next 10 minutes, do one thing that keeps you away from it: step outside, drink water, or call someone.\n\nWhat number is the urge at right now?"),
  mindfulness: msg("Let's slow your body down together, {name}.\n\nBreathe in through your nose for 4… and out slowly for 6. Do that five times.\n\nThen look around and name 5 things you can see, 4 you can touch, and 3 you can hear.\n\nHow does your body feel now?"),
  accountability: msg("You're doing the right thing by planning ahead, {name}.\n\n• Which time or place in the next few hours feels risky?\n• What will you do instead at that moment?\n• Who could you message if it gets hard?\n\nLet's start with the first one — when is your risky time today?"),
  cbt: msg("I'm here with you, {name}. Let's look at the thought that's bothering you.\n\nWrite it down exactly as it sounds in your head. Then ask: is this a fact, or a feeling? What would I say to a friend who thought this?\n\nWhat's the thought?"),
};

/** The server's fallback suggestions, so t() can find them */
export const FALLBACK_SUGGESTION_TEXTS = [
  msg('Help me find the thinking trap'), msg("What's the evidence against it?"), msg('Help me write a fairer thought'),
  msg('The urge is getting stronger'), msg('Give me something to do now'), msg("It's starting to pass"),
  msg('Guide me through slow breathing'), msg('Do 5-4-3-2-1 grounding with me'), msg('I still feel tense'),
  msg('Tonight is my risky time'), msg('Help me plan the next 3 hours'), msg('Remind me why I started'),
];

/** A built-in (offline) reply in the app's language. Anything else is returned as it came. */
export function localiseOfflineReply(reply: { text: string; model?: string; risk?: string; mode: TherapyMode; name: string; suggestions?: string[] }) {
  if (getLanguage() === 'en' || !reply.model?.includes('(offline)') || reply.risk === 'crisis') return { text: reply.text, suggestions: reply.suggestions };
  return { text: t(OFFLINE_REPLY[reply.mode], { name: reply.name }), suggestions: reply.suggestions?.map(s => t(s)) };
}
