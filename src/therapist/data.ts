/**
 * Therapist data: option lists, the demo therapist, seed data and local storage helpers.
 * Everything is stored on this device (localStorage), like the rest of the prototype.
 */
import type {
  ClientRecord,
  SosEvent,
  Profession,
  SessionFormat,
  SessionRequest,
  TherapistData,
  TherapistProfile,
  TherapySession,
  Weekday,
} from './types';

/* ---------- Option lists ---------- */

export const PROFESSIONS: Profession[] = [
  'Clinical psychologist',
  'Counselling psychologist',
  'Psychiatrist',
  'Addiction counsellor',
  'Mental health nurse',
  'Social worker',
];

export const LICENSE_BODIES = [
  'Ghana Psychological Council',
  'Medical and Dental Council (Ghana)',
  'Nursing and Midwifery Council (Ghana)',
  'Ghana Association of Certified Counsellors',
  'Other / outside Ghana',
];

export const FOCUS_OPTIONS = [
  { id: 'substance', label: 'Drugs and alcohol' },
  { id: 'porn', label: 'Adult content' },
  { id: 'social_media', label: 'Screens and gaming' },
  { id: 'anger', label: 'Anger and stress' },
  { id: 'overeating', label: 'Food and eating' },
  { id: 'general', label: 'General wellbeing' },
];

export const focusLabel = (id: string) => FOCUS_OPTIONS.find(f => f.id === id)?.label || 'General wellbeing';

export const APPROACHES = [
  'CBT',
  'Motivational interviewing',
  'Relapse prevention',
  'Mindfulness-based',
  'DBT skills',
  'Family therapy',
  'Faith-integrated',
  'Trauma-informed',
];

export const LANGUAGES = ['English', 'Twi', 'Fante', 'Ga', 'Ewe', 'Hausa', 'Dagbani', 'French'];

export const FORMAT_LABEL: Record<SessionFormat, string> = {
  video: 'Video call',
  voice: 'Voice call',
  in_person: 'In person',
  chat: 'Text chat',
};

export const WEEKDAYS: Weekday[] = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export const SESSION_TYPE_LABEL = {
  intake: 'First session',
  follow_up: 'Follow-up',
  crisis: 'Crisis check-in',
  review: 'Progress review',
} as const;

/** The parts of a session, in order. Used for the in-session checklist. */
export const SESSION_AGENDA = [
  'Check in on mood and cravings',
  'Review last homework',
  'Agree on today’s main topic',
  'Work on the topic / practise a skill',
  'Safety and risk check',
  'Set homework and next steps',
];

/* ---------- Dates ---------- */

const pad = (n: number) => String(n).padStart(2, '0');

/** ISO string for `days` from today at hh:mm local time. */
export const at = (days: number, hh: number, mm = 0) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(hh, mm, 0, 0);
  return d.toISOString();
};

/** ISO string `hours` from now, rounded to the half hour. Keeps the demo day sensible at any time. */
export const rel = (hours: number) => {
  const d = new Date(Date.now() + hours * 3600000);
  d.setMinutes(d.getMinutes() < 30 ? 0 : 30, 0, 0);
  return d.toISOString();
};

/** ISO string `mins` minutes ago (not rounded). */
export const minsAgo = (mins: number) => new Date(Date.now() - mins * 60000).toISOString();

export const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

export const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

export const fmtDay = (iso: string) => {
  const d = new Date(iso);
  const today = new Date();
  const tomorrow = new Date();
  tomorrow.setDate(today.getDate() + 1);
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (sameDay(d, today)) return 'Today';
  if (sameDay(d, tomorrow)) return 'Tomorrow';
  if (sameDay(d, yesterday)) return 'Yesterday';
  return d.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' });
};

/** For use inside a sentence: "today", "yesterday" or "on Mon 28 Sep". */
export const fmtDayInline = (iso: string) => {
  const d = fmtDay(iso);
  return ['Today', 'Tomorrow', 'Yesterday'].includes(d) ? d.toLowerCase() : `on ${d}`;
};

export const fmtDateLong = (iso: string) => new Date(iso).toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' });

export const ago = (iso: string) => {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 60) return `${Math.max(1, mins)} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} h ago`;
  const days = Math.round(hrs / 24);
  return days === 1 ? 'yesterday' : `${days} days ago`;
};

