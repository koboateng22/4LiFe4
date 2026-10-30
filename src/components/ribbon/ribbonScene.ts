/**
 * The green ribbon — the international symbol of mental health awareness —
 * drawn as a soft 3D ribbon (three.js) that twists across the screen.
 * It is the interactive background behind the sign-in screen and the app.
 *
 *  - One side is porcelain, the other is mental-health green, so the colours
 *    swap as the ribbon twists.
 *  - It "breathes" on a slow, calm rhythm: in for 4 seconds, out for 6.
 *  - The part near the pointer (or finger) lifts towards you and turns.
 *  - Scrolling or dragging on empty space makes the twist flow along it.
 *  - A tap on empty space sends a ripple along the ribbon.
 *
 * Loaded on demand (dynamic import) so the app opens fast; the caller keeps a
 * plain background if WebGL is not available.
 */
import {
  BufferAttribute,
  BufferGeometry,
  Color,
  DirectionalLight,
  Group,
  Mesh,
  MeshStandardMaterial,
  NeutralToneMapping,
  PCFSoftShadowMap,
  PerspectiveCamera,
  Plane,
  PMREMGenerator,
  Raycaster,
  Scene,
  SRGBColorSpace,
  Vector2,
  Vector3,
  WebGLRenderer,
  type Texture,
} from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

export interface BackdropOptions {
  dark: boolean;
  /** Freeze all movement (emergency screens, reduced motion, setting turned off) */
  still: boolean;
  /** Phones and slower computers: no shadows, fewer points, lower resolution */
  lowPower: boolean;
  /** Size compared with the screen (1 = normal, bigger on the sign-in screen) */
  scale?: number;
}

export interface BackdropController {
  setDark(dark: boolean): void;
  setStill(still: boolean): void;
  /** Pointer position in canvas pixels; `inside` false when it leaves the window */
  pointer(x: number, y: number, inside: boolean): void;
  /** Ripple from a tap at canvas pixels */
  tap(x: number, y: number): void;
  /** Add flow (radians per second), e.g. from scrolling or dragging */
  spin(v: number): void;
  resize(): void;
  dispose(): void;
}

/* Universal Color System */
const LIGHT = { face: '#f7f9f8', back: '#10b981', edge: '#d1fae5' };
const DARK = { face: '#1d4b3d', back: '#10b981', edge: '#065f46' };

const AUTO_FLOW = 0.22; // radians per second when idle
const BREATH_IN = 4;
const BREATH_OUT = 6;

const ease = (t: number) => t * t * (3 - 2 * t);
/** 0 → 1 while breathing in (4 s), 1 → 0 while breathing out (6 s) */
const breathAt = (t: number) => {
  const c = t % (BREATH_IN + BREATH_OUT);
  return c < BREATH_IN ? ease(c / BREATH_IN) : 1 - ease((c - BREATH_IN) / BREATH_OUT);
};

