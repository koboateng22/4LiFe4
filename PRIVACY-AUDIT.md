# 4Life privacy audit (12 November 2026)

This report supports the Privacy Policy draft at `/privacy`. The policy text is in `src/content/privacyPolicy.ts` and the page is in `src/components/privacy/PrivacyPage.tsx`. Every statement in the policy was checked against the code, the migrations and, where possible, the live deployment.

The policy is **a draft for review, not a statement that 4Life complies with the law**. Have it reviewed by a qualified Ghanaian data-protection lawyer before relying on it. The page says it is a draft until `POLICY.status` is changed to `'final'`.

Sources checked:
- the Data Protection Act, 2012 (Act 843), from a scan of the Act: sections 17–40;
- the Data Protection Commission's registration guidance;
- Groq's API data documentation;
- Google's Gemini API terms;
- the live response headers.

---

## 1. Data inventory

| Category | What is collected | Where it is stored | Purpose | Who can access it |
|---|---|---|---|---|
| **Account** | Email, password (as a hash), Google identity if used (name, email, picture URL), phone if phone sign-in is used, role | Supabase Auth (`auth.users`) | Sign-in, account management | The person; Supabase; 4Life admins (dashboard) |
| **Profile** | Full name (`display_name`), community name, age, region, language, theme, text size, focus area, faith preference and tradition, streak, location consent | `profiles` | Personalisation, AI tailoring, counsellor matching | The person; admins. After this audit, linked therapists see only community name, age, focus, streak and location consent |
| **Profile settings** | Everything else in the profile (`profiles.settings`): gender, area/address, AI companion name and avatar, voice tone, reminder and sleep times, calming triggers, **latest mood and craving**, counters, blocked sites | `profiles.settings` (jsonb) | App preferences | The person; admins. **Before this audit, also linked therapists** (fixed) |
| **Support contacts** | Name, phone, email, relationship | `support_contacts` | SOS handoff | The person only (and admins) |
| **Recovery records** | Check-ins (mood 1–5, craving 0–10), goals, homework, safety plan, thought records | `checkins`, `goals`, `homework`, `safety_plans`, `thought_records` | Recovery support | The person. A linked therapist sees check-ins only while the person shares them, thought records only when marked shared, and goals, homework and safety plans they work on together |
| **AI conversations** | Messages and replies (last 80), "what helped" | **The device only** (localStorage, cleared after 7 days unused) | AI support | The person. Sent per request to Groq, or Gemini as fallback, through 4Life's server; not stored on the server |
| **Counselling** | Requests (focus, time, format, service, message, sharing choice, plus a 7-day check-in snapshot if shared), sessions, session notes (DAP, risk, mood rating), note versions, private notes, risk level, escalations | `session_requests`, `sessions`, `session_notes`, `session_note_versions`, `private_notes`, `care_links`, `escalations` | Session management, clinical records | Client: requests and sessions. Therapist: their own clients' records. Notes are therapist-only |
| **SOS** | Alert status, location status, coordinates/accuracy/area/time (only with consent; stripped by a trigger otherwise), help options opened, acknowledgement, therapist location requests | `sos_events`, `emergency_incidents`, `emergency_notifications`, `emergency_incident_events`, `location_requests` | Emergency support | The person; linked therapists (location only with consent) |
| **Global Village** | Posts, replies, circle messages (with community name), reactions, reports, blocks, RSVPs | `village_*`, `circle_*` | Peer support, moderation | All signed-in members see posts under the community name; admins review reports |
| **Therapists** | Name, title, profession, experience, specialties, languages, region, location, hours, fee, bio, licence body and number, agreement timestamps, services, days off | `therapists`, `therapist_credentials`, `therapist_services`, `therapist_time_off` | Directory, verification, scheduling | Public profile: signed-in users once verified. Licence: owner and admins |
| **Audit** | Actor, table, operation, row key, time (no content) | `audit_log` | Accountability | Admins |
| **Device** | Supabase session token, language, theme, map place cache, queued offline SOS, app files (service worker) | Browser storage, Cache Storage | Function and offline use | The device |
| **Technical** | IP address and user agent (Vercel and Supabase logs), client error reports (message, page, code location; max 5 per visit), AI outcome log lines (provider, failure reason, token counts; no content, no user ID), IP held in memory for rate limiting | Vercel and Supabase logs | Security and debugging | 4Life operators; the providers |

There are no analytics, no advertising, no cookies set by 4Life, no file uploads and no push notifications.

## 2. Third-party providers and their roles

