/**
 * THREE.JS backdrop — the iOPEX symbol as a particle system that assembles out
 * of deep space, breathes, dissolves into two side swarms as you scroll past the
 * hero, plus a three-band ambient flow field behind it. Shared by both views:
 * it runs behind the home page AND as each product page's live backdrop.
 *
 * Ported from the kiosk page's inline script. Imperative on purpose: React
 * mounts it once (see CanvasBackground) and talks to it through SceneHandle.
 */
import * as THREE from 'three';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { CAM_DRIFT_BY_PRODUCT, type CamDrift, type ProductId } from '../data/products';

gsap.registerPlugin(ScrollTrigger);

export interface ParticleSceneOptions {
  container: HTMLElement;
  /** True while a product deck covers the home view. */
  isProductOpen: () => boolean;
  /** Called every home-view frame with the eased 0–1 split amount. */
  onSplit: (split: number) => void;
}

const lerp = (a: number, b: number, n: number): number => a + (b - a) * n;
const easeOutCubic = (x: number): number => 1 - Math.pow(1 - x, 3);
function smoothstep(x: number, a: number, b: number): number {
  const t = Math.min(Math.max((x - a) / (b - a), 0), 1);
  return t * t * (3 - 2 * t);
}

/* ---------- PERFORMANCE: LOW-POWER DEVICE DETECTION ----------
   A rough, conservative heuristic used everywhere below to scale down pixel
   ratio, particle counts, and per-frame update rates on weaker hardware. */
const isLowPowerDevice =
  (navigator.hardwareConcurrency !== undefined && navigator.hardwareConcurrency <= 4) ||
  (navigator.deviceMemory !== undefined && navigator.deviceMemory <= 4) ||
  window.innerWidth <= 820;
/* Capped lower than the display can do on weak hardware only. The old blanket
   1.5 cap was the "blurry on 4K" bug: a 65-75" 4K kiosk running at 200% OS
   scaling has devicePixelRatio 2, so capping at 1.5 rendered at 75% of native
   resolution and upscaled — visibly soft at that panel size. Capable devices
   now render up to DPR 2 (true 4K native); the low-power path keeps its cap. */
const PIXEL_RATIO_CAP = isLowPowerDevice ? 1.25 : 2;
const PARTICLE_UPDATE_STRIDE = 1;

function balancedPixelRatio(): number {
  return Math.max(1, Math.min(window.devicePixelRatio || 1, PIXEL_RATIO_CAP));
}

/* PointsMaterial only exposes a single uniform "size"; multiply it by our own
   per-vertex "aSize" attribute at compile time. The same patch also replaces
   the old 64x64 bitmap glow sprite with an ANALYTIC circular falloff computed
   per fragment from gl_PointCoord. The bitmap was the "box glow" bug on 4K:
   at small on-screen sizes the GPU samples its deep mip levels, where the
   circular alpha mask has been averaged into a semi-transparent SQUARE
   covering the whole quad (and with mipmaps off it aliases into a hard
   square instead). Computing the disc mathematically keeps every particle a
   perfect crisp circle at any size, on any resolution — and skips a texture
   fetch per fragment. */
function patchParticleMaterial(mat: THREE.PointsMaterial): void {
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', 'attribute float aSize;\n#include <common>')
      .replace('gl_PointSize = size;', 'gl_PointSize = size * aSize;');
    shader.fragmentShader = shader.fragmentShader.replace(
      'vec4 diffuseColor = vec4( diffuse, opacity );',
      [
        'float _pd = length( gl_PointCoord - vec2( 0.5 ) );',
        'float _disc = 1.0 - smoothstep( 0.32, 0.5, _pd );',
        'if ( _disc <= 0.004 ) discard;',
        'vec4 diffuseColor = vec4( diffuse, opacity * _disc );',
      ].join('\n'),
    );
  };
}

/* ---------- geometry — transcribed from the official iOPEX symbol SVG ---------- */
const VB_W = 179.49, VB_H = 170.54, SCALE = 90;
type Cmd =
  | { type: 'M' | 'L'; x: number; y: number }
  | { type: 'C'; c1x: number; c1y: number; c2x: number; c2y: number; x: number; y: number }
  | { type: 'Q'; cx: number; cy: number; x: number; y: number };
const P = (x: number, y: number): [number, number] => [(x - VB_W / 2) / SCALE, (VB_H / 2 - y) / SCALE];
function buildShape(cmds: Cmd[]): THREE.Shape {
  const shape = new THREE.Shape();
  cmds.forEach((c) => {
    if (c.type === 'M') shape.moveTo(...P(c.x, c.y));
    if (c.type === 'L') shape.lineTo(...P(c.x, c.y));
    if (c.type === 'C') shape.bezierCurveTo(...P(c.c1x, c.c1y), ...P(c.c2x, c.c2y), ...P(c.x, c.y));
    if (c.type === 'Q') shape.quadraticCurveTo(...P(c.cx, c.cy), ...P(c.x, c.y));
  });
  shape.closePath();
  return shape;
}

