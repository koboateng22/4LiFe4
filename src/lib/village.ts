/**
 * Global Village data: posts, replies, support, reports, blocks and group circles.
 *
 * With Supabase every member sees the same Village, live. Without it the
 * Village works on this device only (sample posts plus anything you add),
 * so the app can still be tried offline.
 */
import { apiFetch } from './apiFetch';
import { db, hasRemote, newId } from './supabase';
import { moderateText, maxRisk, asRiskLevel, type RiskLevel } from './safety';

export type Topic = 'substance' | 'porn_social' | 'anger' | 'overeating' | 'general';

export const TOPICS: Array<{ id: Topic; label: string }> = [
  { id: 'substance', label: 'Drugs and alcohol' },
  { id: 'porn_social', label: 'Porn and screen time' },
  { id: 'anger', label: 'Anger and stress' },
  { id: 'overeating', label: 'Emotional eating' },
  { id: 'general', label: 'General' },
];
export const topicLabel = (t: string) => TOPICS.find(x => x.id === t)?.label || 'General';

/** One-tap support on a post */
export type Reaction = 'strength' | 'metoo' | 'helped';
export const REACTIONS: Array<{ id: Reaction; label: string; done: string }> = [
  { id: 'strength', label: 'Sending strength', done: 'Strength sent' },
  { id: 'metoo', label: 'Me too', done: 'Me too' },
  { id: 'helped', label: 'This helped me', done: 'Helped me' },
];

export interface VillagePost {
  id: string;
  authorId?: string;
  authorName: string;
  topic: Topic;
  title: string;
  body: string;
  supportCount: number;
  metooCount: number;
  helpedCount: number;
  replyCount: number;
  supportedByMe: boolean;
  /** Which one-tap reactions I have given */
  myReactions: Record<Reaction, boolean>;
  createdAt: string;
  mine: boolean;
  /** Hidden after reports — only the author (and admins) still see it */
  hidden?: boolean;
}

export interface VillageReply {
  id: string;
  postId: string;
  authorId?: string;
  authorName: string;
  body: string;
  createdAt: string;
  mine: boolean;
}

export interface Circle {
  id: string;
  title: string;
  topic: string;
  hostName: string;
  hostRole: string;
  description: string;
  /** 0 = Sunday … 6 = Saturday, Ghana time (GMT) */
  weekday: number;
  /** "19:00" */
  startTime: string;
  durationMin: number;
}

export interface CircleMessage {
  id: string;
  circleId: string;
  authorId?: string;
  authorName: string;
  body: string;
  createdAt: string;
  mine: boolean;
  /** A private answer from the AI guide, never saved or shown to others */
  guide?: boolean;
  lang?: string;
}

export type ReportReason = 'unkind' | 'unsafe' | 'drugs' | 'personal_info' | 'spam' | 'other';
export const REPORT_REASONS: Array<{ id: ReportReason; label: string }> = [
  { id: 'unkind', label: 'Unkind, bullying or hateful' },
  { id: 'unsafe', label: 'Someone may be in danger' },
  { id: 'drugs', label: 'Buying or selling drugs' },
  { id: 'personal_info', label: 'Shares someone’s contact details or identity' },
  { id: 'spam', label: 'Spam or advertising' },
  { id: 'other', label: 'Something else' },
];

export interface Me {
  id: string;
  nickname: string;
}

const isUuid = (id?: string) => !!id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
const remote = (me: Me) => hasRemote() && isUuid(me.id);

/* ------------------------------------------------------------------ */
/* Before anything is posted                                           */
/* ------------------------------------------------------------------ */

export type PostCheck =
  | { status: 'ok'; risk: RiskLevel }
  | { status: 'blocked'; reason: string }
  /** Words that suggest the writer may be in danger right now: not posted, help offered instead */
  | { status: 'crisis' };

