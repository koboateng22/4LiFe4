import React from 'react';
import { MonitorSmartphone, Moon, Sun } from 'lucide-react';
import { ChoiceCard } from './ui';
import { t, msg } from '../i18n';
import type { ThemePref } from '../lib/theme';

const OPTIONS: Array<{ id: ThemePref; title: string; description: string; done: string; Icon: typeof Sun }> = [
  { id: 'light', title: msg('Light'), description: msg('Soft green and white. Best in daylight.'), done: msg('Light theme on'), Icon: Sun },
  { id: 'dark', title: msg('Dark'), description: msg('Deep forest green. Easier on the eyes at night.'), done: msg('Dark theme on'), Icon: Moon },
  {
    id: 'system',
    title: msg('System default'),
    description: msg('Follows your phone or computer: light or dark, as it is set there.'),
    done: msg('System default theme on'),
    Icon: MonitorSmartphone,
  },
];

/** Light, dark or the device's setting. Used in Settings → Appearance and the therapist profile. */
export const ThemeChoice: React.FC<{ value: ThemePref; onChange: (pref: ThemePref, done: string) => void }> = ({ value, onChange }) => (
  <div className="flex flex-col gap-3">
    <p className="m-0 text-sm font-bold text-ink">{t('Theme')}</p>
    <div className="grid gap-3 sm:grid-cols-3" role="group" aria-label={t('Theme')}>
      {OPTIONS.map(({ id, title, description, done, Icon }) => (
        <ChoiceCard
          key={id}
          selected={value === id}
          onClick={() => onChange(id, done)}
          icon={<Icon className="h-6 w-6" />}
          title={t(title)}
          description={t(description)}
        />
      ))}
    </div>
  </div>
);
