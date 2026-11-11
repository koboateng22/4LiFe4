/**
 * A real end-to-end check of the AI chat: npm run ai:check
 *
 * Uses the app's own server code (the same request, prompt, streaming, fallback and error handling
 * as /api/chat) with the keys in .env.local or .env. For each provider that has a key — Groq
 * (primary) and Gemini (fallback) — it sends a message and a follow-up that only makes sense with
 * the first, checking that a real answer streams back and keeps the context. Then it runs the
 * normal setup (Groq first, Gemini behind it) once more. Keys are never printed.
 * Uses up to 6 requests of your free quotas.
 */
import { readFileSync, existsSync } from 'node:fs';
import { aiConfig, type ProviderName } from '../server/core/ai';
import { readChat, runChat } from '../server/core/handlers';
import { describeFailure } from '../src/components/cbt/ChatFailureNotice';

for (const file of ['.env.local', '.env']) {
  if (!existsSync(file)) continue;
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"#]*)"?\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
}
const base = (name: string) => process.env[name];
const all = aiConfig(base);
if (!all.providers.length) {
  console.error('✗ No AI key found. Add GROQ_API_KEY="..." (https://console.groq.com/keys) and GEMINI_API_KEY="..." (https://aistudio.google.com/apikey) to .env.local.');
  process.exit(1);
}

const conversation = async (label: string, env: (n: string) => string | undefined) => {
  const ask = async (text: string, history: Array<{ role: 'user' | 'model'; content: string }>) => {
    const read = readChat({ message: text, mode: 'cbt', history, userProfile: { nickname: 'Kofi', currentTriage: 'general' }, stream: true });
    if ('error' in read) throw new Error('bad request');
    let streamed = 0;
    const started = Date.now();
    const done = await runChat(read.input, { env }, (event, data: any) => event === 'delta' && (streamed += String(data.text || '').length));
    return { done, streamed, ms: Date.now() - started };
  };
  console.log(`\n=== ${label}`);
  const first = 'My older brother keeps saying I will never stay sober. I believe him a bit.';
  const one = await ask(first, []);
  if (one.done.error) return console.error(`✗ ${describeFailure({ code: one.done.error.code }).text} [${one.done.error.code}]`), false;
  console.log(`1. (${one.done.provider}/${one.done.model}, ${one.ms} ms, ${one.streamed} characters streamed)\n   ${one.done.reply.replace(/\n/g, '\n   ')}`);
  const two = await ask('Why do you think his words hit me so hard?', [
    { role: 'user', content: first },
    { role: 'model', content: one.done.reply },
  ]);
  if (two.done.error) return console.error(`✗ follow-up: ${two.done.error.code}`), false;
  console.log(`2. (${two.done.provider}, ${two.ms} ms)\n   ${two.done.reply.replace(/\n/g, '\n   ')}`);
  const ctx = /brother|sober|family|him\b|he\b/i.test(two.done.reply);
  console.log(ctx ? '✓ answered both; the follow-up used the earlier message' : '! answered both; read the follow-up to check it used the context');
  return true;
};

let good = true;
for (const p of all.providers.map(x => x.name) as ProviderName[]) {
  const only = (n: string) => (n === 'PRIMARY_AI_PROVIDER' ? p : n === 'FALLBACK_AI_PROVIDER' ? 'none' : base(n));
  good = (await conversation(`${p} only (model ${aiConfig(only).model})`, only)) && good;
}
if (all.providers.length > 1) good = (await conversation(`normal setup: ${all.primary} first, ${all.fallback} as fallback`, base)) && good;
else console.log(`\n! Only ${all.providers[0].name} has a key: there is no fallback until the other key is added.`);
process.exit(good ? 0 : 1);
