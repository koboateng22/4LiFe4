/**
 * One source of truth for the app's sections.
 * The sidebar, the top bar title and the mobile bottom bar all read from here,
 * so a section is only ever named and ordered in one place.
 */
import type { LucideIcon } from 'lucide-react';
import { Home, MessageCircle, Users, Siren, Settings } from 'lucide-react';
import type { ActiveTab } from './types';
import type { TranslationKey } from './utils/translations';

export type NavGroup = 'home' | 'support' | 'account';

export interface NavItem {
  id: ActiveTab;
  labelKey: TranslationKey;
  subtitleKey: TranslationKey;
  /** Short label used in the mobile bottom bar */
  shortLabel: string;
  icon: LucideIcon;
  group: NavGroup;
}

export const NAV_ITEMS: NavItem[] = [
  { id: 'dashboard', labelKey: 'nav_hub', subtitleKey: 'nav_hub_sub', shortLabel: 'Home', icon: Home, group: 'home' },
  { id: 'chat', labelKey: 'nav_chat', subtitleKey: 'nav_chat_sub', shortLabel: 'Therapy', icon: MessageCircle, group: 'support' },
  { id: 'community', labelKey: 'nav_village', subtitleKey: 'nav_village_sub', shortLabel: 'Village', icon: Users, group: 'support' },
  { id: 'emergency_map', labelKey: 'nav_ems', subtitleKey: 'nav_ems_sub', shortLabel: 'EMS', icon: Siren, group: 'support' },
  { id: 'profile_settings', labelKey: 'nav_settings', subtitleKey: 'nav_settings_sub', shortLabel: 'Settings', icon: Settings, group: 'account' },
];

export const NAV_GROUP_LABELS: Partial<Record<NavGroup, string>> = {
  support: 'Support',
};

/** Sections shown in the mobile bottom bar (Settings lives under "More"). */
export const BOTTOM_NAV_IDS: ActiveTab[] = ['dashboard', 'chat', 'community', 'emergency_map'];

export const navItemFor = (id: ActiveTab) => NAV_ITEMS.find(n => n.id === id) || NAV_ITEMS[0];
