/**
 * 4Life Global Village house-rules check (same as POST /api/moderate on Vercel).
 *
 * Request:  POST { text }
 * Response: { ok, reason?, category?, risk, checkedBy: "rules" | "ai" }
 * The built-in rules run first; the AI only looks at posts the rules allow.
 */
import { ctx, fromResult, serveFunction } from '../_shared/http.ts';
import { moderate } from '../_shared/core/handlers.ts';

serveFunction({ method: 'POST', protected: true }, async (_req, body) => fromResult(await moderate(body, ctx)));
