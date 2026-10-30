/**
 * 4Life first aid videos from YouTube (same as GET /api/first-aid/videos on Vercel).
 *
 * Request:  GET ?topic=cpr   (one of the built-in topics in src/lib/firstAid.ts)
 * Response: { topic, videos: [{ id, title, channel, thumb }], keyMissing? }
 * Secret: YOUTUBE_API_KEY (optional; without it the app opens a YouTube search instead).
 * Open to everyone (no personal data), but rate-limited to protect the YouTube quota.
 */
import { ctx, fromResult, serveFunction } from '../_shared/http.ts';
import { firstAidVideos } from '../_shared/core/handlers.ts';

serveFunction({ method: 'GET', limited: true }, async req => fromResult(await firstAidVideos(new URL(req.url).searchParams.get('topic'), ctx)));
