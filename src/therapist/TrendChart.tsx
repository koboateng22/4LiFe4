import React, { useEffect, useId, useRef, useState } from 'react';

import { t } from '../i18n';
interface TrendChartProps {
  title: string;
  values: Array<number | null>;
  min: number;
  max: number;
  /** Labels for the gridlines, e.g. { 1: 'Low', 3: 'Okay', 5: 'Great' } */
  ticks: Record<number, string>;
  /** How to read one value in the tooltip, e.g. v => `Craving ${v} of 10` */
  describe: (v: number) => string;
  /** Short summary for screen readers and the caption */
  summary: string;
}

const H = 150;
const PAD = { top: 12, right: 12, bottom: 26, left: 52 };
const FONT = 12.5;

const dayLabel = (i: number, n: number) => {
  const back = n - 1 - i;
  if (back === 0) return 'Today';
  if (back === 1) return 'Yesterday';
  const d = new Date();
  d.setDate(d.getDate() - back);
  return d.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' });
};

/**
 * A small one-series line chart for daily check-ins (mood or craving).
 * One axis, thin line, gaps where there was no check-in, hover / keyboard tooltip
 * and a table view for screen readers.
 */
export const TrendChart: React.FC<TrendChartProps> = ({ title, values, min, max, ticks, describe, summary }) => {
  const [hover, setHover] = useState<number | null>(null);
  const id = useId();
  // Draw at the real pixel width so labels are never shrunk below a readable size
  const boxRef = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(320);
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => setW(Math.max(220, Math.round(entries[0].contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const n = values.length;
  const iw = W - PAD.left - PAD.right;
  const ih = H - PAD.top - PAD.bottom;
  const x = (i: number) => PAD.left + (n <= 1 ? iw / 2 : (i / (n - 1)) * iw);
  const y = (v: number) => PAD.top + ih - ((v - min) / (max - min)) * ih;

  // Split into runs so missed days show as gaps, not invented lines
  const runs: Array<Array<[number, number]>> = [];
  let cur: Array<[number, number]> = [];
  values.forEach((v, i) => {
    if (v == null) {
      if (cur.length) runs.push(cur);
      cur = [];
    } else cur.push([x(i), y(v)]);
  });
  if (cur.length) runs.push(cur);

  const lastIdx = values.map((v, i) => (v == null ? -1 : i)).filter(i => i >= 0).pop();
  const hasData = lastIdx !== undefined;

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    const i = Math.round(((px - PAD.left) / iw) * (n - 1));
    setHover(Math.max(0, Math.min(n - 1, i)));
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowLeft') setHover(h => Math.max(0, (h ?? n) - 1));
    if (e.key === 'ArrowRight') setHover(h => Math.min(n - 1, (h ?? -1) + 1));
    if (e.key === 'Escape') setHover(null);
  };

  const hv = hover != null ? values[hover] : null;

  return (
    <figure className="m-0 flex flex-col gap-2">
      <figcaption className="flex flex-col">
        <span className="text-[0.9375rem] font-bold text-ink">{t(title)}</span>
        <span className="text-sm text-ink-3">{summary}</span>
      </figcaption>

      {!hasData ? (
        <p className="m-0 rounded-xl bg-bg px-4 py-6 text-center text-[0.9375rem] text-ink-3">{t("No check-ins shared in the last 14 days.")}</p>
      ) : (
        <div className="relative" ref={boxRef}>
          <svg
            viewBox={`0 0 ${W} ${H}`}
            style={{ height: H }}
            className="block w-full touch-none outline-none focus-visible:ring-2 focus-visible:ring-pri/40 rounded-lg"
            role="img"
            aria-label={t("{title}: {summary}. Use the left and right arrow keys to read each day.", { title, summary })}
            tabIndex={0}
            onPointerMove={onMove}
            onPointerLeave={() => setHover(null)}
            onKeyDown={onKey}
            onBlur={() => setHover(null)}
          >
            {/* Recessive grid and labels */}
            {Object.entries(ticks).map(([v, label]) => (
              <g key={v}>
                <line x1={PAD.left} x2={W - PAD.right} y1={y(+v)} y2={y(+v)} stroke="var(--line)" strokeWidth={1} />
                <text x={PAD.left - 8} y={y(+v)} dy="0.35em" textAnchor="end" fontSize={FONT} fill="var(--ink-3)">
                  {label}
                </text>
              </g>
            ))}
            <text x={PAD.left} y={H - 4} fontSize={FONT} fill="var(--ink-3)">
              {t("14 days ago")}
            </text>
            <text x={W - PAD.right} y={H - 4} fontSize={FONT} fill="var(--ink-3)" textAnchor="end">
              {t("Today")}
            </text>

            {/* The line, with gaps for missed days */}
            {runs.map((r, i) =>
              r.length === 1 ? (
                <circle key={i} cx={r[0][0]} cy={r[0][1]} r={3} fill="var(--pri)" />
              ) : (
                <polyline
                  key={i}
                  points={r.map(p => p.join(',')).join(' ')}
                  fill="none"
                  stroke="var(--pri)"
                  strokeWidth={2}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
              )
            )}

            {/* Latest value marker */}
            {lastIdx !== undefined && hover == null && (
              <circle cx={x(lastIdx)} cy={y(values[lastIdx] as number)} r={4.5} fill="var(--pri)" stroke="var(--surface)" strokeWidth={2} />
            )}

            {/* Hover crosshair */}
            {hover != null && (
              <g>
                <line x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={PAD.top + ih} stroke="var(--ink-3)" strokeWidth={1} strokeDasharray="3 3" />
                {hv != null && <circle cx={x(hover)} cy={y(hv)} r={4.5} fill="var(--pri)" stroke="var(--surface)" strokeWidth={2} />}
              </g>
            )}
          </svg>

          {hover != null && (
            <div
              role="status"
              className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 rounded-lg border border-line bg-surface px-3 py-1.5 text-sm shadow-card whitespace-nowrap"
              style={{ left: `${Math.min(85, Math.max(15, (x(hover) / W) * 100))}%` }}
            >
              <span className="block font-bold text-ink">{dayLabel(hover, n)}</span>
              <span className="block text-ink-2">{hv == null ? t("No check-in") : describe(hv)}</span>
            </div>
          )}
        </div>
      )}

      {hasData && (
        <details className="text-sm text-ink-3">
          <summary className="cursor-pointer font-semibold text-pri-text">{t("Show as table")}</summary>
          <table className="mt-2 w-full border-collapse text-left text-sm" aria-labelledby={id}>
            <caption id={id} className="sr-only">
              {t("{title}, last 14 days", { title })}
            </caption>
            <thead>
              <tr className="text-ink-2">
                <th className="py-1 pr-3 font-semibold">{t("Day")}</th>
                <th className="py-1 font-semibold">{t("Check-in")}</th>
              </tr>
            </thead>
            <tbody>
              {values.map((v, i) => (
                <tr key={i} className="border-t border-line text-ink-2">
                  <td className="py-1 pr-3">{dayLabel(i, n)}</td>
                  <td className="py-1">{v == null ? '—' : describe(v)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      )}
    </figure>
  );
};
