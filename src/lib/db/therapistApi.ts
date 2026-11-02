/**
 * Everything the therapist workspace reads and writes in Supabase.
 * Only used when isRemote is true. Row Level Security decides what comes back:
 * a therapist only ever receives their own linked clients' shared data.
 */
import { db } from '../supabase';
import type { ThoughtRecord } from '../cbt';
import type {
  ClientLocation,
  ClientRecord,
  EscalationEntry,
  HomeworkItem,
  SessionNote,
  SessionRequest,
  TherapistData,
  TherapistProfile,
  TherapySession,
} from '../../therapist/types';

/* ---------- Therapist profile ---------- */

export async function signUpTherapist(email: string, password: string, t: Omit<TherapistProfile, 'id' | 'email' | 'pin' | 'verification' | 'createdAt'>) {
  const { data, error } = await db().auth.signUp({
    email: email.trim().toLowerCase(),
    password,
    options: {
      emailRedirectTo: window.location.origin,
      data: {
        role: 'therapist',
        nickname: (t.name.split(' ')[0] + '_' + Math.random().toString(36).slice(2, 6)).toLowerCase(),
        display_name: t.name,
        full_name: t.name,
        title: t.title,
        profession: t.profession,
        years_experience: t.yearsExperience,
        license_body: t.licenseBody,
        license_number: t.licenseNumber,
        specialties: t.specialties,
        approaches: t.approaches,
        languages: t.languages,
        formats: t.formats,
        region: t.region,
        practice_location: t.practiceLocation,
        work_days: t.days,
        start_time: t.startTime,
        end_time: t.endTime,
        session_length: t.sessionLength,
        fee_ghs: t.feeGHS,
        sliding_scale: t.slidingScale,
        accepting_clients: t.acceptingClients,
        bio: t.bio,
        agreed_confidentiality: true,
        agreed_crisis_protocol: true,
        agreed_accuracy: true,
      },
    },
  });
  if (error) throw error;
  // With email confirmation on, Supabase hides taken emails: no error, no identities, no email sent
  if (data.user?.identities?.length === 0) throw new Error('User already registered');
  return { userId: data.user?.id || null, needsConfirmation: !data.session };
}

export async function loadTherapistProfile(id: string): Promise<TherapistProfile> {
  const [{ data: t, error }, { data: cred }, { data: u }] = await Promise.all([
    db().from('therapists').select('*').eq('id', id).single(),
    db().from('therapist_credentials').select('license_body,license_number').eq('therapist_id', id).maybeSingle(),
    db().auth.getUser(),
  ]);
  if (error) throw error;
  return {
    id: t.id,
    email: u.user?.email || '',
    pin: '',
    title: t.title,
    name: t.full_name,
    profession: t.profession,
    licenseBody: cred?.license_body || '',
    licenseNumber: cred?.license_number || '',
    yearsExperience: t.years_experience,
    verification: t.verification === 'verified' ? 'verified' : 'pending',
    specialties: t.specialties || [],
    approaches: t.approaches || [],
    languages: t.languages || [],
    formats: t.formats || [],
    region: t.region || '',
    practiceLocation: t.practice_location || '',
    days: t.work_days || [],
    startTime: String(t.start_time).slice(0, 5),
    endTime: String(t.end_time).slice(0, 5),
    sessionLength: t.session_length,
    feeGHS: Number(t.fee_ghs),
    slidingScale: t.sliding_scale,
    acceptingClients: t.accepting_clients,
    bio: t.bio,
    createdAt: String(t.created_at).slice(0, 10),
  };
}

const THERAPIST_COLUMNS: Partial<Record<keyof TherapistProfile, string>> = {
  title: 'title',
  name: 'full_name',
  bio: 'bio',
  specialties: 'specialties',
  approaches: 'approaches',
  languages: 'languages',
  formats: 'formats',
  region: 'region',
  practiceLocation: 'practice_location',
  days: 'work_days',
  startTime: 'start_time',
  endTime: 'end_time',
  sessionLength: 'session_length',
  feeGHS: 'fee_ghs',
  slidingScale: 'sliding_scale',
  acceptingClients: 'accepting_clients',
};

export async function updateTherapistProfile(id: string, patch: Partial<TherapistProfile>) {
  const row: Record<string, unknown> = {};
  (Object.keys(patch) as Array<keyof TherapistProfile>).forEach(k => {
    const col = THERAPIST_COLUMNS[k];
    if (col) row[col] = patch[k];
  });
  if (!Object.keys(row).length) return;
  const { error } = await db().from('therapists').update(row).eq('id', id);
  if (error) throw error;
}

