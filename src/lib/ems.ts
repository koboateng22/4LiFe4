/**
 * Instant EMS: emergency places, checked hotline numbers, and sending your
 * location to your support person through your phone's own messaging app.
 */
import type { EmergencyCenter } from '../types';
import { EMERGENCY_CENTERS } from '../data/counselors';
import { distanceKm, roughDriveMins } from '../therapist/data';
import { db, hasRemote } from './supabase';

export { distanceKm, roughDriveMins };

export interface Hotline {
  id: string;
  label: string;
  number: string;
  description: string;
  /** When the number was last confirmed to work (ISO date) */
  verifiedAt: string;
  source: string;
}

/**
 * Only numbers that have been checked. Keep in step with
 * supabase/migrations/…_cbt_village_ems.sql (emergency_hotlines).
 */
export const CHECKED_HOTLINES: Hotline[] = [
  { id: 'gh-112', label: 'Emergency (all services)', number: '112', description: 'Police, fire and ambulance. Free from any phone.', verifiedAt: '2026-08-31', source: 'TherapyRoute Ghana crisis lines' },
  { id: 'gh-193', label: 'Ambulance', number: '193', description: 'National Ambulance Service.', verifiedAt: '2026-08-31', source: 'TherapyRoute Ghana crisis lines' },
  { id: 'gh-191', label: 'Police', number: '191', description: 'If you or someone else is in danger.', verifiedAt: '2026-08-31', source: 'TherapyRoute Ghana crisis lines' },
  { id: 'gh-192', label: 'Fire service', number: '192', description: 'Fire and rescue.', verifiedAt: '2026-08-31', source: 'TherapyRoute Ghana crisis lines' },
  {
    id: 'gh-yonkodo',
    label: 'Yonkodo Foundation',
    number: '0558 288 288',
    description: 'Emotional support and suicide prevention, answered by trained volunteers. Also on WhatsApp.',
    verifiedAt: '2026-08-31',
    source: 'TherapyRoute Ghana crisis lines',
  },
];

export const telHref = (n: string) => `tel:${n.split('/')[0].replace(/[^\d+]/g, '')}`;

export type CentreWithCheck = EmergencyCenter & { verifiedAt?: string };

export async function loadCentres(): Promise<CentreWithCheck[]> {
  if (!hasRemote()) return EMERGENCY_CENTERS;
  try {
    const { data, error } = await db().from('emergency_centers').select('*');
    if (error || !data?.length) return EMERGENCY_CENTERS;
    return data.map((r: any) => ({
      id: r.id,
      name: r.name,
      type: r.type,
      region: r.region,
      address: r.address,
      phone: r.phone,
      lat: r.lat,
      lng: r.lng,
      hours: r.hours,
      bedsAvailable: r.beds_available,
      emergencyHotline: r.emergency_hotline || undefined,
      verifiedAt: r.verified_at || undefined,
    }));
  } catch {
    return EMERGENCY_CENTERS;
  }
}

export async function loadHotlines(): Promise<Hotline[]> {
  if (!hasRemote()) return CHECKED_HOTLINES;
  try {
    const { data, error } = await db().from('emergency_hotlines').select('*').order('sort');
    if (error || !data?.length) return CHECKED_HOTLINES;
    return data
      .filter((r: any) => r.verified_at)
      .map((r: any) => ({ id: r.id, label: r.label, number: r.number, description: r.description, verifiedAt: r.verified_at, source: r.source }));
  } catch {
    return CHECKED_HOTLINES;
  }
}

/** Open now? true / false, or null when the hours can't be read. Uses Ghana time (GMT). */
export function isOpenNow(hours: string, now = new Date()): boolean | null {
  if (/24\s*(\/|hours|hrs|h)\s*7?|24\/7|24 hours/i.test(hours)) return true;
  const m = hours.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)\s*[-–to]+\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i);
  if (!m) return null;
  const toMin = (h: string, mm: string | undefined, ap: string) => ((Number(h) % 12) + (ap.toLowerCase() === 'pm' ? 12 : 0)) * 60 + Number(mm || 0);
  const open = toMin(m[1], m[2], m[3]);
  const close = toMin(m[4], m[5], m[6]);
  const cur = now.getUTCHours() * 60 + now.getUTCMinutes();
  return open <= close ? cur >= open && cur < close : cur >= open || cur < close;
}

export interface Fix {
  lat: number;
  lng: number;
  accuracyM: number;
  at: string;
}

/** The phone's current location (asks permission the first time). */
export function getPosition(timeoutMs = 10000): Promise<Fix> {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) return reject(new Error('unsupported'));
    navigator.geolocation.getCurrentPosition(
      p => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracyM: Math.round(p.coords.accuracy), at: new Date().toISOString() }),
      err => reject(err),
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 60000 }
    );
  });
}

/** Has the person already allowed location? (So we can use it without asking.) */
export async function locationAlreadyAllowed(): Promise<boolean> {
  try {
    const p = await (navigator as any).permissions?.query({ name: 'geolocation' });
    return p?.state === 'granted';
  } catch {
    return false;
  }
}

export const mapsLink = (f: { lat: number; lng: number }) => `https://maps.google.com/?q=${f.lat.toFixed(5)},${f.lng.toFixed(5)}`;

/** The text sent to a support person. Short enough for one SMS with the link. */
export function locationMessage(name: string, fix: Fix | null, extra?: string, near?: string | null) {
  const where = fix
    ? `I'm ${near ? `near ${near}` : 'here'}: ${mapsLink(fix)} (accurate to about ${fix.accuracyM} m).`
    : `I couldn't share my exact location.`;
  return `${name} here. I need help now. ${where}${extra ? ` ${extra}` : ''} Please call me, or call 112 if you can't reach me.`;
}

/** Opens the phone's messaging app with the message ready to send ("?&body=" works on Android and iPhone). */
/**
 * International digits for a Ghana number: "024 123 4567", "+233 24 123 4567",
 * "+233 (0)24 123 4567" and "00233 24…" all become "233241234567".
 */
export function ghanaDigits(phone: string): string {
  let d = phone.replace(/\(0\)/g, '').replace(/\D/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  if (d.startsWith('2330')) d = '233' + d.slice(4);
  else if (d.startsWith('0')) d = '233' + d.slice(1);
  return d;
}

export const smsHref = (phone: string, body: string) => `sms:+${ghanaDigits(phone)}?&body=${encodeURIComponent(body)}`;

/** Opens WhatsApp with the message ready. */
export const whatsappHref = (phone: string, body: string) => `https://wa.me/${ghanaDigits(phone)}?text=${encodeURIComponent(body)}`;
