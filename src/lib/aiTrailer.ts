/**
 * Gemini ends each chat reply with one hidden line:
 *   <<NEXT>> suggestion | suggestion | suggestion <<RISK>> none|concern|crisis
 * These helpers stream the reply without ever showing that line, then read it.
 */
import { asRiskLevel, type RiskLevel } from './safety.js';

export const NEXT_MARK = '<<NEXT>>';
export const RISK_MARK = '<<RISK>>';

// Tolerates spacing or case changes ("<< NEXT >>", "<<next>>") and a RISK marker without NEXT
const MARKER = /<<\s*(NEXT|RISK)\s*>>/i;

/** Split a full answer into the reply and the hidden last line. */
export function splitTrailer(full: string): { reply: string; suggestions: string[]; risk: RiskLevel } {
  const m = MARKER.exec(full);
  if (!m) return { reply: full.trim(), suggestions: [], risk: 'none' };
  const trailer = full.slice(m.index);
  const nextPart = /<<\s*NEXT\s*>>([\s\S]*?)(?=<<\s*RISK\s*>>|$)/i.exec(trailer)?.[1] || '';
  const riskPart = /<<\s*RISK\s*>>\s*([a-z]+)/i.exec(trailer)?.[1] || '';
  const suggestions = nextPart
    .split('|')
    .map(x => x.trim().replace(/^["'“”]+|["'“”]+$/g, ''))
    .filter(x => x && x.length <= 80)
    .slice(0, 3);
  return { reply: full.slice(0, m.index).trim(), suggestions, risk: asRiskLevel(riskPart.toLowerCase()) };
}

/**
 * Feed it chunks as they arrive; it returns the text that is safe to show now.
 * Anything from a "<<" that could be the start of the hidden line is held back.
 */
export function trailerStreamer() {
  let full = '';
  let sent = 0;
  return {
    push(chunk: string): string {
      full += chunk;
      const m = MARKER.exec(full);
      let safeEnd: number;
      if (m) safeEnd = m.index;
      else {
        // Hold back from the first "<" among the last few characters, in case a marker is starting
        const lt = full.indexOf('<', Math.max(sent, full.length - 16));
        safeEnd = lt >= 0 ? lt : full.length;
      }
      safeEnd = Math.max(sent, safeEnd);
      const out = full.slice(sent, safeEnd);
      sent = safeEnd;
      return out;
    },
    /** Call at the end: the remaining visible text plus the parsed hidden line. */
    finish() {
      const parsed = splitTrailer(full);
      const shown = full.slice(0, sent);
      const rest = parsed.reply.startsWith(shown.trimStart()) ? parsed.reply.slice(shown.trimStart().length) : '';
      return { ...parsed, rest };
    },
  };
}