/** The Village house rules, checked on this device first and then by the server (which can use AI). */
export async function checkBeforePosting(text: string): Promise<PostCheck> {
  const local = moderateText(text);
  if (local.risk === 'crisis') return { status: 'crisis' };
  if (!local.ok) return { status: 'blocked', reason: local.reason || 'Please rewrite this.' };
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 6000);
    const res = await apiFetch('/api/moderate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    if (res.ok) {
      const data = await res.json();
      const risk = maxRisk(local.risk, asRiskLevel(data.risk));
      if (risk === 'crisis') return { status: 'crisis' };
      if (data.ok === false) return { status: 'blocked', reason: String(data.reason || 'Please rewrite this so it follows the Village rules.') };
      return { status: 'ok', risk };
    }
  } catch {
    /* server unreachable: the on-device rules already passed */
  }
  return { status: 'ok', risk: local.risk };
}

/* ------------------------------------------------------------------ */
/* Device mode storage                                                 */
/* ------------------------------------------------------------------ */

type LocalPost = Omit<VillagePost, 'mine' | 'supportedByMe' | 'myReactions' | 'metooCount' | 'helpedCount'> & {
  supporters: string[];
  metoo?: string[];
  helped?: string[];
  metooCount?: number;
  helpedCount?: number;
};

interface LocalState {
  posts: LocalPost[];
  /** "I'm going" to a circle session: circle id + date → names */
  rsvps?: Record<string, string[]>;
  replies: Array<Omit<VillageReply, 'mine'>>;
  blocked: string[]; // author names
  reported: string[]; // ids
  circleMessages: Array<Omit<CircleMessage, 'mine'>>;
}

const LOCAL_KEY = '4life_village_v2';
const hoursAgo = (h: number) => new Date(Date.now() - h * 3600000).toISOString();

const seedLocal = (): LocalState => ({
  posts: [
    {
      id: 'vp-1',
      authorName: 'GoldenTree_233',
      topic: 'substance',
      title: '42 days without alcohol — what helped me in week one',
      body: 'Evenings were my danger zone, when my friends gathered at the spot near our hostel. What worked: I planned every evening in advance, told one person my plan, and when the urge came I rode it out with the AI for 20 minutes. It always passed. If you are in week one — it gets easier around day 14.',
      supportCount: 24,
      replyCount: 2,
      createdAt: hoursAgo(2),
      supporters: [],
      metooCount: 9,
      helpedCount: 14,
    },
    {
      id: 'vp-2',
      authorName: 'ClearMind_24',
      topic: 'porn_social',
      title: 'Phone outside the bedroom = no more 3 AM loops',
      body: 'My relapses always happened in bed with my phone. I bought a cheap alarm clock and now my phone charges in the hall. 18 days so far. The first nights were hard and boring, but my mornings are so much better.',
      supportCount: 15,
      replyCount: 1,
      createdAt: hoursAgo(9),
      supporters: [],
      metooCount: 6,
      helpedCount: 8,
    },
    {
      id: 'vp-3',
      authorName: 'Akosua_Rising',
      topic: 'anger',
      title: 'Thought record actually changed how I reacted at home',
      body: 'My brother said something and my first thought was "he always disrespects me". I wrote it down, noticed "always" (overgeneralising) and wrote a fairer thought. I still felt annoyed, but 40 instead of 90. We talked instead of shouting.',
      supportCount: 11,
      replyCount: 0,
      createdAt: hoursAgo(26),
      supporters: [],
      metooCount: 3,
      helpedCount: 7,
    },
    {
      id: 'vp-4',
      authorName: 'NewDawn_Tema',
      topic: 'general',
      title: 'Relapsed after 9 days. Starting again today.',
      body: 'I felt like all my progress was gone. Reading old posts here helped me see a slip is not the end. Today is day 1 again, and I know more than I did last time.',
      supportCount: 31,
      replyCount: 1,
      createdAt: hoursAgo(50),
      supporters: [],
      metooCount: 12,
      helpedCount: 4,
    },
  ],
  replies: [
    { id: 'vr-1', postId: 'vp-1', authorName: 'HopefulSoul', body: 'Day 4 here in Accra and evenings are tough. Planning tonight now — thank you.', createdAt: hoursAgo(1) },
    { id: 'vr-2', postId: 'vp-1', authorName: 'Kofi_Steady', body: 'Telling one person the plan is so underrated. Congratulations!', createdAt: hoursAgo(0.5) },
    { id: 'vr-3', postId: 'vp-2', authorName: 'Akosua_Rising', body: 'Doing this tonight. Thanks for the idea.', createdAt: hoursAgo(5) },
    { id: 'vr-4', postId: 'vp-4', authorName: 'GoldenTree_233', body: 'Nine days is real. You learned what your risky moments are. Proud of you for coming back.', createdAt: hoursAgo(48) },
  ],
  blocked: [],
  reported: [],
  circleMessages: [
    { id: 'cm-1', circleId: 'circle-sober-evenings', authorName: 'Dr. Ama (host)', body: 'Welcome everyone. What is shared in this circle stays in this circle.', createdAt: hoursAgo(20) },
    { id: 'cm-2', circleId: 'circle-sober-evenings', authorName: 'Kofi_Steady', body: 'Grateful to be here. 14 days today.', createdAt: hoursAgo(19.9) },
  ],
});

