# 4Life

Recovery support for young people in Ghana, built around three features:

- **AI CBT therapy** — ride out a craving, test an unhelpful thought with a six-step thought record, and get help straight away if you're in danger.
- **Global Village** — an anonymous community: posts, replies, support, weekly group circles, with reporting and blocking.
- **Instant EMS** — call 112 in one tap, text your location to your support person, and find the nearest hospital, even offline.

Counsellors use the same app (choose "I'm a therapist" when signing in).

## Run it

Prerequisite: Node.js 22 or newer.

```bash
npm install
cp .env.example .env.local   # add GEMINI_API_KEY for real AI replies
npm run dev                  # http://localhost:3000
```

If port 3000 is busy, close the other server or pick another port: `npm run dev -- --port 3001`. The app, the API and live reload all use that one port, so it also works behind AI Studio's preview, tunnels and Codespaces.

Without a Gemini key the app uses built-in replies. Without Supabase settings everything is stored on the device. To connect a database, see **SUPABASE.md**.

## Deploy to Vercel

1. Push this folder to GitHub and import the repository in Vercel. `vercel.json` already sets everything: Vite build, output `dist/`, the API function `api/index.ts`, and the page routes.
2. In **Project Settings → Environment Variables**, add (for Production and Preview):

   | Name | What it is | Where it's used |
   | --- | --- | --- |
   | `VITE_SUPABASE_URL` | your Supabase project URL (same value as in `.env.example`) | app + API |
   | `VITE_SUPABASE_ANON_KEY` | the Supabase publishable key (same value as in `.env.example`) | app + API |
   | `GEMINI_API_KEY` | Gemini key for real AI replies | API only |
   | `YOUTUBE_API_KEY` | optional: first aid videos inside the app | API only |
   | `GEMINI_MODEL`, `REQUIRE_SIGN_IN`, `ALLOWED_ORIGINS`, `RATE_LIMIT_PER_MINUTE` | optional | API only |

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

## Tests

```bash
npm run test:unit            # no database needed; also checks the Edge Functions are in sync
npm run ai:check             # checks your Gemini key
```

Database and integration tests are described in SUPABASE.md. What changed and where things are in the code: **CHANGES.md**.
