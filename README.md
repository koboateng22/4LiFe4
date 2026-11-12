# 4Life

Recovery support for young people in Ghana, built around three features:

- **AI CBT therapy** — ride out a craving, test an unhelpful thought with a six-step thought record, and get help straight away if you're in danger.
- **Global Village** — an anonymous community: posts, replies, support, weekly group circles, with reporting and blocking.
- **Instant EMS** — call 112 in one tap, alert your counsellor, text your location to your support person, and find the nearest hospital, even offline. It can't send an ambulance: see [EMERGENCY.md](EMERGENCY.md).

Counsellors use the same app (choose "I'm a therapist" when signing in).

## Run it

Prerequisite: Node.js 22 or newer.

```bash
npm install
cp .env.example .env.local   # add GROQ_API_KEY and GEMINI_API_KEY for real AI replies
npm run dev                  # http://localhost:3000
```

If port 3000 is busy, close the other server or pick another port: `npm run dev -- --port 3001`. The app, the API and live reload all use that one port, so it also works behind AI Studio's preview, tunnels and Codespaces.

Without Supabase settings everything is stored on the device. To connect a database, see **SUPABASE.md**.

## The AI chat (Groq first, Gemini as backup)

Groq answers every message. When Groq is busy or down, rate-limited, out of its daily quota, too slow, or sends nothing, the same message and conversation go to Google Gemini automatically. Nothing is shown before that happens, and the person does nothing. A refused key, a missing model or a bad request is reported instead, because it needs fixing. Both providers have free tiers with per-minute and per-day limits; neither is unlimited. The app never switches to a paid service by itself.

1. **Groq key:** https://console.groq.com/keys → Create API Key. **Gemini key:** https://aistudio.google.com/apikey → Create API key.
2. Put them in `.env.local` (never committed): `GROQ_API_KEY="…"` and `GEMINI_API_KEY="…"`. Optional: `GROQ_MODEL` (default `openai/gpt-oss-120b`), `GEMINI_MODEL` (default `gemini-3.5-flash-lite`), `PRIMARY_AI_PROVIDER` / `FALLBACK_AI_PROVIDER` (default `groq` / `gemini`; `none` switches the fallback off).
3. Run `npm run ai:check`. It sends real messages through the app's own chat code: to Groq alone, to Gemini alone, then in the normal order, and checks that follow-ups keep the context.
4. In Vercel: **Settings → Environment Variables**, add the same names for **Production** and **Preview**, then **Redeploy**. `https://<your-app>/api/health` then shows `groq: true`, `gemini: true` and both models (never the keys).

**Two backends, one set of keys each.** The app can reach the AI on this site (`/api/chat`, Vercel) and on the Supabase function `chat`. They read their keys separately: Vercel from its Environment Variables, the function from `supabase secrets set GROQ_API_KEY=… GEMINI_API_KEY=…`. Every AI answer carries an `X-4Life-AI: on|off` header saying whether that server has a key. When `/api` says `off`, the app asks the Supabase function instead, so a key set on only one of them still works. Set the keys on both, so each message needs only one trip. Check both: `https://<your-app>/api/health` and `https://<project>.supabase.co/functions/v1/health`.

Keys are read only by the server (`/api/chat` and the Supabase functions). Each reply writes one log line, `[ai] chat ok by=groq/<model>` or `by=gemini/<model> failed=groq:<reason> (fallback)`, with token counts but never the person's words. Without any key, or when both providers fail, the chat says what happened and offers **Try again** where that helps. It never makes up a reply. Google says free-tier Gemini prompts may be used to improve its products; for recovery conversations, consider paid tiers before launch (see LAUNCH.md).

## Deploy to Vercel