const readLocal = (): LocalState => {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  const s = seedLocal();
  writeLocal(s);
  return s;
};
const writeLocal = (s: LocalState) => {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(s));
  } catch {}
};

/* ------------------------------------------------------------------ */
/* Posts and replies                                                   */
/* ------------------------------------------------------------------ */

const noReactions = (): Record<Reaction, boolean> => ({ strength: false, metoo: false, helped: false });

const rowToPost = (r: any, me: Me, given: Map<string, Set<Reaction>>): VillagePost => ({
  id: r.id,
  authorId: r.author_id,
  authorName: r.author_name,
  topic: r.topic,
  title: r.title,
  body: r.body,
  supportCount: r.support_count,
  metooCount: r.metoo_count ?? 0,
  helpedCount: r.helped_count ?? 0,
  replyCount: r.reply_count,
  supportedByMe: !!given.get(r.id)?.has('strength'),
  myReactions: { strength: !!given.get(r.id)?.has('strength'), metoo: !!given.get(r.id)?.has('metoo'), helped: !!given.get(r.id)?.has('helped') },
  createdAt: r.created_at,
  mine: r.author_id === me.id,
  hidden: r.hidden,
});

export async function listPosts(me: Me): Promise<VillagePost[]> {
  if (remote(me)) {
    const { data, error } = await db().from('village_posts').select('*').order('created_at', { ascending: false }).limit(60);
    if (error) throw error;
    const ids = (data || []).map((p: any) => p.id);
    const given = new Map<string, Set<Reaction>>();
    if (ids.length) {
      const s = await db().from('village_support').select('post_id, kind').in('post_id', ids);
      if (s.error) throw s.error;
      (s.data || []).forEach((x: any) => {
        if (!given.has(x.post_id)) given.set(x.post_id, new Set());
        given.get(x.post_id)!.add((x.kind || 'strength') as Reaction);
      });
    }
    return (data || []).map((r: any) => rowToPost(r, me, given));
  }
  const s = readLocal();
  return s.posts
    .filter(p => !s.blocked.includes(p.authorName) && !s.reported.includes(p.id))
    .map(p => localToPost(p, me))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

const localToPost = (p: LocalPost, me: Me): VillagePost => {
  const { supporters, metoo = [], helped = [], ...rest } = p;
  return {
    ...rest,
    metooCount: p.metooCount ?? metoo.length,
    helpedCount: p.helpedCount ?? helped.length,
    mine: p.authorName === me.nickname,
    supportedByMe: supporters.includes(me.nickname),
    myReactions: { strength: supporters.includes(me.nickname), metoo: metoo.includes(me.nickname), helped: helped.includes(me.nickname) },
  };
};

export async function createPost(me: Me, input: { topic: Topic; title: string; body: string }): Promise<VillagePost> {
  if (remote(me)) {
    const { data, error } = await db().from('village_posts').insert(input).select().single();
    if (error) throw error;
    return rowToPost(data, me, new Map());
  }
  const s = readLocal();
  const post: LocalPost = { id: newId(), authorName: me.nickname, ...input, supportCount: 0, replyCount: 0, createdAt: new Date().toISOString(), supporters: [] };
  s.posts.unshift(post);
  writeLocal(s);
  return localToPost(post, me);
}

export async function deletePost(me: Me, id: string) {
  if (remote(me)) {
    const { error } = await db().from('village_posts').delete().eq('id', id);
    if (error) throw error;
    return;
  }
  const s = readLocal();
  s.posts = s.posts.filter(p => p.id !== id);
  s.replies = s.replies.filter(r => r.postId !== id);
  writeLocal(s);
}

/** Give or take back a one-tap reaction. */
export async function setReaction(me: Me, postId: string, kind: Reaction, on: boolean) {
  if (remote(me)) {
    const q = on
      ? db().from('village_support').insert({ post_id: postId, kind })
      : db().from('village_support').delete().eq('post_id', postId).eq('user_id', me.id).eq('kind', kind);
    const { error } = await q;
    if (error && !/duplicate/i.test(error.message)) throw error;
    return;
  }
  const s = readLocal();
  s.posts = s.posts.map(p => {
    if (p.id !== postId) return p;
    if (kind === 'strength') {
      const has = p.supporters.includes(me.nickname);
      if (on === has) return p;
      return { ...p, supporters: on ? [...p.supporters, me.nickname] : p.supporters.filter(x => x !== me.nickname), supportCount: p.supportCount + (on ? 1 : -1) };
    }
    const list = p[kind] || [];
    const has = list.includes(me.nickname);
    if (on === has) return p;
    const next = on ? [...list, me.nickname] : list.filter(x => x !== me.nickname);
    const countKey = kind === 'metoo' ? 'metooCount' : 'helpedCount';
    return { ...p, [kind]: next, [countKey]: Math.max(0, (p[countKey] ?? list.length) + (on ? 1 : -1)) };
  });
  writeLocal(s);
}

/** "Sending strength" (kept for older code) */
export const setSupport = (me: Me, postId: string, on: boolean) => setReaction(me, postId, 'strength', on);

export async function listReplies(me: Me, postId: string): Promise<VillageReply[]> {
  if (remote(me)) {
    const { data, error } = await db().from('village_replies').select('*').eq('post_id', postId).order('created_at');
    if (error) throw error;
    return (data || []).map((r: any) => ({ id: r.id, postId: r.post_id, authorId: r.author_id, authorName: r.author_name, body: r.body, createdAt: r.created_at, mine: r.author_id === me.id }));
  }
  const s = readLocal();
  return s.replies
    .filter(r => r.postId === postId && !s.blocked.includes(r.authorName) && !s.reported.includes(r.id))
    .map(r => ({ ...r, mine: r.authorName === me.nickname }));
}

export async function addReply(me: Me, postId: string, body: string): Promise<VillageReply> {
  if (remote(me)) {
    const { data, error } = await db().from('village_replies').insert({ post_id: postId, body }).select().single();
    if (error) throw error;
    return { id: data.id, postId, authorId: data.author_id, authorName: data.author_name, body: data.body, createdAt: data.created_at, mine: true };
  }
  const s = readLocal();
  const reply = { id: newId(), postId, authorName: me.nickname, body, createdAt: new Date().toISOString() };
  s.replies.push(reply);
  s.posts = s.posts.map(p => (p.id === postId ? { ...p, replyCount: p.replyCount + 1 } : p));
  writeLocal(s);
  return { ...reply, mine: true };
}

export async function deleteReply(me: Me, reply: VillageReply) {
  if (remote(me)) {
    const { error } = await db().from('village_replies').delete().eq('id', reply.id);
    if (error) throw error;
    return;
  }
  const s = readLocal();
  s.replies = s.replies.filter(r => r.id !== reply.id);
  s.posts = s.posts.map(p => (p.id === reply.postId ? { ...p, replyCount: Math.max(0, p.replyCount - 1) } : p));
  writeLocal(s);
}

/* ------------------------------------------------------------------ */
/* Reports and blocks                                                  */
/* ------------------------------------------------------------------ */

export async function report(me: Me, targetType: 'post' | 'reply' | 'circle_message', targetId: string, reason: ReportReason, note = '') {
  if (remote(me)) {
    const { error } = await db().from('village_reports').insert({ target_type: targetType, target_id: targetId, reason, note: note.slice(0, 500) });
    if (error && !/duplicate/i.test(error.message)) throw error;
    return;
  }
  // On this device a report hides the item for you straight away
  const s = readLocal();
  if (!s.reported.includes(targetId)) s.reported.push(targetId);
  writeLocal(s);
}

export interface BlockedPerson {
  id?: string;
  name: string;
}

export async function block(me: Me, person: { id?: string; name: string }) {
  if (remote(me) && person.id) {
    const { error } = await db().from('village_blocks').insert({ blocked_id: person.id, blocked_name: person.name.slice(0, 40) });
    if (error && !/duplicate/i.test(error.message)) throw error;
    return;
  }
  const s = readLocal();
  if (!s.blocked.includes(person.name)) s.blocked.push(person.name);
  writeLocal(s);
}

export async function listBlocked(me: Me): Promise<BlockedPerson[]> {
  if (remote(me)) {
    const { data, error } = await db().from('village_blocks').select('blocked_id, blocked_name').eq('blocker_id', me.id);
    if (error) throw error;
    return (data || []).map((b: any) => ({ id: b.blocked_id, name: b.blocked_name || 'Member' }));
  }
  return readLocal().blocked.map(name => ({ name }));
}

export async function unblock(me: Me, person: BlockedPerson) {
  if (remote(me) && person.id) {
    const { error } = await db().from('village_blocks').delete().eq('blocker_id', me.id).eq('blocked_id', person.id);
    if (error) throw error;
    return;
  }
  const s = readLocal();
  s.blocked = s.blocked.filter(n => n !== person.name);
  writeLocal(s);
}

/* ------------------------------------------------------------------ */
/* Group circles                                                       */
/* ------------------------------------------------------------------ */

export const DEFAULT_CIRCLES: Circle[] = [
  { id: 'circle-sober-evenings', title: 'Sober evenings', topic: 'substance', hostName: 'Dr. Ama Konadu', hostRole: 'Clinical psychologist', description: 'For the hours after lectures or work when cravings are strongest. Share one hard moment and one win.', weekday: 3, startTime: '19:00', durationMin: 60 },
  { id: 'circle-screen-reset', title: 'Screen-time reset', topic: 'porn_social', hostName: 'Kojo A.', hostRole: 'Peer supporter, 2 years in recovery', description: 'Late-night scrolling and explicit content: practical tips and honest talk, no judgement.', weekday: 2, startTime: '21:00', durationMin: 45 },
  { id: 'circle-cool-head', title: 'Cool head', topic: 'anger', hostName: 'Efua M.', hostRole: 'Counsellor', description: 'When stress turns into anger. Learn one calming skill each week.', weekday: 4, startTime: '18:30', durationMin: 60 },
  { id: 'circle-weekend-plan', title: 'Weekend plan', topic: 'general', hostName: 'Dr. Ama Konadu', hostRole: 'Clinical psychologist', description: 'Plan a safe weekend together: risky places, people to call, and things to do instead.', weekday: 5, startTime: '17:00', durationMin: 45 },
];

export async function listCircles(me: Me): Promise<Circle[]> {
  if (!remote(me)) return DEFAULT_CIRCLES;
  const { data, error } = await db().from('village_circles').select('*').eq('active', true).order('weekday');
  if (error) throw error;
  return (data || []).map((c: any) => ({
    id: c.id,
    title: c.title,
    topic: c.topic,
    hostName: c.host_name,
    hostRole: c.host_role,
    description: c.description,
    weekday: c.weekday,
    startTime: String(c.start_time).slice(0, 5),
    durationMin: c.duration_min,
  }));
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** Ghana uses GMT all year, so circle times are UTC times. */
export function circleTiming(c: Circle, now = new Date()) {
  const [h, m] = c.startTime.split(':').map(Number);
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), h, m));
  start.setUTCDate(start.getUTCDate() + ((c.weekday - start.getUTCDay() + 7) % 7));
  // If this week's session has finished, the next one is a week later
  if (start.getTime() + c.durationMin * 60000 <= now.getTime()) start.setUTCDate(start.getUTCDate() + 7);
  // A session that started yesterday may still be running after midnight
  const prev = new Date(start.getTime() - 7 * 86400000);
  if (prev.getTime() <= now.getTime() && now.getTime() < prev.getTime() + c.durationMin * 60000) start.setTime(prev.getTime());
  const end = new Date(start.getTime() + c.durationMin * 60000);
  const live = now >= start && now < end;
  const mins = Math.round((start.getTime() - now.getTime()) / 60000);
  const time = start.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', timeZone: 'Africa/Accra' });
  // Calendar days in Ghana time (GMT), so 'today' and 'tomorrow' are right around midnight
  const dayNo = (d: Date) => Math.floor(d.getTime() / 86400000);
  const daysAway = dayNo(start) - dayNo(now);
  const endTime = end.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', timeZone: 'Africa/Accra' });
  const label = live
    ? `Live now · until ${endTime}`
    : mins >= 0 && mins < 60
      ? `Starts in ${mins} min`
      : daysAway === 0
        ? `Today at ${time}`
        : daysAway === 1
          ? `Tomorrow at ${time}`
          : `${DAY_NAMES[c.weekday]}s at ${time}`;
  return { start, end, live, label, weekly: `${DAY_NAMES[c.weekday]}s at ${time} (Ghana time)` };
}

