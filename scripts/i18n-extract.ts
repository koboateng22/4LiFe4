/**
 * Collects every English text in the app into src/locales/en/<area>.json.
 * A text is anything passed to t(…), tr(…) or msg(…), or the text of a <T> element.
 *   npm run i18n:extract
 * Run it after changing English wording, then add the new texts to each language
 * (`npm run test:i18n` lists what is missing).
 */
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import ts from 'typescript';

const ROOT = 'src';
const OUT = 'src/locales/en';

/** English plural forms. Other languages add their own forms for these keys. */
export const PLURALS_EN: Record<string, { one: string; other: string }> = {
  'days clean': { one: 'day clean', other: 'days clean' },
  '{count} days clean': { one: '{count} day clean', other: '{count} days clean' },
  'High risk · {count} days clean': { one: 'High risk · {count} day clean', other: 'High risk · {count} days clean' },
  '{count} days to your {milestone}-day badge': { one: '{count} day to your {milestone}-day badge', other: '{count} days to your {milestone}-day badge' },
  'You and {count} others are going': { one: 'You and {count} other are going', other: 'You and {count} others are going' },
  '{count} hours ago': { one: '{count} hour ago', other: '{count} hours ago' },
  '{count} days ago': { one: '{count} day ago', other: '{count} days ago' },
  '{count} sessions left today': { one: '{count} session left today', other: '{count} sessions left today' },
  '{count} new requests': { one: '{count} new request', other: '{count} new requests' },
  '{name} missed {count} check-ins': { one: '{name} missed {count} check-in', other: '{name} missed {count} check-ins' },
  replies: { one: 'reply', other: 'replies' },
  'Includes {count} more places within {km} km from OpenStreetMap, a free map made by volunteers. Call to check before you go.': {
    one: 'Includes {count} more place within {km} km from OpenStreetMap, a free map made by volunteers. Call to check before you go.',
    other: 'Includes {count} more places within {km} km from OpenStreetMap, a free map made by volunteers. Call to check before you go.',
  },
};

/** Which file of words a source file's texts go to */
const AREAS: Array<[RegExp, string]> = [
  [/^src\/therapist\//, 'therapist'],
  [/^src\/components\/auth\/|^src\/lib\/age\.ts|^src\/lib\/supabase\.ts/, 'auth'],
  [/OnboardingFlow|WelcomeTour/, 'onboarding'],
  [/DashboardTab|MoodFaces|CravingLevels/, 'dashboard'],
  [/AiTherapyTab|\/cbt\/|lib\/cbt|lib\/coping|lib\/aiChat|lib\/aiFallback/, 'chat'],
  [/CommunityVillageTab|lib\/village|lib\/safety\.ts/, 'village'],
  [/EmergencyMapTab|\/ems\/|\/maps\/|lib\/osm|lib\/ems|lib\/safetyPlan|lib\/location|BreathingCalmModal|CounselorModal/, 'ems'],
  [/SettingsProfileTab|LanguageSwitcherModal|LanguageMenu|DeveloperFeedbackModal|religionsData/, 'settings'],
];
const areaOf = (file: string) => AREAS.find(([re]) => re.test(file))?.[1] || 'common';

function files(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return name === 'locales' ? [] : files(p);
    return /\.(tsx?|mts)$/.test(name) && !name.endsWith('.d.ts') ? [p] : [];
  });
}

export function extract(): { keys: Map<string, Set<string>>; problems: string[] } {
  const keys = new Map<string, Set<string>>();
  const problems: string[] = [];
  const add = (text: string, file: string) => {
    if (!text.trim()) return;
    if (!keys.has(text)) keys.set(text, new Set());
    keys.get(text)!.add(areaOf(relative('.', file).replace(/\\/g, '/')));
  };
  for (const file of files(ROOT)) {
    const src = readFileSync(file, 'utf8');
    if (!/\b(t|tr|msg)\(|<T\b/.test(src)) continue;
    const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    const literal = (n: ts.Node | undefined) => (n && (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) ? n.text : null);
    const visit = (n: ts.Node) => {
      if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && ['t', 'tr', 'msg'].includes(n.expression.text) && n.arguments.length) {
        const text = literal(n.arguments[0]);
        if (text != null) add(text, file);
        else if (n.expression.text === 'msg') problems.push(`${file}: msg() needs plain text, not ${n.arguments[0].getText().slice(0, 40)}`);
      }
      if ((ts.isJsxSelfClosingElement(n) || ts.isJsxOpeningElement(n)) && n.tagName.getText() === 'T') {
        const a = n.attributes.properties.find(p => ts.isJsxAttribute(p) && p.name.getText() === 'text') as ts.JsxAttribute | undefined;
        const init = a?.initializer;
        const text = init && (ts.isStringLiteral(init) ? init.text : ts.isJsxExpression(init) ? literal(init.expression) : null);
        if (text != null) add(text, file);
        else problems.push(`${file}: <T text> needs plain text`);
      }
      ts.forEachChild(n, visit);
    };
    visit(sf);
  }
  return { keys, problems };
}

if (process.argv[1]?.endsWith('i18n-extract.ts')) {
  const { keys, problems } = extract();
  const byArea = new Map<string, Record<string, unknown>>();
  for (const [text, areas] of [...keys].sort(([a], [b]) => a.localeCompare(b))) {
    const area = areas.size === 1 ? [...areas][0] : 'common';
    if (!byArea.has(area)) byArea.set(area, {});
    byArea.get(area)![text] = PLURALS_EN[text] ?? text;
  }
  mkdirSync(OUT, { recursive: true });
  for (const f of existsSync(OUT) ? readdirSync(OUT) : []) if (!byArea.has(f.replace('.json', ''))) writeFileSync(join(OUT, f), '{}\n');
  let words = 0;
  for (const [area, entries] of byArea) {
    writeFileSync(join(OUT, `${area}.json`), JSON.stringify(entries, null, 2) + '\n');
    words += Object.keys(entries).join(' ').split(/\s+/).length;
    console.log(`${area.padEnd(11)} ${Object.keys(entries).length} texts`);
  }
  console.log(`${keys.size} texts, about ${words} words`);
  for (const k of Object.keys(PLURALS_EN)) if (!keys.has(k)) problems.push(`plural form for a text that no longer exists: ${k}`);
  problems.forEach(p => console.warn('warning:', p));
}
