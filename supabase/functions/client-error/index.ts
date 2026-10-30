/**
 * 4Life crash reports (same as POST /api/client-error on Vercel).
 * Writes the error text and page path to the function logs. Nothing personal is sent.
 */
import { fromResult, serveFunction } from '../_shared/http.ts';
import { clientError } from '../_shared/core/handlers.ts';

serveFunction({ method: 'POST', limited: true }, (_req, body) => fromResult(clientError(body)));
