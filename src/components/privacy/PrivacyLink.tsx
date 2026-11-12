/**
 * A link to the Privacy Policy (/privacy). It opens in a new tab, so nothing typed in a form (such as
 * sign-up) is lost, and the person comes back to exactly where they were.
 */
import React from 'react';
import { cx } from '../ui';
import { t } from '../../i18n';

export const PRIVACY_PATH = '/privacy';

export const PrivacyLink: React.FC<{ className?: string; children?: React.ReactNode }> = ({ className, children }) => (
  <a href={PRIVACY_PATH} target="_blank" rel="noopener" className={cx('font-semibold text-pri-text underline underline-offset-2 hover:no-underline', className)}>
    {children ?? t('Privacy Policy')}
  </a>
);
