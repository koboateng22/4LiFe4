/**
 * The AI providers, behind one small interface (plain HTTPS fetch, so it runs the same in Node on
 * Vercel and Deno in the Supabase Edge Functions, with no SDK to install).
 *
 *   PRIMARY_AI_PROVIDER  (default groq)    GROQ_API_KEY,   GROQ_MODEL   (default openai/gpt-oss-120b)
 *   FALLBACK_AI_PROVIDER (default gemini)  GEMINI_API_KEY, GEMINI_MODEL (default gemini-3.5-flash-lite)
 *
 * Every request goes to the primary provider first. Only when that fails for a reason another
 * provider can fix (busy or failing servers, no connection, too slow, rate limit or used-up quota,
 * an empty answer) and nothing has been shown yet, the same request goes to the fallback. A refused
 * key, a missing model or a bad request is reported instead, because it needs fixing, not working
 * around. A provider without a key is skipped. Both providers have free tiers; the app never moves
 * to a paid service by itself. Keys are read only here, on the server.
 */
import type { Turn } from './prompts.js';

/** Reads one setting (an environment variable or secret). */
export type Env = (name: string) => string | undefined;

export type ProviderName = 'groq' | 'gemini';
export const PROVIDERS: ProviderName[] = ['groq', 'gemini'];

/**
 * Default models. Change them with GROQ_MODEL / GEMINI_MODEL, never in code.
 *  - Groq: openai/gpt-oss-120b, Groq's production flagship (console.groq.com/docs/models, November 2026).
 *  - Gemini: gemini-3.5-flash-lite, Google's recommended fast model, on the free tier (ai.google.dev, November 2026).
 */
export const DEFAULT_MODELS: Record<ProviderName, string> = { groq: 'openai/gpt-oss-120b', gemini: 'gemini-3.5-flash-lite' };
export const DEFAULT_GEMINI_MODEL = DEFAULT_MODELS.gemini;

export interface ProviderConfig {
  name: ProviderName;
  model: string;
  key: string;
}

export interface AiConfig {
  /** The providers to try, in order (only those with a key) */
  providers: ProviderConfig[];
  /** The first provider that will be used, or null when no AI key is set */
  provider: ProviderName | null;
  /** That provider's model (for display) */
  model: string;
  primary: ProviderName;
  fallback: ProviderName | null;
}

