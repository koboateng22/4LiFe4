import { t } from '../i18n';
/**
 * The one rule for a person's age, used by sign-up, onboarding, Settings and the save to Supabase.
 * The limits match the check on profiles.age in the database (see the core schema migration).
 * Only the age in years is ever collected, never a date of birth.
 */
export const MIN_AGE = 13;
export const MAX_AGE = 120;

/** A whole number of years within the limits, or null for anything else. */
export function parseAge(value: unknown): number | null {
  const text = String(value ?? '').trim();
  if (!/^\d{1,3}$/.test(text)) return null;
  const age = Number(text);
  return age >= MIN_AGE && age <= MAX_AGE ? age : null;
}

/** What to tell the person about what they typed; empty when it is fine. */
export function ageError(value: unknown): string {
  const text = String(value ?? '').trim();
  if (!text) return t('Please enter your age.');
  if (/^\d+$/.test(text) && Number(text) < MIN_AGE) {
    return t('4Life is for people aged {min} or older. If you need support now, please talk to an adult you trust, or call 112 in an emergency.', { min: MIN_AGE });
  }
  return parseAge(text) === null ? t('Please enter your age in years, as a whole number from {min} to {max}.', { min: MIN_AGE, max: MAX_AGE }) : '';
}

/** Age boxes take digits only, so letters, signs and decimal points never get in. */
export const ageDigits = (text: string) => text.replace(/\D/g, '').slice(0, 3);
