/**
 * iOPEX gesture engine — MediaPipe GestureRecognizer as a presentation remote.
 *
 * One camera, two hands, live the moment the model is loaded (no wake gesture):
 *
 *   one hand:   open-palm sweep ← → ↑ ↓      → swipe
 *               thumbs up (short hold)       → select / click
 *               fist (hold)                  → home
 *               one finger (hold)            → pause the voice agent
 *               two fingers (hold)           → start / continue the voice agent
 *   two hands:  both pinch, spread / close   → zoom in / out (nothing else fires)
 *
 * Classification is MediaPipe's canned gesture model (Closed_Fist, Open_Palm,
 * Pointing_Up, Victory, Thumb_Up …) cross-checked against finger geometry
 * (gestureMath.ts), so a low-confidence frame never fires anything and a
 * confident one is verified. Every hold gesture needs a HOLD and then a
 * RELEASE before it can fire again — one physical gesture, one event.
 *
 * Framework-agnostic: owns the camera and the model, draws into whatever
 * preview canvas the host attaches, emits typed events. Never touches the page.
 */
import { GestureRecognizer, type Category } from '@mediapipe/tasks-vision';
// The wasm runtime must match the installed JS bundle exactly, so it is served
// from the package itself (Vite copies these as hashed assets).
import wasmLoaderUrl from '@mediapipe/tasks-vision/vision_wasm_internal.js?url';
import wasmBinaryUrl from '@mediapipe/tasks-vision/vision_wasm_internal.wasm?url';
import {
  HoldTracker, classify, clamp, detectSwipe, grip, handScale, palmCenter, pinchAnchor,
  WRIST, type LM, type Pose, type Sample, type SwipeDir,
} from './gestureMath';

export type { Pose, SwipeDir } from './gestureMath';

type WasmFileset = Parameters<typeof GestureRecognizer.createFromOptions>[0];
const WASM_FILESET: WasmFileset = { wasmLoaderPath: wasmLoaderUrl, wasmBinaryPath: wasmBinaryUrl };
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task';

export type HoldGesture = 'home' | 'select' | 'voicePause' | 'voiceResume';
export type Gesture = HoldGesture;
export type Phase = 'off' | 'loading' | 'active' | 'error';

export interface ZoomEvent {
  /** Absolute zoom factor, ≥ 1. */
  scale: number;
  /** Midpoint between the two pinches, viewport pixels. */
  x: number;
  y: number;
  /** false on the frame the pinch is released. */
  active: boolean;
}

export interface HudFrame {
  phase: Phase;
  hands: number;
  /** Settled pose of the primary hand, or null. */
  pose: Pose | null;
  /** Hold gesture currently in progress and its 0–1 progress. */
  holding: HoldGesture | null;
  holdProgress: number;
  zooming: boolean;
  zoom: number;
}

export interface GestureEngineOptions {
  onPhase?: (phase: Phase, detail?: string) => void;
  onGesture?: (g: Gesture) => void;
  onSwipe?: (dir: SwipeDir) => void;
  onZoom?: (z: ZoomEvent) => void;
  /** Once per processed camera frame — cheap, drive the HUD from it. */
  onFrame?: (f: HudFrame) => void;
  /** Zoom the engine should continue from when a pinch starts. */
  currentZoom?: () => number;
  width?: number;
  height?: number;
  mirror?: boolean;
}

export interface GestureEngineHandle {
  start(): Promise<boolean>;
  stop(): void;
  destroy(): void;
  phase(): Phase;
  /** Draw the mirrored camera frame + landmarks into this canvas every frame. */
  attachPreview(canvas: HTMLCanvasElement | null): void;
  diagnose(): Record<string, unknown>;
}

/* ------------------------------------------------------------- tuning ----
   Tuned for speed on stage. Every number here is a latency the presenter
   feels, so they sit just above the point where false positives appear. */

export const TUNING = {
  /** Classifier score below which we rely on geometry alone. */
  classifierMin: 0.55,
  /** Pinch on/off as a fraction of hand scale (hysteresis). */
  pinchOn: 0.42,
  pinchOff: 0.60,
  /** Hold durations, ms. Thumbs up is the "click", so it is the quickest; fist
   *  is the longest because it leaves the deck. */
  hold: { home: 800, select: 320, voicePause: 500, voiceResume: 420 } as Record<HoldGesture, number>,
  holdGapMs: 140,
  refireGapMs: 350,
  swipe: { windowMs: 380, dist: 0.16, openRatio: 0.5, wobble: 0.03 },
  swipeCooldownMs: 480,
  lostFrames: 6,
  zoomMin: 1,
  zoomMax: 3,
  zoomEase: 0.4,
  zoomSnap: 1.06,
};
const T = TUNING;

