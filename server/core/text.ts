/**
 * Small text helpers for everything that goes into an AI prompt.
 *
 * This folder (server/core) has no Node, Express or Deno imports, so the same
 * code runs on Vercel (server/app.ts) and in the Supabase Edge Functions
 * (copied to supabase/functions/_shared/core by `npm run sync:functions`).
 */

/**
 * Names typed by the person (nickname, the name they gave the AI, a circle title) go into
 * the AI's instructions, so keep them short and plain: letters, numbers, spaces, _ . ' -
 */
export function cleanName(v: unknown, fallback: string): string {
  const s = String(v ?? '')
    .replace(/[^\p{L}\p{N} _.'-]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 40);
  return s || fallback;
}

/** Trims any value to a string of at most `max` characters. */
export const clip = (v: unknown, max: number) => String(v ?? '').trim().slice(0, max);

/** Languages the app offers, by the code the app stores. */
const LANGUAGE_NAMES: Record<string, string> = {
  ak: 'Twi (Akan)', fat: 'Fante (Mfantse)', gaa: 'Ga', ee: 'Ewe', ha: 'Hausa', dag: 'Dagbani',
  yo: 'Yoruba', ig: 'Igbo', sw: 'Swahili', am: 'Amharic', so: 'Somali', zu: 'Zulu',
  fr: 'French', es: 'Spanish', ar: 'Arabic', pt: 'Portuguese', de: 'German', 'zh-CN': 'Simplified Chinese',
  hi: 'Hindi', ja: 'Japanese', ko: 'Korean', ru: 'Russian', it: 'Italian', tr: 'Turkish', vi: 'Vietnamese',
  nl: 'Dutch', pl: 'Polish', uk: 'Ukrainian', fil: 'Filipino (Tagalog)', id: 'Indonesian', ur: 'Urdu', bn: 'Bengali',
};

/**
 * The language the person chose in the app. AI replies are written in it directly,
 * so they read naturally instead of being machine-translated afterwards.
 */
export function replyLanguage(profile: any): { code: string; name: string } | null {
  const code = String(profile?.language || 'en').trim().replace(/[^A-Za-z-]/g, '').slice(0, 12);
  if (!code || code.toLowerCase() === 'en') return null;
  let name = LANGUAGE_NAMES[code];
  if (!name) {
    try {
      name = new Intl.DisplayNames(['en'], { type: 'language' }).of(code) || code;
    } catch {
      name = code;
    }
  }
  return { code, name };
}

/** The extra instruction that makes the AI answer in the person's language. */
export function languageRule(profile: any): string {
  const lang = replyLanguage(profile);
  if (!lang) return '';
  return `\n\nLanguage: The person chose ${lang.name} in the app. Write every reply in ${lang.name}, even if they write in English or earlier messages were in English, and keep to it for the whole conversation. Only switch if they clearly ask you to use another language. Use simple, everyday words a native speaker would use. Keep phone numbers such as 112 and 193 as digits.`;
}