const rightCrescent = buildShape([
  { type: 'M', x: 153.65, y: 85.47 },
  { type: 'C', c1x: 153.65, c1y: 116.32, c2x: 136.03, c2y: 135.27, x: 117.93, y: 144.82 },
  { type: 'L', x: 117.89, y: 156.72 },
  { type: 'C', c1x: 153.83, c1y: 146.08, c2x: 179.49, c2y: 118.11, x: 179.49, y: 85.29 },
  { type: 'C', c1x: 179.49, c1y: 52.47, c2x: 153.83, c2y: 24.47, x: 117.89, y: 13.81 },
  { type: 'L', x: 117.93, y: 24.92 },
  { type: 'C', c1x: 135.90, c1y: 34.52, c2x: 153.65, c2y: 54.74, x: 153.65, y: 85.47 },
]);
const leftCrescent = buildShape([
  { type: 'M', x: 61.56, y: 24.93 },
  { type: 'L', x: 61.60, y: 13.82 },
  { type: 'C', c1x: 25.66, c1y: 24.47, c2x: 0, c2y: 52.48, x: 0, y: 85.29 },
  { type: 'C', c1x: 0, c1y: 118.10, c2x: 25.66, c2y: 146.08, x: 61.59, y: 156.72 },
  { type: 'L', x: 61.55, y: 144.82 },
  { type: 'C', c1x: 43.44, c1y: 135.27, c2x: 25.83, c2y: 116.31, x: 25.83, y: 85.47 },
  { type: 'C', c1x: 25.83, c1y: 54.63, c2x: 43.58, c2y: 34.53, x: 61.55, y: 24.93 },
]);
const connector = buildShape([
  { type: 'M', x: 102.77, y: 17.97 },
  { type: 'L', x: 102.77, y: 152.57 },
  { type: 'C', c1x: 102.77, c1y: 158.89, c2x: 104.50, c2y: 165.11, x: 107.77, y: 170.53 },
  /* bottom cap: control point centred between the two bottom tips (was
     x:111.04 — right of the right tip — which skewed the whole bottom
     flare sideways and left a thin, badly-sampled sliver on the left) */
  { type: 'Q', cx: 90.29, cy: 176.4, x: 72.81, y: 170.53 },
  { type: 'C', c1x: 76.09, c1y: 165.10, c2x: 77.82, c2y: 158.89, x: 77.82, y: 152.56 },
  { type: 'L', x: 77.82, y: 17.97 },
  { type: 'C', c1x: 77.82, c1y: 11.64, c2x: 76.09, c2y: 5.42, x: 72.81, y: 0 },
  { type: 'L', x: 107.77, y: 0 },
  { type: 'C', c1x: 104.50, c1y: 5.43, c2x: 102.78, c2y: 11.64, x: 102.77, y: 17.97 },
]);

/* ---------- LOGO AS A PARTICLE SYSTEM: sample interior points from each shape ---------- */
function triangulateShape(shape: THREE.Shape): { pos: ArrayLike<number>; triangles: [number, number, number][] } {
  const geo = new THREE.ShapeGeometry(shape, 64);
  const pos = geo.attributes.position.array;
  const idx = geo.index ? geo.index.array : null;
  const triangles: [number, number, number][] = [];
  if (idx) {
    for (let i = 0; i < idx.length; i += 3) triangles.push([idx[i] * 3, idx[i + 1] * 3, idx[i + 2] * 3]);
  } else {
    for (let i = 0; i < pos.length; i += 9) triangles.push([i, i + 3, i + 6]);
  }
  return { pos, triangles };
}
function triangleArea(pos: ArrayLike<number>, a: number, b: number, c: number): number {
  const ax = pos[a], ay = pos[a + 1], bx = pos[b], by = pos[b + 1], cx = pos[c], cy = pos[c + 1];
  return Math.abs((bx - ax) * (cy - ay) - (cx - ax) * (by - ay)) / 2;
}
function sampleShapePoints(shape: THREE.Shape, count: number, depth: number, out: Float32Array, offset: number): void {
  const { pos, triangles } = triangulateShape(shape);
  const areas = new Array<number>(triangles.length);
  let totalArea = 0;
  for (let i = 0; i < triangles.length; i++) {
    const t = triangles[i];
    areas[i] = triangleArea(pos, t[0], t[1], t[2]);
    totalArea += areas[i];
  }
  const cumulative = new Array<number>(areas.length);
  let acc = 0;
  for (let i = 0; i < areas.length; i++) { acc += areas[i]; cumulative[i] = acc; }
  for (let i = 0; i < count; i++) {
    const r = Math.random() * totalArea;
    let idx = 0;
    for (let j = 0; j < cumulative.length; j++) { if (r <= cumulative[j]) { idx = j; break; } idx = j; }
    const t = triangles[idx];
    const ax = pos[t[0]], ay = pos[t[0] + 1];
    const bx = pos[t[1]], by = pos[t[1] + 1];
    const cx = pos[t[2]], cy = pos[t[2] + 1];
    const r1 = Math.sqrt(Math.random()), r2 = Math.random();
    const px = (1 - r1) * ax + r1 * (1 - r2) * bx + r1 * r2 * cx;
    const py = (1 - r1) * ay + r1 * (1 - r2) * by + r1 * r2 * cy;
    const pz = (Math.random() - 0.5) * depth;
    const w = (offset + i) * 3;
    out[w] = px; out[w + 1] = py; out[w + 2] = pz;
  }
}

interface DepthLayer { key: string; share: number; rMin: number; rMax: number; sizeMin: number; sizeMax: number; colorMul: number; parallax: number }
const DEPTH_LAYERS: DepthLayer[] = [
  { key: 'near', share: 0.30, rMin: 3,  rMax: 11, sizeMin: 0.8,  sizeMax: 2.0, colorMul: 1.05, parallax: 1.00 },
  { key: 'mid',  share: 0.40, rMin: 9,  rMax: 24, sizeMin: 0.45, sizeMax: 1.2, colorMul: 0.80, parallax: 0.50 },
  { key: 'far',  share: 0.30, rMin: 20, rMax: 62, sizeMin: 0.2,  sizeMax: 0.6, colorMul: 0.50, parallax: 0.18 },
];

