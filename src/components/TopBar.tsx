import React, { useEffect, useRef, useState } from 'react';
import { UserProfile } from '../types';
import { Avatar, cx, IconButton } from './ui';
import { WORLD_LANGUAGES } from '../data/religionsData';
import { Menu, Globe, Languages, Wind, Phone, Moon, Sun, Settings, HelpCircle, LogOut } from 'lucide-react';
import { PaletteTrigger } from './CommandPalette';
import { useScrolled, haptic } from '../lib/motion';

interface TopBarProps {
  /** Shorter title for phones */
  shortTitle?: string;
  title: string;
  subtitle?: string;
  /** 'no' when the title already comes from the app's own dictionary */
  titleTranslate?: 'no';
  subtitleTranslate?: 'no';
  profile: UserProfile;
  onOpenMenu: () => void;
  onOpenLanguage: () => void;
  onOpenCalm: () => void;
  onOpenSos: () => void;
  onOpenSettings: () => void;
  onOpenFeedback: () => void;
  onToggleTheme: () => void;
  onLogout: () => void;
  /** Open quick search (Ctrl/⌘ K) */
  onOpenSearch: () => void;
}

/**
 * The top bar holds the page title and a few actions:
 * Translate, theme, breathe, SOS and the account menu. Everything else lives in the sidebar.
 */
export const TopBar: React.FC<TopBarProps> = ({
  shortTitle,
  title,
  subtitle,
  titleTranslate,
  subtitleTranslate,
  profile,
  onOpenMenu,
  onOpenLanguage,
  onOpenCalm,
  onOpenSos,
  onOpenSettings,
  onOpenFeedback,
  onToggleTheme,
  onLogout,
  onOpenSearch,
}) => {
  const scrolled = useScrolled();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const isDark = profile.theme === 'dark';
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
      {label}
    </button>
  );

  return (
    <header data-scrolled={scrolled} className="topbar sticky top-0 z-30 flex items-center justify-between gap-2 border-b border-line bg-surface/80 px-3 py-3 backdrop-blur-xl sm:gap-3 sm:px-6 lg:px-10">
      <div className="flex min-w-0 items-center gap-2 sm:gap-3">
        <IconButton label="Open menu" onClick={onOpenMenu} className="glass-btn lg:hidden" aria-controls="main-navigation">
          <Menu className="h-5 w-5" />
        </IconButton>
        <div className="min-w-0">
          <p className="m-0 truncate text-lg font-bold leading-tight text-ink sm:text-xl" translate={titleTranslate}>
            {shortTitle ? (
              <>
                <span className="sm:hidden">{shortTitle}</span>
                <span className="hidden sm:inline">{title}</span>
              </>
            ) : (
              title
            )}
          </p>
          {subtitle && <p className="m-0 hidden truncate text-sm text-ink-3 md:block" translate={subtitleTranslate}>{subtitle}</p>}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1 sm:gap-2">
        <span className="hidden xl:block"><PaletteTrigger onClick={onOpenSearch} className="glass-btn w-60" /></span>
        <span className="hidden sm:block xl:hidden"><PaletteTrigger onClick={onOpenSearch} className="glass-btn" compact /></span>
        <button
          type="button"
          onClick={onOpenLanguage}
          className="glass-btn inline-flex h-10 min-w-10 items-center justify-center gap-2 rounded-xl border border-line bg-surface px-2 sm:h-11 sm:min-w-11 text-[0.9375rem] font-semibold text-ink hover:bg-muted sm:px-3.5 cursor-pointer"
          aria-label={`Translate. Language: ${lang?.name || 'English'}. Change language`}
          title="Translate"
        >
          <Languages className="h-5 w-5 text-pri-text" aria-hidden="true" />
          <span className="hidden xl:inline" translate="no">{lang?.nativeName || 'English'}</span>
          <span className="hidden uppercase sm:inline xl:hidden" translate="no">{(profile.language || 'en').split('-')[0]}</span>
        </button>

        <button
          type="button"
          onClick={onToggleTheme}
          className="glass-btn inline-flex h-10 w-10 items-center justify-center rounded-xl border border-line bg-surface text-ink hover:bg-muted max-[359px]:hidden sm:h-11 sm:w-11 cursor-pointer"
          aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
          title={isDark ? 'Light theme' : 'Dark theme'}
        >
          {isDark ? <Sun className="h-5 w-5 text-[#f59e0b]" aria-hidden="true" /> : <Moon className="h-5 w-5 text-pri-text" aria-hidden="true" />}
        </button>

        <button
          type="button"
          onClick={onOpenCalm}
          className="glass-btn hidden h-10 min-w-10 items-center justify-center gap-2 rounded-xl border border-line bg-surface px-2 text-[0.9375rem] font-semibold text-ink hover:bg-muted sm:inline-flex sm:h-auto sm:min-h-11 sm:px-3.5 cursor-pointer"
          aria-label="Breathe: start a 4-7-8 calming exercise"
        >
          <Wind className="h-5 w-5 text-pri-text" aria-hidden="true" />
          <span className="hidden sm:inline">Breathe</span>
        </button>

        <button
          type="button"
          onClick={() => {
            haptic(20);
            onOpenSos();
          }}
          className="glass-sheen inline-flex h-10 items-center gap-1.5 rounded-xl bg-danger px-2.5 text-[0.9375rem] sm:h-auto sm:min-h-11 font-bold sm:gap-2 sm:px-4 text-[#fff] hover:bg-danger-hover cursor-pointer"
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
            aria-label="Account menu"
            className="glass-btn hidden rounded-full border p-[3px] sm:block cursor-pointer"
          >
            <Avatar name={profile.name || profile.nickname} tone="pri" size={38} />
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
              {menuItem('Settings and profile', <Settings className="h-5 w-5 text-ink-2" />, onOpenSettings)}
              {menuItem(
                isDark ? 'Switch to light theme' : 'Switch to dark theme',
                isDark ? <Sun className="h-5 w-5 text-ink-2" /> : <Moon className="h-5 w-5 text-ink-2" />,
                onToggleTheme
              )}
              <div className="sm:hidden">{menuItem('Change language', <Globe className="h-5 w-5 text-ink-2" />, onOpenLanguage)}</div>
              {menuItem('Ask the developers', <HelpCircle className="h-5 w-5 text-ink-2" />, onOpenFeedback)}
              <div className="my-1 h-px bg-line" />
              {menuItem('Log out', <LogOut className="h-5 w-5" />, onLogout, true)}
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
