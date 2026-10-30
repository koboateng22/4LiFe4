/**
 * 4Life thought record helper (same as POST /api/cbt/suggest on Vercel).
 *
 * Request:  POST { thought, situation?, emotion?, userProfile? }
 * Response: { trap, questions[], balancedThought, insight, risk, language?, offline? }
 * The person always reviews and edits the suggestion in the app.
 */
import { ctx, fromResult, serveFunction } from '../_shared/http.ts';
import { cbtSuggest } from '../_shared/core/handlers.ts';

serveFunction({ method: 'POST', protected: true }, async (_req, body) => fromResult(await cbtSuggest(body, ctx)));