export const toLocalInput = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export const greeting = () => {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
};

export const displayName = (t: Pick<TherapistProfile, 'title' | 'name'>) => (t.title ? `${t.title} ${t.name}` : t.name);

/* ---------- Demo therapist ---------- */

/** The demo therapist uses id "c1" so bookings made with Dr. Ama Konadu in the client app reach her. */
export const DEMO_THERAPIST: TherapistProfile = {
  id: 'c1',
  email: 'ama@4life.org',
  pin: '1234',
  title: 'Dr.',
  name: 'Ama Konadu',
  profession: 'Clinical psychologist',
  licenseBody: 'Ghana Psychological Council',
  licenseNumber: 'GPC-CP-0412',
  yearsExperience: 12,
  verification: 'verified',
  specialties: ['substance', 'social_media', 'anger'],
  approaches: ['CBT', 'Motivational interviewing', 'Relapse prevention', 'Faith-integrated'],
  languages: ['English', 'Twi'],
  formats: ['video', 'voice', 'in_person'],
  region: 'Greater Accra',
  practiceLocation: 'East Legon, Accra',
  days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
  startTime: '09:00',
  endTime: '17:00',
  sessionLength: 50,
  feeGHS: 35,
  slidingScale: true,
  acceptingClients: true,
  bio: 'I help young adults step away from alcohol, drugs and compulsive habits using CBT and motivational interviewing, with room for faith where it helps.',
  createdAt: '2026-01-04',
};

/* ---------- Seed data ---------- */

const series = (values: Array<number | null>) => values;

