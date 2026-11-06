/**
 * A small round glass button that appears after you scroll down a long page,
 * and glides you back to the top. It sits above the phone tab bar.
 */
import React, { useEffect, useState } from 'react';
import { ArrowUp } from 'lucide-react';
import { cx } from './ui';

import { t } from '../i18n';
export const BackToTop: React.FC<{ hidden?: boolean }> = ({ hidden }) => {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const onScroll = () => setShow(window.scrollY > 700);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const visible = show && !hidden;
  return (
    <button
      type="button"
      aria-label={t("Back to top")}
      title={t("Back to top")}
      tabIndex={visible ? 0 : -1}
      aria-hidden={!visible}
      onClick={() => {
        const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
        window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });
        document.getElementById('main-content')?.focus({ preventScroll: true });
      }}
      className={cx(
        'glass-btn back-to-top fixed right-4 z-30 flex h-12 w-12 items-center justify-center rounded-full border text-pri-text cursor-pointer sm:right-6 lg:right-10',
        visible ? 'opacity-100' : 'pointer-events-none translate-y-3 opacity-0'
      )}
    >
      <ArrowUp className="h-5 w-5" aria-hidden="true" />
    </button>
  );
};
