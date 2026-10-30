/**
 * Google Translate for the whole app.
 *
 * How it works:
 * 1. The Google Translate script (loaded in index.html) adds a hidden widget.
 * 2. When someone picks a language we set Google's `googtrans` cookie and select
 *    that language in the hidden widget. Google then translates every piece of text
 *    on the page — and keeps translating new text as it appears (chat replies, tabs…).
 * 3. The choice is saved in localStorage + the cookie, so it survives a reload.
 */

/** Languages Google does not translate directly are mapped to the closest one it does. */
export const GOOGLE_TRANSLATE_CODE_MAP: Record<string, string> = {
  fat: 'ak', // Fante → Akan (Twi)
  twi: 'ak',
  tw: 'ak',
  zh: 'zh-CN',
};

/** Human-readable note shown when a fallback language is used. */
export const FALLBACK_NOTE: Record<string, string> = {
  fat: 'Uses Twi',
};

/** Right-to-left scripts */
const RTL_CODES = ['ar', 'ur', 'fa', 'he', 'iw', 'ps', 'sd', 'ug', 'yi'];
export const isRtl = (code: string) => RTL_CODES.includes((code || '').toLowerCase());

export const googleCodeFor = (code: string) => {
  const clean = (code || 'en').trim();
  return GOOGLE_TRANSLATE_CODE_MAP[clean.toLowerCase()] || clean;
};

/** Load the Google Translate script if index.html has not already done so. */
export function ensureGoogleTranslateScript(): void {
  if (typeof window === 'undefined') return;

  if (!(window as any).googleTranslateElementInit) {
    (window as any).googleTranslateElementInit = function () {
      try {
        const g = (window as any).google;
        if (g && g.translate) {
          new g.translate.TranslateElement(
            { pageLanguage: 'en', autoDisplay: false, layout: g.translate.TranslateElement.InlineLayout.SIMPLE },
            'google_translate_element'
          );
        }
      } catch (err) {
        console.warn('Google Translate initialization notice:', err);
      }
    };
  }

  if (!document.querySelector('script[src*="translate.google.com/translate_a/element.js"]')) {
    const script = document.createElement('script');
    script.type = 'text/javascript';
    script.src = 'https://translate.google.com/translate_a/element.js?cb=googleTranslateElementInit';
    script.async = true;
    document.head.appendChild(script);
  }
}

const getCombo = () =>
  document.querySelector<HTMLSelectElement>('.goog-te-combo') || document.querySelector<HTMLSelectElement>('#google_translate_element select');

/** Codes offered by the loaded Google widget (empty until the widget is ready). */
export function availableGoogleCodes(): string[] {
  const combo = getCombo();
  return combo ? Array.from(combo.options).map(o => o.value).filter(Boolean) : [];
}

function setCookies(googleCode: string | null) {
  const host = window.location.hostname;
  const domains = ['', host, `.${host}`];
  domains.forEach(domain => {
    const domainAttr = domain ? `domain=${domain};` : '';
    if (!googleCode) {
      document.cookie = `googtrans=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; ${domainAttr}`;
    } else {
      document.cookie = `googtrans=/en/${googleCode}; path=/; ${domainAttr}`;
    }
  });
}

export type TranslateResult = 'applied' | 'english' | 'unsupported' | 'unavailable';

/**
 * Switch the whole app to `langCode`.
 * `onResult` reports what happened so the UI can tell the person honestly:
 *  - applied      → Google is translating the page
 *  - english      → back to the original English
 *  - unsupported  → Google has no translation for that language (page stays in English)
 *  - unavailable  → Google Translate could not be reached (offline or blocked)
 */
