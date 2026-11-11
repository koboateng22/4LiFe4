/**
 * What each 4Life API route does, written once and used twice:
 *   - Vercel:   server/routes.ts wraps these for Express (/api/...)
 *   - Supabase: supabase/functions/<name>/index.ts wraps them for Deno
 *
 * Every handler takes the request body and a context, and returns { status, body }.
 * None of them throw for bad input or AI failures: they fall back to built-in answers,
 * because a person in a hard moment should always get a reply.
 */
import { assessRisk, asRiskLevel, maxRisk, moderateText, type RiskLevel } from '../../src/lib/safety.js';
import { trailerStreamer } from '../../src/lib/aiTrailer.js';
import { TESTING_QUESTIONS, THINKING_TRAPS, guessTrap, isTrapId, type TherapyMode } from '../../src/lib/cbt.js';
import { firstAidTopic } from '../../src/lib/firstAid.js';
import { cleanVideoSearch, isoDurationSeconds, videoCategory, type LibraryVideo } from '../../src/lib/videoLibrary.js';
import { AiError, aiConfig, generateJson, generateText, streamChat, type AiErrorCode, type AiRun, type Env, type ProviderName } from './ai.js';
import {
  CRISIS_SUGGESTIONS,
  FALLBACK_SUGGESTIONS,
  asMode,
  chatSystemPrompt,
  circleGuideOffline,
  circleGuidePrompt,
  crisisReply,
  moderationPrompt,
  thoughtRecordPrompt,
  toTurns,
} from './prompts.js';
import { cleanName, clip, replyLanguage } from './text.js';
import { supabaseSettings } from './guard.js';

export interface Ctx {
  env: Env;
}

export interface Result {
  status: number;
  body: unknown;
  /** Cache-Control for answers that are the same for everyone */
  cache?: string;
}

const ok = (body: unknown, cache?: string): Result => ({ status: 200, body, cache });
const bad = (error: string, status = 400): Result => ({ status, body: { error } });

/* =====================================================================
 * Health: is the API up, and which services are switched on (never the keys)
 * ===================================================================== */
export function health(ctx: Ctx): Result {
  const ai = aiConfig(ctx.env);
  const on = (name: 'groq' | 'gemini') => ai.providers.find(x => x.name === name);
  return ok({
    ok: true,
    // which provider answers first, which one takes over, and whether each has a key (never the keys)
    ai: { primary: ai.primary, fallback: ai.fallback, answering: ai.provider || 'none' },
    groq: !!on('groq'),
    gemini: !!on('gemini'),
    models: Object.fromEntries(ai.providers.map(x => [x.name, x.model])),
    youtube: !!youtubeKey(ctx.env),
    // Which Supabase project this server signs people in against (the project ID is public: it is in
    // the app's address list anyway). Compare it with the 4Life project in the Supabase dashboard.
    supabaseProject: supabaseProjectRef(ctx.env),
  });
}

/** "https://abcd1234.supabase.co" → "abcd1234"; null when no Supabase is set (device mode) */
export function supabaseProjectRef(env: Env): string | null {
  const url = supabaseSettings(env).url;
  if (!url) return null;
  try {
    const host = new URL(url).hostname;
    return host.endsWith('.supabase.co') ? host.split('.')[0] : host;
  } catch {
    return 'invalid URL';
  }
}

/* =====================================================================
 * 1. AI CBT therapy: streamed replies with crisis detection
 * ===================================================================== */

export interface ChatInput {
  text: string;
  mode: TherapyMode;
  name: string;
  history: unknown;
  profile: any;
  stream: boolean;
  keywordRisk: RiskLevel;
}

export interface ChatDone {
  reply: string;
  suggestions: string[];
  risk: RiskLevel;
  model: string;
  mode: TherapyMode;
  language?: string;
  /**
   * Set when no AI answer could be made. The app shows what happened (and a Try again button)
   * instead of an answer; nothing is made up. `partial` means part of the reply already arrived.
   */
  error?: { code: AiErrorCode; retryAfter?: number; partial?: boolean };
  /** Which provider answered (groq, or gemini when it took over) */
  provider?: ProviderName;
}

/** Checks the request. Returns an error to send, or the cleaned-up input. */
export function readChat(body: any): { error: Result } | { input: ChatInput } {
  const text = clip(body?.message, 2000);
  if (!text) return { error: bad('Please write a message.') };
  const profile = body?.userProfile && typeof body.userProfile === 'object' ? body.userProfile : {};
  return {
    input: {
      text,
      mode: asMode(body?.mode),
      name: cleanName(profile.nickname || profile.name, 'friend'),
      history: body?.history,
      profile,
      stream: body?.stream === true,
      // Checked before the AI answers, so emergency options appear straight away
      keywordRisk: assessRisk(text).level,
    },
  };
}

