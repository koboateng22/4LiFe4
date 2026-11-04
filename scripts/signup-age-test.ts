/**
 * The age from sign-up to the database: the app's own sign-up call, the metadata it sends, then
 * the real trigger from the migrations in a real PostgreSQL (PGlite, in this process).
 *   npm run test:signup-age
 */
import { __useTestClient } from '../src/lib/supabase';
import { signUpClient, rowToProfile } from '../src/lib/db/clientApi';
import { testDatabase } from './emergency-db-test';

let n = 0;
const ok = (c: unknown, w: string) => {
  if (!c) throw new Error('FAIL: ' + w);
  n++;
  console.log('ok ', w);
};

const pg = await testDatabase();
const uuid = (i: number) => `99999999-0000-4000-8000-${String(i).padStart(12, '0')}`;
let next = 1;

/** Adds the auth user exactly as Supabase would, which is what fires the trigger. */
const addUser = async (meta: Record<string, unknown>) => {
  const id = uuid(next++);
  await pg.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3::jsonb)`, [id, `${id}@it.test`, JSON.stringify(meta)]);
  return id;
};
const ageOf = async (id: string) => (await pg.query<{ age: number | null }>('select age from public.profiles where id = $1', [id])).rows[0]?.age;

// Through the app's own sign-up code, with email confirmation on (no session comes back)
__useTestClient({
  auth: {
    signUp: async ({ options }: any) => ({ data: { user: { id: await addUser(options.data), identities: [{}] }, session: null }, error: null }),
  },
} as any);
(globalThis as any).window = { location: { origin: 'http://test' } };
const { userId, needsConfirmation } = await signUpClient('kofi@it.test', 'long-password', {
  name: 'Kofi Asante', nickname: 'Kofi_W', age: 21, currentTriage: 'substance', belief: 'theist', language: 'en', theme: 'light', region: 'Greater Accra',
});
ok(needsConfirmation, 'this sign-up has no session yet, so only the trigger can save the age');
ok((await ageOf(userId!)) === 21, 'the age from the sign-up call reaches the profile');
const row = (await pg.query<any>('select * from public.profiles where id = $1', [userId])).rows[0];
ok(rowToProfile(row, [], { contacts: [] } as any).age === 21, 'and comes back when the profile loads');

// Limits, and nothing a tampered request sends can break a sign-up
for (const [age, want] of [[13, 13], [120, 120], ['30', 30]] as const) {
  ok((await ageOf(await addUser({ nickname: `ok_${age}`, age }))) === want, `age ${JSON.stringify(age)} is saved`);
}
for (const age of [12, 121, 999, -5, 19.5, 'abc', '', '1; drop table x', null, { a: 1 }, 99999999]) {
  ok((await ageOf(await addUser({ nickname: `bad_${next}`, age }))) === null, `age ${JSON.stringify(age)} is dropped and the sign-up still works`);
}
ok((await ageOf(await addUser({ nickname: 'old_app' }))) === null, 'an older app that sends no age still signs up');
ok((await pg.query('select 1 from public.therapists')).rows.length > 0, 'therapist sign-ups still create their records');
const therapistId = await addUser({ role: 'therapist', nickname: 'dr_age', full_name: 'Efua', license_body: 'GPC', license_number: 'AGE-1', agreed_confidentiality: true, agreed_crisis_protocol: true, agreed_accuracy: true });
ok((await pg.query('select 1 from public.therapist_credentials where therapist_id = $1', [therapistId])).rows.length === 1, 'a new therapist still gets their credentials row');

const acl = await pg.query<{ ok: boolean }>(`select has_function_privilege('authenticated', 'public.handle_new_user()', 'execute') as ok`);
ok(acl.rows[0].ok === false, 'signed-in users still cannot call the trigger function directly');

console.log(`\nAll ${n} sign-up age checks passed`);
await pg.close();
process.exit(0);
