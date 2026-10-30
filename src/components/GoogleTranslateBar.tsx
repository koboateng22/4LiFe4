import React, { useState } from 'react';
import { WORLD_LANGUAGES } from '../data/religionsData';
import { resetToEnglish } from '../utils/translateUtils';
import { Globe, RotateCcw, X } from 'lucide-react';
import { UserProfile } from '../types';

interface GoogleTranslateBarProps {
  profile: UserProfile;
  setProfile?: React.Dispatch<React.SetStateAction<UserProfile>>;
  onOpenLanguageTab: () => void;
}

/**
 * A slim strip shown while the app is translated: which language is on,
 * a way to change it, and a one-tap way back to English.
 */
export const GoogleTranslateBar: React.FC<GoogleTranslateBarProps> = ({ profile, setProfile, onOpenLanguageTab }) => {
  const [isDismissed, setIsDismissed] = useState(false);
  const code = profile.language || 'en';
  if (code === 'en' || isDismissed) return null;

  const lang = WORLD_LANGUAGES.find(l => l.code === code);
  const label = lang ? lang.nativeName : code;

  const showOriginal = () => {
    setProfile?.(p => ({ ...p, language: 'en' }));
    resetToEnglish();
  };

  return (
    <div className="border-b border-line bg-pri-soft text-pri-ink">
      <div className="mx-auto flex w-full max-w-[1180px] flex-wrap items-center gap-x-4 gap-y-1 px-4 py-1.5 sm:px-6 lg:px-10">
        <p className="m-0 flex min-w-0 flex-1 items-center gap-2 text-sm">
          <Globe className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span className="truncate">
            App language: <strong translate="no">{label}</strong>
          </span>
        </p>
        <div className="flex items-center gap-1">
          <button type="button" onClick={onOpenLanguageTab} className="min-h-11 rounded-lg px-3 text-sm font-bold hover:underline cursor-pointer">
            Change
          </button>
          <button
            type="button"
            onClick={showOriginal}
            className="flex min-h-11 items-center gap-1.5 rounded-lg px-3 text-sm font-bold hover:underline cursor-pointer"
          >
            <RotateCcw className="h-4 w-4" aria-hidden="true" />
            <span translate="no">English</span>
          </button>
          <button
            type="button"
            onClick={() => setIsDismissed(true)}
            className="flex h-11 w-11 items-center justify-center rounded-lg hover:bg-[rgba(0,0,0,0.06)] cursor-pointer"
            aria-label="Hide this bar"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  );
};