/**
 * Runs the chat. `send` receives each streamed event ("meta", then "delta"s);
 * the final payload is returned (the caller sends it as "done", or as plain JSON).
 */
export async function runChat(input: ChatInput, ctx: Ctx, send: (event: 'meta' | 'delta', data: unknown) => void, signal?: AbortSignal): Promise<ChatDone> {
  const ai = aiConfig(ctx.env);
  const language = replyLanguage(input.profile)?.code;
  const run: AiRun = { usage: {}, failed: [] };
  // One log line per reply, for monitoring: who answered, what failed first, tokens. Never the person's words or a key.
  const log = (outcome: string) => {
    const failed = run.failed.map(f => `${f.provider}:${f.code}${f.status ? `(${f.status})` : ''}`).join(',');
    const tokens = run.usage.input || run.usage.output ? ` tokens=${run.usage.input ?? '?'}/${run.usage.output ?? '?'}` : '';
    (outcome === 'ok' ? console.info : console.error)(`[ai] chat ${outcome} by=${run.provider ? `${run.provider}/${run.model}` : 'none'}${failed ? ` failed=${failed}` : ''}${run.failed.length && outcome === 'ok' ? ' (fallback)' : ''}${tokens}`);
  };
  const done = (reply: string, suggestions: string[], risk: RiskLevel): ChatDone => ({
    reply,
    suggestions: risk === 'crisis' ? CRISIS_SUGGESTIONS : suggestions.length ? suggestions : FALLBACK_SUGGESTIONS[input.mode],
    risk,
    model: run.model || ai.model,
    provider: run.provider,
    mode: input.mode,
    language,
  });
  // No answer could be made: say why. (Emergency options still appear in the app from the keyword check.)
  const failedWith = (e: AiError, shown = ''): ChatDone => {
    log(`failed:${e.code}`);
    return {
      reply: shown,
      suggestions: [],
      risk: input.keywordRisk,
      model: run.model || ai.model,
      provider: run.provider,
      mode: input.mode,
      error: { code: e.code, ...(e.retryAfter ? { retryAfter: e.retryAfter } : {}), ...(shown ? { partial: true } : {}) },
    };
  };

  send('meta', { risk: input.keywordRisk });
  if (!ai.provider) return failedWith(new AiError('No AI key is set on the server', 'not_configured'));

  const streamer = trailerStreamer();
  let shown = '';
  try {
    const system = chatSystemPrompt(input.profile, input.mode, input.keywordRisk);
    for await (const chunk of streamChat(ai, system, toTurns(input.history, input.text), signal, run)) {
      // Everything except the hidden last line (suggestions and risk) is sent as it arrives
      const visible = streamer.push(chunk);
      if (visible) {
        shown += visible;
        send('delta', { text: visible });
      }
    }
    const parsed = streamer.finish();
    if (parsed.rest) send('delta', { text: parsed.rest });
    if (!parsed.reply) return failedWith(new AiError('The AI sent no answer', 'empty'));
    log('ok');
    return done(parsed.reply, parsed.suggestions, maxRisk(input.keywordRisk, parsed.risk));
  } catch (error) {
    if (signal?.aborted) return done(shown.trim(), [], input.keywordRisk);
    const e = error instanceof AiError ? error : new AiError(String((error as Error)?.message || error).slice(0, 200), 'unknown');
    // Part of the reply already reached the person: keep it, and say it was cut off
    return failedWith(e, shown.trim());
  }
}

/* =====================================================================
 * 2. Thought record helper: the thinking trap, testing questions and a
 *    fairer thought. The person always edits the result.
 * ===================================================================== */
