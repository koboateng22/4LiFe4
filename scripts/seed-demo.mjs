#!/usr/bin/env node
/**
 * Creates demo accounts in a Supabase project so you can try the connected app:
 *   • Dr. Ama Konadu — verified therapist
 *   • Kwame (SoberWarrior_GH) and Akosua (Akosua_Rising) — her clients
 *
 * Usage (development projects only — never on a project with real people):
 *   VITE_SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… node scripts/seed-demo.mjs
 *   (or put them in .env.local and run: npm run db:seed-demo)
 *
 * Safe to run more than once: existing demo accounts are reused.
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'node:fs';

// Load .env.local / .env if present (no extra dependency)
for (const file of ['.env.local', '.env']) {
  if (!existsSync(file)) continue;
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"#]*)"?\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
}

const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const password = process.env.DEMO_PASSWORD || 'Demo-4Life-2026';
if (!url || !serviceKey) {
  console.error('Set VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY first (see .env.example).');
  process.exit(1);
}

// The service-role key bypasses Row Level Security. Keep it on your computer only.
const sb = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

const must = ({ data, error }, what) => {
  if (error) throw new Error(`${what}: ${error.message}`);
  return data;
};

async function ensureUser(email, metadata) {
  const created = await sb.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: metadata });
  if (!created.error) return created.data.user.id;
  if (!/already|registered|exists/i.test(created.error.message)) throw created.error;
  // Already there: find it
  for (let page = 1; page < 50; page++) {
    const { data } = await sb.auth.admin.listUsers({ page, perPage: 200 });
    const found = data.users.find(u => u.email === email);
    if (found) return found.id;
    if (data.users.length < 200) break;
  }
  throw new Error(`Could not find existing user ${email}`);
}

const day = n => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};
const at = (days, h, m = 0) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(h, m, 0, 0);
  return d.toISOString();
};

console.log('Creating demo accounts…');

const ama = await ensureUser('ama@4life.org', {
  role: 'therapist',
  nickname: 'dr_ama',
  display_name: 'Ama Konadu',
  full_name: 'Ama Konadu',
  title: 'Dr.',
  profession: 'Clinical psychologist',
  years_experience: 12,
  license_body: 'Ghana Psychological Council',
  license_number: 'DEMO-GPC-0412',
  specialties: ['substance', 'social_media', 'anger'],
  approaches: ['CBT', 'Motivational interviewing', 'Relapse prevention', 'Faith-integrated'],
  languages: ['English', 'Twi'],
  formats: ['video', 'voice', 'in_person'],
  region: 'Greater Accra',
  practice_location: 'East Legon, Accra',
  fee_ghs: 35,
  bio: 'I help young adults step away from alcohol, drugs and compulsive habits using CBT and motivational interviewing.',
  agreed_confidentiality: true,
  agreed_crisis_protocol: true,
  agreed_accuracy: true,
});

const kwame = await ensureUser('kwame@4life.org', {
  role: 'client',
  nickname: 'SoberWarrior_GH',
  display_name: 'Kwame Mensah',
  current_triage: 'substance',
  belief: 'theist',
  religion_type: 'Christian',
  region: 'Greater Accra',
});

const akosua = await ensureUser('akosua@4life.org', {
  role: 'client',
  nickname: 'Akosua_Rising',
  display_name: 'Akosua Boateng',
  current_triage: 'social_media',
  belief: 'secular',
  region: 'Ashanti',
});

// Verify the demo therapist (an admin does this for real therapists)
must(await sb.from('therapists').update({ verification: 'verified' }).eq('id', ama), 'verify therapist');
must(await sb.from('profiles').update({ streak_days: 12, share_location_in_crisis: true, age: 19 }).eq('id', kwame), 'kwame profile');
must(await sb.from('profiles').update({ streak_days: 28, age: 22 }).eq('id', akosua), 'akosua profile');

await sb.from('support_contacts').delete().eq('client_id', kwame);
must(
  await sb.from('support_contacts').insert({ client_id: kwame, name: 'Sister Mary (demo)', phone: '+233 24 000 0001', relationship: 'Sister', is_primary: true }),
  'support contact'
);

// Links (normally created when the therapist accepts a request)
must(
  await sb.from('care_links').upsert(
    [
      { client_id: kwame, therapist_id: ama, shares_checkins: true, risk: 'moderate' },
      { client_id: akosua, therapist_id: ama, shares_checkins: true, risk: 'low' },
    ],
    { onConflict: 'client_id,therapist_id' }
  ),
  'care links'
);

// Two weeks of check-ins
const kMood = [2, 3, 3, 2, 3, 3, 4, 3, 3, 4, 4, 3, 4, 4];
const kCrav = [7, 6, 6, 7, 5, 5, 4, 5, 4, 4, 3, 4, 3, 3];
const aMood = [3, 3, 4, 4, 3, 4, 4, 4, 5, 4, 4, 5, 4, 5];
const aCrav = [5, 4, 4, 3, 4, 3, 3, 2, 3, 2, 2, 2, 2, 1];
const checkins = [];
for (let i = 0; i < 14; i++) {
  checkins.push({ client_id: kwame, day: day(i - 13), mood: kMood[i], craving: kCrav[i] });
  checkins.push({ client_id: akosua, day: day(i - 13), mood: aMood[i], craving: aCrav[i] });
}
must(await sb.from('checkins').upsert(checkins, { onConflict: 'client_id,day' }), 'check-ins');

// Goals, safety plan (replace any earlier demo rows)
await sb.from('goals').delete().in('client_id', [kwame, akosua]);
must(
  await sb.from('goals').insert([
    { client_id: kwame, created_by: ama, text: 'Stay alcohol-free at weekend gatherings' },
    { client_id: kwame, created_by: ama, text: 'Sleep before midnight on weekdays' },
    { client_id: akosua, created_by: ama, text: 'Under 1 hour of short videos a day' },
  ]),
  'goals'
);
must(
  await sb.from('safety_plans').upsert({
    client_id: kwame,
    warning_signs: 'Isolating after arguments at home; passing the drinking spot on the way from lectures.',
    coping_steps: 'Leave the situation, 4-7-8 breathing, call Sister Mary, go to the hostel gym.',
    support_people: 'Sister Mary (sister) · Mentor Kofi (peer mentor)',
    updated_by: ama,
  }),
  'safety plan'
);

// Sessions: one signed in the past, two coming up
await sb.from('sessions').delete().eq('therapist_id', ama);
const past = must(
  await sb
    .from('sessions')
    .insert({ therapist_id: ama, client_id: kwame, starts_at: at(-7, 14), duration_min: 50, format: 'video', type: 'follow_up', status: 'completed', topic: 'Thought records', started_at: at(-7, 14), ended_at: at(-7, 14, 50) })
    .select()
    .single(),
  'past session'
);
must(
  await sb.from('session_notes').insert({
    session_id: past.id,
    therapist_id: ama,
    client_id: kwame,
    data: 'Completed 3 thought records. Sleep improving.',
    assessment: 'Building insight into the link between conflict at home and cravings.',
    plan: 'Plan Saturday activities; keep thought records.',
    mood_rating: 3,
    risk_level: 'moderate',
    homework: 'Plan two alcohol-free activities for Saturday',
    signed_at: at(-7, 15),
  }),
  'session note'
);
await sb.from('homework').delete().in('client_id', [kwame, akosua]);
must(
  await sb.from('homework').insert({ client_id: kwame, therapist_id: ama, session_id: past.id, text: 'Plan two alcohol-free activities for Saturday' }),
  'homework'
);
must(
  await sb.from('sessions').insert([
    { therapist_id: ama, client_id: kwame, starts_at: at(1, 14), duration_min: 50, format: 'video', type: 'follow_up', topic: 'How the weekend went' },
    { therapist_id: ama, client_id: akosua, starts_at: at(2, 10), duration_min: 50, format: 'voice', type: 'follow_up', topic: 'Exam stress' },
  ]),
  'upcoming sessions'
);

// AI therapy: one thought record Kwame shared with Dr. Ama
await sb.from('thought_records').delete().eq('client_id', kwame);
must(
  await sb.from('thought_records').insert({
    client_id: kwame,
    situation: 'Friday evening, walking past the drinking spot after lectures',
    thought: "I've had a hard week, so one drink won't hurt",
    emotion: 'Tempted',
    intensity_before: 80,
    trap: 'permission_giving',
    evidence_for: 'It has been a stressful week',
    evidence_against: 'Last time one drink became the whole night. I have 12 days clean.',
    balanced_thought: 'I want relief, but one drink usually leads to more. I can wait 20 minutes and call Sister Mary.',
    intensity_after: 40,
    shared: true,
  }),
  'thought record'
);

// Global Village: a few starter posts (replaced each run)
await sb.from('village_posts').delete().in('author_id', [kwame, akosua]);
const posts = must(
  await sb
    .from('village_posts')
    .insert([
      {
        author_id: kwame,
        topic: 'substance',
        title: 'What helped me in week one',
        body: 'Evenings were my danger zone. I planned every evening in advance, told one person my plan, and rode out urges with the AI for 20 minutes. It always passed.',
      },
      {
        author_id: akosua,
        topic: 'porn_social',
        title: 'Phone outside the bedroom = no more 3 AM loops',
        body: 'My slips always happened in bed with my phone. Now it charges in the hall and I use a cheap alarm clock. The first nights were boring, but mornings are so much better.',
      },
    ])
    .select(),
  'village posts'
);
must(await sb.from('village_replies').insert({ post_id: posts[0].id, author_id: akosua, body: 'Telling one person the plan is so underrated. Well done!' }), 'village reply');

console.log(`
Done. Sign in with password "${password}":
  Therapist: ama@4life.org      (choose "I'm a therapist")
  Client:    kwame@4life.org    (shares location in a crisis — try SOS)
  Client:    akosua@4life.org
`);
