/**
 * iOPEX gesture layer — MediaPipe hand tracking as a presentation input.
 *
 * CANONICAL COPY. A byte-identical copy lives at
 * digiaura-presentation/src/gesture-layer.js because the two surfaces are
 * separate projects with separate build roots. Keep them in sync:
 *
 *     diff ~/iopex-presenter/gesture-layer.js \
 *          ~/digiaura-presentation/src/gesture-layer.js
 *
 * Why not 5of12/MediaPipe-Playground: that repo is a ThreeJS demo collection
 * with no published package, and its pinch detection is spread across a service
 * provider tree coupled to its own renderer. What we need is a pointer, a pinch
 * gate and two poses — so this talks to Google's @mediapipe/tasks-vision
 * directly and owns the ~40 lines of gesture maths. Two ideas are worth keeping
 * from that repo though, and both are used below: anchor the pointer at the
 * thumb/index midpoint rather than the index tip, and normalise every distance
 * by hand scale so it works at any distance from the camera.
 *
 * Framework-agnostic on purpose, like voice-agent.js: the products page is a
 * static HTML file and the architecture deck is a React app. This owns its own
 * DOM, emits events, and never touches either page's internals — the host wires
 * gestures to actions.
 *
 * It has no dependency on the voice agent. Gestures work with the microphone
 * off and no ElevenLabs session at all, which is what makes them testable on
 * their own.
 */

const TASKS_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/+esm';
const WASM_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm';
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';

// MediaPipe hand landmark indices. Named because `lm[8]` in gesture maths is
// unreadable and quietly wrong when someone reorders an expression.
const WRIST = 0;
const THUMB_TIP = 4;
const INDEX_MCP = 5;
const INDEX_PIP = 6;
const INDEX_TIP = 8;
const MIDDLE_MCP = 9;
const MIDDLE_PIP = 10;
const MIDDLE_TIP = 12;
const RING_PIP = 14;
const RING_TIP = 16;
const PINKY_MCP = 17;
const PINKY_PIP = 18;
const PINKY_TIP = 20;

const DEFAULTS = {
  // Pinch thresholds are a fraction of hand scale, not pixels, so they hold
  // whether the presenter is a metre from the laptop or across the room.
  // Separate enter/exit values: a single threshold makes the mic gate chatter
  // on and off around the boundary, which on stage sounds like a fault.
  pinchOn: 0.38,
  pinchOff: 0.55,
  // A pose has to hold for this long before it fires. Fingers pass through
  // "fist" on the way to almost any other pose, so without this an open palm
  // reliably emits a spurious fist first.
  poseHoldMs: 180,
  // Landmarks are jittery at the pixel level. This is the smoothing factor for
  // the pointer: lower is smoother and laggier.
  pointerEase: 0.35,
  // Frames with no hand before we declare it lost. One dropped detection is
  // common and should not release a pinch mid-gesture.
  lostFrames: 6,
  mirror: true,
  numHands: 1,
};

/**
 * @param {object}   [opts]
 * @param {Function} [opts.onPoint]    ({x, y, pinching}) viewport coords, every frame a hand is seen
 * @param {Function} [opts.onPinch]    (true|false) pinch opened / closed, hysteresis applied
 * @param {Function} [opts.onPinchDrag]({dx, dy, scale}) movement while pinched
 * @param {Function} [opts.onPose]     ('open'|'fist'|'point') a settled pose change
 * @param {Function} [opts.onState]    ('idle'|'loading'|'running'|'lost'|'error', detail)
 * @param {boolean}  [opts.debug]      draw the camera feed and landmarks
 * @returns {object} imperative handle
 */