/* ---------- Caseload ---------- */

const dayKey = (d: Date) => d.toISOString().slice(0, 10);

function last14(rows: any[], field: 'mood' | 'craving'): Array<number | null> {
  const byDay = new Map(rows.map(r => [r.day, r[field]]));
  const out: Array<number | null> = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    out.push(byDay.has(dayKey(d)) ? (byDay.get(dayKey(d)) as number | null) : null);
  }
  return out;
}

const toNote = (n: any): SessionNote => ({
  data: n.data,
  assessment: n.assessment,
  plan: n.plan,
  moodRating: n.mood_rating,
  riskLevel: n.risk_level,
  homework: n.homework || '',
  agendaDone: n.agenda_done || [],
  signedAt: n.signed_at || undefined,
});

const toSession = (s: any, note?: any): TherapySession => ({
  id: s.id,
  clientId: s.client_id,
  start: s.starts_at,
  durationMin: s.duration_min,
  format: s.format,
  type: s.type,
  status: s.status,
  topic: s.topic || undefined,
  startedAt: s.started_at || undefined,
  note: note ? toNote(note) : undefined,
});

const toRequest = (r: any): SessionRequest => ({
  id: r.id,
  therapistId: r.therapist_id,
  clientNickname: r.client_nickname || 'Client',
  focus: r.focus,
  preferredTime: r.preferred_time,
  preferredLabel: '',
  format: r.format,
  message: r.message,
  sharesCheckins: r.shares_checkins,
  createdAt: r.created_at,
  status: r.status === 'withdrawn' ? 'declined' : r.status,
  snapshot: r.snapshot ? { streakDays: r.snapshot.streak_days, mood: r.snapshot.mood || [], craving: r.snapshot.craving || [] } : undefined,
});

/** Load the whole caseload in one go (a caseload is small, so this stays fast). */
export async function loadTherapistData(therapistId: string): Promise<TherapistData> {
  const since = new Date();
  since.setDate(since.getDate() - 13);

  const [links, sessions, notes, requests, escalations] = await Promise.all([
    db().from('care_links').select('*').eq('therapist_id', therapistId),
    db().from('sessions').select('*').eq('therapist_id', therapistId).order('starts_at'),
    db().from('session_notes').select('*').eq('therapist_id', therapistId),
    db().from('session_requests').select('*').eq('therapist_id', therapistId).order('created_at', { ascending: false }).limit(100),
    db().from('escalations').select('*').eq('therapist_id', therapistId).order('created_at'),
  ]);
  for (const r of [links, sessions, notes, requests, escalations]) if (r.error) throw r.error;

  const clientIds = (links.data || []).map((l: any) => l.client_id);
  let profiles: any[] = [], checkins: any[] = [], goals: any[] = [], homework: any[] = [], plans: any[] = [], privates: any[] = [], sos: any[] = [], thoughts: any[] = [];
  if (clientIds.length) {
    const res = await Promise.all([
      db().from('profiles').select('id,nickname,age,current_triage,streak_days,share_location_in_crisis').in('id', clientIds),
      db().from('checkins').select('client_id,day,mood,craving,created_at').in('client_id', clientIds).gte('day', dayKey(since)),
      db().from('goals').select('*').in('client_id', clientIds).order('created_at'),
      db().from('homework').select('*').in('client_id', clientIds).order('created_at'),
      db().from('safety_plans').select('*').in('client_id', clientIds),
      db().from('private_notes').select('*').eq('therapist_id', therapistId),
      db().from('sos_events').select('*').in('client_id', clientIds).not('lat', 'is', null).order('created_at', { ascending: false }).limit(200),
      // Only records the client chose to share are visible (Row Level Security)
      db().from('thought_records').select('*').in('client_id', clientIds).order('created_at', { ascending: false }).limit(300),
    ]);
    for (const r of res) if (r.error) throw r.error;
    [profiles, checkins, goals, homework, plans, privates, sos, thoughts] = res.map(r => r.data || []);
  }

  const notesBySession = new Map((notes.data || []).map((n: any) => [n.session_id, n]));

  const clients: ClientRecord[] = (links.data || []).map((l: any) => {
    const p = profiles.find(x => x.id === l.client_id) || {};
    const ci = checkins.filter(c => c.client_id === l.client_id);
    const plan = plans.find(x => x.client_id === l.client_id);
    const loc = sos.find(e => e.client_id === l.client_id);
    const lastLocation: ClientLocation | undefined = loc
      ? { lat: loc.lat, lng: loc.lng, area: loc.area || 'Shared location', at: loc.located_at || loc.created_at, accuracyM: loc.accuracy_m || 50, source: loc.source, approximate: loc.approximate }
      : undefined;
    const log: EscalationEntry[] = (escalations.data || [])
      .filter((e: any) => e.client_id === l.client_id)
      .map((e: any) => ({ id: e.id, at: e.created_at, action: e.action, note: e.note || undefined }));
    return {
      id: l.client_id,
      nickname: p.nickname || 'Client',
      age: p.age || undefined,
      focus: p.current_triage || 'general',
      streakDays: p.streak_days || 0,
      risk: l.risk,
      mood: last14(ci, 'mood'),
      craving: last14(ci, 'craving'),
      lastCheckin: ci.map(c => c.created_at).sort().pop() || l.created_at,
      goals: goals.filter(g => g.client_id === l.client_id).map(g => g.text),
      homework: homework
        .filter(h => h.client_id === l.client_id)
        .map((h): HomeworkItem => ({ id: h.id, text: h.text, done: h.done, setOn: h.created_at })),
      safetyPlan: {
        warningSigns: plan?.warning_signs || '',
        copingSteps: plan?.coping_steps || '',
        supportPeople: plan?.support_people || '',
        updatedAt: plan?.updated_at,
      },
      sharesCheckins: l.shares_checkins,
      status: l.status,
      startedAt: l.created_at,
      privateNote: privates.find(x => x.client_id === l.client_id)?.body || '',
      locationConsent: !!p.share_location_in_crisis,
      lastLocation,
      escalations: log,
      thoughtRecords: thoughts.filter(t => t.client_id === l.client_id).map(rowToThought),
    };
  });

  return {
    clients,
    sessions: (sessions.data || []).map((s: any) => toSession(s, notesBySession.get(s.id))),
    requests: (requests.data || []).map(toRequest),
    handledShared: [],
  };
}

