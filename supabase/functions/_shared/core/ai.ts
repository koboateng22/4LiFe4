// GENERATED from server/core/ai.ts by scripts/sync-functions.mjs. Do not edit: change the original, then run `npm run sync:functions`.
/**
 * Talks to the AI over plain HTTPS (fetch), so it works the same in Node (Vercel)
 * and Deno (Supabase Edge Functions) with no SDK to install.
 *
 * Gemini is used when GEMINI_API_KEY is set, otherwise OpenAI when OPENAI_API_KEY is set.
 * With neither, every route falls back to built-in replies.
 */
import type { Turn } from './prompts.ts';

/** Reads one setting (an environment variable or secret). */
export type Env = (name: string) => string | undefined;

export interface AiConfig {
  provider: 'gemini' | 'openai' | null;
  model: string;
  key: string;
}

const PLACEHOLDERS = new Set(['MY_GEMINI_API_KEY', 'MY_OPENAI_API_KEY']);
const read = (env: Env, name: string) => {
  const v = (env(name) || '').trim().replace(/^["']|["']$/g, '');
  return PLACEHOLDERS.has(v) ? '' : v;
};

export function aiConfig(env: Env): AiConfig {
  const gemini = read(env, 'GEMINI_API_KEY');
  if (gemini) return { provider: 'gemini', model: read(env, 'GEMINI_MODEL') || 'gemini-3.8-flash', key: gemini };
  const openai = read(env, 'OPENAI_API_KEY');
  if (openai) return { provider: 'openai', model: read(env, 'OPENAI_MODEL') || 'gpt-5.4-mini', key: openai };
  return { provider: null, model: read(env, 'GEMINI_MODEL') || 'gemini-3.8-flash', key: '' };
}

/** A small JSON schema: enough for the structured answers 4Life asks for. */
export type Schema =
  | { type: 'string'; enum?: string[]; description?: string }
  | { type: 'boolean'; description?: string }
  | { type: 'array'; items: Schema }
  | { type: 'object'; properties: Record<string, Schema>; required: string[] };

/** Gemini's schema format uses upper-case type names. */
function geminiSchema(s: Schema): any {
  if (s.type === 'object') {
    return { type: 'OBJECT', properties: Object.fromEntries(Object.entries(s.properties).map(([k, v]) => [k, geminiSchema(v)])), required: s.required };
  }
  if (s.type === 'array') return { type: 'ARRAY', items: geminiSchema(s.items) };
  return { ...s, type: s.type.toUpperCase() };
}

/** Stops a request that takes too long, and also when the person leaves. */
function deadline(ms: number, signal?: AbortSignal): AbortSignal {
  const timer = AbortSignal.timeout(ms);
  return signal ? AbortSignal.any([signal, timer]) : timer;
}

class AiError extends Error {}

async function failed(res: Response, who: string): Promise<never> {
  const detail = (await res.text().catch(() => '')).slice(0, 300);
  throw new AiError(`${who} returned ${res.status}: ${detail}`);
}

/** Reads a server-sent-events body and yields each "data:" payload. */
async function* sseData(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (value) buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n');
      let i: number;
      while ((i = buffer.indexOf('\n\n')) >= 0) {
        const block = buffer.slice(0, i);
        buffer = buffer.slice(i + 2);
        const data = block
          .split('\n')
          .filter(l => l.startsWith('data:'))
          .map(l => l.slice(5).trimStart())
          .join('\n');
        if (data) yield data;
      }
      if (done) break;
    }
  } finally {
    reader.releaseLock();
  }
}

/** Visible text from a Gemini response, skipping "thought" parts some models send. */
const geminiText = (json: any) =>
  (json?.candidates?.[0]?.content?.parts || [])
    .filter((p: any) => !p?.thought)
    .map((p: any) => p?.text || '')
    .join('');