interface Keyframe { t: number; scale: number; camZ: number; look: [number, number]; zoomZ: number }
const KEYFRAMES: Keyframe[] = [
  { t: 0.00, scale: 2.1, camZ: 11.0, look: [0, 0],      zoomZ: 0 },
  { t: 0.22, scale: 1.9, camZ: 9.5,  look: [1.0, 0.2],  zoomZ: 3 },
  { t: 0.48, scale: 1.9, camZ: 9.2,  look: [-1.0, 0.1], zoomZ: 6 },
  { t: 0.74, scale: 1.9, camZ: 9.4,  look: [1.0, 0.0],  zoomZ: 9 },
  { t: 1.00, scale: 3.2, camZ: 11.5, look: [0, 0],      zoomZ: 12 },
];
type Frame = Omit<Keyframe, 't'>;
function getFrame(p: number): Frame {
  p = Math.min(Math.max(p, 0), 1);
  let a = KEYFRAMES[0], b = KEYFRAMES[KEYFRAMES.length - 1];
  for (let i = 0; i < KEYFRAMES.length - 1; i++) {
    if (p >= KEYFRAMES[i].t && p <= KEYFRAMES[i + 1].t) { a = KEYFRAMES[i]; b = KEYFRAMES[i + 1]; break; }
  }
  const span = (b.t - a.t) || 1;
  const local = (p - a.t) / span;
  return {
    scale: lerp(a.scale, b.scale, local),
    camZ: lerp(a.camZ, b.camZ, local),
    look: [lerp(a.look[0], b.look[0], local), lerp(a.look[1], b.look[1], local)],
    zoomZ: lerp(a.zoomZ, b.zoomZ, local),
  };
}

const FORMATION_DURATION = 3.2; // seconds, real time — independent of scroll

export class ParticleScene {
  private readonly opts: ParticleSceneOptions;
  private readonly scene = new THREE.Scene();
  private readonly camera: THREE.PerspectiveCamera;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly composer: EffectComposer;
  private readonly bloomPass: UnrealBloomPass;
  private readonly pmrem: THREE.PMREMGenerator;
  private readonly clock = new THREE.Clock();
  private readonly lookTarget = new THREE.Vector3();

  // ambient field
  private readonly PARTICLE_COUNT = isLowPowerDevice ? 850 : 1500;
  private readonly particleBase = new Float32Array(this.PARTICLE_COUNT * 3);
  private readonly particlePhase = new Float32Array(this.PARTICLE_COUNT);
  private readonly particleTwinklePhase = new Float32Array(this.PARTICLE_COUNT);
  private readonly particleTwinkleFreq = new Float32Array(this.PARTICLE_COUNT);
  private readonly particleBaseSize = new Float32Array(this.PARTICLE_COUNT);
  private readonly particleParallax = new Float32Array(this.PARTICLE_COUNT);
  private particles!: THREE.Points;
  private ambientFrameCounter = 0;
  private scrollVelocity = 0;
  private scrollSurge = 0;
  private lastScrollProgress = 0;

  // logo swarm — connector count raised so the centre "I" reads as densely
  // as the crescents (it was 1200 vs 2200 per crescent and looked sparse,
  // especially at its exposed top/bottom ends)
  private readonly LOGO_COUNTS = isLowPowerDevice
    ? { rightCrescent: 1400, leftCrescent: 1400, connector: 1250 }
    : { rightCrescent: 2200, leftCrescent: 2200, connector: 1950 };
  private readonly LOGO_PARTICLE_COUNT = this.LOGO_COUNTS.rightCrescent + this.LOGO_COUNTS.leftCrescent + this.LOGO_COUNTS.connector;
  private logoGeometry!: THREE.BufferGeometry;
  private logoGroup = new THREE.Group();
  private logoParticleMat!: THREE.PointsMaterial;
  private logoBasePositions!: Float32Array;
  private logoStartPositions!: Float32Array;
  private logoSide!: Float32Array;
  private logoSwarmOffset!: Float32Array;
  private logoSwarmDelay!: Float32Array;
  private logoSwarmTurbPhase!: Float32Array;
  private logoSwarmTurbFreq!: Float32Array;
  private logoTwinklePhase!: Float32Array;
  private logoTwinkleFreq!: Float32Array;
  private logoBaseSizes!: Float32Array;
  private logoScatterKeep!: Uint8Array;
  private logoIdlePhase!: Float32Array;
  private logoIdleFreq!: Float32Array;
  private logoIdleAmp!: Float32Array;
  private formOrigin = 0;

  // scroll choreography
  private scrollFrame: Frame = getFrame(0);
  private splitTarget = 0;
  private splitCurrent = 0;
  private scrollTrigger: ScrollTrigger | null = null;

  // camera drift per product
  private camDriftCurrent: CamDrift = { rx: 0.32, ry: 0.16, speed: 1.00 };
  private camDriftTarget: CamDrift = { rx: 0.32, ry: 0.16, speed: 1.00 };

  // input
  private readonly mouse = { x: 0, y: 0 };
  private readonly mouseTarget = { x: 0, y: 0 };
  private tabIsVisible = true;
  private raf = 0;
  private destroyed = false;

