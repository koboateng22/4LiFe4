/**
 * 4Life Learn section: educational videos from YouTube (same as GET /api/videos on Vercel).
 *
 * Request:  GET ?category=cbt&q=sleep&page=<token>   (topics in src/lib/videoLibrary.ts)
 * Response: { category, videos: [{ id, title, channel, description, thumb, duration, category, publishedAt }], nextPage, keyMissing?, error? }
 * Secrets: YOUTUBE_API_KEY (optional), VIDEO_DAILY_UNITS (optional quota budget, default 6000).
 * Open to everyone (no personal data), but rate-limited to protect the YouTube quota.
 */
import { ctx, fromResult, serveFunction } from '../_shared/http.ts';
import { libraryVideos } from '../_shared/core/handlers.ts';

serveFunction({ method: 'GET', limited: true }, async req => {
  const p = new URL(req.url).searchParams;
  return fromResult(await libraryVideos({ category: p.get('category'), q: p.get('q'), page: p.get('page') }, ctx));
});
