# 4Life launch checklist (Vercel)

Work through this before you share the link with real users.

## 1. Decide before launch

- [ ] **AI providers and private data.** Groq answers the chat first and Gemini takes over when Groq can't. On their free tiers both have daily limits, and Google says free-tier Gemini prompts may be used to improve its products; check Groq's data terms for your plan too.
- [ ] **Gemini billing.** Google's terms say not to send sensitive or personal information to the free (unpaid) Gemini API, and that free-tier prompts may be read by human reviewers and used to improve Google's products. Recovery chats are sensitive. Turn on billing for the Google Cloud project that owns `GEMINI_API_KEY` (paid tier: prompts aren't used to improve products). Source: https://ai.google.dev/gemini-api/terms
- [ ] **Age.** The same terms say API users must be 18+ and apps must not be aimed at, or likely to be used by, people under 18. Sign-up now asks for an age and accepts 13 and over, which matches the limit already in the database, so this is still open: people aged 13 to 17 can reach the AI. Decide how 4Life handles this before inviting students. If the answer is 18 and over, change `MIN_AGE` in `src/lib/age.ts`, and the limits in the database check and the sign-up trigger.
- [ ] **No demo accounts.** `VITE_ENABLE_DEMO` must be empty in **Production** (set it to `true` only for Preview, if you want the demo accounts there). A production build then contains no demo data at all (`npm run test:demo-build` checks this). If the Supabase project ever had demo accounts, delete them: `npm run db:remove-demo`, then again with `CONFIRM=yes`.
- [ ] **Require sign-in.** Set `REQUIRE_SIGN_IN=true` in Vercel once everyone signs in through Supabase. Until then, anyone who finds the URL can call the AI routes.

## 2. Vercel settings

- [ ] Environment variables set for Production and Preview (see README): `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `GROQ_API_KEY` and `GEMINI_API_KEY` (the AI: Groq first, Gemini as backup), and optionally `YOUTUBE_API_KEY` (first aid and Learn videos), `VIDEO_DAILY_UNITS`, `VITE_AUTH_GOOGLE` / `VITE_AUTH_PHONE` (only after the set-up in SUPABASE.md, section 6), `GROQ_MODEL`, `GEMINI_MODEL`, `PRIMARY_AI_PROVIDER`, `FALLBACK_AI_PROVIDER`, `REQUIRE_SIGN_IN`, `ALLOWED_ORIGINS`, `RATE_LIMIT_PER_MINUTE`.
- [ ] Supabase: migration `20261106000009_theme_system.sql` applied (the "System default" theme is refused by the database without it).
- [ ] Node.js version: leave Project Settings on 24.x (Node 20 no longer deploys). `package.json` asks for 22 or newer, which Vercel maps to 24.
- [ ] Framework preset shows **Vite** (set in `vercel.json`).
- [ ] Optional: in **Firewall**, add a rate-limit rule for `/api/chat`. The app's own limit counts per server instance, so a firewall rule is the stronger brake.
- [ ] Supabase: migrations applied. Authentication → URL Configuration: **Site URL** is the public address (`https://4lifeee.vercel.app`), not a protected Vercel address, and **Redirect URLs** include `https://4lifeee.vercel.app/**` and `http://localhost:3000/**` (needed for confirmation and password-reset emails). See SUPABASE.md, section 1.
- [ ] Vercel → Settings → Deployment Protection: the public production address must open without a Vercel log-in. `https://<your-app>/api/health` shows the right `supabaseProject`.
- [ ] Supabase: custom SMTP set under Authentication → Emails (see SUPABASE.md, step 2), then sign up with a new address outside your team and confirm that the email arrives and its link opens the Vercel site.

## 3. Before each deploy

```bash
npm ci
npm run lint          # type check
npm run test:unit
npm run test:i18n     # every language has every text
npm run test:account-db
npm run test:demo-build   # no demo accounts in a production build
npm audit --omit=dev  # no high or critical
npm run build
```

## 4. Straight after deploying (first hour)

- [ ] `https://<your-app>/api/health` returns `ok: true`, with `gemini: true` (and `youtube: true` if you added the key).
- [ ] On a phone: sign in, send one AI message, open the Village, open Instant EMS, open a first aid topic, tap Call 112 (cancel before it dials).
- [ ] Instant EMS: migration applied, clean-ups scheduled, and the manual checks in EMERGENCY.md done.
- [ ] Turn on airplane mode and reopen the app: Instant EMS and first aid still open.
- [ ] Vercel → **Logs**: no new errors. Crashes in people's browsers appear there as `[app error] …`.

## 5. Rollback

If errors jump, the AI stops replying, or sign-in breaks:

1. Vercel → **Deployments** → the last good deployment → **Instant Rollback** (about a minute).
2. Check `/api/health` and the phone test above again.
3. Fix on a branch, check it on a Preview deployment, then promote it.

Database changes (Supabase migrations) are not rolled back by Vercel. Apply them separately and keep them backwards compatible.
