import React, { useEffect, useRef, useState } from 'react';
import { UserProfile, CounselorMatch, ActiveTab, TriageCategory } from '../../types';
import { AFFORDABLE_COUNSELORS } from '../../data/counselors';
import { isRemote } from '../../lib/supabase';
import { listCounsellors, recordCheckin } from '../../lib/db/clientApi';
import { listThoughtRecords } from '../../lib/cbtStore';
import { trapLabel, type ThoughtRecord } from '../../lib/cbt';
import { DEFAULT_CIRCLES, circleTiming, listCircles, type Circle } from '../../lib/village';
import { Card, SectionHeader, Button, ButtonLink, Avatar, Notice, IconBadge, textareaClass, cx } from '../ui';
import { PageHero, heroPrimary, heroSecondary } from '../PageHero';
import { MoodFaces } from '../MoodFaces';
import { celebrateFrom } from '../LivingBackground';
import { GrowIllustration, VillageIllustration, HelpIllustration } from '../auth/AuthIllustrations';
import { MessageCircle, ArrowRight, Check, Star, Wind, Users, Siren, Phone, Waves, NotebookPen, Moon, Sun } from 'lucide-react';
import { RibbonLoader } from '../RibbonMark';
import { useAction, requestAction } from '../../lib/actions';
import { useCountUp, useMounted } from '../../lib/motion';

interface DashboardTabProps {
  profile: UserProfile;
  setProfile: React.Dispatch<React.SetStateAction<UserProfile>>;
  onNavigate: (tab: ActiveTab) => void;
  onOpenCalm: () => void;
  onOpenCounselor: (c: CounselorMatch) => void;
  onOpenSos: () => void;
}

/* ---------- Helpers ---------- */

const MOODS = [
  { id: 'struggling', label: 'Struggling' },
  { id: 'low', label: 'Low' },
  { id: 'okay', label: 'Okay' },
  { id: 'good', label: 'Good' },
  { id: 'great', label: 'Great' },
];

const CRAVING_WORDS = ['', 'Very mild', 'Very mild', 'Mild', 'Mild', 'Noticeable', 'Noticeable', 'Strong', 'Strong', 'Overwhelming', 'Overwhelming'];

export const FOCUS_LABEL: Record<TriageCategory, string> = {
  substance: 'Drug and alcohol recovery',
  porn: 'Screen time and adult content',
  social_media: 'Screen time and social media',
  porn_social: 'Screen time and adult content',
  anger: 'Anger and stress',
  overeating: 'Emotional eating',
  general: 'Stress and anxiety',
};

const greetingFor = (d = new Date()) => {
  const h = d.getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
};

/* ---------- Component ---------- */

