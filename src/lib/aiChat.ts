/**
 * Talks to the AI chat and shows the reply word by word as it arrives
 * (server-sent events over a normal POST request).
 *
 * apiFetch() picks the backend: /api/chat on this site, or the "chat" Supabase
 * Edge Function if /api is missing or down (see apiFetch.ts).
 */
import { apiFetch } from './apiFetch';
import type { RiskLevel } from './safety';
import type { TherapyMode } from './cbt';

export interface ChatDone {
  reply: string;
  suggestions: string[];
  risk: RiskLevel;
  model?: string;
  language?: string;
  /** No AI answer could be made: why (the server's reason, or one found here) */
  error?: ChatFailure;
}

/**
 * Why there is no AI answer. From the server: not_configured, bad_key, bad_model, rate_limited,
 * quota_exhausted, overloaded, timeout, network, blocked, empty, bad_request, unknown.
 * Found here: offline, unreachable, auth (sign-in needed), too_long, server.
 */
export interface ChatFailure {
  code: string;
  retryAfter?: number;
  partial?: boolean;
  /** Groq failed, then Gemini (the backup) was tried and failed too */
  backupFailed?: boolean;
}

export class ChatError extends Error {
  failure: ChatFailure;
  constructor(failure: ChatFailure) {
    super(failure.code);
    this.failure = failure;
  }
}

/** How long to wait for the reply before giving up (the server itself stops after 55 s) */
const CLIENT_TIMEOUT_MS = 70_000;

export interface StreamHandlers {
  /** Risk found in the message itself, before the AI answers */
  onRisk?: (risk: RiskLevel) => void;
  /** More of the reply has arrived */
  onText?: (soFar: string) => void;
}

type ChatBody = { message: string; mode: TherapyMode; history: Array<{ role: 'user' | 'model'; content: string }>; userProfile: unknown };

const stopped = () => new DOMException('Stopped', 'AbortError');

async function send(body: ChatBody, signal: AbortSignal | undefined, timeout: AbortSignal): Promise<Response> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new ChatError({ code: 'offline' });
  try {
    const res = await apiFetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
      body: JSON.stringify({ ...body, stream: true }),
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    });
    if (!res.ok) {
      const retry = Number(res.headers.get('Retry-After')) || undefined;
      if (res.status === 401 || res.status === 403) throw new ChatError({ code: 'auth' });
      if (res.status === 429) throw new ChatError({ code: 'rate_limited', retryAfter: retry });
      if (res.status === 413) throw new ChatError({ code: 'too_long' });
      if (res.status === 400) throw new ChatError({ code: 'bad_request' });
      throw new ChatError({ code: 'server' });
    }
    return res;
  } catch (e: any) {
    if (e instanceof ChatError) throw e;
    // Keep the Stop button working: the chat screen looks for an AbortError
    if (signal?.aborted) throw stopped();
    if (timeout.aborted) throw new ChatError({ code: 'timeout' });
    if (e instanceof TypeError) throw new ChatError({ code: typeof navigator !== 'undefined' && navigator.onLine === false ? 'offline' : 'unreachable' });
    throw e;
  }
}

/**
 * Sends one message and streams the reply. Resolves with the final answer, which carries `error`
 * when no AI answer could be made; rejects with ChatError when the server couldn't be reached
 * properly, or with an AbortError when the person pressed Stop.
 */
export async function streamChat(body: ChatBody, handlers: StreamHandlers, signal?: AbortSignal): Promise<ChatDone> {
  const timeout = AbortSignal.timeout(CLIENT_TIMEOUT_MS);
  const res = await send(body, signal, timeout);
  try {
    return await readReply(res, handlers);
  } catch (e: any) {
    if (signal?.aborted) throw stopped();
    if (timeout.aborted) throw new ChatError({ code: 'timeout' });
    if (e instanceof ChatError) throw e;
    throw new ChatError({ code: 'unreachable' });
  }
}

async function readReply(res: Response, handlers: StreamHandlers): Promise<ChatDone> {
  if (!res.body || !(res.headers.get('content-type') || '').includes('text/event-stream')) {
    const whole = (await res.json()) as ChatDone;
    handlers.onText?.(whole.reply || '');
    return whole;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let text = '';
  const result: { done: ChatDone | null } = { done: null };

  const handle = (block: string) => {
    let event = 'message';
    const dataLines: string[] = [];
    for (const line of block.split('\n')) {
      if (line.startsWith('event:')) event = line.slice(6).trim();
      else if (line.startsWith('data:')) dataLines.push(line.slice(5).trimStart());
    }
    if (!dataLines.length) return;
    let data: any;
    try {
      data = JSON.parse(dataLines.join('\n'));
    } catch {
      return;
    }
    if (event === 'meta') handlers.onRisk?.(data.risk);
    else if (event === 'delta') {
      text += data.text || '';
      handlers.onText?.(text);
    } else if (event === 'done') result.done = data as ChatDone;
  };

  for (;;) {
    const { value, done: finished } = await reader.read();
    if (value) buffer += decoder.decode(value, { stream: true });
    let i: number;
    while ((i = buffer.indexOf('\n\n')) >= 0) {
      handle(buffer.slice(0, i));
      buffer = buffer.slice(i + 2);
    }
    if (finished) break;
  }
  if (buffer.trim()) handle(buffer);
  // the connection ended before the final message: keep what arrived, and say it was cut off
  if (!result.done) return { reply: text, suggestions: [], risk: 'none', error: { code: text ? 'unreachable' : 'empty', partial: !!text } };
  return result.done;
}