export async function cbtSuggest(body: any, ctx: Ctx): Promise<Result> {
  const thought = clip(body?.thought, 600);
  if (!thought) return bad('Please write the thought first.');
  const situation = clip(body?.situation, 400);
  const emotion = clip(body?.emotion, 60);
  const risk = assessRisk(`${situation} ${thought}`).level;
  const offline = {
    trap: guessTrap(thought),
    questions: TESTING_QUESTIONS,
    balancedThought: '',
    insight: 'A thought is not a fact or an order. You can notice it, test it, and choose what to do next.',
    risk,
    offline: true,
  };

  const ai = aiConfig(ctx.env);
  if (!ai.provider || risk === 'crisis') return ok(offline);

  try {
    const data = await generateJson<{ trap: string; questions: unknown[]; balancedThought: string; insight: string }>(
      ai,
      thoughtRecordPrompt(situation, thought, emotion, body?.userProfile),
      {
        type: 'object',
        properties: {
          trap: { type: 'string', enum: THINKING_TRAPS.map(x => x.id) },
          questions: { type: 'array', items: { type: 'string' } },
          balancedThought: { type: 'string' },
          insight: { type: 'string' },
        },
        required: ['trap', 'questions', 'balancedThought', 'insight'],
      },
      0.4
    );
    return ok({
      trap: isTrapId(data.trap) ? data.trap : offline.trap,
      questions: Array.isArray(data.questions) && data.questions.length ? data.questions.slice(0, 3).map(q => clip(q, 160)) : offline.questions,
      balancedThought: clip(data.balancedThought, 400),
      insight: clip(data.insight, 300) || offline.insight,
      risk,
      language: replyLanguage(body?.userProfile)?.code,
    });
  } catch (error) {
    console.error('Thought record suggestion error:', error);
    return ok(offline);
  }
}

/* =====================================================================
 * 3. Global Village: house-rules check before anything is posted
 * ===================================================================== */
export async function moderate(body: any, ctx: Ctx): Promise<Result> {
  const text = clip(body?.text, 4000);
  const local = moderateText(text);
  const ai = aiConfig(ctx.env);
  if (!local.ok || !ai.provider || !text) return ok({ ...local, checkedBy: 'rules' });

  try {
    const data = await generateJson<{ allowed: boolean; reason: string; risk: string }>(
      ai,
      moderationPrompt(text),
      {
        type: 'object',
        properties: {
          allowed: { type: 'boolean' },
          reason: { type: 'string', description: 'If refused: one short, kind sentence telling the writer what to change.' },
          risk: { type: 'string', enum: ['none', 'concern', 'crisis'] },
        },
        required: ['allowed', 'risk'],
      },
      0
    );
    const risk = maxRisk(local.risk, asRiskLevel(data.risk));
    if (data.allowed === false) {
      return ok({ ok: false, reason: clip(data.reason, 200) || 'Please rewrite this so it follows the Village rules.', risk, checkedBy: 'ai' });
    }
    return ok({ ok: true, risk, checkedBy: 'ai' });
  } catch (error) {
    console.error('Moderation error:', error);
    return ok({ ...local, checkedBy: 'rules' });
  }
}

/* =====================================================================
 * 4. Global Village: ask the circle guide (a private reply, seen only by the asker)
 * ===================================================================== */
export async function villageGuide(body: any, ctx: Ctx): Promise<Result> {
  const question = clip(body?.question, 1000);
  if (!question) return bad('Please write your question.');
  const profile = body?.userProfile;
  const name = cleanName(profile?.nickname, 'friend');
  const risk = assessRisk(question).level;
  if (risk === 'crisis') return ok({ reply: crisisReply(name), risk });

  const ai = aiConfig(ctx.env);
  if (!ai.provider) return ok({ reply: circleGuideOffline(name), risk, offline: true });
  try {
    const reply = await generateText(ai, circleGuidePrompt(question, body?.circleTitle, name, profile), 0.6);
    return ok({ reply: reply || circleGuideOffline(name), risk, language: replyLanguage(profile)?.code });
  } catch (error) {
    console.error('Circle guide error:', error);
    return ok({ reply: "I couldn't answer just now. Try again in a moment, or ask the circle host.", risk, offline: true });
  }
}

/* =====================================================================
 * 5. First aid videos (YouTube)
 *    Without YOUTUBE_API_KEY the app links to a YouTube search instead.
 *    With it, a few embeddable, safe-search videos are returned per topic.
 * ===================================================================== */
function youtubeKey(env: Env): string {
  const k = (env('YOUTUBE_API_KEY') || '').trim();
  return k && k !== 'MY_YOUTUBE_API_KEY' ? k : '';
}

interface Video {
  id: string;
  title: string;
  channel: string;
  thumb: string;
}
const videoCache = new Map<string, { at: number; videos: Video[] }>();
const VIDEO_TTL_MS = 12 * 60 * 60 * 1000;
const PUBLIC_CACHE = 'public, max-age=3600';

const unescapeHtml = (s: string) =>
  s.replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

