/**
 * 4Life chat: the AI CBT companion, as a Supabase Edge Function.
 * Same behaviour as POST /api/chat on Vercel (both use _shared/core/handlers.ts).
 *
 * Request:  POST { message, mode?, history?, userProfile?, stream? }
 * Response: when stream === true → server-sent events:
 *             event: meta   data: { risk }                 (instant keyword check)
 *             event: delta  data: { text }                 (more of the reply)
 *             event: done   data: { reply, suggestions, risk, model, mode, language }
 *           otherwise → the same "done" object as JSON.
 *
 * Secrets: GEMINI_API_KEY (or OPENAI_API_KEY), optional GEMINI_MODEL / OPENAI_MODEL,
 * REQUIRE_SIGN_IN (default true here), RATE_LIMIT_PER_MINUTE.
 * Without an AI key, built-in replies are used so the chat still answers.
 */
import { corsHeaders } from '../_shared/cors.ts';
import { ctx, fromResult, json, serveFunction } from '../_shared/http.ts';
import { readChat, runChat } from '../_shared/core/handlers.ts';

serveFunction({ method: 'POST', protected: true }, async (_req, body) => {
  const read = readChat(body);
  if ('error' in read) return fromResult(read.error);
  const { input } = read;

  if (!input.stream) return json(await runChat(input, ctx, () => {}));

  // Stops the AI request if the person presses Stop or closes the app (see cancel() below)
  const aborter = new AbortController();

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch {
          /* the person already left */
        }
      };
      const done = await runChat(input, ctx, send, aborter.signal);
      send('done', done);
      try {
        controller.close();
      } catch {
        /* already closed */
      }
    },
    cancel() {
      aborter.abort();
    },
  });

  return new Response(stream, {
    headers: {
      ...corsHeaders,
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no',
    },
  });
});