const geminiUrl = (cfg: AiConfig, method: string) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(cfg.model)}:${method}`;

const geminiHeaders = (cfg: AiConfig) => ({ 'Content-Type': 'application/json', 'x-goog-api-key': cfg.key });

/** Streams a chat reply, piece by piece. */
export async function* streamChat(cfg: AiConfig, system: string, turns: Turn[], signal?: AbortSignal): AsyncGenerator<string> {
  if (cfg.provider === 'gemini') {
    const res = await fetch(`${geminiUrl(cfg, 'streamGenerateContent')}?alt=sse`, {
      method: 'POST',
      signal: deadline(55_000, signal),
      headers: geminiHeaders(cfg),
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: turns.map(t => ({ role: t.role, parts: [{ text: t.text }] })),
        generationConfig: { temperature: 0.6 },
      }),
    });
    if (!res.ok || !res.body) await failed(res, 'Gemini');
    for await (const data of sseData(res.body!)) {
      try {
        const text = geminiText(JSON.parse(data));
        if (text) yield text;
      } catch {
        /* ignore a malformed chunk */
      }
    }
    return;
  }
  if (cfg.provider === 'openai') {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      signal: deadline(55_000, signal),
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.key}` },
      body: JSON.stringify({
        model: cfg.model,
        stream: true,
        messages: [{ role: 'system', content: system }, ...turns.map(t => ({ role: t.role === 'user' ? 'user' : 'assistant', content: t.text }))],
      }),
    });
    if (!res.ok || !res.body) await failed(res, 'OpenAI');
    for await (const data of sseData(res.body!)) {
      if (data === '[DONE]') break;
      try {
        const text = JSON.parse(data)?.choices?.[0]?.delta?.content;
        if (text) yield text;
      } catch {
        /* ignore a malformed chunk */
      }
    }
    return;
  }
  throw new AiError('No AI key is set');
}

/** One short answer as plain text. */
export async function generateText(cfg: AiConfig, prompt: string, temperature = 0.6): Promise<string> {
  if (cfg.provider === 'gemini') {
    const res = await fetch(geminiUrl(cfg, 'generateContent'), {
      method: 'POST',
      signal: deadline(25_000),
      headers: geminiHeaders(cfg),
      body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { temperature } }),
    });
    if (!res.ok) await failed(res, 'Gemini');
    return geminiText(await res.json()).trim();
  }
  if (cfg.provider === 'openai') {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      signal: deadline(25_000),
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.key}` },
      body: JSON.stringify({ model: cfg.model, messages: [{ role: 'user', content: prompt }] }),
    });
    if (!res.ok) await failed(res, 'OpenAI');
    return String((await res.json())?.choices?.[0]?.message?.content || '').trim();
  }
  throw new AiError('No AI key is set');
}

/** One structured answer, checked against `schema` by the AI service. */
export async function generateJson<T>(cfg: AiConfig, prompt: string, schema: Schema, temperature = 0.3): Promise<Partial<T>> {
  let text = '';
  if (cfg.provider === 'gemini') {
    const res = await fetch(geminiUrl(cfg, 'generateContent'), {
      method: 'POST',
      signal: deadline(25_000),
      headers: geminiHeaders(cfg),
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { temperature, responseMimeType: 'application/json', responseSchema: geminiSchema(schema) },
      }),
    });
    if (!res.ok) await failed(res, 'Gemini');
    text = geminiText(await res.json());
  } else if (cfg.provider === 'openai') {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      signal: deadline(25_000),
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.key}` },
      body: JSON.stringify({
        model: cfg.model,
        response_format: { type: 'json_object' },
        messages: [{ role: 'user', content: `${prompt}\n\nAnswer with one JSON object that matches this schema: ${JSON.stringify(schema)}` }],
      }),
    });
    if (!res.ok) await failed(res, 'OpenAI');
    text = String((await res.json())?.choices?.[0]?.message?.content || '');
  } else {
    throw new AiError('No AI key is set');
  }
  const parsed = JSON.parse(text || '{}');
  return parsed && typeof parsed === 'object' ? parsed : {};
}
