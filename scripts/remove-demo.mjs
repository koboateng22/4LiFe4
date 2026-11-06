#!/usr/bin/env node
/**
 * Deletes the demo accounts that scripts/seed-demo.mjs creates (Dr. Ama Konadu, Kwame, Akosua),
 * with everything that belongs to them (their profile rows are removed by the database's
 * "on delete cascade"). Run it before a launch on any project that ever had demo accounts.
 *   VITE_SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… node scripts/remove-demo.mjs
 *   (or: npm run db:remove-demo, with them in .env.local)
 * Only these three addresses are touched. It lists what it will delete and asks you to confirm
 * with CONFIRM=yes, so a mistyped project is harmless.
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'node:fs';

for (const file of ['.env.local', '.env']) {
  if (!existsSync(file)) continue;
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"#]*)"?\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
}

export const DEMO_EMAILS = ['ama@4life.org', 'kwame@4life.org', 'akosua@4life.org'];

const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error('Set VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY first (see .env.example).');
  process.exit(1);
}
const sb = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

const found = [];
for (let page = 1; page < 200; page++) {
  const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 200 });
  if (error) throw error;
  found.push(...data.users.filter(u => DEMO_EMAILS.includes((u.email || '').toLowerCase())));
  if (data.users.length < 200) break;
}
if (!found.length) {
  console.log(`No demo accounts in ${url}. Nothing to do.`);
  process.exit(0);
}
console.log(`Demo accounts in ${url}:`);
for (const u of found) console.log(`  ${u.email}  (${u.id})`);
if (process.env.CONFIRM !== 'yes') {
  console.log('Run again with CONFIRM=yes to delete them.');
  process.exit(0);
}
for (const u of found) {
  const { error } = await sb.auth.admin.deleteUser(u.id);
  if (error) throw new Error(`${u.email}: ${error.message}`);
  console.log(`Deleted ${u.email}`);
}
console.log('Done. Demo accounts are gone.');
