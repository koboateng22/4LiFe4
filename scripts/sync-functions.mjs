#!/usr/bin/env node
/**
 * Copies the shared backend code into the Supabase Edge Functions.
 *
 *   npm run sync:functions          write supabase/functions/_shared/core/*
 *   npm run sync:functions -- --check   only check that the copies are up to date
 *
 * Why a copy: Supabase bundles each function from the supabase/ folder, and Deno
 * needs real ".ts" import paths. So the files from server/core and the few shared
 * src/lib files are copied with their imports rewritten. Edit the originals, never
 * the copies; `npm run test:unit` fails if they drift apart.
 */
import { mkdirSync, readFileSync, readdirSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'supabase/functions/_shared/core');

const SOURCES = [
  'server/core/ai.ts',
  'server/core/guard.ts',
  'server/core/handlers.ts',
  'server/core/prompts.ts',
  'server/core/text.ts',
  'src/lib/aiTrailer.ts',
  'src/lib/cbt.ts',
  'src/lib/firstAid.ts',
  'src/lib/safety.ts',
];

function convert(src) {
  const code = readFileSync(join(root, src), 'utf8')
    // '../../src/lib/x.js' and './x.js' both become './x.ts' (all copies sit side by side)
    .replace(/from '(?:\.\.\/\.\.\/src\/lib|\.)\/([\w-]+)\.js'/g, "from './$1.ts'");
  const unresolved = code.match(/from '\.[^']*'/g)?.filter(i => !/^from '\.\/[\w-]+\.ts'$/.test(i));
  if (unresolved?.length) throw new Error(`${src}: cannot rewrite ${unresolved.join(', ')}`);
  return `// GENERATED from ${src} by scripts/sync-functions.mjs. Do not edit: change the original, then run \`npm run sync:functions\`.\n${code}`;
}

const check = process.argv.includes('--check');
const expected = new Map(SOURCES.map(src => [src.split('/').pop(), convert(src)]));
const stale = [];

if (check) {
  for (const [name, code] of expected) {
    const file = join(out, name);
    if (!existsSync(file) || readFileSync(file, 'utf8') !== code) stale.push(name);
  }
  const extra = existsSync(out) ? readdirSync(out).filter(f => !expected.has(f)) : [];
  if (stale.length || extra.length) {
    console.error(`Supabase function code is out of date (${[...stale, ...extra].join(', ')}). Run: npm run sync:functions`);
    process.exit(1);
  }
  console.log('Supabase function code is up to date.');
} else {
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  for (const [name, code] of expected) writeFileSync(join(out, name), code);
  console.log(`Wrote ${expected.size} files to ${relative(root, out)}`);
}
