import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { EmergencyCenter } from '../../types';
// A simple outline of Ghana and its neighbours that ships with the app (Natural Earth, public domain),
// drawn under the map tiles. If the tiles can't load (offline, slow network, blocked), the map still shows.
import ghanaBase from '../../data/ghanaBase.json';

/** Towns labelled on the simple map */
const TOWNS: Array<[string, number, number, boolean?]> = [
  ['Accra', 5.6037, -0.187, true],
  ['Kumasi', 6.6885, -1.6244, true],
  ['Tamale', 9.4008, -0.8393, true],
  ['Sekondi-Takoradi', 4.9344, -1.7133, true],
  ['Cape Coast', 5.1053, -1.2466],
  ['Tema', 5.6698, -0.0166],
  ['Koforidua', 6.0941, -0.2591],
  ['Ho', 6.6008, 0.4713],
  ['Sunyani', 7.3349, -2.3123],
  ['Techiman', 7.5862, -1.9381],
  ['Bolgatanga', 10.7856, -0.8514],
  ['Wa', 10.0601, -2.5099],
  ['Obuasi', 6.2023, -1.6619],
  ['Dambai', 8.0689, 0.1797],
  ['Damongo', 9.0828, -1.8186],
  ['Nalerigu', 10.5272, -0.3698],
  ['Goaso', 6.8036, -2.5172],
  ['Sefwi Wiawso', 6.2058, -2.4859],
  ['Winneba', 5.3511, -0.6231],
  ['Nkawkaw', 6.5505, -0.7663],
];

interface Props {
  you: { lat: number; lng: number; accuracyM?: number } | null;
  centres: EmergencyCenter[];
  selectedId: string | null;
  onSelect: (c: EmergencyCenter) => void;
  /** The driving route to the selected place (from OSRM), drawn along the roads */
  route?: Array<[number, number]> | null;
}

import { PIN_COLOUR } from './pinColours';
export { PIN_COLOUR };
const PIN_GLYPH: Record<EmergencyCenter['type'], string> = {
  hospital: '+',
  ems_station: 'A',
  rehab: 'R',
  helpline: 'H',
  clinic: 'C',
  pharmacy: 'Rx',
  police: 'P',
  fire_station: 'F',
};

const centreIcon = (c: EmergencyCenter, selected: boolean) => {
  const size = selected ? 38 : 30;
  return L.divIcon({
    className: '',
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    html: `<div style="width:${size}px;height:${size}px;border-radius:10px;background:${PIN_COLOUR[c.type]};color:#fff;display:flex;align-items:center;justify-content:center;font:800 ${
      selected ? 17 : 15
    }px Nunito,ui-rounded,system-ui,sans-serif;letter-spacing:-.5px;border:3px solid #fff;box-shadow:0 2px 8px rgba(15,23,42,.35)${selected ? ',0 0 0 4px rgba(15,23,42,.25)' : ''}">${PIN_GLYPH[c.type]}</div>`,
  });
};

const youIcon = L.divIcon({
  className: '',
  iconSize: [22, 22],
  iconAnchor: [11, 11],
  html: '<div style="width:22px;height:22px;border-radius:9999px;background:#0f172a;border:4px solid #fff;box-shadow:0 0 0 3px rgba(15,23,42,.3)"></div>',
});

