/**
 * CORS headers for every Edge Function response, so the 4Life app (on any
 * domain: localhost, Vercel, a phone) is allowed to call the functions.
 * Access is controlled by the sign-in check, not by the origin.
 *
 * supabase.functions.invoke() and the app's apiFetch() send: authorization,
 * apikey, content-type, accept, x-client-info, and x-region when a region is chosen.
 */
export const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, accept, x-region',
  'Access-Control-Max-Age': '86400',
  // lets the app read whether this server has an AI key (see AI_HEADER in core/ai.ts)
  'Access-Control-Expose-Headers': 'x-4life-ai',
};