function seedClients(): ClientRecord[] {
  return [
    {
      id: 'cl_kwame',
      nickname: 'SoberWarrior_GH',
      age: 19,
      focus: 'substance',
      streakDays: 12,
      risk: 'moderate',
      mood: series([2, 3, 3, 2, 3, 3, 4, 3, 3, 4, 4, 3, 4, 4]),
      craving: series([7, 6, 6, 7, 5, 5, 4, 5, 4, 4, 3, 4, 3, 3]),
      lastCheckin: rel(-6),
      goals: ['Stay alcohol-free at weekend gatherings', 'Sleep before midnight on weekdays', 'Rebuild trust with family'],
      homework: [
        { id: 'hw1', text: 'Fill in a thought record when a craving is above 6', done: true, setOn: at(-7, 14) },
        { id: 'hw2', text: 'Plan two alcohol-free activities for Saturday', done: false, setOn: at(-7, 14) },
      ],
      safetyPlan: {
        warningSigns: 'Isolating after arguments at home; passing the drinking spot on the way from lectures.',
        copingSteps: 'Leave the situation, 4-7-8 breathing, call Sister Mary, go to the hostel gym.',
        supportPeople: 'Sister Mary (sister) · Mentor Kofi (peer mentor)',
        updatedAt: at(-14, 14),
      },
      sharesCheckins: true,
      locationConsent: true,
      lastLocation: { lat: 5.6505, lng: -0.187, area: 'Legon, Accra', at: minsAgo(26 * 60), accuracyM: 60, source: 'checkin' },
      status: 'active',
      startedAt: at(-42, 10),
    },
    {
      id: 'cl_akosua',
      nickname: 'Akosua_Rising',
      age: 22,
      focus: 'social_media',
      streakDays: 28,
      risk: 'low',
      mood: series([3, 3, 4, 4, 3, 4, 4, 4, 5, 4, 4, 5, 4, 5]),
      craving: series([5, 4, 4, 3, 4, 3, 3, 2, 3, 2, 2, 2, 2, 1]),
      lastCheckin: rel(-7),
      goals: ['Under 1 hour of short videos a day', 'Phone out of the bedroom at night'],
      homework: [{ id: 'hw3', text: 'Keep the phone charging in the kitchen overnight', done: true, setOn: rel(-5) }],
      safetyPlan: { warningSigns: 'Late-night scrolling after stressful days.', copingSteps: 'Evening walk, journaling, call a friend.', supportPeople: 'Room-mate Abena' },
      sharesCheckins: true,
      locationConsent: true,
      status: 'active',
      startedAt: at(-60, 10),
    },
    {
      id: 'cl_river',
      nickname: 'QuietRiver',
      age: 27,
      focus: 'anger',
      streakDays: 5,
      risk: 'moderate',
      mood: series([3, 2, 2, 3, null, 2, 3, 3, 2, 3, 3, null, 3, 3]),
      craving: series([6, 7, 7, 5, null, 6, 5, 5, 6, 5, 4, null, 4, 5]),
      lastCheckin: at(-1, 21, 5),
      goals: ['Notice early body signs of anger', 'Use time-out instead of shouting at work'],
      homework: [{ id: 'hw4', text: 'Anger log: trigger, body signs, what I did', done: false, setOn: rel(-3) }],
      safetyPlan: { warningSigns: 'Clenched jaw, raised voice in traffic.', copingSteps: 'Step away for 10 minutes, cold water, slow breathing.', supportPeople: 'Brother Yaw' },
      sharesCheckins: true,
      locationConsent: true,
      lastLocation: { lat: 5.556, lng: -0.182, area: 'Osu, Accra', at: minsAgo(20 * 60), accuracyM: 80, source: 'checkin' },
      status: 'active',
      startedAt: at(-21, 11),
    },
    {
      id: 'cl_owl',
      nickname: 'NightOwl_Kumasi',
      age: 20,
      focus: 'porn',
      streakDays: 3,
      risk: 'high',
      mood: series([3, 3, 2, 3, 2, 2, 2, 1, 2, null, null, 2, 1, 2]),
      craving: series([5, 5, 6, 6, 7, 7, 8, 8, 7, null, null, 8, 9, 8]),
      lastCheckin: at(-1, 23, 40),
      goals: ['Bedtime phone lock at 22:30', 'Reach out instead of hiding after a slip'],
      homework: [{ id: 'hw5', text: 'Write down three things that help after a slip', done: false, setOn: at(-6, 16) }],
      safetyPlan: { warningSigns: 'Very low mood, saying he is “useless”, staying awake late.', copingSteps: 'Leave the room, call mentor, use the SOS button.', supportPeople: 'Mentor Kojo' },
      sharesCheckins: true,
      locationConsent: true,
      lastLocation: { lat: 6.6745, lng: -1.565, area: 'Ayeduase, Kumasi', at: minsAgo(18), accuracyM: 25, source: 'sos' },
      escalations: [
        { id: 'e1', at: minsAgo(18), action: 'Pressed SOS in the app and shared location' },
        { id: 'e2', at: minsAgo(17), action: 'App alerted support person (Mentor Kojo)' },
      ],
      status: 'active',
      startedAt: at(-30, 16),
    },
    {
      id: 'cl_yaw',
      nickname: 'Yaw_Steady',
      age: 31,
      focus: 'substance',
      streakDays: 64,
      risk: 'low',
      mood: series([4, 4, 4, 5, 4, 4, 4, 5, 4, 4, 5, 4, 4, 4]),
      craving: series([2, 2, 1, 2, 2, 1, 1, 2, 1, 1, 1, 1, 2, 1]),
      lastCheckin: at(-2, 19),
      goals: ['Keep weekly gym routine', 'Mentor a newcomer in the Village'],
      homework: [],
      safetyPlan: { warningSigns: 'Money stress at month end.', copingSteps: 'Budget check-in with wife, church men’s group.', supportPeople: 'Wife Adwoa' },
      sharesCheckins: true,
      locationConsent: false,
      status: 'active',
      startedAt: at(-120, 10),
    },
    {
      id: 'cl_esi',
      nickname: 'Esi_Grace',
      age: 24,
      focus: 'overeating',
      streakDays: 9,
      risk: 'low',
      mood: series(new Array(14).fill(null)),
      craving: series(new Array(14).fill(null)),
      lastCheckin: at(-3, 18),
      goals: ['Regular meals, three times a day', 'Name the feeling before eating'],
      homework: [],
      safetyPlan: { warningSigns: '', copingSteps: '', supportPeople: '' },
      sharesCheckins: false,
      locationConsent: false,
      status: 'active',
      startedAt: at(-10, 10),
    },
  ];
}

const note = (data: string, assessment: string, plan: string, mood: number, risk: 'low' | 'moderate' | 'high', homework?: string) => ({
  data,
  assessment,
  plan,
  moodRating: mood,
  riskLevel: risk,
  homework,
  agendaDone: [],
  signedAt: new Date().toISOString(),
});

