/**
 * Free, open-source map services for Instant EMS (no API key, no account):
 *
 *  - Overpass API      → hospitals, clinics, pharmacies, police and fire stations near you,
 *                         straight from OpenStreetMap (https://wiki.openstreetmap.org/wiki/Overpass_API)
 *  - Nominatim         → turns your location into a street / area name for the help message
 *                         (https://nominatim.org/release-docs/latest/api/Reverse/)
 *  - OSRM              → the real driving route, distance and time to a place
 *                         (https://project-osrm.org/docs/v5.24.0/api/)
 *  - OpenStreetMap tiles are drawn by Leaflet in EmsMap.tsx.
 *
 * Fair use: these are community-run public servers. We only call them when someone
 * finds their location or picks a place, cache the answers on the phone, and time
 * out quickly so the emergency buttons never wait on them. Your location is sent to
 * these services only to look things up; 4Life does not store it.
 */
import type { EmergencyCenter } from '../types';

export interface LatLng {
  lat: number;
  lng: number;
}

/** A place from OpenStreetMap, shaped like the app's own emergency places */
export type OsmPlace = EmergencyCenter & { source: 'osm'; osmUrl: string; emergency?: boolean };

// Public servers by default. For a large launch, point these at your own (or a paid) server in .env.local:
//   VITE_OVERPASS_URL=…/api/interpreter   VITE_NOMINATIM_URL=…/reverse   VITE_OSRM_URL=…/route/v1/driving
const env: Record<string, string | undefined> = (import.meta as any).env || {};
const OVERPASS = env.VITE_OVERPASS_URL ? [env.VITE_OVERPASS_URL] : ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];
const NOMINATIM = env.VITE_NOMINATIM_URL || 'https://nominatim.openstreetmap.org/reverse';
const OSRM = env.VITE_OSRM_URL || 'https://router.project-osrm.org/route/v1/driving';

/* ---------- small helpers ---------- */

async function fetchJson(url: string, init: RequestInit = {}, timeoutMs = 12000): Promise<any> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

const readCache = <T,>(key: string): T | null => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
};
const writeCache = (key: string, value: unknown) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
};

/** Distance in km between two points (haversine) */
export function kmBetween(a: LatLng, b: LatLng): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/* ---------- Overpass: places near you ---------- */

const PLACES_KEY = '4life_osm_places';
const PLACES_MAX_AGE = 7 * 24 * 3600 * 1000; // a week
const REUSE_WITHIN_KM = 1.5;

function overpassQuery(p: LatLng, radiusM: number) {
  const a = `(around:${Math.round(radiusM)},${p.lat.toFixed(5)},${p.lng.toFixed(5)})`;
  return `[out:json][timeout:20];
(
  nwr${a}["amenity"~"^(hospital|clinic|doctors|pharmacy|police|fire_station)$"];
  nwr${a}["healthcare"~"^(hospital|clinic|centre|rehabilitation|counselling|psychotherapist)$"];
);
out center tags 120;`;
}

function typeFromTags(t: Record<string, string>): EmergencyCenter['type'] | null {
  const amenity = t.amenity || '';
  const hc = t.healthcare || '';
  if (amenity === 'hospital' || hc === 'hospital') return 'hospital';
  if (hc === 'rehabilitation' || hc === 'counselling' || hc === 'psychotherapist' || /rehab/i.test(t.name || '')) return 'rehab';
  if (amenity === 'clinic' || amenity === 'doctors' || hc === 'clinic' || hc === 'centre') return 'clinic';
  if (amenity === 'pharmacy') return 'pharmacy';
  if (amenity === 'police') return 'police';
  if (amenity === 'fire_station') return 'fire_station';
  return null;
}

const DEFAULT_NAME: Partial<Record<EmergencyCenter['type'], string>> = {
  hospital: 'Hospital',
  clinic: 'Clinic',
  pharmacy: 'Pharmacy',
  police: 'Police station',
  fire_station: 'Fire station',
  rehab: 'Recovery centre',
};

function addressFromTags(t: Record<string, string>): string {
  const street = [t['addr:housenumber'], t['addr:street']].filter(Boolean).join(' ');
  const parts = [street, t['addr:suburb'] || t['addr:neighbourhood'], t['addr:city'] || t['addr:town'] || t['addr:village']].filter(Boolean);
  return parts.length ? parts.join(', ') : 'Address not listed on the map';
}

function toPlace(el: any): OsmPlace | null {
  const t: Record<string, string> = el.tags || {};
  const type = typeFromTags(t);
  const lat = el.lat ?? el.center?.lat;
  const lng = el.lon ?? el.center?.lon;
  if (!type || typeof lat !== 'number' || typeof lng !== 'number') return null;
  const phone = (t.phone || t['contact:phone'] || t['phone:mobile'] || '').split(';')[0].trim();
  return {
    id: `osm-${el.type}-${el.id}`,
    name: t.name || t['name:en'] || t.operator || DEFAULT_NAME[type] || 'Place',
    type,
    region: t['addr:city'] || t['addr:town'] || t['is_in:region'] || '',
    address: addressFromTags(t),
    phone,
    lat,
    lng,
    hours: t.opening_hours === '24/7' ? 'Open 24 hours' : t.opening_hours || 'Opening hours not listed',
    bedsAvailable: false,
    source: 'osm',
    osmUrl: `https://www.openstreetmap.org/${el.type}/${el.id}`,
    emergency: t.emergency === 'yes',
  };
}

