/**
 * 4Life health check (same as GET /api/health on Vercel).
 * Shows whether the functions are up and which services are switched on. Never shows a key.
 */
import { ctx, fromResult, serveFunction } from '../_shared/http.ts';
import { health } from '../_shared/core/handlers.ts';

serveFunction({ method: 'GET' }, () => fromResult(health(ctx)));