function seedSessions(): TherapySession[] {
  return [
    // Past
    {
      id: 's_k1', clientId: 'cl_kwame', start: at(-14, 14), durationMin: 50, format: 'video', type: 'follow_up', status: 'completed', topic: 'Weekend triggers',
      note: note('Reported two cravings at a funeral gathering; left early both times.', 'Good use of leaving the situation. Still thinks “one drink is fine at family events”.', 'Plan for weekend events; challenge permission-giving thoughts.', 3, 'moderate', 'Thought record for cravings above 6'),
    },
    {
      id: 's_k2', clientId: 'cl_kwame', start: at(-7, 14), durationMin: 50, format: 'video', type: 'follow_up', status: 'completed', topic: 'Thought records',
      note: note('Completed 3 thought records. Sleep improving.', 'Building insight into the link between conflict at home and cravings.', 'Plan Saturday activities; keep thought records.', 3, 'moderate', 'Plan two alcohol-free activities for Saturday'),
    },
    {
      id: 's_o1', clientId: 'cl_owl', start: at(-6, 16), durationMin: 50, format: 'voice', type: 'follow_up', status: 'completed', topic: 'After a slip',
      note: note('Slip on Sunday night. Strong shame, says he is “useless”.', 'Shame cycle driving more isolation. No intent to harm self when asked directly.', 'Self-compassion work; bedtime phone lock; check in mid-week.', 2, 'moderate', 'Write three things that help after a slip'),
    },
    { id: 's_y1', clientId: 'cl_yaw', start: at(-9, 10), durationMin: 50, format: 'in_person', type: 'review', status: 'completed', topic: '60-day review',
      note: note('60 days alcohol-free. Gym 3x a week.', 'Stable. Protective factors strong.', 'Move to every two weeks.', 4, 'low') },
    // Today
    {
      id: 's_a1', clientId: 'cl_akosua', start: rel(-5), durationMin: 50, format: 'video', type: 'follow_up', status: 'completed', topic: 'Night-time scrolling',
      note: note('28 days within her screen-time goal. One late night after exam stress.', 'Doing well; stress is the main trigger.', 'Keep the phone out of the bedroom; exam-stress plan.', 4, 'low', 'Keep the phone charging in the kitchen overnight'),
    },
    { id: 's_r1', clientId: 'cl_river', start: rel(-3), durationMin: 50, format: 'voice', type: 'follow_up', status: 'completed', topic: 'Anger at work' },
    { id: 's_k3', clientId: 'cl_kwame', start: rel(0.75), durationMin: 50, format: 'video', type: 'follow_up', status: 'scheduled', topic: 'How the weekend went' },
    { id: 's_o2', clientId: 'cl_owl', start: rel(2.5), durationMin: 50, format: 'voice', type: 'review', status: 'scheduled', topic: 'Cravings rising this week' },
    // Coming up
    { id: 's_e1', clientId: 'cl_esi', start: at(1, 10), durationMin: 50, format: 'video', type: 'follow_up', status: 'scheduled', topic: 'Regular meals' },
    { id: 's_r2', clientId: 'cl_river', start: at(2, 15), durationMin: 50, format: 'voice', type: 'follow_up', status: 'scheduled' },
    { id: 's_y2', clientId: 'cl_yaw', start: at(5, 10), durationMin: 50, format: 'in_person', type: 'follow_up', status: 'scheduled' },
  ];
}

function seedRequests(therapistId: string, example = false): SessionRequest[] {
  if (example) {
    return [
      {
        id: 'rq_example',
        therapistId,
        clientNickname: 'Example: Kojo_NewStart',
        focus: 'substance',
        preferredTime: at(2, 10),
        preferredLabel: '',
        format: 'voice',
        message: 'This is an example request so you can see how requests work. Accept it to add an example client.',
        sharesCheckins: false,
        createdAt: rel(-1),
        status: 'new',
      },
    ];
  }
  return [
    {
      id: 'rq_1',
      therapistId,
      clientNickname: 'Abena_Hope',
      focus: 'substance',
      preferredTime: at(1, 15),
      preferredLabel: '',
      format: 'voice',
      message: 'I have been trying to stop drinking on my own for two months. I would like help planning for weekends.',
      sharesCheckins: true,
      createdAt: rel(-4),
      status: 'new',
      snapshot: { streakDays: 6, mood: [2, 3, 3, 2, 3, 3, 3], craving: [7, 6, 6, 6, 5, 6, 5] },
    },
    {
      id: 'rq_2',
      therapistId,
      clientNickname: 'Kweku_T',
      focus: 'anger',
      preferredTime: at(3, 11),
      preferredLabel: '',
      format: 'video',
      message: 'My temper is causing problems at home. My wife suggested I talk to someone.',
      sharesCheckins: false,
      createdAt: at(-1, 18, 30),
      status: 'new',
    },
  ];
}

