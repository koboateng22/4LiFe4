# Connecting 4Life to Supabase

4Life runs in two modes:

| | Device mode (default) | Supabase mode |
|---|---|---|
| When | `VITE_SUPABASE_URL` is empty | `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are set |
| Accounts | Stored in the browser, 4-digit PIN | Supabase Auth, email + password (min. 8 characters) |
| Data | This browser only | Your Supabase database, protected by Row Level Security |
| Client ↔ therapist | Only on the same device | Any device, live updates through Realtime |
| Demo accounts | Built in (PIN 1234) | Created with `npm run db:seed-demo` |

Nothing else changes for the user. If the settings are missing, the app keeps working in device mode.

---

## 1. Set up the project (about 15 minutes)

1. **Create a project** at [supabase.com](https://supabase.com). Pick the region closest to your users. For Ghana that is currently a European region, so check the latency.
2. **Auth settings** (Authentication → URL Configuration):
   - Set **Site URL** to where the app runs, e.g. `http://localhost:3000`, and later your real domain.
   - Add the same address under **Redirect URLs**. Confirmation and password-reset links point there.
   - Keep **Confirm email** switched on (Authentication → Providers → Email). The app shows a "Check your email" screen after sign-up.
   - **Send real email.** Supabase's built-in sender only reaches your own team and is heavily rate-limited, so people can't confirm their accounts. Using Resend: verify your domain in Resend, then go to Authentication → Emails → SMTP Settings and set host `smtp.resend.com`, port `465`, username `resend`, password = your Resend API key, and a sender address on the verified domain. Saving the key with `supabase secrets set` does **not** do this: those secrets only reach Edge Functions, and no 4Life function sends email.
3. **Create the database.** Either:
   - **Supabase CLI** (recommended, keeps history):
     ```bash
     npm i -g supabase          # or: npx supabase …
     supabase init              # once; keeps the existing supabase/migrations folder
     supabase link --project-ref YOUR-PROJECT-REF
     supabase db push           # runs every file in supabase/migrations in order
     ```
   - **or the SQL editor**: paste and run each file in `supabase/migrations/`, in name order.
4. **Check it.** Run `supabase/tests/database_checks.sql` in the SQL editor (or `psql`). It signs in as test people inside a transaction, checks 41 privacy and workflow rules, and rolls everything back. It ends with `All database checks passed`.
5. **Connect the app.** Copy `.env.example` to `.env.local` and fill in:
   ```
   VITE_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
   VITE_SUPABASE_ANON_KEY=…        # Project Settings → API → anon / publishable key
   ```
   Restart `npm run dev`.
6. **Optional demo data** (development projects only):
   ```
   SUPABASE_SERVICE_ROLE_KEY=…     # Project Settings → API → service_role. Never commit it or ship it.
   npm run db:seed-demo
   ```
   This creates three accounts, all with the password `Demo-4Life-2026` (change it with `DEMO_PASSWORD=…`):
   - `ama@4life.org`, a verified therapist
   - `kwame@4life.org`, a client who shares their location in a crisis
   - `akosua@4life.org`, a client
7. **Make yourself an admin** (SQL editor):
   ```sql
   update public.profiles set role = 'admin'
   where id = (select id from auth.users where email = 'you@example.com');
   ```
8. **Schedule location clean-up** (Database → Extensions → enable `pg_cron`, then in the SQL editor):
   ```sql
   select cron.schedule('purge-old-locations', '15 3 * * *', $$select public.purge_expired_locations()$$);
   ```
   This removes exact SOS coordinates after 30 days. The alert itself stays in the record.
   Also clear old group-circle chat (kept for 7 days):
   ```sql
   select cron.schedule('purge-circle-chat', '30 3 * * *', $$select public.purge_old_circle_messages()$$);
   ```

---

## 2. What is in the database

| Area | Tables |
|---|---|
| People | `profiles` (everyone), `therapists` (public profile), `therapist_credentials` (licence details: owner and admins only), `support_contacts` (client only) |
| The link | `care_links`: client ↔ therapist, with the client's sharing choice and the therapist's risk level. **Every sharing rule checks this table.** |
| Client data | `checkins`, `goals`, `homework`, `safety_plans` |
| Therapy | `session_requests`, `sessions`, `session_notes` (therapist only), `session_note_versions`, `private_notes` (therapist only) |
| Emergencies | `sos_events`, `location_requests`, `escalations` (append-only) |
| AI therapy | `thought_records` (client-owned; a linked therapist sees only records marked shared). AI chat conversations are **not** stored — they stay on the phone. |
| Global Village | `village_posts`, `village_replies`, `village_support`, `village_reports`, `village_blocks`, `village_circles`, `circle_messages` |
| Instant EMS | `emergency_centers`, `emergency_hotlines` (only numbers with `verified_at` are shown) |
| Oversight | `audit_log`: who changed sensitive records and when. It never copies the content. |