export function createGestureLayer(opts = {}) {
  const cfg = Object.assign({}, DEFAULTS, opts);
  const emit = (name, ...args) => {
    const fn = opts[name];
    if (typeof fn !== 'function') return;
    // A throwing handler must not kill the detection loop — the presenter would
    // lose all gestures because one binding had a bad selector.
    try { fn(...args); } catch (err) { console.warn('[gesture] ' + name, err); }
  };

  let landmarker = null;
  let video = null;
  let stream = null;
  let raf = 0;
  let state = 'idle';
  let destroyed = false;
  let lastVideoTime = -1;

  // Gesture state
  let pinching = false;
  let missing = 0;
  let pointer = null;          // eased {x, y} in viewport pixels
  let pose = null;             // settled pose
  let candidate = null;        // pose awaiting its hold time
  let candidateSince = 0;
  let dragFrom = null;         // pinch anchor: {x, y, spread}
  let seenAHand = false;       // has a hand ever been detected this session
  // Counters exist purely for diagnose(). "Gestures don't work" has half a dozen
  // distinct causes that look identical from the outside — no camera frames, a
  // model that never loaded, frames arriving but no hand found — and guessing
  // between them over chat is slower than just counting.
  let frames = 0;
  let detections = 0;
  let lastGrip = null;

  const debug = makeDebug(cfg.debug);

  let stateDetail = null;
  function setState(next, detail) {
    // Compare the detail too, not just the state name. Camera-request and
    // model-download are both "loading", so deduping on the name alone hid the
    // download entirely: the presenter watched "requesting camera" for eight
    // megabytes and reasonably concluded it was broken.
    if (state === next && stateDetail === (detail ?? null)) return;
    state = next;
    stateDetail = detail ?? null;
    emit('onState', next, detail);
  }

  /* --------------------------------------------------------------- maths --- */

  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

  /**
   * Hand scale: wrist to middle-finger knuckle. Every other measurement is
   * divided by this, which is what makes the thresholds distance-invariant —
   * the alternative is thresholds that only work at the distance you tuned them.
   */
  const handScale = (lm) => Math.max(1e-6, dist(lm[WRIST], lm[MIDDLE_MCP]));

  /** A finger is extended when its tip sits further from the wrist than its
   *  middle joint. Cheap, and robust to hand rotation in a way that comparing
   *  raw y-coordinates is not. */
  function extended(lm, tip, pip) {
    return dist(lm[WRIST], lm[tip]) > dist(lm[WRIST], lm[pip]) * 1.06;
  }

  function readPose(lm) {
    const index = extended(lm, INDEX_TIP, INDEX_PIP);
    const middle = extended(lm, MIDDLE_TIP, MIDDLE_PIP);
    const ring = extended(lm, RING_TIP, RING_PIP);
    const pinky = extended(lm, PINKY_TIP, PINKY_PIP);
    const count = index + middle + ring + pinky;
    if (count === 0) return 'fist';
    if (count >= 3) return 'open';
    if (index && !middle && !ring && !pinky) return 'point';
    return null; // in between: deliberately no pose rather than a wrong one
  }

  /* ---------------------------------------------------------------- loop --- */

  function frame() {
    if (destroyed) return;
    raf = requestAnimationFrame(frame);
    if (!landmarker || !video || video.readyState < 2) return;

    // detectForVideo throws if handed the same timestamp twice, and the render
    // loop runs faster than the camera produces frames.
    if (video.currentTime === lastVideoTime) return;
    lastVideoTime = video.currentTime;

    frames++;
    let result;
    try {
      result = landmarker.detectForVideo(video, performance.now());
    } catch (err) {
      // A single failed detection is not fatal; a broken model is, but that
      // surfaces at load time instead.
      return;
    }

    const lm = result && result.landmarks && result.landmarks[0];
    if (!lm) {
      if (++missing > cfg.lostFrames) {
        // Release a held pinch on hand loss. Leaving it latched would strand the
        // microphone open after the presenter drops their hand.
        if (pinching) { pinching = false; dragFrom = null; emit('onPinch', false); }
        pointer = null;
        // Reported whether or not a hand was ever seen. Only announcing this
        // after losing a hand meant a camera that never saw one at all looked
        // identical to a working layer, which is the worst thing to debug.
        setState('lost', seenAHand ? 'hand lost' : 'no hand seen yet');
        pose = candidate = null;
      }
      debug.draw(video, null, { mirror: cfg.mirror });
      return;
    }
    missing = 0;
    detections++;
    seenAHand = true;
    setState('running', 'tracking');

    const scale = handScale(lm);

    // Pointer anchor: the midpoint of thumb and index, which is where a person
    // feels their pinch to be. The index tip alone jumps several centimetres
    // the moment the fingers close.
    const anchor = {
      x: (lm[THUMB_TIP].x + lm[INDEX_TIP].x) / 2,
      y: (lm[THUMB_TIP].y + lm[INDEX_TIP].y) / 2,
    };
    // Normalised landmark space is the camera image, so it is mirrored relative
    // to the presenter facing the screen.
    const nx = cfg.mirror ? 1 - anchor.x : anchor.x;
    const px = nx * window.innerWidth;
    const py = anchor.y * window.innerHeight;
    pointer = pointer
      ? { x: pointer.x + (px - pointer.x) * cfg.pointerEase,
          y: pointer.y + (py - pointer.y) * cfg.pointerEase }
      : { x: px, y: py };

    /* ---- pinch, with hysteresis ---- */
    const grip = dist(lm[THUMB_TIP], lm[INDEX_TIP]) / scale;
    lastGrip = grip;
    if (!pinching && grip < cfg.pinchOn) {
      pinching = true;
      dragFrom = { x: pointer.x, y: pointer.y, spread: spreadOf(lm, scale) };
      emit('onPinch', true);
    } else if (pinching && grip > cfg.pinchOff) {
      pinching = false;
      dragFrom = null;
      emit('onPinch', false);
    }

    if (pinching && dragFrom) {
      const spread = spreadOf(lm, scale);
      emit('onPinchDrag', {
        dx: pointer.x - dragFrom.x,
        dy: pointer.y - dragFrom.y,
        // Ratio against the spread at pinch start, so 1 is "unchanged".
        scale: spread / Math.max(1e-6, dragFrom.spread),
      });
    }

    emit('onPoint', { x: pointer.x, y: pointer.y, pinching });

    /* ---- poses, with a hold time ---- */
    // Suppressed while pinching: a pinch reads as a fist to a finger-count
    // test, which would fire a step-change every time the mic gate opened.
    const now = performance.now();
    const seen = pinching ? null : readPose(lm);
    if (seen !== candidate) { candidate = seen; candidateSince = now; }
    if (seen && seen !== pose && now - candidateSince >= cfg.poseHoldMs) {
      pose = seen;
      emit('onPose', seen);
    }

    debug.draw(video, lm, { mirror: cfg.mirror, pinching, grip, pose, scale });
  }

  /** Distance across the knuckles — a proxy for how open the hand is, used as
   *  the zoom axis while pinch-dragging. */
  function spreadOf(lm, scale) {
    return dist(lm[INDEX_MCP], lm[PINKY_MCP]) / scale;
  }

  /* --------------------------------------------------------------- start --- */

  async function start() {
    if (state === 'loading' || state === 'running') return true;
    setState('loading', 'requesting camera');

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setState('error', 'This browser has no camera API. Needs https or localhost.');
      return false;
    }

    try {
      // getUserMedia does not reject when a permission prompt is simply never
      // answered — it stays pending forever, leaving the presenter looking at
      // "requesting camera" with no way to tell that nothing is coming. The
      // race gives up and says so. 20s is deliberately generous: a real person
      // hunting for the Allow button should not be cut off.
      let timedOut = false;
      stream = await Promise.race([
        navigator.mediaDevices.getUserMedia({
          video: { width: 640, height: 480, facingMode: 'user' },
        }).then((s) => {
          // Granted after we gave up: release it rather than leaving the
          // camera light on with nothing reading from it.
          if (timedOut || destroyed) { s.getTracks().forEach((t) => t.stop()); return null; }
          return s;
        }),
        new Promise((resolve) => setTimeout(() => { timedOut = true; resolve(null); }, 20000)),
      ]);
      if (!stream) {
        setState('error', 'No camera permission — allow it and press g again');
        return false;
      }
    } catch (err) {
      const msg = (err && err.name) || '';
      setState('error', /NotAllowed|Permission/i.test(msg)
        ? 'Camera blocked — allow it and retry'
        : /NotFound|Overconstrained/i.test(msg)
          ? 'No camera found'
          : (err && err.message) || 'Camera unavailable');
      return false;
    }

    video = document.createElement('video');
    video.playsInline = true;
    video.muted = true;
    video.srcObject = stream;
    await video.play().catch(() => {});

    try {
      setState('loading', 'loading hand model (~8MB, cached after first run)');
      const { HandLandmarker, FilesetResolver } = await import(/* @vite-ignore */ TASKS_URL);
      const fileset = await FilesetResolver.forVisionTasks(WASM_URL);
      landmarker = await HandLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: MODEL_URL, delegate: 'GPU' },
        runningMode: 'VIDEO',
        numHands: cfg.numHands,
      });
    } catch (err) {
      // Almost always the GPU delegate on a machine without WebGL2 — retry on
      // CPU before giving up, because CPU is fast enough for one hand.
      try {
        const { HandLandmarker, FilesetResolver } = await import(/* @vite-ignore */ TASKS_URL);
        const fileset = await FilesetResolver.forVisionTasks(WASM_URL);
        landmarker = await HandLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: MODEL_URL, delegate: 'CPU' },
          runningMode: 'VIDEO',
          numHands: cfg.numHands,
        });
      } catch (err2) {
        setState('error', 'Hand model failed to load: ' + ((err2 && err2.message) || err));
        stop();
        return false;
      }
    }

    debug.mount();
    seenAHand = false;
    frames = detections = 0;
    lastGrip = null;
    setState('running', 'armed — hold a hand up to the camera');
    raf = requestAnimationFrame(frame);
    return true;
  }

  function stop() {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    if (pinching) { pinching = false; emit('onPinch', false); }
    dragFrom = null;
    pointer = null;
    pose = candidate = null;
    lastVideoTime = -1;
    if (stream) { stream.getTracks().forEach((t) => t.stop()); stream = null; }
    if (video) { video.srcObject = null; video = null; }
    if (landmarker) { try { landmarker.close(); } catch { /* noop */ } landmarker = null; }
    debug.unmount();
    setState('idle');
  }

  function toggle() { return state === 'running' || state === 'loading' ? (stop(), false) : start(); }

  function destroy() { destroyed = true; stop(); }

  /**
   * Everything needed to tell the failure modes apart, in one object.
   *   stream false                -> camera never granted
   *   model false                 -> the 8MB download or wasm failed
   *   videoFrames 0               -> camera granted but producing nothing
   *   frames > 0, detections 0    -> pipeline runs, no hand found (framing,
   *                                  lighting, or hand out of shot)
   *   detections > 0, grip ~0.9   -> tracking fine, pinch simply not closing
   */
  function diagnose() {
    return {
      state,
      detail: stateDetail,
      stream: !!stream,
      model: !!landmarker,
      video: video ? { w: video.videoWidth, h: video.videoHeight, readyState: video.readyState } : null,
      frames,
      detections,
      handSeen: seenAHand,
      grip: lastGrip == null ? null : Math.round(lastGrip * 100) / 100,
      pinchOn: cfg.pinchOn,
      pinchOff: cfg.pinchOff,
      pinching,
      pose,
      secureContext: window.isSecureContext,
    };
  }

  return {
    start, stop, toggle, destroy, diagnose,
    state: () => state,
    isPinching: () => pinching,
    pointer: () => (pointer ? { ...pointer } : null),
    pose: () => pose,
    setDebug: (on) => debug.setEnabled(on),
    config: cfg,
  };
}

