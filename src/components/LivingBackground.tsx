/**
 * The interactive background used on the sign-in screen and behind the whole app.
 *  - The green ribbon of mental health awareness, as a soft 3D ribbon that twists
 *    across the screen and breathes on a 4-in / 6-out rhythm (./ribbon/ribbonScene.ts).
 *    The part near the pointer lifts towards you, the ribbon tilts towards the pointer,
 *    scrolling or dragging on empty space makes the twist flow, and a tap sends a ripple.
 *  - A faint glow follows the pointer.
 *  - Flowers bloom for celebrations, e.g. after a good check-in (`celebrateFrom`).
 * Colours come from the Universal Color System. If the device asks for reduced
 * motion, or `still` is set (e.g. on emergency screens), the ribbon stays still.
 * Without WebGL, the page simply keeps its plain background.
 */
import React, { useEffect, useRef } from 'react';
import type { BackdropController } from './ribbon/ribbonScene';

interface Petal {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  rot: number;
  spin: number;
  color: string;
  life: number;
}

const LIGHT = ['#10b981', '#34d399', '#fbbf24', '#7dd3fc', '#fda4af'];
const DARK = ['#10b981', '#34d399', '#f59e0b', '#38bdf8', '#fb7185'];

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T,>(arr: T[]) => arr[Math.floor(Math.random() * arr.length)];

