/**
 * The 4Life API (Express).
 *
 * Used in two places:
 *  - api/index.ts  → one Vercel function that answers every /api/... request
 *  - dev-server.ts → `npm run dev` (with Vite) and `npm start` on your own computer
 *
 * Layout:
 *  - core/        what each route does (no Express or Node here; the Supabase
 *                 functions use a copy, see `npm run sync:functions`)
 *  - routes.ts    the /api routes
 *  - middleware.ts CORS, sign-in, rate limit, errors
 *
 * Relative imports end in ".js" on purpose: Vercel runs this as a native ES module,
 * and Node needs the extension (TypeScript and Vite map "x.js" to "x.ts").
 * Secrets (GEMINI_API_KEY, YOUTUBE_API_KEY, …) are read from the environment only.
 */
import express from 'express';
import dotenv from 'dotenv';
import { apiRoutes } from './routes.js';
import { cors, errors, notFound } from './middleware.js';

// Read .env.local first (same file Vite uses), then .env. On Vercel these files don't exist.
dotenv.config({ path: ['.env.local', '.env'], quiet: true });

const app = express();
app.disable('x-powered-by');
// Vercel and most hosts sit behind a proxy; this makes req.ip the real visitor
app.set('trust proxy', true);

app.use('/api', cors());
app.use('/api', express.json({ limit: '100kb' }));
app.use('/api', apiRoutes());
app.use('/api', notFound);
app.use(errors);

export default app;
export { app };
