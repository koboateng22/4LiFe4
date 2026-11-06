/**
 * Demo accounts never reach a production build. Builds the app twice:
 *  - as for production: no demo account, demo therapist, sample client or sample post may be
 *    anywhere in the files people download;
 *  - with VITE_ENABLE_DEMO=true (preview deployments): they are there.
 *   npm run test:demo-build
 */
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build } from 'vite';

let n = 0;
const ok = (c: unknown, w: string) => {
  if (!c) throw new Error('FAIL: ' + w);
  n++;
  console.log('ok ', w);
};

// Strings that only the demo data contains
const MARKERS = {
  'demo client account': 'kwame@4life.org',
  'second demo client': 'serwaa',
  'demo therapist account': 'ama@4life.org',
  "demo person's community name": 'SoberWarrior_GH',
  "demo therapist's sample client": 'Akosua_Rising',
  'example session request': 'Kojo_NewStart',
  'sample Village post': 'GoldenTree_233',
  'demo PIN hint': 'demo: 1234',
};

async function bundleText(demo: boolean) {
  const outDir = mkdtempSync(join(tmpdir(), '4life-build-'));
  if (demo) process.env.VITE_ENABLE_DEMO = 'true';
  else delete process.env.VITE_ENABLE_DEMO;
  for (const k of ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY', 'VITE_SUPABASE_PUBLISHABLE_KEY']) delete process.env[k];
  await build({ mode: 'production', logLevel: 'error', envDir: '/nonexistent', build: { outDir, emptyOutDir: true } });
  const files: string[] = [];
  const walk = (d: string) =>
    readdirSync(d, { withFileTypes: true }).forEach(e => (e.isDirectory() ? walk(join(d, e.name)) : /\.(js|html|json)$/.test(e.name) && files.push(join(d, e.name))));
  walk(outDir);
  // Leave out the translation files (one per area, e.g. auth-1a2b.js): they hold the words for the
  // demo screens in every language, not demo accounts or data
  const AREA = /[\\/](auth|chat|common|dashboard|ems|onboarding|settings|therapist|village)-[\w-]+\.js$/;
  files.splice(0, files.length, ...files.filter(f => !AREA.test(f)));
  const text = files.map(f => readFileSync(f, 'utf8')).join('\n').toLowerCase();
  rmSync(outDir, { recursive: true, force: true });
  return text;
}

const prod = await bundleText(false);
for (const [what, marker] of Object.entries(MARKERS)) ok(!prod.includes(marker.toLowerCase()), `production build: no ${what}`);
const preview = await bundleText(true);
for (const what of ['demo client account', 'demo therapist account', 'sample Village post'] as const)
  ok(preview.includes(MARKERS[what].toLowerCase()), `VITE_ENABLE_DEMO=true build (previews): the ${what} is there`);
console.log(`All ${n} demo build checks passed`);