| Provider | Role | Receives | Region (verified where possible) |
|---|---|---|---|
| Supabase | Database, auth, auth emails, Edge Functions | Everything in the cloud database; sign-in logs | Edge Functions answered from **eu-central-1 (Frankfurt)**. **Database region not visible from outside: confirm in the dashboard** |
| Vercel | Hosting and `/api` functions | All requests (IP, user agent); AI request bodies in transit | Functions in **iad1 (Washington, D.C., USA)** (live `x-vercel-id`) |
| Groq | Main AI | Prompt (see section 3) | Groq's data centres |
| Google (Gemini API) | Backup AI | Same, only on Groq failure | Google |
| Google (YouTube Data API and embeds) | Videos | Server: topic or the person's Learn search words (no user data). Browser: IP when a video is played (youtube-nocookie) | Google |
| Google (OAuth) | Optional sign-in | Identity confirmation | Google |
| OpenStreetMap services (tile.openstreetmap.org, nominatim.openstreetmap.org; public Overpass servers overpass-api.de and overpass.kumi.systems; OSRM demo server router.project-osrm.org) | Maps, nearby places, place names, routes | **The person's coordinates** and IP, from the browser | Europe |
| Email and SMS for auth | Confirmation and reset emails; phone codes | Email address or phone number | **Unknown: configured in the Supabase dashboard** |

## 3. What reaches the AI providers (after this audit)

- **Chat:** the message, the last 12 turns (8,000 characters at most), and this profile subset: community name, AI name, language, focus, latest mood and craving, faith preference and tradition, region, and helpful coping steps. Defined in `src/lib/aiProfile.ts`.
- **Thought-record helper:** situation, thought, emotion, and language.
- **Circle guide:** question, circle name, community name, and language.
- **Village moderation:** the text being posted.
- **Never sent:** email, full name, age, phone numbers, contacts, user ID, location.

## 4. Fixes made in this change (safe, non-destructive)

1. **Therapists could read a client's whole profile row** (RLS policy "profiles: therapist reads linked clients"). That row includes `settings` with the client's latest mood and craving, gender and area. This **bypassed the client's choice to keep check-ins private**.
   - Fix: migration `20261112000011_privacy.sql` drops the policy and adds `my_client_profiles()`, which returns only community name, age, focus, streak and location consent for linked, non-discharged clients.
   - The workspace uses this function. It falls back to the old six-column read only if the function doesn't exist yet.
2. **Every AI request sent the whole profile to 4Life's server.** That included email, contacts' phone numbers, address and, for device accounts, the PIN.
   - Fix: requests now carry only the fields each prompt uses.
   - Unit tests prove the prompts are byte-for-byte unchanged.
3. **"Download my data" was incomplete.** Now added:
   - the sign-in email;
   - Village reactions, reports, blocks and RSVPs;
   - circle messages;
   - location requests;
   - therapist licence details, services and days off.

   Records about other people (for example who you blocked, by ID) are left out.
4. **Inaccurate statements corrected** across the app:
   - sign-in "Private and confidential";
   - sign-up "Only you — and a counsellor you choose — can see your information";
   - the safe-space promise ("my recovery data stays private");
   - "Only you see it" on the name and faith fields;
   - Settings "stays on this device";
   - FAQ "Nobody else";
   - booking "never shared";
   - footers "Confidential";
   - the circle guide's "only you see".

   The Privacy Policy is linked from sign-in, sign-up, onboarding, Settings, the AI chat disclosure, the app and therapist footers, and quick search.

Tests:
- `npm run test:privacy-db`: 24 checks;
- `npm run test:privacy`: 42 checks in Chrome;
- 13 new unit checks.

## 5. Gap report: decisions and work still needed

Ranked by severity. None of these were changed, because each needs a legal, product or provider-account decision.