export function seedData(therapist: TherapistProfile): TherapistData {
  const isDemo = therapist.id === DEMO_THERAPIST.id;
  return {
    clients: isDemo ? seedClients() : [],
    sessions: isDemo ? seedSessions() : [],
    requests: seedRequests(therapist.id, !isDemo),
    handledShared: [],
  };
}

/* ---------- Storage ---------- */

const ACCOUNTS_KEY = '4life_therapist_accounts';
const SHARED_REQUESTS_KEY = '4life_session_requests';
export const SOS_EVENTS_KEY = '4life_sos_events';
const dataKey = (id: string) => `4life_therapist_data_v2_${id}`;

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
  } catch {}
};

export const getTherapistAccounts = (): TherapistProfile[] => {
  const saved = readJSON<TherapistProfile[]>(ACCOUNTS_KEY, []);
  return saved.some(a => a.id === DEMO_THERAPIST.id) ? saved : [DEMO_THERAPIST, ...saved];
};

export const saveTherapistAccount = (t: TherapistProfile) => {
  const list = readJSON<TherapistProfile[]>(ACCOUNTS_KEY, []).filter(a => a.id !== t.id);
  writeJSON(ACCOUNTS_KEY, [...list, t]);
};

/** Therapists who signed up on this device and accept new clients — shown to people in recovery. */
export const getListedTherapists = (): TherapistProfile[] =>
  readJSON<TherapistProfile[]>(ACCOUNTS_KEY, []).filter(a => a.id !== DEMO_THERAPIST.id && a.acceptingClients);

export const loadTherapistData = (therapist: TherapistProfile): TherapistData => {
  const stored = readJSON<(TherapistData & { seededOn?: string }) | null>(dataKey(therapist.id), null);
  const today = new Date().toDateString();
  // The demo account is re-seeded each day so its schedule always looks current
  if (!stored || (therapist.id === DEMO_THERAPIST.id && stored.seededOn !== today)) {
    const fresh = { ...seedData(therapist), seededOn: today };
    writeJSON(dataKey(therapist.id), fresh);
    return fresh;
  }
  return stored;
};

export const saveTherapistData = (therapist: TherapistProfile, data: TherapistData) =>
  writeJSON(dataKey(therapist.id), { ...data, seededOn: new Date().toDateString() });

/** Requests made from the client app (Book a counselor) addressed to this therapist. */
export const getSharedRequests = (therapistId: string): SessionRequest[] =>
  readJSON<SessionRequest[]>(SHARED_REQUESTS_KEY, []).filter(r => r.therapistId === therapistId);

export const addSharedRequest = (r: SessionRequest) => {
  const list = readJSON<SessionRequest[]>(SHARED_REQUESTS_KEY, []);
  writeJSON(SHARED_REQUESTS_KEY, [...list, r]);
};

/* ---------- SOS events from the client app ---------- */

/** SOS alerts from the last 24 hours. */
export const getSosEvents = (): SosEvent[] =>
  readJSON<SosEvent[]>(SOS_EVENTS_KEY, []).filter(e => Date.now() - new Date(e.at).getTime() < 24 * 3600000);

export const addSosEvent = (e: SosEvent) => writeJSON(SOS_EVENTS_KEY, [...getSosEvents(), e]);

/* ---------- Distances to emergency services ---------- */

/** Straight-line distance in km between two points. */
export const distanceKm = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};

/** A rough drive time: roads are ~30% longer than a straight line, average 35 km/h in towns. */
export const roughDriveMins = (km: number) => Math.max(3, Math.round(((km * 1.3) / 35) * 60));
