import { msg } from '../i18n';
/**
 * What helped, remembered on this device:
 *  - "What helped today" summaries saved at the end of an AI therapy chat.
 *  - The 20-minute "ride the wave" craving timer (survives a refresh).
 * Nothing here leaves the phone, except the short list of helpful steps that
 * is sent with a chat message so 4Life can suggest them first.
 */

export interface CopingStep {
  id: string;
  label: string;
  /** How 4Life or the app can help you do it again */
  action?: 'breathe' | 'call' | 'record';
}

export const COPING_STEPS: CopingStep[] = [
  { id: 'breathing', label: msg('Slow breathing'), action: 'breathe' },
  { id: 'outside', label: msg('Going outside or for a walk') },
  { id: 'calling', label: msg('Calling or texting someone'), action: 'call' },
  { id: 'water', label: msg('Drinking water or eating') },
  { id: 'distraction', label: msg('Doing something else (music, a game, cleaning)') },
  { id: 'leaving', label: msg('Leaving the risky place') },
  { id: 'faith', label: msg('Prayer or quiet reflection') },
  { id: 'record', label: msg('Writing down the thought'), action: 'record' },
  { id: 'talking', label: msg('Talking it through here') },
];

export const stepLabel = (id: string) => COPING_STEPS.find(s => s.id === id)?.label || id;

export interface HelpedEntry {
  at: string; // ISO
  mode: string;
  steps: string[];
  note?: string;
  before?: number;
  after?: number;
}

const read = <T,>(key: string, fallback: T): T => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
};
const write = (key: string, value: unknown) => {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage blocked: keep going without saving */
  }
};

const helpedKey = (uid: string) => `4life_helped_v1_${uid || 'guest'}`;

export function listHelped(uid: string): HelpedEntry[] {
  const v = read<HelpedEntry[]>(helpedKey(uid), []);
  return Array.isArray(v) ? v : [];
}

export function saveHelped(uid: string, entry: Omit<HelpedEntry, 'at'>): HelpedEntry {
  const full: HelpedEntry = { ...entry, note: entry.note?.slice(0, 300), at: new Date().toISOString() };
  write(helpedKey(uid), [full, ...listHelped(uid)].slice(0, 50));
  return full;
}

/** The steps that helped most often (most recent first when tied). */
export function topHelped(uid: string, n = 3): string[] {
  const count = new Map<string, { c: number; last: number }>();
  listHelped(uid).forEach((e, i) =>
    e.steps.forEach(s => {
      const cur = count.get(s) || { c: 0, last: i };
      count.set(s, { c: cur.c + 1, last: Math.min(cur.last, i) });
    })
  );
  return [...count.entries()].sort((a, b) => b[1].c - a[1].c || a[1].last - b[1].last).slice(0, n).map(([id]) => id);
}

/* ---------- Ride-the-wave timer ---------- */

export const WAVE_MINUTES = 20;
export const WAVE_CHECK_EVERY = 5; // minutes between "how strong now?" check-ins

export interface WavePoint {
  /** minutes since the start */
  m: number;
  level: number; // 0–10
}
export interface Wave {
  startedAt: string;
  points: WavePoint[];
  finished?: boolean;
}

const waveKey = (uid: string) => `4life_wave_v1_${uid || 'guest'}`;

export function loadWave(uid: string): Wave | null {
  const w = read<Wave | null>(waveKey(uid), null);
  if (!w || !w.startedAt) return null;
  // an old timer (more than 2 hours) is forgotten
  if (Date.now() - new Date(w.startedAt).getTime() > 2 * 3600000) {
    write(waveKey(uid), null);
    return null;
  }
  return w;
}
export const saveWave = (uid: string, w: Wave | null) => write(waveKey(uid), w);

/* ---------- Small "seen it before" flags ---------- */

export function seenBefore(key: string): boolean {
  return read<boolean>(`4life_seen_${key}`, false);
}
export function markSeen(key: string) {
  write(`4life_seen_${key}`, true);
}

/** Remember a small choice (last mode, filters…) on this device */
export function remember<T>(key: string, fallback: T): T {
  return read<T>(`4life_pref_${key}`, fallback);
}
export function keep<T>(key: string, value: T) {
  write(`4life_pref_${key}`, value);
}
