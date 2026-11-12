/**
 * Scheduling rules, shared by the therapist's calendar, the booking screen (on this device) and the
 * tests. The database applies the same rules on the server (therapist_free_slots() and the
 * session-overlap guard in supabase/migrations/20261112000010_scheduling.sql), so a client never
 * sees, and can never be given, a time the therapist isn't free.
 *
 * Times are Ghana time (GMT, no daylight saving), which is how therapists enter their hours.
 */
export type Weekday = 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat' | 'Sun';
const WEEKDAY: Weekday[] = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Minutes between two sessions, for notes and a breather */
export const GAP_MIN = 10;
/** The earliest a session can be booked from now */
export const MIN_NOTICE_MIN = 120;

export interface Hours {
  days: Weekday[];
  startTime: string; // '09:00'
  endTime: string; // '17:00'
  sessionLength: number; // minutes
  breakStart?: string | null; // '13:00'
  breakEnd?: string | null; // '14:00'
}

/** Days off: from and to (inclusive), as 'YYYY-MM-DD' */
export interface TimeOff {
  id: string;
  startsOn: string;
  endsOn: string;
  note?: string;
}

export interface Busy {
  start: string; // ISO
  durationMin: number;
}

const mins = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + (m || 0);
};
/** 'YYYY-MM-DD' for a moment, in Ghana time (= UTC) */
export const dayKey = (d: Date) => d.toISOString().slice(0, 10);
export const weekdayOf = (d: Date): Weekday => WEEKDAY[d.getUTCDay()];

/** Do two time spans overlap? (Touching end to start does not count.) */
export function overlaps(aStart: number, aMin: number, bStart: number, bMin: number) {
  return aStart < bStart + bMin * 60000 && bStart < aStart + aMin * 60000;
}

/** Is this day blocked by time off? */
export const isTimeOff = (day: string, off: TimeOff[]) => off.some(o => day >= o.startsOn && day <= o.endsOn);

/** The first booked session that clashes with this time, if any */
export function clash(startIso: string, durationMin: number, busy: Busy[], ignoreStart?: string): Busy | undefined {
  const s = new Date(startIso).getTime();
  return busy.find(b => b.start !== ignoreStart && overlaps(s, durationMin, new Date(b.start).getTime(), b.durationMin));
}

/** The session start times on one day under these hours (before removing booked ones) */
export function daySlots(day: Date, h: Hours, durationMin = h.sessionLength): Date[] {
  if (!h.days.includes(weekdayOf(day))) return [];
  const out: Date[] = [];
  const base = Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate());
  const end = mins(h.endTime);
  const bs = h.breakStart ? mins(h.breakStart) : null;
  const be = h.breakEnd ? mins(h.breakEnd) : null;
  for (let t = mins(h.startTime); t + durationMin <= end; ) {
    if (bs !== null && be !== null && t < be && bs < t + durationMin) {
      t = be; // skip over the break
      continue;
    }
    out.push(new Date(base + t * 60000));
    t += durationMin + GAP_MIN;
  }
  return out;
}

/** Free times a client can book in the next `days` days: the therapist's hours minus breaks, days off and booked sessions. */
export function freeSlots(h: Hours, off: TimeOff[], busy: Busy[], opts: { from?: Date; days?: number; durationMin?: number; limit?: number } = {}): Date[] {
  const from = opts.from ?? new Date();
  const duration = opts.durationMin ?? h.sessionLength;
  const earliest = from.getTime() + MIN_NOTICE_MIN * 60000;
  const out: Date[] = [];
  for (let i = 0; i < (opts.days ?? 14) && out.length < (opts.limit ?? 60); i++) {
    const day = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate() + i));
    if (isTimeOff(dayKey(day), off)) continue;
    for (const s of daySlots(day, h, duration)) {
      if (s.getTime() < earliest) continue;
      if (busy.some(b => overlaps(s.getTime(), duration, new Date(b.start).getTime(), b.durationMin))) continue;
      out.push(s);
      if (out.length >= (opts.limit ?? 60)) break;
    }
  }
  return out;
}

/** Is this moment inside the therapist's working hours (not a break, not a day off)? For the calendar's shading. */
export function isWorkingTime(at: Date, h: Hours, off: TimeOff[]): boolean {
  if (!h.days.includes(weekdayOf(at)) || isTimeOff(dayKey(at), off)) return false;
  const m = at.getUTCHours() * 60 + at.getUTCMinutes();
  if (m < mins(h.startTime) || m >= mins(h.endTime)) return false;
  if (h.breakStart && h.breakEnd && m >= mins(h.breakStart) && m < mins(h.breakEnd)) return false;
  return true;
}
