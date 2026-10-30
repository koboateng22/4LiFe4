import React from 'react';
import { ActiveTab } from '../types';
import { NAV_ITEMS, BOTTOM_NAV_IDS } from '../navigation';
import { cx } from './ui';
import { haptic } from '../lib/motion';
import { MoreHorizontal } from 'lucide-react';

interface BottomNavProps {
  activeTab: ActiveTab;
  onNavigate: (tab: ActiveTab) => void;
  onOpenMore: () => void;
}

/** Mobile-only bar: four main sections plus "More", which opens the full menu. */
export const BottomNav: React.FC<BottomNavProps> = ({ activeTab, onNavigate, onOpenMore }) => {
  const inMore = !BOTTOM_NAV_IDS.includes(activeTab);

  const itemClass = (active: boolean) =>
    cx(
      'flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-xs cursor-pointer',
      active ? 'font-bold text-pri-text' : 'font-semibold text-ink-3'
    );

  return (
    <nav
      aria-label="Quick navigation"
      className="fixed inset-x-0 bottom-0 z-30 flex border-t border-line bg-surface/85 px-1 pb-[max(env(safe-area-inset-bottom),6px)] pt-1 backdrop-blur-xl lg:hidden"
    >
      {BOTTOM_NAV_IDS.map(id => {
        const item = NAV_ITEMS.find(n => n.id === id)!;
        const Icon = item.icon;
        const active = activeTab === id;
        return (
          <button key={id} type="button" onClick={() => { haptic(); onNavigate(id); }} aria-current={active ? 'page' : undefined} className={itemClass(active)}>
            <span key={active ? 'on' : 'off'} className={cx('flex h-8 w-14 items-center justify-center rounded-full border border-transparent transition-colors duration-200', active && 'glass-btn glass-btn-on nav-pop')}>
              <Icon className="h-6 w-6" aria-hidden="true" />
            </span>
            {item.shortLabel}
          </button>
        );
      })}
      <button type="button" onClick={() => { haptic(); onOpenMore(); }} className={itemClass(inMore)} aria-controls="main-navigation">
        <span className={cx('flex h-8 w-14 items-center justify-center rounded-full border border-transparent transition-colors duration-200', inMore && 'glass-btn glass-btn-on')}>
          <MoreHorizontal className="h-6 w-6" aria-hidden="true" />
        </span>
        More
      </button>
    </nav>
  );
};