/** A calendar file with a weekly reminder, so people can add the circle to their phone's calendar. */
export function circleCalendarUrl(c: Circle) {
  const { start, end } = circleTiming(c);
  const fmt = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//4Life//Global Village//EN',
    'BEGIN:VEVENT',
    `UID:${c.id}@4life-ai`,
    `DTSTAMP:${fmt(new Date())}`,
    `DTSTART:${fmt(start)}`,
    `DTEND:${fmt(end)}`,
    'RRULE:FREQ=WEEKLY',
    `SUMMARY:4Life circle: ${c.title}`,
    `DESCRIPTION:${c.description.replace(/[,;]/g, ' ')} Open the Global Village in 4Life to join.`,
    'BEGIN:VALARM',
    'TRIGGER:-PT15M',
    'ACTION:DISPLAY',
    `DESCRIPTION:${c.title} starts in 15 minutes`,
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
  return 'data:text/calendar;charset=utf-8,' + encodeURIComponent(ics);
}

export async function listCircleMessages(me: Me, circleId: string): Promise<CircleMessage[]> {
  if (remote(me)) {
    const { data, error } = await db().from('circle_messages').select('*').eq('circle_id', circleId).order('created_at', { ascending: false }).limit(60);
    if (error) throw error;
    return (data || [])
      .reverse()
      .map((r: any) => ({ id: r.id, circleId, authorId: r.author_id, authorName: r.author_name, body: r.body, createdAt: r.created_at, mine: r.author_id === me.id }));
  }
  const s = readLocal();
  return s.circleMessages
    .filter(m => m.circleId === circleId && !s.blocked.includes(m.authorName) && !s.reported.includes(m.id))
    .map(m => ({ ...m, mine: m.authorName === me.nickname }));
}

