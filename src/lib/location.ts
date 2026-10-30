import type { UserProfile } from '../types';
import type { ClientLocation } from '../therapist/types';

/** Rough centre of each region, used only if the phone cannot give a location. */
const REGION_CENTRES: Record<string, [number, number]> = {
  'Greater Accra': [5.6037, -0.187],
  Ashanti: [6.6885, -1.6244],
  Central: [5.1053, -1.2466],
  Western: [4.9016, -1.7831],
  Northern: [9.4008, -0.8393],
  Volta: [6.6008, 0.4713],
  Eastern: [6.0941, -0.2591],
};

/**
 * The person's location for a crisis alert — only if they agreed in Settings.
 * Falls back to the centre of their region (marked approximate) if the phone cannot locate them.
 */
export function getCrisisLocation(profile: UserProfile, source: ClientLocation['source'] = 'sos'): Promise<ClientLocation | undefined> {
  if (!profile.shareLocationInCrisis) return Promise.resolve(undefined);
  const fallback = (): ClientLocation | undefined => {
    const c = REGION_CENTRES[profile.region];
    return c ? { lat: c[0], lng: c[1], area: `${profile.region} (approximate)`, at: new Date().toISOString(), accuracyM: 5000, source, approximate: true } : undefined;
  };
  if (typeof navigator === 'undefined' || !('geolocation' in navigator)) return Promise.resolve(fallback());
  return new Promise(resolve =>
    navigator.geolocation.getCurrentPosition(
      pos =>
        resolve({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          area: profile.region || 'Shared location',
          at: new Date().toISOString(),
          accuracyM: Math.max(10, Math.round(pos.coords.accuracy)),
          source,
        }),
      () => resolve(fallback()),
      { enableHighAccuracy: true, timeout: 6000, maximumAge: 60000 }
    )
  );
}
