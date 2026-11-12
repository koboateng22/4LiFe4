/**
 * Everything the client (person in recovery) app reads and writes in Supabase.
 * Only used when isRemote is true.
 */
import { authRedirectUrl } from '../authRedirect';
import { asThemePref } from '../theme';
import { db } from '../supabase';
import type { CounselorMatch, UserContact, UserProfile } from '../../types';
import type { ClientLocation, SessionFormat, TherapyService } from '../../therapist/types';
import { hasOpenAlert } from '../incident';
import { focusLabel } from '../../therapist/data';
import { parseAge } from '../age';
import { msg } from '../../i18n';

/* ---------- Profile mapping ---------- */

/** Columns with their own place in the database; everything else goes in `settings`. */
const CORE_KEYS = new Set([
  'id', 'name', 'nickname', 'email', 'password', 'pin', 'pinCode', 'contacts', 'region', 'age', 'language', 'theme',
  'fontSize', 'currentTriage', 'belief', 'religionType', 'sobrietyStreakDays', 'shareLocationInCrisis', 'isGuest',
]);

export function profileToRow(p: UserProfile) {
  const settings: Record<string, unknown> = {};
  Object.entries(p).forEach(([k, v]) => {
    if (!CORE_KEYS.has(k) && v !== undefined) settings[k] = v;
  });
  return {
    display_name: (p.name || '').slice(0, 120),
    nickname: p.nickname,
    region: p.region || null,
    age: parseAge(p.age),
    language: p.language || 'en',
    theme: asThemePref(p.theme),
    font_size: p.fontSize || 'md',
    current_triage: p.currentTriage || 'general',
    belief: p.belief || null,
    religion_type: p.religionType || null,
    streak_days: Math.max(0, Math.round(p.sobrietyStreakDays || 0)),
    share_location_in_crisis: !!p.shareLocationInCrisis,
    settings,
  };
}

export function rowToProfile(row: any, contacts: any[], base: UserProfile): UserProfile {
  return {
    ...base,
    ...(row.settings || {}),
    id: row.id,
    name: row.display_name || row.nickname,
    nickname: row.nickname,
    region: row.region || base.region,
    age: row.age ?? base.age,
    language: row.language,
    theme: asThemePref(row.theme),
    fontSize: row.font_size,
    currentTriage: row.current_triage,
    belief: row.belief || base.belief,
    religionType: row.religion_type || base.religionType,
    sobrietyStreakDays: row.streak_days,
    shareLocationInCrisis: row.share_location_in_crisis,
    contacts: contacts.map(
      (c): UserContact => ({
        id: c.id,
        name: c.name,
        phone: c.phone,
        email: c.email || undefined,
        relationship: c.relationship || '',
        isPrimary: c.is_primary,
        autoDailyCheckin: true,
        autoPromptEnabled: true,
      })
    ),
    pin: '',
    pinCode: '',
  };
}

/* ---------- Auth ---------- */

export async function getSignedInUser(): Promise<{ id: string; role: 'client' | 'therapist' | 'admin' } | null> {
  const { data } = await db().auth.getSession();
  const user = data.session?.user;
  if (!user) return null;
  const { data: row } = await db().from('profiles').select('role').eq('id', user.id).maybeSingle();
  return { id: user.id, role: (row?.role as any) || 'client' };
}

export async function signIn(email: string, password: string) {
  const { data, error } = await db().auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
  if (error) throw error;
  const { data: row, error: e2 } = await db().from('profiles').select('role').eq('id', data.user.id).maybeSingle();
  if (e2) throw e2;
  if (!row) {
    // Created before the sign-up trigger existed. Don't stay half signed in.
    await db().auth.signOut();
    throw new Error(msg('Your password is right, but this account has no profile yet. Please contact the 4Life team.'));
  }
  return { id: data.user.id, role: row.role as 'client' | 'therapist' | 'admin' };
}

/** Send the sign-up confirmation link again. */
/**
 * Other ways to sign in, all through Supabase Auth (one account system, one kind of session):
 *  - Google: Supabase's Google provider. Back on the app, supabase-js finishes the sign-in and the
 *    usual session restore picks it up. Supabase links a Google sign-in to an existing account with
 *    the same confirmed email instead of making a second account.
 *  - Phone: a 6-digit code by text message. Supabase sends it through Twilio Verify (set as the SMS
 *    provider in the Supabase dashboard) and checks it on the server; the app never sees Twilio keys.
 * New people signing in this way get a client profile from the sign-up trigger, then finish
 * setting up (community name, age) before using the app.
 */