export async function sendCircleMessage(me: Me, circleId: string, body: string): Promise<CircleMessage> {
  if (remote(me)) {
    const { data, error } = await db().from('circle_messages').insert({ circle_id: circleId, body }).select().single();
    if (error) throw error;
    return { id: data.id, circleId, authorId: data.author_id, authorName: data.author_name, body: data.body, createdAt: data.created_at, mine: true };
  }
  const s = readLocal();
  const msg = { id: newId(), circleId, authorName: me.nickname, body, createdAt: new Date().toISOString() };
  s.circleMessages = [...s.circleMessages.filter(m => m.circleId !== circleId || Date.now() - new Date(m.createdAt).getTime() < 7 * 86400000), msg];
  writeLocal(s);
  return { ...msg, mine: true };
}

/** Live updates (Supabase only). Returns a function that stops listening. */
export function subscribeCircle(me: Me, circleId: string, onMessage: (m: CircleMessage) => void): () => void {
  if (!remote(me)) return () => {};
  const channel = db()
    .channel(`circle-${circleId}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'circle_messages', filter: `circle_id=eq.${circleId}` }, (payload: any) => {
      const r = payload.new;
      if (r.author_id === me.id) return; // already shown
      onMessage({ id: r.id, circleId, authorId: r.author_id, authorName: r.author_name, body: r.body, createdAt: r.created_at, mine: false });
    })
    .subscribe();
  return () => {
    db().removeChannel(channel);
  };
}

export function subscribePosts(me: Me, onChange: () => void): () => void {
  if (!remote(me)) return () => {};
  const channel = db()
    .channel('village-posts')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'village_posts' }, () => onChange())
    .subscribe();
  return () => {
    db().removeChannel(channel);
  };
}

/** Ask the circle's AI guide a question. The answer is shown only to you and is not saved. */
export async function askGuide(question: string, circleTitle: string, userProfile: unknown): Promise<{ reply: string; lang?: string; risk: RiskLevel }> {
  const res = await apiFetch('/api/village/guide', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question, circleTitle, userProfile }),
  });
  if (!res.ok) throw new Error(String(res.status));
  const data = await res.json();
  return { reply: data.reply, lang: data.language, risk: asRiskLevel(data.risk) };
}

/** "2 hours ago", "yesterday" … */
export function timeAgo(iso: string) {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const h = Math.round(mins / 60);
  if (h < 24) return `${h} hour${h === 1 ? '' : 's'} ago`;
  const d = Math.round(h / 24);
  if (d === 1) return 'yesterday';
  if (d < 7) return `${d} days ago`;
  return new Date(iso).toLocaleDateString([], { day: 'numeric', month: 'short' });
}

/* ------------------------------------------------------------------ */
/* "I'm going" to the next circle                                      */
/* ------------------------------------------------------------------ */

/** The date of the next (or current) session, in Ghana time */
export const sessionDate = (c: Circle) => circleTiming(c).start.toISOString().slice(0, 10);

/** How many are going to the next session, and whether I am */
export async function circleGoing(me: Me, c: Circle): Promise<{ count: number; mine: boolean }> {
  const day = sessionDate(c);
  if (remote(me)) {
    const [count, mine] = await Promise.all([
      db().rpc('circle_going_count', { cid: c.id, day }),
      db().from('circle_rsvps').select('circle_id').eq('circle_id', c.id).eq('session_on', day),
    ]);
    if (count.error) throw count.error;
    return { count: Number(count.data) || 0, mine: !!mine.data?.length };
  }
  const names = readLocal().rsvps?.[`${c.id}|${day}`] || [];
  // Sample people in this demo village, so the count isn't always empty
  const sample = 2 + (c.id.length % 5);
  return { count: sample + names.length, mine: names.includes(me.nickname) };
}

export async function setGoing(me: Me, c: Circle, on: boolean) {
  const day = sessionDate(c);
  if (remote(me)) {
    const q = on
      ? db().from('circle_rsvps').insert({ circle_id: c.id, session_on: day })
      : db().from('circle_rsvps').delete().eq('circle_id', c.id).eq('session_on', day).eq('user_id', me.id);
    const { error } = await q;
    if (error && !/duplicate/i.test(error.message)) throw error;
    return;
  }
  const s = readLocal();
  const key = `${c.id}|${day}`;
  const list = s.rsvps?.[key] || [];
  s.rsvps = { ...(s.rsvps || {}), [key]: on ? [...new Set([...list, me.nickname])] : list.filter(n => n !== me.nickname) };
  writeLocal(s);
}
