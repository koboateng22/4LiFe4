import React, { useCallback, useEffect, useRef, useState } from 'react';
import { UserProfile, ActiveTab, CounselorMatch } from '../../types';
import { Card, SectionHeader, Tabs, Button, Chip, Badge, Avatar, Modal, Field, Notice, IconButton, inputClass, textareaClass, cx } from '../ui';
import { MessageSquare, Heart, Plus, Shield, AlertTriangle, Check, Users, MoreHorizontal, Flag, Ban, Trash2, CalendarPlus, Sparkles, Phone, HeartHandshake, Leaf, ArrowLeft, Send, Hand, Sprout, Eye, Ear, BellRing, UserCheck, CalendarClock } from 'lucide-react';
import { friendlyError } from '../../lib/supabase';
import {
  TOPICS,
  REPORT_REASONS,
  topicLabel,
  timeAgo,
  checkBeforePosting,
  listPosts,
  createPost,
  deletePost,
  setReaction,
  REACTIONS,
  circleGoing,
  setGoing,
  listReplies,
  addReply,
  deleteReply,
  report,
  block,
  listBlocked,
  unblock,
  listCircles,
  circleTiming,
  circleCalendarUrl,
  listCircleMessages,
  sendCircleMessage,
  subscribeCircle,
  subscribePosts,
  askGuide,
  type Topic,
  type Reaction,
  type VillagePost,
  type VillageReply,
  type Circle,
  type CircleMessage,
  type ReportReason,
  type BlockedPerson,
  type Me,
} from '../../lib/village';
import { PageHero } from '../PageHero';
import { VillageIllustration } from '../auth/AuthIllustrations';
import { RibbonLoader } from '../RibbonMark';
import { useAction } from '../../lib/actions';
import { assessRisk } from '../../lib/safety';
import { keep, markSeen, remember, seenBefore } from '../../lib/coping';
import { AFFORDABLE_COUNSELORS } from '../../data/counselors';
import { listCounsellors } from '../../lib/db/clientApi';
import { isRemote } from '../../lib/supabase';

interface CommunityVillageTabProps {
  profile: UserProfile;
  onOpenSos: () => void;
  onNavigate?: (tab: ActiveTab) => void;
  /** Open a counsellor's profile to book (from "Talk to someone") */
  onOpenCounselor?: (c: CounselorMatch) => void;
  initialSubTab?: SubTab;
}

const REACTION_ICON: Record<Reaction, React.ComponentType<{ className?: string }>> = { strength: Heart, metoo: Hand, helped: Sprout };

/* Guided posting: gentle prompts that start a line in the message */
const POST_PROMPTS = ['What happened:', 'What helped:', 'What I need:'];

type SubTab = 'forums' | 'circles' | 'people';
type TopicFilter = 'all' | Topic;

type ReportTarget = { type: 'post' | 'reply' | 'circle_message'; id: string; authorId?: string; authorName: string };

