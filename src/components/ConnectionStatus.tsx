/**
 * A calm pill that says when the phone goes offline, and that the emergency
 * features still work. When the connection comes back it says so briefly.
 */
import React, { useEffect, useState } from 'react';
import { Wifi, WifiOff } from 'lucide-react';
import { cx } from './ui';

import { t as tr } from '../i18n';
export const ConnectionStatus: React.FC = () => {
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine));
  const [justBack, setJustBack] = useState(false);

  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | undefined;
    const goOnline = () => {
      setOnline(true);
      setJustBack(true);
      t = setTimeout(() => setJustBack(false), 3000);
    };
    const goOffline = () => {
      clearTimeout(t);
      setJustBack(false);
      setOnline(false);
    };
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      clearTimeout(t);
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  const show = !online || justBack;
  return (
    <div aria-live="polite" className="pointer-events-none fixed inset-x-0 top-[4.75rem] z-40 flex justify-center px-4">
      {show && (
        <p
          className={cx(
            'status-pill m-0 inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-bold shadow-lg',
            online ? 'glass-btn text-pri-text' : 'status-offline'
          )}
        >
          {online ? <Wifi className="h-4 w-4" aria-hidden="true" /> : <WifiOff className="h-4 w-4" aria-hidden="true" />}
          {online ? tr("Back online") : tr("You’re offline. SOS, 112 and your safety plan still work.")}
        </p>
      )}
    </div>
  );
};
