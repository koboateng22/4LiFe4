import React, { useEffect, useMemo, useRef, useState } from 'react';
import { UserProfile, ChatMessage } from '../../types';
import { Card, ChoiceCard, Button, IconButton, Modal, Notice, Switch, textareaClass, cx } from '../ui';
import { Send, Volume2, VolumeX, Shield, Check, Copy, Waves, Lightbulb, Wind, Lock, Mic, Leaf, Square, RotateCcw, Phone, NotebookPen, Trash2, Timer, Flag, X, History } from 'lucide-react';
import { streamChat } from '../../lib/aiChat';
import { assessRisk, maxRisk, type RiskLevel } from '../../lib/safety';
import { trapLabel, type ThoughtRecord, type TherapyMode } from '../../lib/cbt';
import { clearChat, deleteThoughtRecord, listThoughtRecords, loadChat, saveChat, setThoughtShared, type UrgeRatings } from '../../lib/cbtStore';
import { ThoughtRecordModal } from '../cbt/ThoughtRecordModal';
import { PageHero } from '../PageHero';
import { GrowIllustration } from '../auth/AuthIllustrations';
import { useAction } from '../../lib/actions';
import { COPING_STEPS, keep, loadWave, markSeen, remember, saveWave, seenBefore, stepLabel, topHelped, WAVE_MINUTES, type Wave } from '../../lib/coping';
import { CravingLevels, cravingLabel } from '../cbt/CravingLevels';
import { WaveTimer } from '../cbt/WaveTimer';
import { HelpedModal } from '../cbt/HelpedModal';
import { celebrateFrom } from '../LivingBackground';

interface AiTherapyTabProps {
  profile: UserProfile;
  setProfile?: React.Dispatch<React.SetStateAction<UserProfile>>;
  onOpenSos: () => void;
  onOpenCalm: () => void;
}

/* The four ways AI therapy can help (ids are what the server expects) */
const MODES: Array<{ id: TherapyMode; label: string; description: string; icon: React.ComponentType<{ className?: string }>; prompts: string[] }> = [
  {
    id: 'urge_surfing',
    label: 'Ride out a craving',
    description: 'Get through an urge until it passes',
    icon: Waves,
    prompts: ['I have a strong craving right now', 'Where do I feel the urge?', 'Give me something to do for 10 minutes'],
  },
  {
    id: 'cbt',
    label: 'Reframe a thought',
    description: 'Work through an unhelpful thought',
    icon: Lightbulb,
    prompts: ['Help me with a thought that keeps coming back', 'I feel like I always fail', 'I keep telling myself one won’t hurt'],
  },
  {
    id: 'mindfulness',
    label: 'Calm my body',
    description: 'Breathing and grounding',
    icon: Wind,
    prompts: ['Guide me through slow breathing', 'Do 5-4-3-2-1 grounding with me', 'I feel tense and anxious'],
  },
  {
    id: 'accountability',
    label: 'Stay on track',
    description: 'Plan the next few hours',
    icon: Shield,
    prompts: ['Tonight is my risky time', 'Help me plan my weekend', 'Remind me why I started'],
  },
];

const timeNow = () => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

const greeting = (profile: UserProfile, aiName: string): ChatMessage => ({
  id: 'greeting',
  sender: 'ai',
  text: `Hello ${profile.nickname || profile.name || 'friend'}. I'm ${aiName}, an AI companion that uses CBT — practical skills for cravings, thoughts and feelings.\n\nWhat would help most right now?`,
  timestamp: timeNow(),
  suggestedActions: ['I have a strong craving right now', 'A thought keeps bothering me', 'I feel stressed and need to calm down'],
});

/** A sensible starting mode: the last one used, or by time of day (mornings: plan the day; otherwise cravings) */
const startingMode = (uid: string): TherapyMode => {
  const saved = remember<TherapyMode | null>(`ai_mode_${uid}`, null);
  if (saved && MODES.some(m => m.id === saved)) return saved;
  const h = new Date().getHours();
  return h >= 5 && h < 12 ? 'accountability' : 'urge_surfing';
};

