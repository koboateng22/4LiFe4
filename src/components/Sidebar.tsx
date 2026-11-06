import React from 'react';
import { ActiveTab, UserProfile } from '../types';
import { NAV_ITEMS, NAV_GROUP_LABELS, NavGroup } from '../navigation';
import { Avatar, cx, IconButton } from './ui';
import { ChevronLeft, ChevronRight, X, Phone, Leaf, Search, Wind } from 'lucide-react';

import { t } from '../i18n';
interface SidebarProps {
  activeTab: ActiveTab;
  onNavigate: (tab: ActiveTab) => void;
  isCollapsed: boolean;
  onToggleCollapsed: () => void;
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
 * Desktop: a fixed column that can shrink to icons. Mobile: a drawer opened from the top bar or "More".
 */
export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  onNavigate,
  isCollapsed,
  onToggleCollapsed,
  isOpenMobile,
  onCloseMobile,
  profile,
  onOpenSos,
  onOpenSearch,
  onOpenCalm,
}) => {
  const lang = profile.language;
  const collapsed = isCollapsed && !isOpenMobile;

  const go = (tab: ActiveTab) => {
    onNavigate(tab);
    onCloseMobile();
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
        aria-current={active ? 'page' : undefined}
        title={collapsed ? t(label) : undefined}
        className={cx(
          'flex min-h-11 w-full items-center gap-3 rounded-xl text-left text-[0.9375rem] transition-colors cursor-pointer',
          collapsed ? 'justify-center px-0' : 'px-3',
          active ? 'glass-btn glass-btn-on font-bold text-pri-ink' : 'font-semibold text-ink-2 hover:bg-pri-soft/40 hover:text-ink'
        )}
      >
        <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
        {collapsed ? (
          <span className="sr-only">{t(label)}</span>
        ) : (
          <span className="truncate">{t(label)}</span>
        )}
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
          'glass-bar glass-side fixed inset-y-0 left-0 z-50 flex h-[100dvh] flex-col border-r transition-[transform,width] duration-300 lg:z-30',
          collapsed ? 'w-20' : 'w-[272px]',
          isOpenMobile ? 'translate-x-0 shadow-2xl' : '-translate-x-full lg:translate-x-0'
        )}
      >
        {/* Brand row */}
        <div className={cx('flex items-center gap-2 px-4 pb-4 pt-5', collapsed ? 'flex-col' : 'justify-between')}>
          <button type="button" onClick={() => go('dashboard')} className="rounded-xl cursor-pointer" aria-label={t("4Life home")}>
            <BrandMark compact={collapsed} />
          </button>
          <span className="lg:hidden">
            <IconButton label={t("Close menu")} variant="ghost" onClick={onCloseMobile}>
              <X className="h-5 w-5" />
            </IconButton>
          </span>
          <span className="hidden lg:block">
            <IconButton label={collapsed ? t("Expand menu") : t("Collapse menu")} variant="ghost" onClick={onToggleCollapsed}>
              {collapsed ? <ChevronRight className="h-5 w-5" /> : <ChevronLeft className="h-5 w-5" />}
            </IconButton>
          </span>
        </div>

        {/* Sections */}
        <nav className="flex-1 overflow-y-auto overscroll-contain px-3" aria-label={t("Sections")}>
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
              <div key={group} className="mb-2">
                {heading &&
                  (collapsed ? (
                    <div className="mx-3 my-3 h-px bg-line" aria-hidden="true" />
                  ) : (
                    <p className="mx-3 mb-1.5 mt-4 text-xs font-bold text-ink-3">{t(heading)}</p>
                  ))}
                <div className="flex flex-col gap-0.5">
                  {items.map(item => renderNav(item.id))}
                </div>
              </div>
            );
          })}
        </nav>

        {/* Bottom: settings, profile, and crisis line */}
        <div className="flex flex-col gap-1 border-t border-line px-3 pb-4 pt-3">
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

          <button
            type="button"
            onClick={() => go('profile_settings')}
            className={cx(
              'mt-2 flex items-center gap-3 rounded-xl bg-muted p-3 text-left hover:brightness-95 cursor-pointer',
              collapsed && 'justify-center p-2'
            )}
            title={collapsed ? profile.name : undefined}
          >
            <Avatar name={profile.name || profile.nickname} solid size={40} />
            {!collapsed && (
              <span className="min-w-0">
                <span className="block truncate text-[0.9375rem] font-bold text-ink">{profile.name}</span>
                <span className="block truncate text-xs text-ink-3">{profile.nickname}</span>
              </span>
            )}
          </button>
        </div>
      </aside>
    </>
  );
};
