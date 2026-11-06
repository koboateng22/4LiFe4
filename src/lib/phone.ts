/**
 * Phone numbers for signing in with a text message code.
 * The code itself is made, sent (through Twilio Verify, set up as Supabase's SMS provider),
 * timed out, rate-limited and checked by Supabase Auth on the server; the app only collects a
 * well-formed number in international (E.164) form.
 */
export interface Country {
  code: string;
  name: string;
  dial: string;
  /** Digits in a national number without the leading 0, when that is fixed */
  digits?: [number, number];
}

/** Ghana first, then nearby and common countries. */
export const COUNTRIES: Country[] = [
  { code: 'GH', name: 'Ghana', dial: '233', digits: [9, 9] },
  { code: 'NG', name: 'Nigeria', dial: '234', digits: [10, 10] },
  { code: 'CI', name: "Côte d'Ivoire", dial: '225', digits: [10, 10] },
  { code: 'TG', name: 'Togo', dial: '228', digits: [8, 8] },
  { code: 'BF', name: 'Burkina Faso', dial: '226', digits: [8, 8] },
  { code: 'KE', name: 'Kenya', dial: '254', digits: [9, 9] },
  { code: 'ZA', name: 'South Africa', dial: '27', digits: [9, 9] },
  { code: 'GB', name: 'United Kingdom', dial: '44', digits: [10, 10] },
  { code: 'US', name: 'United States / Canada', dial: '1', digits: [10, 10] },
  { code: 'DE', name: 'Germany', dial: '49', digits: [7, 12] },
  { code: 'FR', name: 'France', dial: '33', digits: [9, 9] },
  { code: 'NL', name: 'Netherlands', dial: '31', digits: [9, 9] },
];

export const countryByCode = (code: string) => COUNTRIES.find(c => c.code === code) || COUNTRIES[0];

/**
 * A number typed the local way ("024 123 4567", "+233 24…", "00233…") as E.164 ("+233241234567"),
 * or null when it can't be a phone number in that country.
 */
export function toE164(country: Country, typed: string): string | null {
  let d = String(typed || '').replace(/[^\d+]/g, '');
  if (d.startsWith('+')) d = d.slice(1);
  else if (d.startsWith('00')) d = d.slice(2);
  else d = country.dial + d.replace(/^0+/, ''); // a national number: drop the trunk 0
  d = d.replace(/\D/g, '');
  if (!d.startsWith(country.dial)) {
    // typed with another country's code: accept it if it's a plausible international number
    return d.length >= 8 && d.length <= 15 ? `+${d}` : null;
  }
  const national = d.slice(country.dial.length).replace(/^0+/, '');
  const [min, max] = country.digits || [6, 14];
  if (national.length < min || national.length > max) return null;
  return `+${country.dial}${national}`;
}

/** "+233241234567" → "+233 24 123 4567" style, for showing back to the person */
export function showPhone(e164: string): string {
  const c = COUNTRIES.find(x => e164.startsWith(`+${x.dial}`));
  if (!c) return e164;
  const n = e164.slice(c.dial.length + 1);
  // 9 digits: 24 123 4567 (Ghana), 10 digits: 803 123 4567; otherwise groups of three
  const grouped = n.length === 9 ? n.replace(/^(\d{2})(\d{3})(\d{4})$/, '$1 $2 $3') : n.length === 10 ? n.replace(/^(\d{3})(\d{3})(\d{4})$/, '$1 $2 $3') : n.replace(/(\d{3})(?=\d)/g, '$1 ');
  return `+${c.dial} ${grouped}`;
}

/** Seconds before another code may be asked for (Supabase's own limit is 60 s per number) */
export const RESEND_SECONDS = 60;

/** A typed code: 6 digits (Twilio Verify's default length) */
export const cleanCode = (v: string) => String(v || '').replace(/\D/g, '').slice(0, 6);