| # | Gap | Why it matters | Recommendation |
|---|---|---|---|
| 1 | **Account deletion is impossible for some clients.** `escalations` and `session_note_versions` reject every delete (append-only triggers) but cascade from the client's profile. Deleting a client with any crisis-log entry or signed-note history fails (verified in PGlite: "escalations is append-only"). | s.33 deletion requests can't be honoured, and there is no deletion button at all. `request_account_deletion()` exists but nothing in the UI calls it | Decide (legal) whether these clinical records must outlive the account. If yes: change the foreign keys to `on delete set null` and anonymise the client reference. If no: allow a controlled admin-only delete. Then add Settings → "Delete my account" (re-authenticate, explain what is kept, call a server function using the service role, and log it) |
| 2 | **Gemini free tier.** Google's terms: no sensitive or personal information on unpaid services; prompts may be read by human reviewers and used to improve products; 18+ only; not for apps likely used by under 18s | Recovery chats are health data (s.37) | Enable billing on the Gemini project (paid tier), or disable the Gemini fallback (`FALLBACK_AI_PROVIDER=none`) |
| 3 | **Minors.** Sign-up allows 13+. No parental or guardian consent. s.37 lists "a child who is under parental control" as special personal data. Gemini and likely Groq terms are 18+ | Legal exposure, and a terms breach with AI providers | Decide the minimum age (raising it to 18 means changing `MIN_AGE`, the DB check and the sign-up trigger). If keeping 13–17, design a guardian-consent flow and AI-provider compliance with counsel |
| 4 | **No recorded consent** for special personal data (health, faith). The safe-space promise is a community promise, not consent | s.37(2)(b) consent, or a documented necessity basis | Legal basis decision. If consent: add a separate, specific, unticked checkbox at sign-up and store `{policyVersion, consentedAt}` (for example in `profiles.settings` or a `consents` table), with a way to withdraw |
| 5 | **Retention clean-ups may not be running.** `purge_expired_locations` (30 days), `purge_old_circle_messages` (7 days) and `purge_expired_incidents` (24 h and 90 days) exist, but no migration schedules them | The policy can't promise these periods until confirmed | In Supabase: enable pg_cron and run the three `cron.schedule(...)` lines from the migrations. Then remove the "To be confirmed" notes |
| 6 | **Crisis location goes to free public map servers.** Overpass, Nominatim and the OSRM demo have no agreement with 4Life and fair-use limits | Third-party processing of location data (s.30 written contract). Also reliability during an emergency | Use a provider with terms (or self-host), set `VITE_OVERPASS_URL`, `VITE_NOMINATIM_URL` and `VITE_OSRM_URL`, and describe it in the policy |
| 7 | **No written processor agreements confirmed** (Supabase, Vercel, Groq, Google) | s.30(2) requires a written contract; s.30(4) covers processors outside Ghana | Accept each provider's DPA in their dashboards, and keep copies |
| 8 | **Groq zero data retention** not confirmed | Abuse logs of up to 30 days may hold chat content | Turn on ZDR in Groq → Data Controls |
| 9 | **Data Protection Commission registration** not confirmed | s.27(1): a controller must register; renewal every 2 years | Register at dataprotection.org.gh and put the number in `VITE_PRIVACY_DPC_REGISTRATION` |
| 10 | **Clients cannot obtain their counsellor's notes and crisis log** (not in the export) | s.35 access, with confidentiality limits | Legal decision. If required, add a reviewed export path |
| 11 | **Admins can read every profile** (`profiles: admin reads all`) | Least privilege | Keep the admin group minimal, and log admin reads |
| 12 | **Client error reports** may contain personal data in error messages | Logs | Keep as is (capped and short), but avoid user data in thrown messages |
| 13 | **Clients can read their therapist's full profile row** ("profiles: client reads own therapists") | The therapist's own `settings` | Narrow it, as was done for therapists, if not needed |
| 14 | **Live `/api` AI routes don't require sign-in** (`REQUIRE_SIGN_IN` unset on Vercel) | Abuse and cost; no user data is exposed | Set `REQUIRE_SIGN_IN=true` in Vercel (already on LAUNCH.md) |
| 15 | **No breach-response procedure** | s.31 requires notifying the Commission and the people affected | Write a short incident runbook |

## 6. Information you must supply

These are set as Vercel environment variables, then redeploy:
- `VITE_PRIVACY_OPERATOR`: the legal name of the organisation that runs 4Life;
- `VITE_PRIVACY_EMAIL`: the privacy contact email;
- `VITE_PRIVACY_ADDRESS`: the registered address (s.27(2)(b) requires the name and address of the person responsible);
- `VITE_PRIVACY_DPO`: optional, a data protection contact;
- `VITE_PRIVACY_DPC_REGISTRATION`: once registered with the Data Protection Commission.

These you answer, and the "To be confirmed" notes in `privacyPolicy.ts` are then replaced:
- the Supabase database region;
- the auth email provider and the SMS provider;
- the Gemini tier;
- Groq ZDR;
- whether the pg_cron clean-ups are scheduled;
- the DPAs in place.

## 7. Questions for a qualified Ghanaian data-protection lawyer

1. What is the legal basis for processing health and religious-belief data (s.37): consent, or necessity? If consent, what form, and how should it be recorded?
2. Users aged 13–17: does s.37(1)(a) require a guardian's consent? What is a workable minimum age?
3. Must counsellors' session notes, crisis logs and note history be kept after a client deletes their account? For how long, and in what form?
4. Should clients be able to access their counsellors' notes about them (s.35), and with what exceptions?
5. Are 4Life and the counsellors joint controllers of counselling records, or is 4Life a processor for counsellors?
6. Are the transfers to processors in the USA and Europe adequately covered by provider DPAs under s.18 and s.30?
7. Does the draft meet every item of s.27(2) (what people must be told), including the consequences of not providing data?
8. What breach-notification timeline and format should be followed (s.31)?
9. Do the Gemini and Groq terms (18+, no sensitive data on unpaid tiers) conflict with 4Life's audience?

## 8. Tests performed (12 November 2026)

| Test | Result |
|---|---|
| `npm run test:privacy-db`: therapist access, sharing, SOS consent, discharge, export contents, nothing of others in an export | 24/24 passed |
| `npm run test:privacy`: `/privacy` page (direct load, refresh, `#section`, contents, search, outside links, placeholders, light and dark, 390px) and links from sign-in, sign-up, Settings, both footers and quick search | 42/42 passed |
| `npm run test:unit`: AI requests minimised with prompts unchanged, contacts from settings, policy has no absolute claims and has https links | 224/224 passed |
| Account deletion with a crisis-log entry (PGlite) | **Refused**: gap 1 |
| `npm run test:emergency`, `test:account-db`, `test:schedule-db` | All passed (91, 12, 23) |
| `npm run test:i18n` | All 27 languages complete |

See CHANGES.md for the full regression run.
