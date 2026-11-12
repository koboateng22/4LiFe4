/**
 * What the Privacy Policy says about access, checked in a real PostgreSQL (PGlite) with every migration
 * applied and Row Level Security on:
 *  - a therapist sees only a linked client's community name, age, focus, streak and location consent,
 *    never their full profile (mood, craving, area, gender, faith…), and nothing once discharged;
 *  - check-ins reach a therapist only while the client shares them; thought records only when shared;
 *  - an SOS location reaches a therapist only with the client's consent;
 *  - support contacts and AI-related preferences stay with the client;
 *  - "Download my data" contains the person's own records (including their sign-in email), and nothing
 *    of anyone else's.
 *   npm run test:privacy-db
 */
import { testDatabase, asUser, callRpc, CLIENT, OTHER, THERAPIST, OTHER_THERAPIST, NO_CONSENT } from './emergency-db-test';

let n = 0;
const ok = (c: unknown, what: string) => {
  if (!c) throw new Error('FAIL: ' + what);
  n++;
  console.log('ok ', what);
};

const pg = await testDatabase();
// The client's profile has the kind of details the app keeps in `settings`
await pg.exec(`update public.profiles set display_name = 'Kwame Mensah', belief = 'theist', religion_type = 'Christian', region = 'Greater Accra',
  settings = '{"currentMood":"low","currentCraving":8,"gender":"Male","address":"East Legon"}'::jsonb where id = '${CLIENT}'`);

// 1. Profiles
const direct = await asUser(pg, THERAPIST, `select * from public.profiles where id = $1`, [CLIENT]);
ok(direct.length === 0, 'a therapist cannot read a client’s profile row directly any more (it held mood, craving, area, gender, faith)');
const viaFn = await asUser<any>(pg, THERAPIST, `select * from public.my_client_profiles($1)`, [[CLIENT, NO_CONSENT, OTHER]]);
ok(viaFn.length === 2 && viaFn.every(r => r.id !== OTHER), 'through the function, a therapist gets their linked clients only');
const cols = Object.keys(viaFn[0]).sort().join(',');
ok(cols === 'age,current_triage,id,nickname,share_location_in_crisis,streak_days', `…and only community name, age, focus, streak and location consent (${cols})`);
ok((await asUser(pg, OTHER_THERAPIST, `select * from public.my_client_profiles(null)`)).length === 0, 'a therapist who is not linked gets nobody');
ok((await asUser(pg, CLIENT, `select * from public.my_client_profiles(null)`)).length === 0, 'a client gets nobody through it');
const own = await asUser<any>(pg, CLIENT, `select settings, display_name from public.profiles where id = $1`, [CLIENT]);
ok(own[0]?.settings?.currentMood === 'low' && own[0]?.display_name === 'Kwame Mensah', 'people still read their own full profile');
ok((await asUser(pg, OTHER, `select * from public.profiles where id = $1`, [CLIENT])).length === 0, 'another client cannot read it');

// 2. Check-ins only while shared
await pg.exec(`insert into public.checkins (client_id, day, mood, craving) values ('${CLIENT}', current_date, 2, 7)`);
ok((await asUser(pg, THERAPIST, `select * from public.checkins where client_id = $1`, [CLIENT])).length === 0, 'check-ins stay private while the client does not share them');
await pg.exec(`update public.care_links set shares_checkins = true where client_id = '${CLIENT}' and therapist_id = '${THERAPIST}'`);
ok((await asUser(pg, THERAPIST, `select * from public.checkins where client_id = $1`, [CLIENT])).length === 1, 'they reach the therapist once the client shares them');
await pg.exec(`update public.care_links set shares_checkins = false where client_id = '${CLIENT}'`);
ok((await asUser(pg, THERAPIST, `select * from public.checkins where client_id = $1`, [CLIENT])).length === 0, '…and stop when the client stops sharing');

// 3. Thought records only when marked shared
await asUser(pg, CLIENT, `insert into public.thought_records (thought, intensity_before, trap, balanced_thought, intensity_after, shared) values
  ('I always fail', 80, 'all_or_nothing', 'Sometimes I manage', 40, false), ('Nobody cares', 70, 'mind_reading', 'My sister checked on me', 30, true)`);