export async function signInWithGoogle() {
  const { error } = await db().auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: authRedirectUrl(), queryParams: { prompt: 'select_account' } },
  });
  if (error) throw error;
}

export async function sendPhoneCode(e164: string) {
  const { error } = await db().auth.signInWithOtp({ phone: e164, options: { channel: 'sms', shouldCreateUser: true } });
  if (error) throw error;
}

export async function verifyPhoneCode(e164: string, code: string) {
  const { data, error } = await db().auth.verifyOtp({ phone: e164, token: code, type: 'sms' });
  if (error) throw error;
  if (!data.user) throw new Error('That code is not right. Check the text message and try again.');
  const { data: row, error: e2 } = await db().from('profiles').select('role').eq('id', data.user.id).maybeSingle();
  if (e2) throw e2;
  if (!row) {
    await db().auth.signOut();
    throw new Error(msg('Your password is right, but this account has no profile yet. Please contact the 4Life team.'));
  }
  return { id: data.user.id, role: row.role as 'client' | 'therapist' | 'admin' };
}

export async function resendConfirmation(email: string) {
  const { error } = await db().auth.resend({
    type: 'signup',
    email: email.trim().toLowerCase(),
    options: { emailRedirectTo: authRedirectUrl() },
  });
  if (error) throw error;
}

export async function signOut() {
  await db().auth.signOut();
}

/** Returns needsConfirmation=true when Supabase asks the person to confirm their email first. */
export async function signUpClient(
  email: string,
  password: string,
  details: { name: string; nickname: string; age: number; currentTriage: string; belief: string; religionType?: string; language: string; theme: string; region?: string }
) {
  const { data, error } = await db().auth.signUp({
    email: email.trim().toLowerCase(),
    password,
    options: {
      emailRedirectTo: authRedirectUrl(),
      data: {
        role: 'client',
        display_name: details.name,
        nickname: details.nickname,
        age: details.age,
        current_triage: details.currentTriage,
        belief: details.belief,
        religion_type: details.religionType,
        language: details.language,
        theme: details.theme,
        region: details.region,
      },
    },
  });
  if (error) throw error;
  // With email confirmation on, Supabase hides taken emails: no error, no identities, no email sent
  if (data.user?.identities?.length === 0) throw new Error(msg('User already registered'));
  return { userId: data.user?.id || null, needsConfirmation: !data.session };
}

/* ---------- Profile ---------- */

export async function loadClientProfile(userId: string, base: UserProfile): Promise<UserProfile> {
  const [{ data: row, error }, { data: contacts }] = await Promise.all([
    db().from('profiles').select('*').eq('id', userId).single(),
    db().from('support_contacts').select('*').eq('client_id', userId).order('created_at'),
  ]);
  if (error) throw error;
  return rowToProfile(row, contacts || [], base);
}

export async function saveClientProfile(userId: string, p: UserProfile) {
  const { error } = await db().from('profiles').update(profileToRow(p)).eq('id', userId);
  if (error) throw error;
}

/** Replace the support contact list with the one in the app. */
export async function saveSupportContacts(userId: string, contacts: UserContact[]) {
  const rows = contacts.slice(0, 10).map((c, i) => ({
    client_id: userId,
    name: c.name.slice(0, 80),
    phone: c.phone.slice(0, 30),
    email: c.email || null,
    relationship: c.relationship || null,
    // Only one primary contact is allowed
    is_primary: c.isPrimary && contacts.findIndex(x => x.isPrimary) === i,
  }));
  const { error: delErr } = await db().from('support_contacts').delete().eq('client_id', userId);
  if (delErr) throw delErr;
  if (rows.length) {
    const { error } = await db().from('support_contacts').insert(rows);
    if (error) throw error;
  }
}

/* ---------- Daily check-in ---------- */

const MOOD_SCORE: Record<string, number> = { struggling: 1, low: 2, okay: 3, good: 4, great: 5 };

export async function recordCheckin(userId: string, mood: string | undefined, craving: number) {
  const { error } = await db()
    .from('checkins')
    .upsert(
      {
        client_id: userId,
        day: new Date().toISOString().slice(0, 10),
        mood: mood ? MOOD_SCORE[mood] ?? null : null,
        craving: Math.max(0, Math.min(10, Math.round(craving))),
      },
      { onConflict: 'client_id,day' }
    );
  if (error) throw error;
}

