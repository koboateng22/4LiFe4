/**
 * Checks every language in src/locales against the English texts in the code:
 *  - every text is there and not empty, and nothing is left over from old wording,
 *  - {placeholders} and <0>tags</0> are the same as in English,
 *  - texts with a count have every plural form that language needs.
 * The language selector only offers languages that have files here, so this is
 * what keeps a half-translated language out of the app.
 *   npm run test:i18n
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { extract, PLURALS_EN } from './i18n-extract';

type Entry = string | Record<string, string>;
const DIR = 'src/locales';

const load = (lang: string): Record<string, Entry> =>
  Object.assign({}, ...readdirSync(join(DIR, lang)).filter(f => f.endsWith('.json')).map(f => JSON.parse(readFileSync(join(DIR, lang, f), 'utf8'))));

const slots = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort().join(',');
const tags = (s: string) => [...s.matchAll(/<\/?(\d+)>/g)].map(m => m[0]).join('');

const { keys } = extract();
const english = load('en');
let failed = false;
const fail = (msg: string) => {
  failed = true;
  console.log('  ✗ ' + msg);
};

console.log('English');
for (const k of keys.keys()) if (!(k in english)) fail(`not in src/locales/en (run npm run i18n:extract): ${k}`);
for (const k of Object.keys(english)) if (!keys.has(k)) fail(`no longer used (run npm run i18n:extract): ${k}`);

const languages = readdirSync(DIR).filter(d => d !== 'en' && !d.startsWith('.'));
for (const lang of languages.sort()) {
  const words = load(lang);
  const categories = new Intl.PluralRules(lang).resolvedOptions().pluralCategories;
  const before = failed;
  failed = false;
  let problems = 0;
  const report = (msg: string) => {
    if (problems++ < 15) fail(msg);
    else failed = true;
  };
  console.log(`${lang}`);
  for (const k of keys.keys()) {
    const v = words[k];
    if (v == null) {
      report(`missing: ${k}`);
      continue;
    }
    const forms: string[] = typeof v === 'string' ? [v] : Object.values(v);
    if (forms.some(f => typeof f !== 'string' || !f.trim())) report(`empty: ${k}`);
    if (PLURALS_EN[k]) {
      if (typeof v === 'string') report(`needs plural forms (${categories.join(', ')}): ${k}`);
      else for (const c of categories) if (!(c in v)) report(`missing plural form "${c}": ${k}`);
    }
    const want = slots(k);
    const wantTags = tags(k);
    for (const f of forms) {
      // a plural form may leave out {count} ("one" in some languages says "a day")
      const got = slots(f);
      if (got !== want && !(PLURALS_EN[k] && got === want.split(',').filter(x => x !== 'count').join(','))) report(`placeholders ${got || '(none)'} instead of ${want}: ${k}`);
      if (tags(f) !== wantTags) report(`tags ${tags(f) || '(none)'} instead of ${wantTags}: ${k}`);
    }
  }
  for (const k of Object.keys(words)) if (!keys.has(k)) report(`no longer used: ${k}`);
  if (problems > 15) console.log(`  … and ${problems - 15} more`);
  if (!problems) console.log(`  ✓ all ${keys.size} texts`);
  failed = failed || before;
}

if (failed) {
  console.log('\nSome languages are incomplete.');
  process.exit(1);
}
console.log(`\nAll ${languages.length + 1} languages have all ${keys.size} texts.`);