export const CommunityVillageTab: React.FC<CommunityVillageTabProps> = ({ profile, onOpenSos, onNavigate, onOpenCounselor, initialSubTab }) => {
  const me: Me = { id: profile.id || 'guest', nickname: profile.nickname || 'Anonymous' };
  // The section and topic you used last time are remembered on this phone
  const [activeSubTab, setActiveSubTabRaw] = useState<SubTab>(() => initialSubTab || remember<SubTab>(`village_tab_${me.id}`, 'forums'));
  const setActiveSubTab = (t: SubTab) => {
    setActiveSubTabRaw(t);
    keep(`village_tab_${me.id}`, t);
  };
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState('');

  // Discussions
  const [posts, setPosts] = useState<VillagePost[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilterRaw] = useState<TopicFilter>(() => remember<TopicFilter>(`village_filter_${me.id}`, 'all'));
  const setFilter = (f: TopicFilter) => {
    setFilterRaw(f);
    keep(`village_filter_${me.id}`, f);
  };
  // The big welcome banner on the first visit only; after that, the posts come first
  const [firstVisit] = useState(() => !seenBefore(`village_${me.id}`));
  useEffect(() => markSeen(`village_${me.id}`), [me.id]);
  // "New since your last visit"
  const [lastVisit] = useState<string | null>(() => remember<string | null>(`village_seen_${me.id}`, null));
  useEffect(() => keep(`village_seen_${me.id}`, new Date().toISOString()), [me.id]);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const [showSensitive, setShowSensitiveRaw] = useState<boolean>(() => remember(`village_sensitive_${me.id}`, false));
  const setShowSensitive = (v: boolean) => {
    setShowSensitiveRaw(v);
    keep(`village_sensitive_${me.id}`, v);
  };
  const [openReplies, setOpenReplies] = useState<Record<string, VillageReply[] | 'loading'>>({});
  const [replyText, setReplyText] = useState<Record<string, string>>({});
  const [replyNotice, setReplyNotice] = useState<{ postId: string; text: string } | null>(null);
  const [menuFor, setMenuFor] = useState<string | null>(null);

  // New post
  const [composeOpen, setComposeOpen] = useState(false);
  const [draftTopic, setDraftTopic] = useState<Topic>((['substance', 'porn_social', 'anger', 'overeating'].includes(profile.currentTriage) ? profile.currentTriage : 'general') as Topic);
  // Drafts are kept on this phone until posted
  const [savedDraft] = useState(() => remember<{ title: string; body: string } | null>(`village_draft_${me.id}`, null));
  const [draftTitle, setDraftTitle] = useState(savedDraft?.title || '');
  const [draftBody, setDraftBody] = useState(savedDraft?.body || '');
  useEffect(() => {
    keep(`village_draft_${me.id}`, draftTitle || draftBody ? { title: draftTitle, body: draftBody } : null);
  }, [draftTitle, draftBody, me.id]);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const addPrompt = (p: string) => {
    setDraftBody(b => (b.trim() ? `${b.replace(/\s+$/, '')}\n\n${p} ` : `${p} `));
    requestAnimationFrame(() => {
      const el = bodyRef.current;
      if (el) {
        el.focus();
        el.setSelectionRange(el.value.length, el.value.length);
      }
    });
  };
  const [composeNotice, setComposeNotice] = useState('');
  const [posting, setPosting] = useState(false);
  const [afterPostSupport, setAfterPostSupport] = useState(false);

  // Safety and moderation
  const [crisisOpen, setCrisisOpen] = useState(false);
  const [reportTarget, setReportTarget] = useState<ReportTarget | null>(null);
  const [reportReason, setReportReason] = useState<ReportReason>('unkind');
  const [reportNote, setReportNote] = useState('');
  const [blockedOpen, setBlockedOpen] = useState(false);
  const [blocked, setBlocked] = useState<BlockedPerson[]>([]);

  // Circles
  const [circles, setCircles] = useState<Circle[]>([]);
  const [room, setRoom] = useState<Circle | null>(null);
  const [going, setGoingState] = useState<Record<string, { count: number; mine: boolean }>>({});
  const [listenOnly, setListenOnlyRaw] = useState<boolean>(() => remember(`village_listen_${me.id}`, false));
  const setListenOnly = (v: boolean) => {
    setListenOnlyRaw(v);
    keep(`village_listen_${me.id}`, v);
  };

  // Talk to someone: counsellors, available ones first
  const [counsellors, setCounsellors] = useState<CounselorMatch[]>(isRemote ? [] : AFFORDABLE_COUNSELORS);
  useEffect(() => {
    if (activeSubTab !== 'people' || !isRemote) return;
    listCounsellors().then(setCounsellors).catch(() => setCounsellors([]));
  }, [activeSubTab]);

  useEffect(() => {
    if (activeSubTab !== 'circles' || !circles.length) return;
    let alive = true;
    Promise.all(circles.map(c => circleGoing(me, c).then(g => [c.id, g] as const).catch(() => [c.id, { count: 0, mine: false }] as const))).then(list => {
      if (alive) setGoingState(Object.fromEntries(list));
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSubTab, circles]);

  const toggleGoing = async (c: Circle) => {
    const cur = going[c.id] || { count: 0, mine: false };
    const on = !cur.mine;
    setGoingState(g => ({ ...g, [c.id]: { count: Math.max(0, cur.count + (on ? 1 : -1)), mine: on } }));
    try {
      await setGoing(me, c, on);
      if (on) showToast(`You're going to ${c.title}. Tap "Remind me" so your phone reminds you.`);
    } catch (e) {
      setGoingState(g => ({ ...g, [c.id]: cur }));
      setError(friendlyError(e));
    }
  };

  // Requests from quick search (Ctrl/⌘ K)
  useAction('new-post', () => {
    setActiveSubTab('forums');
    setRoom(null);
    setComposeOpen(true);
  });
  useAction('circles', () => {
    setActiveSubTab('circles');
    setRoom(null);
  });

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 4000);
  };

  const refresh = useCallback(async () => {
    try {
      setPosts(await listPosts(me));
      setError('');
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me.id]);

  useEffect(() => {
    refresh();
    listCircles(me).then(setCircles).catch(() => setCircles([]));
    return subscribePosts(me, refresh);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refresh]);

  /* ---------- Posts ---------- */

  const submitPost = async () => {
    if (!draftTitle.trim() || !draftBody.trim() || posting) return;
    setPosting(true);
    setComposeNotice('');
    const check = await checkBeforePosting(`${draftTitle}\n${draftBody}`);
    if (check.status === 'crisis') {
      setPosting(false);
      setComposeOpen(false);
      setCrisisOpen(true);
      return;
    }
    if (check.status === 'blocked') {
      setPosting(false);
      setComposeNotice(check.reason);
      return;
    }
    try {
      const post = await createPost(me, { topic: draftTopic, title: draftTitle.trim(), body: draftBody.trim() });
      setPosts(prev => [post, ...prev.filter(p => p.id !== post.id)]);
      setDraftTitle('');
      setDraftBody('');
      keep(`village_draft_${me.id}`, null);
      setComposeOpen(false);
      setFilter('all');
      setAfterPostSupport(check.risk === 'concern');
      showToast('Your post is live in the Village.');
    } catch (e) {
      setComposeNotice(friendlyError(e));
    } finally {
      setPosting(false);
    }
  };

  const COUNT_KEY: Record<Reaction, 'supportCount' | 'metooCount' | 'helpedCount'> = { strength: 'supportCount', metoo: 'metooCount', helped: 'helpedCount' };
  const toggleReaction = async (p: VillagePost, kind: Reaction) => {
    const on = !p.myReactions[kind];
    const key = COUNT_KEY[kind];
    setPosts(prev =>
      prev.map(x =>
        x.id === p.id
          ? { ...x, [key]: Math.max(0, x[key] + (on ? 1 : -1)), myReactions: { ...x.myReactions, [kind]: on }, supportedByMe: kind === 'strength' ? on : x.supportedByMe }
          : x
      )
    );
    try {
      await setReaction(me, p.id, kind, on);
    } catch (e) {
      setPosts(prev => prev.map(x => (x.id === p.id ? p : x)));
      setError(friendlyError(e));
    }
  };

  const toggleReplies = async (p: VillagePost) => {
    if (openReplies[p.id]) {
      setOpenReplies(prev => {
        const { [p.id]: _, ...rest } = prev;
        return rest;
      });
      return;
    }
    setOpenReplies(prev => ({ ...prev, [p.id]: 'loading' }));
    try {
      const list = await listReplies(me, p.id);
      setOpenReplies(prev => ({ ...prev, [p.id]: list }));
    } catch (e) {
      setOpenReplies(prev => ({ ...prev, [p.id]: [] }));
      setError(friendlyError(e));
    }
  };

  const submitReply = async (p: VillagePost) => {
    const text = (replyText[p.id] || '').trim();
    if (!text) return;
    setReplyNotice(null);
    const check = await checkBeforePosting(text);
    if (check.status === 'crisis') return setCrisisOpen(true);
    if (check.status === 'blocked') return setReplyNotice({ postId: p.id, text: check.reason });
    try {
      const r = await addReply(me, p.id, text);
      setOpenReplies(prev => ({ ...prev, [p.id]: [...(Array.isArray(prev[p.id]) ? (prev[p.id] as VillageReply[]) : []), r] }));
      setPosts(prev => prev.map(x => (x.id === p.id ? { ...x, replyCount: x.replyCount + 1 } : x)));
      setReplyText(prev => ({ ...prev, [p.id]: '' }));
    } catch (e) {
      setReplyNotice({ postId: p.id, text: friendlyError(e) });
    }
  };

  const removePost = async (p: VillagePost) => {
    setMenuFor(null);
    try {
      await deletePost(me, p.id);
      setPosts(prev => prev.filter(x => x.id !== p.id));
      showToast('Your post was deleted.');
    } catch (e) {
      setError(friendlyError(e));
    }
  };

  const removeReply = async (r: VillageReply) => {
    try {
      await deleteReply(me, r);
      setOpenReplies(prev => ({ ...prev, [r.postId]: (prev[r.postId] as VillageReply[]).filter(x => x.id !== r.id) }));
      setPosts(prev => prev.map(x => (x.id === r.postId ? { ...x, replyCount: Math.max(0, x.replyCount - 1) } : x)));
    } catch (e) {
      setError(friendlyError(e));
    }
  };

  /* ---------- Reports and blocks ---------- */

  const openReport = (t: ReportTarget) => {
    setMenuFor(null);
    setReportReason('unkind');
    setReportNote('');
    setReportTarget(t);
  };

  const submitReport = async () => {
    if (!reportTarget) return;
    try {
      await report(me, reportTarget.type, reportTarget.id, reportReason, reportNote);
      if (reportTarget.type === 'post') setPosts(prev => prev.filter(p => p.id !== reportTarget.id));
      setReportTarget(null);
      showToast(reportReason === 'unsafe' ? 'Thank you. If someone is in danger right now, call 112.' : 'Thank you. The Village team will review it. It’s hidden for you now.');
    } catch (e) {
      setError(friendlyError(e));
    }
  };

  const blockPerson = async (person: { id?: string; name: string }) => {
    setMenuFor(null);
    try {
      await block(me, person);
      setPosts(prev => prev.filter(p => p.authorName !== person.name));
      showToast(`You won’t see posts or messages from ${person.name}.`);
    } catch (e) {
      setError(friendlyError(e));
    }
  };

  const openBlocked = async () => {
    setBlockedOpen(true);
    try {
      setBlocked(await listBlocked(me));
    } catch (e) {
      setError(friendlyError(e));
    }
  };

  const filteredPosts = posts.filter(p => filter === 'all' || p.topic === filter);
  const isNew = (p: VillagePost) => !!lastVisit && !p.mine && p.createdAt > lastVisit;
  const newCount = filteredPosts.filter(isNew).length;
  const firstOldIndex = filteredPosts.findIndex(p => !isNew(p));

  return (
    <div className="flex flex-col gap-6 animate-fadeIn">
      {!room && !firstVisit && (
        <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
          <h1 id="village-h" className="m-0 text-xl font-extrabold text-ink sm:text-2xl">
            You are not alone
          </h1>
          <p className="m-0 text-sm text-ink-3">Anonymous: only your community name is shown</p>
        </div>
      )}
      {!room && firstVisit && (
        <PageHero
          id="village-h"
          className="py-5 sm:py-6"
          eyebrow="Global Village"
          title="You are not alone"
          text="Share and read stories anonymously, send support, and join a weekly group circle with people who get it."
          art={<VillageIllustration />}
        />
      )}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <Tabs<SubTab>
          label="Village sections"
          value={activeSubTab}
          onChange={v => {
            setActiveSubTab(v);
            setRoom(null);
          }}
          className="w-full min-w-0 sm:w-auto sm:flex-1"
          tabs={[
            { value: 'forums', label: 'Discussions', icon: <MessageSquare className="h-5 w-5" /> },
            { value: 'circles', label: 'Group circles', icon: <Users className="h-5 w-5" /> },
            { value: 'people', label: 'Talk to someone', icon: <HeartHandshake className="h-5 w-5" /> },
          ]}
        />
        {activeSubTab === 'forums' && (
          <Button onClick={() => setComposeOpen(true)} icon={<Plus className="h-5 w-5" />} className="mb-1">
            New post
          </Button>
        )}
      </div>

      {toast && (
        <Notice icon={<Check className="h-5 w-5" />} className="font-bold">
          {toast}
        </Notice>
      )}
      {error && (
        <Notice tone="warn" icon={<AlertTriangle className="h-5 w-5" />}>
          <span>{error}</span>{' '}
          <button type="button" className="font-bold underline cursor-pointer" onClick={() => setError('')}>
            Dismiss
          </button>
        </Notice>
      )}

      {/* ---------- DISCUSSIONS ---------- */}
      {activeSubTab === 'forums' && (
        <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
          <div className="flex min-w-0 flex-col gap-5">
            {afterPostSupport && (
              <Notice tone="warn" icon={<Leaf className="h-5 w-5" />}>
                <p className="m-0 font-bold">Thank you for sharing that. You don’t have to wait for replies.</p>
                <p className="m-0 mt-0.5">If the urge is strong right now, ride it out step by step with AI therapy.</p>
                <div className="mt-2.5 flex flex-wrap gap-2">
                  {onNavigate && (
                    <Button size="sm" onClick={() => onNavigate('chat')}>
                      Ride out the craving
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => setAfterPostSupport(false)}>
                    I’m okay
                  </Button>
                </div>
              </Notice>
            )}

            <div role="group" aria-label="Filter by topic" className="no-scrollbar fade-x -mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 [&>button]:shrink-0">
              <Chip tone="ink" selected={filter === 'all'} onClick={() => setFilter('all')}>
                All topics
              </Chip>
              {TOPICS.map(t => (
                <Chip key={t.id} tone="ink" selected={filter === t.id} onClick={() => setFilter(t.id)}>
                  {t.label}
                </Chip>
              ))}
            </div>

            {loading && <RibbonLoader text="Loading the Village…" />}
            {!loading && filteredPosts.length === 0 && (
              <Card tone="plain" className="text-base text-ink-2">
                No posts in this topic yet. Be the first to share.
              </Card>
            )}

            {!loading && newCount > 0 && (
              <p className="m-0 inline-flex items-center gap-2 self-start rounded-full bg-pri-soft px-3.5 py-1.5 text-sm font-bold text-pri-ink" role="status">
                <span className="h-2 w-2 rounded-full bg-pri" aria-hidden="true" />
                {newCount} new since your last visit
              </p>
            )}

            {filteredPosts.map((post, idx) => {
              const replies = openReplies[post.id];
              const long = post.body.length > 260;
              const open = !!expanded[post.id];
              // Posts about a relapse or a strong craving are covered until you choose to read them
              const sensitive = !post.mine && assessRisk(`${post.title} ${post.body}`).level !== 'none';
              const covered = sensitive && !showSensitive && !revealed[post.id];
              return (
                <React.Fragment key={post.id}>
                {newCount > 0 && idx === firstOldIndex && idx > 0 && (
                  <div className="flex items-center gap-3 text-sm font-bold text-ink-3" role="separator">
                    <span className="h-px flex-1 bg-line" /> Earlier <span className="h-px flex-1 bg-line" />
                  </div>
                )}
                <Card as="article" className={cx('lift flex flex-col gap-3.5', isNew(post) && 'ring-2 ring-pri/30')}>
                  <div className="flex items-center gap-3">
                    <Avatar name={post.authorName} size={44} />
                    <div className="min-w-0 flex-1">
                      <p className="m-0 truncate text-base font-bold text-ink">
                        {post.authorName} {post.mine && <span className="font-semibold text-ink-3">(you)</span>}
                      </p>
                      <p className="m-0 text-sm text-ink-3">
                        {topicLabel(post.topic)} · {timeAgo(post.createdAt)}
                      </p>
                    </div>
                    {post.hidden && <Badge tone="warn">Hidden after reports</Badge>}
                    <div className="relative">
                      <IconButton label="More options" variant="ghost" aria-expanded={menuFor === post.id} onClick={() => setMenuFor(m => (m === post.id ? null : post.id))}>
                        <MoreHorizontal className="h-5 w-5" />
                      </IconButton>
                      {menuFor === post.id && (
                        <div role="menu" className="absolute right-0 top-12 z-20 flex w-56 flex-col rounded-xl border border-line bg-surface p-1.5 shadow-xl">
                          {post.mine ? (
                            <button type="button" role="menuitem" onClick={() => removePost(post)} className="flex min-h-11 items-center gap-2.5 rounded-lg px-3 text-left text-[0.9375rem] font-semibold text-danger-text hover:bg-danger-soft cursor-pointer">
                              <Trash2 className="h-4 w-4" /> Delete my post
                            </button>
                          ) : (
                            <>
                              <button type="button" role="menuitem" onClick={() => openReport({ type: 'post', id: post.id, authorId: post.authorId, authorName: post.authorName })} className="flex min-h-11 items-center gap-2.5 rounded-lg px-3 text-left text-[0.9375rem] font-semibold text-ink hover:bg-muted cursor-pointer">
                                <Flag className="h-4 w-4" /> Report
                              </button>
                              <button type="button" role="menuitem" onClick={() => blockPerson({ id: post.authorId, name: post.authorName })} className="flex min-h-11 items-center gap-2.5 rounded-lg px-3 text-left text-[0.9375rem] font-semibold text-ink hover:bg-muted cursor-pointer">
                                <Ban className="h-4 w-4" /> Block {post.authorName}
                              </button>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                  {covered ? (
                    <div className="flex flex-col items-start gap-2.5 rounded-xl bg-muted px-4 py-3.5">
                      <p className="m-0 text-[0.9375rem] font-semibold text-ink">
                        This post talks about a relapse or a strong craving.
                      </p>
                      <p className="m-0 text-sm text-ink-2">Read it when you feel ready. Stories like this are often hopeful.</p>
                      <Button size="sm" variant="secondary" icon={<Eye className="h-4 w-4" />} onClick={() => setRevealed(r => ({ ...r, [post.id]: true }))}>
                        Show the post
                      </Button>
                    </div>
                  ) : (
                    <>
                      <h2 className="m-0 text-[1.1875rem] font-bold leading-snug text-ink">{post.title}</h2>
                      <p className={cx('m-0 whitespace-pre-wrap text-base leading-[1.7] text-ink-2', long && !open && 'line-clamp-4')}>{post.body}</p>
                      {long && (
                        <button
                          type="button"
                          aria-expanded={open}
                          onClick={() => setExpanded(x => ({ ...x, [post.id]: !open }))}
                          className="-mt-1.5 min-h-10 self-start text-[0.9375rem] font-bold text-pri-text hover:underline cursor-pointer"
                        >
                          {open ? 'Show less' : 'Read more'}
                        </button>
                      )}
                    </>
                  )}
                  {/* One-tap support: no need to write anything */}
                  <div className="grid grid-cols-4 gap-2 border-t border-line pt-3.5 sm:flex sm:flex-wrap" role="group" aria-label="Respond">
                    {REACTIONS.map(r => {
                      const Icon = REACTION_ICON[r.id];
                      const on = post.myReactions[r.id];
                      const count = r.id === 'strength' ? post.supportCount : r.id === 'metoo' ? post.metooCount : post.helpedCount;
                      return (
                        <button
                          key={r.id}
                          type="button"
                          aria-pressed={on}
                          onClick={() => toggleReaction(post, r.id)}
                          title={on ? r.done : r.label}
                          className={cx(
                            'inline-flex min-h-11 items-center justify-center gap-2 rounded-full border px-2 text-sm font-bold transition-colors cursor-pointer sm:px-3.5',
                            on ? 'border-pri bg-pri-soft text-pri-ink' : 'border-line bg-surface text-ink hover:border-pri-text'
                          )}
                        >
                          <Icon className={cx('h-4 w-4', r.id === 'strength' ? 'text-danger-text' : 'text-pri-text', on && r.id === 'strength' && 'fill-current')} aria-hidden="true" />
                          {/* phones show the icon and count; the name is still read out */}
                          <span className="sr-only sm:not-sr-only">{on ? r.done : r.label}</span>
                          <span className="tabular-nums font-semibold text-ink-3">{count}</span>
                        </button>
                      );
                    })}
                    <button
                      type="button"
                      aria-expanded={!!replies}
                      onClick={() => toggleReplies(post)}
                      className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-line bg-surface px-2 text-sm font-bold text-ink hover:border-pri-text cursor-pointer sm:px-3.5"
                    >
                      <MessageSquare className="h-4 w-4 text-ink-2" aria-hidden="true" />
                      <span className="tabular-nums">{post.replyCount}</span>
                      <span className="sr-only sm:not-sr-only">{post.replyCount === 1 ? 'reply' : 'replies'}</span>
                    </button>
                  </div>

                  {replies && (
                    <div className="flex flex-col gap-3 rounded-xl bg-bg p-4 animate-fadeIn">
                      {replies === 'loading' ? (
                        <p className="m-0 text-[0.9375rem] text-ink-3">Loading replies…</p>
                      ) : replies.length > 0 ? (
                        <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
                          {replies.map(rep => (
                            <li key={rep.id} className="flex gap-3 rounded-xl bg-surface p-3.5">
                              <Avatar name={rep.authorName} size={36} />
                              <div className="min-w-0 flex-1">
                                <p className="m-0 text-[0.9375rem] font-bold text-ink">
                                  {rep.authorName} <span className="font-normal text-ink-3">· {timeAgo(rep.createdAt)}</span>
                                </p>
                                <p className="m-0 mt-0.5 whitespace-pre-wrap text-base leading-relaxed text-ink-2">{rep.body}</p>
                                <div className="mt-1 flex gap-3 text-sm">
                                  {rep.mine ? (
                                    <button type="button" onClick={() => removeReply(rep)} className="min-h-9 font-semibold text-ink-3 hover:text-danger-text cursor-pointer">
                                      Delete
                                    </button>
                                  ) : (
                                    <>
                                      <button type="button" onClick={() => openReport({ type: 'reply', id: rep.id, authorId: rep.authorId, authorName: rep.authorName })} className="min-h-9 font-semibold text-ink-3 hover:text-ink cursor-pointer">
                                        Report
                                      </button>
                                      <button type="button" onClick={() => blockPerson({ id: rep.authorId, name: rep.authorName })} className="min-h-9 font-semibold text-ink-3 hover:text-ink cursor-pointer">
                                        Block
                                      </button>
                                    </>
                                  )}
                                </div>
                              </div>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="m-0 text-[0.9375rem] text-ink-3">No replies yet. Be the first to leave an encouraging word.</p>
                      )}
                      {replyNotice?.postId === post.id && (
                        <Notice tone="warn" icon={<AlertTriangle className="h-5 w-5" />}>
                          {replyNotice.text}
                        </Notice>
                      )}
                      <form
                        className="flex flex-col gap-2.5 sm:flex-row"
                        onSubmit={e => {
                          e.preventDefault();
                          submitReply(post);
                        }}
                      >
                        <label htmlFor={`reply-${post.id}`} className="sr-only">
                          Write a reply
                        </label>
                        <input
                          id={`reply-${post.id}`}
                          type="text"
                          maxLength={2000}
                          value={replyText[post.id] || ''}
                          onChange={e => {
                            setReplyText(prev => ({ ...prev, [post.id]: e.target.value }));
                            if (replyNotice?.postId === post.id) setReplyNotice(null);
                          }}
                          placeholder="Write a kind, supportive reply…"
                          className={cx(inputClass, 'bg-surface')}
                        />
                        <Button type="submit" size="lg" disabled={!(replyText[post.id] || '').trim()} className="shrink-0">
                          Reply
                        </Button>
                      </form>
                    </div>
                  )}
                </Card>
                </React.Fragment>
              );
            })}
          </div>

          <aside className="flex min-w-0 flex-col gap-5">
            <Card tone="soft" className="flex flex-col gap-3">
              <h2 className="m-0 flex items-center gap-2 text-lg font-bold text-ink">
                <Shield className="h-5 w-5 text-pri-text" aria-hidden="true" /> Village rules
              </h2>
              <ul className="m-0 flex list-disc flex-col gap-1.5 pl-5 text-[0.9375rem] leading-relaxed text-ink-2">
                <li>Stay anonymous: no phone numbers, emails or real names</li>
                <li>Be kind. Talk about the situation, never attack the person</li>
                <li>No buying, selling or finding drugs</li>
                <li>Honest talk about cravings and slips is welcome</li>
              </ul>
              <p className="m-0 text-sm text-ink-3">Posts are checked before they appear. Three reports hide a post until the team reviews it.</p>
              <label className="flex min-h-11 cursor-pointer items-center gap-3 text-[0.9375rem] font-semibold text-ink">
                <input type="checkbox" checked={showSensitive} onChange={e => setShowSensitive(e.target.checked)} className="h-5 w-5" />
                Always show posts about relapses and cravings
              </label>
              <Button variant="link" className="self-start" onClick={openBlocked}>
                People you’ve blocked
              </Button>
            </Card>
            <Card tone="danger" className="flex flex-col gap-3">
              <h2 className="m-0 text-lg font-bold text-ink">In danger right now?</h2>
              <p className="m-0 text-[0.9375rem] leading-relaxed text-ink-2">The Village can’t respond fast enough in an emergency. A person can.</p>
              <div className="flex flex-wrap gap-2">
                <a href="tel:112" className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-danger px-4 font-bold text-[#fff] no-underline hover:bg-danger-hover">
                  <Phone className="h-4 w-4" aria-hidden="true" /> Call 112
                </a>
                <Button variant="secondary" onClick={onOpenSos}>
                  SOS
                </Button>
              </div>
            </Card>
          </aside>
        </div>
      )}

      {/* ---------- GROUP CIRCLES ---------- */}
      {activeSubTab === 'circles' &&
        (room ? (
          <CircleRoom circle={room} me={me} profile={profile} onLeave={() => setRoom(null)} onReport={openReport} onCrisis={() => setCrisisOpen(true)} listenOnly={listenOnly} setListenOnly={setListenOnly} />
        ) : (
          <CirclesList
            circles={circles}
            going={going}
            onOpen={setRoom}
            onToggleGoing={toggleGoing}
          />
        ))}

      {/* ---------- TALK TO SOMEONE ---------- */}
      {activeSubTab === 'people' && (
        <div className="flex flex-col gap-5">
          <SectionHeader title="Talk to someone" subtitle="When writing isn’t enough, these are real people you can reach." />
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Card className="flex flex-col gap-3 md:col-span-2">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="m-0 text-lg font-bold text-ink">A counsellor</h3>
                <p className="m-0 text-sm text-ink-3">Trained counsellors in Ghana · video, voice or in person · subsidised sessions</p>
              </div>
              {counsellors.length === 0 ? (
                <p className="m-0 text-[0.9375rem] text-ink-2">No counsellors are taking new clients right now. The helpline below can help today.</p>
              ) : (
                <ul className="m-0 grid list-none grid-cols-1 gap-2.5 p-0 sm:grid-cols-2">
                  {[...counsellors]
                    .sort((a, b) => Number(b.availableNow) - Number(a.availableNow))
                    .slice(0, 4)
                    .map(c => (
                      <li key={c.id}>
                        <button
                          type="button"
                          onClick={() => (onOpenCounselor ? onOpenCounselor(c) : onNavigate?.('dashboard'))}
                          className="flex w-full items-center gap-3 rounded-xl border border-line bg-surface p-3 text-left hover:border-pri-text cursor-pointer"
                        >
                          <Avatar name={c.name} size={44} />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[0.9375rem] font-bold text-ink">{c.name}</span>
                            <span className="block truncate text-sm text-ink-3">{c.title}</span>
                          </span>
                          <Badge tone={c.availableNow ? 'pri' : 'muted'} dot={c.availableNow}>
                            {c.availableNow ? 'Available now' : 'Later'}
                          </Badge>
                        </button>
                      </li>
                    ))}
                </ul>
              )}
            </Card>
            <Card className="flex flex-col gap-3">
              <h3 className="m-0 text-lg font-bold text-ink">Yonkodo Foundation helpline</h3>
              <p className="m-0 text-[0.9375rem] leading-relaxed text-ink-2">Emotional support and suicide prevention, answered by trained volunteers. Call or message on WhatsApp.</p>
              <div className="flex flex-wrap gap-2">
                <a href="tel:0558288288" className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-pri px-4 font-bold text-[#fff] no-underline hover:bg-pri-hover">
                  <Phone className="h-4 w-4" aria-hidden="true" /> 0558 288 288
                </a>
                <a href="https://wa.me/233558288288" target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center rounded-xl border border-line bg-surface px-4 font-bold text-ink no-underline hover:bg-muted">
                  WhatsApp
                </a>
              </div>
              <p className="m-0 text-sm text-ink-3">Number checked August 2026.</p>
            </Card>
            <Card className="flex flex-col gap-3">
              <h3 className="m-0 text-lg font-bold text-ink">A group circle</h3>
              <p className="m-0 text-[0.9375rem] leading-relaxed text-ink-2">Others who know what it’s like, with a host, every week.</p>
              <Button variant="secondary" className="self-start" onClick={() => setActiveSubTab('circles')}>
                See circles
              </Button>
            </Card>
            <Card tone="plain" className="flex flex-col gap-3">
              <h3 className="m-0 text-lg font-bold text-ink">One-to-one peer calls</h3>
              <p className="m-0 text-[0.9375rem] leading-relaxed text-ink-2">
                Calls with trained peer supporters are coming. We’re training volunteers first, so every call is safe. Until then, the options above are available today.
              </p>
            </Card>
          </div>
        </div>
      )}

      {/* New post */}
      <Modal
        isOpen={composeOpen}
        onClose={() => setComposeOpen(false)}
        title="Share with the Village"
        subtitle={`Posting anonymously as ${me.nickname}`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setComposeOpen(false)}>
              Cancel
            </Button>
            <Button onClick={submitPost} disabled={!draftTitle.trim() || !draftBody.trim() || posting}>
              {posting ? 'Checking…' : 'Post to the Village'}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-5">
          {composeNotice && (
            <Notice tone="warn" icon={<AlertTriangle className="h-5 w-5" />}>
              {composeNotice}
            </Notice>
          )}
          <Field label="Topic" htmlFor="np-topic">
            <select id="np-topic" value={draftTopic} onChange={e => setDraftTopic(e.target.value as Topic)} className={inputClass}>
              {TOPICS.map(t => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Title" htmlFor="np-title">
            <input
              id="np-title"
              type="text"
              maxLength={120}
              value={draftTitle}
              onChange={e => {
                setDraftTitle(e.target.value);
                setComposeNotice('');
              }}
              placeholder="For example: Day 10 — how do you handle weekend pressure?"
              className={inputClass}
            />
          </Field>
          <div className="flex flex-col gap-2">
            <p className="m-0 text-sm font-bold text-ink-3" id="np-prompts">Need a start? Tap one:</p>
            <div className="flex flex-wrap gap-2" role="group" aria-labelledby="np-prompts">
              {POST_PROMPTS.map(pr => (
                <button
                  key={pr}
                  type="button"
                  onClick={() => addPrompt(pr)}
                  className="inline-flex min-h-11 items-center rounded-full border border-dashed border-pri-text/60 bg-pri-soft/50 px-3.5 text-sm font-bold text-pri-ink hover:bg-pri-soft cursor-pointer"
                >
                  + {pr.replace(':', '')}
                </button>
              ))}
            </div>
          </div>
          <Field label="Your message" htmlFor="np-body" hint="Don’t include names, phone numbers or places that could identify you or others. Your draft is kept on this phone until you post.">
            <textarea
              ref={bodyRef}
              id="np-body"
              rows={5}
              maxLength={4000}
              value={draftBody}
              onChange={e => {
                setDraftBody(e.target.value);
                setComposeNotice('');
              }}
              placeholder="Share what you’re feeling, ask for advice, or celebrate a win…"
              className={textareaClass}
            />
          </Field>
        </div>
      </Modal>

      {/* Crisis words: not posted, help offered instead */}
      <Modal isOpen={crisisOpen} onClose={() => setCrisisOpen(false)} title="We’re worried about you" subtitle="Your words are saved here, not posted." size="sm">
        <div className="flex flex-col gap-3">
          <p className="m-0 text-base leading-relaxed text-ink-2">
            It sounds like you might be in danger right now. The Village can’t always reply quickly, so please reach someone who can help straight away.
          </p>
          <a href="tel:112" className="flex min-h-14 items-center gap-3 rounded-2xl bg-danger px-5 text-lg font-bold text-[#fff] no-underline hover:bg-danger-hover">
            <Phone className="h-6 w-6" aria-hidden="true" /> Call 112
          </a>
          <button
            type="button"
            onClick={() => {
              setCrisisOpen(false);
              onOpenSos();
            }}
            className="flex min-h-14 items-center gap-3 rounded-2xl border border-line bg-surface px-5 text-left text-base font-bold text-ink hover:bg-muted cursor-pointer"
          >
            <AlertTriangle className="h-6 w-6 text-danger-text" aria-hidden="true" /> Alert my support person (SOS)
          </button>
          <a href="tel:0558288288" className="flex min-h-14 items-center gap-3 rounded-2xl border border-line bg-surface px-5 text-base font-bold text-ink no-underline hover:bg-muted">
            <Phone className="h-6 w-6 text-pri-text" aria-hidden="true" /> Yonkodo helpline · 0558 288 288
          </a>
          {onNavigate && (
            <button
              type="button"
              onClick={() => {
                setCrisisOpen(false);
                onNavigate('chat');
              }}
              className="flex min-h-14 items-center gap-3 rounded-2xl border border-line bg-surface px-5 text-left text-base font-bold text-ink hover:bg-muted cursor-pointer"
            >
              <Leaf className="h-6 w-6 text-pri-text" aria-hidden="true" /> Talk it through with AI therapy
            </button>
          )}
        </div>
      </Modal>

      {/* Report */}
      <Modal
        isOpen={!!reportTarget}
        onClose={() => setReportTarget(null)}
        title="Report"
        subtitle={reportTarget ? `Something from ${reportTarget.authorName}` : undefined}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setReportTarget(null)}>
              Cancel
            </Button>
            <Button onClick={submitReport} icon={<Flag className="h-5 w-5" />}>
              Send report
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2" role="radiogroup" aria-label="Reason">
            {REPORT_REASONS.map(r => (
              <label key={r.id} className={cx('flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border px-4', reportReason === r.id ? 'border-pri-text bg-pri-soft' : 'border-line')}>
                <input type="radio" name="report-reason" value={r.id} checked={reportReason === r.id} onChange={() => setReportReason(r.id)} className="h-5 w-5 accent-[var(--pri)]" />
                <span className="text-[0.9375rem] font-semibold text-ink">{r.label}</span>
              </label>
            ))}
          </div>
          {reportReason === 'unsafe' && (
            <Notice tone="danger" icon={<Phone className="h-5 w-5" />}>
              If you think someone is in danger right now, call 112. Reports are reviewed, but not instantly.
            </Notice>
          )}
          <Field label="Anything else? (optional)" htmlFor="rep-note">
            <textarea id="rep-note" rows={2} maxLength={500} value={reportNote} onChange={e => setReportNote(e.target.value)} className={textareaClass} />
          </Field>
        </div>
      </Modal>

      {/* Blocked people */}
      <Modal isOpen={blockedOpen} onClose={() => setBlockedOpen(false)} title="People you’ve blocked" subtitle="You don’t see their posts, replies or circle messages." size="sm">
        {blocked.length === 0 ? (
          <p className="m-0 text-base text-ink-2">You haven’t blocked anyone.</p>
        ) : (
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {blocked.map(b => (
              <li key={b.id || b.name} className="flex items-center justify-between gap-3 rounded-xl border border-line px-4 py-2.5">
                <span className="font-semibold text-ink">{b.name}</span>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={async () => {
                    await unblock(me, b).catch(e => setError(friendlyError(e)));
                    setBlocked(prev => prev.filter(x => x !== b));
                    refresh();
                  }}
                >
                  Unblock
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Modal>
    </div>
  );
};

/* ---------- Group circles: the next one first, then the rest ---------- */

const CirclesList: React.FC<{
  circles: Circle[];
  going: Record<string, { count: number; mine: boolean }>;
  onOpen: (c: Circle) => void;
  onToggleGoing: (c: Circle) => void;
}> = ({ circles, going, onOpen, onToggleGoing }) => {
  const timed = circles.map(c => ({ c, t: circleTiming(c) })).sort((a, b) => Number(b.t.live) - Number(a.t.live) || a.t.start.getTime() - b.t.start.getTime());
  const next = timed[0];
  const rest = timed.slice(1);

  const goingText = (id: string) => {
    const g = going[id];
    if (!g) return null;
    if (g.mine) return g.count > 1 ? `You and ${g.count - 1} ${g.count - 1 === 1 ? 'other' : 'others'} are going` : 'You are going';
    return g.count ? `${g.count} going` : 'Be the first to say you’re going';
  };

  const actions = (c: Circle, live: boolean, big = false) => (
    <div className="flex flex-wrap gap-2">
      <Button onClick={() => onOpen(c)} icon={<Users className="h-5 w-5" />} size={big ? 'lg' : 'md'}>
        {live ? 'Join now' : 'Open the circle'}
      </Button>
      {!live && (
        <Button
          variant={going[c.id]?.mine ? 'soft' : 'secondary'}
          aria-pressed={!!going[c.id]?.mine}
          onClick={() => onToggleGoing(c)}
          icon={going[c.id]?.mine ? <Check className="h-5 w-5" /> : <UserCheck className="h-5 w-5" />}
          size={big ? 'lg' : 'md'}
        >
          {going[c.id]?.mine ? 'I’m going' : 'I’ll be there'}
        </Button>
      )}
      <a
        href={circleCalendarUrl(c)}
        download={`${c.id}.ics`}
        className={cx(
          'inline-flex items-center gap-2 rounded-xl border border-line bg-surface px-4 font-bold text-ink no-underline hover:bg-muted',
          big ? 'min-h-12 text-base' : 'min-h-11 text-sm'
        )}
      >
        <BellRing className="h-5 w-5" aria-hidden="true" /> Remind me
      </a>
    </div>
  );

  if (!next) return <RibbonLoader text="Loading circles…" />;

  return (
    <div className="flex flex-col gap-5">
      {/* The next circle, clearly */}
      <Card as="section" raised aria-labelledby="next-circle-h" className="flex flex-col gap-4 border-2 border-pri/30">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="inline-flex items-center gap-2 text-sm font-bold text-pri-text">
            <CalendarClock className="h-4 w-4" aria-hidden="true" /> {next.t.live ? 'Happening now' : 'Next circle'}
          </span>
          <Badge tone={next.t.live ? 'danger' : 'pri'} dot={next.t.live}>
            {next.t.label}
          </Badge>
        </div>
        <div>
          <h2 id="next-circle-h" className="m-0 text-2xl font-extrabold leading-tight text-ink">
            {next.c.title}
          </h2>
          <p className="m-0 mt-1 text-base text-ink-2">
            Hosted by <strong className="text-ink">{next.c.hostName}</strong>
            {next.c.hostRole && <span className="text-ink-3"> · {next.c.hostRole}</span>}
          </p>
        </div>
        <p className="m-0 text-base leading-relaxed text-ink-2">{next.c.description}</p>
        <p className="m-0 flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.9375rem] text-ink-3">
          <span>
            {next.t.weekly} · {next.c.durationMin} min
          </span>
          {goingText(next.c.id) && (
            <span className="inline-flex items-center gap-1.5 font-semibold text-ink-2">
              <Users className="h-4 w-4" aria-hidden="true" /> {goingText(next.c.id)}
            </span>
          )}
        </p>
        {actions(next.c, next.t.live, true)}
        <p className="m-0 text-sm text-ink-3">You can just listen if you don’t feel like talking. Only your community name is ever shown.</p>
      </Card>

      {rest.length > 0 && (
        <>
          <SectionHeader title="Other circles this week" size="md" />
          <div className="grid gap-4 md:grid-cols-2">
            {rest.map(({ c, t }) => (
              <Card as="article" key={c.id} className="flex flex-col gap-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-bold text-pri-text">{topicLabel(c.topic)}</span>
                  <Badge tone={t.live ? 'danger' : 'muted'} dot={t.live}>
                    {t.label}
                  </Badge>
                </div>
                <h3 className="m-0 text-lg font-bold leading-snug text-ink">{c.title}</h3>
                <p className="m-0 text-[0.9375rem] text-ink-2">
                  Hosted by <strong className="text-ink">{c.hostName}</strong>
                </p>
                <p className="m-0 line-clamp-2 text-[0.9375rem] leading-relaxed text-ink-2">{c.description}</p>
                <p className="m-0 text-sm text-ink-3">
                  {t.weekly} · {c.durationMin} min{goingText(c.id) ? ` · ${goingText(c.id)}` : ''}
                </p>
                <div className="mt-auto pt-1">{actions(c, t.live)}</div>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
};

/* ---------- A group circle's chat room ---------- */

const CircleRoom: React.FC<{
  circle: Circle;
  me: Me;
  profile: UserProfile;
  onLeave: () => void;
  onReport: (t: ReportTarget) => void;
  onCrisis: () => void;
  /** "Just listen": read along without the message box */
  listenOnly: boolean;
  setListenOnly: (v: boolean) => void;
}> = ({ circle, me, profile, onLeave, onReport, onCrisis, listenOnly, setListenOnly }) => {
  const [messages, setMessages] = useState<CircleMessage[]>([]);
  const [text, setText] = useState('');
  const [notice, setNotice] = useState('');
  const [sending, setSending] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [question, setQuestion] = useState('');
  const [asking, setAsking] = useState(false);
  const listRef = useRef<HTMLUListElement>(null);
  const timing = circleTiming(circle);

  useEffect(() => {
    let alive = true;
    listCircleMessages(me, circle.id)
      .then(list => alive && setMessages(list))
      .catch(e => alive && setNotice(friendlyError(e)));
    const stop = subscribeCircle(me, circle.id, m => setMessages(prev => (prev.some(x => x.id === m.id) ? prev : [...prev, m])));
    return () => {
      alive = false;
      stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [circle.id]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  const send = async () => {
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    setNotice('');
    const check = await checkBeforePosting(body);
    if (check.status === 'crisis') {
      setSending(false);
      return onCrisis();
    }
    if (check.status === 'blocked') {
      setSending(false);
      return setNotice(check.reason);
    }
    try {
      const m = await sendCircleMessage(me, circle.id, body);
      setMessages(prev => [...prev, m]);
      setText('');
    } catch (e) {
      setNotice(friendlyError(e));
    } finally {
      setSending(false);
    }
  };

  const ask = async () => {
    const q = question.trim();
    if (!q || asking) return;
    setAsking(true);
    try {
      const a = await askGuide(q, circle.title, profile);
      if (a.risk === 'crisis') onCrisis();
      setMessages(prev => [
        ...prev,
        { id: 'q_' + Date.now(), circleId: circle.id, authorName: `${me.nickname} (to the guide)`, body: q, createdAt: new Date().toISOString(), mine: true, guide: true },
        { id: 'g_' + Date.now(), circleId: circle.id, authorName: 'Circle guide (AI)', body: a.reply, createdAt: new Date().toISOString(), mine: false, guide: true, lang: a.lang },
      ]);
      setQuestion('');
      setGuideOpen(false);
    } catch {
      setNotice('The guide couldn’t answer just now. Try again in a moment.');
    } finally {
      setAsking(false);
    }
  };

  return (
    <Card raised padded={false} className="flex flex-col overflow-hidden animate-fadeIn">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-4 py-4 sm:px-6">
        <div className="min-w-0">
          <button type="button" onClick={onLeave} className="mb-1 inline-flex min-h-10 items-center gap-1.5 text-sm font-bold text-pri-text hover:underline cursor-pointer">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" /> All circles
          </button>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="m-0 text-xl font-bold text-ink">{circle.title}</h2>
            <Badge tone={timing.live ? 'danger' : 'muted'} dot={timing.live}>
              {timing.label}
            </Badge>
          </div>
          <p className="m-0 mt-0.5 text-[0.9375rem] text-ink-2">
            Hosted by {circle.hostName}
            {timing.label !== timing.weekly.replace(' (Ghana time)', '') && ` · ${timing.weekly}`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant={listenOnly ? 'soft' : 'secondary'}
            aria-pressed={listenOnly}
            onClick={() => setListenOnly(!listenOnly)}
            icon={<Ear className="h-5 w-5" />}
          >
            Just listen
          </Button>
          <Button variant="soft" onClick={() => setGuideOpen(true)} icon={<Sparkles className="h-5 w-5" />}>
            Ask the guide
          </Button>
        </div>
      </div>

      <ul ref={listRef} className="m-0 flex h-[50vh] min-h-64 list-none flex-col gap-4 overflow-y-auto bg-bg p-4 sm:p-6" aria-live="polite" aria-label="Circle chat">
        {messages.length === 0 && <li className="text-[0.9375rem] text-ink-3">No messages yet. Say hello — the circle is listening.</li>}
        {messages.map(m => (
          <li key={m.id} className={cx('flex flex-col gap-1', m.mine ? 'items-end' : 'items-start')}>
            <span className={cx('text-sm font-bold', m.guide ? 'text-pri-text' : 'text-ink-2')}>{m.mine && !m.guide ? 'You' : m.authorName}</span>
            <div
              className={cx(
                'max-w-[88%] whitespace-pre-wrap px-4 py-3 text-base leading-relaxed sm:max-w-[75%]',
                m.guide
                  ? 'rounded-2xl border border-pri-text/30 bg-pri-soft text-pri-ink'
                  : m.mine
                    ? 'rounded-2xl rounded-tr-md bg-pri text-[#fff]'
                    : 'rounded-2xl rounded-tl-md border border-line bg-surface text-ink'
              )}
              translate={m.mine || m.lang ? 'no' : undefined}
              lang={m.lang}
            >
              {m.body}
            </div>
            <span className="flex flex-wrap items-center gap-2 text-xs text-ink-3">
              {new Date(m.createdAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
              {m.guide && <span className="font-semibold text-pri-text">Only you can see this</span>}
              {!m.mine && !m.guide && (
                <button
                  type="button"
                  onClick={() => onReport({ type: 'circle_message', id: m.id, authorId: m.authorId, authorName: m.authorName })}
                  className="min-h-8 font-semibold underline hover:text-ink cursor-pointer"
                >
                  Report
                </button>
              )}
            </span>
          </li>
        ))}
      </ul>

      <div className="flex flex-col gap-2 border-t border-line px-4 py-4 sm:px-6">
        {notice && (
          <Notice tone="warn" icon={<AlertTriangle className="h-5 w-5" />}>
            {notice}
          </Notice>
        )}
        {listenOnly ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-pri-soft/60 px-4 py-3">
            <p className="m-0 flex items-center gap-2 text-[0.9375rem] text-ink">
              <Ear className="h-5 w-5 text-pri-text" aria-hidden="true" /> You’re listening. Nobody is told who is reading.
            </p>
            <Button size="sm" onClick={() => setListenOnly(false)}>
              Say something
            </Button>
          </div>
        ) : (
        <form
          className="flex gap-2"
          onSubmit={e => {
            e.preventDefault();
            send();
          }}
        >
          <label htmlFor="circle-msg" className="sr-only">
            Message the circle
          </label>
          <input
            id="circle-msg"
            type="text"
            maxLength={1000}
            value={text}
            onChange={e => {
              setText(e.target.value);
              setNotice('');
            }}
            placeholder="Share with the circle…"
            className={inputClass}
          />
          <Button type="submit" size="lg" disabled={!text.trim() || sending} className="shrink-0" icon={<Send className="h-5 w-5" />}>
            <span className="sr-only sm:not-sr-only">Send</span>
          </Button>
        </form>
        )}
        <p className="m-0 text-sm text-ink-3">Circle chat is kept for 7 days. What is shared in the circle stays in the circle.</p>
      </div>

      <Modal
        isOpen={guideOpen}
        onClose={() => setGuideOpen(false)}
        title="Ask the circle guide"
        subtitle="An AI guide answers privately — only you see the question and answer."
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setGuideOpen(false)}>
              Cancel
            </Button>
            <Button onClick={ask} disabled={!question.trim() || asking}>
              {asking ? 'Asking…' : 'Ask'}
            </Button>
          </>
        }
      >
        <Field label="Your question" htmlFor="guide-q">
          <textarea
            id="guide-q"
            rows={3}
            value={question}
            onChange={e => setQuestion(e.target.value)}
            placeholder="For example: I'm nervous to share. What could I say first?"
            className={textareaClass}
          />
        </Field>
      </Modal>
    </Card>
  );
};
