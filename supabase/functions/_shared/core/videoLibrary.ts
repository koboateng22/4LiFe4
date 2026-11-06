// GENERATED from src/lib/videoLibrary.ts by scripts/sync-functions.mjs. Do not edit: change the original, then run `npm run sync:functions`.
/**
 * The Learn section: short educational videos from YouTube, by topic.
 * Shared by the app (names) and the server (what to search for). The server asks the YouTube
 * Data API v3 with strict safe search and adds the topic's words to anything typed, so a
 * search stays on mental health and recovery. Videos help people learn; they don't replace
 * a counsellor or treatment, and the page says so.
 */
/** Marks English text for the translation files (see src/i18n). Kept local: this file also runs on the server. */
const msg = <S extends string>(text: S): S => text;

export interface VideoCategory {
  id: string;
  /** English name; show it with t() */
  label: string;
  /** What the server searches YouTube for */
  query: string;
}

export const VIDEO_CATEGORIES: VideoCategory[] = [
  { id: 'wellness', label: msg('Mental wellness'), query: 'mental health wellbeing explained psychologist' },
  { id: 'cbt', label: msg('CBT skills'), query: 'cognitive behavioural therapy skills explained therapist' },
  { id: 'recovery', label: msg('Recovery from drugs and alcohol'), query: 'addiction recovery education how the brain recovers' },
  { id: 'emotions', label: msg('Handling emotions'), query: 'emotional regulation skills psychologist' },
  { id: 'stress', label: msg('Stress'), query: 'stress management techniques psychologist' },
  { id: 'anxiety', label: msg('Anxiety'), query: 'anxiety coping skills explained psychologist' },
  { id: 'habits', label: msg('Healthy habits'), query: 'build healthy habits science sleep exercise' },
  { id: 'growth', label: msg('Personal growth'), query: 'personal development self compassion psychology' },
  { id: 'motivation', label: msg('Staying motivated'), query: 'recovery motivation stories hope addiction' },
];

export const videoCategory = (id: string) => VIDEO_CATEGORIES.find(c => c.id === id);

/** A search the person typed, made safe to send: letters, numbers, spaces and a little punctuation, 80 characters at most */
export const cleanVideoSearch = (q: unknown) =>
  String(q ?? '')
    .replace(/[^\p{L}\p{N} '\-,.?]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);

/** "PT1H2M3S" → seconds (YouTube's video length). 0 when unknown or a live stream. */
export function isoDurationSeconds(iso: unknown): number {
  const m = String(iso ?? '').match(/^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
  if (!m) return 0;
  const [, d, h, min, s] = m.map(x => Number(x) || 0);
  return d * 86400 + h * 3600 + min * 60 + s;
}

/** 754 → "12:34", 3723 → "1:02:03" */
export function formatDuration(seconds: number): string {
  if (!seconds) return '';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const two = (n: number) => String(n).padStart(2, '0');
  return h ? `${h}:${two(m)}:${two(s)}` : `${m}:${two(s)}`;
}

export interface LibraryVideo {
  id: string;
  title: string;
  channel: string;
  description: string;
  thumb: string;
  /** Seconds; 0 when unknown */
  duration: number;
  category: string;
  publishedAt: string;
}
