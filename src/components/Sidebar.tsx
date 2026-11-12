import React, { useRef } from 'react';
import { ActiveTab, UserProfile } from '../types';
import { NAV_ITEMS, NAV_GROUP_LABELS, NavGroup } from '../navigation';
import { Avatar, cx, IconButton } from './ui';
import { X, Phone, Leaf, Search, Wind } from 'lucide-react';

import { t } from '../i18n';
interface SidebarProps {
  activeTab: ActiveTab;
  onNavigate: (tab: ActiveTab) => void;
  /** No longer used: the computer menu is a column of buttons now, with nothing to collapse */
  isCollapsed?: boolean;
  onToggleCollapsed?: () => void;
  isOpenMobile: boolean;
  onCloseMobile: () => void;
  profile: UserProfile;
  onOpenSos: () => void;
  /** Quick search (phones reach it from the menu) */
  onOpenSearch?: () => void;
  /** Breathing exercise (phones reach it from the menu) */
  onOpenCalm?: () => void;
}

/** The app logo: leaf mark plus the rounded wordmark. */
export const BrandMark: React.FC<{ compact?: boolean }> = ({ compact }) => (
  <span className="flex items-center gap-2.5">
    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-pri text-[#fff]">
      <Leaf className="h-5 w-5" aria-hidden="true" />
    </span>
    {!compact && <span className="font-logo text-[1.375rem] leading-none text-pri-text" translate="no">4Life</span>}
  </span>
);

/**
 * The one place for navigation.
 * Computers (1024 px and wider): a column of floating glass buttons on the left, each with its
 * name in a label beside it on hover or keyboard focus (and briefly on a press, for touch screens).
 * Phones and tablets: the dock at the bottom of the screen (MobileDock) instead. The drawer below
 * (labelled rows) is kept for a caller that opens it, but the app no longer needs to.
 * Styles: .side-rail / .rail-btn / .rail-label in index.css.
 */
export const Sidebar: React.FC<SidebarProps> = ({ activeTab, onNavigate, isOpenMobile, onCloseMobile, profile, onOpenSos, onOpenSearch, onOpenCalm }) => {
  const go = (tab: ActiveTab) => {
    onNavigate(tab);
    onCloseMobile();
  };

  // Touch screens have no hover: a press shows the name for a moment
  const peekTimer = useRef<number>();
  const peek = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.pointerType !== 'touch') return;
    const el = e.currentTarget;
    el.setAttribute('data-peek', '');
    window.clearTimeout(peekTimer.current);
    peekTimer.current = window.setTimeout(() => el.removeAttribute('data-peek'), 1200);
  };

  const groups: NavGroup[] = ['home', 'support'];

  const renderNav = (id: ActiveTab) => {
    const item = NAV_ITEMS.find(n => n.id === id)!;
    const Icon = item.icon;
    const active = activeTab === id;
    const label = t(item.label);
    return (
      <button
        key={id}
        type="button"
        onClick={() => go(id)}
        onPointerDown={peek}
        aria-current={active ? 'page' : undefined}
        aria-label={label}
        className={cx(
          'rail-btn flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-[0.9375rem] transition-colors cursor-pointer',
          active ? 'glass-btn glass-btn-on font-bold text-pri-ink' : 'font-semibold text-ink-2 hover:bg-pri-soft/40 hover:text-ink'
        )}
      >
        <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
        <span className="rail-label truncate" aria-hidden="true">
          {label}
        </span>
      </button>
    );
  };

  return (
    <>
      {/* Mobile backdrop */}
      {isOpenMobile && (
        <div className="fixed inset-0 z-40 bg-[rgba(15,23,42,0.55)] backdrop-blur-sm lg:hidden" onClick={onCloseMobile} aria-hidden="true" />
      )}

      <aside
        id="main-navigation"
        aria-label={t("Main navigation")}
        className={cx(
          'side-rail glass-bar glass-side fixed inset-y-0 left-0 z-50 flex h-[100dvh] w-[272px] flex-col border-r transition-transform duration-300 lg:z-30 lg:w-24 lg:items-center lg:py-5',
          // phones and tablets use the dock (MobileDock); the drawer only shows if something opens it
          isOpenMobile ? 'translate-x-0 shadow-2xl' : 'max-lg:hidden'
        )}
      >
        {/* Brand row (on computers: the logo, as the way home) */}
        <div className="flex items-center justify-between gap-2 px-4 pb-4 pt-5 lg:p-0 lg:pb-6">
          <button type="button" onClick={() => go('dashboard')} className="rounded-xl cursor-pointer lg:pointer-events-auto" aria-label={t("4Life home")}>
            <span className="lg:hidden">
              <BrandMark />
            </span>
            <span className="hidden lg:block">
              <BrandMark compact />
            </span>
          </button>
          <span className="lg:hidden">
            <IconButton label={t("Close menu")} variant="ghost" onClick={onCloseMobile}>
              <X className="h-5 w-5" />
            </IconButton>
          </span>
        </div>

        {/* Sections */}
        <nav className="flex-1 overflow-y-auto overscroll-contain px-3 lg:flex lg:flex-none lg:flex-col lg:items-center lg:overflow-visible lg:px-0" aria-label={t("Sections")}>
          {onOpenSearch && (
            <button
              type="button"
              onClick={() => {
                onCloseMobile();
                onOpenSearch();
              }}
              className="mb-2 flex min-h-11 w-full items-center gap-3 rounded-xl border border-line bg-bg px-3 text-left text-[0.9375rem] font-semibold text-ink-3 sm:hidden cursor-pointer"
            >
              <Search className="h-5 w-5" aria-hidden="true" /> {t("Search or jump to…")}
            </button>
          )}
          {groups.map(group => {
            const items = NAV_ITEMS.filter(n => n.group === group);
            const heading = NAV_GROUP_LABELS[group];
            return (
              <div key={group} className="mb-2 lg:mb-0 lg:flex lg:flex-col lg:items-center">
                {heading && (
                  <>
                    <p className="mx-3 mb-1.5 mt-4 text-xs font-bold text-ink-3 lg:hidden">{t(heading)}</p>
                    {/* on computers a short line separates the groups */}
                    <div className="mx-auto my-3 hidden h-px w-6 bg-line lg:block" aria-hidden="true" />
                  </>
                )}
                <div className="flex flex-col gap-0.5 lg:items-center lg:gap-2.5">{items.map(item => renderNav(item.id))}</div>
              </div>
            );
          })}
        </nav>

        {/* Bottom: settings, profile, and crisis line */}
        <div className="flex flex-col gap-1 border-t border-line px-3 pb-4 pt-3 lg:mt-auto lg:items-center lg:gap-2.5 lg:border-0 lg:p-0">
          {renderNav('profile_settings')}

          {onOpenCalm && (
            <button
              type="button"
              onClick={() => {
                onCloseMobile();
                onOpenCalm();
              }}
              className="mt-1 flex min-h-11 items-center justify-center gap-2 rounded-xl border border-line bg-surface px-3 text-[0.9375rem] font-bold text-ink hover:bg-muted sm:hidden cursor-pointer"
            >
              <Wind className="h-5 w-5 text-pri-text" aria-hidden="true" />
              {t("Breathe with me")}
            </button>
          )}

          {/* Mobile drawer gets its own SOS so help is never more than one tap away */}
          <button
            type="button"
            onClick={() => {
              onCloseMobile();
              onOpenSos();
            }}
            className="mt-1 flex min-h-11 items-center justify-center gap-2 rounded-xl bg-danger px-3 text-[0.9375rem] font-bold text-[#fff] hover:bg-danger-hover lg:hidden cursor-pointer"
          >
            <Phone className="h-5 w-5" aria-hidden="true" />
            {t("Get help now (SOS)")}
          </button>

          {/* The person (opens Settings): a row in the drawer, a round button on computers */}
          <button
            type="button"
            onClick={() => go('profile_settings')}
            onPointerDown={peek}
            aria-label={profile.name || profile.nickname}
            className="rail-btn mt-2 flex items-center gap-3 rounded-xl bg-muted p-3 text-left hover:brightness-95 cursor-pointer lg:mt-0"
          >
            <Avatar name={profile.name || profile.nickname} solid size={36} />
            <span className="rail-label min-w-0" aria-hidden="true">
              <span className="block truncate text-[0.9375rem] font-bold text-ink lg:text-sm">{profile.name}</span>
              <span className="block truncate text-xs text-ink-3 lg:hidden">{profile.nickname}</span>
            </span>
          </button>
        </div>
      </aside>
    </>
  );
};
