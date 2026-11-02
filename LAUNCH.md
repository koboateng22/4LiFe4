# 4Life launch checklist (Vercel)

Work through this before you share the link with real users.

## 1. Decide before launch

- [ ] **Gemini billing.** Google's terms say not to send sensitive or personal information to the free (unpaid) Gemini API, and that free-tier prompts may be read by human reviewers and used to improve Google's products. Recovery chats are sensitive. Turn on billing for the Google Cloud project that owns `GEMINI_API_KEY` (paid tier: prompts aren't used to improve products). Source: https://ai.google.dev/gemini-api/terms
- [ ] **Age.** The same terms say API users must be 18+ and apps must not be aimed at, or likely to be used by, people under 18. Decide how 4Life handles this (for example an "I am 18 or older" step at sign-up) before inviting students.
- [ ] **Require sign-in.** Set `REQUIRE_SIGN_IN=true` in Vercel once everyone signs in through Supabase. Until then, anyone who finds the URL can call the AI routes.

## 2. Vercel settings

- [ ] Environment variables set for Production and Preview (see README): `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `GEMINI_API_KEY`, and optionally `YOUTUBE_API_KEY`, `GEMINI_MODEL`, `REQUIRE_SIGN_IN`, `ALLOWED_ORIGINS`, `RATE_LIMIT_PER_MINUTE`.
- [ ] Node.js version: leave Project Settings on 24.x (Node 20 no longer deploys). `package.json` asks for 22 or newer, which Vercel maps to 24.
- [ ] Framework preset shows **Vite** (set in `vercel.json`).
- [ ] Optional: in **Firewall**, add a rate-limit rule for `/api/chat`. The app's own limit counts per server instance, so a firewall rule is the stronger brake.
- [ ] Supabase: migrations applied, and the Supabase "Site URL" / redirect URLs include your Vercel domain (needed for confirmation and password-reset emails).
- [ ] Supabase: custom SMTP set under Authentication → Emails (see SUPABASE.md, step 2), then sign up with a new address outside your team and confirm that the email arrives and its link opens the Vercel site.

## 3. Before each deploy

```bash
npm ci
npm run lint          # type check
npm run test:unit
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
