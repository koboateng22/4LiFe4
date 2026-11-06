/**
 * Emergency steps (first aid, SOS and crisis messages) stay in English in every language
 * until a native speaker has checked the translation, so an urgent instruction can't be
 * garbled. When the app is in another language, this line says so in that language.
 */
import React from 'react';
import { getLanguage, t } from '../../i18n';
import { cx } from '../ui';

export const EnglishSafetyNote: React.FC<{ className?: string }> = ({ className }) => {
  if (getLanguage() === 'en') return null;
  return (
    <p className={cx('m-0 rounded-xl bg-warn-soft px-3.5 py-2.5 text-[0.9375rem] font-semibold leading-snug text-warn', className)}>
      {t('Emergency steps are shown in English so that nothing important gets lost in translation. In danger now? Call 112.')}
    </p>
  );
};