/* ------------------------------------------------------------------ debug --- */

/**
 * A corner preview with the landmarks drawn on it. This is the whole reason the
 * gesture layer can be tuned without a live agent: thresholds are meaningless
 * until you can see the hand the model is actually reading.
 */
function makeDebug(enabled) {
  let host = null;
  let canvas = null;
  let ctx = null;
  let on = !!enabled;

  function mount() {
    if (!on || host) return;
    host = document.createElement('div');
    host.style.cssText =
      'position:fixed;right:14px;bottom:14px;z-index:2147482100;width:220px;' +
      'border-radius:12px;overflow:hidden;border:1px solid rgba(120,200,215,.28);' +
      'box-shadow:0 10px 34px rgba(0,0,0,.5);background:#000;' +
      'font:10px ui-monospace,SFMono-Regular,Menlo,monospace;color:#B7C1CD;';
    canvas = document.createElement('canvas');
    canvas.width = 220; canvas.height = 165;
    canvas.style.cssText = 'display:block;width:220px;height:165px;';
    host.appendChild(canvas);
    ctx = canvas.getContext('2d');
    document.body.appendChild(host);
  }

  function unmount() {
    if (host) host.remove();
    host = null; canvas = null; ctx = null;
  }

  function draw(video, lm, info = {}) {
    if (!on || !ctx || !video) return;
    const w = canvas.width, h = canvas.height;
    ctx.save();
    if (info.mirror) { ctx.translate(w, 0); ctx.scale(-1, 1); }
    ctx.drawImage(video, 0, 0, w, h);
    ctx.restore();

    ctx.fillStyle = 'rgba(0,0,0,.55)';
    ctx.fillRect(0, h - 16, w, 16);
    ctx.fillStyle = lm ? (info.pinching ? '#38DFF0' : '#B7C1CD') : '#ff6b6b';
    ctx.fillText(
      lm
        ? `${info.pinching ? 'PINCH' : 'open '}  grip ${info.grip.toFixed(2)}  ${info.pose || '-'}`
        : 'no hand',
      6, h - 5
    );
    if (!lm) return;

    // Landmarks in the same mirrored space as the video, so they line up.
    const X = (p) => (info.mirror ? 1 - p.x : p.x) * w;
    const Y = (p) => p.y * h;
    const BONES = [
      [0, 1], [1, 2], [2, 3], [3, 4],
      [0, 5], [5, 6], [6, 7], [7, 8],
      [5, 9], [9, 10], [10, 11], [11, 12],
      [9, 13], [13, 14], [14, 15], [15, 16],
      [13, 17], [17, 18], [18, 19], [19, 20], [0, 17],
    ];
    ctx.strokeStyle = info.pinching ? 'rgba(56,223,240,.9)' : 'rgba(255,138,61,.8)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (const [a, b] of BONES) {
      ctx.moveTo(X(lm[a]), Y(lm[a]));
      ctx.lineTo(X(lm[b]), Y(lm[b]));
    }
    ctx.stroke();
    ctx.fillStyle = '#F2F5F9';
    for (const i of [4, 8, 12, 16, 20]) {
      ctx.beginPath();
      ctx.arc(X(lm[i]), Y(lm[i]), 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  return {
    mount, unmount, draw,
    setEnabled(next) {
      on = !!next;
      if (on) mount(); else unmount();
    },
  };
}
