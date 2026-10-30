import React, { useEffect, useState } from 'react';
import { UserProfile } from '../../types';
import { WORLD_LANGUAGES, LanguageOption } from '../../data/religionsData';
import { changeLanguage } from '../../utils/translateUtils';
import { Modal, Button, Notice, inputClass, cx } from '../ui';
import { Search, Check, RotateCcw } from 'lucide-react';

interface LanguageSwitcherModalProps {
  isOpen: boolean;
  onClose: () => void;
  profile: UserProfile;
  setProfile?: React.Dispatch<React.SetStateAction<UserProfile>>;
}

const GHANA = ['en', 'ak', 'fat', 'gaa', 'ee', 'ha', 'dag'];
const AFRICA = ['yo', 'ig', 'sw', 'am', 'so', 'zu', 'fr', 'ar', 'pt'];

/** Choose the app's language. Menus are translated by Google Translate; AI replies are written in the language directly. */
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
    setDone(lang.code === 'en' ? 'Showing the app in English.' : `Switching the app to ${lang.name}…`);
    setTimeout(onClose, 900);
  };

  const q = query.toLowerCase().trim();
  const matches = (l: LanguageOption) =>
    !q || l.name.toLowerCase().includes(q) || l.nativeName.toLowerCase().includes(q) || l.code.toLowerCase().includes(q) || (l.regionFocus || '').toLowerCase().includes(q);

  const groups: Array<{ title: string; list: LanguageOption[] }> = q
    ? [{ title: 'Matching languages', list: WORLD_LANGUAGES.filter(matches) }]
    : [
        { title: 'Languages of Ghana', list: GHANA.map(c => WORLD_LANGUAGES.find(l => l.code === c)).filter(Boolean) as LanguageOption[] },
        { title: 'Across Africa', list: AFRICA.map(c => WORLD_LANGUAGES.find(l => l.code === c)).filter(Boolean) as LanguageOption[] },
        { title: 'Other languages', list: WORLD_LANGUAGES.filter(l => !GHANA.includes(l.code) && !AFRICA.includes(l.code)) },
      ];

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Language"
      subtitle="AI replies are written in your language. The rest of the app is translated by Google Translate."
      footer={
        <div className="flex w-full items-center justify-between gap-3">
          <Button variant="ghost" onClick={() => choose(WORLD_LANGUAGES.find(l => l.code === 'en')!)} icon={<RotateCcw className="h-4 w-4" />} disabled={current === 'en'}>
            Back to English
          </Button>
          <Button onClick={onClose}>Done</Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        {done && <Notice icon={<Check className="h-5 w-5" />}>{done}</Notice>}
        <div className="relative">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-3" aria-hidden="true" />
          <label htmlFor="lang-search" className="sr-only">
            Search languages
          </label>
          <input id="lang-search" type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search, e.g. Twi, Ewe, French" className={cx(inputClass, 'pl-11')} />
        </div>

        {groups.map(g => (
          <section key={g.title} aria-label={g.title} className="flex flex-col gap-2">
            <h3 className="m-0 text-sm font-bold text-ink-3">{g.title}</h3>
            {g.list.length === 0 ? (
              <p className="m-0 text-[0.9375rem] text-ink-2">No language matches “{query}”.</p>
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