const thoughts = await asUser<any>(pg, THERAPIST, `select thought from public.thought_records where client_id = $1`, [CLIENT]);
ok(thoughts.length === 1 && thoughts[0].thought === 'Nobody cares', 'a therapist sees only the thought records the client marked shared');

// 4. SOS location only with consent
await asUser(pg, NO_CONSENT, `insert into public.sos_events (lat, lng, accuracy_m) values (5.6, -0.19, 20)`);
const stripped = await asUser<any>(pg, THERAPIST, `select lat, lng from public.sos_events where client_id = $1`, [NO_CONSENT]);
ok(stripped.length === 1 && stripped[0].lat === null && stripped[0].lng === null, 'an SOS from someone who did not agree to share location reaches the therapist without coordinates');
await asUser(pg, CLIENT, `insert into public.sos_events (lat, lng, accuracy_m) values (5.6, -0.19, 20)`);
ok((await asUser<any>(pg, THERAPIST, `select lat from public.sos_events where client_id = $1`, [CLIENT]))[0]?.lat === 5.6, 'with consent, the linked therapist sees the location');
ok((await asUser(pg, OTHER_THERAPIST, `select * from public.sos_events where client_id = $1`, [CLIENT])).length === 0, 'a therapist who is not linked sees no SOS');

// 5. Support contacts stay with the client
ok((await asUser(pg, THERAPIST, `select * from public.support_contacts where client_id = $1`, [CLIENT])).length === 0, 'support contacts are not visible to the therapist');

// 6. Discharged: access ends
await pg.exec(`update public.care_links set status = 'discharged' where client_id = '${CLIENT}' and therapist_id = '${THERAPIST}'`);
ok((await asUser(pg, THERAPIST, `select * from public.my_client_profiles($1)`, [[CLIENT]])).length === 0, 'after discharge the therapist no longer gets the client’s details');
await pg.exec(`update public.care_links set status = 'active' where client_id = '${CLIENT}' and therapist_id = '${THERAPIST}'`);

// 7. Download my data
await asUser(pg, CLIENT, `insert into public.village_posts (topic, title, body) values ('substance', 'Day 3', 'Still going')`);
await pg.exec(`insert into public.location_requests (client_id, therapist_id) values ('${CLIENT}', '${THERAPIST}')`);
const mine = await callRpc(pg, CLIENT, 'export_my_data', {});
ok(mine.account?.email === 'kwame@it.test', 'the download includes the sign-in email');
ok(mine.profile?.settings?.currentMood === 'low' && mine.support_contacts.length === 1 && mine.checkins.length === 1 && mine.thought_records.length === 2 && mine.sos_events.length === 1, 'it includes the profile, contacts, check-ins, thought records and SOS events');
ok(mine.village_posts.length === 1 && mine.location_requests.length === 1 && !('therapist_id' in mine.location_requests[0]), 'it includes Village posts and location requests about the person (without the therapist’s account id)');
ok(Array.isArray(mine.village_reactions) && Array.isArray(mine.village_blocks) && Array.isArray(mine.circle_rsvps) && Array.isArray(mine.circle_messages), 'the Village records that were missing are now included');
const text = JSON.stringify(mine);
ok(!text.includes('Someone Else') && !text.includes('akosua@it.test') && !text.includes('ama@it.test'), 'nothing of another person’s is in it (their contacts, their email, the therapist’s email)');
const ther = await callRpc(pg, THERAPIST, 'export_my_data', {});
ok(ther.therapist_credentials?.license_number === 'IT-1' && Array.isArray(ther.therapist_services) && Array.isArray(ther.therapist_time_off), 'a therapist’s download includes their licence details, services and days off');
ok(!JSON.stringify(ther).includes('"currentMood"'), 'a therapist’s download does not include clients’ profiles');
ok((await callRpc(pg, null, 'export_my_data', {}).then(() => 'ran', () => 'refused')) === 'refused', 'signed-out visitors cannot call it');

console.log(`All ${n} privacy database checks passed`);
process.exit(0);