/** Turn an Overpass answer into places (exported for the tests) */
export function parseOverpass(json: any): OsmPlace[] {
  const seen = new Set<string>();
  return (json?.elements || [])
    .map(toPlace)
    .filter((x: OsmPlace | null): x is OsmPlace => !!x)
    // the same place can be mapped as a point and as a building: keep one
    .filter((x: OsmPlace) => {
      const k = `${x.type}|${x.name.toLowerCase()}|${x.lat.toFixed(3)}|${x.lng.toFixed(3)}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
}

export interface NearbyResult {
  places: OsmPlace[];
  /** 'live' = just loaded, 'saved' = from this phone's last search (offline or servers busy) */
  from: 'live' | 'saved';
  at: string;
}

/**
 * Places that can help within `radiusKm` of `p`, from OpenStreetMap.
 * Uses this phone's saved results if they are recent and close by, or if the internet is down.
 */
export async function findNearbyPlaces(p: LatLng, radiusKm = 10): Promise<NearbyResult> {
  const saved = readCache<{ lat: number; lng: number; at: string; places: OsmPlace[] }>(PLACES_KEY);
  const fresh = saved && Date.now() - new Date(saved.at).getTime() < PLACES_MAX_AGE && kmBetween(saved, p) < REUSE_WITHIN_KM;
  if (fresh) return { places: saved!.places, from: 'saved', at: saved!.at };

  const body = 'data=' + encodeURIComponent(overpassQuery(p, radiusKm * 1000));
  for (const url of OVERPASS) {
    try {
      const json = await fetchJson(url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body }, 15000);
      const places = parseOverpass(json);
      const at = new Date().toISOString();
      writeCache(PLACES_KEY, { lat: p.lat, lng: p.lng, at, places });
      return { places, from: 'live', at };
    } catch {
      /* try the next server */
    }
  }
  if (saved?.places?.length) return { places: saved.places, from: 'saved', at: saved.at };
  throw new Error('Nearby places are not available right now');
}

/**
 * Merge the app's checked places with OpenStreetMap ones. A map place within 200 m
 * of a checked place of the same kind is treated as the same place (the checked one wins).
 */
export function mergePlaces<T extends EmergencyCenter>(checked: T[], osm: OsmPlace[]): Array<T | OsmPlace> {
  const extra = osm.filter(o => !checked.some(c => (c.type === o.type || (c.type === 'hospital' && o.type === 'clinic')) && kmBetween(c, o) < 0.2));
  return [...checked, ...extra];
}

/* ---------- Nominatim: where am I (street / area name) ---------- */

const PLACE_NAME_KEY = '4life_osm_place_names';

/** A short, human place name for a location, e.g. "Prempeh II Street, Adum, Kumasi". Null if unavailable. */
export async function placeName(p: LatLng): Promise<string | null> {
  const key = `${p.lat.toFixed(3)},${p.lng.toFixed(3)}`; // ~100 m
  const cache = readCache<Record<string, string>>(PLACE_NAME_KEY) || {};
  if (cache[key]) return cache[key];
  try {
    const url = `${NOMINATIM}?format=jsonv2&zoom=17&addressdetails=1&lat=${p.lat.toFixed(6)}&lon=${p.lng.toFixed(6)}`;
    const json = await fetchJson(url, { headers: { 'Accept-Language': 'en' } }, 8000);
    const a = json.address || {};
    const parts = [a.road, a.suburb || a.neighbourhood || a.quarter || a.village, a.city || a.town || a.county].filter(Boolean);
    const name = parts.length ? Array.from(new Set(parts)).join(', ') : json.display_name?.split(',').slice(0, 3).join(',').trim() || null;
    if (name) {
      const keys = Object.keys(cache);
      if (keys.length > 40) delete cache[keys[0]];
      cache[key] = name;
      writeCache(PLACE_NAME_KEY, cache);
    }
    return name;
  } catch {
    return null;
  }
}

/* ---------- OSRM: the real route by road ---------- */

export interface Route {
  km: number;
  mins: number;
  /** [lat, lng] points along the road */
  line: Array<[number, number]>;
}

const routeCache = new Map<string, Route>();

/** Driving route from `a` to `b`. Null if the routing server can't be reached. */
export async function drivingRoute(a: LatLng, b: LatLng): Promise<Route | null> {
  const key = `${a.lat.toFixed(4)},${a.lng.toFixed(4)}>${b.lat.toFixed(4)},${b.lng.toFixed(4)}`;
  if (routeCache.has(key)) return routeCache.get(key)!;
  try {
    const url = `${OSRM}/${a.lng},${a.lat};${b.lng},${b.lat}?overview=full&geometries=geojson&alternatives=false&steps=false`;
    const json = await fetchJson(url, {}, 10000);
    const r = json.routes?.[0];
    if (!r) return null;
    const route: Route = {
      km: r.distance / 1000,
      mins: Math.max(1, Math.round(r.duration / 60)),
      line: (r.geometry?.coordinates || []).map((c: [number, number]) => [c[1], c[0]] as [number, number]),
    };
    routeCache.set(key, route);
    return route;
  } catch {
    return null;
  }
}

/** Directions in OpenStreetMap's own website (free, no app needed) */
export const osmDirectionsHref = (from: LatLng | null, to: LatLng) =>
  from
    ? `https://www.openstreetmap.org/directions?engine=fossgis_osrm_car&route=${from.lat.toFixed(5)}%2C${from.lng.toFixed(5)}%3B${to.lat.toFixed(5)}%2C${to.lng.toFixed(5)}`
    : `https://www.openstreetmap.org/?mlat=${to.lat.toFixed(5)}&mlon=${to.lng.toFixed(5)}#map=17/${to.lat.toFixed(5)}/${to.lng.toFixed(5)}`;
