import React, { useEffect, useState } from 'react';
import { UserProfile } from '../../types';
import { SELECTABLE_LANGUAGES as LANGS, LanguageOption } from '../../data/religionsData';
import { changeLanguage } from '../../utils/translateUtils';
import { Modal, Button, Notice, inputClass, cx } from '../ui';
import { Search, Check, RotateCcw } from 'lucide-react';

import { t, msg } from '../../i18n';
interface LanguageSwitcherModalProps {
  isOpen: boolean;
  onClose: () => void;
  profile: UserProfile;
  setProfile?: React.Dispatch<React.SetStateAction<UserProfile>>;
}

const AFRICA = ['yo', 'ig', 'sw', 'am', 'so', 'zu', 'fr', 'ar', 'pt'];

/** Choose the app's language. Every word is translated in the app, and AI replies are written in the language directly. */
export const LanguageSwitcherModal: React.FC<LanguageSwitcherModalProps> = ({ isOpen, onClose, profile, setProfile }) => {
  const [query, setQuery] = useState('');
  const [done, setDone] = useState<string | null>(null);
  const current = profile.language || 'en';

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setDone(null);
    }
  }, [isOpen]);

  const choose = (lang: LanguageOption) => {
    setProfile?.(prev => ({ ...prev, language: lang.code }));
    changeLanguage(lang.code);
    setDone(lang.code === 'en' ? msg('Showing the app in English.') : t('Switching the app to {language}…', { language: lang.nativeName }));
    setTimeout(onClose, 900);
  };

  const q = query.toLowerCase().trim();
  const matches = (l: LanguageOption) =>
    !q || l.name.toLowerCase().includes(q) || l.nativeName.toLowerCase().includes(q) || l.code.toLowerCase().includes(q) || (l.regionFocus || '').toLowerCase().includes(q);

  const groups: Array<{ title: string; list: LanguageOption[] }> = q
    ? [{ title: msg('Matching languages'), list: LANGS.filter(matches) }]
    : [
        { title: msg('Across Africa'), list: AFRICA.map(c => LANGS.find(l => l.code === c)).filter(Boolean) as LanguageOption[] },
        { title: msg('Other languages'), list: LANGS.filter(l => !AFRICA.includes(l.code)) },
      ].filter(g => g.list.length > 0);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t("Language")}
      subtitle={t('Everything in the app changes to your language, and AI replies are written in it. Translated with AI, not yet checked by native speakers. Emergency steps stay in English.')}
      footer={
        <div className="flex w-full items-center justify-between gap-3">
          <Button variant="ghost" onClick={() => choose(LANGS.find(l => l.code === 'en')!)} icon={<RotateCcw className="h-4 w-4" />} disabled={current === 'en'}>
            {t("Back to English")}
          </Button>
          <Button onClick={onClose}>{t("Done")}</Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        {done && <Notice icon={<Check className="h-5 w-5" />}>{t(done)}</Notice>}
        <div className="relative">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-3" aria-hidden="true" />
          <label htmlFor="lang-search" className="sr-only">
            {t("Search languages")}
          </label>
          <input id="lang-search" type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder={t('Search, e.g. French, Swahili, Arabic')} className={cx(inputClass, 'pl-11')} />
        </div>

        {groups.map(g => (
          <section key={g.title} aria-label={t(g.title)} className="flex flex-col gap-2">
            <h3 className="m-0 text-sm font-bold text-ink-3">{t(g.title)}</h3>
            {g.list.length === 0 ? (
              <p className="m-0 text-[0.9375rem] text-ink-2">{t("No language matches “{query}”.", { query })}</p>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2" translate="no">
                {g.list.map(l => {
                  const on = current === l.code;
                  return (
                    <button
                      key={l.code}
                      type="button"
                      aria-pressed={on}
                      onClick={() => choose(l)}
                      className={cx(
                        'flex min-h-14 items-center justify-between gap-3 rounded-xl border px-4 py-2.5 text-left cursor-pointer',
                        on ? 'border-pri-text bg-pri-soft' : 'border-line bg-surface hover:border-pri-text'
                      )}
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-[0.9375rem] font-bold text-ink">{l.name}</span>
                        {l.nativeName !== l.name && <span className="block truncate text-sm text-ink-3">{l.nativeName}</span>}
                      </span>
                      {on && <Check className="h-5 w-5 shrink-0 text-pri-text" aria-hidden="true" />}
                    </button>
                  );
                })}
              </div>
            )}
          </section>
        ))}
      </div>
    </Modal>
  );
};
