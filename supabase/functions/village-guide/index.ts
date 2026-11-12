/**
 * 4Life circle guide: a private AI answer before a group circle
 * (same as POST /api/village/guide on Vercel).
 *
 * Request:  POST { question, circleTitle?, userProfile? }
 * Response: { reply, risk, language?, offline? }
 */
import { ctx, fromResult, serveFunction } from '../_shared/http.ts';
import { villageGuide } from '../_shared/core/handlers.ts';

serveFunction({ method: 'POST', protected: true, ai: true }, async (_req, body) => fromResult(await villageGuide(body, ctx)));
