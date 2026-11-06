/**
 * "Ride the wave": a 20-minute craving timer.
 * Cravings rise, peak and pass, usually within 20–30 minutes. Every 5 minutes
 * it asks how strong the craving is now and draws the line, so the person
 * can see the wave going down.
 */
import React, { useEffect, useId, useState } from 'react';
import { Timer, X } from 'lucide-react';
import { WAVE_CHECK_EVERY, WAVE_MINUTES, type Wave } from '../../lib/coping';
import { CravingLevels, cravingLabel } from './CravingLevels';
import { Button, cx } from '../ui';

import { t as tr } from '../../i18n';
const fmt = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;

/** The wave so far, as a small chart */
const WaveChart: React.FC<{ wave: Wave; nowMin: number }> = ({ wave, nowMin }) => {
  const W = 300;
  const H = 72;
  const x = (m: number) => 8 + (Math.min(m, WAVE_MINUTES) / WAVE_MINUTES) * (W - 16);
  const y = (lvl: number) => 6 + (1 - lvl / 10) * (H - 18);
  const pts = wave.points.map(p => `${x(p.m).toFixed(1)},${y(p.level).toFixed(1)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMinYMid meet" className="h-[72px] w-full max-w-md" role="img" aria-label={tr('Craving over time: {points}', { points: wave.points.map(p => tr('{count} min: {level}', { count: Math.round(p.m), level: p.level })).join(', ') })}>
      {/* the usual shape of a craving wave, for comparison */}
      <path d={`M ${x(0)} ${y(6)} C ${x(4)} ${y(9)}, ${x(7)} ${y(9)}, ${x(10)} ${y(6)} S ${x(16)} ${y(2)}, ${x(20)} ${y(1.5)}`} fill="none" stroke="var(--line)" strokeWidth="2" strokeDasharray="4 5" />
      {[0, 5, 10, 15, 20].map(m => (
        <text key={m} x={x(m)} y={H - 1} textAnchor="middle" fontSize="10" fill="var(--ink-3)">
          {m}
        </text>
      ))}
      <line x1={x(nowMin)} x2={x(nowMin)} y1={4} y2={H - 14} stroke="var(--pri-text)" strokeOpacity="0.35" strokeWidth="2" />
      {wave.points.length > 1 && <polyline points={pts} fill="none" stroke="var(--pri)" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />}
      {wave.points.map((p, i) => (
        <circle key={i} cx={x(p.m)} cy={y(p.level)} r="4.5" fill="var(--surface)" stroke="var(--pri)" strokeWidth="2.5" />
      ))}
    </svg>
  );
};

export const WaveTimer: React.FC<{
  wave: Wave;
  onRate: (level: number) => void;
  onStop: () => void;
  onFinish: () => void;
}> = ({ wave, onRate, onStop, onFinish }) => {
  const labelId = useId();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (wave.finished) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [wave.finished]);

  const elapsedSec = Math.max(0, (now - new Date(wave.startedAt).getTime()) / 1000);
  const elapsedMin = elapsedSec / 60;
  const left = Math.max(0, WAVE_MINUTES * 60 - elapsedSec);
  const done = left <= 0 || wave.finished;
  const last = wave.points[wave.points.length - 1];
  const first = wave.points[0];
  // a check-in is due 5 minutes after the last one, and once more at the end
  const lastM = last ? last.m : 0;
  const capped = Math.min(elapsedMin, WAVE_MINUTES);
  const checkDue = !wave.finished && (capped - lastM >= WAVE_CHECK_EVERY || (done && lastM < WAVE_MINUTES - 0.5));

  useEffect(() => {
    if (done && !wave.finished && !checkDue) onFinish();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [done, checkDue]);

  const drop = first && last ? first.level - last.level : 0;

  return (
    <section aria-label={tr("Ride the wave timer")} className="flex flex-col gap-3 border-b border-line bg-pri-soft/50 px-4 py-3.5 sm:px-5">
      <div className="flex items-center justify-between gap-3">
        <p className="m-0 flex items-center gap-2 text-[0.9375rem] font-bold text-ink">
          <Timer className="h-5 w-5 text-pri-text" aria-hidden="true" />
          {wave.finished ? tr("You rode the wave") : done ? tr("Last check-in") : tr("Riding the wave")}
          {!wave.finished && (
            <span className="tabular-nums font-extrabold text-pri-text" aria-label={`${fmt(left)} left`}>
              {fmt(left)}
            </span>
          )}
        </p>
        <button
          type="button"
          onClick={onStop}
          className="inline-flex min-h-10 items-center gap-1 rounded-lg px-2 text-sm font-semibold text-ink-2 hover:bg-muted cursor-pointer"
          aria-label={wave.finished ? tr("Close the timer") : tr("Stop the timer")}
        >
          <X className="h-4 w-4" aria-hidden="true" /> {wave.finished ? tr("Close") : tr("Stop")}
        </button>
      </div>

      <WaveChart wave={wave} nowMin={Math.min(elapsedMin, WAVE_MINUTES)} />

      {checkDue ? (
        <div className={cx('flex flex-col gap-2 rounded-xl bg-surface p-3', 'ring-2 ring-pri')} role="status">
          <p id={labelId} className="m-0 text-[0.9375rem] font-bold text-ink">
            {tr('{count} minutes in. How strong is the craving now?', { count: Math.round(elapsedMin) })}
          </p>
          <CravingLevels labelledBy={labelId} onChange={onRate} />
        </div>
      ) : wave.finished ? (
        <p className="m-0 text-[0.9375rem] text-ink-2" aria-live="polite">
          {drop > 0
            ? tr("It went from {v0} to {v1}. You didn't act on it — that is how cravings lose their power.", { v0: cravingLabel(first.level), v1: cravingLabel(last.level) })
            : tr("It stayed strong this time. That happens. Breathing, leaving the place or calling someone can help — or press SOS.")}
        </p>
      ) : (
        <p className="m-0 text-sm text-ink-2">
          {tr("Cravings rise, peak and pass. Keep talking, breathe, or do something else — I'll ask again in {count} min.", { count: Math.max(1, Math.ceil(WAVE_CHECK_EVERY - (capped - lastM))) })}
        </p>
      )}
      {wave.finished && (
        <Button size="sm" variant="secondary" className="self-start" onClick={onStop}>
          {tr("Done")}
        </Button>
      )}
    </section>
  );
};