export async function firstAidVideos(topicId: unknown, ctx: Ctx): Promise<Result> {
  const topic = firstAidTopic(String(topicId || ''));
  if (!topic) return bad('Unknown first aid topic');

  const key = youtubeKey(ctx.env);
  if (!key) return ok({ topic: topic.id, videos: [], keyMissing: true });

  const cached = videoCache.get(topic.id);
  if (cached && Date.now() - cached.at < VIDEO_TTL_MS) return ok({ topic: topic.id, videos: cached.videos }, PUBLIC_CACHE);

  const url = new URL('https://www.googleapis.com/youtube/v3/search');
  url.search = new URLSearchParams({
    part: 'snippet',
    type: 'video',
    videoEmbeddable: 'true',
    safeSearch: 'strict',
    relevanceLanguage: 'en',
    regionCode: 'GH',
    maxResults: '4',
    q: topic.query,
    key,
  }).toString();

  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!r.ok) {
      console.error('YouTube search failed:', r.status, (await r.text()).slice(0, 300));
      return ok({ topic: topic.id, videos: [], error: 'Videos are not available right now.' });
    }
    const data = (await r.json()) as any;
    const videos: Video[] = (data.items || [])
      .filter((it: any) => /^[\w-]{6,20}$/.test(String(it?.id?.videoId || '')))
      .map((it: any) => ({
        id: String(it.id.videoId),
        title: unescapeHtml(clip(it.snippet?.title, 200)),
        channel: unescapeHtml(clip(it.snippet?.channelTitle, 100)),
        thumb: String(it.snippet?.thumbnails?.medium?.url || it.snippet?.thumbnails?.default?.url || '').startsWith('https://')
          ? String(it.snippet?.thumbnails?.medium?.url || it.snippet?.thumbnails?.default?.url)
          : '',
      }));
    videoCache.set(topic.id, { at: Date.now(), videos });
    return ok({ topic: topic.id, videos }, PUBLIC_CACHE);
  } catch (error) {
    console.error('YouTube search error:', error);
    return ok({ topic: topic.id, videos: [], error: 'Videos are not available right now.' });
  }
}

/* =====================================================================
 * 5b. The Learn section: a video library by topic, with search and paging (YouTube Data API v3)
 *     The key stays on the server. A search costs 100 of the project's 10,000 daily quota
 *     units, so answers are cached for 12 hours (and by the CDN for an hour), and once this
 *     server has spent its daily budget (VIDEO_DAILY_UNITS, default 6000) it answers from the
 *     cache only. Every result is checked with videos.list (1 unit): only public, embeddable
 *     videos that aren't age-restricted or blocked in Ghana are shown.
 * ===================================================================== */
const libraryCache = new Map<string, { at: number; body: { videos: LibraryVideo[]; nextPage: string | null } }>();
const LIBRARY_CACHE_MAX = 300;
let quotaDay = '';
let quotaUsed = 0;

/** Spends YouTube quota units from today's budget. False when the budget is used up. */
function spendQuota(units: number, env: Env): boolean {
  const today = new Date().toISOString().slice(0, 10);
  if (today !== quotaDay) {
    quotaDay = today;
    quotaUsed = 0;
  }
  const budget = Number(env('VIDEO_DAILY_UNITS')) || 6000;
  if (quotaUsed + units > budget) return false;
  quotaUsed += units;
  return true;
}

/** For tests: forget cached answers and today's spending */
export function __resetVideoLibrary() {
  libraryCache.clear();
  quotaDay = '';
  quotaUsed = 0;
}