export function changeLanguage(langCode: string, onResult?: (r: TranslateResult) => void, opts: { force?: boolean } = {}) {
  try {
    const cleanCode = (langCode || 'en').trim();
    const isEnglish = cleanCode.toLowerCase() === 'en';
    const googleCode = googleCodeFor(cleanCode);

    try {
      localStorage.setItem('4life_user_language', cleanCode);
    } catch {}

    // Page language + reading direction, for screen readers and RTL scripts
    document.documentElement.lang = isEnglish ? 'en' : googleCode;
    document.documentElement.dir = isRtl(googleCode) ? 'rtl' : 'ltr';

    try {
      window.dispatchEvent(new CustomEvent('4life-language-changed', { detail: cleanCode }));
    } catch {}

    ensureGoogleTranslateScript();
    setCookies(isEnglish ? null : googleCode);

    const apply = (): TranslateResult | null => {
      const combo = getCombo();
      if (!combo) return null;
      if (isEnglish) {
        // Google's own "show original" — restores every translated text node
        const frame = document.querySelector<HTMLIFrameElement>('iframe.goog-te-banner-frame, iframe.skiptranslate');
        const restore = frame?.contentWindow?.document.querySelector<HTMLButtonElement>('[id$=".restore"], button');
        if (restore) restore.click();
        combo.value = '';
        combo.dispatchEvent(new Event('change', { bubbles: true }));
        // If Google did not restore every text, a reload shows the original (the cookie is already cleared)
        setTimeout(() => {
          const html = document.documentElement;
          if (html.classList.contains('translated-ltr') || html.classList.contains('translated-rtl')) {
            window.location.reload();
          }
        }, 1500);
        return 'english';
      }
      const option = Array.from(combo.options).find(o => o.value === googleCode || o.value.toLowerCase() === googleCode.toLowerCase());
      if (!option) return 'unsupported';
      const html = document.documentElement;
      const alreadyTranslated = html.classList.contains('translated-ltr') || html.classList.contains('translated-rtl');
      if (!opts.force && combo.value === option.value && alreadyTranslated) return 'applied'; // nothing to do
      combo.value = option.value;
      combo.dispatchEvent(new Event('change', { bubbles: true }));
      return 'applied';
    };

    const first = apply();
    if (first) {
      onResult?.(first);
      return;
    }

    // The widget loads asynchronously — keep trying for about 8 seconds
    let attempts = 0;
    const timer = setInterval(() => {
      attempts++;
      const r = apply();
      if (r) {
        clearInterval(timer);
        onResult?.(r);
      } else if (attempts > 40) {
        clearInterval(timer);
        onResult?.(isEnglish ? 'english' : 'unavailable');
      }
    }, 200);
  } catch (e) {
    console.warn('Google Translate change error:', e);
    onResult?.('unavailable');
  }
}

export function resetToEnglish(onResult?: (r: TranslateResult) => void): void {
  changeLanguage('en', onResult);
}

export function getCurrentGoogleTranslateLanguage(): string {
  try {
    const saved = localStorage.getItem('4life_user_language');
    if (saved) return saved;
    const match = document.cookie.match(/googtrans=\/[a-zA-Z-]+\/([a-zA-Z-]+)/);
    if (match && match[1]) return match[1];
  } catch {}
  return 'en';
}

export function isTranslationActive(): boolean {
  const lang = getCurrentGoogleTranslateLanguage();
  return lang !== 'en' && lang !== '';
}

export function isGoogleTranslateAvailable(): boolean {
  if (typeof window === 'undefined') return false;
  return !!((window as any).google?.translate || getCombo());
}

/**
 * Google Translate swaps text nodes for <font> tags. React then sometimes tries to
 * remove a node that Google already moved, which crashes the page. These guards make
 * React and Google Translate work together (a widely used, well-known fix).
 */
export function installTranslateDomGuards(): void {
  if (typeof Node !== 'function' || !Node.prototype || (Node.prototype as any).__4lifeGuarded) return;
  (Node.prototype as any).__4lifeGuarded = true;

  const originalRemoveChild = Node.prototype.removeChild;
  Node.prototype.removeChild = function <T extends Node>(this: Node, child: T): T {
    if (child.parentNode !== this) {
      return child;
    }
    return originalRemoveChild.call(this, child) as T;
  };

  const originalInsertBefore = Node.prototype.insertBefore;
  Node.prototype.insertBefore = function <T extends Node>(this: Node, newNode: T, referenceNode: Node | null): T {
    if (referenceNode && referenceNode.parentNode !== this) {
      return originalInsertBefore.call(this, newNode, null) as T;
    }
    return originalInsertBefore.call(this, newNode, referenceNode) as T;
  };
}
