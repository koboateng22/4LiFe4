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
}

export interface StreamHandlers {
  /** Risk found in the message itself, before the AI answers */
  onRisk?: (risk: RiskLevel) => void;
  /** More of the reply has arrived */
  onText?: (soFar: string) => void;
}

type ChatBody = { message: string; mode: TherapyMode; history: Array<{ role: 'user' | 'model'; content: string }>; userProfile: unknown };

const stopped = () => new DOMException('Stopped', 'AbortError');

async function send(body: ChatBody, signal?: AbortSignal): Promise<Response> {
  try {
    const res = await apiFetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
      body: JSON.stringify({ ...body, stream: true }),
      signal,
    });
    if (!res.ok) {
      const detail = await res.json().catch(() => null);
      throw new Error(detail?.error || `The AI service returned ${res.status}`);
    }
    return res;
  } catch (e: any) {
    // Keep the Stop button working: the chat screen looks for an AbortError
    if (signal?.aborted || e?.name === 'AbortError') throw stopped();
    if (e instanceof TypeError) throw new Error('The AI service could not be reached');
    throw e;
  }
}

export async function streamChat(body: ChatBody, handlers: StreamHandlers, signal?: AbortSignal): Promise<ChatDone> {
  const res = await send(body, signal);
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
  if (!result.done) throw new Error('The reply was cut off');
  return result.done;
}