/** Map of emergency places and (if shared) where you are. The list beside it has the same information. */
export const EmsMap: React.FC<Props> = ({ you, centres, selectedId, onSelect, route }) => {
  const elRef = useRef<HTMLDivElement>(null);
  // 'ok' once map tiles load; 'simple' if they can't, so we say the simple map is showing
  const [tiles, setTiles] = useState<'waiting' | 'ok' | 'simple'>('waiting');
  const simpleRef = useRef(false);
  simpleRef.current = tiles === 'simple';
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  // Re-run framing after the map's size changes (it may be measured as 0 on first paint)
  const frameRef = useRef<() => void>(() => {});

  useEffect(() => {
    if (!elRef.current || mapRef.current) return;
    const map = L.map(elRef.current, { zoomControl: true }).setView([5.6037, -0.187], 11);

    // 1. The simple built-in map (always there, under the tiles)
    map.createPane('base').style.zIndex = '150';
    const labels = map.createPane('baseLabels');
    labels.style.zIndex = '160';
    labels.style.pointerEvents = 'none';
    L.geoJSON(ghanaBase as any, {
      pane: 'base',
      interactive: false,
      style: f => ({ className: f?.properties?.ghana ? 'ems-land ems-land-gh' : 'ems-land', weight: f?.properties?.ghana ? 1.5 : 1, fillOpacity: 1 }),
    }).addTo(map);
    TOWNS.forEach(([name, lat, lng, big]) =>
      L.marker([lat, lng], {
        pane: 'baseLabels',
        interactive: false,
        keyboard: false,
        icon: L.divIcon({ className: 'ems-town', iconSize: [0, 0], html: `<span class="ems-town-dot${big ? ' big' : ''}"></span><span class="ems-town-name${big ? ' big' : ''}">${name}</span>` }),
      }).addTo(map)
    );

    // 2. Free OpenStreetMap tiles on top. Places come from the Overpass API and routes from OSRM (see lib/osm.ts).
    let loaded = false;
    const tileLayer = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors · Natural Earth · Routes: <a href="https://project-osrm.org" target="_blank" rel="noopener">OSRM</a>',
    });
    tileLayer.on('tileload', () => {
      loaded = true;
      setTiles('ok');
    });
    tileLayer.addTo(map);
    const waitTimer = setTimeout(() => !loaded && setTiles('simple'), 5000);
    layerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    return () => {
      clearTimeout(waitTimer);
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!map || !layer) return;
    layer.clearLayers();

    centres.forEach(c => {
      L.marker([c.lat, c.lng], { icon: centreIcon(c, c.id === selectedId), title: c.name, zIndexOffset: c.id === selectedId ? 1000 : 0, keyboard: false })
        .on('click', () => onSelect(c))
        .bindTooltip(`<strong>${c.name}</strong><br/>${c.address}`, { direction: 'top', offset: [0, -16] })
        .addTo(layer);
    });

    const sel = centres.find(c => c.id === selectedId);
    if (you) {
      if (you.accuracyM) L.circle([you.lat, you.lng], { radius: Math.max(you.accuracyM, 25), color: '#0f172a', weight: 1, fillOpacity: 0.08 }).addTo(layer);
      L.marker([you.lat, you.lng], { icon: youIcon, title: 'You', zIndexOffset: 2000, keyboard: false }).bindTooltip('You are here', { direction: 'top', offset: [0, -12] }).addTo(layer);
      if (sel) {
        if (route && route.length > 1) {
          // The real road route: a white casing under a green line
          L.polyline(route, { color: '#ffffff', weight: 8, opacity: 0.9 }).addTo(layer);
          L.polyline(route, { color: '#047857', weight: 5, opacity: 0.95 }).addTo(layer);
        } else {
          L.polyline(
            [
              [you.lat, you.lng],
              [sel.lat, sel.lng],
            ],
            { color: '#0f172a', weight: 3, dashArray: '6 6', opacity: 0.7 }
          ).addTo(layer);
        }
      }
    }
    frameRef.current = () => {
      map.invalidateSize();
      // Simple map (no street tiles): zoom out so the towns and places give a sense of where things are
      if (simpleRef.current) {
        const pts: L.LatLngExpression[] = centres.map(c => [c.lat, c.lng] as [number, number]);
        if (you) pts.push([you.lat, you.lng]);
        if (you && sel) map.fitBounds(L.latLngBounds([you.lat, you.lng], [sel.lat, sel.lng]).pad(1.5), { maxZoom: 11, animate: false });
        else if (pts.length) map.fitBounds(L.latLngBounds(pts).pad(0.15), { maxZoom: 9, animate: false });
        else map.setView([7.9, -1.0], 7, { animate: false });
        return;
      }
      if (you && sel && route && route.length > 1) map.fitBounds(L.latLngBounds(route).extend([you.lat, you.lng]), { padding: [40, 40], maxZoom: 16, animate: false });
      else if (you && sel) map.fitBounds(L.latLngBounds([you.lat, you.lng], [sel.lat, sel.lng]), { padding: [48, 48], maxZoom: 15, animate: false });
      else if (you) map.setView([you.lat, you.lng], 13, { animate: false });
      else if (sel) map.setView([sel.lat, sel.lng], 13, { animate: false });
    };
    frameRef.current();
  }, [you, centres, selectedId, onSelect, route]);

  // Re-frame when we find out the street tiles can't load
  useEffect(() => {
    if (tiles === 'simple') frameRef.current();
  }, [tiles]);

  useEffect(() => {
    const el = elRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => frameRef.current());
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div className="relative">
      <div
        ref={elRef}
        className="ems-map h-[320px] w-full overflow-hidden rounded-2xl border border-line sm:h-[400px]"
        role="region"
        aria-label="Map of emergency places. The list has the same information."
      />
      {tiles === 'simple' && (
        <p className="pointer-events-none absolute right-3 top-3 z-[500] m-0 max-w-[calc(100%-5rem)] rounded-lg bg-surface/90 px-2.5 py-1.5 text-xs font-semibold text-ink-2 shadow-sm">
          Simple map: the detailed street map needs internet.
        </p>
      )}
    </div>
  );
};
