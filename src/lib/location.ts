import type { UserProfile } from '../types';
import type { ClientLocation } from '../therapist/types';

/**
 * The person's location for a crisis alert — only if they agreed in Settings.
 * If the phone can't locate them the answer is "no location". A guess (such as the
 * middle of their region) must never reach a counsellor looking for them.
 */
export function getCrisisLocation(profile: UserProfile, source: ClientLocation['source'] = 'sos'): Promise<ClientLocation | undefined> {
  if (!profile.shareLocationInCrisis) return Promise.resolve(undefined);
  if (typeof navigator === 'undefined' || !('geolocation' in navigator)) return Promise.resolve(undefined);
  return new Promise(resolve =>
    navigator.geolocation.getCurrentPosition(
      pos =>
        resolve({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          area: profile.region || 'Shared location',
          at: new Date(pos.timestamp).toISOString(),
          accuracyM: Math.round(pos.coords.accuracy),
          source,
        }),
      () => resolve(undefined),
      { enableHighAccuracy: true, timeout: 6000, maximumAge: 30000 }
    )
  );
}
