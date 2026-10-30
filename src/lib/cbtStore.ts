/**
 * Where AI therapy keeps things.
 *
 *  - The conversation with the AI stays on this device only (never uploaded).
 *  - Thought records are saved to Supabase when connected, otherwise on this device.
 *    A record ticked "share with my counsellor" is visible to linked counsellors.
 */
import type { ChatMessage } from '../types';
import type { ThoughtRecord } from './cbt';
import { db, hasRemote, newId } from './supabase';

const isUuid = (id?: string) => !!id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
const useRemote = (uid?: string) => hasRemote() && isUuid(uid);

const readJSON = <T,>(key: string, fallback: T): T => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
};
const writeJSON = (key: string, value: unknown) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage full or blocked: keep working in memory */
  }
};

/* ---------- Conversation (this device only) ---------- */

export interface UrgeRatings {
  /** Craving before talking it through, 0–10 */
  before?: number;
  /** Craving afterwards, 0–10 */
  after?: number;
}

export interface StoredChat {
  messages: ChatMessage[];
  ratings: UrgeRatings;
  updatedAt?: string;
}

const chatKey = (uid: string) => `4life_ai_chat_v2_${uid || 'guest'}`;
const MAX_MESSAGES = 80;

export function loadChat(uid: string): StoredChat {
  const saved = readJSON<StoredChat | null>(chatKey(uid), null);
  // A conversation left alone for a week starts fresh
  if (!saved || !saved.updatedAt || Date.now() - new Date(saved.updatedAt).getTime() > 7 * 24 * 3600000) return { messages: [], ratings: {} };
  return { messages: Array.isArray(saved.messages) ? saved.messages : [], ratings: saved.ratings || {} };
}

export function saveChat(uid: string, chat: StoredChat) {
  writeJSON(chatKey(uid), { messages: chat.messages.slice(-MAX_MESSAGES), ratings: chat.ratings, updatedAt: new Date().toISOString() });
}

export function clearChat(uid: string) {
  try {
    localStorage.removeItem(chatKey(uid));
  } catch {}
}

/* ---------- Thought records ---------- */

const recordsKey = (uid: string) => `4life_thought_records_v1_${uid || 'guest'}`;
/** Device mode only: shared records, so the demo counsellor on this device can see them */
export const SHARED_THOUGHTS_KEY = '4life_shared_thoughts';

const rowToRecord = (r: any): ThoughtRecord => ({
  id: r.id,
  createdAt: r.created_at,
  situation: r.situation || '',
  thought: r.thought,
  emotion: r.emotion || '',
  intensityBefore: r.intensity_before,
  trap: r.trap,
  evidenceFor: r.evidence_for || '',
  evidenceAgainst: r.evidence_against || '',
  balancedThought: r.balanced_thought,
  intensityAfter: r.intensity_after,
  shared: !!r.shared,
});

const recordToRow = (r: ThoughtRecord) => ({
  id: r.id,
  situation: r.situation,
  thought: r.thought,
  emotion: r.emotion,
  intensity_before: Math.round(r.intensityBefore),
  trap: r.trap,
  evidence_for: r.evidenceFor,
  evidence_against: r.evidenceAgainst,
  balanced_thought: r.balancedThought,
  intensity_after: Math.round(r.intensityAfter),
  shared: r.shared,
});

function syncSharedOnDevice(nickname: string, records: ThoughtRecord[]) {
  const others = readJSON<Array<{ nickname: string; record: ThoughtRecord }>>(SHARED_THOUGHTS_KEY, []).filter(x => x.nickname !== nickname);
  writeJSON(SHARED_THOUGHTS_KEY, [...others, ...records.filter(r => r.shared).map(record => ({ nickname, record }))]);
}

/** Records shared by a client (device mode), for the counsellor's view on the same device. */
export const sharedThoughtsOnDevice = (nickname: string): ThoughtRecord[] =>
  readJSON<Array<{ nickname: string; record: ThoughtRecord }>>(SHARED_THOUGHTS_KEY, [])
    .filter(x => x.nickname === nickname)
    .map(x => x.record)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

export async function listThoughtRecords(uid: string): Promise<ThoughtRecord[]> {
  if (useRemote(uid)) {
    const { data, error } = await db().from('thought_records').select('*').eq('client_id', uid).order('created_at', { ascending: false }).limit(100);
    if (error) throw error;
    return (data || []).map(rowToRecord);
  }
  return readJSON<ThoughtRecord[]>(recordsKey(uid), []);
}

export async function saveThoughtRecord(uid: string, nickname: string, rec: Omit<ThoughtRecord, 'id' | 'createdAt'>): Promise<ThoughtRecord> {
  const full: ThoughtRecord = { ...rec, id: newId(), createdAt: new Date().toISOString() };
  if (useRemote(uid)) {
    const { data, error } = await db().from('thought_records').insert(recordToRow(full)).select().single();
    if (error) throw error;
    return rowToRecord(data);
  }
  const list = [full, ...readJSON<ThoughtRecord[]>(recordsKey(uid), [])].slice(0, 100);
  writeJSON(recordsKey(uid), list);
  syncSharedOnDevice(nickname, list);
  return full;
}

export async function setThoughtShared(uid: string, nickname: string, id: string, shared: boolean) {
  if (useRemote(uid)) {
    const { error } = await db().from('thought_records').update({ shared }).eq('id', id);
    if (error) throw error;
    return;
  }
  const list = readJSON<ThoughtRecord[]>(recordsKey(uid), []).map(r => (r.id === id ? { ...r, shared } : r));
  writeJSON(recordsKey(uid), list);
  syncSharedOnDevice(nickname, list);
}

export async function deleteThoughtRecord(uid: string, nickname: string, id: string) {
  if (useRemote(uid)) {
    const { error } = await db().from('thought_records').delete().eq('id', id);
    if (error) throw error;
    return;
  }
  const list = readJSON<ThoughtRecord[]>(recordsKey(uid), []).filter(r => r.id !== id);
  writeJSON(recordsKey(uid), list);
  syncSharedOnDevice(nickname, list);
}
