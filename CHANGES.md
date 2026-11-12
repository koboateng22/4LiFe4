# 4Life — therapist workspace: calendar, services, breaks and days off (12 November 2026)

This is part 1 of the therapist workspace work. Part 2 covers the Today dashboard, a notification centre and client-management polish.

**Two faults fixed:**
- **Booking ignored the therapist's hours.** The client's booking screen offered 10:00, 14:00 and 16:00 every day except Sunday, whatever the therapist had set. It now offers only real free times: the therapist's days and hours, minus their break, days off and booked sessions, at least 2 hours ahead. In Supabase mode the database works these out (`therapist_free_slots`); on a device without Supabase the same rules run in the browser (`src/lib/schedule.ts`).
- **Nothing stopped double-booking.** The database now refuses any booked session that overlaps another for the same therapist, however it is written (accepting a request, booking, moving). It uses a per-therapist lock, so two requests at the same moment can't both get the time. The screens check first and say so plainly.

**New in the therapist workspace:**
- **Calendar** in Sessions, with Day, Week and Month views. Working hours are plain; closed hours, the break and days off are shaded; a line marks now. Click a session for its details, then open it, move it (an overlap is refused) or cancel it (with a confirmation). Click a free time to book a session there. On phones it opens on the day. The Coming up, Past and Notes to finish lists are unchanged.
- **Services** (new section): add, edit, pause or delete services, each with a name, description, length (15–180 minutes), price and ways to meet. Clients choose one when they book; its length decides which times are free, and accepting books that length. Paused services can't be chosen, and booked sessions are kept.
- **Availability**: an optional daily break, and days off (one day or a range, with a private note). Booking a session for a client now refuses an overlapping time (it used to allow it with a warning), and can be for a service.
- **Requests** show the service asked for and its length, and accepting a time that clashes isn't possible.

**Apply migration `20261112000010_scheduling.sql`.** It is forward-only: new columns, two new tables with access rules, the overlap check, the free-times function and the request-service check. Existing sessions are not re-checked, so it applies cleanly.

Tests: `npm run test:schedule-db` (23 database checks, including that the database and the browser agree on free times to the minute), `npm run test:therapist-schedule` (33 checks in Chrome, covering the whole flow from the therapist's set-up to a client's booking and back), and more unit checks. Every new text is in all 27 languages.

# 4Life — sign-in always comes back to 4Life (11 November 2026)

- **Every sign-in link now returns to 4Life's own callback page,** `/auth/callback`: confirm sign-up, send the link again, reset password, and Google. They used to use whatever address the person was on, so a link started from a preview or protected Vercel address pointed back there.
- **Trusted addresses only.** The public site (`VITE_APP_URL`), localhost, and any extra preview addresses in `VITE_AUTH_REDIRECT_ORIGINS` are used as they are. Anything else falls back to `VITE_APP_URL` (`src/lib/authRedirect.ts`).
- **The callback page** waits for Supabase to finish the sign-in, then goes back to the plain address (so the tokens leave the address bar and a refresh starts normally). It opens the section the person was heading for, such as a home-screen shortcut to Instant EMS, and only if it is a real 4Life section. Addresses in a link are never followed. Expired or used links show their message and also leave the callback address.
- **The live problem needs one dashboard change.** Checked today, the live Supabase project sends every link, including `https://4lifeee.vercel.app/auth/callback`, to its Site URL `https://4lifeee-4-life4.vercel.app`, which shows a Vercel log-in. Set Site URL and Redirect URLs as in SUPABASE.md, section 1, and `VITE_APP_URL` in Vercel.
- New `npm run test:auth-redirect`: the callback in Chrome against a pretend Supabase, covering confirmation, the intended section, refresh, an expired link, an outside address, and a protected address. There are also more unit checks.

# 4Life — Groq first with Gemini as backup, floating side buttons, and the sign-in check (11 November 2026)

**AI: Groq answers, Gemini takes over.** There was no Grok or xAI code anywhere in the project, in its history, migrations, settings or scripts, so there was nothing of it to remove. The AI layer (`server/core/ai.ts`) now has two providers, in an order set by `PRIMARY_AI_PROVIDER` / `FALLBACK_AI_PROVIDER`:
- **Groq** answers first (`GROQ_API_KEY`, `GROQ_MODEL`, default `openai/gpt-oss-120b`), streamed. The gpt-oss models are asked to keep their reasoning short and out of the reply.
- **Gemini** takes over automatically (`GEMINI_API_KEY`, `GEMINI_MODEL`, default `gemini-3.5-flash-lite`) when Groq is busy or failing, can't be reached, is too slow, is rate-limited or out of its daily quota, or sends nothing. It gets the same instructions and conversation, and only if nothing has been shown yet, so two answers are never mixed.
- A refused key, a missing model or a bad request is reported, not worked around. Groq is retried once before Gemini; there are no retry loops.
- The thought-record helper, the Village post check and the circle guide use the same order and fallback.
- Each reply logs one line: who answered, what failed first and why, and the tokens used. The person's words and keys are never logged. `/api/health` shows which providers are on, their models, and the Supabase project ID.
- The old OpenAI option is removed: the app has only the two free-tier providers now. `npm run ai:check` sends real conversations to Groq alone, Gemini alone and in the normal order.

**Side navigation on computers.** The long panel is now a column of separate frosted glass buttons. Each shows its name beside it on hover, on keyboard focus (with a visible focus ring), or for a moment after a press on a touch screen. The current page has a tint, a soft ring and a small bar on its edge. It works in light, dark and system themes, with a solid fallback where blur isn't supported, and stays still if motion is reduced. Every destination is unchanged. On phones and tablets the drawer works as before. The collapse button is gone, since the column is always narrow.

**Sign-in: is 4Life tied to another app?** No. Nothing in the code, migrations, functions or git history refers to another app. The live app uses one Supabase project, and it has 4Life's own tables and none from another app. What does go wrong is outside the code:
- In that project's Auth settings, the **Site URL** is `https://4lifeee-4-life4.vercel.app`, which sits behind **Vercel Authentication**. The public address, `https://4lifeee.vercel.app`, is **not** on the **Redirect URLs** list.
- So confirmation and password-reset links send people to a Vercel log-in page instead of 4Life.
- Fix it in the dashboards (SUPABASE.md section 1, LAUNCH.md). Separately, the live site has no AI key set (`/api/health`: no Gemini key), which is why its chat gave built-in replies.

# 4Life — the AI chat: real Gemini answers or an honest reason (8 November 2026)

**Why the chat seemed broken.** Whenever Gemini couldn't answer, the server quietly sent one of four built-in replies instead. That covered a missing or refused key, a rate limit, a used-up free quota, busy servers, or a timeout. The app showed the reply as if the AI had written it, so people got the same generic text whatever they wrote, and only the server logs said why. When the request itself failed, the app showed another canned message in the AI's bubble, with no Try again.

