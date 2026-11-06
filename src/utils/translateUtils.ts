/**
 * Switching the app's language. Every word is translated in the app itself
 * (src/locales, see src/i18n), so it works offline and in every browser.
 * App.tsx listens for '4life-language-changed' and keeps the profile in step,
 * which also saves the choice to the account and tells the AI which language to use.
 */
import { normalizeLanguage, setLanguage } from '../i18n';

export { isRtl } from '../i18n';

export function changeLanguage(langCode: string): string {
  const next = normalizeLanguage(langCode);
  setLanguage(next);
  try {
    window.dispatchEvent(new CustomEvent('4life-language-changed', { detail: next }));
  } catch {}
  return next;
}

export const resetToEnglish = () => changeLanguage('en');
