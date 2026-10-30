/**
 * Put 4Life on the phone's home screen, with "SOS" and "Help nearby"
 * shortcuts (long-press the icon). Works offline once installed.
 */
import React, { useEffect, useState } from 'react';
import { Smartphone, Check } from 'lucide-react';
import { canPromptInstall, isInstalled, isIOS, onInstallChange, promptInstall } from '../../lib/install';
import { Button, Card } from '../ui';

export const InstallShortcut: React.FC = () => {
  const [, force] = useState(0);
  useEffect(() => {
    const off = onInstallChange(() => force(n => n + 1));
    return () => {
      off();
    };
  }, []);

  if (isInstalled()) {
    return (
      <p className="m-0 flex items-center gap-2 text-[0.9375rem] text-ink-2">
        <Check className="h-5 w-5 text-pri-text" aria-hidden="true" /> 4Life is on your home screen. Long-press its icon for SOS.
      </p>
    );
  }

  return (
    <Card tone="soft" as="section" aria-labelledby="install-h" className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 gap-3">
        <Smartphone className="mt-0.5 h-6 w-6 shrink-0 text-pri-text" aria-hidden="true" />
        <div className="min-w-0">
          <h2 id="install-h" className="m-0 text-lg font-bold text-ink">
            Keep help one tap away
          </h2>
          <p className="m-0 mt-0.5 text-[0.9375rem] text-ink-2">
            {canPromptInstall()
              ? 'Add 4Life to your home screen. It opens even without internet, and a long press on the icon gives you SOS.'
              : isIOS()
                ? 'In Safari, tap Share, then “Add to Home Screen”. It opens even without internet.'
                : 'In your browser menu, tap “Add to Home screen” or “Install app”. Then a long press on the icon gives you SOS.'}
          </p>
        </div>
      </div>
      {canPromptInstall() && (
        <Button className="shrink-0" onClick={() => promptInstall()} icon={<Smartphone className="h-5 w-5" />}>
          Add to home screen
        </Button>
      )}
    </Card>
  );
};
