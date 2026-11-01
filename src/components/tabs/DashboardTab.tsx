import React, { useEffect, useRef, useState } from 'react';
import { UserProfile, CounselorMatch, ActiveTab, TriageCategory } from '../../types';
import { AFFORDABLE_COUNSELORS } from '../../data/counselors';
import { isRemote } from '../../lib/supabase';
import { listCounsellors, recordCheckin } from '../../lib/db/clientApi';
import { listThoughtRecords } from '../../lib/cbtStore';
import { trapLabel, type ThoughtRecord } from '../../lib/cbt';
import { DEFAULT_CIRCLES, circleTiming, listCircles, type Circle } from '../../lib/village';
import { Card, SectionHeader, Button, ButtonLink, Avatar, Notice, IconBadge, textareaClass, cx } from '../ui';
import { PageHero, heroSecondary } from '../PageHero';
import { MoodFaces } from '../MoodFaces';
import { celebrateFrom } from '../LivingBackground';
import { GrowIllustration } from '../auth/AuthIllustrations';
import { MessageCircle, ArrowRight, Check, Star, Wind, Users, Siren, Phone, Waves, NotebookPen } from 'lucide-react';
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
  const [showAllCounsellors, setShowAllCounsellors] = useState(false);

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
  // Past the last badge there is nothing left to count down to
  const daysLeft = milestone - streak;
  const milestoneText = daysLeft > 0 ? `${daysLeft} ${daysLeft === 1 ? 'day' : 'days'} to your ${milestone}-day badge` : `You have reached your ${milestone}-day badge`;
  const daysCleanLabel = streak === 1 ? 'day clean' : 'days clean';
  // Bookable people first, so the short list on Home shows someone you can see today
  const sortedCounsellors = [...counsellors].sort((a, b) => Number(b.availableNow) - Number(a.availableNow));
  const fees = counsellors.map(c => c.feeGHS).filter(fee => fee > 0);
  const lowestFee = fees.length ? Math.min(...fees) : null;

  const RING_R = 52;
  const RING_C = 2 * Math.PI * RING_R;

  return (
    <div className="flex flex-col gap-7 animate-fadeIn">
      {/* 1. Welcome: a calm banner, like the sign-in story panel */}
      <PageHero
        id="home-h"
        title={
          <>
            {greetingFor()}, {firstName}
          </>
        }
        text="One day at a time — you are doing it, and you are not alone."
        actions={
          <button type="button" className={heroSecondary} onClick={() => onNavigate('chat')}>
            <MessageCircle className="h-5 w-5" aria-hidden="true" /> Talk to {aiName}
          </button>
        }
        aside={
          <div className="flex items-center gap-4">
            <div className="relative h-[104px] w-[104px] shrink-0 sm:h-[128px] sm:w-[128px]" role="img" aria-label={`${streak} ${daysCleanLabel}. ${milestoneText}.`}>
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
                <span className="text-xs font-semibold text-[#a7f3d0] sm:text-sm">{daysCleanLabel}</span>
              </div>
            </div>
            <p className="m-0 max-w-[10rem] text-[0.9375rem] leading-snug text-[#d1fae5] lg:hidden xl:block">
              {daysLeft > 0 && <strong className="block text-[#fff]">Next milestone</strong>}
              {milestoneText}
            </p>
          </div>
        }
        art={<GrowIllustration />}
      />

      {/* 2. Check-in: the one primary action on Home */}
      <Card as="section" raised id="checkin" aria-labelledby="checkin-h" className="flex scroll-mt-24 flex-col gap-5">
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
            rows={2}
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
          <Button ref={saveRef as any} size="lg" block className="sm:w-auto" onClick={handleSaveCheckin}>
            Save check-in
          </Button>
        </div>
      </Card>

      {/* 3. The three ways 4Life helps: one action per card */}
      <section aria-labelledby="support-h" className="flex flex-col gap-4">
        <SectionHeader id="support-h" title="Your support" />
        <div className="grid gap-4 md:grid-cols-3">
          <Card as="article" className="flex flex-col gap-3">
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
            <div className="mt-auto pt-1">
              <Button
                variant="secondary"
                onClick={() => {
                  onNavigate('chat');
                  requestAction('craving');
                }}
                // the three cards are narrow from md to xl: drop the icon so the label stays on one line
                icon={<Waves className="h-5 w-5 md:max-xl:hidden" />}
              >
                Ride out a craving
              </Button>
            </div>
          </Card>

          <Card as="article" className="flex flex-col gap-3">
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
            <div className="mt-auto pt-1">
              <Button variant="secondary" onClick={() => onNavigate('community')} icon={<ArrowRight className="h-5 w-5 md:max-xl:hidden" />}>
                Open the Village
              </Button>
            </div>
          </Card>

          <Card as="article" tone="danger" className="flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <IconBadge tone="danger">
                <Siren className="h-5 w-5" />
              </IconBadge>
              <h3 className="m-0 text-lg font-bold text-ink">Instant EMS</h3>
            </div>
            <p className="m-0 text-[0.9375rem] leading-relaxed text-ink-2">Call 112 in one tap. Instant EMS in the menu can text your location and find the nearest hospital.</p>
            <div className="mt-auto pt-1">
              <ButtonLink href="tel:112" variant="danger" icon={<Phone className="h-5 w-5" />}>
                Call 112
              </ButtonLink>
            </div>
          </Card>
        </div>
      </section>

      {/* 4. Counsellors: a short list (2 cards, 3 from xl up) with a toggle for the rest */}
      <section aria-labelledby="couns-h" className="flex flex-col gap-4">
        <SectionHeader
          id="couns-h"
          title="Talk to a counsellor"
          subtitle={`Trained professionals in Ghana.${lowestFee !== null ? ` Subsidised sessions from GHS ${lowestFee}.` : ''}`}
          action={
            counsellors.length > 2 && (
              <Button
                variant="link"
                aria-expanded={showAllCounsellors}
                aria-controls="counsellor-list"
                // exactly 3 people all fit from xl up, so there is nothing more to see there
                className={counsellors.length === 3 ? 'xl:hidden' : undefined}
                onClick={() => setShowAllCounsellors(open => !open)}
              >
                {showAllCounsellors ? 'Show fewer' : `See all ${counsellors.length}`}
              </Button>
            )
          }
        />
        <div id="counsellor-list" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {counsellorsLoading && <RibbonLoader text="Loading counsellors…" className="col-span-full" />}
          {!counsellorsLoading && counsellors.length === 0 && (
            <p className="col-span-full m-0 text-[0.9375rem] text-ink-2">No counsellors are available to book right now. In an emergency, press SOS or call 112.</p>
          )}
          {sortedCounsellors.map((c, i) => (
            <Card
              as="article"
              key={c.id}
              padded={false}
              className={cx('flex-col gap-3.5 p-5', showAllCounsellors || i < 2 ? 'flex' : i === 2 ? 'hidden xl:flex' : 'hidden')}
            >
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
                <Button variant={c.availableNow ? 'soft' : 'secondary'} onClick={() => onOpenCounselor(c)}>
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