const rowToThought = (r: any): ThoughtRecord => ({
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
  shared: true,
});

/* ---------- Changes ---------- */

const check = (r: { error: any }) => {
  if (r.error) throw r.error;
};

export async function updateClientRecord(therapistId: string, clientId: string, patch: Partial<ClientRecord>) {
  const jobs: Array<PromiseLike<void>> = [];

  const link: Record<string, unknown> = {};
  if (patch.risk) link.risk = patch.risk;
  if (patch.status) link.status = patch.status;
  if (Object.keys(link).length)
    jobs.push(db().from('care_links').update(link).eq('client_id', clientId).eq('therapist_id', therapistId).then(check));

  if (patch.safetyPlan)
    jobs.push(
      db()
        .from('safety_plans')
        .upsert({
          client_id: clientId,
          warning_signs: patch.safetyPlan.warningSigns,
          coping_steps: patch.safetyPlan.copingSteps,
          support_people: patch.safetyPlan.supportPeople,
          updated_by: therapistId,
        })
        .then(check)
    );

  if (patch.privateNote !== undefined)
    jobs.push(db().from('private_notes').upsert({ therapist_id: therapistId, client_id: clientId, body: patch.privateNote }).then(check));

  if (patch.goals) {
    const wanted = patch.goals;
    jobs.push(
      (async () => {
        const { data, error } = await db().from('goals').select('id,text').eq('client_id', clientId);
        if (error) throw error;
        const remove = (data || []).filter(g => !wanted.includes(g.text)).map(g => g.id);
        const add = wanted.filter(t => !(data || []).some(g => g.text === t));
        if (remove.length) check(await db().from('goals').delete().in('id', remove));
        if (add.length) check(await db().from('goals').insert(add.map(text => ({ client_id: clientId, text }))));
      })()
    );
  }

  if (patch.homework) {
    const items = patch.homework;
    jobs.push(
      (async () => {
        const { data, error } = await db().from('homework').select('id').eq('client_id', clientId);
        if (error) throw error;
        const remove = (data || []).map(h => h.id).filter(id => !items.some(i => i.id === id));
        if (remove.length) check(await db().from('homework').delete().in('id', remove));
        if (items.length)
          check(
            await db()
              .from('homework')
              .upsert(
                items.map(i => ({ id: i.id, client_id: clientId, therapist_id: therapistId, text: i.text, done: i.done, done_at: i.done ? new Date().toISOString() : null }))
              )
          );
      })()
    );
  }

  await Promise.all(jobs);
}