- **No made-up replies.** When there is no AI answer, the chat says what happened. It names the case: not set up, free daily limit used up (it resets each morning, Ghana time), too many people right now (wait N seconds), service busy, too slow, no connection, offline, message blocked, or sign-in needed. It offers **Try again** where that can help. A reply cut off half way keeps what arrived and says so.
- **Try again** resends the same message once, with no duplicate, and is offered only on the latest message. A message whose reply failed is left out of the context sent later.
- **Gemini errors are recognised.** A used-up daily free quota is told apart from a per-minute limit, and from a refused key, a missing model, busy servers and safety blocks. Busy servers and dropped connections are tried again up to twice, with growing waits. A short per-minute wait is tried once. A used-up quota or a bad key is never retried, and the app never switches to a paid service.
- **Model.** The default is now `gemini-3.5-flash-lite`, Google's recommended fast model, on the free tier (checked 8 November 2026). It is set in one place and can be changed with `GEMINI_MODEL`, e.g. `gemini-3.8-flash`.
- **Context.** Each message carries the most recent turns that fit in about 8,000 characters, so follow-ups make sense without re-sending the whole chat every time.
- **The AI's instructions** now also say it cannot contact anyone, and must never claim it called or alerted emergency services, a counsellor or a support person. They also ask it to help notice triggers and patterns, and to point to a counsellor when that would help.
- Server logs record only the failure type and status, never the person's words or the key.
- `npm run ai:check` is now a real end-to-end test. It sends a message and a follow-up through the app's own chat code to Gemini, and checks that the answers stream and keep the context. New `npm run test:chat` checks the chat screen in Chrome against a fake server: streaming, context, one message per press, every failure message, Try again without duplicates, offline, long replies, reload and new conversation.

# 4Life — honest data, theme in Settings, Learn videos, no demo in production, Google and phone sign-in (6 November 2026)

**Fixed: made-up health data**
- The breathing exercise showed an invented heart rate that fell as you breathed, and labelled the craving "Easing". Each round also lowered the person's own craving score, which is sent to their counsellor with a session request, and added 3 "mindful minutes" for a 19-second round. Now it records only the real time spent, and never changes anything the person rated. It also stops after 4 rounds; it used to count on ("Round 5 of 4").
- Guests, and every account loaded from Supabase, started with invented details: Christian faith, Greater Accra, age 20 (guests), craving 3. The AI then used faith-based encouragement nobody asked for. Nothing is assumed now, and the AI is told "craving not rated yet" instead of a number.
- Adding a support person without a number during setup saved `+233 24 000 0000`, which SOS would then text. A real number is now required.

**AI CBT: text no longer cut off**
- Long words and web addresses in a reply ran out of the message bubble and were clipped, at every screen size. They now wrap.
- AI replies showed raw `**stars**` and list markers. Bold, numbered and bullet lists now display properly. The text is never treated as HTML.
- The message box was fixed at one line, so its hint was cut off on phones and longer messages were hidden. It now grows to fit, then scrolls.
- The AI is asked for plain text with at most one bold phrase.

**Theme: only in Settings → Appearance**
- The theme buttons were removed from the top bar, the account menu, the sign-in pages and the therapist top bar. Quick search "Appearance" opens the setting.
- There are now three choices: Light, Dark and **System default** (follows the device, and changes when the device does). New accounts start on System default.
- The choice is saved on the device, applied before the app loads (no flash), and saved on the account so it follows the person to other devices. Therapists choose it on their Profile page. **Apply migration `20261106000009_theme_system.sql`.**

**Demo accounts never reach production**
- The demo client, demo therapist, sample clients, the example session request and sample Village posts are now built into the app only in development, or when `VITE_ENABLE_DEMO=true` is set (for previews). A production build contains none of it; `npm run test:demo-build` checks the built files.
- In device mode, "Forgot PIN" no longer shows the PIN to anyone who types the email (except with demo accounts), and wrong-email and wrong-PIN messages are the same, so the form doesn't reveal which accounts exist.
- `scripts/seed-demo.mjs` refuses to run unless asked explicitly. The new `npm run db:remove-demo` deletes the demo accounts from a Supabase project.

**New: Learn (videos)**
- A new section with short educational videos from YouTube in nine topics. It includes search (kept inside the topic), "Show more", and a topic suggested from what the person is working on.
- Each video shows its title, channel, description, length and topic, with a link to YouTube. Videos play in YouTube's privacy-enhanced player only after a tap.
- The server uses the YouTube Data API v3 with the key kept server-side and strict safe search. It drops videos that are deleted, private, age-restricted, blocked in Ghana or not embeddable. Results are cached for 12 hours, and a daily quota budget applies (`VIDEO_DAILY_UNITS`). There is also a Supabase Edge Function, `library-videos`.
- The page has loading placeholders, a timeout, error, empty and no-key states, and a note that videos don't replace a counsellor.

**New: sign in with Google or a phone number (needs set-up)**
- Both go through Supabase Auth, with Twilio Verify as Supabase's SMS provider; Twilio keys live only in Supabase. They are shown only with `VITE_AUTH_GOOGLE=true` / `VITE_AUTH_PHONE=true`, after the steps in SUPABASE.md, section 6.
- Phone sign-in has a country list, number checks, a 6-digit code, resend after 60 seconds, and plain messages for wrong, expired and undelivered codes.
- A first sign-in this way asks for a community name and an age (13 or older) before the app opens.

**Loading:** if the app hasn't started after 10 seconds, the opening screen says so, offers "Try again", and shows 112 and 193. This works even when the app's code never arrives.

**Tests:** new `test:theme`, `test:learn`, `test:account-db` and `test:demo-build`, plus more unit checks (formatting, prompt, videos, phone and Google sign-in). All new texts are translated into the 26 other languages.

# 4Life — the whole app in 27 languages (6 November 2026)

- **The language menu now changes the whole app.** It used to hand the page to the Google Translate website widget, which Google no longer offers to new sites. It loaded from translate.google.com, so it did nothing offline, behind ad blockers or when Google's script failed. It rewrote React's text behind its back and stopped partway or missed new screens. A separate 8-entry dictionary covered only a few menu labels. Both are gone (`GoogleTranslateBar.tsx`, `utils/translations.ts`, the script in `index.html`).
- **Every word ships with the app:** English plus 26 languages (French, Spanish, Portuguese, German, Italian, Dutch, Polish, Russian, Ukrainian, Turkish, Arabic, Urdu, Hindi, Bengali, Simplified Chinese, Japanese, Korean, Indonesian, Vietnamese, Filipino, Swahili, Yoruba, Igbo, Amharic, Somali, Zulu). That covers 1,761 texts in each language, including the therapist workspace, Village rules and moderation messages, and the offline AI replies. Arabic and Urdu read right to left. Plurals follow each language's rules, and numbers and dates are written the local way.
- **The choice is saved on the device**, applies at once without a reload, and comes back on the next visit. A language downloads the first time it is picked and then works offline.
- **The AI replies in the chosen language** for the whole conversation (chat, circle guide and thought-record suggestions), unless the person asks for another one.
- **Emergency and first-aid steps stay in English**, with "Call 112" always shown, so nothing important is lost in translation. Phone numbers stay as digits.
- **Only complete languages are offered.** Twi, Fante, Ga, Ewe, Hausa and Dagbani are hidden until native speakers have checked them.
- The translations were made with AI and **have not been checked by native speakers yet**. The app says so in Settings. Yoruba, Igbo, Amharic, Somali and Zulu need review most.
- How it works: English text in the code is its own key (`t('Welcome back')`, `<T text="Call <0>112</0>">`). The words are in `src/locales/<language>/<area>.json`, and the code is in `src/i18n/index.tsx`. Builds keep only the English entries that differ from their key, so the first download is no bigger than before.
- New commands: `npm run i18n:extract` (collect English texts), `npm run test:i18n` (every language has every text, with the same `{slots}`, tags and plural forms), `npm run test:i18n:e2e` (each language in Chrome at 360 px: nothing cut off, RTL correct, no missing text; and switching, reload and the AI language).

# 4Life — softer, more consistent corners (4 November 2026)