export async function libraryVideos(query: { category?: unknown; q?: unknown; page?: unknown }, ctx: Ctx): Promise<Result> {
  const category = videoCategory(String(query.category || 'wellness'));
  if (!category) return bad('Unknown topic');
  const typed = cleanVideoSearch(query.q);
  const page = /^[\w-]{1,100}$/.test(String(query.page || '')) ? String(query.page) : '';

  const key = youtubeKey(ctx.env);
  if (!key) return ok({ category: category.id, videos: [], nextPage: null, keyMissing: true });

  const cacheKey = `${category.id}|${typed.toLowerCase()}|${page}`;
  const cached = libraryCache.get(cacheKey);
  if (cached && Date.now() - cached.at < VIDEO_TTL_MS) return ok({ category: category.id, ...cached.body }, PUBLIC_CACHE);
  if (!spendQuota(101, ctx.env)) {
    if (cached) return ok({ category: category.id, ...cached.body }, PUBLIC_CACHE);
    return ok({ category: category.id, videos: [], nextPage: null, error: 'Videos are not available right now. Please try again later.' });
  }

  // What the person typed always stays inside the topic, so a search can't wander off mental health
  const q = typed ? `${typed} ${category.query}` : category.query;
  const search = new URL('https://www.googleapis.com/youtube/v3/search');
  search.search = new URLSearchParams({
    part: 'snippet',
    type: 'video',
    videoEmbeddable: 'true',
    videoSyndicated: 'true',
    safeSearch: 'strict',
    relevanceLanguage: 'en',
    regionCode: 'GH',
    maxResults: '12',
    q,
    key,
    ...(page ? { pageToken: page } : {}),
  }).toString();

  try {
    const r = await fetch(search, { signal: AbortSignal.timeout(8000) });
    if (!r.ok) {
      console.error('YouTube search failed:', r.status, (await r.text()).slice(0, 300));
      return ok({ category: category.id, videos: [], nextPage: null, error: 'Videos are not available right now. Please try again later.' });
    }
    const data = (await r.json()) as any;
    const ids: string[] = (data.items || []).map((it: any) => String(it?.id?.videoId || '')).filter((id: string) => /^[\w-]{6,20}$/.test(id));
    let videos: LibraryVideo[] = [];
    if (ids.length) {
      const details = new URL('https://www.googleapis.com/youtube/v3/videos');
      details.search = new URLSearchParams({ part: 'snippet,contentDetails,status', id: ids.join(','), key }).toString();
      const d = await fetch(details, { signal: AbortSignal.timeout(8000) });
      if (!d.ok) {
        console.error('YouTube videos.list failed:', d.status, (await d.text()).slice(0, 300));
        return ok({ category: category.id, videos: [], nextPage: null, error: 'Videos are not available right now. Please try again later.' });
      }
      const byId = new Map<string, any>(((await d.json()) as any).items?.map((v: any) => [String(v.id), v]) || []);
      videos = ids
        .map(id => byId.get(id))
        // gone or private, not embeddable, age-restricted, or blocked in Ghana: left out
        .filter(
          (v: any) =>
            v &&
            v.status?.privacyStatus === 'public' &&
            v.status?.embeddable !== false &&
            v.status?.uploadStatus !== 'rejected' &&
            v.contentDetails?.contentRating?.ytRating !== 'ytAgeRestricted' &&
            !(v.contentDetails?.regionRestriction?.blocked || []).includes('GH') &&
            !(v.contentDetails?.regionRestriction?.allowed && !v.contentDetails.regionRestriction.allowed.includes('GH')) &&
            v.snippet?.liveBroadcastContent !== 'live'
        )
        .map((v: any) => {
          const thumbs = v.snippet?.thumbnails || {};
          const thumb = String(thumbs.medium?.url || thumbs.high?.url || thumbs.default?.url || '');
          return {
            id: String(v.id),
            title: unescapeHtml(clip(v.snippet?.title, 200)),
            channel: unescapeHtml(clip(v.snippet?.channelTitle, 100)),
            description: unescapeHtml(clip(String(v.snippet?.description || '').replace(/\s+/g, ' '), 220)),
            thumb: thumb.startsWith('https://') ? thumb : '',
            duration: isoDurationSeconds(v.contentDetails?.duration),
            category: category.id,
            publishedAt: clip(v.snippet?.publishedAt, 30),
          };
        });
    }
    const nextPage = typeof data.nextPageToken === 'string' && /^[\w-]{1,100}$/.test(data.nextPageToken) ? data.nextPageToken : null;
    const body = { videos, nextPage };
    if (libraryCache.size >= LIBRARY_CACHE_MAX) libraryCache.delete(libraryCache.keys().next().value as string);
    libraryCache.set(cacheKey, { at: Date.now(), body });
    return ok({ category: category.id, ...body }, PUBLIC_CACHE);
  } catch (error) {
    console.error('YouTube library error:', error);
    return ok({ category: category.id, videos: [], nextPage: null, error: 'Videos are not available right now. Please try again later.' });
  }
}

/* =====================================================================
 * 6. Crash reports from the app, so problems show up in the server logs.
 *    Only the error text and the page path; nothing personal.
 * ===================================================================== */
export function clientError(body: any): Result {
  const line = (v: unknown, n: number) => String(v ?? '').replace(/[\r\n]+/g, ' | ').slice(0, n);
  console.error(`[app error] ${line(body?.message, 300)} @ ${line(body?.page, 100)} (${line(body?.where, 60)}) ${line(body?.stack, 1200)}`);
  return { status: 204, body: null };
}