export function createRibbon(canvas: HTMLCanvasElement, opts: BackdropOptions): BackdropController | null {
  let renderer: WebGLRenderer;
  try {
    renderer = new WebGLRenderer({ canvas, alpha: true, antialias: !opts.lowPower, powerPreference: 'low-power' });
  } catch {
    return null;
  }
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = NeutralToneMapping;
  renderer.shadowMap.enabled = !opts.lowPower;
  renderer.shadowMap.type = PCFSoftShadowMap;

  const scene = new Scene();
  const camera = new PerspectiveCamera(30, 1, 1, 80);
  camera.position.set(0, 0, 20);

  // Soft studio light for the clay-like look, plus one key light for gentle self-shadows
  const pmrem = new PMREMGenerator(renderer);
  const envTex: Texture = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = envTex;
  const key = new DirectionalLight('#ffffff', 1.5);
  key.position.set(-6, 10, 14);
  key.castShadow = !opts.lowPower;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.bias = -0.0006;
  key.shadow.normalBias = 0.04;
  key.shadow.radius = 6;
  scene.add(key);

  // Ribbon mesh: a closed, flattened tube (rounded edges) swept along a soft curve
  const SEG = opts.lowPower ? 150 : 260; // points along the ribbon
  const RING = opts.lowPower ? 16 : 28; // points around its cross-section
  const verts = (SEG + 1) * RING;
  const positions = new Float32Array(verts * 3);
  const colours = new Float32Array(verts * 3);
  const index: number[] = [];
  for (let i = 0; i < SEG; i++) {
    for (let j = 0; j < RING; j++) {
      const a = i * RING + j;
      const b = i * RING + ((j + 1) % RING);
      const c = (i + 1) * RING + j;
      const d = (i + 1) * RING + ((j + 1) % RING);
      index.push(a, b, c, b, d, c);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setIndex(index);
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setAttribute('color', new BufferAttribute(colours, 3));

  // Cross-section: a flat rounded rectangle (superellipse); side = +1 face, −1 back
  const crossU = new Float32Array(RING);
  const crossV = new Float32Array(RING);
  for (let j = 0; j < RING; j++) {
    const t = (j / RING) * Math.PI * 2;
    const c = Math.cos(t);
    const s = Math.sin(t);
    crossU[j] = Math.sign(c) * Math.pow(Math.abs(c), 0.32);
    crossV[j] = Math.sign(s) * Math.pow(Math.abs(s), 0.32);
  }

  const material = new MeshStandardMaterial({ vertexColors: true, roughness: 0.46, metalness: 0 });
  const mesh = new Mesh(geometry, material);
  mesh.castShadow = !opts.lowPower;
  mesh.receiveShadow = !opts.lowPower;
  mesh.frustumCulled = false;
  const group = new Group();
  group.add(mesh);
  scene.add(group);

  // Layout (world units), recomputed on resize
  let viewW = 1;
  let viewH = 1;
  let half = 10; // half of the ribbon's length
  let width = 1.5; // half-width
  let thick = 0.12; // half-thickness
  let amp = 0.6; // how much the centre line waves
  let waveK = 0.3;
  let twistRate = 0.6;

  // Motion state
  let dark = opts.dark;
  let still = opts.still;
  let phase = 0.4;
  let flowVel = 0;
  let time = 0;
  const tilt = { x: 0, y: 0, tx: 0, ty: 0 };
  const lift = new Float32Array(SEG + 1);
  const liftTarget = new Float32Array(SEG + 1);
  const ripples: Array<{ s: number; t: number }> = [];
  const pointerPx = { x: 0, y: 0, inside: false };

  const raycaster = new Raycaster();
  const ndc = new Vector2();
  const plane = new Plane(new Vector3(0, 0, 1), 0);
  const hit = new Vector3();
  const T = new Vector3();
  const N0 = new Vector3();
  const B0 = new Vector3();
  const W = new Vector3();
  const F = new Vector3();
  const P = new Vector3();

  const centreY = (x: number, wave: number) => amp * Math.sin(x * waveK + wave);

  const paint = () => {
    const c = dark ? DARK : LIGHT;
    const face = new Color(c.face);
    const back = new Color(c.back);
    const edge = new Color(c.edge);
    const tmp = new Color();
    for (let i = 0; i <= SEG; i++) {
      for (let j = 0; j < RING; j++) {
        const v = crossV[j];
        // face on one side, green on the other, a soft edge between them
        const k = Math.max(0, Math.min(1, (v + 0.35) / 0.7));
        if (k > 0.5) tmp.copy(edge).lerp(face, (k - 0.5) * 2);
        else tmp.copy(back).lerp(edge, k * 2);
        const o = (i * RING + j) * 3;
        colours[o] = tmp.r;
        colours[o + 1] = tmp.g;
        colours[o + 2] = tmp.b;
      }
    }
    geometry.attributes.color.needsUpdate = true;
    material.roughness = dark ? 0.4 : 0.46;
    key.intensity = dark ? 2.1 : 1.5;
    scene.environmentIntensity = dark ? 0.55 : 1;
  };

  const build = () => {
    const w = canvas.clientWidth || 1;
    const h = canvas.clientHeight || 1;
    const dpr = Math.min(opts.lowPower ? 1.25 : 1.75, window.devicePixelRatio || 1);
    renderer.setPixelRatio(dpr);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();

    viewH = 2 * camera.position.z * Math.tan((camera.fov * Math.PI) / 360);
    viewW = viewH * camera.aspect;
    const d = Math.min(viewW * 1.15, viewH) * (opts.scale ?? 1);
    const diagonal = Math.hypot(viewW, viewH);
    half = diagonal * 0.62;
    width = d * 0.17;
    thick = width * 0.085;
    amp = d * 0.07;
    waveK = (Math.PI * 2) / (diagonal * 0.95);
    twistRate = (Math.PI * 2 * 1.8) / (half * 2); // about two full twists across the screen
    group.rotation.z = Math.min(1.15, Math.max(0.55, Math.atan2(viewH, viewW) + 0.12));

    const sc = key.shadow.camera;
    sc.left = -half;
    sc.right = half;
    sc.top = half;
    sc.bottom = -half;
    sc.near = 1;
    sc.far = 70;
    sc.updateProjectionMatrix();
  };

  /** Where along the ribbon (local x) the pointer is, and how close to it (0–1) */
  const locate = (px: number, py: number) => {
    const w = canvas.clientWidth || 1;
    const h = canvas.clientHeight || 1;
    ndc.set((px / w) * 2 - 1, -(py / h) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    if (!raycaster.ray.intersectPlane(plane, hit)) return null;
    group.updateMatrixWorld();
    const local = group.worldToLocal(hit.clone());
    const dist = local.y - centreY(local.x, time * 0.25);
    return { s: local.x, near: Math.exp(-Math.pow(dist / (width * 1.7), 2)) };
  };

  const shape = (dt: number) => {
    if (!still) time += dt; // the breathing and waves pause while still
    flowVel *= Math.pow(0.12, dt);
    phase += ((still ? 0 : AUTO_FLOW) + flowVel) * dt;
    const wave = time * 0.25;
    const breath = 1 + 0.05 * breathAt(time);

    tilt.x += (tilt.tx - tilt.x) * Math.min(1, dt * 3);
    tilt.y += (tilt.ty - tilt.y) * Math.min(1, dt * 3);
    group.rotation.x = tilt.x;
    group.rotation.y = tilt.y;

    liftTarget.fill(0);
    if (pointerPx.inside && !still) {
      const at = locate(pointerPx.x, pointerPx.y);
      if (at) {
        for (let i = 0; i <= SEG; i++) {
          const x = -half + (i / SEG) * half * 2;
          liftTarget[i] = Math.exp(-Math.pow((x - at.s) / (width * 1.3), 2)) * at.near;
        }
      }
    }
    for (let r = ripples.length - 1; r >= 0; r--) {
      ripples[r].t += dt;
      if (ripples[r].t > 2.8) ripples.splice(r, 1);
    }

    for (let i = 0; i <= SEG; i++) {
      lift[i] += (liftTarget[i] - lift[i]) * Math.min(1, dt * 6);
      const x = -half + (i / SEG) * half * 2;
      let ripple = 0;
      for (const rp of ripples) {
        const front = rp.t * width * 7;
        ripple += Math.exp(-Math.pow((Math.abs(x - rp.s) - front) / (width * 0.9), 2)) * Math.exp(-rp.t * 1.1);
      }
      const up = lift[i] * 0.9 + ripple;

      // centre line and its direction
      const y = centreY(x, wave);
      const z = amp * 0.5 * Math.cos(x * waveK * 0.7 + wave * 1.3) + up * width * 0.75;
      const dy = amp * waveK * Math.cos(x * waveK + wave);
      const dz = -amp * 0.5 * waveK * 0.7 * Math.sin(x * waveK * 0.7 + wave * 1.3);
      T.set(1, dy, dz).normalize();
      N0.set(0, 0, 1).addScaledVector(T, -T.z).normalize();
      B0.crossVectors(N0, T);
      const twist = x * twistRate + phase + up * 0.9;
      const c = Math.cos(twist);
      const s = Math.sin(twist);
      W.copy(B0).multiplyScalar(c).addScaledVector(N0, s);
      F.copy(B0).multiplyScalar(-s).addScaledVector(N0, c);
      const wv = width * breath * (1 + up * 0.08);

      for (let j = 0; j < RING; j++) {
        P.set(x, y, z).addScaledVector(W, crossU[j] * wv).addScaledVector(F, crossV[j] * thick);
        const o = (i * RING + j) * 3;
        positions[o] = P.x;
        positions[o + 1] = P.y;
        positions[o + 2] = P.z;
      }
    }
    geometry.attributes.position.needsUpdate = true;
    geometry.computeVertexNormals();
  };

  // Render loop: runs while something moves, sleeps when still and settled
  let raf = 0;
  let last = 0;
  let slowFrames = 0;
  const frame = (now: number) => {
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
    last = now;
    shape(dt);
    renderer.render(scene, camera);

    // On a slow device, drop shadows and resolution instead of stuttering
    if (dt > 0.03) slowFrames++;
    else slowFrames = Math.max(0, slowFrames - 1);
    if (slowFrames > 40 && renderer.shadowMap.enabled) {
      renderer.shadowMap.enabled = false;
      key.castShadow = false;
      mesh.castShadow = mesh.receiveShadow = false;
      material.needsUpdate = true;
      renderer.setPixelRatio(1);
      slowFrames = 0;
    }

    const settled =
      still && ripples.length === 0 && Math.abs(tilt.x - tilt.tx) < 1e-3 && Math.abs(tilt.y - tilt.ty) < 1e-3 && lift.every(v => Math.abs(v) < 1e-3);
    if (settled || document.hidden) {
      raf = 0;
      last = 0;
      return;
    }
    raf = requestAnimationFrame(frame);
  };
  const wake = () => {
    if (!raf && !document.hidden) raf = requestAnimationFrame(frame);
  };
  const renderOnce = () => {
    shape(0);
    renderer.render(scene, camera);
  };
  const onVisibility = () => {
    if (!document.hidden) wake();
  };
  document.addEventListener('visibilitychange', onVisibility);

  build();
  paint();
  renderOnce();
  if (!still) wake();

  return {
    setDark(d) {
      dark = d;
      paint();
      renderOnce();
    },
    setStill(s) {
      still = s;
      if (s) {
        tilt.tx = tilt.ty = 0;
        flowVel = 0;
      }
      wake();
    },
    pointer(x, y, inside) {
      pointerPx.x = x;
      pointerPx.y = y;
      pointerPx.inside = inside;
      if (still) return;
      const w = canvas.clientWidth || 1;
      const h = canvas.clientHeight || 1;
      tilt.ty = inside ? (x / w - 0.5) * 0.2 : 0;
      tilt.tx = inside ? (y / h - 0.5) * 0.16 : 0;
      wake();
    },
    tap(x, y) {
      if (still) return;
      const at = locate(x, y);
      ripples.push({ s: at ? at.s : 0, t: 0 });
      if (ripples.length > 5) ripples.shift();
      flowVel += 0.8;
      wake();
    },
    spin(v) {
      if (still) return;
      flowVel = Math.max(-5, Math.min(5, flowVel + v));
      wake();
    },
    resize() {
      build();
      renderOnce();
      wake();
    },
    dispose() {
      cancelAnimationFrame(raf);
      document.removeEventListener('visibilitychange', onVisibility);
      geometry.dispose();
      material.dispose();
      envTex.dispose();
      pmrem.dispose();
      renderer.dispose();
    },
  };
}
