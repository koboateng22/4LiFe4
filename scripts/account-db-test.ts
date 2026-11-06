/**
 * Account settings in a real PostgreSQL (PGlite) with every migration applied and Row Level
 * Security on: the theme choice is saved on the account, and only its owner can change it.
 *   npx tsx scripts/account-db-test.ts
 */
import { testDatabase, asUser, CLIENT, OTHER, THERAPIST } from './emergency-db-test';

let n = 0;
const ok = (c: unknown, what: string) => {
  if (!c) throw new Error('FAIL: ' + what);
  n++;
  console.log('ok ', what);
};
const fails = async (p: Promise<unknown>) => p.then(() => false, () => true);

const pg = await testDatabase();

// New accounts follow the device unless they chose something before signing up
await pg.query(`insert into auth.users (id, email, raw_user_meta_data) values
  ('66666666-6666-4666-8666-666666666666', 'new@it.test', '{"nickname":"New_One"}'),
  ('77777777-7777-4777-8777-777777777777', 'dark@it.test', '{"nickname":"Dark_One","theme":"dark"}'),
  ('88888888-8888-4888-8888-888888888888', 'odd@it.test', '{"nickname":"Odd_One","theme":"purple"}')`);
const themeOf = async (id: string) => (await pg.query<{ theme: string }>(`select theme from public.profiles where id = $1`, [id])).rows[0]?.theme;
ok((await themeOf('66666666-6666-4666-8666-666666666666')) === 'system', 'a new account follows the device (system) by default');
ok((await themeOf('77777777-7777-4777-8777-777777777777')) === 'dark', 'a theme chosen before signing up is kept');
ok((await themeOf('88888888-8888-4888-8888-888888888888')) === 'system', 'an unknown theme from sign-up becomes system, without failing the sign-up');

// The owner can choose light, dark or system; nothing else is accepted
for (const theme of ['dark', 'system', 'light']) {
  await asUser(pg, CLIENT, `update public.profiles set theme = $1 where id = $2`, [theme, CLIENT]);
  ok((await themeOf(CLIENT)) === theme, `a client can choose the ${theme} theme for their account`);
}
ok(await fails(asUser(pg, CLIENT, `update public.profiles set theme = 'purple' where id = $1`, [CLIENT])), 'any other theme value is refused');

// A therapist's theme lives on their own profile row too
await asUser(pg, THERAPIST, `update public.profiles set theme = 'dark' where id = $1`, [THERAPIST]);
ok((await themeOf(THERAPIST)) === 'dark', 'a therapist can save their theme on their account');

// Nobody can change someone else's theme (RLS: the update matches no rows)
await asUser(pg, OTHER, `update public.profiles set theme = 'dark' where id = $1`, [CLIENT]);
ok((await themeOf(CLIENT)) === 'light', "another person cannot change someone's theme");
await asUser(pg, null, `update public.profiles set theme = 'dark' where id = $1`, [CLIENT]).catch(() => {});
ok((await themeOf(CLIENT)) === 'light', 'a signed-out visitor cannot change it either');

// Google / phone sign-ins arrive with no community name or age: the trigger still makes a client profile
await pg.query(`insert into auth.users (id, email, raw_user_meta_data) values ('99999999-9999-4999-8999-999999999999', null, '{}')`);
const phoneRow = (await pg.query<any>(`select role, nickname, age, theme from public.profiles where id = '99999999-9999-4999-8999-999999999999'`)).rows[0];
ok(phoneRow && phoneRow.role === 'client' && /^member_[0-9a-f]{8}$/.test(phoneRow.nickname) && phoneRow.age === null, 'a phone sign-in with no details gets a client profile, a placeholder community name and no age (the app then asks for both)');
ok(
  await fails(pg.query(`insert into auth.users (id, email, raw_user_meta_data) values ('aaaaaaaa-9999-4999-8999-999999999999', 'g@it.test', '{"full_name":"Kofi Mensah","role":"therapist"}')`)),
  'a sign-in that claims to be a therapist without a licence is refused, so it can never become a therapist account'
);
console.log(`All ${n} account database checks passed`);