  constructor(opts: ParticleSceneOptions) {
    this.opts = opts;
    this.scene.background = new THREE.Color(0x0a0a10);

    this.camera = new THREE.PerspectiveCamera(42, window.innerWidth / window.innerHeight, 0.1, 100);
    this.camera.position.set(0, 0, 11);

    this.renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true });
    this.renderer.setPixelRatio(balancedPixelRatio());
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    opts.container.appendChild(this.renderer.domElement);

    /* REAL BLOOM — the mechanism the reference uses for its glow. The
       reference's own strength/radius/threshold (1.8 / 0.4 / 0) were tuned
       for ITS scene (20,000 tightly-packed tetrahedra); dropped onto a
       sparser scene with soft round sprites and a threshold of 0, it bloomed
       EVERYTHING — including dim background specks — into big soft blurry
       squares instead of crisp glowing points. Lower strength/radius and a
       real threshold keep the glow tight around genuinely bright points
       instead of smearing the whole frame. */
    /* REAL BLOOM — kept deliberately TIGHT and CHEAP:
       - low radius + moderate strength = a thin halo hugging each particle
         (crystal points, not gaussian smear)
       - higher threshold = only genuinely hot pixels enter the blur chain
       - and the pass itself runs at a capped resolution (see capBloomSize):
         bloom is low-frequency by nature, so computing it above ~1080p on a
         4K panel burns GPU for no visible gain — this was the main source of
         the lag once the canvas moved to native 4K. */
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight), 0.45, 0.05, 0.3,
    );
    this.composer.addPass(this.bloomPass);
    this.composer.addPass(new OutputPass()); // applies tone mapping + color space after bloom
    /* The composer snapshots the renderer's pixel ratio at construction and
       never re-reads it — its buffers must be told explicitly, or the whole
       post chain renders below canvas resolution and upscales (soft/blurry
       on large panels). */
    this.composer.setPixelRatio(balancedPixelRatio());
    this.composer.setSize(window.innerWidth, window.innerHeight);
    this.capBloomSize();

    this.pmrem = new THREE.PMREMGenerator(this.renderer);
    this.pmrem.compileEquirectangularShader();
    this.scene.environment = this.buildEnvironment();

    this.scene.add(new THREE.AmbientLight(0x404040, 0.55));
    const keyLight = new THREE.PointLight(0xfff1d6, 3.2, 30); keyLight.position.set(5, 5, 6); this.scene.add(keyLight);
    const fillLight = new THREE.PointLight(0xbfd7ff, 1.1, 30); fillLight.position.set(-6, -1, 4); this.scene.add(fillLight);
    const rimLight = new THREE.DirectionalLight(0xffffff, 0.9); rimLight.position.set(-3, 4, -6); this.scene.add(rimLight);

    /* real atmospheric depth: distant ambient particles fade toward the
       background colour. Scoped off the logo mark via material.fog=false. */
    this.scene.fog = new THREE.FogExp2(0x0a0a10, 0.032);

    this.particles = this.buildParticles();
    this.scene.add(this.particles);

    this.buildLogo();
    this.scene.add(this.logoGroup);

    window.addEventListener('resize', this.onResize);
    window.addEventListener('mousemove', this.onMouseMove);
    document.addEventListener('visibilitychange', this.onVisibility);

    this.scrollTrigger = ScrollTrigger.create({
      trigger: document.body,
      start: 'top top',
      end: 'bottom bottom',
      scrub: 0.3,
      onUpdate: (self) => {
        this.scrollFrame = getFrame(self.progress);
        this.splitTarget = smoothstep(self.progress, 0.03, 0.18);
        this.scrollVelocity = (self.progress - this.lastScrollProgress) * 60;
        this.lastScrollProgress = self.progress;
      },
    });

    this.raf = requestAnimationFrame(this.animate);
  }

  /* ------------------------------------------------------- public API ---- */

  setProductDrift(id: ProductId): void {
    const d = CAM_DRIFT_BY_PRODUCT[id];
    if (d) this.camDriftTarget = { ...d };
  }

  replayFormation(): void {
    this.formOrigin = this.clock.getElapsedTime();
  }

  destroy(): void {
    this.destroyed = true;
    cancelAnimationFrame(this.raf);
    window.removeEventListener('resize', this.onResize);
    window.removeEventListener('mousemove', this.onMouseMove);
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.scrollTrigger?.kill();
    this.scrollTrigger = null;
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh | THREE.Points;
      if ('geometry' in m && m.geometry) m.geometry.dispose();
      if ('material' in m && m.material) {
        const mats = Array.isArray(m.material) ? m.material : [m.material];
        mats.forEach((mat) => mat.dispose());
      }
    });
    this.pmrem.dispose();
    this.bloomPass.dispose();
    this.composer.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  /* ------------------------------------------------------------ build ---- */

  /* procedural studio environment for glass reflections */
  private buildEnvironment(): THREE.Texture {
    const envScene = new THREE.Scene();
    envScene.add(new THREE.Mesh(
      new THREE.SphereGeometry(40, 32, 32),
      new THREE.MeshBasicMaterial({ color: 0x14100c, side: THREE.BackSide }),
    ));
    const panelGeo = new THREE.PlaneGeometry(24, 24);
    const panels = [
      { color: 0xffffff, intensity: 3,   pos: [0, 18, 6],   rot: [Math.PI / 2, 0, 0] },
      { color: 0xff8f42, intensity: 2.3, pos: [16, 4, 8],   rot: [0, -Math.PI / 3, 0] },
      { color: 0x9fd4ff, intensity: 2.6, pos: [-16, 2, -6], rot: [0, Math.PI / 3, 0] },
      { color: 0xffe6c2, intensity: 2,   pos: [0, -14, -8], rot: [-Math.PI / 2, 0, 0] },
    ];
    panels.forEach((p) => {
      const mat = new THREE.MeshBasicMaterial({ color: p.color });
      mat.color.multiplyScalar(p.intensity);
      const mesh = new THREE.Mesh(panelGeo, mat);
      mesh.position.set(p.pos[0], p.pos[1], p.pos[2]);
      mesh.rotation.set(p.rot[0], p.rot[1], p.rot[2]);
      envScene.add(mesh);
    });
    return this.pmrem.fromScene(envScene, 0.02).texture;
  }

  /* AMBIENT BACKGROUND PARTICLES — three depth bands (near / mid / far) */
  private buildParticles(): THREE.Points {
    const N = this.PARTICLE_COUNT;
    const positions = new Float32Array(N * 3);
    const colors = new Float32Array(N * 3);
    const cWarm = new THREE.Color(0xffd9b0), cGold = new THREE.Color(0xff7f1a), cTeal = new THREE.Color(0x54d9c6);
    let idx = 0;
    for (let li = 0; li < DEPTH_LAYERS.length; li++) {
      const layer = DEPTH_LAYERS[li];
      const layerCount = li === DEPTH_LAYERS.length - 1 ? N - idx : Math.round(N * layer.share);
      for (let k = 0; k < layerCount && idx < N; k++, idx++) {
        const i = idx;
        const r = layer.rMin + Math.random() * (layer.rMax - layer.rMin);
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(Math.random() * 2 - 1);
        const x = r * Math.sin(phi) * Math.cos(theta);
        const y = r * Math.sin(phi) * Math.sin(theta) * 0.7; // flatten slightly
        const z = r * Math.cos(phi) - 4;                     // biased behind the logo
        this.particleBase[i * 3] = x; this.particleBase[i * 3 + 1] = y; this.particleBase[i * 3 + 2] = z;
        this.particlePhase[i] = Math.random() * Math.PI * 2;
        this.particleTwinklePhase[i] = Math.random() * Math.PI * 2;
        this.particleTwinkleFreq[i] = 0.12 + Math.random() * 0.3; // slow, calm shimmer
        const depthT = (r - layer.rMin) / Math.max(1, layer.rMax - layer.rMin);
        this.particleBaseSize[i] = lerp(layer.sizeMax, layer.sizeMin, depthT) * (0.7 + 0.6 * Math.random());
        this.particleParallax[i] = layer.parallax;
        positions[i * 3] = x; positions[i * 3 + 1] = y; positions[i * 3 + 2] = z;
        const roll = Math.random();
        // more of the ambient field on the vivid orange stop, less on cream/teal
        const col = roll < 0.45 ? cWarm : roll < 0.90 ? cGold : cTeal;
        const dim = layer.colorMul * (0.85 + 0.3 * Math.random());
        colors[i * 3] = col.r * dim; colors[i * 3 + 1] = col.g * dim; colors[i * 3 + 2] = col.b * dim;
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(this.particleBaseSize.slice(), 1));

    const mat = new THREE.PointsMaterial({
      vertexColors: true,
      size: 0.05,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
      fog: true,
      blending: THREE.AdditiveBlending,
    });
    patchParticleMaterial(mat);
    return new THREE.Points(geo, mat);
  }

  private buildLogo(): void {
    const N = this.LOGO_PARTICLE_COUNT;
    const C = this.LOGO_COUNTS;
    const LOGO_DEPTH = 0.38;

    const logoPositions = new Float32Array(N * 3);
    sampleShapePoints(rightCrescent, C.rightCrescent, LOGO_DEPTH, logoPositions, 0);
    sampleShapePoints(leftCrescent, C.leftCrescent, LOGO_DEPTH, logoPositions, C.rightCrescent);
    sampleShapePoints(connector, C.connector, LOGO_DEPTH, logoPositions, C.rightCrescent + C.leftCrescent);

    /* COLOR — the crescents ported from the reference's own formula:
         const hue = 0.015 + 0.055 * (0.5 + 0.5*Math.sin(angle + time*flow*0.4));
         const light = 0.28 + 0.5 * (0.5 + 0.5*Math.sin(band*0.12 + angle*2.0));
         color.setHSL(hue, 1.0, light);
       i.e. HSL, saturation locked at 1.0, hue swept across a narrow 5°-25°
       red->orange band. The reference animates hue/lightness per particle's
       flight angle; ours are static, so each particle takes one fixed roll
       on the same ranges instead. Lightness pushed a touch brighter here so
       more of the mark clears the bloom threshold — a more prominent glow —
       without touching bloom's radius/strength globally (that's what caused
       the blur last time).
       The connector "I" is deliberately NOT on this ramp — light grey/white,
       near-zero saturation, so it reads as a distinct bright spine down the
       middle of the mark rather than blending into the orange crescents. */
    const CRESCENT_BASE = new THREE.Color(0xfe5e00); // exact brand hex
    const tmp = new THREE.Color();
    const logoColors = new Float32Array(N * 3);
    const connectorStart = C.rightCrescent + C.leftCrescent;

    /* two-tier sizes: ~78% fine dust, ~22% sparse glowing accent points —
       raised from 5% so there are visibly MORE bright/electric-orange points
       instead of a few standing out. Accent size capped much lower than
       before (was 1.5-2.4x, now 1.15-1.6x) — that oversized tier combined
       with bloom's mip-chain blur is what read as "big boxy" particles. */
    const sizeMul = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const isAccent = Math.random() > 0.78;
      sizeMul[i] = isAccent ? 1.15 + Math.random() * 0.45 : 0.28 + Math.pow(Math.random(), 2) * 0.4;
      if (i >= connectorStart) {
        // connector "I" — light grey/white, barely tinted warm, not orange
        const light = isAccent ? 0.72 + Math.random() * 0.14 : 0.55 + Math.random() * 0.2;
        tmp.setHSL(0.08, 0.05 + Math.random() * 0.05, light);
      } else {
        // both crescents — EXACTLY #fe5e00, varied only by intensity.
        // Scaling RGB preserves the hue/chroma ratio, so a dim particle is a
        // darker #fe5e00 and a hot one is a brighter #fe5e00 that bloom picks
        // up. (The previous HSL-lightness approach was the maroon/pink bug:
        // lightness below 0.5 muddied toward maroon, above 0.5 washed toward
        // salmon — almost nothing actually sat on the brand color.)
        const v = isAccent ? 1.15 + Math.random() * 0.55 : 0.62 + Math.random() * 0.38;
        tmp.copy(CRESCENT_BASE).multiplyScalar(v);
      }
      const w = i * 3;
      logoColors[w] = tmp.r; logoColors[w + 1] = tmp.g; logoColors[w + 2] = tmp.b;
    }


    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(logoPositions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(logoColors, 3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(sizeMul, 1));

    /* re-centre on the true bounding-box centre so it spins on its own axis */
    geo.computeBoundingBox();
    const center = new THREE.Vector3();
    geo.boundingBox!.getCenter(center);
    geo.translate(-center.x, -center.y, -center.z);
    geo.computeBoundingBox();
    geo.computeBoundingSphere();
    this.logoGeometry = geo;

    this.logoBasePositions = logoPositions.slice();
    this.logoSide = new Float32Array(N);
    for (let i = 0; i < N; i++) this.logoSide[i] = this.logoBasePositions[i * 3] < 0 ? -1 : 1;

    /* ORGANIC SWARM SETUP */
    this.logoSwarmOffset = new Float32Array(N * 3);
    this.logoSwarmDelay = new Float32Array(N);
    this.logoSwarmTurbPhase = new Float32Array(N);
    this.logoSwarmTurbFreq = new Float32Array(N);
    this.logoTwinklePhase = new Float32Array(N);
    this.logoTwinkleFreq = new Float32Array(N);
    this.logoBaseSizes = sizeMul.slice();
    this.logoScatterKeep = new Uint8Array(N);
    for (let i = 0; i < N; i++) {
      const w = i * 3;
      const th = Math.random() * Math.PI * 2;
      const ph = Math.acos(Math.random() * 2 - 1);
      const rad = Math.cbrt(Math.random());
      this.logoSwarmOffset[w]     = rad * Math.sin(ph) * Math.cos(th) * 0.55;
      this.logoSwarmOffset[w + 1] = rad * Math.sin(ph) * Math.sin(th) * 1.9;
      this.logoSwarmOffset[w + 2] = rad * Math.cos(ph) * 0.35;
      this.logoScatterKeep[i] = Math.random() < 0.45 ? 1 : 0;
      this.logoSwarmDelay[i] = Math.random() * 0.35;
      this.logoSwarmTurbPhase[i] = Math.random() * Math.PI * 2;
      this.logoSwarmTurbFreq[i] = 0.6 + Math.random() * 1.3;
      this.logoTwinklePhase[i] = Math.random() * Math.PI * 2;
      this.logoTwinkleFreq[i] = 0.15 + Math.random() * 0.35; // slow, calm shimmer
    }

    /* FORMATION + IDLE MOTION SETUP */
    this.logoStartPositions = new Float32Array(N * 3);
    this.logoIdlePhase = new Float32Array(N);
    this.logoIdleFreq = new Float32Array(N);
    this.logoIdleAmp = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const w = i * 3;
      const th = Math.random() * Math.PI * 2;
      const ph = Math.acos(Math.random() * 2 - 1);
      const dist = 18 + Math.random() * 20;
      this.logoStartPositions[w]     = this.logoBasePositions[w]     + dist * Math.sin(ph) * Math.cos(th);
      this.logoStartPositions[w + 1] = this.logoBasePositions[w + 1] + dist * Math.sin(ph) * Math.sin(th);
      this.logoStartPositions[w + 2] = this.logoBasePositions[w + 2] + dist * Math.cos(ph);
      this.logoIdlePhase[i] = Math.random() * Math.PI * 2;
      this.logoIdleFreq[i] = 0.18 + Math.random() * 0.3;
      this.logoIdleAmp[i] = 0.012 + Math.random() * 0.03;
    }

    /* Single pass only — real bloom (below) now does the glow, so the manual
       halo + corona sprite layers that used to fake it are gone. Keeping
       them alongside real bloom would double up and wash the mark out. */
    this.logoParticleMat = new THREE.PointsMaterial({
      vertexColors: true, size: 0.03, sizeAttenuation: true,
      transparent: true, opacity: 1.0, depthWrite: false, fog: false, blending: THREE.AdditiveBlending,
    });
    patchParticleMaterial(this.logoParticleMat);
    this.logoGroup.add(new THREE.Points(geo, this.logoParticleMat));
  }

  /* ------------------------------------------------------------ events --- */

  private onResize = (): void => {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setPixelRatio(balancedPixelRatio());
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    /* keep the post chain at the same resolution as the canvas; setSize
       propagates (width x pixelRatio) to every pass, bloom included — so the
       bloom cap must be re-applied AFTER it */
    this.composer.setPixelRatio(balancedPixelRatio());
    this.composer.setSize(window.innerWidth, window.innerHeight);
    this.capBloomSize();
  };

  /* The scene renders at full native resolution, but the bloom pass does not
     need to: its output is a soft low-frequency halo. Capping its internal
     render targets at ~1080p cuts the heaviest GPU cost on 4K panels with no
     visible difference in the glow. */
  private capBloomSize(): void {
    const pr = balancedPixelRatio();
    const w = Math.min(Math.round(window.innerWidth * pr), 2560);
    const h = Math.min(Math.round(window.innerHeight * pr), 1440);
    this.bloomPass.setSize(w, h);
  }

  private onMouseMove = (e: MouseEvent): void => {
    this.mouseTarget.x = (e.clientX / window.innerWidth - 0.5) * 2;
    this.mouseTarget.y = (e.clientY / window.innerHeight - 0.5) * 2;
  };

  private onVisibility = (): void => { this.tabIsVisible = !document.hidden; };

  /* -------------------------------------------------------- per frame ---- */

  /* Where a horizontal NDC position lands in world space on the z=0 plane,
     using the camera's CURRENT transform — keeps each swarm anchored to the
     same screen edge while the camera pans. */
  private screenEdgeWorldX(ndcX: number): number {
    const near = new THREE.Vector3(ndcX, 0, -1).unproject(this.camera);
    const far = new THREE.Vector3(ndcX, 0, 1).unproject(this.camera);
    const dir = far.sub(near).normalize();
    const tHit = (0 - near.z) / dir.z;
    return near.x + dir.x * tHit;
  }

  private updateCinematicSignature(t: number, driftAmt: number): { x: number; y: number } {
    const c = this.camDriftCurrent, g = this.camDriftTarget;
    c.rx = lerp(c.rx, g.rx, 0.02);
    c.ry = lerp(c.ry, g.ry, 0.02);
    c.speed = lerp(c.speed, g.speed, 0.02);
    return {
      x: Math.sin(t * 0.12 * c.speed) * c.rx * driftAmt,
      y: Math.cos(t * 0.09 * c.speed) * c.ry * driftAmt,
    };
  }

  /* AMBIENT FLOW FIELD — layered sine/cosine currents anchored to each
     particle's base position, swelling with scroll speed. */
  private updateAmbientField(t: number): void {
    this.particles.position.z = -this.scrollFrame.zoomZ;

    this.ambientFrameCounter++;
    if (this.ambientFrameCounter % PARTICLE_UPDATE_STRIDE !== 0) return;

    const PARALLAX_STRENGTH = 1.4;
    this.scrollSurge += (Math.min(Math.abs(this.scrollVelocity) * 14, 1) - this.scrollSurge) * 0.12;
    this.scrollVelocity *= 0.85;

    const flowAmp = 0.5 + this.scrollSurge * 0.85;
    const kick = 1 + this.scrollSurge * 0.3;
    const posAttr = this.particles.geometry.attributes.position as THREE.BufferAttribute;
    const arr = posAttr.array as Float32Array;
    const sizeAttr = this.particles.geometry.attributes.aSize as THREE.BufferAttribute;
    const sizeArr = sizeAttr.array as Float32Array;
    const mouse = this.mouse;
    for (let i = 0; i < this.PARTICLE_COUNT; i++) {
      const bx = this.particleBase[i * 3], by = this.particleBase[i * 3 + 1], bz = this.particleBase[i * 3 + 2];
      let fx = Math.sin(by * 0.35 + t * 0.45) + Math.cos(bz * 0.30 - t * 0.32);
      let fy = Math.sin(bz * 0.32 + t * 0.40) + Math.cos(bx * 0.27 + t * 0.28);
      let fz = Math.sin(bx * 0.30 - t * 0.36) + Math.cos(by * 0.34 + t * 0.42);
      fx += 0.4 * Math.sin(bx * 0.9  + by * 0.7  + t * 1.10 + this.particlePhase[i]);
      fy += 0.4 * Math.sin(by * 0.85 + bz * 0.75 - t * 0.95 + this.particlePhase[i]);
      fz += 0.3 * Math.cos(bx * 0.8  + bz * 0.9  + t * 1.05 + this.particlePhase[i]);
      const wave = Math.sin(bx * 0.22 - t * 0.7) * 0.8;
      arr[i * 3]     = bx * kick + fx * flowAmp * 0.45 + mouse.x * this.particleParallax[i] * PARALLAX_STRENGTH;
      arr[i * 3 + 1] = by * kick + fy * flowAmp * 0.45 + wave - mouse.y * this.particleParallax[i] * PARALLAX_STRENGTH;
      arr[i * 3 + 2] = bz * kick + fz * flowAmp * 0.35;
      sizeArr[i] = this.particleBaseSize[i] * (0.88 + 0.24 * (0.5 + 0.5 * Math.sin(t * this.particleTwinkleFreq[i] + this.particleTwinklePhase[i])));
    }
    posAttr.needsUpdate = true;
    sizeAttr.needsUpdate = true;
  }

  private animate = (): void => {
    if (this.destroyed) return;
    this.raf = requestAnimationFrame(this.animate);
    if (!this.tabIsVisible) return;
    const t = this.clock.getElapsedTime();

    /* While a product page is open the ambient field IS its backdrop, so it
       keeps animating — only the logo swarm and carousel work are skipped. */
    if (this.opts.isProductOpen()) {
      this.logoGroup.visible = false;
      this.updateAmbientField(t);
      this.composer.render();
      return;
    }
    this.logoGroup.visible = true;
    this.mouse.x = lerp(this.mouse.x, this.mouseTarget.x, 0.04);
    this.mouse.y = lerp(this.mouse.y, this.mouseTarget.y, 0.04);

    this.logoGroup.scale.setScalar(this.scrollFrame.scale);

    this.splitCurrent = lerp(this.splitCurrent, this.splitTarget, 0.08);
    this.logoGroup.position.y = (1 - this.splitCurrent) * 1.1;

    const formT = Math.min((t - this.formOrigin) / FORMATION_DURATION, 1);
    const formEase = easeOutCubic(formT);

    /* camera BEFORE the cluster edge calculation reads its transform */
    const cam = this.camera;
    cam.position.set(0, 0, this.scrollFrame.camZ);
    this.lookTarget.set(this.scrollFrame.look[0], this.scrollFrame.look[1], 0);
    const drift = this.updateCinematicSignature(t, 1 - this.splitCurrent);
    cam.position.x += drift.x;
    cam.position.y += drift.y;
    this.lookTarget.x += drift.x * 0.5;
    this.lookTarget.y += drift.y * 0.5;
    cam.lookAt(this.lookTarget);
    cam.updateMatrixWorld(true);

    const clusterScale = this.scrollFrame.scale || 1;
    const blobWorldHalfWidth = 0.62 * clusterScale;
    const panMargin = 0.3;
    const edgeTargetNdc = 0.94;
    const rightEdgeWorldX = this.screenEdgeWorldX(edgeTargetNdc);
    const leftEdgeWorldX = this.screenEdgeWorldX(-edgeTargetNdc);
    const clusterXRight = Math.max(1.2, rightEdgeWorldX - blobWorldHalfWidth - panMargin) / clusterScale;
    const clusterXLeft = Math.max(1.2, -leftEdgeWorldX - blobWorldHalfWidth - panMargin) / clusterScale;

    const posAttr = this.logoGeometry.attributes.position as THREE.BufferAttribute;
    const logoArr = posAttr.array as Float32Array;
    const sizeAttr = this.logoGeometry.attributes.aSize as THREE.BufferAttribute;
    const logoSizeArr = sizeAttr.array as Float32Array;
    const split = this.splitCurrent;
    for (let li = 0; li < this.LOGO_PARTICLE_COUNT; li++) {
      const lw = li * 3;
      const bx = lerp(this.logoStartPositions[lw],     this.logoBasePositions[lw],     formEase);
      const by = lerp(this.logoStartPositions[lw + 1], this.logoBasePositions[lw + 1], formEase);
      const bz = lerp(this.logoStartPositions[lw + 2], this.logoBasePositions[lw + 2], formEase);

      /* prominent idle life on the assembled mark */
      const n = t * this.logoIdleFreq[li] + this.logoIdlePhase[li];
      const swirlAngle = Math.sin(n) * 0.12 * formEase;
      const bob = Math.sin(n * 1.35) * this.logoIdleAmp[li] * 1.8 * formEase;
      const shimmer = 1 + Math.sin(n * 2.2) * 0.012 * formEase;
      const cosA = Math.cos(swirlAngle), sinA = Math.sin(swirlAngle);
      const sx = (bx * cosA - bz * sinA) * shimmer;
      const sz = (bx * sinA + bz * cosA) * shimmer;
      const sy = by * shimmer + bob;

      /* per-particle staggered swarm progress */
      let lp = (split - this.logoSwarmDelay[li]) / (1 - this.logoSwarmDelay[li]);
      lp = Math.min(Math.max(lp, 0), 1);
      const e = lp * lp * (3 - 2 * lp);

      const tx = (this.logoSide[li] === 1 ? clusterXRight : -clusterXLeft) + this.logoSwarmOffset[lw];
      const ty = this.logoSwarmOffset[lw + 1];
      const tz = this.logoSwarmOffset[lw + 2];

      /* turbulence peaks mid-flight */
      const bell = e * (1 - e) * 4;
      const tb = t * this.logoSwarmTurbFreq[li] + this.logoSwarmTurbPhase[li];
      const wob = 0.4 * bell;
      const wx = Math.sin(tb * 1.7) * wob;
      const wy = Math.cos(tb * 1.3) * wob;
      const wz = Math.sin(tb * 2.1) * wob * 0.5;

      /* settled clusters keep drifting gently */
      const driftX = Math.sin(tb * 0.5) * 0.07 * e;
      const driftY = Math.cos(tb * 0.42) * 0.09 * e;

      logoArr[lw]     = lerp(sx, tx, e) + wx + driftX;
      logoArr[lw + 1] = lerp(sy, ty, e) + wy + driftY;
      logoArr[lw + 2] = lerp(sz, tz, e) + wz;

      const scatterThin = this.logoScatterKeep[li] ? 1 : 1 - e * 0.88;
      logoSizeArr[li] = this.logoBaseSizes[li] * scatterThin * (0.92 + 0.2 * (0.5 + 0.5 * Math.sin(t * this.logoTwinkleFreq[li] + this.logoTwinklePhase[li])));
    }
    posAttr.needsUpdate = true;
    sizeAttr.needsUpdate = true;
    this.logoParticleMat.opacity = lerp(1.0, 0.6, split);
    this.opts.onSplit(split);

    this.updateAmbientField(t);
    this.composer.render();
  };
}
