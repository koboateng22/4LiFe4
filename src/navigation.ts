/**
 * One source of truth for the app's sections.
 * The side rail (computers), the dock (phones and tablets) and the top bar title all read from here,
 * so a section is only ever named and ordered in one place.
 */
import type { LucideIcon } from 'lucide-react';
import { Home, MessageCircle, Users, Siren, Settings, GraduationCap } from 'lucide-react';
import type { ActiveTab } from './types';
import { msg } from './i18n';

export type NavGroup = 'home' | 'support' | 'account';

export interface NavItem {
  id: ActiveTab;
  /** English text; show it with t() */
  label: string;
  subtitle: string;
  /** Short label: the dock on phones, and the top bar title on narrow screens */
  shortLabel: string;
  icon: LucideIcon;
  group: NavGroup;
}

export const NAV_ITEMS: NavItem[] = [
  { id: 'dashboard', label: msg('Home'), subtitle: msg('Your day at a glance'), shortLabel: msg('Home'), icon: Home, group: 'home' },
  { id: 'chat', label: msg('AI CBT Therapy'), subtitle: msg('Instant, private CBT support — day or night'), shortLabel: msg('Therapy'), icon: MessageCircle, group: 'support' },
  { id: 'community', label: msg('Global Village'), subtitle: msg('An anonymous community of people in recovery'), shortLabel: msg('Village'), icon: Users, group: 'support' },
  { id: 'learn', label: msg('Learn'), subtitle: msg('Short videos on recovery, CBT and calm'), shortLabel: msg('Learn'), icon: GraduationCap, group: 'support' },
  { id: 'emergency_map', label: msg('Instant EMS'), subtitle: msg('Call for help, share where you are, find the nearest care'), shortLabel: msg('EMS'), icon: Siren, group: 'support' },
  { id: 'profile_settings', label: msg('Settings'), subtitle: msg('Your profile, support people and preferences'), shortLabel: msg('Settings'), icon: Settings, group: 'account' },
];

export const NAV_GROUP_LABELS: Partial<Record<NavGroup, string>> = {
  support: msg('Support'),
};

export const navItemFor = (id: ActiveTab) => NAV_ITEMS.find(n => n.id === id) || NAV_ITEMS[0];