const POSE_TO_HOLD: Record<Pose, HoldGesture | null> = {
  fist: 'home',
  thumbsUp: 'select',
  one: 'voicePause',
  two: 'voiceResume',
  open: null,
};

type VideoWithVFC = HTMLVideoElement & {
  requestVideoFrameCallback?: (cb: () => void) => number;
  cancelVideoFrameCallback?: (id: number) => void;
};

/* --------------------------------------------------------------- engine --- */

export function createGestureEngine(opts: GestureEngineOptions = {}): GestureEngineHandle {
  const mirror = opts.mirror ?? true;
  const emit = <A extends unknown[]>(fn: ((...a: A) => void) | undefined, name: string) => (...a: A) => {
    if (!fn) return;
    try { fn(...a); } catch (err) { console.warn('[gesture] ' + name, err); }
  };
  const onPhase = emit(opts.onPhase, 'onPhase');
  const onGesture = emit(opts.onGesture, 'onGesture');
  const onSwipe = emit(opts.onSwipe, 'onSwipe');
  const onZoom = emit(opts.onZoom, 'onZoom');
  const onFrame = emit(opts.onFrame, 'onFrame');

  let recognizer: GestureRecognizer | null = null;
  let video: VideoWithVFC | null = null;
  let stream: MediaStream | null = null;
  let raf = 0;
  let vfc = 0;
  let running = false;
  let phase: Phase = 'off';
  let phaseDetail: string | null = null;
  let destroyed = false;
  let lastVideoTime = -1;

  let preview: HTMLCanvasElement | null = null;
  let pctx: CanvasRenderingContext2D | null = null;

  let missing = 0;
  let frames = 0, detections = 0;
  let pose: Pose | null = null;

  const holds = new HoldTracker<Pose, HoldGesture>(POSE_TO_HOLD, { hold: T.hold, gapMs: T.holdGapMs, refireGapMs: T.refireGapMs });
  let motion: Sample[] = [];
  let swipeCooldownUntil = 0;
  let swipeArmed = true;

  let pinch: [boolean, boolean] = [false, false];
  let zooming = false;
  let zoomStartDist = 0;
  let zoomStart = 1;
  let zoomTarget = 1;
  let zoom = 1;
  let zoomMid = { x: 0.5, y: 0.5 };

  function setPhase(next: Phase, detail?: string): void {
    if (phase === next && phaseDetail === (detail ?? null)) return;
    phase = next;
    phaseDetail = detail ?? null;
    onPhase(next, detail);
  }

  function resetGestureState(): void {
    pose = null;
    holds.reset();
    motion = [];
    pinch = [false, false];
    swipeArmed = true;
    if (zooming) { zooming = false; onZoom({ scale: zoom, x: 0, y: 0, active: false }); }
  }

  /* ------------------------------------------------------------ zoom ----- */

  function trackZoom(hands: LM[]): void {
    for (let i = 0; i < 2; i++) {
      const g = grip(hands[i]);
      if (!pinch[i] && g < T.pinchOn) pinch[i] = true;
      else if (pinch[i] && g > T.pinchOff) pinch[i] = false;
    }
    const both = pinch[0] && pinch[1];
    const aspect = video ? video.videoWidth / Math.max(1, video.videoHeight) : 4 / 3;
    const a = pinchAnchor(hands[0]), b = pinchAnchor(hands[1]);
    const d = Math.hypot((a.x - b.x) * aspect, a.y - b.y);
    if (both && !zooming) {
      zooming = true;
      zoomStartDist = Math.max(0.02, d);
      zoomStart = opts.currentZoom ? opts.currentZoom() : zoom;
      zoom = zoomTarget = zoomStart;
    } else if (!both && zooming) {
      endZoom();
      return;
    }
    if (zooming) {
      zoomTarget = clamp(zoomStart * (d / zoomStartDist), T.zoomMin, T.zoomMax);
      zoom += (zoomTarget - zoom) * T.zoomEase;
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      zoomMid = { x: mirror ? 1 - mx : mx, y: my };
      onZoom({ scale: zoom, x: zoomMid.x * window.innerWidth, y: zoomMid.y * window.innerHeight, active: true });
    }
  }

  function endZoom(): void {
    zooming = false;
    if (zoom < T.zoomSnap) zoom = zoomTarget = 1;
    onZoom({ scale: zoom, x: zoomMid.x * window.innerWidth, y: zoomMid.y * window.innerHeight, active: false });
  }

  /* ------------------------------------------------------------ frame ---- */

  function process(): void {
    if (destroyed || !running || !recognizer || !video || video.readyState < 2) return;
    if (video.currentTime === lastVideoTime) return;
    lastVideoTime = video.currentTime;
    frames++;

    let result;
    try {
      result = recognizer.recognizeForVideo(video, performance.now());
    } catch {
      return;
    }
    const now = performance.now();
    const hands = (result.landmarks ?? []) as LM[];
    const cats = result.gestures ?? [];

    if (!hands.length) {
      if (++missing > T.lostFrames && (pose || zooming || motion.length)) resetGestureState();
      draw(hands, [], null);
      onFrame({ phase, hands: 0, pose: null, holding: null, holdProgress: 0, zooming: false, zoom });
      return;
    }
    missing = 0;
    detections++;

    // Primary hand: the larger one on screen (closer to the camera).
    let primary = 0;
    if (hands.length > 1 && handScale(hands[1]) > handScale(hands[0])) primary = 1;
    const lm = hands[primary];
    const cat: Category | undefined = cats[primary]?.[0];
    const seen = classify(lm, cat?.categoryName, cat?.score ?? 0, T.classifierMin);
    pose = seen;

    let holding: HoldGesture | null = null;
    let holdProgress = 0;

    if (hands.length >= 2) {
      // Two hands on screen = zoom mode only. Forming a pinch passes through
      // poses that look like "open" or "fist"; none of that may fire here.
      holds.reset();
      motion = [];
      trackZoom(hands);
    } else {
      if (zooming) endZoom();
      pinch = [false, false];

      /* ---- holds (thumbs up = click) ---- */
      const h = holds.update(seen, now);
      if (h.fired) onGesture(h.fired);
      holding = h.holding; holdProgress = h.progress;

      /* ---- swipes ---- */
      const c = palmCenter(lm);
      const aspect = video.videoWidth / Math.max(1, video.videoHeight);
      motion.push({ x: c.x * aspect, y: c.y, t: now, pose: seen });
      if (motion.length > 60) motion.shift();
      if (!holding && !h.fired) {
        if (swipeArmed && now >= swipeCooldownUntil) {
          const dir = detectSwipe(motion, now, { ...T.swipe, mirror });
          if (dir) {
            onSwipe(dir);
            swipeCooldownUntil = now + T.swipeCooldownMs;
            swipeArmed = false;
            motion = [];
          }
        } else if (!swipeArmed && (seen !== 'open' || now >= swipeCooldownUntil)) {
          swipeArmed = true; // re-arm once the hand closes or the cooldown passes
        }
      }
    }

    draw(hands, cats, seen);
    onFrame({ phase, hands: hands.length, pose: seen, holding, holdProgress, zooming, zoom });
  }

  function loop(): void {
    if (destroyed || !running) return;
    // requestVideoFrameCallback runs once per camera frame — no wasted work
    // between frames. Fall back to rAF + the currentTime guard in process().
    if (video?.requestVideoFrameCallback) {
      vfc = video.requestVideoFrameCallback(() => { process(); loop(); });
    } else {
      raf = requestAnimationFrame(() => { process(); loop(); });
    }
  }

  /* --------------------------------------------------------- preview ----- */

  const BONES: [number, number][] = [
    [0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8], [5, 9], [9, 10], [10, 11], [11, 12],
    [9, 13], [13, 14], [14, 15], [15, 16], [13, 17], [17, 18], [18, 19], [19, 20], [0, 17],
  ];

  function draw(hands: LM[], cats: Category[][], seen: Pose | null): void {
    if (!preview || !pctx || !video) return;
    const w = preview.width, h = preview.height;
    const ctx = pctx;
    ctx.save();
    if (mirror) { ctx.translate(w, 0); ctx.scale(-1, 1); }
    ctx.drawImage(video, 0, 0, w, h);
    ctx.restore();
    const X = (p: { x: number }) => (mirror ? 1 - p.x : p.x) * w;
    const Y = (p: { y: number }) => p.y * h;
    hands.forEach((lm, hi) => {
      const pinched = zooming && pinch[hi];
      ctx.strokeStyle = pinched ? 'rgba(51,216,194,.95)' : seen && hands.length === 1 ? 'rgba(255,138,31,.95)' : 'rgba(242,102,28,.85)';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      for (const [a, b] of BONES) { ctx.moveTo(X(lm[a]), Y(lm[a])); ctx.lineTo(X(lm[b]), Y(lm[b])); }
      ctx.stroke();
      ctx.fillStyle = '#F2F5F9';
      for (const i of [4, 8, 12, 16, 20]) { ctx.beginPath(); ctx.arc(X(lm[i]), Y(lm[i]), 2.4, 0, Math.PI * 2); ctx.fill(); }
      const c = cats[hi]?.[0];
      if (c && c.categoryName !== 'None') {
        ctx.font = '10px ui-monospace, Menlo, monospace';
        ctx.fillStyle = 'rgba(255,255,255,.85)';
        ctx.fillText(`${c.categoryName} ${(c.score * 100) | 0}%`, clamp(X(lm[WRIST]) - 20, 4, w - 90), clamp(Y(lm[WRIST]) + 14, 12, h - 4));
      }
    });
    if (zooming && hands.length >= 2) {
      const a = pinchAnchor(hands[0]), b = pinchAnchor(hands[1]);
      ctx.strokeStyle = 'rgba(51,216,194,.9)'; ctx.lineWidth = 1.2;
      ctx.setLineDash([4, 4]);
      ctx.beginPath(); ctx.moveTo(X(a), Y(a)); ctx.lineTo(X(b), Y(b)); ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  /* ----------------------------------------------------------- start ----- */

  async function loadModel(delegate: 'GPU' | 'CPU'): Promise<GestureRecognizer> {
    return GestureRecognizer.createFromOptions(WASM_FILESET, {
      baseOptions: { modelAssetPath: MODEL_URL, delegate },
      runningMode: 'VIDEO',
      numHands: 2,
      minHandDetectionConfidence: 0.55,
      minHandPresenceConfidence: 0.55,
      minTrackingConfidence: 0.5,
    });
  }

  async function start(): Promise<boolean> {
    if (phase === 'loading' || phase === 'active') return true;
    setPhase('loading', 'requesting camera');

    if (!navigator.mediaDevices?.getUserMedia) {
      setPhase('error', 'This browser has no camera API. Needs https or localhost.');
      return false;
    }
    // Camera and model load in parallel — the model is the slow half on a
    // first run, and there is no reason to wait for the permission prompt
    // before starting the download.
    const modelPromise = loadModel('GPU').catch(() => loadModel('CPU'));
    modelPromise.catch(() => {}); // handled below; keeps an early failure from being "unhandled"
    try {
      let timedOut = false;
      stream = await Promise.race([
        navigator.mediaDevices.getUserMedia({
          video: { width: opts.width ?? 640, height: opts.height ?? 480, facingMode: 'user', frameRate: { ideal: 30 } },
          audio: false,
        }).then((s) => {
          if (timedOut || destroyed) { s.getTracks().forEach((t) => t.stop()); return null; }
          return s;
        }),
        new Promise<null>((resolve) => setTimeout(() => { timedOut = true; resolve(null); }, 20000)),
      ]);
      if (!stream) { setPhase('error', 'No camera permission — allow it and try again'); return false; }
    } catch (err) {
      const e = err as { name?: string; message?: string };
      const name = e?.name || '';
      setPhase('error', /NotAllowed|Permission/i.test(name) ? 'Camera blocked — allow it and retry'
        : /NotFound|Overconstrained/i.test(name) ? 'No camera found' : e?.message || 'Camera unavailable');
      return false;
    }

    video = document.createElement('video');
    video.playsInline = true;
    video.muted = true;
    video.srcObject = stream;
    await video.play().catch(() => {});

    try {
      setPhase('loading', 'loading gesture model (~8MB, cached after first run)');
      recognizer = await modelPromise;
    } catch (err) {
      setPhase('error', 'Gesture model failed to load: ' + ((err as Error)?.message || String(err)));
      stopInternal(false);
      return false;
    }
    if (destroyed || (phase as Phase) === 'off') { stopInternal(true); return false; }

    frames = detections = 0;
    lastVideoTime = -1;
    resetGestureState();
    running = true;
    setPhase('active', 'ready');
    loop();
    return true;
  }

  function stopInternal(setOff: boolean): void {
    running = false;
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    if (vfc && video?.cancelVideoFrameCallback) video.cancelVideoFrameCallback(vfc);
    vfc = 0;
    resetGestureState();
    if (stream) { stream.getTracks().forEach((t) => t.stop()); stream = null; }
    if (video) { video.srcObject = null; video = null; }
    if (recognizer) { try { recognizer.close(); } catch { /* noop */ } recognizer = null; }
    if (pctx && preview) pctx.clearRect(0, 0, preview.width, preview.height);
    if (setOff) setPhase('off');
  }

  return {
    start,
    stop: () => stopInternal(true),
    destroy() { destroyed = true; stopInternal(true); },
    phase: () => phase,
    attachPreview(canvas) {
      preview = canvas;
      pctx = canvas ? canvas.getContext('2d') : null;
    },
    diagnose: () => ({
      phase, detail: phaseDetail, stream: !!stream, model: !!recognizer,
      video: video ? { w: video.videoWidth, h: video.videoHeight, readyState: video.readyState } : null,
      frames, detections, pose, zooming, zoom, secureContext: window.isSecureContext,
    }),
  };
}
