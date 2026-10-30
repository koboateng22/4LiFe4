/**
 * Integration test for the app's Supabase data layer (src/lib/db/*).
 * Runs the real client and therapist functions against a database with the
 * migrations applied, signed in as different people, and checks the results.
 *
 * Needs a PostgREST endpoint (Supabase local dev, or plain PostgREST) and the JWT secret:
 *   IT_URL=http://127.0.0.1:54321 IT_JWT_SECRET=… IT_AMA=<uuid> IT_KWAME=<uuid> IT_AKOSUA=<uuid> npx tsx scripts/integration-test.ts
 * The three users must exist (therapist Ama verified, Kwame sharing location in a crisis).
 */
import { createHmac } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { __useTestClient, db } from '../src/lib/supabase';
import * as client from '../src/lib/db/clientApi';
import * as therapist from '../src/lib/db/therapistApi';
import * as cbt from '../src/lib/cbtStore';
import * as village from '../src/lib/village';
import * as plans from '../src/lib/safetyPlan';

const URL = process.env.IT_URL || 'http://127.0.0.1:54321';
const SECRET = process.env.IT_JWT_SECRET || 'super-secret-jwt-token-with-at-least-32-characters-long';
const AMA = process.env.IT_AMA || '11111111-1111-4111-8111-111111111111';
const KWAME = process.env.IT_KWAME || '22222222-2222-4222-8222-222222222222';
const AKOSUA = process.env.IT_AKOSUA || '33333333-3333-4333-8333-333333333333';

