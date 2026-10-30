#!/usr/bin/env node
/**
 * Checks that your Gemini key works: npm run ai:check
 * Reads GEMINI_API_KEY (and optional GEMINI_MODEL) from .env.local or .env.
 * Uses the same plain HTTPS call as the app's server (server/core/ai.ts).
 */
import { readFileSync, existsSync } from 'node:fs';

for (const file of ['.env.local', '.env']) {
  if (!existsSync(file)) continue;
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"#]*)"?\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
}

const key = process.env.GEMINI_API_KEY;
const model = process.env.GEMINI_MODEL || 'gemini-3.8-flash';

if (!key || key === 'MY_GEMINI_API_KEY') {
  console.error('✗ No Gemini key found. Add GEMINI_API_KEY="..." to .env.local (see .env.example).');
  process.exit(1);
}

console.log(`Checking Gemini with model ${model}…`);
try {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: 'Reply with one short, kind sentence to someone starting their recovery today.' }] }] }),
    signal: AbortSignal.timeout(20000),
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`${res.status} ${body.slice(0, 300)}`);
  const parts = JSON.parse(body)?.candidates?.[0]?.content?.parts || [];
  const text = parts.filter(p => !p?.thought).map(p => p?.text || '').join('').trim();
  console.log('✓ Gemini works. Sample reply:\n  ' + text);
} catch (e) {
  const msg = String(e?.message || e);
  if (/API key not valid|API_KEY_INVALID|401|403/.test(msg)) console.error('✗ The key was refused. Copy it again from https://aistudio.google.com/apikey');
  else if (/not found|404/.test(msg)) console.error(`✗ The model "${model}" is not available to your key. Set GEMINI_MODEL in .env.local (e.g. gemini-3.5-flash-lite).`);
  else if (/429|quota|RESOURCE_EXHAUSTED/i.test(msg)) console.error('✗ Free-tier limit reached. Wait a minute (or until tomorrow for daily limits) and try again.');
  else if (/fetch failed|ENOTFOUND|ECONNRESET|ETIMEDOUT/i.test(msg)) console.error('✗ Could not reach Google. Check your internet connection.');
  else console.error('✗ ' + msg);
  process.exit(1);
}
