/**
 * The server's built-in suggestion buttons (server/core/prompts.ts, FALLBACK_SUGGESTIONS), shown
 * when the AI's reply comes without its own. They are written in English there, so they are
 * translated here. (The chat no longer has built-in replies: when the AI can't answer, it says so.)
 */
import { msg, t } from '../i18n';

/** The server's fallback suggestions, so t() can find them */
export const FALLBACK_SUGGESTION_TEXTS = [
  msg('Help me find the thinking trap'), msg("What's the evidence against it?"), msg('Help me write a fairer thought'),
  msg('The urge is getting stronger'), msg('Give me something to do now'), msg("It's starting to pass"),
  msg('Guide me through slow breathing'), msg('Do 5-4-3-2-1 grounding with me'), msg('I still feel tense'),
  msg('Tonight is my risky time'), msg('Help me plan the next 3 hours'), msg('Remind me why I started'),
];

/** Suggestion buttons in the app's language: the server's built-in ones are English keys; the AI's own are kept as written. */
export const localiseSuggestions = (suggestions?: string[]) => suggestions?.map(s => t(s));