export async function addSession(therapistId: string, s: TherapySession) {
  check(
    await db().from('sessions').insert({
      id: s.id,
      therapist_id: therapistId,
      client_id: s.clientId,
      starts_at: s.start,
      duration_min: s.durationMin,
      format: s.format,
      type: s.type,
      status: s.status,
      topic: s.topic || null,
    })
  );
}

const noteRow = (sessionId: string, n: SessionNote) => ({
  session_id: sessionId,
  data: n.data,
  assessment: n.assessment,
  plan: n.plan,
  mood_rating: n.moodRating,
  risk_level: n.riskLevel,
  homework: n.homework || null,
  agenda_done: n.agendaDone,
});

export async function updateSession(sessionId: string, patch: Partial<TherapySession>) {
  const row: Record<string, unknown> = {};
  if (patch.status) row.status = patch.status;
  if (patch.startedAt) row.started_at = patch.startedAt;
  if ('topic' in patch) row.topic = patch.topic || null;
  if (patch.status === 'completed') row.ended_at = new Date().toISOString();
  if (Object.keys(row).length) check(await db().from('sessions').update(row).eq('id', sessionId));
  // Drafts only — signing goes through signSessionNote()
  const n = patch.note;
  const hasContent = n && (n.data.trim() || n.assessment.trim() || n.plan.trim() || n.agendaDone.length || (n.homework || '').trim());
  if (n && !n.signedAt && hasContent) check(await db().from('session_notes').upsert(noteRow(sessionId, patch.note)));
}

/** Save the note, then sign it in one database transaction (risk, homework and next session). */
export async function signSessionNote(sessionId: string, note: SessionNote, nextStart?: string | null) {
  check(await db().from('session_notes').upsert(noteRow(sessionId, note)));
  check(await db().rpc('sign_session_note', { p_session: sessionId, p_next_starts_at: nextStart || null }));
}

export async function acceptRequest(requestId: string, startsAt: string) {
  check(await db().rpc('accept_session_request', { p_request: requestId, p_starts_at: startsAt }));
}

export async function declineRequest(requestId: string, reason?: string) {
  check(await db().rpc('decline_session_request', { p_request: requestId, p_reason: reason || null }));
}

export async function logEscalation(therapistId: string, clientId: string, action: string, note?: string) {
  check(await db().from('escalations').insert({ client_id: clientId, therapist_id: therapistId, action, note: note || null }));
}

/** Ask the client's app for a fresh location. Their phone answers if they agreed to share. */
export async function requestLocation(clientId: string) {
  check(await db().from('location_requests').insert({ client_id: clientId }));
}

/** The client's open alert, if there is one (Row Level Security limits this to linked clients). */
export async function loadOpenIncident(clientId: string): Promise<{ id: string; status: string; created_at: string; location_status: string } | null> {
  const { data, error } = await db()
    .from('emergency_incidents')
    .select('id,status,created_at,location_status')
    .eq('client_id', clientId)
    .in('status', ['initiated', 'contact_notified', 'acknowledged'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/** Tell the client "I've seen this". It's the only acknowledgement 4Life can show them. */
export async function acknowledgeIncident(incidentId: string) {
  check(await db().rpc('emergency_acknowledge', { p_incident: incidentId }));
}

export async function resolveIncident(incidentId: string) {
  check(await db().rpc('emergency_close', { p_incident: incidentId, p_outcome: 'resolved' }));
}

/** Reload when anything in the caseload changes (new request, SOS, check-in…). */
export function subscribeToCaseload(therapistId: string, onChange: () => void) {
  let t: ReturnType<typeof setTimeout> | undefined;
  const bump = () => {
    clearTimeout(t);
    t = setTimeout(onChange, 400);
  };
  const ch = db().channel('caseload-' + therapistId);
  ['session_requests', 'sessions', 'care_links', 'escalations'].forEach(table =>
    ch.on('postgres_changes', { event: '*', schema: 'public', table, filter: `therapist_id=eq.${therapistId}` }, bump)
  );
  // These have no therapist column; Row Level Security only delivers linked clients' rows
  ['sos_events', 'checkins', 'emergency_incidents'].forEach(table => ch.on('postgres_changes', { event: '*', schema: 'public', table }, bump));
  ch.subscribe();
  return () => {
    clearTimeout(t);
    db().removeChannel(ch);
  };
}