/* ---------- Counsellors ---------- */

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Verified therapists who accept new clients, shaped like the app's counsellor cards. */
export async function listCounsellors(): Promise<CounselorMatch[]> {
  const { data, error } = await db()
    .from('therapists')
    .select('id,title,full_name,profession,specialties,approaches,region,practice_location,fee_ghs,sliding_scale,accepting_clients,work_days,start_time,end_time,bio')
    .eq('verification', 'verified')
    .eq('accepting_clients', true)
    .order('full_name');
  if (error) throw error;
  const now = new Date();
  const hm = now.toTimeString().slice(0, 5);
  return (data || []).map((t: any) => ({
    id: t.id,
    name: [t.title, t.full_name].filter(Boolean).join(' '),
    title: t.profession,
    specialty: (t.specialties || []).map(focusLabel).join(', ') || t.approaches?.[0] || 'Counselling',
    location: t.practice_location || t.region || 'Online',
    region: t.region || '',
    feeGHS: Number(t.fee_ghs),
    feeUSD: Math.max(1, Math.round(Number(t.fee_ghs) / 15)),
    subsidized: t.sliding_scale,
    rating: 0,
    availableNow: (t.work_days || []).includes(DAYS[now.getDay()]) && hm >= t.start_time.slice(0, 5) && hm < t.end_time.slice(0, 5),
    avatar: '',
    phone: '',
    bio: t.bio,
  }));
}

/** The services a counsellor offers now (only active ones are visible to clients) */
export async function listServices(therapistId: string): Promise<TherapyService[]> {
  const { data, error } = await db()
    .from('therapist_services')
    .select('id,name,description,duration_min,fee_ghs,formats,active')
    .eq('therapist_id', therapistId)
    .eq('active', true)
    .order('sort')
    .order('created_at');
  if (error) throw error;
  return (data || []).map((s: any) => ({
    id: s.id,
    name: s.name,
    description: s.description || '',
    durationMin: s.duration_min,
    feeGHS: Number(s.fee_ghs),
    formats: s.formats || [],
    active: true,
  }));
}

/**
 * The times this counsellor is really free in the next two weeks, worked out by the database from
 * their hours, break, days off and booked sessions (whose sessions they are is never revealed).
 */
export async function freeTimes(therapistId: string, durationMin?: number): Promise<string[]> {
  const { data, error } = await db().rpc('therapist_free_slots', { p_therapist: therapistId, p_days: 14, p_duration: durationMin ?? null });
  if (error) throw error;
  return ((data as unknown as string[]) || []).map(x => new Date(x).toISOString());
}

export async function requestSession(args: {
  therapistId: string;
  preferredTime: string;
  format: SessionFormat;
  message: string;
  sharesCheckins: boolean;
  focus: string;
  serviceId?: string | null;
}) {
  const { error } = await db().from('session_requests').insert({
    therapist_id: args.therapistId,
    ...(args.serviceId ? { service_id: args.serviceId } : {}),
    preferred_time: args.preferredTime,
    format: args.format,
    message: args.message.slice(0, 600),
    shares_checkins: args.sharesCheckins,
    focus: args.focus,
  });
  if (error) {
    if (/session_requests_one_open/.test(error.message)) throw new Error(msg('You already have a request waiting with this counsellor.'));
    throw error;
  }
}

/* ---------- SOS and location ---------- */

/** The database removes the location if the person has not agreed to share it. */
export async function sendSos(location?: ClientLocation, source: 'sos' | 'requested' = 'sos') {
  const { error } = await db()
    .from('sos_events')
    .insert({
      source,
      lat: location?.lat ?? null,
      lng: location?.lng ?? null,
      accuracy_m: location ? Math.round(location.accuracyM) : null,
      area: location?.area ?? null,
      approximate: !!location?.approximate,
      located_at: location?.at ?? null,
    });
  if (error) throw error;
}

/** When a counsellor asks for an updated location during an open alert, answer with the phone's position. */
export function listenForLocationRequests(userId: string, getLocation: () => Promise<ClientLocation | undefined>) {
  const channel = db()
    .channel('location-requests-' + userId)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'location_requests', filter: `client_id=eq.${userId}` }, async () => {
      // The promise in Settings is "only when you press SOS": no open alert, no answer
      if (!(await hasOpenAlert())) return;
      const loc = await getLocation();
      if (loc) sendSos({ ...loc, source: 'requested' }, 'requested').catch(e => console.warn('Could not send location', e));
    })
    .subscribe();
  return () => {
    db().removeChannel(channel);
  };
}

/* ---------- Your data ---------- */

export async function exportMyData() {
  const { data, error } = await db().rpc('export_my_data');
  if (error) throw error;
  return data;
}

export async function requestAccountDeletion() {
  const { error } = await db().rpc('request_account_deletion');
  if (error) throw error;
}
