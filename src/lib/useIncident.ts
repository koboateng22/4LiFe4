import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { UserProfile } from '../types';
import { addSosEvent } from '../therapist/data';
import { getPosition } from './ems';
import { backendFor, IncidentController } from './incident';

/** One alert controller for the signed-in person, shared by the SOS screen and the banner. */
export function useIncident(profile: UserProfile, enabled: boolean) {
  const latest = useRef(profile);
  latest.current = profile;
  const userKey = `${profile.id || 'guest'}:${profile.isGuest ? 'guest' : 'account'}`;

  const [controller, setController] = useState(() => make());
  function make() {
    const backend = backendFor(profile.id, profile.isGuest);
    return new IncidentController(backend, profile.id || 'guest', {
      locate: () => getPosition(8000),
      shareLocation: () => !!latest.current.shareLocationInCrisis,
      // Without an account the counsellor workspace is a demo on this same device
      onOpened: backend.mode === 'device' ? () => addSosEvent({ id: 'sos_' + Date.now(), nickname: latest.current.nickname, at: new Date().toISOString() }) : undefined,
    });
  }

  useEffect(() => {
    if (!enabled) return;
    const c = make();
    setController(c);
    void c.resume();
    const online = () => c.online();
    const focus = () => document.visibilityState === 'visible' && c.online();
    window.addEventListener('online', online);
    document.addEventListener('visibilitychange', focus);
    return () => {
      window.removeEventListener('online', online);
      document.removeEventListener('visibilitychange', focus);
      c.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, userKey]);

  const view = useSyncExternalStore(controller.subscribe, controller.getView);
  return { controller, view };
}
