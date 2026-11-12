import React from 'react';
import { ActiveTab } from '../types';
import { NAV_ITEMS } from '../navigation';
import { MobileDock } from './MobileDock';

import { t } from '../i18n';
interface BottomNavProps {
  activeTab: ActiveTab;
  onNavigate: (tab: ActiveTab) => void;
}

/**
 * Phones and tablets: every section, one tap away, as floating glass buttons (MobileDock).
 * Search, breathing, SOS and the account menu are in the top bar.
 */
export const BottomNav: React.FC<BottomNavProps> = ({ activeTab, onNavigate }) => (
  <MobileDock
    label={t('Main navigation')}
    items={NAV_ITEMS.map(item => ({
      id: item.id,
      label: t(item.label),
      short: t(item.shortLabel),
      icon: item.icon,
      active: activeTab === item.id,
      onSelect: () => onNavigate(item.id),
    }))}
  />
);