1. Push this folder to GitHub and import the repository in Vercel. `vercel.json` already sets everything: Vite build, output `dist/`, the API function `api/index.ts`, and the page routes.
2. In **Project Settings → Environment Variables**, add (for Production and Preview):

   | Name | What it is | Where it's used |
   | --- | --- | --- |
   | `VITE_SUPABASE_URL` | your Supabase project URL (same value as in `.env.example`) | app + API |
   | `VITE_SUPABASE_ANON_KEY` | the Supabase publishable key (same value as in `.env.example`) | app + API |
   | `GROQ_API_KEY` | Groq key: the AI answers first | API only |
   | `GEMINI_API_KEY` | Gemini key: takes over when Groq can't | API only |
   | `YOUTUBE_API_KEY` | optional: first aid videos inside the app | API only |
   | `GROQ_MODEL`, `GEMINI_MODEL`, `PRIMARY_AI_PROVIDER`, `FALLBACK_AI_PROVIDER`, `REQUIRE_SIGN_IN`, `ALLOWED_ORIGINS`, `RATE_LIMIT_PER_MINUTE` | optional | API only |

   Paste values without spaces or quotes. `VITE_` values are built into the app, so **redeploy after changing them**. Secrets (Gemini, YouTube, the service-role key) must never go in a `VITE_` variable.
3. Deploy, then follow **LAUNCH.md**. Check `https://<your-app>.vercel.app/api/health`: it shows whether Gemini and YouTube are switched on (it never shows the keys).

Vercel runs the API as one Node function. `package.json` asks for Node 22 or newer, which Vercel maps to Node 24 (Node 20 was switched off for new Vercel deployments on 1 October 2026). Relative imports in `server/` and the files it uses end in `.js` on purpose: Vercel runs them as ES modules and Node needs the extension.

If `/api` is ever unreachable, the app falls back to the matching Supabase Edge Function (in `supabase/functions`), when those are deployed. See **SUPABASE.md, section 5**.

## Backend layout

```
api/index.ts            Vercel entry: the Express app below
server/app.ts           Express wiring
server/routes.ts        the /api routes
server/middleware.ts    CORS, sign-in, rate limit, errors
server/core/            what each route does (shared with the Supabase functions)
supabase/functions/     the same routes as Edge Functions (run npm run sync:functions after editing server/core)
dev-server.ts           npm run dev / npm start on your own computer
```

## Run the built app yourself

```bash
npm run build                # the app into dist/ and the server into dist/server.mjs
npm start                    # serves both on http://localhost:3000
```

## First aid (YouTube)

Instant EMS has a **First aid while you wait** section: overdose, CPR, choking, heavy bleeding, burns, seizures, too much alcohol and fainting. The steps ship with the app, so they work offline. Without `YOUTUBE_API_KEY`, each topic has a "Watch on YouTube" button that opens a search. With the key, `/api/first-aid/videos` returns a few safe-search, embeddable videos that play inside the app (only after a tap, to save data). Results are cached for 12 hours, so the daily YouTube quota lasts.

To get a key: Google Cloud console → APIs & Services → enable **YouTube Data API v3** → Credentials → Create API key. Restrict it to the YouTube Data API.

## Languages

The app ships in English and 26 other languages, chosen from the language button at the top or in Settings. The choice is saved on the device, and AI replies are written in it. Emergency and first-aid steps always stay in English. Twi, Ga, Ewe, Hausa, Fante and Dagbani are hidden until native speakers have checked them.

Text is written in English in the code, and that English is its key: `t('Welcome back')`, or `<T text="Call <0>112</0>" parts={[<a href="tel:112" />]} />` for text with a link inside. The words for each language are in `src/locales/<language>/<area>.json`. After adding or changing English text, run `npm run i18n:extract`, add the new texts to every language, then run `npm run test:i18n`.

## Tests

```bash
npm run test:unit            # no database needed; also checks the Edge Functions are in sync
npm run ai:check             # real chat test: Groq, Gemini, and the fallback order (up to 6 requests)
npm run test:chat            # the chat screen: streaming, errors, Try again (needs Chrome, no AI quota used)
npm run test:i18n            # every language has every text
npm run test:i18n:e2e        # each language in Chrome at phone size (needs Chrome)
npm run test:theme           # theme only in Settings, light/dark/system, remembered (needs Chrome)
npm run test:learn           # the Learn videos page, against a fake YouTube (needs Chrome)
npm run test:account-db      # theme on the account, Google/phone sign-up profiles (PostgreSQL in-process)
npm run test:demo-build      # no demo accounts in a production build
```

Database and integration tests are described in SUPABASE.md. What changed and where things are in the code: **CHANGES.md**.