- **One corner scale for the whole app**, set once in `src/index.css`: 12 px small buttons and icon tiles, 14 px buttons and inputs, 20 px cards and panels, 28 px dialogs, hero panels and the sign-in card; pills only for chips, filters, badges and avatars. Each step is a little rounder than before, and the gap between steps is bigger, so different kinds of things no longer look the same.
- Seven one-off corner values were replaced by steps on the scale. The logo and avatar tiles keep their shape.
- Map zoom buttons and map pop-ups now match the rest of the app.
- Card outlines are a little softer, so cards separate from the page by light and shadow more than by a drawn box. No colours changed.
- Bars that run edge to edge (top bar, bottom tab bar, side menu, the EMS action bar) stay square on purpose.

# 4Life — phones, sign-up age, first-aid popup, welcome tour photos (3 November 2026)

- **Sign-up now asks for your age** (step 1, whole years, 13 to 120, with clear messages). It used to be hard-coded to 20 on this device and never saved with Supabase. Only the age is collected, never a date of birth. **Apply the new migration `20261103000008_signup_age.sql`**, or the age won't be saved when email confirmation is on. Onboarding and Settings use the same limits.
- **First-aid popup:** a long video channel name stretched the content up to 760 px wide on a 320 px phone, and it reappeared at once on reopening because the videos are remembered. It now fits at every size. The popup can no longer grow past the visible screen, so Close stays reachable while the phone's browser bars show. A quick second tap on a topic no longer presses "Call 112" or starts a video that opened under the finger.
- **All pop-ups:** a re-render behind a pop-up no longer pulls focus out of what you are doing, tapping outside closes on the click rather than the press, and notches and home bars are respected.
- **Sign-in on phones:** the Student/Therapist and Sign In/Create Account buttons fit their text at 320 px, long placeholders were shortened, and small controls are bigger.
- **Welcome tour photos:** the same three photos, now in landscape frames that match them, so people aren't cropped and phones get sharper pictures. Labels no longer cover faces, and the browser is told each file's true width. Chips no longer overlap or push the page sideways at 320 px.
- Double-tap zoom is off across the app; pinch zoom still works. At under 360 px wide the theme button moves out of the top bar (it is in Settings) so page titles fit.
- New tests: `npm run test:mobile` and `npm run test:signup-age`.

# 4Life — Instant EMS: true status, real records (2 November 2026)

Details, limits and the deployment steps are in [EMERGENCY.md](EMERGENCY.md). **4Life still can't send an ambulance, and the app now says so.**

- **Alerts are real records.** New tables `emergency_incidents`, `emergency_notifications` and `emergency_incident_events`, changed only through checked database functions. Retries, double presses and second phones can't create a second alert.
- **The SOS screen says only what is known.** It used to say "Your counsellor has been told" before anything was saved, even if saving failed or no counsellor was linked. It now separates saved, not sure, not saved, opened, "you said you sent it" and "your counsellor saw it".
- **Counsellors can acknowledge.** "I've seen this" on the Safety map is shown on the client's phone.
- **The 5-second countdown is gone.** One press starts the alert, and "Pressed by mistake" cancels it.
- **Calling 112 from the SOS screen no longer alerts anyone else by itself.** Alerting is its own button.
- **No more guessed locations.** The middle of the person's region (labelled 5 km accurate) was sent to counsellors when the phone couldn't find them. Positions now keep their true time and accuracy, and a person can write a landmark.
- **A counsellor's location request is answered only while the person's alert is open**, which is what Settings promised.
- Refreshing, losing connection or an expired session no longer loses track of an alert. Call and message buttons work in every state.
- Wording corrected: Settings no longer promises a daily check-in text that doesn't exist, hotlines name their source instead of saying "checked", "EMS is on the way" is recorded as the counsellor's report, and the location note mentions OpenStreetMap.
- Sign-in page: "Call 112" and "Ambulance 193" are easier to see and tap.
- New tests: `npm run test:emergency` and `npm run test:emergency:e2e`.

# 4Life — sign-in fixes (30 October 2026)

- Passwords longer than 20 characters work on the sign-in form. It used to cut them off, although sign-up allows 72.
- "Please confirm your email" and expired email links now offer **Send the confirmation link again**, for clients and therapists.
- Signing up with an email that is already registered now says so, instead of promising an email that never comes.
- A taken community name and email-sending failures get plain messages instead of Supabase's raw errors.
- An account with no profile row is signed out with a clear message, instead of being left half signed in.
- With Supabase on, the sign-in and reset forms no longer mention PINs or demo accounts, and the reset form no longer fills in a demo email. Therapists can now reset a forgotten password.
- A slow connection can't hold the "Opening 4Life" screen for more than 8 seconds.
- SUPABASE.md and LAUNCH.md explain email setup: a key in Supabase secrets does not send auth email; SMTP settings do.

# 4Life — backend refined, all Supabase Edge Functions (30 October 2026)