const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt = (sub: string | null, role: string) => {
  const head = b64({ alg: 'HS256', typ: 'JWT' });
  const body = b64({ sub, role, aud: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 });
  const sig = createHmac('sha256', SECRET).update(`${head}.${body}`).digest('base64url');
  return `${head}.${body}.${sig}`;
};
const anonKey = jwt(null, 'anon');
const as = (sub: string) =>
  __useTestClient(
    createClient(URL, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${jwt(sub, 'authenticated')}` } },
    })
  );

let passed = 0;
const check = (ok: unknown, what: string) => {
  if (!ok) throw new Error('CHECK FAILED: ' + what);
  passed++;
  console.log('ok ', what);
};

const base: any = { name: '', nickname: '', contacts: [], age: '', region: 'Greater Accra', belief: 'theist', currentTriage: 'general', sobrietyStreakDays: 0 };

// ---------- Client: profile, check-in, booking, SOS ----------
as(KWAME);
const kp = await client.loadClientProfile(KWAME, base);
check(kp.nickname === 'SoberWarrior_GH' && kp.shareLocationInCrisis, 'client profile loads with consent setting');

await client.saveClientProfile(KWAME, { ...kp, sobrietyStreakDays: 12, aiName: 'Kofi-AI', age: 19 } as any);
await client.saveSupportContacts(KWAME, [
  { id: 'x', name: 'Sister Mary', phone: '+233 24 000 0001', relationship: 'Sister', isPrimary: true, autoDailyCheckin: true, autoPromptEnabled: true },
]);
const kp2 = await client.loadClientProfile(KWAME, base);
check(kp2.sobrietyStreakDays === 12 && (kp2 as any).aiName === 'Kofi-AI' && kp2.contacts.length === 1, 'profile, settings and contacts round-trip');

await client.recordCheckin(KWAME, 'low', 6);
await client.recordCheckin(KWAME, 'okay', 5); // same day: updates, not duplicates
const dir = await client.listCounsellors();
check(dir.length === 1 && dir[0].name === 'Dr. Ama Konadu' && dir[0].rating === 0, 'directory lists the verified therapist');

await client.requestSession({ therapistId: AMA, preferredTime: new Date(Date.now() + 86400000).toISOString(), format: 'voice', message: 'Weekends are hard', sharesCheckins: true, focus: 'substance' });
let dup = false;
try {
  await client.requestSession({ therapistId: AMA, preferredTime: new Date().toISOString(), format: 'voice', message: 'again', sharesCheckins: true, focus: 'substance' });
} catch (e: any) {
  dup = /already have a request/.test(e.message);
}
check(dup, 'a second open request to the same therapist is refused with a clear message');

await client.sendSos({ lat: 5.65, lng: -0.19, area: 'Legon', accuracyM: 20, at: new Date().toISOString(), source: 'sos' });

// ---------- Therapist: request, accept, caseload ----------
as(AMA);
const me = await therapist.loadTherapistProfile(AMA);
check(me.verification === 'verified' && me.licenseNumber === 'IT-1', 'therapist profile and private licence details load');
let data = await therapist.loadTherapistData(AMA);
check(data.clients.length === 0 && data.requests.length === 1, 'before accepting: one request, no clients');
const req = data.requests[0];
check(req.clientNickname === 'SoberWarrior_GH' && req.snapshot?.streakDays === 12 && req.message === 'Weekends are hard', 'the request shows nickname, message and shared snapshot');

await therapist.acceptRequest(req.id, new Date(Date.now() + 86400000).toISOString());
data = await therapist.loadTherapistData(AMA);
const kw = data.clients[0];
check(data.clients.length === 1 && kw.nickname === 'SoberWarrior_GH' && kw.streakDays === 12, 'accepting adds the client to the caseload');
check(kw.craving[13] === 5 && kw.mood[13] === 3, 'today’s check-in appears in the 14-day trend');
check(kw.locationConsent && kw.lastLocation?.area === 'Legon', 'consented SOS location is visible after linking');
check(data.sessions.length === 1 && data.sessions[0].type === 'intake', 'an intake session is booked');
check(data.requests[0].status === 'accepted', 'the request is marked accepted');

// Edit the record
await therapist.updateClientRecord(AMA, KWAME, {
  risk: 'moderate',
  goals: ['Stay alcohol-free at weekends', 'Sleep before midnight'],
  homework: [{ id: crypto.randomUUID(), text: 'Thought record', done: false, setOn: new Date().toISOString() }],
  safetyPlan: { warningSigns: 'Arguments at home', copingSteps: 'Call Sister Mary', supportPeople: 'Sister Mary' },
  privateNote: 'Formulation: stress → isolation → cravings',
});
await therapist.updateClientRecord(AMA, KWAME, { goals: ['Sleep before midnight', 'Gym three times a week'] });
data = await therapist.loadTherapistData(AMA);
const kw2 = data.clients[0];
check(kw2.risk === 'moderate' && kw2.goals.join('|') === 'Sleep before midnight|Gym three times a week', 'risk and goal changes are saved');
check(kw2.homework.length === 1 && kw2.safetyPlan.copingSteps === 'Call Sister Mary' && kw2.privateNote?.startsWith('Formulation'), 'homework, safety plan and private note are saved');

// Run and sign a session
const s = data.sessions[0];
await therapist.updateSession(s.id, { status: 'in_progress', startedAt: new Date().toISOString(), topic: 'Getting started' });
const note = { data: 'Talked about weekends', assessment: 'Motivated', plan: 'Plan activities', moodRating: 3, riskLevel: 'moderate' as const, homework: 'Plan two alcohol-free activities', agendaDone: ['Check in on mood and cravings'] };
await therapist.updateSession(s.id, { note });
await therapist.signSessionNote(s.id, note, new Date(Date.now() + 8 * 86400000).toISOString());
data = await therapist.loadTherapistData(AMA);
const signed = data.sessions.find(x => x.id === s.id)!;
check(signed.status === 'completed' && signed.note?.signedAt && signed.topic === 'Getting started', 'the session is completed with a signed note');
check(data.sessions.length === 2 && data.clients[0].homework.length === 2, 'signing books the next session and adds homework');

// Crisis tools
await therapist.logEscalation(AMA, KWAME, 'Called 112');
await therapist.requestLocation(KWAME);
as(KWAME);
await client.sendSos({ lat: 5.651, lng: -0.191, area: 'Legon', accuracyM: 15, at: new Date().toISOString(), source: 'sos' });
as(AMA);
data = await therapist.loadTherapistData(AMA);
const kw3 = data.clients[0];
check(kw3.risk === 'high', 'a new SOS raises risk to high');
check(kw3.escalations?.some(e => e.action === 'Called 112') && kw3.escalations?.some(e => e.action.startsWith('Pressed SOS')), 'the escalation record has both entries');
check(Math.abs((kw3.lastLocation?.lat || 0) - 5.651) < 1e-9, 'the map uses the newest location');

await therapist.updateTherapistProfile(AMA, { bio: 'Updated bio', feeGHS: 40, days: ['Mon', 'Wed'] });
const me2 = await therapist.loadTherapistProfile(AMA);
check(me2.bio === 'Updated bio' && me2.feeGHS === 40 && me2.days.join() === 'Mon,Wed', 'therapist profile edits are saved');

// ---------- Privacy: another client sees nothing of Kwame ----------
as(AKOSUA);
const others = await Promise.all(['checkins', 'sos_events', 'session_requests', 'sessions', 'homework', 'goals', 'safety_plans', 'escalations'].map(t => db().from(t).select('*')));
check(others.every((r: any) => !r.error && r.data.length === 0), 'another client sees none of Kwame’s records');
const exp = await client.exportMyData();
check(exp && (exp as any).profile?.nickname === 'Akosua_Rising', 'export returns only the signed-in person’s data');

as(KWAME);
const mine = await client.exportMyData();
check((mine as any).checkins.length === 1 && (mine as any).sessions.length === 2, 'the client’s export includes their check-ins and sessions');
const notes = await db().from('session_notes').select('*');
check(!notes.error && notes.data!.length === 0, 'the client cannot read session notes');


// ---------- AI CBT therapy: thought records ----------
as(KWAME);
const rec1 = await cbt.saveThoughtRecord(KWAME, 'SoberWarrior_GH', {
  situation: 'Friday evening', thought: 'One drink won’t hurt', emotion: 'Tempted', intensityBefore: 80, trap: 'permission_giving',
  evidenceFor: 'Hard week', evidenceAgainst: 'One drink became the whole night last time', balancedThought: 'I can wait 20 minutes and call Mary.', intensityAfter: 40, shared: false,
});
await cbt.saveThoughtRecord(KWAME, 'SoberWarrior_GH', {
  situation: '', thought: 'I always fail', emotion: 'Ashamed', intensityBefore: 70, trap: 'overgeneralising',
  evidenceFor: '', evidenceAgainst: '12 days clean', balancedThought: 'A hard day is not failure.', intensityAfter: 35, shared: true,
});
check((await cbt.listThoughtRecords(KWAME)).length === 2, 'a client saves thought records');
as(AMA);
data = await therapist.loadTherapistData(AMA);
check(data.clients[0].thoughtRecords?.length === 1 && data.clients[0].thoughtRecords[0].thought === 'I always fail', 'the therapist sees only the shared thought record');
as(KWAME);
await cbt.setThoughtShared(KWAME, 'SoberWarrior_GH', rec1.id, true);
as(AMA);
data = await therapist.loadTherapistData(AMA);
check(data.clients[0].thoughtRecords?.length === 2, 'sharing a record later makes it visible');
as(KWAME);
await cbt.deleteThoughtRecord(KWAME, 'SoberWarrior_GH', rec1.id);
check((await cbt.listThoughtRecords(KWAME)).length === 1, 'a client can delete a thought record');
as(AKOSUA);
check((await cbt.listThoughtRecords(KWAME)).length === 0, 'another client cannot read thought records');

// ---------- Global Village ----------
const meK = { id: KWAME, nickname: 'SoberWarrior_GH' };
const meA = { id: AKOSUA, nickname: 'Akosua_Rising' };
as(KWAME);
const post = await village.createPost(meK, { topic: 'substance', title: 'Weekends are hard', body: 'Friday night is my risky time.' });
check(post.authorName === 'SoberWarrior_GH' && post.mine, 'a post is signed with the community name');
as(AKOSUA);
check((await village.listPosts(meA)).some(p => p.id === post.id && !p.mine), 'other members see the post');
await village.setSupport(meA, post.id, true);
await village.setSupport(meA, post.id, true); // a second tap does nothing
await village.addReply(meA, post.id, 'Plan Friday in advance — it helped me.');
const seen = (await village.listPosts(meA)).find(p => p.id === post.id)!;
check(seen.supportCount === 1 && seen.supportedByMe && seen.replyCount === 1, 'support and replies are counted once');
await village.setReaction(meA, post.id, 'metoo', true);
await village.setReaction(meA, post.id, 'helped', true);
await village.setReaction(meA, post.id, 'helped', false);
const reacted = (await village.listPosts(meA)).find(p => p.id === post.id)!;
check(
  reacted.metooCount === 1 && reacted.helpedCount === 0 && reacted.supportCount === 1 && reacted.myReactions.metoo && !reacted.myReactions.helped,
  '"Me too" and "This helped me" are saved and counted separately'
);
as(KWAME);
check((await village.listReplies(meK, post.id))[0]?.authorName === 'Akosua_Rising', 'the author sees the reply');
await village.block(meK, { id: AKOSUA, name: 'Akosua_Rising' });
check((await village.listReplies(meK, post.id)).length === 0, 'blocking hides that person’s replies');
const blockedList = await village.listBlocked(meK);
check(blockedList.length === 1 && blockedList[0].name === 'Akosua_Rising', 'the blocked list shows their name');
await village.unblock(meK, blockedList[0]);
check((await village.listReplies(meK, post.id)).length === 1, 'unblocking shows them again');
as(AKOSUA);
await village.report(meA, 'post', post.id, 'unkind');
await village.report(meA, 'post', post.id, 'unkind'); // reporting twice is not an error
check((await db().from('village_reports').select('*')).data?.length === 1, 'a report is saved once');
const circles = await village.listCircles(meA);
check(circles.length === 4 && /^\d\d:\d\d$/.test(circles[0].startTime), 'members see the weekly circles');
await village.sendCircleMessage(meA, circles[0].id, 'Hello circle');
as(KWAME);
const msgs = await village.listCircleMessages(meK, circles[0].id);
check(msgs.length === 1 && msgs[0].authorName === 'Akosua_Rising' && !msgs[0].mine, 'circle chat reaches other members');
await village.setGoing(meK, circles[0], true);
as(AKOSUA);
check((await village.circleGoing(meA, circles[0])).count === 1 && !(await village.circleGoing(meA, circles[0])).mine, 'others see how many are going, not who');
await village.setGoing(meA, circles[0], true);
check((await village.circleGoing(meA, circles[0])).count === 2, '"I\'ll be there" adds to the count');
as(KWAME);

// ---------- My safety plan ----------
const kwameProfile: any = { id: KWAME, contacts: [] };
await plans.saveSafetyPlan(kwameProfile, { ...plans.EMPTY_PLAN, warningSigns: 'Payday evenings', safePlaces: 'The library', reasons: 'My sister' });
const myPlan = await plans.loadSafetyPlan(kwameProfile);
check(myPlan.warningSigns === 'Payday evenings' && myPlan.safePlaces === 'The library' && myPlan.reasons === 'My sister', 'a client saves their own safety plan');
as(AKOSUA);
check((await db().from('safety_plans').select('*').eq('client_id', KWAME)).data?.length === 0, 'other clients cannot read it');
as(KWAME);
await village.deletePost(meK, post.id);
as(AKOSUA);
check(!(await village.listPosts(meA)).some(p => p.id === post.id), 'an author can delete their post');

console.log(`\nAll ${passed} integration checks passed`);