### Who can see what

- **A client** sees and edits their own data. They can read their sessions and homework, but **not** session notes or private notes.
- **A therapist** sees a client only after accepting that client's request. They see:
  - check-ins only while the client shares them (the client can switch this off at any time);
  - an SOS location only if the client turned on *Share my location with my counsellor if I press SOS*. Otherwise the database removes the coordinates before saving.
- **Therapist directory:** only verified therapists appear. Licence numbers stay private.
- **Admins** verify therapists (`select public.review_therapist('<therapist id>', true, 'Checked against the register');`) and can read the audit log.

### Rules the database enforces (not just the app)

- Nobody can give themselves the admin role. A therapist cannot verify themselves, and changing licence details sends them back to *pending*.
- Only the client changes what they share. Only the therapist sets the risk level.
- Care links are only created by accepting a request (`accept_session_request`).
- Signing a note (`sign_session_note`) is one transaction. It completes the session, sets the risk level, adds homework and books the next session.
- After a note is signed, every later change to it keeps the previous version.
- The escalation record, note versions and the audit log cannot be edited or deleted, not even by the database owner.
- An SOS sets risk to high for every active therapist of that client and starts their escalation record.

### Global Village rules in the database
- Every post, reply and circle message is signed with the author's own community name — nobody can post as someone else.
- Posts can't be edited (delete and post again). Posting is rate-limited (5 posts an hour, 30 replies an hour, 20 circle messages in 5 minutes).
- Three reports from different people hide an item for everyone except its author, until an admin reviews it.
- Blocking someone hides their posts, replies and circle messages for you.
- Phone numbers, emails, slurs and "kill yourself"-type harassment are refused by the database itself. The app and server check the fuller house rules before sending (insults, explicit slang, drug sourcing, crisis words); someone calling the database directly could skip those, so reports and admin review are the backstop.
- Anything you report disappears for you straight away. A therapist cannot reopen a care link after it has ended, so shared thought records stop being visible.

**Reviewing reports** (SQL editor):
```sql
select r.created_at, r.target_type, r.reason, r.note, coalesce(p.title, rp.body, m.body) as content
from public.village_reports r
left join public.village_posts p   on r.target_type = 'post'  and p.id = r.target_id
left join public.village_replies rp on r.target_type = 'reply' and rp.id = r.target_id
left join public.circle_messages m on r.target_type = 'circle_message' and m.id = r.target_id
where r.resolved_at is null order by r.created_at;
-- Keep it hidden (or delete it), then mark the reports resolved:
update public.village_reports set resolved_at = now() where target_id = '<id>';
-- Or restore it:
update public.village_posts set hidden = false where id = '<id>';
```

**Group circles** are rows in `village_circles` (weekday 0 = Sunday, time in Ghana time/GMT). Add, change or switch off circles there.

### Emergency numbers
Only hotlines with a `verified_at` date are shown. Before launch, call every number and centre yourself, then record it:
```sql
update public.emergency_hotlines set verified_at = current_date, source = 'Called by <name>' where id = 'gh-mha';
update public.emergency_centers  set verified_at = now() where id = 'ems-1';
```
Keep `CHECKED_HOTLINES` in `src/lib/ems.ts` (used offline and without Supabase) in step with the table.

### Workflows you can call (`supabase.rpc(...)`)

| Function | Who | What it does |
|---|---|---|
| `accept_session_request(p_request, p_starts_at)` | therapist | Links the client and books the first session |
| `decline_session_request(p_request, p_reason)` | therapist | Closes the request (the reason is not shown to the client) |
| `sign_session_note(p_session, p_next_starts_at)` | therapist | See above |
| `export_my_data()` | anyone signed in | Everything stored about them, as JSON (Settings → Download my data) |
| `request_account_deletion()` | anyone signed in | Marks the account; an admin completes it after any required record-keeping |
| `review_therapist(p_therapist, p_verified, p_note)` | admin | Verify or reject a licence |
| `purge_expired_locations(p_days)` | scheduled job | Removes old SOS coordinates |

---

## 3. Looking after the database

- **Changing the schema:** never edit a migration that has already run. Add a new file, e.g. `supabase migration new add_reminders`, write the SQL, then run `supabase db push`. To capture changes made in the dashboard, run `supabase db diff -f name`.
- **Types for the app:** run `supabase gen types typescript --linked > src/lib/db/database.types.ts` after each schema change if you want typed queries.
- **Tests:**
  - `supabase/tests/database_checks.sql` checks privacy and workflows (77 checks).
  - `npm run test:unit` checks the parts that need no database, and that the Edge Functions use the same code as the API.
  - `scripts/integration-test.ts` runs the app's real data layer (`src/lib/db/*`, thought records and the Village) against a local database (40 checks). To run it:
    ```bash
    supabase start                       # local Supabase on port 54321
    supabase db reset                    # applies the migrations
    psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -f supabase/tests/integration_users.sql
    npx tsx scripts/integration-test.ts
    ```
