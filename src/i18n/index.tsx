/**
 * 4Life translations.
 *
 * Every piece of text is written in English in the code, and that English is its key:
 *   t('Welcome back')                          → "Bon retour"
 *   t('Good evening, {name}', { name })        → values go into {braces}
 *   t('{count} days clean', { count: 3 })      → plural forms live in the language files
 *   <T text="Call <0>112</0> now" parts={[<a href="tel:112" />]} />   → text with links or bold inside
 * Text kept in data (lists of options, slides…) is marked with msg('…') where it is written
 * and passed through t() where it is shown, so it follows a language change.
 *
 * The words for each language are in src/locales/<language>/<area>.json. English is built in;
 * other languages load the first time they are picked (and are then saved for offline use).
 * `npm run i18n:extract` collects the English texts and `npm run test:i18n` checks that every
 * language has every one, with the same {braces}.
 */
import React, { useSyncExternalStore } from 'react';

export type PluralForms = Partial<Record<Intl.LDMLPluralRule, string>>;
export type Messages = Record<string, string | PluralForms>;
type Vars = Record<string, string | number | null | undefined>;

/* ---------- Language files ---------- */

let english: Messages = {};
let loaders: Record<string, () => Promise<unknown>> = {};
try {
  const eager = import.meta.glob('../locales/en/*.json', { eager: true, import: 'default' }) as Record<string, Messages>;
  english = Object.assign({}, ...Object.values(eager));
  loaders = import.meta.glob(['../locales/*/*.json', '!../locales/en/*.json'], { import: 'default' });
} catch {
  // Outside Vite (the Node test scripts) there are no language files: English text is its own key
}

const langOf = (path: string) => path.split('/').slice(-2)[0];

/** Languages with built-in translations (English first). The selector offers only these. */
export const SUPPORTED_LANGUAGES: string[] = ['en', ...Array.from(new Set(Object.keys(loaders).map(langOf))).sort()];

const RTL = new Set(['ar', 'ur', 'fa', 'he', 'ps', 'sd', 'ug', 'yi']);
export const isRtl = (code: string) => RTL.has((code || '').toLowerCase());

/** The supported language closest to `code` ("pt-BR" → "pt"), or English. */
export function normalizeLanguage(code?: string | null): string {
  const c = String(code || '').trim();
  if (!c) return 'en';
  if (SUPPORTED_LANGUAGES.includes(c)) return c;
  const base = c.split('-')[0].toLowerCase();
  return SUPPORTED_LANGUAGES.find(l => l.toLowerCase() === base || l.split('-')[0].toLowerCase() === base) || 'en';
}

/* ---------- State ---------- */

const STORAGE_KEY = '4life_user_language';
const loaded: Record<string, Messages> = { en: english };
const pending: Record<string, Promise<void>> = {};
let current = 'en';
let version = 0;
const listeners = new Set<() => void>();
const notify = () => {
  version++;
  listeners.forEach(l => l());
};

function load(code: string): Promise<void> {
  if (loaded[code]) return Promise.resolve();
  if (!pending[code]) {
    const files = Object.entries(loaders).filter(([path]) => langOf(path) === code);
    pending[code] = Promise.all(files.map(([, get]) => get() as Promise<Messages>))
      .then(parts => {
        loaded[code] = Object.assign({}, ...parts);
        if (code === current) notify();
      })
      .catch(err => {
        delete pending[code];
        console.warn(`Could not load the ${code} translations`, err);
      });
  }
  return pending[code];
}

/** The language the app shows now. */
export const getLanguage = () => current;

