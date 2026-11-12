import React, { useEffect, useRef, useState } from 'react';
import { UserProfile } from '../types';
import { Avatar, cx, IconButton } from './ui';
import { WORLD_LANGUAGES } from '../data/religionsData';
import { Globe, Languages, Wind, Phone, Settings, HelpCircle, LogOut, Search, Leaf } from 'lucide-react';
import { PaletteTrigger } from './CommandPalette';
import { useScrolled, haptic } from '../lib/motion';

import { t, T, msg } from '../i18n';
interface TopBarProps {
  /** Shorter title for phones */
  shortTitle?: string;
  title: string;
  subtitle?: string;
  /** 'no' when the title already comes from the app's own dictionary */
  titleTranslate?: 'no';
  subtitleTranslate?: 'no';
  profile: UserProfile;
  onOpenLanguage: () => void;
  onOpenCalm: () => void;
  onOpenSos: () => void;
  onOpenSettings: () => void;
  onOpenFeedback: () => void;
  onLogout: () => void;
  /** Open quick search (Ctrl/⌘ K) */
  onOpenSearch: () => void;
}

/**
 * The top bar: the page title and the tools that must always be in reach.
 * Phones: search, breathe, SOS and the account menu (with language, settings, help and log out); the
 * sections are in the dock at the bottom. Wider screens add the language button and labels.
 * The theme is in Settings → Appearance.
 */
export const TopBar: React.FC<TopBarProps> = ({
  shortTitle,
  title,
  subtitle,
  titleTranslate,
  subtitleTranslate,
  profile,
  onOpenLanguage,
  onOpenCalm,
  onOpenSos,
  onOpenSettings,
  onOpenFeedback,
  onLogout,
  onOpenSearch,
}) => {
  const scrolled = useScrolled();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const lang = WORLD_LANGUAGES.find(l => l.code === (profile.language || 'en'));

  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMenuOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  const menuItem = (label: string, icon: React.ReactNode, onClick: () => void, danger = false) => (
    <button
      type="button"
      role="menuitem"
      onClick={() => {
        setMenuOpen(false);
        onClick();
      }}
      className={cx(
        'flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-left text-[0.9375rem] font-semibold cursor-pointer',
        danger ? 'text-danger-text hover:bg-danger-soft' : 'text-ink hover:bg-muted'
      )}
    >
      {icon}
      {t(label)}
    </button>
  );

  return (
    <header
      data-scrolled={scrolled}
      className="topbar sticky top-0 z-30 flex items-center justify-between gap-2 border-b border-line bg-surface/80 px-3 pb-2.5 pt-[max(env(safe-area-inset-top),0.625rem)] backdrop-blur-xl sm:gap-3 sm:px-6 sm:py-3 lg:px-10"
    >
      <div className="flex min-w-0 items-center gap-2 sm:gap-3">
        {/* the 4Life mark, on phones with room for it (computers have it in the side rail) */}
        <span className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-pri text-[#fff] min-[380px]:flex lg:hidden" aria-hidden="true">
          <Leaf className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <p className="m-0 truncate text-[1.0625rem] font-bold leading-tight text-ink sm:text-xl" translate={titleTranslate}>
            {shortTitle ? (
              <>
                <span className="sm:hidden">{t(shortTitle)}</span>
                <span className="hidden sm:inline">{t(title)}</span>
              </>
            ) : (
              t(title)
            )}
          </p>
          {subtitle && <p className="m-0 hidden truncate text-sm text-ink-3 md:block" translate={subtitleTranslate}>{t(subtitle)}</p>}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1 sm:gap-2">
        <IconButton label={t("Search")} onClick={onOpenSearch} className="glass-btn sm:hidden">
          <Search className="h-5 w-5 text-pri-text" />
        </IconButton>
        <span className="hidden xl:block"><PaletteTrigger onClick={onOpenSearch} className="glass-btn w-60" /></span>
        <span className="hidden sm:block xl:hidden"><PaletteTrigger onClick={onOpenSearch} className="glass-btn" compact /></span>
        <button
          type="button"
          onClick={onOpenLanguage}
          className="glass-btn hidden h-11 min-w-11 items-center justify-center gap-2 rounded-xl border border-line bg-surface px-3.5 text-[0.9375rem] font-semibold text-ink hover:bg-muted sm:inline-flex cursor-pointer"
          aria-label={t("Translate. Language: {v0}. Change language", { v0: lang?.name || 'English' })}
          title={t("Translate")}
        >
          <Languages className="h-5 w-5 text-pri-text" aria-hidden="true" />
          <span className="hidden xl:inline" translate="no">{lang?.nativeName || 'English'}</span>
          <span className="hidden uppercase sm:inline xl:hidden" translate="no">{(profile.language || 'en').split('-')[0]}</span>
        </button>


        <button
          type="button"
          onClick={onOpenCalm}
          className="glass-btn inline-flex h-11 min-w-11 items-center justify-center gap-2 rounded-xl border border-line bg-surface px-2 text-[0.9375rem] font-semibold text-ink hover:bg-muted sm:h-auto sm:min-h-11 sm:px-3.5 cursor-pointer"
          aria-label={t("Breathe: start a 4-7-8 calming exercise")}
        >
          <Wind className="h-5 w-5 text-pri-text" aria-hidden="true" />
          <T text="<0>Breathe</0>" parts={[<span className="hidden sm:inline" />]} />
        </button>

        <button
          type="button"
          onClick={() => {
            haptic(20);
            onOpenSos();
          }}
          className="glass-sheen inline-flex h-11 items-center gap-1.5 rounded-xl bg-danger px-2.5 text-[0.9375rem] sm:h-auto sm:min-h-11 font-bold sm:gap-2 sm:px-4 text-[#fff] hover:bg-danger-hover cursor-pointer"
        >
          <Phone className="h-5 w-5" aria-hidden="true" />
          SOS
        </button>

        <div className="relative" ref={menuRef}>
          <button
            type="button"
            onClick={() => setMenuOpen(o => !o)}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            aria-label={t("Account menu")}
            className="glass-btn block rounded-full border p-[2px] sm:p-[3px] cursor-pointer"
          >
            <Avatar name={profile.name || profile.nickname} tone="pri" size={36} />
          </button>

          {menuOpen && (
            <div
              role="menu"
              className="absolute right-0 top-[calc(100%+8px)] z-40 w-64 rounded-2xl border border-line bg-surface p-2 shadow-xl animate-fadeIn"
            >
              <div className="px-3 pb-2 pt-1">
                <p className="m-0 truncate text-[0.9375rem] font-bold text-ink">{profile.name}</p>
                <p className="m-0 truncate text-sm text-ink-3">{profile.nickname}</p>
              </div>
              <div className="my-1 h-px bg-line" />
              {menuItem(msg('Settings and profile'), <Settings className="h-5 w-5 text-ink-2" />, onOpenSettings)}
              <div className="sm:hidden">{menuItem(msg('Change language'), <Globe className="h-5 w-5 text-ink-2" />, onOpenLanguage)}</div>
              {menuItem(msg('Ask the developers'), <HelpCircle className="h-5 w-5 text-ink-2" />, onOpenFeedback)}
              <div className="my-1 h-px bg-line" />
              {menuItem(msg('Log out'), <LogOut className="h-5 w-5" />, onLogout, true)}
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