- **Backups:** daily backups are included on paid plans, and point-in-time recovery is an add-on. On the free plan, export regularly (`supabase db dump`).
- **Audit:** to see recent changes to sensitive records:
  ```sql
  select at, actor, table_name, op, row_key from public.audit_log order by at desc limit 100;
  ```
- **Deletion requests:**
  ```sql
  select id, nickname, deletion_requested_at from public.profiles where deletion_requested_at is not null;
  ```
  Decide what clinical records must be kept, then delete the user in Authentication → Users. Their rows are removed with them.

---

## 4. The app's code

- `src/lib/supabase.ts` creates the connection, switches between modes, and turns errors into plain messages.
- `src/lib/db/clientApi.ts` handles the client side: sign-in and sign-up, profile, check-ins, the counsellor directory, booking, SOS, data export.
- `src/lib/db/therapistApi.ts` handles the therapist side: profile, loading the caseload, edits, notes, requests, crisis tools, and live updates.
- `src/lib/remoteHooks.tsx` restores the session on load, saves the profile in the background, answers location requests and handles password resets.
- `src/lib/apiFetch.ts` calls the backend: `/api/...` on the app's own site first, and the matching Edge Function if `/api` is missing or down (set `VITE_API_BACKEND=supabase` to try the Edge Functions first). It sends the signed-in person's token with every call.

---

## 5. Edge Functions (`supabase/functions`)

The same backend runs in two places, from one copy of the code:

| What | Vercel (`/api/...`) | Edge Function | Sign-in |
| --- | --- | --- | --- |
| AI CBT chat (streamed) | `POST /api/chat` | `chat` | needed |
| Thought record helper | `POST /api/cbt/suggest` | `cbt-suggest` | needed |
| Village house-rules check | `POST /api/moderate` | `moderate` | needed |
| Circle guide | `POST /api/village/guide` | `village-guide` | needed |
| First aid videos | `GET /api/first-aid/videos?topic=` | `first-aid-videos` | open |
| Health check | `GET /api/health` | `health` | open |
| Crash reports | `POST /api/client-error` | `client-error` | open |

**How the code is shared**

```
server/core/          ← edit here: what each route does (plain TypeScript, no Node or Express)
src/lib/{safety,aiTrailer,cbt,firstAid}.ts  ← shared with the app
        │  npm run sync:functions
        ▼
supabase/functions/_shared/core/   ← generated copy with Deno-style ".ts" imports (don't edit)
supabase/functions/_shared/http.ts ← CORS, sign-in, rate limit, JSON for Deno
supabase/functions/<name>/index.ts ← one small file per function
```

After changing anything in `server/core` or those `src/lib` files, run `npm run sync:functions`. `npm run test:unit` fails if the copy is out of date.

**Deploy**

```bash
supabase login
supabase link --project-ref <your-project-ref>
supabase secrets set GEMINI_API_KEY=… YOUTUBE_API_KEY=…   # YouTube is optional
supabase functions deploy                                  # deploys every function
```

Optional secrets: `GEMINI_MODEL`, `OPENAI_API_KEY` and `OPENAI_MODEL` (used only when there is no Gemini key), `RATE_LIMIT_PER_MINUTE` (default 30), `REQUIRE_SIGN_IN`. Supabase provides `SUPABASE_URL` and `SUPABASE_ANON_KEY` itself.

**Sign-in.** `supabase/config.toml` turns off the gateway's JWT check (`verify_jwt = false`) because the app's publishable key (`sb_publishable_…`) is not a JWT. Each function checks the person's access token itself (`server/core/guard.ts`). Unlike the Vercel API, the AI functions **require sign-in by default** because their address is public; set the secret `REQUIRE_SIGN_IN=false` to open them.

**Try one locally**

```bash
supabase start
supabase functions serve            # all functions on http://127.0.0.1:54321/functions/v1/<name>
curl http://127.0.0.1:54321/functions/v1/health
```

The rate limit lives in each function instance's memory, so treat it as a brake, not a quota.

## 6. Not included yet

- **Push notifications.** Live updates arrive only while the app is open. To alert a therapist whose app is closed, add an Edge Function that sends a push or SMS when a row is added to `sos_events`.
- **Guest mode** stays on the device. AI chat history is not stored on the server, by design.
- **Peer support calls** and **video circles** are not built. Circles are text chat.
- **Messages to support contacts** open the phone's own SMS or WhatsApp with the message ready; the person presses send. Automatic server-sent SMS (e.g. through a Ghana SMS provider) is not built.
- **Legal and data protection.** This is health data. Check what Ghana's Data Protection Act, 2012 (Act 843) requires, including registering with the Data Protection Commission, and how long clinical notes must be kept.