export const DashboardTab: React.FC<DashboardTabProps> = ({ profile, setProfile, onNavigate, onOpenCalm, onOpenCounselor, onOpenSos }) => {
  const [mood, setMood] = useState<string>('');
  const [craving, setCraving] = useState<number>(profile.currentCraving || 3);
  const [note, setNote] = useState('');
  const saveRef = useRef<HTMLButtonElement>(null);
  const [saved, setSaved] = useState<{ mood: string; craving: number; note: string } | null>(null);
  const [checkinError, setCheckinError] = useState('');
  // With Supabase: verified counsellors from the database. On this device: the sample list.
  const [counsellors, setCounsellors] = useState<CounselorMatch[]>(isRemote ? [] : AFFORDABLE_COUNSELORS);
  const [counsellorsLoading, setCounsellorsLoading] = useState(isRemote);
  const [records, setRecords] = useState<ThoughtRecord[]>([]);
  const [circles, setCircles] = useState<Circle[]>(DEFAULT_CIRCLES);

  useEffect(() => {
    if (isRemote) {
      listCounsellors()
        .then(setCounsellors)
        .catch(() => setCounsellors([]))
        .finally(() => setCounsellorsLoading(false));
    }
    listThoughtRecords(profile.id || 'guest')
      .then(setRecords)
      .catch(() => setRecords([]));
    listCircles({ id: profile.id || 'guest', nickname: profile.nickname })
      .then(c => c.length && setCircles(c))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile.id]);

  const handleSaveCheckin = () => {
    setProfile(prev => ({
      ...prev,
      currentMood: mood || prev.currentMood,
      currentCraving: craving,
      completedCheckinsCount: (prev.completedCheckinsCount || 0) + 1,
    }));
    if (isRemote && profile.id) {
      setCheckinError('');
      recordCheckin(profile.id, mood || undefined, craving).catch(() => setCheckinError('Your check-in is shown here but could not be saved. Check your connection.'));
    }
    setSaved({ mood, craving, note: note.trim() });
    // a small celebration for showing up (not when someone is struggling)
    if (craving < 7 && mood !== 'struggling' && mood !== 'low') celebrateFrom(saveRef.current);
  };

  const scrollToCheckin = () => document.getElementById('checkin')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  useAction('checkin', scrollToCheckin); // from quick search (Ctrl/⌘ K)

  /* Derived display values */
  const firstName = (profile.nickname || profile.name || '').split(' ')[0] || 'friend';
  const streak = profile.sobrietyStreakDays || 0;
  const milestone = streak < 7 ? 7 : streak < 30 ? 30 : streak < 90 ? 90 : 365;
  const ringPct = Math.min(1, streak / milestone);
  // The ring draws in and the number counts up when Home opens
  const shownStreak = useCountUp(streak);
  const ringIn = useMounted();
  const aiName = profile.aiName || '4Life';
  const lastRecord = records[0];
  const nextCircle = [...circles].map(c => ({ c, t: circleTiming(c) })).sort((a, b) => a.t.start.getTime() - b.t.start.getTime())[0];

  const RING_R = 52;
  const RING_C = 2 * Math.PI * RING_R;

  return (
    <div className="flex flex-col gap-7 animate-fadeIn">
      {/* 1. Welcome: a calm banner, like the sign-in story panel */}
      <PageHero
        id="home-h"
        eyebrow={`Day ${streak} of your recovery`}
        title={
          <>
            {greetingFor()}, {firstName}
          </>
        }
        text="One day at a time — you are doing it, and you are not alone."
        actions={
          <>
            <button type="button" className={heroPrimary} onClick={scrollToCheckin}>
              Check in now
            </button>
            <button type="button" className={heroSecondary} onClick={() => onNavigate('chat')}>
              <MessageCircle className="h-5 w-5" aria-hidden="true" /> Talk to {aiName}
            </button>
          </>
        }
        aside={
          <div className="flex items-center gap-4">
            <div className="relative h-[104px] w-[104px] shrink-0 sm:h-[128px] sm:w-[128px]" role="img" aria-label={`${streak} days clean. ${milestone - streak} days to your ${milestone}-day badge.`}>
              <svg viewBox="0 0 120 120" className="h-full w-full" aria-hidden="true">
                <circle cx="60" cy="60" r={RING_R} fill="none" stroke="rgba(255,255,255,0.14)" strokeWidth="10" />
                <circle
                  cx="60"
                  cy="60"
                  r={RING_R}
                  fill="none"
                  stroke="#fbbf24"
                  strokeWidth="10"
                  strokeLinecap="round"
                  strokeDasharray={`${RING_C * (ringIn ? ringPct : 0)} ${RING_C}`}
                  transform="rotate(-90 60 60)"
                  className="transition-[stroke-dasharray] duration-1000"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-[2rem] font-extrabold leading-none tabular-nums sm:text-[2.375rem]">{shownStreak}</span>
                <span className="text-xs font-semibold text-[#a7f3d0] sm:text-sm">days clean</span>
              </div>
            </div>
            <p className="m-0 max-w-[10rem] text-[0.9375rem] leading-snug text-[#d1fae5] lg:hidden xl:block">
              <strong className="block text-[#fff]">Next milestone</strong>
              {milestone - streak} days to your {milestone}-day badge
            </p>
          </div>
        }
        art={<GrowIllustration />}
      />

      {/* Right now: one suggestion that fits the time of day */}
      {(() => {
        const h = new Date().getHours();
        const tip =
          h >= 17 && h < 23
            ? { text: 'Evenings are often the hardest time. Make a plan for tonight, or ride out a craving if one comes.', label: 'Plan tonight', icon: <Moon className="h-5 w-5" />, run: () => { onNavigate('chat'); requestAction('craving'); } }
            : h >= 23 || h < 5
              ? { text: 'Awake late? Slow breathing can quiet a busy mind and a strong urge.', label: 'Breathe for 2 minutes', icon: <Wind className="h-5 w-5" />, run: onOpenCalm }
              : h < 12
                ? { text: 'Good start: a quick check-in helps you see how today might go.', label: 'Check in', icon: <Sun className="h-5 w-5" />, run: scrollToCheckin }
                : nextCircle
                  ? { text: `Next group circle: ${nextCircle.c.title}, ${nextCircle.t.label.toLowerCase()}.`, label: 'See circles', icon: <Users className="h-5 w-5" />, run: () => { onNavigate('community'); requestAction('circles'); } }
                  : null;
        if (!tip) return null;
        return (
          <div className="-mt-2 flex flex-col gap-3 rounded-2xl border border-line bg-surface/80 px-4 py-3.5 backdrop-blur sm:flex-row sm:items-center sm:justify-between">
            <p className="m-0 flex items-start gap-2.5 text-[0.9375rem] text-ink-2">
              <span className="mt-0.5 shrink-0 text-pri-text" aria-hidden="true">{tip.icon}</span>
              <span>
                <strong className="text-ink">Right now: </strong>
                {tip.text}
              </span>
            </p>
            <Button size="sm" variant="soft" className="shrink-0 self-start sm:self-auto" onClick={tip.run}>
              {tip.label}
            </Button>
          </div>
        );
      })()}

      {/* 2. The three ways 4Life helps */}
      <section aria-labelledby="support-h" className="flex flex-col gap-4">
        <h2 id="support-h" className="m-0 text-xl font-bold text-ink sm:text-[1.375rem]">
          Your support
        </h2>
        <div className="grid gap-4 md:grid-cols-3">
          <Card as="article" className="lift flex flex-col gap-3">
            <div className="-mx-1 -mt-1 hidden h-28 rounded-xl bg-gradient-to-br md:block from-[#064e3b] to-[#022c22] p-1" aria-hidden="true">
              <GrowIllustration />
            </div>
            <div className="flex items-center gap-3">
              <IconBadge tone="pri">
                <MessageCircle className="h-5 w-5" />
              </IconBadge>
              <h3 className="m-0 text-lg font-bold text-ink">AI CBT therapy</h3>
            </div>
            <p className="m-0 text-[0.9375rem] leading-relaxed text-ink-2">Ride out a craving step by step, or test a thought that keeps pulling you back. Any time, day or night.</p>
            <p className="m-0 rounded-xl bg-bg px-3.5 py-2.5 text-sm text-ink-2">
              {lastRecord ? (
                <>
                  Last thought record: <strong className="text-ink">{lastRecord.emotion || 'feeling'} {lastRecord.intensityBefore} → {lastRecord.intensityAfter}</strong> · {trapLabel(lastRecord.trap)}
                </>
              ) : (
                'No thought records yet. Try one — it takes about five minutes.'
              )}
            </p>
            <div className="mt-auto flex flex-wrap gap-2 pt-1">
              <Button onClick={() => onNavigate('chat')} icon={<Waves className="h-5 w-5" />}>
                Talk to {aiName}
              </Button>
            </div>
          </Card>

          <Card as="article" className="lift flex flex-col gap-3">
            <div className="-mx-1 -mt-1 hidden h-28 rounded-xl bg-gradient-to-br md:block from-[#064e3b] to-[#022c22] p-1" aria-hidden="true">
              <VillageIllustration />
            </div>
            <div className="flex items-center gap-3">
              <IconBadge tone="info">
                <Users className="h-5 w-5" />
              </IconBadge>
              <h3 className="m-0 text-lg font-bold text-ink">Global Village</h3>
            </div>
            <p className="m-0 text-[0.9375rem] leading-relaxed text-ink-2">Read and share stories anonymously with people who get it, and join a weekly group circle.</p>
            {nextCircle && (
              <p className="m-0 rounded-xl bg-bg px-3.5 py-2.5 text-sm text-ink-2">
                {nextCircle.t.live ? 'Live now: ' : 'Next circle: '}
                <strong className="text-ink">{nextCircle.c.title}</strong> · {nextCircle.t.live ? nextCircle.t.label.replace('Live now · ', '') : nextCircle.t.label}
              </p>
            )}
            <div className="mt-auto flex flex-wrap gap-2 pt-1">
              <Button variant="secondary" onClick={() => onNavigate('community')} icon={<ArrowRight className="h-5 w-5" />}>
                Open the Village
              </Button>
            </div>
          </Card>

          <Card as="article" tone="danger" className="lift flex flex-col gap-3">
            <div className="-mx-1 -mt-1 hidden h-28 rounded-xl bg-gradient-to-br md:block from-[#064e3b] to-[#022c22] p-1" aria-hidden="true">
              <HelpIllustration />
            </div>
            <div className="flex items-center gap-3">
              <IconBadge tone="danger">
                <Siren className="h-5 w-5" />
              </IconBadge>
              <h3 className="m-0 text-lg font-bold text-ink">Instant EMS</h3>
            </div>
            <p className="m-0 text-[0.9375rem] leading-relaxed text-ink-2">Call 112 in one tap, text your location to your support person, and find the nearest hospital.</p>
            <div className="mt-auto flex flex-wrap gap-2 pt-1">
              <ButtonLink href="tel:112" variant="danger" icon={<Phone className="h-5 w-5" />}>
                Call 112
              </ButtonLink>
              <Button variant="secondary" onClick={() => onNavigate('emergency_map')}>
                Open EMS
              </Button>
            </div>
          </Card>
        </div>
      </section>

      {/* 3. Check-in */}
      <Card as="section" raised id="checkin" aria-labelledby="checkin-h" className="flex scroll-mt-24 flex-col gap-6">
        <SectionHeader
          id="checkin-h"
          title="How are you right now?"
          subtitle={`A quick check-in takes under a minute. It points you to the right kind of help${isRemote ? ', and your counsellor sees it if you share check-ins' : ''}.`}
        />

        <div className="flex flex-col gap-3">
          <p className="m-0 text-base font-bold text-ink" id="mood-label">
            Your mood
          </p>
          <MoodFaces value={mood} onChange={setMood} labelledBy="mood-label" />
        </div>

        <div className="flex flex-col gap-2.5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <label htmlFor="craving" className="text-base font-bold text-ink">
              How strong is your craving?
            </label>
            <span className="text-base font-bold text-pri-text" aria-live="polite">
              {craving} of 10 · {CRAVING_WORDS[craving]}
            </span>
          </div>
          <input id="craving" type="range" min={1} max={10} value={craving} onChange={e => setCraving(Number(e.target.value))} className="h-7 w-full cursor-pointer" />
          <div className="flex justify-between text-sm text-ink-3">
            <span>1 · No urge</span>
            <span>10 · Overwhelming</span>
          </div>
        </div>

        <div className="flex flex-col gap-2.5">
          <label htmlFor="checkin-note" className="text-base font-bold text-ink">
            What is on your mind? <span className="font-medium text-ink-3">(optional)</span>
          </label>
          <textarea
            id="checkin-note"
            rows={3}
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder="For example: I feel lonely tonight, or: I worked hard so one drink won't hurt…"
            className={textareaClass}
          />
        </div>

        {checkinError && <Notice tone="warn">{checkinError}</Notice>}

        {/* After saving: point to the help that fits */}
        {saved &&
          (saved.craving >= 7 ? (
            <Notice tone="warn" icon={<Waves className="h-5 w-5" />}>
              <p className="m-0 font-bold">Saved. That’s a strong craving — let’s ride it out now.</p>
              <p className="m-0 mt-0.5">Urges peak and pass, usually within 20 to 30 minutes if you don’t act on them.</p>
              <div className="mt-2.5 flex flex-wrap gap-2">
                <Button size="sm" onClick={() => onNavigate('chat')}>
                  Ride it out with {aiName}
                </Button>
                <Button size="sm" variant="secondary" onClick={onOpenCalm} icon={<Wind className="h-4 w-4" />}>
                  Breathe first
                </Button>
                <Button size="sm" variant="ghost" onClick={onOpenSos}>
                  I need a person
                </Button>
              </div>
            </Notice>
          ) : saved.mood === 'struggling' || saved.mood === 'low' ? (
            <Notice icon={<Check className="h-5 w-5" />}>
              <p className="m-0 font-bold">Saved. Thank you for being honest about a hard day.</p>
              <div className="mt-2.5 flex flex-wrap gap-2">
                <Button size="sm" onClick={() => onNavigate('chat')}>
                  Talk it through
                </Button>
                <Button size="sm" variant="secondary" onClick={() => onNavigate('community')}>
                  Read the Village
                </Button>
              </div>
            </Notice>
          ) : (
            <Notice icon={<Check className="h-5 w-5" />}>
              <p className="m-0 font-bold">Check-in saved. Well done for showing up today.</p>
              {saved.note && (
                <Button variant="link" onClick={() => onNavigate('chat')} icon={<NotebookPen className="h-4 w-4" />}>
                  Work through that thought with {aiName}
                </Button>
              )}
            </Notice>
          ))}

        <div className="flex justify-end">
          <Button ref={saveRef as any} size="lg" onClick={handleSaveCheckin}>
            Save check-in
          </Button>
        </div>
      </Card>

      {/* 4. Counselors */}
      <section aria-labelledby="couns-h" className="flex flex-col gap-5">
        <SectionHeader id="couns-h" title="Talk to a counselor" subtitle="Trained professionals in Ghana. Subsidised sessions from GHS 15." />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {counsellorsLoading && <RibbonLoader text="Loading counsellors…" />}
          {!counsellorsLoading && counsellors.length === 0 && (
            <p className="m-0 text-[0.9375rem] text-ink-2 sm:col-span-2">No counsellors are available to book right now. In an emergency, press SOS or call 112.</p>
          )}
          {counsellors.map(c => (
            <Card as="article" key={c.id} padded={false} className="flex flex-col gap-3.5 p-5">
              <div className="flex items-center gap-3">
                <Avatar src={c.avatar} name={c.name} size={52} />
                <div className="min-w-0">
                  <h3 className="m-0 text-base font-bold leading-snug text-ink">{c.name}</h3>
                  <p className="m-0 text-sm text-ink-3">{c.title}</p>
                </div>
              </div>
              <p className="m-0 text-[0.9375rem] leading-relaxed text-ink-2">
                {c.specialty} · {c.location}
              </p>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                <span className={cx('inline-flex items-center gap-1.5 font-semibold', c.availableNow ? 'text-pri-text' : 'text-ink-3')}>
                  <span className={cx('h-2 w-2 rounded-full', c.availableNow ? 'bg-pri' : 'bg-ink-3')} aria-hidden="true" />
                  {c.availableNow ? 'Available now' : 'Not available today'}
                </span>
                <span className="inline-flex items-center gap-1 text-ink-2">
                  <Star className="h-4 w-4 text-warn" aria-hidden="true" /> {c.rating > 0 ? c.rating : 'New'}
                </span>
              </div>
              <div className="mt-auto flex items-center justify-between gap-2 border-t border-line pt-3.5">
                <p className="m-0 leading-tight">
                  <span className="block text-lg font-extrabold text-ink">GHS {c.feeGHS}</span>
                  <span className="block text-sm text-ink-3">per session</span>
                </p>
                <Button variant={c.availableNow ? 'primary' : 'secondary'} onClick={() => onOpenCounselor(c)}>
                  {c.availableNow ? 'Book' : 'Book later'}
                </Button>
              </div>
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
};