export const AiTherapyTab: React.FC<AiTherapyTabProps> = ({ profile, setProfile, onOpenSos, onOpenCalm }) => {
  const aiName = profile.aiName || '4Life';
  const uid = profile.id || 'guest';

  const [stored] = useState(() => loadChat(uid));
  const [messages, setMessages] = useState<ChatMessage[]>(() => (stored.messages.length ? stored.messages : [greeting(profile, aiName)]));
  const [ratings, setRatings] = useState<UrgeRatings>(stored.ratings);
  const [activeMode, setActiveMode] = useState<TherapyMode>(() => startingMode(uid));
  // The big introduction is shown on the first visit only; after that the chat comes first
  const [firstVisit] = useState(() => !seenBefore(`ai_${uid}`) && !stored.messages.length);
  const [resumeShown, setResumeShown] = useState(() => stored.messages.length > 0);
  const [wave, setWave] = useState<Wave | null>(() => loadWave(uid));
  const [helpedOpen, setHelpedOpen] = useState(false);
  const [helped, setHelped] = useState<string[]>(() => topHelped(uid));
  const [helpedNote, setHelpedNote] = useState('');
  const [risk, setRisk] = useState<RiskLevel>('none');
  const [riskDismissed, setRiskDismissed] = useState(false);

  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isListening, setIsListening] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);

  // Thought records
  const [records, setRecords] = useState<ThoughtRecord[]>([]);
  const [recordsError, setRecordsError] = useState('');
  const [recordOpen, setRecordOpen] = useState(false);
  const [recordSeed, setRecordSeed] = useState<string | undefined>();
  const [allRecordsOpen, setAllRecordsOpen] = useState(false);
  const [savedNote, setSavedNote] = useState('');

  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const recognitionRef = useRef<any>(null);
  const SpeechRecognitionCtor = typeof window !== 'undefined' ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition : null;

  useEffect(() => markSeen(`ai_${uid}`), [uid]);
  useEffect(() => keep(`ai_mode_${uid}`, activeMode), [activeMode, uid]);
  useEffect(() => saveWave(uid, wave), [wave, uid]);

  // Keep the conversation on this device so it survives a refresh
  useEffect(() => {
    if (!isLoading) saveChat(uid, { messages: messages.filter(m => m.id !== 'greeting'), ratings });
  }, [messages, ratings, isLoading, uid]);

  useEffect(() => {
    listThoughtRecords(uid)
      .then(setRecords)
      .catch(() => setRecordsError('Your thought records could not be loaded. Check your connection.'));
  }, [uid]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el && messages.length > 1) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  useEffect(
    () => () => {
      recognitionRef.current?.stop?.();
      abortRef.current?.abort();
    },
    []
  );

  const speakText = (text: string) => {
    if (!voiceEnabled || !('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.95;
    const code = profile.language || 'en';
    if (code !== 'en') utterance.lang = code === 'fat' ? 'ak' : code;
    window.speechSynthesis.speak(utterance);
  };

  const handleCopyText = (id: string, text: string) => {
    navigator.clipboard?.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Any new sign of danger brings the safety card back, even if it was hidden before
  const raiseRisk = (r: RiskLevel) => {
    setRisk(prev => maxRisk(prev, r));
    if (r !== 'none') setRiskDismissed(false);
  };

  const handleSendMessage = async (textToSend?: string) => {
    const text = (textToSend ?? inputMessage).trim();
    if (!text || isLoading) return;

    // Checked on the device first, so emergency options appear even without a connection
    raiseRisk(assessRisk(text).level);

    const userMsg: ChatMessage = { id: 'u_' + Date.now(), sender: 'user', text, timestamp: timeNow() };
    const replyId = 'ai_' + Date.now();
    const history = messages
      .filter(m => m.id !== 'greeting' && m.text)
      .slice(-10)
      .map(m => ({ role: m.sender === 'user' ? ('user' as const) : ('model' as const), content: m.text }));

    setMessages(prev => [...prev, userMsg, { id: replyId, sender: 'ai', mode: activeMode, text: '', timestamp: timeNow() }]);
    setInputMessage('');
    setIsLoading(true);
    const controller = new AbortController();
    abortRef.current = controller;
    const update = (patch: Partial<ChatMessage>) => setMessages(prev => prev.map(m => (m.id === replyId ? { ...m, ...patch } : m)));

    try {
      const done = await streamChat(
        // the steps that helped before travel with the message, so the AI can suggest them first
        { message: text, mode: activeMode, history, userProfile: { ...profile, copingThatHelped: helped.map(stepLabel) } },
        { onRisk: raiseRisk, onText: soFar => update({ text: soFar }) },
        controller.signal
      );
      raiseRisk(done.risk);
      update({ text: done.reply, model: done.model, lang: done.language, suggestedActions: done.suggestions });
      speakText(done.reply);
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        setMessages(prev => prev.map(m => (m.id === replyId ? { ...m, text: m.text ? m.text + ' …' : 'Stopped.' } : m)));
      } else {
        console.error('Chat error:', err);
        update({
          text: `I couldn't reach the server just now, ${profile.nickname || 'friend'}. While you wait: breathe in for 4 and out for 6, five times. Urges rise and pass like a wave.\n\nIf you're not safe, call 112 or press SOS.`,
          suggestedActions: undefined,
        });
      }
    } finally {
      setIsLoading(false);
      abortRef.current = null;
    }
  };

  const toggleListening = () => {
    if (!SpeechRecognitionCtor) return;
    if (isListening) {
      recognitionRef.current?.stop();
      return;
    }
    const rec = new SpeechRecognitionCtor();
    rec.lang = profile.language && profile.language !== 'en' ? profile.language : 'en-GB';
    rec.interimResults = true;
    rec.onresult = (e: any) => setInputMessage(Array.from(e.results).map((r: any) => r[0].transcript).join(''));
    rec.onend = () => setIsListening(false);
    rec.onerror = () => setIsListening(false);
    recognitionRef.current = rec;
    setIsListening(true);
    rec.start();
  };

  const rateUrge = (n: number) => {
    setRatings(r => (r.before === undefined || r.after !== undefined ? { before: n } : { ...r, after: n }));
    setProfile?.(p => ({ ...p, currentCraving: Math.max(1, n) }));
  };

  // Ride the wave: a 20-minute timer that checks in every 5 minutes
  const chatRef = useRef<HTMLElement>(null);
  const startWave = () => {
    const level = ratings.after ?? ratings.before ?? 5;
    setWave({ startedAt: new Date().toISOString(), points: [{ m: 0, level }] });
  };
  const rateWave = (level: number) => {
    setWave(w => {
      if (!w) return w;
      const m = Math.min(WAVE_MINUTES, (Date.now() - new Date(w.startedAt).getTime()) / 60000);
      return { ...w, points: [...w.points, { m, level }] };
    });
    setRatings(r => ({ before: r.before ?? wave?.points[0]?.level, after: level }));
    setProfile?.(p => ({ ...p, currentCraving: Math.max(1, level) }));
  };
  const finishWave = () => {
    setWave(w => (w ? { ...w, finished: true } : w));
    const pts = wave?.points || [];
    if (pts.length > 1 && pts[pts.length - 1].level < pts[0].level) celebrateFrom(chatRef.current);
  };
  const primaryContact = profile.contacts?.find(c => c.isPrimary) || profile.contacts?.[0];

  const lastUserText = useMemo(() => [...messages].reverse().find(m => m.sender === 'user')?.text, [messages]);
  const userTurns = messages.filter(m => m.sender === 'user').length;

  const startNewConversation = () => {
    abortRef.current?.abort();
    clearChat(uid);
    setMessages([greeting(profile, aiName)]);
    setRatings({});
    setRisk('none');
    setConfirmClear(false);
    setResumeShown(false);
  };

  const openRecord = (seed?: string) => {
    seed = seed ?? (lastUserText && lastUserText.length > 12 ? lastUserText : undefined);
    setRecordSeed(seed);
    setRecordOpen(true);
  };

  // Requests from quick search (Ctrl/⌘ K)
  const focusInput = () => {
    const el = document.getElementById('chat-input') as HTMLTextAreaElement | null;
    el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    el?.focus({ preventScroll: true });
  };
  useAction('thought-record', () => openRecord());
  useAction('craving', () => {
    setActiveMode('urge_surfing');
    focusInput();
  });
  useAction('ask', text => {
    if (text) setInputMessage(text);
    focusInput();
  });

  const onRecordSaved = (r: ThoughtRecord) => {
    setRecords(prev => [r, ...prev]);
    const drop = r.intensityBefore - r.intensityAfter;
    setSavedNote(drop > 0 ? `Thought record saved. ${r.emotion || 'The feeling'} went from ${r.intensityBefore} to ${r.intensityAfter}.` : 'Thought record saved.');
    setTimeout(() => setSavedNote(''), 6000);
  };

  const toggleShare = async (r: ThoughtRecord) => {
    setRecords(prev => prev.map(x => (x.id === r.id ? { ...x, shared: !r.shared } : x)));
    try {
      await setThoughtShared(uid, profile.nickname, r.id, !r.shared);
    } catch {
      setRecords(prev => prev.map(x => (x.id === r.id ? { ...x, shared: r.shared } : x)));
      setRecordsError('Could not change sharing. Check your connection.');
    }
  };

  const removeRecord = async (r: ThoughtRecord) => {
    setRecords(prev => prev.filter(x => x.id !== r.id));
    try {
      await deleteThoughtRecord(uid, profile.nickname, r.id);
    } catch {
      setRecords(prev => [r, ...prev]);
      setRecordsError('Could not delete that record. Check your connection.');
    }
  };

  const currentMode = MODES.find(m => m.id === activeMode) || MODES[0];
  const lastAiIndex = messages.map(m => m.sender).lastIndexOf('ai');
  const lastAi = messages[lastAiIndex];
  const showStarters = !isLoading && !(lastAiIndex === messages.length - 1 && lastAi?.suggestedActions?.length);
  const showUrgeScale = !wave && (activeMode === 'urge_surfing' || risk === 'concern' || ratings.before !== undefined);
  const latestUrge = ratings.after ?? ratings.before;
  const urgeDrop = ratings.before !== undefined && ratings.after !== undefined ? ratings.before - ratings.after : null;

  return (
    <div className="flex flex-col gap-6 animate-fadeIn">
      {/* 1. What do you need? The full introduction on the first visit; afterwards the chat comes first */}
      {firstVisit ? (
        <>
          <PageHero
            id="ai-h"
            className="py-5 sm:py-6"
            eyebrow="AI CBT therapy"
            title="What do you need right now?"
            text="Choose a starting point below, or just write how you feel. Your chat is saved only on this phone."
            art={<GrowIllustration />}
          />
          <section aria-label="Ways to start" className="flex flex-col gap-3.5">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {MODES.map(m => {
                const Icon = m.icon;
                return (
                  <ChoiceCard
                    key={m.id}
                    className="lift"
                    selected={activeMode === m.id}
                    onClick={() => setActiveMode(m.id)}
                    icon={<Icon className="h-6 w-6" />}
                    title={m.label}
                    description={<span className="hidden sm:inline">{m.description}</span>}
                  />
                );
              })}
            </div>
          </section>
        </>
      ) : (
        <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
          <h1 id="ai-h" className="m-0 text-xl font-extrabold text-ink sm:text-2xl">
            What do you need right now?
          </h1>
          <p className="m-0 flex items-center gap-1.5 text-sm text-ink-3">
            <Lock className="h-3.5 w-3.5" aria-hidden="true" /> Private: saved on this phone only
          </p>
        </div>
      )}

      {/* Crisis: shown above everything as soon as danger words appear */}
      {risk === 'crisis' && !riskDismissed && (
        <Card tone="danger" as="section" role="alert" aria-labelledby="crisis-h" className="flex flex-col gap-4 border-2 border-danger">
          <div>
            <h2 id="crisis-h" className="m-0 text-xl font-extrabold text-ink">
              Your safety comes first
            </h2>
            <p className="m-0 mt-1 text-base leading-relaxed text-ink-2">
              It sounds like you might be in danger. {aiName} is an AI and cannot call for help — a person can, right now.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <a href="tel:112" className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-danger px-5 text-base font-bold text-[#fff] no-underline hover:bg-danger-hover">
              <Phone className="h-5 w-5" aria-hidden="true" /> Call 112
            </a>
            <a href="tel:193" className="inline-flex min-h-12 items-center gap-2 rounded-xl border border-line bg-surface px-5 text-base font-bold text-ink no-underline hover:bg-muted">
              Ambulance 193
            </a>
            <Button variant="secondary" size="lg" onClick={onOpenSos}>
              Alert my support person
            </Button>
          </div>
          <button type="button" onClick={() => setRiskDismissed(true)} className="self-start text-sm font-semibold text-ink-2 underline cursor-pointer min-h-10">
            I'm safe — hide this
          </button>
        </Card>
      )}

      {risk === 'concern' && !riskDismissed && activeMode !== 'urge_surfing' && (
        <Notice tone="warn" icon={<Waves className="h-5 w-5" />}>
          <p className="m-0 font-bold">That sounds like a strong urge.</p>
          <p className="m-0 mt-0.5">Riding it out works best step by step. Switch to “Ride out a craving”, or breathe for two minutes first.</p>
          <div className="mt-2.5 flex flex-wrap gap-2">
            <Button size="sm" onClick={() => setActiveMode('urge_surfing')}>
              Ride out a craving
            </Button>
            <Button size="sm" variant="secondary" onClick={onOpenCalm}>
              Breathe
            </Button>
          </div>
        </Notice>
      )}

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        {/* 2. Conversation */}
        <Card as="section" raised padded={false} aria-label="Conversation" className="flex min-w-0 flex-col overflow-hidden" ref={chatRef as React.Ref<HTMLElement>}>
          <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3.5 sm:px-5">
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-pri text-[#fff]" aria-hidden="true">
                <Leaf className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <p className="m-0 truncate text-[1.0625rem] font-bold text-ink">{aiName}</p>
                <p className="m-0 hidden items-center gap-1.5 text-sm text-ink-3 sm:flex">
                  <Lock className="h-3.5 w-3.5" aria-hidden="true" /> Saved on this device only
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {userTurns > 0 && (
                <Button variant="soft" size="sm" icon={<Flag className="h-4 w-4" />} onClick={() => setHelpedOpen(true)} className="min-h-11">
                  <span className="hidden sm:inline">Wrap up</span>
                  <span className="sr-only sm:hidden">Wrap up: save what helped</span>
                </Button>
              )}
              <IconButton label={voiceEnabled ? 'Stop reading replies aloud' : 'Read replies aloud'} aria-pressed={voiceEnabled} onClick={() => setVoiceEnabled(v => !v)}>
                {voiceEnabled ? <Volume2 className="h-5 w-5 text-pri-text" /> : <VolumeX className="h-5 w-5" />}
              </IconButton>
              <IconButton label="Start a new conversation" onClick={() => setConfirmClear(true)} disabled={messages.length <= 1}>
                <RotateCcw className="h-5 w-5" />
              </IconButton>
            </div>
          </div>

          {/* Mode chips: switch what kind of help, without leaving the chat */}
          {!firstVisit && (
            <div className="no-scrollbar fade-x flex gap-2 overflow-x-auto border-b border-line px-4 py-3 sm:flex-wrap sm:overflow-visible sm:px-5" role="radiogroup" aria-label="What kind of help">
              {MODES.map(m => {
                const Icon = m.icon;
                const on = activeMode === m.id;
                return (
                  <button
                    key={m.id}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    aria-pressed={on}
                    onClick={() => setActiveMode(m.id)}
                    className={cx(
                      'inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full border px-4 text-sm font-bold transition-colors cursor-pointer',
                      on ? 'border-pri bg-pri text-[#fff]' : 'border-line bg-surface text-ink hover:border-pri-text'
                    )}
                  >
                    <Icon className="h-4 w-4" aria-hidden="true" />
                    {m.label}
                  </button>
                );
              })}
            </div>
          )}

          {/* Ride the wave: 20-minute craving timer */}
          {wave && <WaveTimer wave={wave} onRate={rateWave} onFinish={finishWave} onStop={() => setWave(null)} />}

          {/* How strong is the urge? Before and after, so you can see it pass */}
          {showUrgeScale && (
            <div className="flex flex-col gap-2.5 border-b border-line bg-surface px-4 py-3.5 sm:px-5">
              <p className="m-0 text-[0.9375rem] font-bold text-ink" id="urge-label">
                {ratings.before === undefined
                  ? 'How strong is the craving right now?'
                  : ratings.after === undefined
                    ? `Started ${cravingLabel(ratings.before)}. How strong is it now?`
                    : urgeDrop! > 0
                      ? `From ${cravingLabel(ratings.before)} down to ${cravingLabel(ratings.after)}. The wave is passing — well done.`
                      : `From ${cravingLabel(ratings.before)} to ${cravingLabel(ratings.after)}. Keep going, or try breathing or SOS.`}
              </p>
              <CravingLevels labelledBy="urge-label" value={ratings.after ?? ratings.before} onChange={rateUrge} />
              {latestUrge !== undefined && latestUrge >= 3 && (
                <Button size="sm" variant="secondary" icon={<Timer className="h-4 w-4 text-pri-text" />} className="self-start" onClick={startWave}>
                  Ride the wave: 20-minute timer
                </Button>
              )}
            </div>
          )}

          {/* Welcome back */}
          {resumeShown && (
            <div className="flex items-center gap-3 border-b border-line bg-bg px-4 py-2.5 text-sm text-ink-2 sm:px-5" role="status">
              <History className="h-4 w-4 shrink-0 text-pri-text" aria-hidden="true" />
              <span className="min-w-0 flex-1">Welcome back — you can carry on where you left off.</span>
              <button type="button" onClick={() => setConfirmClear(true)} className="min-h-10 shrink-0 rounded-lg px-2 font-bold text-pri-text hover:bg-muted cursor-pointer">
                Start fresh
              </button>
              <button type="button" onClick={() => setResumeShown(false)} aria-label="Hide this" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg hover:bg-muted cursor-pointer">
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          )}

          {/* What helped before */}
          {helped.length > 0 && (activeMode === 'urge_surfing' || risk === 'concern') && !wave && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-line bg-warn-soft/60 px-4 py-2.5 sm:px-5">
              <p className="m-0 min-w-0 flex-1 text-sm text-ink">
                <span className="font-bold">Last time, this helped:</span> {helped.map(id => stepLabel(id).toLowerCase()).join(', ')}.
              </p>
              {helped.includes('breathing') && (
                <Button size="sm" variant="secondary" onClick={onOpenCalm} icon={<Wind className="h-4 w-4 text-pri-text" />}>
                  Breathe
                </Button>
              )}
              {helped.includes('calling') && primaryContact?.phone && (
                <a href={`tel:${primaryContact.phone.replace(/\s+/g, '')}`} className={cx('inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-line bg-surface px-3.5 text-sm font-bold text-ink no-underline hover:bg-muted')}>
                  <Phone className="h-4 w-4 text-pri-text" aria-hidden="true" /> Call {primaryContact.name.split(' (')[0]}
                </a>
              )}
            </div>
          )}
          {helpedNote && (
            <Notice icon={<Check className="h-5 w-5" />} className="m-3 text-[0.9375rem]">
              {helpedNote}
            </Notice>
          )}

          <div ref={scrollRef} className="flex h-[56vh] min-h-[340px] flex-col gap-5 overflow-y-auto bg-bg p-4 sm:h-[460px] sm:p-6" aria-live="polite" aria-label="Messages">
            {messages.map((msg, idx) => {
              const isUser = msg.sender === 'user';
              const streaming = isLoading && idx === messages.length - 1 && !isUser;
              return (
                <div key={msg.id} className={cx('flex items-start gap-3', isUser && 'flex-row-reverse')}>
                  {isUser ? (
                    <span className="hidden h-8 w-8 shrink-0 items-center justify-center rounded-full bg-pri-soft text-xs font-bold text-pri-ink sm:flex" aria-hidden="true">
                      {(profile.nickname || profile.name || 'Me').slice(0, 1).toUpperCase()}
                    </span>
                  ) : (
                    <span className="hidden h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-pri text-[#fff] sm:flex" aria-hidden="true">
                      <Leaf className="h-4 w-4" />
                    </span>
                  )}
                  <div className={cx('flex max-w-[88%] flex-col gap-1.5 sm:max-w-[78%]', isUser && 'items-end')}>
                    <span className="sr-only">{isUser ? 'You said:' : `${aiName} said:`}</span>
                    <div
                      className={cx(
                        'whitespace-pre-wrap px-4 py-3.5 text-base leading-relaxed sm:px-[1.125rem]',
                        isUser ? 'rounded-2xl rounded-tr-md bg-pri text-[#fff]' : 'rounded-2xl rounded-tl-md border border-line bg-surface text-ink'
                      )}
                      translate={isUser || msg.lang ? 'no' : undefined}
                      lang={msg.lang}
                    >
                      {msg.text ||
                        (streaming && (
                          <span className="inline-flex items-center gap-1.5 text-ink-3" role="status">
                            <span className="h-2 w-2 animate-bounce rounded-full bg-pri" />
                            <span className="h-2 w-2 animate-bounce rounded-full bg-pri [animation-delay:0.15s]" />
                            <span className="h-2 w-2 animate-bounce rounded-full bg-pri [animation-delay:0.3s]" />
                            <span className="sr-only">{aiName} is writing…</span>
                          </span>
                        ))}
                      {streaming && msg.text && <span className="ml-0.5 inline-block h-4 w-1.5 animate-pulse bg-pri align-[-2px]" aria-hidden="true" />}
                    </div>
                    {!streaming && (
                      <div className="flex flex-wrap items-center gap-2 text-xs text-ink-3">
                        <span>{msg.timestamp}</span>
                        {!isUser && msg.text && (
                          <button
                            type="button"
                            onClick={() => handleCopyText(msg.id, msg.text)}
                            className="-my-1 inline-flex min-h-10 items-center gap-1 rounded-md px-2 hover:bg-muted hover:text-ink cursor-pointer"
                            aria-label="Copy message"
                          >
                            {copiedId === msg.id ? <Check className="h-3.5 w-3.5 text-pri-text" /> : <Copy className="h-3.5 w-3.5" />}
                            {copiedId === msg.id ? 'Copied' : 'Copy'}
                          </button>
                        )}
                        {isUser && msg.text.length > 12 && (
                          <button
                            type="button"
                            onClick={() => openRecord(msg.text)}
                            className="inline-flex min-h-8 items-center gap-1 rounded-md px-1.5 font-semibold hover:bg-muted hover:text-ink cursor-pointer"
                          >
                            <NotebookPen className="h-3.5 w-3.5" /> Work through this thought
                          </button>
                        )}
                      </div>
                    )}
                    {!isUser && idx === lastAiIndex && !isLoading && msg.suggestedActions && msg.suggestedActions.length > 0 && (
                      <div className="flex flex-wrap gap-2 pt-1">
                        {msg.suggestedActions.map((action, i) => (
                          <button
                            key={i}
                            type="button"
                            onClick={() => handleSendMessage(action)}
                            className="min-h-11 rounded-full border border-line bg-surface px-4 py-2 text-left text-[0.9375rem] font-semibold text-ink hover:border-pri-text cursor-pointer"
                          >
                            {action}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {showStarters && (
            <div className="no-scrollbar fade-x flex items-center gap-2 overflow-x-auto border-t border-line px-4 py-3 sm:px-5">
              <span className="shrink-0 text-sm font-bold text-ink-3">Try:</span>
              {currentMode.prompts.map(prompt => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => handleSendMessage(prompt)}
                  className="min-h-10 shrink-0 whitespace-nowrap rounded-full border border-line bg-surface px-3.5 text-sm font-semibold text-ink hover:border-pri-text cursor-pointer"
                >
                  {prompt}
                </button>
              ))}
            </div>
          )}

          <form
            className="flex items-end gap-2 border-t border-line px-4 py-4 sm:gap-2.5 sm:px-5"
            onSubmit={e => {
              e.preventDefault();
              handleSendMessage();
            }}
          >
            <label htmlFor="chat-input" className="sr-only">
              Message {aiName}
            </label>
            <textarea
              id="chat-input"
              rows={1}
              value={inputMessage}
              onChange={e => setInputMessage(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSendMessage();
                }
              }}
              placeholder="How are you feeling?"
              className={cx(textareaClass, 'min-h-[52px] resize-none')}
            />
            {SpeechRecognitionCtor && !isLoading && (
              <IconButton
                label={isListening ? 'Stop listening' : 'Speak your message'}
                onClick={toggleListening}
                variant={isListening ? 'primary' : 'secondary'}
                aria-pressed={isListening}
                className="h-[52px] w-[52px]"
              >
                <Mic className="h-5 w-5" />
              </IconButton>
            )}
            {isLoading ? (
              <IconButton label="Stop the reply" variant="secondary" onClick={() => abortRef.current?.abort()} className="h-[52px] w-[52px]">
                <Square className="h-5 w-5" />
              </IconButton>
            ) : (
              <IconButton label="Send message" variant="primary" type="submit" disabled={!inputMessage.trim()} className="h-[52px] w-[52px] disabled:opacity-45">
                <Send className="h-5 w-5" />
              </IconButton>
            )}
          </form>
        </Card>

        {/* 3. Tools */}
        <aside aria-label="Tools" className="flex min-w-0 flex-col gap-4">
          <Card className="flex flex-col gap-3.5">
            <div className="flex items-center justify-between gap-2">
              <h2 className="m-0 text-lg font-bold text-ink">Thought record</h2>
              {records.length > 0 && (
                <span className="text-sm font-semibold text-ink-3">{records.length} saved</span>
              )}
            </div>
            <p className="m-0 text-[0.9375rem] leading-relaxed text-ink-2">
              Three quick steps to swap a heavy thought for a fairer one (or six steps for the full version). You rate the feeling before and after, so you can see it working.
            </p>
            {savedNote && (
              <Notice icon={<Check className="h-5 w-5" />} className="text-[0.9375rem]">
                {savedNote}
              </Notice>
            )}
            {recordsError && (
              <Notice tone="warn" className="text-[0.9375rem]">
                {recordsError}
              </Notice>
            )}
            <Button block icon={<NotebookPen className="h-5 w-5" />} onClick={() => openRecord()}>
              Start a thought record
            </Button>
            {records.length > 0 && (
              <ul className="m-0 flex list-none flex-col gap-2 p-0" aria-label="Recent thought records">
                {records.slice(0, 3).map(r => (
                  <li key={r.id} className="rounded-xl bg-bg px-3.5 py-3">
                    <p className="m-0 line-clamp-2 text-[0.9375rem] text-ink">“{r.balancedThought}”</p>
                    <p className="m-0 mt-1 text-sm text-ink-3">
                      {r.emotion || 'Feeling'} {r.intensityBefore} → {r.intensityAfter} · {trapLabel(r.trap)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
            {records.length > 0 && (
              <Button variant="link" className="self-start" onClick={() => setAllRecordsOpen(true)}>
                See all and choose what to share
              </Button>
            )}
          </Card>

          <Card tone="soft" className="flex flex-col gap-3">
            <h2 className="m-0 text-lg font-bold text-ink">Need to calm down first?</h2>
            <p className="m-0 text-[0.9375rem] leading-relaxed text-ink-2">Breathe in for 4, out for 6. Two minutes can slow your heart rate.</p>
            <Button variant="secondary" block icon={<Wind className="h-5 w-5 text-pri-text" />} onClick={onOpenCalm}>
              Start breathing
            </Button>
          </Card>

          <Card tone="danger" className="flex flex-col gap-3">
            <h2 className="m-0 text-lg font-bold text-ink">Not feeling safe?</h2>
            <p className="m-0 text-[0.9375rem] leading-relaxed text-ink-2">{aiName} cannot call for help. A person can — right now.</p>
            <Button variant="danger" block onClick={onOpenSos}>
              Get help now
            </Button>
          </Card>

          <p className="m-0 px-1 text-sm leading-relaxed text-ink-3">
            {aiName} is an AI powered by Google Gemini. It supports your recovery but does not replace a counsellor or emergency care. Your chat is saved only on this device; to write a reply, each message is sent to Google’s Gemini AI, so leave out full names and phone numbers.
          </p>
        </aside>
      </div>

      <HelpedModal
        isOpen={helpedOpen}
        onClose={() => setHelpedOpen(false)}
        uid={uid}
        mode={activeMode}
        before={ratings.before ?? wave?.points[0]?.level}
        after={ratings.after}
        onSaved={e => {
          setHelped(topHelped(uid));
          if (e.after !== undefined) setRatings(r => ({ ...r, after: e.after }));
          setHelpedNote(`Saved. Next time ${aiName} will remember that ${e.steps.map(id => stepLabel(id).toLowerCase()).join(', ')} helped.`);
          setTimeout(() => setHelpedNote(''), 7000);
        }}
      />

      <ThoughtRecordModal
        isOpen={recordOpen}
        onClose={() => setRecordOpen(false)}
        profile={profile}
        onSaved={onRecordSaved}
        onOpenSos={() => {
          setRecordOpen(false);
          onOpenSos();
        }}
        initialThought={recordSeed}
      />

      <Modal isOpen={allRecordsOpen} onClose={() => setAllRecordsOpen(false)} title="Your thought records" subtitle="Shared records can be seen by counsellors you are booked with.">
        <ul className="m-0 flex list-none flex-col gap-3 p-0">
          {records.map(r => (
            <li key={r.id} className="flex flex-col gap-2.5 rounded-xl border border-line p-4">
              <p className="m-0 text-sm text-ink-3">
                {new Date(r.createdAt).toLocaleDateString([], { day: 'numeric', month: 'short' })} · {trapLabel(r.trap)} · {r.emotion || 'Feeling'} {r.intensityBefore} → {r.intensityAfter}
              </p>
              <p className="m-0 text-[0.9375rem] text-ink-2">
                <span className="font-bold text-ink">Thought:</span> {r.thought}
              </p>
              <p className="m-0 text-[0.9375rem] text-ink-2">
                <span className="font-bold text-ink">Fairer thought:</span> {r.balancedThought}
              </p>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <Switch checked={r.shared} onChange={() => toggleShare(r)} label="Share with my counsellor" />
                <Button variant="ghost" size="sm" icon={<Trash2 className="h-4 w-4" />} onClick={() => removeRecord(r)}>
                  Delete
                </Button>
              </div>
            </li>
          ))}
        </ul>
      </Modal>

      <Modal
        isOpen={confirmClear}
        onClose={() => setConfirmClear(false)}
        title="Start a new conversation?"
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmClear(false)}>
              Keep it
            </Button>
            <Button onClick={startNewConversation}>Start again</Button>
          </>
        }
      >
        <p className="m-0 text-base text-ink-2">This clears the conversation from this device. Your thought records are kept.</p>
      </Modal>
    </div>
  );
};