- **One backend, two places.** What each route does now lives once, in `server/core` (plain TypeScript, no Node or Express). The Vercel API (`server/routes.ts`) and the Supabase Edge Functions both run it, so they always behave the same.
- **All Edge Functions added** in `supabase/functions`: `chat`, `cbt-suggest`, `moderate`, `village-guide`, `first-aid-videos`, `health` and `client-error`, plus `_shared/http.ts` (CORS, sign-in, rate limit, JSON), `config.toml` and `deno.json`. Type-checked and run with Deno 2.
- `npm run sync:functions` copies `server/core` into `supabase/functions/_shared/core` with Deno-style imports; `npm run test:unit` fails if the copy is out of date.
- **The app falls back for every route**, not just chat: if `/api` is missing or down, `apiFetch()` calls the matching Edge Function.
- **Gemini without the SDK.** The backend talks to Gemini (or OpenAI, if that's the only key) over plain HTTPS, the same in Node and Deno. `@google/genai` was removed (36 fewer packages).
- `server/app.ts` is split into `routes.ts`, `middleware.ts` and `core/`.
- Sign-in checks are cached for a minute, so each chat message doesn't wait for an extra round trip. Health, first aid videos and crash reports no longer need sign-in. If `REQUIRE_SIGN_IN=true` but Supabase isn't set up, AI routes are refused instead of left open.
- The chat stops asking the AI when the person closes the app or presses Stop, and keeps any part of the reply that already arrived if the AI fails midway.
- Profile details that go into the AI's instructions (region, mood, faith, craving level) are cleaned like names.
- `.env.example`: `VITE_API_BACKEND` (the old `VITE_CHAT_BACKEND` still works) and optional `OPENAI_API_KEY`. Key values unchanged.

# 4Life — Vercel fix, first aid and phone polish (October 2026)

**Checked against Vercel's docs, the security checklist and the launch checklist**
- `server.ts` is now `dev-server.ts`. Vercel treats a root `server.ts` that imports Express as a whole Express app, which could hide the Vite front end.
- Node version: `package.json` now asks for Node 22 or newer (Vercel maps this to 24). Vercel stopped deploying Node 20 on 1 October 2026.
- Missing files under `/assets/` now return a real 404 instead of the app page.
- Dependency audit: fixed a high-severity `body-parser` issue (used by the API) and issues in `qs` and `vite`, without forced upgrades. `npm audit` now finds 0.
- Names typed by people (nickname, the AI's name, circle title, language) are cleaned and shortened before they go into the AI's instructions.
- Extra security headers on Vercel: HSTS, and a basic Content-Security-Policy (no framing by other sites, no plugins, no `<base>` tricks).
- If a page crashes, people see "This page didn't load", with Reload and the 112/193 numbers. The menu and SOS stay on screen. An old tab that can't find a page after a new deploy reloads once by itself.
- Crashes in people's browsers are reported to the server logs (`/api/client-error`: error text and page path only, nothing personal).
- Accessibility: the show/hide PIN button on sign-in now has a name and a bigger tap area. An automated WCAG A/AA scan (axe) finds no issues on sign-in, Home, AI Therapy, Village, Instant EMS or the first aid sheet.
- The AI Therapy screen no longer says the conversation "stays on this phone" without saying more: chats are saved only on the phone, and each message is sent to Google's Gemini to write the reply.
- New **LAUNCH.md**: decisions to make before launch, Vercel settings, checks after each deploy, and how to roll back.

**Deploying to Vercel**
- The full API is back (chat, thought-record help, Village moderation, circle guide). It lives in `server/app.ts` and runs on Vercel as one function, `api/index.ts`; `dev-server.ts` (renamed from `server.ts`, see below) only starts it on your own computer.
- Fixed the cause of the Vercel "module not found" errors: relative imports used by the API now end in `.js`, which Node needs for ES modules.
- `vercel.json` rewritten: every `/api/...` path reaches the API (before, they all went to the chat route), the page fallback pattern is valid, assets are cached for a year, `sw.js` is never cached, and basic security headers are set.
- Chat tries `/api/chat` first and falls back to the Supabase Edge Function if the API isn't there.
- The API now answers unknown `/api` paths and bad requests with clear JSON errors, limits AI requests per visitor (30 a minute by default), and only allows other websites listed in `ALLOWED_ORIGINS`.
- Supabase values are trimmed, so a stray space pasted into Vercel no longer breaks sign-in. Key values in `.env.example` are unchanged.
- Removed the old `bun.lock` (it disagreed with `package-lock.json`); Vercel installs with npm.
- `npm run build` builds the app and `dist/server.mjs` again; `npm start` runs it.

**First aid with YouTube** (Instant EMS)
- Eight topics with short, numbered steps, "Call 112 first" where it matters, and what not to do. They work offline.
- "Watch on YouTube" opens a search. Add `YOUTUBE_API_KEY` on the server later to show videos inside the app (safe search, Ghana region, loaded only when tapped). Also in the search palette: "First aid".

**Made for phones**
- The app downloads faster: AI Therapy, Village, Settings, sign-up and the counsellor app load when first opened, and the map loads on its own. Home and Instant EMS stay in the first download. The offline helper saves every part after the first visit.
- Home: a shorter welcome banner (buttons side by side, smaller streak ring with the next milestone), and the support cards drop their pictures on phones.
- Village: the reaction buttons fit on one line (icon and count) instead of four rows.
- Instant EMS: the emergency buttons take three rows instead of four.
- Bigger tap areas for the slideshow dots, "Forgot your PIN?" and "Copy".
- Remaining "4Life-AI" names changed to "4Life".

# 4Life-AI — UI/UX redesign

This version makes the app easier to read and easier to find your way around. All features, data and server calls work the same as before.

## What changed

**One way to get around**
- One sidebar for navigation, grouped into *Support* and *Daily growth*.
- Removed the extra tab bar, page banner, floating "Exit to Dashboard" button and "Close Tab" buttons — they all did the same job.
- The top bar now has the page title and just four actions: Language, Breathe, SOS and your account menu.
- On phones: a bottom bar (Home, Talk, Daily, Village, More). "More" opens the full menu.

**Easier to read**
- One font: Nunito, a soft, rounded typeface that ships with the app (also used for the logo).
- Body text is 16px. Nothing in the app is smaller than 13px.
- No more ALL-CAPS or typewriter-style labels.
- Every button and tap target is at least 44px tall.
- Pinch-to-zoom is allowed again on phones.
- The Text size setting now scales the whole app (Small, Normal, Large, Extra large).

**Plain words**
- "Shield Hub" is now Home, "AI CBT Therapy" is now AI Companion, "EMS & Crisis Map" is now Help nearby.
- Jargon such as "Stage 3: Active Shielding & Triage Focus" and "Behavioral Relapse-Risk Model" is rewritten in plain words.
- The model name is no longer printed on every chat message.

**Calmer layout**
- Each screen has one clear main action and cards in a steady order.
- The Home screen: greeting and streak → four key numbers → one check-in → today's risk → today's goals → counselors.
- The two separate check-in boxes on Home are now one.
- Sections with many parts (Village, Wellness, Settings) use simple tabs or a side menu, so you only see one part at a time.
- Settings only shows a Save bar when you have changed something.

**Colour with meaning**
- Uses the 4Life Universal Color System: emerald primary, slate neutrals, forest dark mode, amber, rose and sky (see COLOR_SYSTEM.md).
- Green is used for main buttons and the page you are on.
- Red is used only for SOS and danger.
- Amber is used for streaks and warnings.
- Emoji in menus and headings are replaced with simple line icons.
- Dark mode uses the same colour tokens, so every screen switches cleanly.

**Help is always one tap away**
- SOS is in the top bar on every screen and in the phone menu.
- The SOS screen shows four large choices: Call 112, Alert your support person, Breathe with me, Talk to 4Life-AI.
- Help nearby opens with "In danger right now?" and a Call 112 button.

## Small fixes made along the way
- The Atomic Habits reader button now shows for the right book.
- Memory Match no longer changes card data in place.
- The relapse-risk check waits until you stop moving the slider, instead of sending a request for every step.
- If the server is not running, the risk estimate is worked out on the device.
- Pop-up windows now always sit above the phone's bottom bar.
- Counselor photos fall back to initials if an image cannot load.

## Where things are in the code
- `src/index.css` — colour tokens (light and dark), fonts, text sizes and readability rules.
- `src/components/ui.tsx` — shared building blocks: Card, Button, Tabs, Chip, Field, Modal and others.
- `src/navigation.ts` — the list of sections, used by the sidebar, top bar and bottom bar.
- `src/components/Sidebar.tsx`, `TopBar.tsx`, `BottomNav.tsx` — the app shell.
- `src/components/tabs/*` — the eight sections, all rebuilt with the shared building blocks.
- Removed: `TopTabScroller.tsx`, `TabHeaderBanner.tsx`, `Header.tsx`, `StreakTracker.tsx`. Their features now live in the new shell and on the Home screen.
- The first-time setup screens (onboarding) now use the Universal Color System tokens throughout, so they match the app in light and dark mode. Login, chess, the book reader and the language picker keep their original layout with the new fonts, colours and minimum text sizes.

## Run it
```
npm install
npm run dev
```
Set `GEMINI_API_KEY` in `.env.local` for the AI features, as before.

## Language page (Google Translate)
- New **Language** page in the menu (above Settings). The globe button in the top bar and "All languages" in Settings open it too.
- Choose a language and the whole app switches to it: menus, buttons, pages and new content. The page shows whether the change worked, lets you search for a language, and has a one-tap **Show original English** button.
- Languages are grouped as *Languages of Ghana*, *Across Africa* and *Other languages*. Once Google Translate has loaded, *More languages* lists everything else it offers.
- Fante uses Google's Twi (Akan) translation. If Google has no translation for a language (for example Dagbani), the page says so.
- The AI Companion, thought reframing and the circle guide reply directly in the chosen language (`server.ts` adds a language rule to the prompts). Those replies and your own messages are marked so Google doesn't translate them a second time.
- Labels that already have hand-written translations in `translations.ts` are also skipped by Google.
- `main.tsx` installs a small guard so React and Google Translate can change the page together without errors.
- While the app is translated, a slim bar under the top bar shows the language, with **Change** and **English** buttons.
- Translation needs an internet connection. When Google can't be reached, the Language page says so and offers **Try again**.

## Sign-up in four short steps
Creating an account no longer shows every question at once. It now has four short steps, with a progress bar and a Back button:
1. **About you** — your name and an optional community name.
2. **Secure your account** — email address and PIN (typed twice), with a Show PIN option.
3. **What would you like help with?** — your focus area and the kind of encouragement you prefer.
4. **Support and safe space** — an optional support person's email and the safe-space promise.

- Each step checks its own answers. Problems are shown at the top of that step in plain words.
- Pressing Enter moves to the next step.
- Steps you have finished can be reopened from the progress bar.
- The sign-up screen uses the Universal Color System, bigger text and 48px fields.
- On phones, the top bar no longer runs off the screen.

## Therapist accounts and workspace
On the sign-in screen, people now choose **I want support** or **I’m a therapist**. Therapists get their own workspace, built around how therapy sessions actually run.

**Joining as a therapist: five short steps**
1. **Account:** title, name, work email, PIN.
2. **Qualifications:** profession, licensing body, licence number and years in practice.
3. **Practice:** the areas they help with, how they work (CBT, motivational interviewing…) and the languages they use.
4. **Sessions and availability:** formats, days, hours, session length, fee, and whether they offer a lower fee.
5. **Profile and agreement:** a short introduction, accepting new clients, and three professional agreements (confidentiality, crisis protocol, accurate information).

New accounts start as *verification pending*, and their profile is hidden from clients until the licence is checked. A short checklist helps them get ready for their first client. For the demo, use **Dr. Ama Konadu** (PIN 1234).

**The workspace**
- **Today:**
  - the next session with Prepare and start;
  - today’s schedule;
  - what needs attention, most serious first: high-risk clients, rising cravings, missed check-ins, notes to finish and new requests;
  - the week in numbers.
- **Sessions:** coming up, past, and notes to finish. Book a session; you are warned about clashes or times outside your hours.
- **Each session runs in three steps:**
  1. **Prepare:** mood and craving trends since the last session, last session’s plan, homework to review, goals, and the safety plan when risk is raised.
  2. **In session:** a timer, a six-point agenda checklist, a safety check, observed mood, and quick private notes.
  3. **Wrap up:** a DAP note (Data, Assessment, Plan) and homework. You can book the next session in the same step. Signing the note updates the client’s risk level and homework list.
- **Clients:**
  - a caseload with filters and search;
  - each client record has Progress (14-day mood and craving charts, goals, homework), Session history, Safety plan and Private notes.
- **Requests:** people who booked through the app. Accept to add them as a client and book a first session, or decline with a reason.
- **Availability:** working days and hours, session length, formats, fee, and accepting new clients, with a preview of the week.
- **Crisis and resources:** step-by-step crisis guidance with 112 and 193 call buttons, common worksheets, and referral centres.
- **Profile and settings:** edit what clients see, with a live preview. Qualifications are shown as read-only.

**Connected to the client app**
- When someone books a counsellor, the request now goes to that counsellor’s workspace. Booking Dr. Ama Konadu shows up in her Requests.
- The booking screen lets people add a short message and choose whether to share their check-ins. Chats with the AI companion are never shared.

**Notes**
- Risk is always shown as a word plus an icon, never colour alone.
- Charts have keyboard and hover read-outs and a table view.
- Everything is stored on the device, like the rest of the prototype. A real launch needs a secure server, real licence checks and data protection review.

## Safety map for therapists
- **New "Safety map" section** in the therapist workspace. It shows clients at high risk who agreed to share their location, with the nearest emergency services (hospitals and the ambulance service).
  - A dashed line links each client to their nearest service.
  - A circle around each client shows how precise their location is.
- **Respond panel for the selected client:**
  - their shared location, how long ago it was shared, and a warning when it is more than 30 minutes old;
  - Ask for an updated location; Open in Google Maps;
  - Call 112 and Ambulance 193;
  - Copy details for EMS (location, map link and the nearest service);
  - EMS is on the way;
  - the three nearest services, each with distance, a rough drive time and phone number;
  - Close this alert, with an outcome and a note.
- **"What has happened" record:** every step is time-stamped.
- **When a client presses SOS:** calling 112 or alerting their support person in the client app also tells their counsellor. The client's risk becomes high, and a red banner appears across the therapist workspace with an "Open safety map" button.
- **Consent first:** the client's location is only included if they turned on *Share my location with my counsellor if I press SOS* (Settings → Privacy and data). If the phone cannot give a location, the centre of their region is used and marked as approximate. Clients who have not agreed are listed without a location, with a prompt to use their safety plan instead.
- **Other ways in:** the safety map can also be opened from Today's "Needs your attention", from a high-risk client's record, and from the session safety check. Choosing "High risk" during a session now applies straight away.
- **Prototype limits:**
  - "Ask for updated location" is simulated.
  - SOS alerts pass between the client and therapist apps only on the same device.
  - Map tiles come from OpenStreetMap and need an internet connection.
  - A real launch needs a secure server and push notifications, a privacy review of location sharing, and verified contact details for emergency services.

## Supabase (database, accounts and live updates)
The app can now run on Supabase. Without Supabase settings it keeps working in device mode, exactly as before. Setup steps are in **SUPABASE.md**.

- **Database** (`supabase/migrations/`): 19 tables with Row Level Security on every one.
  - Clients own their data. A therapist only sees clients linked to them, and only what each client chose to share.
  - Licence details are private, and only admins can verify a therapist.
  - Rules are enforced by the database itself: roles, verification, who can change sharing or risk, and SOS location consent (coordinates are removed unless the person agreed).
  - Multi-step actions run as one transaction: accepting a request, and signing a note.
  - Signed notes keep their earlier versions. The crisis record and the audit log cannot be edited or deleted.
  - Old SOS coordinates can be cleared automatically.
  - People can download all their data or ask for their account to be deleted.
- **Accounts:** sign-up and sign-in use Supabase Auth with email and password, including email confirmation and password reset. Therapists sign up through the same five steps; their details go to the database, starting as "pending".
- **Live updates:** across devices, the therapist workspace updates by itself when a request arrives, a client checks in, or a client presses SOS. "Ask for updated location" now reaches the client's phone.
- **Client app:** these now save to the database:
  - the profile and support contacts, saved in the background;
  - daily check-ins;
  - booking requests;
  - SOS alerts;
  - data export.

  The counsellor list now shows real verified therapists, marked "New" instead of with invented ratings.
- **AI server:** `/api` calls carry the person's sign-in. The server checks it, and can refuse calls from people who are not signed in (`REQUIRE_SIGN_IN=true`).
- **Tests:**
  - `supabase/tests/database_checks.sql`: 41 privacy and workflow checks.
  - `scripts/integration-test.ts`: 24 checks of the app's data layer against a real database.
  - Both pass.
- **Demo data:** `npm run db:seed-demo` creates a verified demo therapist and two clients.

## Focused on three features
The app now does three things, and does them properly: **AI CBT therapy**, the **Global Village** and **Instant EMS**. Sign-up, Home, Settings and the therapist workspace stay, because these features rely on them.

**Removed:** Daily routine and wisdom, Wellness and books, Calm games and chess, points and the leaderboard, blocked-sites settings, the relapse-risk card (it used a made-up heart rate), and the separate Language page (language is still in the top bar and Settings). The unused server routes (`/api/relapse-risk`, `/api/daily-drop`, `/api/chat/chess`) and the fake `/api/emergency-alert` are gone.

**Home** now shows your streak, the three features (with your last thought record and the next group circle), a check-in that points you to the right help (a strong craving → ride it out; a hard day → talk it through), and counsellors.

### AI CBT therapy
- **Crisis detection before the AI answers.** Words about suicide, self-harm, overdose or someone not breathing show a red "Your safety comes first" card at once (Call 112, Ambulance 193, alert my support person) — even without internet. The AI also rates risk in any language, and the higher of the two is used. Strong cravings or relapse show an "urge" prompt.
- **Replies stream in word by word** (`/api/chat` with server-sent events), with a Stop button.
- **Suggestions fit the conversation.** Gemini returns three next things to say, instead of a fixed list.
- **Full CBT thought record** in six steps: situation → thought and feeling (rated 0–100) → thinking trap (AI suggests one, you choose) → evidence for and against → a fairer thought → rate the feeling again. The before/after numbers show whether it helped.
- **Saved records**, with a per-record "Share with my counsellor" switch. Shared records appear in the therapist's client view.
- **Urge rating before and after** ("Started at 7… now 4 — the wave is passing").
- **Conversations are saved on this device only** (never uploaded), with "Start a new conversation".
- Cleaner prompts: no model name in the text, no "dopamine reset" claims, no medicine advice, one question at a time, under 120 words.

### Global Village
- **Real, shared Village** with Supabase: posts, replies, "Send support", group circle chat (live), all with Row Level Security. Without Supabase it works on the device, with sample posts.
- **Checked before posting:** on the device (instantly) and on the server (with Gemini when available). Blocks slurs, insults aimed at others, explicit slang, phone numbers/emails, and help finding drugs. Honest words people in recovery need ("porn", "relapse", "I feel useless") are allowed.
- **Posts that suggest someone is in danger are not published.** The person is shown 112, SOS, the Yonkodo helpline and AI therapy instead, and their words are kept.
- **Report and Block.** Three reports from different people hide a post until an admin reviews it. Blocked people's posts, replies and circle messages disappear for you (enforced by the database).
- **Group circles** are honest text circles with a weekly time, a host, "Add to calendar" (a weekly reminder file) and a private "Ask the guide" (AI answer only you see).
- **"Talk to someone"** replaces the fake peer call: counsellors, the Yonkodo helpline (checked Aug 2026) and circles. Peer calls are marked "coming".
- The leaderboard is gone: ranking people by streak can hurt someone who relapses.

### Instant EMS
- **"Send my location" really sends.** It opens the phone's own messaging app (SMS or WhatsApp) with a message and a Google Maps link to where you are. The old button pretended an ambulance had been "dispatched".
- **SOS → Alert my support person** does the same, and still tells a linked counsellor.
- **Nearest first.** Places are sorted by distance with rough drive times, the nearest hospital is highlighted, and "open now" is shown. The ambulance service shows Call 193/112 instead of directions.
- **Only checked numbers.** Hotlines are 112, 193, 191, 192 and the Yonkodo Foundation (0558 288 288), each with the month it was checked. Unconfirmed numbers were removed; centre phone numbers that are not confirmed say so and point to 112.
- **What to tell the ambulance** and **while you wait** guides.
- **Works offline after the first visit** (service worker in production builds): call buttons, hotlines, the list of places and the location message still work. The map needs internet.

### Database and tests
- New migration `supabase/migrations/20261016000005_cbt_village_ems.sql`: thought records, Village tables, circles, emergency hotlines, rate limits, report auto-hide, updated data export.
- Database checks: **68** (was 41). Integration checks: **40** (was 24). New `npm run test:unit`: **49** checks (streaming, crisis words, Village rules, circle times, phone numbers). All pass.
- The database refuses phone numbers, emails, slurs and harassment in the Village even if the app is bypassed, stops back-dated posts, hides what you reported from you, and stops a therapist reopening an ended care link.
- `npm run db:seed-demo` also adds a shared thought record and starter Village posts.

### Where the three features live in the code
- AI CBT therapy: `src/components/tabs/AiTherapyTab.tsx`, `src/components/cbt/ThoughtRecordModal.tsx`, `src/lib/cbt.ts`, `src/lib/cbtStore.ts`, `src/lib/aiChat.ts` (streaming), `src/lib/aiTrailer.ts`; server route `/api/chat` and `/api/cbt/suggest`.
- Global Village: `src/components/tabs/CommunityVillageTab.tsx`, `src/lib/village.ts`; server routes `/api/moderate` and `/api/village/guide`.
- Instant EMS: `src/components/tabs/EmergencyMapTab.tsx`, `src/components/maps/EmsMap.tsx`, `src/lib/ems.ts`, `src/components/modals/SosModal.tsx`, `public/sw.js` (offline).
- Safety rules shared by app and server: `src/lib/safety.ts`.

## User-friendly pass with the Universal Color System everywhere
- **No colours outside the palette.** Sign-in, PIN recovery, Setup (onboarding), the language picker, "Ask the developers" and the group-circle chat now use the colour tokens, so they match the rest of the app in light and dark mode. No raw Tailwind colour classes are left in the app's components.
- **Sign-in:** the side panel is now a slideshow of flat illustrations drawn in code, with no words: meditating calmly, friends holding up wellbeing icons, a joyful healthy day around a big heart, and a care team. It moves on by itself; swipe, tap it, or tap a dot. On phones it sits at the top of the card. All the explaining happens in the welcome tour.
- **Setup:** a simple header ("Set up 4Life-AI · Step 1 of 4 · About you") with a progress bar instead of a dark banner; plain labels ("Your name", "Language", "Faith or tradition", "How should AI therapy encourage you?"); larger text and buttons; a roomy support-person form; AI companions described in everyday words; no "Auto-SMS" claim (nothing is sent automatically).
- **Language picker:** one clear list grouped as *Languages of Ghana*, *Across Africa* and *Other languages*, with search and "Back to English".
- **Ask the developers:** an honest form and common questions about the three features. With `VITE_FEEDBACK_EMAIL` set, it opens the email app; otherwise it keeps the message on the device and says so.
- **Group circles:** chat bubbles like AI therapy (yours on the right), on the normal card colours.
- **Phones:** short page titles ("AI Therapy", "Village") and a "Therapy" tab label so nothing is cut off.

## Darker green
The main green is now deep emerald **#047857** (was #059669), with **#065F46** for hover and links. In dark mode, links and accents use #10B981. Pale "selected" fills stay #D1FAE5. Buttons with white text are now easier to read (5.5:1 contrast).

## New sign-in and sign-up screen (students and therapists)
- **One split card**: the form on the left, an illustrated story on the right, on a softly moving background in the Universal Color System (forest, emerald, amber, sky, rose). On phones the story becomes a short banner above the form.
- **Student / Therapist switch** at the top. Each has its own story:
  - Students: AI CBT therapy (a plant being watered), an interactive "How are you feeling today?" check (tap a face for a kind reply), the Global Village (people of different backgrounds around a heart) and Instant EMS (112 and a location pin).
  - Therapists: the day at a glance, the safety map and structured session notes.
- **Interactive story panel**: next/previous arrows, dots, swipe on phones, and it moves on by itself every 7 seconds (it pauses while you hover, focus or use the mood check, and stays still if the phone asks for reduced motion).
- **"In danger right now? Call 112"** card is always one tap away, without signing in.
- All illustrations are original drawings made for 4Life-AI (`src/components/auth/AuthIllustrations.tsx`); the reference pictures were used only for style.
- Clearer form: equal-size labels, demo accounts show the name in full, and the sign-up steps are unchanged.
- Code: `src/components/auth/AuthShell.tsx` (layout, story panel), `AuthIllustrations.tsx`; `AuthPage.tsx` and `TherapistAuth.tsx` keep the forms.
- **Living background** (now `src/components/LivingBackground.tsx`): leaves, petals and bubbles float up and move out of the way of your pointer or finger; a soft glow follows the pointer; the colour clouds lean towards it; and tapping the background around the card makes a flower bloom with petals flying out. It pauses when the tab is hidden and stays still if the device asks for reduced motion.

## The living background across the whole app (students and therapists)
Ideas taken from well-known apps: glass navigation bars (Apple, Linear), calm illustrated banners (Headspace, Calm), face-based mood check-ins (Daylio), and small celebrations for progress (Duolingo).
- **Same living background as the sign-in screen** behind every page, at a lower density so it never gets in the way of reading. Leaves and petals move away from your pointer, and tapping empty space beside the content makes a flower bloom.
- **It stays still when calm matters**: on Instant EMS, while the SOS window is open, on the therapist safety map, and whenever the device asks for reduced motion. You can turn it off in **Settings → Language and display → Moving background** (saved on this device).
- **Glass sidebar, top bar and phone bottom bar**: slightly see-through with a blur, so the background shows through softly.
- **Illustrated banners** on Home, AI CBT therapy, Global Village and the therapist Today page, using the same drawings as the sign-in story.
- **Home**: the greeting banner has "Check in now" and "Talk to …" buttons and an amber ring showing your clean-day streak; the support cards have small illustrations; mood is picked with five faces instead of words only; saving a good check-in makes flowers bloom from the button (not shown when cravings are high or mood is low).
- **Feel**: cards lift slightly on hover, and buttons press in when tapped.
- **Fix**: the therapist SOS alert banner no longer squeezes its text on phones — the "Open safety map" button moves to its own full-width row.
- Code: `src/components/LivingBackground.tsx` (exports `bloomAt`, `celebrateFrom`), `src/components/PageHero.tsx`, `src/components/MoodFaces.tsx`, `src/lib/motion.ts` (the Moving background setting).

## The green ribbon: mental health as the design element
The green ribbon is the international symbol of mental health awareness, and green is already the app's main colour, so it is now 4Life-AI's design element everywhere. (It replaces the capsule helix, which looked like medicine pills — not a good fit for a recovery app.) All drawings are original.
- **3D background** behind the sign-in screen, the student app and the therapist workspace: a soft ribbon that twists corner to corner, porcelain on one side and mental-health green on the other, so the colours swap as it turns.
  - It breathes slowly (in for 4 seconds, out for 6).
  - The part near your pointer or finger lifts towards you; the ribbon tilts towards the pointer.
  - Scrolling or dragging on empty space makes the twist flow; tapping empty space sends a ripple along it.
  - Dark mode: deep forest green with an emerald side.
- **Ribbon mark** (`src/components/RibbonMark.tsx`) used across the app:
  - the opening screen while the app loads (a breathing ribbon with "Mental health matters");
  - the green page banners on Home, AI CBT therapy, Global Village and therapist Today;
  - the sign-in story panel, plus a short note under the card explaining what the ribbon means;
  - loading messages (Village, counsellors) as a calm breathing ribbon;
  - the footers of the student app and the therapist workspace.
- **Calm and light on phones** (unchanged rules): still on Instant EMS, during SOS, on the therapist safety map, with reduced motion, or when Settings → "Moving background" is off; lighter version on phones and slow computers; pauses when the tab is hidden. The breathing marks also stop when reduced motion is on.
- **Loads after the app**: the 3D code (three.js, about 120 KB compressed) loads separately; without WebGL the plain background stays.
- Code: `src/components/ribbon/ribbonScene.ts` (3D ribbon), `src/components/LivingBackground.tsx` (pointer, taps, scrolling, celebration flowers), `src/components/RibbonMark.tsx` (`RibbonMark`, `RibbonLoader`), opening screen in `index.html`.

## Interface refinements from the best websites
Small, proven details from well-known products, applied across the student app and the therapist workspace.
- **Quick search (Ctrl K / ⌘ K, or "/")** — like Linear, Raycast and Notion. One box to jump anywhere or do something: "Ride out a craving", "Breathe with me", "Start a thought record", "Write a Village post", "Join a group circle", switch theme, change language and more.
  - "Get help now" always comes first (Call 112, SOS, nearest hospital), and "In danger? Call 112" sits in the footer of the box.
  - It understands everyday words ("urge", "drink", "panic", "hospital", "friends").
  - If you type a feeling ("I feel lonely tonight"), it offers to take your words to 4Life-AI.
  - Therapists can search sections, crisis steps and their clients by name.
  - Open it from the search box in the top bar (the magnifier on phones).
- **Frosted top bar that is see-through at the top of the page and frosts once you scroll** (Apple). It also now really stays at the top while you scroll — a page setting (`overflow-x: hidden`) had been stopping it; it is now `overflow-x: clip`.
- **Calmer depth** (Stripe, Linear): layered soft shadows on cards, a faint top highlight in dark mode, main buttons with a soft "key" highlight, and cards that rise a little on hover.
- **Gentle motion** (Apple): each page fades in when you open it, cards fade up as they scroll into view (pure CSS; nothing changes on browsers that don't support it), dialogs rise like a sheet on phones (with a grab handle) and settle in on larger screens, and the theme switch cross-fades.
- **Typography** (Apple, Stripe): tighter headings that wrap evenly, paragraphs without a lonely last word, numbers that line up, and selection in the brand colours.
- **Phone bottom bar** (iOS, Material): the open section gets a soft green pill behind its icon; the therapist bar is frosted too.
- **Battery**: the moving ribbon rests while a dialog or quick search covers the page.
- Everything respects "reduce motion".
- Code: `src/components/CommandPalette.tsx`, `src/lib/actions.ts` (quick-search requests such as "open a thought record"), `src/lib/motion.ts` (`useScrolled`, `lockPage`), styles at the end of `src/index.css`.

## Friendlier, roomier, faster: the three features
### AI CBT therapy
- **Chat first.** The big banner and four large cards show on the first visit only. After that there is one heading, and the four kinds of help are chips at the top of the chat, so the conversation is on screen straight away (especially on phones).
- **Starts in the right place:** remembers the kind of help you used last; on a first morning visit it suggests "Stay on track", otherwise "Ride out a craving".
- **Welcome back** line when a conversation is still open, with "Start fresh".
- **Craving rating with five big, named levels** (Barely, Mild, Medium, Strong, Intense) instead of eleven small numbers.
- **Ride the wave: a 20-minute craving timer.** Every 5 minutes it asks how strong the craving is and draws the line, next to the usual shape of a craving wave. It survives a refresh. Flowers bloom when the craving goes down.
- **Wrap up: "What helped today?"** Tick what helped (breathing, calling someone, going outside…). It is remembered on the phone: next time a bar says "Last time, this helped" with one-tap Breathe or Call buttons, and 4Life-AI is told to suggest those first.
- **Quick thought record:** 3 steps (what happened → the thought → a kinder thought), with the thinking trap guessed for you. "Use all 6 steps" switches to the full version. It starts with your last chat message already filled in.

### Global Village
- **One-tap support:** "Sending strength", "Me too" and "This helped me", each with its own count — no need to write.
- **Calmer feed:** long posts show 4 lines with "Read more"; "N new since your last visit" and an "Earlier" divider; posts about a relapse or a strong craving are covered with a short note and "Show the post" (or switch on "Always show" in the rules card).
- **Guided posting:** tap "What happened", "What helped" or "What I need" to start a line. Drafts are kept on the phone until you post.
- **Circles:** one clear "Next circle" card with "I'll be there", "Remind me" (calendar reminder 15 minutes before) and how many are going. Only the number is shared, never who. In a circle, **"Just listen"** hides the message box.
- **Talk to someone:** counsellors with "Available now" first (from their working hours); tap to see and book.
- Remembers your last section and topic. The big banner shows on the first visit only, and topics scroll sideways on phones.

### Instant EMS
- **Three big buttons in thumb reach on phones:** Call 112, Text (your support person, with your location) and Nearest help (directions to the nearest hospital).
- **SOS can't go off by accident:** "Alert …" now counts down 5 seconds with Cancel and Send now. Calling 112 is still one tap.
- **My safety plan:** warning signs → things I can do on my own → safe places → people I can call (one-tap call buttons) → reasons to keep going → professional help (112, 193, Yonkodo). Tap-to-add ideas make it quick. With Supabase it is saved to your account and your linked counsellor can see it and help; otherwise it stays on the phone. Also reachable from SOS and quick search.
- **Simpler list:** places open now come first, then nearest; each place has Call and Directions buttons; an "Open now" filter; on phones a List / Map switch instead of both at once.
- **Home-screen app:** a web app manifest and icon (the green ribbon). Once added to the home screen, a long press on the icon gives **SOS**, **Help nearby** and **Ride out a craving** shortcuts, and it opens offline.

### Across the app
- **"Right now" suggestion on Home** that fits the time of day (evening: plan tonight; late night: breathe; morning: check in; afternoon: the next circle).
- Quick search moved into the menu on phones so the top bar has room for the page name.
- Fix: the page fade no longer stops fixed bars (like the EMS buttons) from staying at the bottom of the screen.

### Data and tests
- New migration `20261021000006_village_reactions_rsvps.sql`: reaction kinds on `village_support` (with counts on posts), `circle_rsvps` with a count-only function, and `reasons` / `safe_places` on `safety_plans`.
- Database checks: 68 → 77. Unit checks: 49 → 59. Integration checks: 40 → 45.
- `USABILITY_TEST.md`: a 20-minute test plan with 5–6 students, tasks and time targets.

## Photo sign-in, visible theme and Translate buttons, welcome tour

- **Sign-in:** a minimal side panel with a flat illustration (a young person meditating, with floating icons drawn in code) and three side tabs. The icon for the open tab glows; tap an icon to open its tab. On phones the illustration sits at the top of the card. The panel has a short headline and three side tabs (AI CBT therapy, Global Village, Instant EMS; therapists see their own three). The tabs move on by themselves and pause while you read; tap one to open it. The photos are used only in the welcome tour.
- **Theme and Translate** are always visible: in the sign-in card header, and in the app top bar at every screen size. Translate opens a menu with Ghanaian languages first.
- **Welcome tour:** a short full-screen slideshow (icons and photos) shows once after someone creates an account. Replay it from quick search: "Show the welcome tour".
- Photos live in `src/assets/photos` as small WebP files. Make sure you hold a licence for them before a public launch.
- **Glass:** the buttons in the top bar (search, Translate, theme, Breathe, menu and your avatar) are clear glass: a light green tint, a glossy sheen and a bright rim, with no frosting. SOS stays solid red with a glossy shine. The side menu is clear glass too, and its selected item is a glass pill. Works in light and dark mode.

## Smoother view (refinements on top of everything above)

- **Reading progress:** a thin green line under the top bar fills as you scroll down a page.
- **Back to top:** a round glass button appears on long pages and glides you back up (hidden in AI therapy, Instant EMS and during SOS).
- **Offline pill:** if the phone loses its connection, a calm note says SOS, 112 and your safety plan still work; "Back online" shows briefly when it returns.
- **Phone tab bar:** the selected tab is a glass pill that pops in, matching the side menu. Tabs and SOS give a tiny vibration on Android phones.
- **Side menu:** a slim green marker beside the page you are on; icons nudge on hover.
- **Home:** the days-clean ring draws in and the number counts up.
- **Sideways rows** (topic chips, tabs, quick replies) fade at the edge when there is more to swipe to.
- **Forms:** fields glow softly green while you type.
- **Loading screen:** the breathing ribbon and three soft dots instead of plain text.
- **Notches:** the top bar leaves room for phone notches in the installed app.
- Everything respects the device's "reduce motion" setting.
- **Welcome tour on a computer:** wider, in two columns: the picture on the left and the words and buttons on the right, with a bigger title. On phones it stays the same single column.

## Dev server fixes

- The uploaded copy would not start: the dev server stopped with "No matching export in src/therapist/data.ts for import DEMO_DATA" and showed a blank page. Several files in that copy had been rewritten into shorter versions (the data layer, the therapist workspace, AI therapy, the stylesheet and others) and some files were missing. This version restores the full app and keeps the new deployment parts from that copy:
  - `api/index.ts` and `vercel.json` for Vercel,
  - `--port` and `--host` options, CORS headers for `/api`, Vite loaded only in development, and the Express app exported for serverless use.
- The app, the API and Vite's live reload now share one port (live reload used a second port before, which proxies and tunnels often block).
- If the port is busy, the server says so in plain words and shows how to use another port. `npm run dev -- --port 3001` now works.
- The server prints the address to open in your browser.

## Sign-in fits the screen

- The 4Life logo and name sit centred at the top of the sign-in form, with Student / Therapist right below.
- The light / dark theme button sits in the top-right corner of the illustrations (on phones, the corner of the illustrations above the form).
- The Translate and 112 buttons were removed from the sign-in screen. Language can still be changed in the welcome tour and in the app; the emergency numbers (112 and ambulance 193) are in the fine print under the illustrations (and at the bottom on phones).
- The big page title is hidden (still read out by screen readers), so the form starts higher.
- Sign-up step 3 is more compact on a computer.
- The page never scrolls on a computer: it fits 1280 × 720, 1366 × 768 and larger. A long step (the therapist sign-up) scrolls inside the card instead.
- The name shown in the logo is now **4Life** (sign-in, side menu, therapist workspace, welcome tour, loading screen, browser tab and installed-app name).
- **Sign-in slideshow switches on its own** every 5 seconds, even with the mouse over it. It only stops while you press and hold, or while the browser tab is hidden. With "reduce motion" turned on it still switches, every 8 seconds, without the slide animation.

## Instant EMS: free, open-source map services

All free, with no API key or account (code in `src/lib/osm.ts`):

- **Places near you (Overpass API, OpenStreetMap):** after you find your location, hospitals, clinics, pharmacies, police and fire stations within 10 km are added to the list and the map. The app's own checked places stay first; a map place at the same spot is not shown twice. Map places carry an "OpenStreetMap" badge and a note to call ahead. New filters: Clinics, Pharmacies, Police.
- **Your street and area (Nominatim):** "Found: near Prempeh II Street, Adum, Kumasi". The help message you text to your support person now says where you are in words as well as the map link.
- **Route by road (OSRM):** picking a place draws the real driving route on the map and shows the distance by road and the driving time.
- **Offline:** the last places found near you are saved on the phone, so the list still works without internet. Calls to 112 and 193 never wait on these services.
- **Privacy:** your location is sent to these services only to look things up, only after you press a button, and 4Life does not store it.
- **Map tiles** are OpenStreetMap's, softened in dark mode, with the required credit on the map.
- The public servers are for light use. For a big launch, set `VITE_OVERPASS_URL`, `VITE_NOMINATIM_URL` and `VITE_OSRM_URL` (see `.env.example`) to your own or a paid server.
- **The map always shows:** a simple built-in map of Ghana (coastline, borders and main towns, from Natural Earth, public domain) now sits under the street map. If the street tiles can't load (offline, slow or blocked network, or the claude.ai preview), you still see the map with all the places and a note that the detailed street map needs internet. It zooms out so the towns give a sense of where things are.
- The map is visible straight away on tablets and computers (no List / Map switch there), and on phones the Map view now opens first.

