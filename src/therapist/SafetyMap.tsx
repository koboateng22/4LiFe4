import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { EmergencyCenter } from '../types';
import type { ClientRecord } from './types';
import { initialsOf } from '../components/ui';

import { t } from '../i18n';
interface Props {
  clients: ClientRecord[]; // only clients with a shared location
  centres: EmergencyCenter[];
  selectedId: string | null;
  nearest: Record<string, EmergencyCenter | undefined>;
  onSelect: (id: string) => void;
}

const clientIcon = (c: ClientRecord, selected: boolean) => {
  const size = selected ? 44 : 36;
  const bg = c.risk === 'high' ? 'var(--danger)' : 'var(--warn-bar)';
  return L.divIcon({
    className: '',
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    html: `<div style="width:${size}px;height:${size}px;border-radius:9999px;background:${bg};color:#fff;display:flex;align-items:center;justify-content:center;font:700 ${
      selected ? 14 : 12
    }px Nunito,ui-rounded,system-ui,sans-serif;border:3px solid #fff;box-shadow:0 2px 8px rgba(15,23,42,.35)${selected ? ',0 0 0 4px rgba(225,29,72,.35)' : ''}">${initialsOf(c.nickname)}</div>`,
  });
};

const centreIcon = (nearest: boolean) =>
  L.divIcon({
    className: '',
    iconSize: [30, 30],
    iconAnchor: [15, 15],
    html: `<div style="width:30px;height:30px;border-radius:8px;background:${nearest ? '#0284c7' : '#fff'};color:${
      nearest ? '#fff' : '#0369a1'
    };display:flex;align-items:center;justify-content:center;font:800 16px Nunito,ui-rounded,system-ui,sans-serif;border:2px solid #0284c7;box-shadow:0 2px 6px rgba(15,23,42,.25)">+</div>`,
  });

/**
 * Leaflet map of at-risk clients and emergency services.
 * Each client is joined to the nearest service by a dashed line.
 */
export const SafetyMap: React.FC<Props> = ({ clients, centres, selectedId, nearest, onSelect }) => {
  const elRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    if (!elRef.current || mapRef.current) return;
    const map = L.map(elRef.current, { zoomControl: false, attributionControl: true }).setView([6.2, -1.0], 7);
    L.control.zoom({ zoomInTitle: t('Zoom in'), zoomOutTitle: t('Zoom out') }).addTo(map);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 18,
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map);
    layerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!map || !layer) return;
    layer.clearLayers();

    const nearestIds = new Set((Object.values(nearest) as Array<EmergencyCenter | undefined>).filter(Boolean).map(c => c!.id));
    centres.forEach(ce => {
      L.marker([ce.lat, ce.lng], { icon: centreIcon(nearestIds.has(ce.id)), title: ce.name, keyboard: false })
        .bindTooltip(`<strong>${ce.name}</strong><br/>${ce.address}`, { direction: 'top', offset: [0, -14] })
        .addTo(layer);
    });

    clients.forEach(c => {
      const loc = c.lastLocation!;
      const sel = c.id === selectedId;
      L.circle([loc.lat, loc.lng], {
        radius: Math.max(loc.accuracyM, 30),
        color: c.risk === 'high' ? '#e11d48' : '#f59e0b',
        weight: 1,
        fillOpacity: sel ? 0.15 : 0.08,
      }).addTo(layer);
      const ce = nearest[c.id];
      if (ce) {
        L.polyline(
          [
            [loc.lat, loc.lng],
            [ce.lat, ce.lng],
          ],
          { color: '#0284c7', weight: sel ? 3 : 2, dashArray: '6 6', opacity: sel ? 0.95 : 0.55 }
        ).addTo(layer);
      }
      L.marker([loc.lat, loc.lng], { icon: clientIcon(c, sel), title: c.nickname, zIndexOffset: sel ? 1000 : 500, keyboard: false })
        .on('click', () => onSelect(c.id))
        .bindTooltip(`<strong>${c.nickname}</strong><br/>${loc.area}`, { direction: 'top', offset: [0, -20] })
        .addTo(layer);
    });

    // Frame the selected client and their nearest service, or everyone at risk
    const sel = clients.find(c => c.id === selectedId);
    const pts: L.LatLngExpression[] = [];
    if (sel?.lastLocation) {
      pts.push([sel.lastLocation.lat, sel.lastLocation.lng]);
      const ce = nearest[sel.id];
      if (ce) pts.push([ce.lat, ce.lng]);
    } else {
      clients.forEach(c => pts.push([c.lastLocation!.lat, c.lastLocation!.lng]));
    }
    if (pts.length === 1) map.setView(pts[0], 14);
    else if (pts.length > 1) map.fitBounds(L.latLngBounds(pts), { padding: [48, 48], maxZoom: 14 });
  }, [clients, centres, selectedId, nearest, onSelect]);

  // Leaflet needs a nudge when its container changes size
  useEffect(() => {
    const el = elRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => mapRef.current?.invalidateSize());
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return <div ref={elRef} className="h-[420px] w-full overflow-hidden rounded-2xl border border-line bg-muted sm:h-[520px]" role="region" aria-label={t("Map of clients at risk and emergency services. The list beside the map has the same information.")} />;
};