/** The language saved on this device, if any. */
export function savedLanguage(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

/**
 * Switch the whole app to `code`. Unsupported codes fall back to English.
 * Resolves once the words for that language are loaded.
 */
export function setLanguage(code?: string | null): Promise<void> {
  const next = normalizeLanguage(code);
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {}
  if (typeof document !== 'undefined') {
    document.documentElement.lang = next;
    document.documentElement.dir = isRtl(next) ? 'rtl' : 'ltr';
  }
  if (next !== current) {
    current = next;
    notify();
  }
  return load(next);
}

/** Re-renders the component when the language changes or finishes loading. Returns the language. */
export function useLanguage(): string {
  useSyncExternalStore(
    cb => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => version,
    () => version
  );
  return current;
}

/* ---------- Looking words up ---------- */

const pluralRules = new Map<string, Intl.PluralRules>();
const numberFormats = new Map<string, Intl.NumberFormat>();
const plural = (lang: string, n: number) => {
  if (!pluralRules.has(lang)) pluralRules.set(lang, new Intl.PluralRules(lang));
  return pluralRules.get(lang)!.select(n);
};

/** A number written the local way (1,234 · 1 234 · ١٬٢٣٤). */
export function formatNumber(n: number, opts?: Intl.NumberFormatOptions): string {
  if (!opts) {
    if (!numberFormats.has(current)) numberFormats.set(current, new Intl.NumberFormat(current));
    return numberFormats.get(current)!.format(n);
  }
  return new Intl.NumberFormat(current, opts).format(n);
}

/** A date or time written the local way. */
export function formatDate(d: Date | string | number, opts: Intl.DateTimeFormatOptions = { dateStyle: 'medium' }): string {
  const date = d instanceof Date ? d : new Date(d);
  return Number.isNaN(date.getTime()) ? '' : new Intl.DateTimeFormat(current, opts).format(date);
}

const missing = new Set<string>();

function lookup(key: string, count: number | undefined): string {
  const pick = (entry: string | PluralForms | undefined, lang: string): string | undefined => {
    if (entry == null) return undefined;
    if (typeof entry === 'string') return entry;
    if (count == null) return entry.other ?? Object.values(entry)[0];
    return entry[plural(lang, count)] ?? entry.other;
  };
  const here = pick(loaded[current]?.[key], current);
  if (here != null) return here;
  if (current !== 'en' && loaded[current] && english[key] != null && (import.meta as any).env?.DEV && !missing.has(key)) {
    missing.add(key);
    console.warn(`[i18n] No ${current} text for: ${key}`);
  }
  return pick(english[key], 'en') ?? key;
}

/** Fill {name} slots. Numbers are written the local way. */
function fill(text: string, vars?: Vars): string {
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (whole, name) => {
    const v = vars[name];
    if (v == null) return whole;
    return typeof v === 'number' ? formatNumber(v) : String(v);
  });
}

/** The text for `key` in the current language. `vars.count` also picks the plural form. */
export function t(key: string | null | undefined, vars?: Vars): string {
  if (!key) return '';
  const count = typeof vars?.count === 'number' ? vars.count : undefined;
  return fill(lookup(key, count), vars);
}

/** Marks English text kept in data so the extractor finds it. Show it with t(). */
export const msg = <S extends string>(text: S): S => text;

/**
 * Text with markup inside, such as a link or bold words:
 *   <T text="Call <0>112</0>, free, 24 hours." parts={[<a href="tel:112" className="font-bold" />]} />
 * <0>…</0> wraps the words in parts[0], keeping that element's props. Translators move the tags with the words.
 */
export const T: React.FC<{ text: string; parts?: React.ReactElement[]; vars?: Vars }> = ({ text, parts = [], vars }) => {
  const source = t(text, vars);
  const out: React.ReactNode[] = [];
  const re = /<(\d+)>(.*?)<\/\1>/gs;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source))) {
    if (m.index > last) out.push(source.slice(last, m.index));
    const el = parts[Number(m[1])];
    out.push(el ? React.cloneElement(el, { key: out.length }, m[2]) : m[2]);
    last = m.index + m[0].length;
  }
  if (last < source.length) out.push(source.slice(last));
  return <>{out}</>;
};

/* ---------- Tests ---------- */

/** Test scripts only: load a language's words without Vite. */
export function __setMessages(code: string, messages: Messages) {
  loaded[code] = messages;
  if (code === 'en') english = messages;
  if (!SUPPORTED_LANGUAGES.includes(code)) SUPPORTED_LANGUAGES.push(code);
}