function drawPetal(ctx: CanvasRenderingContext2D, p: Petal) {
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(p.rot);
  ctx.globalAlpha = 0.85 * Math.max(0, p.life);
  ctx.fillStyle = p.color;
  ctx.beginPath();
  ctx.ellipse(0, 0, p.size * 0.45, p.size, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** A flower that grows open (celebrations), or just a ring (taps), then fades. */
interface Bloom {
  x: number;
  y: number;
  t: number;
  color: string;
  centre: string;
  ringOnly: boolean;
}

function drawBloom(ctx: CanvasRenderingContext2D, b: Bloom) {
  const grow = Math.min(1, b.t / 0.6);
  const fade = b.t < 1.6 ? 1 : Math.max(0, 1 - (b.t - 1.6) / 0.8);
  const r = 22 * (0.3 + 0.7 * (1 - Math.pow(1 - grow, 3)));
  ctx.save();
  ctx.translate(b.x, b.y);
  if (!b.ringOnly) {
    ctx.globalAlpha = 0.85 * fade;
    ctx.fillStyle = b.color;
    for (let i = 0; i < 6; i++) {
      ctx.save();
      ctx.rotate((i / 6) * Math.PI * 2 + b.t * 0.4);
      ctx.beginPath();
      ctx.ellipse(0, -r * 0.75, r * 0.38, r * 0.75, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    ctx.fillStyle = b.centre;
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.32, 0, Math.PI * 2);
    ctx.fill();
  }
  // ripple ring
  ctx.globalAlpha = (b.ringOnly ? 0.5 : 0.35) * fade * (1 - grow * 0.6);
  ctx.strokeStyle = b.color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, 0, r * (1.4 + b.t * 1.2), 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

const BLOOM_EVENT = '4life:bloom';

/** Make flowers bloom on the background at a screen position (e.g. from a button). */
export function bloomAt(clientX: number, clientY: number, count = 1) {
  window.dispatchEvent(new CustomEvent(BLOOM_EVENT, { detail: { x: clientX, y: clientY, count } }));
}

/** Celebrate from an element: a few flowers burst around it. */
export function celebrateFrom(el: Element | null) {
  if (!el) return;
  const r = el.getBoundingClientRect();
  bloomAt(r.left + r.width / 2, r.top + r.height / 2, 4);
}

/* Taps count as "on the background" when they land on empty layout space, not on content */
const CONTENT = 'button,a,input,textarea,select,label,summary,section,article,aside,header,nav,form,ul,ol,li,p,h1,h2,h3,h4,img,svg,canvas[data-chart],[role=dialog],[role=menu],[data-no-bloom]';

interface Props {
  isDark: boolean;
  /** 0–1: how strongly the ribbon shows (the app uses less than the sign-in screen) */
  density?: number;
  /** Stop moving (calm screens such as emergencies) */
  still?: boolean;
  /** Fill the viewport behind everything (app) instead of the parent box (sign-in) */
  fixed?: boolean;
  /** Where empty-space taps and drags count (defaults to the background only) */
  zoneSelector?: string;
}

const isLowPower = () => {
  const cores = navigator.hardwareConcurrency || 4;
  const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 4;
  const small = Math.min(window.innerWidth, window.innerHeight) < 600;
  return small || cores <= 4 || mem <= 2;
};

export const LivingBackground: React.FC<Props> = ({ isDark, density = 1, still = false, fixed = false, zoneSelector }) => {
  const rootRef = useRef<HTMLDivElement>(null);
  const glCanvasRef = useRef<HTMLCanvasElement>(null);
  const fxCanvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<BackdropController | null>(null);
  const darkRef = useRef(isDark);
  darkRef.current = isDark;
  const stillRef = useRef(still);
  stillRef.current = still;

  const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  // also rest while a dialog or quick search covers the page
  const covered = () => document.documentElement.dataset.overlay === 'open';
  const calm = () => stillRef.current || reducedMotion() || covered();

  // The 3D ribbon, loaded on demand
  useEffect(() => {
    let cancelled = false;
    const canvas = glCanvasRef.current;
    if (!canvas) return;
    import('./ribbon/ribbonScene')
      .then(({ createRibbon }) => {
        if (cancelled) return;
        const h = createRibbon(canvas, { dark: darkRef.current, still: calm(), lowPower: isLowPower(), scale: fixed ? 1 : 1.3 });
        if (!h) return;
        sceneRef.current = h;
        canvas.dataset.ready = 'true';
      })
      .catch(() => {
        /* no WebGL or the file failed to load: keep the plain background */
      });
    return () => {
      cancelled = true;
      sceneRef.current?.dispose();
      sceneRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    sceneRef.current?.setDark(isDark);
  }, [isDark]);
  useEffect(() => {
    sceneRef.current?.setStill(calm());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [still]);
  useEffect(() => {
    const mo = new MutationObserver(() => sceneRef.current?.setStill(calm()));
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-overlay'] });
    return () => mo.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Pointer, taps, drags, scrolling and the celebration flowers
  useEffect(() => {
    const root = rootRef.current;
    const canvas = fxCanvasRef.current;
    if (!root || !canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let w = 0;
    let h = 0;
    let petals: Petal[] = [];
    let blooms: Bloom[] = [];
    let raf = 0;
    let last = 0;

    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      w = root.clientWidth;
      h = root.clientHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      sceneRef.current?.resize();
    };

    const setGlow = (x: number, y: number) => {
      root.style.setProperty('--glow-x', `${x}px`);
      root.style.setProperty('--glow-y', `${y}px`);
    };

    const draw = () => {
      ctx.clearRect(0, 0, w, h);
      for (const p of petals) drawPetal(ctx, p);
      for (const b of blooms) drawBloom(ctx, b);
    };
    const step = (now: number) => {
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
      last = now;
      const k = dt * 60;
      for (const p of petals) {
        p.life -= dt * 0.6;
        p.vy += 0.03 * k;
        p.vx *= 0.985;
        p.vy *= 0.985;
        p.x += p.vx * k;
        p.y += p.vy * k;
        p.rot += p.spin * k;
      }
      petals = petals.filter(p => p.life > 0);
      for (const b of blooms) b.t += dt;
      blooms = blooms.filter(b => b.t < 2.4);
      draw();
      if (petals.length || blooms.length) raf = requestAnimationFrame(step);
      else {
        raf = 0;
        last = 0;
      }
    };
    const kick = () => {
      if (!raf) raf = requestAnimationFrame(step);
    };

    const flower = (x: number, y: number) => {
      const pal = darkRef.current ? DARK : LIGHT;
      blooms.push({ x, y, t: 0, color: pick(pal), centre: darkRef.current ? '#fbbf24' : '#f59e0b', ringOnly: false });
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2 + rand(-0.2, 0.2);
        const speed = rand(1.2, 3.2);
        petals.push({ x, y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed - 0.6, size: rand(4, 8), rot: a, spin: rand(-0.08, 0.08), color: pick(pal), life: 1 });
      }
      if (blooms.length > 12) blooms = blooms.slice(-12);
      kick();
    };
    const ring = (x: number, y: number) => {
      blooms.push({ x, y, t: 0.25, color: darkRef.current ? '#34d399' : '#047857', centre: '', ringOnly: true });
      kick();
    };

    const local = (e: { clientX: number; clientY: number }) => {
      const r = root.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };

    // Is this pointer on empty background (not on a card, button, text…)?
    const onBackground = (t: EventTarget | null) => {
      const el = t as Element | null;
      if (!el) return false;
      if (el === canvas) return true;
      return !!zoneSelector && !!el.closest?.(zoneSelector) && !el.closest(CONTENT);
    };

    let drag: { x: number; y: number; moved: number } | null = null;

    const onMove = (e: PointerEvent) => {
      const p = local(e);
      setGlow(p.x, p.y);
      sceneRef.current?.pointer(p.x, p.y, true);
      if (drag) {
        const dx = e.clientX - drag.x;
        const dy = e.clientY - drag.y;
        drag.moved += Math.abs(dx) + Math.abs(dy);
        drag.x = e.clientX;
        drag.y = e.clientY;
        sceneRef.current?.spin((dx - dy) * 0.02);
      }
    };
    const onLeave = () => sceneRef.current?.pointer(0, 0, false);
    const onDown = (e: PointerEvent) => {
      if (!onBackground(e.target)) return;
      drag = { x: e.clientX, y: e.clientY, moved: 0 };
    };
    const onUp = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') onLeave(); // a lifted finger no longer points anywhere
      if (!drag) return;
      const wasTap = drag.moved < 8;
      drag = null;
      if (!wasTap || calm()) return;
      const p = local(e);
      sceneRef.current?.tap(p.x, p.y);
      ring(p.x, p.y);
    };

    // Scrolling (wheel, touch, keys) makes the ribbon's twist flow
    const scrollPos = new WeakMap<object, number>();
    const onScroll = (e: Event) => {
      const t = e.target as Element | Document;
      const el = t instanceof Document ? (document.scrollingElement as Element | null) : t;
      if (!el) return;
      const top = (el as Element).scrollTop;
      const prev = scrollPos.get(el);
      scrollPos.set(el, top);
      if (prev !== undefined) sceneRef.current?.spin(Math.max(-60, Math.min(60, top - prev)) * 0.012);
    };

    const onBloomEvent = (e: Event) => {
      const d = (e as CustomEvent).detail || {};
      const r = root.getBoundingClientRect();
      const n = Math.max(1, Math.min(6, d.count || 1));
      for (let i = 0; i < n; i++) {
        const spread = n > 1 ? 70 : 0;
        flower(d.x - r.left + rand(-spread, spread), d.y - r.top + rand(-spread * 0.6, spread * 0.6));
      }
      if (!calm()) sceneRef.current?.tap(d.x - r.left, d.y - r.top);
    };

    resize();
    setGlow(w * 0.3, h * 0.25);
    const ro = new ResizeObserver(resize);
    ro.observe(root);
    window.addEventListener('pointermove', onMove, { passive: true });
    document.documentElement.addEventListener('pointerleave', onLeave);
    const downTarget: EventTarget = zoneSelector ? window : root;
    downTarget.addEventListener('pointerdown', onDown as EventListener);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', () => (drag = null));
    document.addEventListener('scroll', onScroll, { capture: true, passive: true });
    window.addEventListener(BLOOM_EVENT, onBloomEvent);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener('pointermove', onMove);
      document.documentElement.removeEventListener('pointerleave', onLeave);
      downTarget.removeEventListener('pointerdown', onDown as EventListener);
      window.removeEventListener('pointerup', onUp);
      document.removeEventListener('scroll', onScroll, { capture: true } as EventListenerOptions);
      window.removeEventListener(BLOOM_EVENT, onBloomEvent);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const strength = Math.max(0.3, Math.min(1, 0.3 + density * 0.7));

  return (
    <div ref={rootRef} className={fixed ? 'fixed inset-0 -z-10 overflow-hidden' : 'absolute inset-0 overflow-hidden'} aria-hidden="true">
      {/* soft studio light */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: isDark
            ? 'radial-gradient(120% 90% at 20% 10%, rgba(16,185,129,0.10), transparent 60%), radial-gradient(90% 70% at 90% 100%, rgba(56,189,248,0.06), transparent 60%)'
            : 'radial-gradient(120% 90% at 20% 10%, #ffffff, transparent 65%), radial-gradient(90% 70% at 90% 100%, rgba(209,250,229,0.55), transparent 60%)',
        }}
      />
      {/* the 3D green ribbon */}
      <canvas
        ref={glCanvasRef}
        className="pointer-events-none absolute inset-0 h-full w-full opacity-0 transition-opacity duration-1000 data-[ready=true]:opacity-[var(--scene-strength)]"
        style={{ ['--scene-strength' as string]: strength }}
      />
      {/* glow that follows the pointer */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: `radial-gradient(380px circle at var(--glow-x, 30%) var(--glow-y, 25%), ${isDark ? 'rgba(16,185,129,0.12)' : 'rgba(16,185,129,0.08)'}, transparent 70%)`,
        }}
      />
      {/* flowers, rings; also catches taps on the sign-in background */}
      <canvas ref={fxCanvasRef} className={fixed ? 'absolute inset-0' : 'absolute inset-0 cursor-grab touch-manipulation active:cursor-grabbing'} />
    </div>
  );
};