const PLACEHOLDERS = new Set(['MY_GEMINI_API_KEY', 'MY_GROQ_API_KEY']);
const read = (env: Env, name: string) => {
  const v = (env(name) || '').trim().replace(/^["']|["']$/g, '');
  return PLACEHOLDERS.has(v) ? '' : v;
};
const asProvider = (v: string, fallback: ProviderName | null): ProviderName | null =>
  v === 'none' ? null : (PROVIDERS as string[]).includes(v) ? (v as ProviderName) : fallback;

/**
 * Every AI response carries this header: "on" when this server has an AI key, "off" when it has none.
 * The app can reach two backends (this site's /api and the Supabase functions). When one answers "off",
 * the app asks the other, so a key set on only one of them still serves everyone.
 */
export const AI_HEADER = 'X-4Life-AI';
export const aiHeaderValue = (env: Env): 'on' | 'off' => (aiConfig(env).providers.length ? 'on' : 'off');

export function aiConfig(env: Env): AiConfig {
  const primary = asProvider(read(env, 'PRIMARY_AI_PROVIDER').toLowerCase(), 'groq') || 'groq';
  let fallback = asProvider(read(env, 'FALLBACK_AI_PROVIDER').toLowerCase(), 'gemini');
  if (fallback === primary) fallback = null;
  const one = (name: ProviderName): ProviderConfig | null => {
    const key = read(env, name === 'groq' ? 'GROQ_API_KEY' : 'GEMINI_API_KEY');
    return key ? { name, key, model: read(env, name === 'groq' ? 'GROQ_MODEL' : 'GEMINI_MODEL') || DEFAULT_MODELS[name] } : null;
  };
  const providers = [one(primary), fallback ? one(fallback) : null].filter((p): p is ProviderConfig => !!p);
  return {
    providers,
    provider: providers[0]?.name ?? null,
    model: providers[0]?.model ?? (read(env, 'GROQ_MODEL') || DEFAULT_MODELS[primary]),
    primary,
    fallback,
  };
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

/* ===================================================================== */
/* Errors                                                                 */
/* ===================================================================== */

/**
 * Why an AI request failed, so the app can say what happened instead of pretending to answer:
 *  - not_configured: no key on the server            - bad_key: the key was refused
 *  - bad_model: the model isn't available to the key - rate_limited: too many requests for now
 *  - quota_exhausted: the free daily quota is used up
 *  - overloaded: the provider's servers are busy or failing - timeout / network: too slow / no connection
 *  - blocked: the safety filters stopped the answer  - empty: no answer came back
 *  - bad_request / unknown: anything else
 */
export type AiErrorCode =
  | 'not_configured'
  | 'bad_key'
  | 'bad_model'
  | 'rate_limited'
  | 'quota_exhausted'
  | 'overloaded'
  | 'timeout'
  | 'network'
  | 'blocked'
  | 'empty'
  | 'bad_request'
  | 'unknown';

export class AiError extends Error {
  code: AiErrorCode;
  /** Seconds to wait before trying again, when the service said so */
  retryAfter?: number;
  status?: number;
  provider?: ProviderName;
  constructor(message: string, code: AiErrorCode = 'unknown', retryAfter?: number, status?: number, provider?: ProviderName) {
    super(message);
    this.code = code;
    this.retryAfter = retryAfter;
    this.status = status;
    this.provider = provider;
  }
}

/** Errors another provider may get past: worth sending the same request to the fallback */
export const FALLBACK_CODES: AiErrorCode[] = ['overloaded', 'network', 'timeout', 'rate_limited', 'quota_exhausted', 'empty'];

/** Turns a Gemini error response into an AiError with a reason. Exported for tests. */
export function classifyGeminiError(status: number, bodyText: string): AiError {
  let err: any = {};
  try {
    err = JSON.parse(bodyText)?.error || {};
  } catch {
    /* not JSON */
  }
  const message = String(err.message || bodyText || '').slice(0, 200);
  const details: any[] = Array.isArray(err.details) ? err.details : [];
  const reasons = details.map(d => String(d?.reason || '')).join(' ');
  const quotaIds = details.flatMap(d => (Array.isArray(d?.violations) ? d.violations : [])).map((v: any) => `${v?.quotaId || ''} ${v?.quotaMetric || ''}`).join(' ');
  const delay = details.find(d => String(d?.['@type'] || '').endsWith('RetryInfo'))?.retryDelay;
  const retryAfter = typeof delay === 'string' && /^\d+(\.\d+)?s$/.test(delay) ? Math.ceil(parseFloat(delay)) : undefined;
  const fail = (code: AiErrorCode) => new AiError(`Gemini ${status} ${err.status || ''}: ${message}`, code, retryAfter, status, 'gemini');

  if (status === 429) return fail(/PerDay/i.test(quotaIds) ? 'quota_exhausted' : 'rate_limited');
  if (/API_KEY_INVALID|API key not valid|API key expired/i.test(`${reasons} ${message}`)) return fail('bad_key');
  if (status === 401 || status === 403) return fail('bad_key');
  if (status === 404) return fail('bad_model');
  if (status >= 500) return fail('overloaded');
  if (status === 400) return fail('bad_request');
  return fail('unknown');
}

/**
 * Turns a Groq error response into an AiError. Groq answers like OpenAI's API:
 * { error: { message, type, code } }, with `retry-after` (seconds) on a 429.
 * A daily limit (requests or tokens per day) is a used-up quota; anything else on 429 is a rate limit.
 */
export function classifyGroqError(status: number, bodyText: string, retryAfterHeader?: string | null): AiError {
  let err: any = {};
  try {
    err = JSON.parse(bodyText)?.error || {};
  } catch {
    /* not JSON */
  }
  const message = String(err.message || bodyText || '').slice(0, 200);
  const code = String(err.code || err.type || '');
  const retry = Number(retryAfterHeader);
  const retryAfter = Number.isFinite(retry) && retry > 0 ? Math.ceil(retry) : undefined;
  const fail = (c: AiErrorCode) => new AiError(`Groq ${status} ${code}: ${message}`, c, retryAfter, status, 'groq');

  if (status === 429) return fail(/per day|\(RPD\)|\(TPD\)|daily/i.test(message) ? 'quota_exhausted' : 'rate_limited');
  if (status === 401 || status === 403 || /invalid_api_key/i.test(code)) return fail('bad_key');
  if (status === 404 || /model_not_found|model_decommissioned/i.test(code)) return fail('bad_model');
  // 498: Groq's "capacity exceeded"; 5xx: server problems
  if (status === 498 || status >= 500) return fail('overloaded');
  if (status === 400 || status === 413 || status === 422) return fail('bad_request');
  return fail('unknown');
}

const classify = (p: ProviderName, status: number, body: string, retryAfter?: string | null) =>
  p === 'groq' ? classifyGroqError(status, body, retryAfter) : classifyGeminiError(status, body);

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((done, fail) => {
    const t = setTimeout(done, ms);
    signal?.addEventListener('abort', () => (clearTimeout(t), fail(signal.reason)), { once: true });
  });

/**
 * One POST to a provider, retried only when trying again can help: busy servers and dropped
 * connections (waiting about 0.6 s, then 1.2 s), and a rate limit that clears within 5 seconds.
 * With a fallback provider waiting, the primary is retried once at most, so a failing primary
 * hands over quickly. A used-up quota, a refused key or a missing model fail at once.
 */
async function providerPost(
  p: ProviderConfig,
  url: string,
  headers: Record<string, string>,
  body: unknown,
  ms: number,
  signal: AbortSignal | undefined,
  maxRetries: number
): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    let error: AiError;
    try {
      const res = await fetch(url, { method: 'POST', signal: deadline(ms, signal), headers, body: JSON.stringify(body) });
      if (res.ok && res.body) return res;
      error = classify(p.name, res.status, await res.text().catch(() => ''), res.headers.get('retry-after'));
    } catch (e: any) {
      if (signal?.aborted) throw e; // the person pressed Stop or left
      error =
        e instanceof AiError
          ? e
          : e?.name === 'TimeoutError' || e?.name === 'AbortError'
            ? new AiError(`${p.name} did not answer in time`, 'timeout', undefined, undefined, p.name)
            : new AiError(`Could not reach ${p.name}: ${String(e?.message || e).slice(0, 120)}`, 'network', undefined, undefined, p.name);
    }
    const retryable = error.code === 'overloaded' || error.code === 'network';
    const shortWait = error.code === 'rate_limited' && (error.retryAfter ?? 99) <= 5;
    if ((retryable || shortWait) && attempt < maxRetries) {
      await sleep(shortWait ? (error.retryAfter || 1) * 1000 : 600 * 2 ** attempt + Math.random() * 250, signal);
      continue;
    }
    throw error;
  }
}

/* ===================================================================== */
/* Streaming plumbing                                                     */
/* ===================================================================== */

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

/** Tokens used by one request, when the provider reports them */
export interface Usage {
  input?: number;
  output?: number;
}

/* ---------- Gemini ---------- */

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const geminiHeaders = (p: ProviderConfig) => ({ 'Content-Type': 'application/json', 'x-goog-api-key': p.key });

/** Visible text from a Gemini response, skipping "thought" parts some models send. */
const geminiText = (json: any) =>
  (json?.candidates?.[0]?.content?.parts || [])
    .filter((part: any) => !part?.thought)
    .map((part: any) => part?.text || '')
    .join('');
const geminiBlocked = (json: any) =>
  !!json?.promptFeedback?.blockReason || ['SAFETY', 'PROHIBITED_CONTENT', 'BLOCKLIST', 'SPII'].includes(json?.candidates?.[0]?.finishReason);
const geminiUsage = (json: any): Usage | undefined =>
  json?.usageMetadata ? { input: json.usageMetadata.promptTokenCount, output: json.usageMetadata.candidatesTokenCount } : undefined;

async function* geminiStream(p: ProviderConfig, system: string, turns: Turn[], signal: AbortSignal | undefined, retries: number, usage: Usage): AsyncGenerator<string> {
  const res = await providerPost(
    p,
    `${GEMINI_BASE}/${encodeURIComponent(p.model)}:streamGenerateContent?alt=sse`,
    geminiHeaders(p),
    {
      systemInstruction: { parts: [{ text: system }] },
      contents: turns.map(t => ({ role: t.role, parts: [{ text: t.text }] })),
      generationConfig: { temperature: 0.6 },
    },
    55_000,
    signal,
    retries
  );
  let blocked = false;
  for await (const data of sseData(res.body!)) {
    let json: any;
    try {
      json = JSON.parse(data);
    } catch {
      continue; // ignore a malformed chunk
    }
    if (json?.error) throw classifyGeminiError(Number(json.error.code) || 500, JSON.stringify(json));
    if (geminiBlocked(json)) blocked = true;
    Object.assign(usage, geminiUsage(json));
    const text = geminiText(json);
    if (text) yield text;
  }
  if (blocked) throw new AiError('Gemini stopped the answer (safety filter)', 'blocked', undefined, undefined, 'gemini');
}

async function geminiGenerate(p: ProviderConfig, prompt: string, temperature: number, schema: Schema | null, retries: number): Promise<string> {
  const res = await providerPost(
    p,
    `${GEMINI_BASE}/${encodeURIComponent(p.model)}:generateContent`,
    geminiHeaders(p),
    {
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: schema ? { temperature, responseMimeType: 'application/json', responseSchema: geminiSchema(schema) } : { temperature },
    },
    25_000,
    undefined,
    retries
  );
  return geminiText(await res.json()).trim();
}

/* ---------- Groq (OpenAI-compatible chat completions) ---------- */

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const groqHeaders = (p: ProviderConfig) => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${p.key}` });
/**
 * The gpt-oss models think before answering: keep that short and leave it out of the reply.
 * Only these two settings, and only for gpt-oss: Groq documents reasoning_effort for these models alone
 * (console.groq.com/docs/reasoning), and other models must not get it.
 */
const groqReasoning = (model: string) => (/^openai\/gpt-oss/i.test(model) ? { reasoning_effort: 'low', include_reasoning: false } : {});

async function* groqStream(p: ProviderConfig, system: string, turns: Turn[], signal: AbortSignal | undefined, retries: number, usage: Usage): AsyncGenerator<string> {
  const res = await providerPost(
    p,
    GROQ_URL,
    groqHeaders(p),
    {
      model: p.model,
      stream: true,
      temperature: 0.6,
      max_completion_tokens: 2048,
      ...groqReasoning(p.model),
      messages: [{ role: 'system', content: system }, ...turns.map(t => ({ role: t.role === 'user' ? 'user' : 'assistant', content: t.text }))],
    },
    55_000,
    signal,
    retries
  );
  for await (const data of sseData(res.body!)) {
    if (data === '[DONE]') break;
    let json: any;
    try {
      json = JSON.parse(data);
    } catch {
      continue; // ignore a malformed chunk
    }
    if (json?.error) throw classifyGroqError(Number(json.error.status) || 500, JSON.stringify(json));
    const u = json?.x_groq?.usage || json?.usage;
    if (u) Object.assign(usage, { input: u.prompt_tokens, output: u.completion_tokens });
    const text = json?.choices?.[0]?.delta?.content;
    if (text) yield text;
  }
}

async function groqGenerate(p: ProviderConfig, prompt: string, temperature: number, schema: Schema | null, retries: number): Promise<string> {
  const res = await providerPost(
    p,
    GROQ_URL,
    groqHeaders(p),
    {
      model: p.model,
      temperature,
      max_completion_tokens: 1024,
      ...groqReasoning(p.model),
      ...(schema ? { response_format: { type: 'json_object' } } : {}),
      messages: [{ role: 'user', content: schema ? `${prompt}\n\nAnswer with one JSON object that matches this schema: ${JSON.stringify(schema)}` : prompt }],
    },
    25_000,
    undefined,
    retries
  );
  return String((await res.json())?.choices?.[0]?.message?.content || '').trim();
}

/* ===================================================================== */
/* The one interface the app uses                                         */
/* ===================================================================== */

/** What happened on one request: who answered, and why any provider was skipped */
export interface AiRun {
  provider?: ProviderName;
  model?: string;
  usage: Usage;
  /** Providers that failed before the one that answered, with why */
  failed: Array<{ provider: ProviderName; code: AiErrorCode; status?: number }>;
}

const notConfigured = () => new AiError('No AI key is set', 'not_configured');
const retriesFor = (cfg: AiConfig, i: number) => (i < cfg.providers.length - 1 ? 1 : 2);

/**
 * Streams a chat reply from the first provider that can answer. Falls back to the next provider
 * only when the failure is one it may get past and nothing has been streamed yet (switching half
 * way would mix two answers). `run` records who answered and what failed, for the logs.
 */
export async function* streamChat(cfg: AiConfig, system: string, turns: Turn[], signal?: AbortSignal, run: AiRun = { usage: {}, failed: [] }): AsyncGenerator<string> {
  if (!cfg.providers.length) throw notConfigured();
  for (let i = 0; i < cfg.providers.length; i++) {
    const p = cfg.providers[i];
    let streamed = false;
    try {
      const usage: Usage = {};
      const parts = p.name === 'groq' ? groqStream(p, system, turns, signal, retriesFor(cfg, i), usage) : geminiStream(p, system, turns, signal, retriesFor(cfg, i), usage);
      for await (const chunk of parts) {
        if (!streamed) Object.assign(run, { provider: p.name, model: p.model });
        streamed = true;
        yield chunk;
      }
      if (!streamed) throw new AiError(`${p.name} sent no answer`, 'empty', undefined, undefined, p.name);
      run.usage = usage;
      return;
    } catch (e: any) {
      if (signal?.aborted) throw e;
      const err = e instanceof AiError ? e : new AiError(String(e?.message || e).slice(0, 200), 'unknown', undefined, undefined, p.name);
      err.provider ??= p.name;
      run.failed.push({ provider: p.name, code: err.code, status: err.status });
      const next = cfg.providers[i + 1];
      if (streamed || !next || !FALLBACK_CODES.includes(err.code)) throw err;
    }
  }
}

async function withFallback(cfg: AiConfig, call: (p: ProviderConfig, retries: number) => Promise<string>, run?: AiRun): Promise<string> {
  if (!cfg.providers.length) throw notConfigured();
  for (let i = 0; i < cfg.providers.length; i++) {
    const p = cfg.providers[i];
    try {
      const text = await call(p, retriesFor(cfg, i));
      if (!text) throw new AiError(`${p.name} sent no answer`, 'empty', undefined, undefined, p.name);
      if (run) Object.assign(run, { provider: p.name, model: p.model });
      return text;
    } catch (e: any) {
      const err = e instanceof AiError ? e : new AiError(String(e?.message || e).slice(0, 200), e?.name === 'SyntaxError' ? 'empty' : 'unknown', undefined, undefined, p.name);
      run?.failed.push({ provider: p.name, code: err.code, status: err.status });
      if (!cfg.providers[i + 1] || !FALLBACK_CODES.includes(err.code)) throw err;
    }
  }
  throw notConfigured();
}

/** One short answer as plain text (with the same fallback as the chat). */
export function generateText(cfg: AiConfig, prompt: string, temperature = 0.6, run?: AiRun): Promise<string> {
  return withFallback(cfg, (p, r) => (p.name === 'groq' ? groqGenerate(p, prompt, temperature, null, r) : geminiGenerate(p, prompt, temperature, null, r)), run);
}

/** One structured answer, checked against `schema` (with the same fallback as the chat). */
export async function generateJson<T>(cfg: AiConfig, prompt: string, schema: Schema, temperature = 0.3, run?: AiRun): Promise<Partial<T>> {
  const text = await withFallback(
    cfg,
    async (p, r) => {
      const raw = p.name === 'groq' ? await groqGenerate(p, prompt, temperature, schema, r) : await geminiGenerate(p, prompt, temperature, schema, r);
      JSON.parse(raw || '{}'); // a malformed answer counts as empty, so the fallback can try
      return raw;
    },
    run
  );
  const parsed = JSON.parse(text || '{}');
  return parsed && typeof parsed === 'object' ? parsed : {};
}
