/**
 * iOPEX voice guide — a live ElevenLabs agent rendered as an animated humanoid
 * bust standing above the "Ask the guide" pill — a stack of 3D cross-sections
 * that turns, nods and talks.
 *
 * CANONICAL COPY. A byte-identical copy lives at
 * digiaura-presentation/src/voice-agent.js because the two surfaces are separate
 * projects with separate build roots. Keep them in sync:
 *
 *     diff ~/iopex-presenter/voice-agent.js \
 *          ~/digiaura-presentation/src/voice-agent.js
 *
 * Why not the <elevenlabs-convai> widget: the widget is a closed web component
 * whose only visual surface is two orb colours, an avatar image and its text
 * labels — it cannot be reshaped into the deck's HUD language. The SDK exposes
 * what a real visualiser needs instead: getOutputByteFrequencyData() while the
 * agent speaks, getInputByteFrequencyData() while it listens, and onModeChange
 * to switch between the two.
 *
 * Framework-agnostic on purpose: the products page is a static HTML file and the
 * architecture deck is a React app, so this owns its own DOM and exposes an
 * imperative handle. The React side just mounts and unmounts it.
 */

const SDK_URL = 'https://cdn.jsdelivr.net/npm/@elevenlabs/client@1.25.0/+esm';

const DEFAULT_PALETTE = {
  amber: '#FFC845',
  cyan: '#19A7FF',
  orange: '#FF6B00',
  ink: '#BCEBFF',
  muted: '#91A9BC',
  ground: 'rgba(12,11,14,.86)',
  hair: 'rgba(25,167,255,.20)',
};

const STATE_LABEL = {
  idle: 'Ask the guide',
  connecting: 'Connecting',
  listening: 'Listening',
  speaking: 'Speaking',
  thinking: 'Thinking',
  error: 'Unavailable',
};

/**
 * @param {object}   opts
 * @param {string}   opts.agentId            public ElevenLabs agent id
 * @param {object}   [opts.tools]            client tools, name -> handler
 * @param {object}   [opts.dynamicVariables] prompt variables resolved at call start
 * @param {object}   [opts.palette]          colour overrides
 * @param {Element}  [opts.container]        defaults to document.body
 * @param {Function} [opts.onState]          state notifications for the host page
 * @returns {{start:Function, stop:Function, toggle:Function, setMicMuted:Function,
 *            say:Function, state:Function, destroy:Function}}
 */
export function createVoiceAgent(opts) {
  const agentId = opts.agentId;
  const palette = Object.assign({}, DEFAULT_PALETTE, opts.palette);
  const tools = opts.tools || {};
  const host = opts.container || document.body;
  const onState = opts.onState || function () {};
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let conversation = null;
  let state = 'idle';
  let raf = 0;
  let destroyed = false;
  let micMuted = false;

  /* ------------------------------------------------------------- timings --- */

  // Latency probe. Off unless asked for, because the numbers are only useful
  // while tuning and a client pitch does not want console noise.
  //   ?debug=voice  or  window.IOPEX_VOICE_DEBUG = true
  const DEBUG = /(^|[?&])debug=voice(&|$)/.test(location.search) ||
    !!window.IOPEX_VOICE_DEBUG;
  const timings = { replies: [], tools: [] };
  // When the client's voice last dropped below the speaking threshold. This is
  // the only honest zero point for "how long until it answered": the SDK has no
  // end-of-turn event, but we already sample input level 20x a second.
  let quietSince = 0;
  let speakingSince = 0;

  function logTiming(kind, ms, label) {
    const row = { ms: Math.round(ms), at: Date.now(), label };
    (kind === 'tool' ? timings.tools : timings.replies).push(row);
    if (DEBUG) {
      console.log(`[voice] ${kind === 'tool' ? 'tool ' + label : 'reply'}: ${row.ms}ms`);
    }
  }

  // Smoothed levels: raw frequency data is jittery, and a figure that jitters
  // reads as broken rather than alive.
  let level = 0;
  let levelTarget = 0;
  let spectrum = new Uint8Array(0);
  let phase = 0;

  // One eased value per ring. Frequency bins land on a ring and then decay
  // towards it, which is what turns a flickering readout into a body that
  // ripples when the guide talks.
  const RINGS = 30;
  const RING_SEGS = 22;
  const ringLevel = new Float32Array(RINGS);

  // Distance from the eye to the model origin, in figure heights. Short enough
  // that the near side of the head is visibly larger than the far side, long
  // enough that the shoulders don't fish-eye.
  const FOCAL = 2.3;

  // Where the mouth sits down the figure. Everything that reads as speech —
  // the frequency mapping, the jaw swell, the emitted rings — hangs off this.
  const MOUTH = 0.325;

  // Rings of speech leaving the mouth, and the level of the previous frame,
  // which is how a syllable's rising edge is detected.
  const PULSE_LIFE = 0.85;
  const pulses = [];
  let lastPulse = 0;
  let prevLevel = 0;

  /* ---------------------------------------------------------------- DOM ---- */

  const root = document.createElement('div');
  root.className = 'iopex-voice';
  root.setAttribute('role', 'complementary');
  root.setAttribute('aria-label', 'Voice guide');

  const style = document.createElement('style');
  style.textContent = `
    .iopex-voice{
      position:fixed; left:50%; bottom:28px; transform:translateX(-50%);
      z-index:2147482000; display:flex; align-items:center; gap:12px;
      padding:9px 10px; border-radius:999px;
      background:${palette.ground}; border:1px solid ${palette.hair};
      backdrop-filter:blur(18px) saturate(1.25);
      box-shadow:0 10px 40px rgba(0,0,0,.5), inset 0 1px 0 rgba(255,255,255,.04);
      font-family:ui-monospace,'SF Mono',SFMono-Regular,Menlo,Consolas,monospace;
      cursor:pointer; user-select:none;
      /* Positioned: the figure hangs above the pill as an absolute child. */
      padding:9px 18px;
      transition:padding .4s cubic-bezier(.2,.8,.2,1), gap .4s cubic-bezier(.2,.8,.2,1),
                 border-color .4s ease, box-shadow .4s ease;
    }
    .iopex-voice.is-live{ padding:9px 12px 9px 18px; }
    .iopex-voice.is-listening{ border-color:${hexA(palette.cyan, .3)};
      box-shadow:0 10px 40px rgba(0,0,0,.5), 0 0 0 1px ${hexA(palette.cyan, .07)}; }
    .iopex-voice.is-speaking{ border-color:${hexA(palette.amber, .3)};
      box-shadow:0 10px 40px rgba(0,0,0,.5), 0 0 0 1px ${hexA(palette.amber, .07)}; }
    .iopex-voice:focus-visible{ outline:2px solid ${palette.cyan}; outline-offset:3px; }

    /* The guide is a bust standing on the pill, not a chip inside it, so it is
       absolutely positioned and overflows upwards. pointer-events:none keeps
       the whole widget one click target — the pill. */
    .iopex-voice canvas.figure{
      position:absolute; left:50%; bottom:calc(100% + 6px);
      transform:translateX(-50%); width:118px; height:108px;
      display:block; pointer-events:none;
      /* The chest is cropped by the canvas edge, so it is faded out rather than
         cut: a hard line across the torso reads as a rendering bug, a fade
         reads as the bust resolving out of the dark. */
      -webkit-mask-image:linear-gradient(to bottom, #000 88%, transparent 100%);
      mask-image:linear-gradient(to bottom, #000 88%, transparent 100%);
      transition:width .4s cubic-bezier(.2,.8,.2,1), height .4s cubic-bezier(.2,.8,.2,1);
    }
    .iopex-voice.is-live canvas.figure{ width:132px; height:122px; }

    /* The text column is the widget's only variable-width part, so it owns the
       ellipsis. Without the min-width:0 a long agent line stretches the pill
       off the edge of a 16:9 projector. */
    .iopex-voice .vtext{ display:flex; flex-direction:column; gap:2px;
      min-width:0; justify-content:center; }
    .iopex-voice .vstate{
      font-size:9.5px; letter-spacing:.18em; text-transform:uppercase;
      color:${palette.muted}; white-space:nowrap; line-height:1.2;
    }
    .iopex-voice.is-speaking .vstate{ color:${palette.amber}; }
    .iopex-voice.is-listening .vstate{ color:${palette.cyan}; }
    .iopex-voice.is-error .vstate{ color:#ff6b6b; }
    /* Hidden rather than empty: an always-present hint row leaves a dead gap
       under the state label between the agent's lines. */
    .iopex-voice .vhint{
      font-size:10px; letter-spacing:.01em; line-height:1.3;
      color:${palette.ink}; opacity:.55; white-space:nowrap;
      max-width:260px; overflow:hidden; text-overflow:ellipsis;
    }
    .iopex-voice .vhint:empty{ display:none; }

    .iopex-voice .vend{
      appearance:none; border:1px solid ${palette.hair}; background:transparent;
      color:${palette.muted}; border-radius:50%; width:22px; height:22px;
      padding:0; font:inherit; font-size:13px; line-height:1;
      cursor:pointer; display:none; flex:none; align-items:center;
      justify-content:center; transition:color .2s ease, border-color .2s ease,
      background .2s ease;
    }
    .iopex-voice.is-live .vend{ display:flex; }
    .iopex-voice .vend:hover{ color:#fff; border-color:#ff6b6b;
      background:rgba(255,107,107,.14); }

    @media (prefers-reduced-motion: reduce){
      .iopex-voice, .iopex-voice canvas.figure{ transition:none; }
    }
  `;

  const figure = document.createElement('canvas');
  figure.className = 'figure';
  figure.setAttribute('aria-hidden', 'true');

  const text = document.createElement('div');
  text.className = 'vtext';
  const stateEl = document.createElement('div');
  stateEl.className = 'vstate';
  stateEl.textContent = STATE_LABEL.idle;
  const hintEl = document.createElement('div');
  hintEl.className = 'vhint';
  text.append(stateEl, hintEl);

  const endBtn = document.createElement('button');
  endBtn.className = 'vend';
  endBtn.type = 'button';
  endBtn.textContent = '\u00d7';
  endBtn.title = 'End call';
  endBtn.setAttribute('aria-label', 'End call');

  root.append(style, figure, text, endBtn);
  host.appendChild(root);

  /* ------------------------------------------------------------ painting --- */

  // Sized to the device pixel ratio so the figure doesn't go soft on a retina
  // projector — at 54px a blurred bust stops reading as a person at all.
  const fctx = figure.getContext('2d');

  function fit(canvas, ctx) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const box = canvas.getBoundingClientRect();
    if (!box.width || !box.height) return false;
    canvas.width = Math.round(box.width * dpr);
    canvas.height = Math.round(box.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return true;
  }

  /**
   * The canvas changes CSS size mid-flight: the figure grows 54 -> 66px wide
   * when a call goes live, and that is a CSS transition, so the size moves over
   * ~400ms rather than in one step. The backing store has to follow. Resizing
   * only on window resize leaves the bitmap at the old size while the paint
   * code draws to the new one, and everything past the old width is clipped —
   * which shows up as the shoulders being sliced off mid-stroke.
   */
  const ro = 'ResizeObserver' in window
    ? new ResizeObserver(() => fit(figure, fctx))
    : null;
  if (ro) ro.observe(figure);

  function accent() {
    if (state === 'error') return '#ff6b6b';
    return palette.cyan;
  }

  /**
   * Voice lives in the low bins: at a 48kHz sample rate each bin of the SDK's
   * FFT is roughly 20Hz, so a speaking human is almost entirely inside the
   * first ~90 bins and everything above is silence. Reading the whole spectrum
   * therefore paints a flat line with one blip in it. `band` clamps to the part
   * that actually moves, and `tilt` compensates for formants being quieter
   * than the fundamental so the top of the band still registers.
   */
  function bandValue(t) {
    const len = spectrum.length;
    if (!len) return 0;
    const band = Math.max(8, Math.floor(len * 0.09));
    // Skipping the first bins is deliberate: bin 0 is DC and bin 1 is below the
    // vocal fundamental, so mapping the centre bar to them puts a permanent
    // notch down the centre of the figure.
    const bin = Math.min(len - 1, 3 + Math.floor(Math.pow(t, 1.35) * band));
    const tilt = 1 + t * 1.6;
    return Math.min(1, (spectrum[bin] / 255) * tilt);
  }

  /**
   * The bust is a stack of horizontal cross-sections in model space — x right,
   * y down from the crown, z towards the viewer — normalised so the figure is
   * exactly 1 unit tall. Rings rather than a mesh because the reference is
   * contour lines: the surface is only ever implied by them, and a ring drawn
   * as a projected ellipse carries depth on its own, which a flat scan line
   * cannot.
   *
   * Proportions are the standard bust ones. In head-heights the head is 0.44 of
   * the figure, the neck runs to 0.58, the shoulders top out there and reach
   * full width by 0.82, and biacromial width is ~2.2 head widths. Guessing
   * these is what turns a bust into a chess pawn.
   *
   * @param {number} t 0 at the crown, 1 at the crop across the chest
   * @returns {{rx:number, rz:number, dz:number}} half width, half depth, and
   *   how far forward of the spine this section sits
   */
  function section(t) {
    // Head: an ellipsoid, slightly deeper than it is wide, as a skull is.
    const hy = (t - 0.215) / 0.235;
    if (hy < 1) {
      const k = Math.sqrt(Math.max(0, 1 - hy * hy));
      return { rx: 0.162 * k, rz: 0.182 * k, dz: 0.022 };
    }
    // Neck: a short column set back from the face.
    if (t < 0.52) return { rx: 0.060, rz: 0.066, dz: -0.005 };
    // Shoulders. Smoothstep, not a power curve: the trapezius leaves the neck
    // almost flat, turns over the deltoid and then holds, so the near edge of
    // the ring traces a real shoulder line instead of a cone.
    // The trapezius slopes off the neck and the deltoid caps it, so full width
    // arrives partway down and then holds — the widest point is the shoulder,
    // not the crop. A ramp that keeps widening all the way to the bottom edge
    // is what makes a bust read as a bell.
    const e = Math.pow(Math.min(1, (t - 0.52) / 0.24), 0.75);
    // Depth stays well under half the width. A torso as deep as it is broad
    // projects to a stack of near-circles, which reads as a barrel, not a
    // chest — the shoulders only look like shoulders while the rings are flat.
    return { rx: 0.060 + (0.50 - 0.060) * e, rz: 0.066 + (0.13 - 0.066) * e, dz: -0.02 * e };
  }

  function paintFigure() {
    const box = figure.getBoundingClientRect();
    const w = box.width, h = box.height;
    if (!w || !h) return;
    fctx.clearRect(0, 0, w, h);
    const col = accent();
    const live = spectrum.length > 0;

    // Ground. The figure is emitted light on a transparent canvas, so wherever
    // the page behind it is bright — a product screenshot, white display type —
    // it washes out and the bust vanishes. The pill solves this for its own text
    // with an opaque ground; this is that same ground, shaped as a soft ellipse
    // so it has no edge to notice.
    //
    // Painted here rather than as a backdrop-filtered element behind the canvas:
    // .iopex-voice already carries a backdrop-filter, which makes it a backdrop
    // root, so a descendant's own backdrop-filter has nothing behind it to
    // filter and silently does nothing.
    // Sized to reach zero alpha exactly at the canvas edge. Any larger and the
    // canvas clips the gradient mid-falloff, which puts a straight dark edge
    // across the page — far more noticeable than the problem it fixes.
    fctx.save();
    fctx.translate(w / 2, h / 2);
    fctx.scale(1, h / w);
    const wash = fctx.createRadialGradient(0, 0, 0, 0, 0, w / 2);
    wash.addColorStop(0, 'rgba(9,9,12,.92)');
    wash.addColorStop(0.45, 'rgba(9,9,12,.84)');
    wash.addColorStop(0.72, 'rgba(9,9,12,.50)');
    wash.addColorStop(1, 'rgba(9,9,12,0)');
    fctx.fillStyle = wash;
    fctx.beginPath();
    fctx.arc(0, 0, w / 2, 0, Math.PI * 2);
    fctx.fill();
    fctx.restore();

    // Idle still breathes. A figure that freezes between questions reads as a
    // broken image rather than as a guide waiting to be asked something.
    const breathe = reduce ? 0 : (Math.sin(phase * 1.3) * 0.5 + 0.5) * 0.10;
    const energy = Math.min(1, level * 1.15 + breathe);

    // Model -> screen. One scale for both axes, so the proportions survive the
    // 78 -> 96px growth when a call goes live, and the fit is against width as
    // well as height because the shoulders are the widest thing here.
    const S = Math.min(h * 1.02, w / 1.12);
    const cx = w / 2;
    const cy = h * 0.52;

    // The head turns and nods; the chest follows at a third of the angle,
    // because a bust that swivels as one block reads as a rotating statue.
    // Speech drives both on top of the idle sway, which is most of what makes
    // it look like it is talking rather than lip-syncing in place.
    const sway = reduce ? 0 : Math.sin(phase * 0.55) * 0.30 + Math.sin(phase * 0.23) * 0.12;
    const yawHead = reduce ? 0 : sway + Math.sin(phase * 2.35) * level * 0.26;
    const yawBody = yawHead * 0.34;
    const pitch = reduce ? 0 : Math.sin(phase * 0.8) * 0.045 + Math.sin(phase * 3.1) * level * 0.09;
    const HEAD_PIVOT = 0.50;   // base of the neck: what the head swings about
    const PIVOT = 0.46;        // what the camera is centred on

    const cosP = Math.cos(pitch), sinP = Math.sin(pitch);

    // Voice energy stays inside the figure, as in the reference. The silhouette
    // remains blue; yellow and orange only illuminate the face, throat and chest.
    const speakingAura = state === 'speaking';
    const auraDrive = speakingAura ? Math.min(1, .22 + level * 1.6) : .055;

    /**
     * One point on a ring, through pitch (head only), yaw, and perspective.
     * @returns {[number, number, number]} screen x, screen y, model depth
     */
    function project(rx, rz, dz, y, a, head) {
      let X = rx * Math.cos(a);
      let Z = dz + rz * Math.sin(a);
      let Y = y;
      if (head) {
        const dy = Y - HEAD_PIVOT;
        Y = HEAD_PIVOT + dy * cosP - Z * sinP;
        Z = dy * sinP + Z * cosP;
      }
      const yaw = head ? yawHead : yawBody;
      const cw = Math.cos(yaw), sw = Math.sin(yaw);
      const X2 = X * cw + Z * sw;
      const Z2 = -X * sw + Z * cw;
      const k = FOCAL / (FOCAL - Z2);
      return [cx + X2 * S * k, cy + (Y - PIVOT) * S * k, Z2];
    }

    function arc(rx, rz, dz, y, a0, a1, head) {
      fctx.beginPath();
      for (let j = 0; j <= RING_SEGS; j++) {
        const p = project(rx, rz, dz, y, a0 + (a1 - a0) * (j / RING_SEGS), head);
        if (j) fctx.lineTo(p[0], p[1]); else fctx.moveTo(p[0], p[1]);
      }
      fctx.stroke();
    }

    function cubicPoint(p0, p1, p2, p3, t) {
      const mt = 1 - t;
      return {
        x: mt * mt * mt * p0.x + 3 * mt * mt * t * p1.x + 3 * mt * t * t * p2.x + t * t * t * p3.x,
        y: mt * mt * mt * p0.y + 3 * mt * mt * t * p1.y + 3 * mt * t * t * p2.y + t * t * t * p3.y,
      };
    }

    // A softly shaded volume sits beneath the scanning contours. The older
    // contour-only figure read as a symbol at this size; this underpainting
    // gives the skull, jaw, neck and shoulders enough mass to read as a person.
    const faceShift = Math.sin(yawHead) * S * 0.035;
    const headX = cx + faceShift;
    const headY = cy + (0.22 - PIVOT) * S + pitch * S * 0.08;
    const headW = S * 0.32;
    const headH = S * 0.43;
    const jawOpen = reduce ? 0 : level * S * 0.022;

    fctx.save();
    const torsoShade = fctx.createLinearGradient(cx - S * .43, 0, cx + S * .43, 0);
    torsoShade.addColorStop(0, hexA(palette.cyan, .025));
    torsoShade.addColorStop(.42, hexA(palette.cyan, .13 + energy * .06));
    torsoShade.addColorStop(.72, hexA(col, .10 + energy * .08));
    torsoShade.addColorStop(1, hexA(palette.cyan, .02));
    fctx.fillStyle = torsoShade;
    fctx.beginPath();
    fctx.moveTo(cx - S * .50, cy + S * .48);
    fctx.bezierCurveTo(cx - S * .49, cy + S * .25, cx - S * .21, cy + S * .14, cx - S * .075, cy + S * .12);
    fctx.lineTo(cx - S * .06, cy + S * .015);
    fctx.bezierCurveTo(cx - S * .19, cy - S * .07, cx - S * .20, cy - S * .34, headX, cy - S * .47);
    fctx.bezierCurveTo(cx + S * .20, cy - S * .34, cx + S * .19, cy - S * .07, cx + S * .06, cy + S * .015);
    fctx.lineTo(cx + S * .075, cy + S * .12);
    fctx.bezierCurveTo(cx + S * .21, cy + S * .14, cx + S * .49, cy + S * .25, cx + S * .50, cy + S * .48);
    fctx.closePath();
    fctx.fill();

    const skin = fctx.createRadialGradient(
      headX - headW * .16, headY - headH * .12, headW * .03,
      headX, headY, headH * .72
    );
    skin.addColorStop(0, hexA(speakingAura ? palette.amber : col, .30 + energy * .24));
    skin.addColorStop(.34, hexA(speakingAura ? palette.orange : palette.cyan, .13 + auraDrive * .20));
    skin.addColorStop(.72, hexA(palette.cyan, .10));
    skin.addColorStop(1, hexA(palette.cyan, .015));
    fctx.fillStyle = skin;
    fctx.beginPath();
    fctx.ellipse(headX, headY, headW * .49, headH * .52 + jawOpen, yawHead * .08, 0, Math.PI * 2);
    fctx.fill();
    fctx.restore();

    // The voice core glows from within the faceless volume. It warms while the
    // guide speaks but never escapes as a surrounding ring.
    const face = project(0, 0.182, 0.022, 0.235, Math.PI / 2, true);
    const fr = S * 0.15;
    const glow = fctx.createRadialGradient(face[0], face[1], 0, face[0], face[1], fr);
    glow.addColorStop(0, hexA(speakingAura ? palette.amber : palette.ink, 0.30 + auraDrive * 0.42));
    glow.addColorStop(0.42, hexA(speakingAura ? palette.orange : palette.cyan, 0.16 + auraDrive * 0.25));
    glow.addColorStop(1, hexA(palette.cyan, 0));
    fctx.save();
    fctx.translate(face[0], face[1]);
    fctx.scale(1, 1.4);          // an oval: a circle here reads as a setting sun
    fctx.fillStyle = glow;
    fctx.beginPath();
    fctx.arc(0, 0, fr, 0, Math.PI * 2);
    fctx.fill();
    fctx.restore();

    // No outer framing rings: the body contour and particles define the aura.
    const hc = cy + (0.215 - PIVOT) * S;

    // The body. Back half dim and front half doubled — a wide soft pass under a
    // thin bright one — is what reads as emitted light wrapping a solid, and it
    // is far cheaper than a shadowBlur on every stroke.
    fctx.lineCap = 'round';
    for (let i = 0; i < RINGS; i++) {
      const t = (i + 0.5) / RINGS;
      const sec = section(t);
      if (sec.rx < 0.006) continue;
      const head = t < 0.52;
      // Preserve the reference's circular facial contours, but leave the torso
      // free of horizontal bands so its anatomy can be described by veins.
      if (!head) continue;

      // Distance from the mouth picks the frequency band, so low bins land on
      // the mouth and higher ones roll out to the crown and the shoulders. A
      // spoken vowel therefore travels through the body instead of scaling the
      // whole figure at once.
      const d = Math.min(1, Math.abs(t - MOUTH) * 2.4);
      const target = live
        ? bandValue(d)
        : reduce ? 0.05 : 0.10 + Math.sin(phase * 2.1 - d * 3.0) * 0.06;
      // Fast attack, slow release: the standard visualiser envelope. A single
      // symmetric ease makes speech look like it is lagging behind the audio.
      const ease = target > ringLevel[i] ? 0.5 : 0.12;
      ringLevel[i] += (target - ringLevel[i]) * ease;

      // The jaw opens. Rings below the mouth drop and the ones above lift a
      // little, which prises a real gap open across the face; swelling the
      // rings instead just inflates the skull into a lantern. Everything else
      // only trembles — spread evenly it reads as the bust shivering.
      const mouth = Math.exp(-Math.pow((t - MOUTH) / 0.075, 2));
      const open = reduce ? 0 : ringLevel[i] * mouth * (t > MOUTH ? 0.032 : -0.010);
      const swell = 1 + ringLevel[i] * (0.03 + mouth * 0.10);
      const chest = head ? 1 : 1 + breathe * 0.5 + level * 0.04;
      const y = t + open +
        (reduce ? 0 : Math.sin(phase * 5.6 + i * 0.8) * ringLevel[i] * 0.005 * (0.4 + mouth));

      // Keep every circular contour blue. Warm voice energy is an inner light,
      // never an outline or an external ring.
      const inFace = t > 0.215 && t < 0.425;
      const tint = inFace ? palette.ink : palette.cyan;
      const bright = Math.min(0.95, (inFace ? 0.58 : 0.42) + ringLevel[i] * 0.45);

      // Near half of the ring, in screen terms. Ignoring the ring's own depth
      // offset here is deliberate: this is the half facing the camera, and the
      // ring's distance is already carried by its brightness.
      const yaw = head ? yawHead : yawBody;
      const phi = Math.atan2(sec.rz * cosP * Math.cos(yaw), -sec.rx * Math.sin(yaw));
      const rx = sec.rx * swell, rz = sec.rz * swell * chest;

      fctx.strokeStyle = hexA(tint, bright * 0.22);
      fctx.lineWidth = 2.6;
      arc(rx, rz, sec.dz, y, phi - Math.PI / 2, phi + Math.PI / 2, head);

      fctx.strokeStyle = hexA(tint, bright);
      fctx.lineWidth = 1.15;
      arc(rx, rz, sec.dz, y, phi - Math.PI / 2, phi + Math.PI / 2, head);

      fctx.strokeStyle = hexA(tint, bright * 0.26);
      fctx.lineWidth = 0.9;
      arc(rx, rz, sec.dz, y, phi + Math.PI / 2, phi + Math.PI * 1.5, head);
    }
    fctx.lineCap = 'butt';

    // Fine blue energy fibres sit inside the chest volume. They follow the soft
    // sweep of the pectoral muscle instead of tracing clavicles or ribs, and all
    // endpoints remain below and inside the visible shoulder silhouette.
    const veinPaths = [];
    const veinLayout = [
      // Staggered origins avoid a skeletal fan. Nested, downward-turning arcs
      // read as muscle fibres wrapping over a broad chest.
      { sx: .030, sy: .245, c1x: .080, c1y: .225, c2x: .165, c2y: .205, ex: .275, ey: .220 },
      { sx: .038, sy: .275, c1x: .105, c1y: .255, c2x: .245, c2y: .245, ex: .380, ey: .285 },
      { sx: .046, sy: .310, c1x: .125, c1y: .292, c2x: .285, c2y: .305, ex: .425, ey: .355 },
      { sx: .055, sy: .350, c1x: .135, c1y: .345, c2x: .260, c2y: .385, ex: .355, ey: .435 },
    ];
    for (let side = -1; side <= 1; side += 2) {
      for (let i = 0; i < veinLayout.length; i++) {
        const line = veinLayout[i];
        veinPaths.push({
          p0: { x: cx + side * S * line.sx, y: cy + S * line.sy },
          p1: { x: cx + side * S * line.c1x, y: cy + S * line.c1y },
          p2: { x: cx + side * S * line.c2x, y: cy + S * line.c2y },
          p3: { x: cx + side * S * line.ex, y: cy + S * line.ey },
          offset: (i / veinLayout.length + (side > 0 ? .5 : 0)) % 1,
        });
      }
    }
    fctx.save();
    fctx.lineCap = 'round';
    fctx.globalCompositeOperation = 'lighter';
    for (const vein of veinPaths) {
      const traceVein = () => {
        fctx.beginPath();
        fctx.moveTo(vein.p0.x, vein.p0.y);
        fctx.bezierCurveTo(vein.p1.x, vein.p1.y, vein.p2.x, vein.p2.y, vein.p3.x, vein.p3.y);
      };

      // Layered offset, translucent body and pinpoint highlight give each
      // fibre a rounded, dimensional cross-section without making it thick.
      fctx.save();
      fctx.translate(0, .75);
      fctx.strokeStyle = hexA('#031728', .46);
      fctx.lineWidth = 2.15;
      traceVein();
      fctx.stroke();
      fctx.restore();

      fctx.shadowColor = hexA(palette.cyan, .38 + energy * .30);
      fctx.shadowBlur = 3.5 + energy * 4;
      fctx.strokeStyle = hexA(palette.cyan, .18 + energy * .18);
      fctx.lineWidth = 1.55;
      traceVein();
      fctx.stroke();

      const veinLight = fctx.createLinearGradient(vein.p0.x, vein.p0.y, vein.p3.x, vein.p3.y);
      veinLight.addColorStop(0, hexA(palette.ink, .18 + energy * .12));
      veinLight.addColorStop(.48, hexA(palette.cyan, .62 + energy * .22));
      veinLight.addColorStop(1, hexA(palette.ink, .24 + energy * .14));
      fctx.shadowBlur = 0;
      fctx.strokeStyle = veinLight;
      fctx.lineWidth = .62;
      traceVein();
      fctx.stroke();

      fctx.strokeStyle = hexA(palette.ink, .52 + energy * .20);
      fctx.lineWidth = .22;
      fctx.setLineDash([S * .055, S * .035]);
      fctx.lineDashOffset = speakingAura && !reduce ? -phase * S * .12 : 0;
      traceVein();
      fctx.stroke();
      fctx.setLineDash([]);

      if (speakingAura) {
        const travel = reduce ? .55 : (phase * (.62 + level * .36) + vein.offset) % 1;
        const packet = cubicPoint(vein.p0, vein.p1, vein.p2, vein.p3, travel);
        const packetGlow = fctx.createRadialGradient(packet.x, packet.y, 0, packet.x, packet.y, S * .035);
        packetGlow.addColorStop(0, hexA(palette.amber, .72 + level * .22));
        packetGlow.addColorStop(.35, hexA(palette.orange, .42 + level * .22));
        packetGlow.addColorStop(1, hexA(palette.orange, 0));
        fctx.fillStyle = packetGlow;
        fctx.beginPath();
        fctx.arc(packet.x, packet.y, S * .035, 0, Math.PI * 2);
        fctx.fill();
        fctx.fillStyle = hexA(palette.amber, .82 + level * .16);
        fctx.beginPath();
        fctx.arc(packet.x - .35, packet.y - .35, .58 + level * .36, 0, Math.PI * 2);
        fctx.fill();
      }
    }
    fctx.restore();

    // A compact inner energy field replaces the previous neck/body strands.
    // Its soft overlapping pools imply energy moving down through the chest
    // without introducing any vertical linework.
    fctx.save();
    fctx.globalCompositeOperation = 'lighter';
    const cores = [
      { x: 0, y: -.06, rx: .105, ry: .17, warm: 1 },
      { x: -.034, y: .15, rx: .052, ry: .085, warm: .68 },
      { x: .034, y: .15, rx: .052, ry: .085, warm: .68 },
      { x: 0, y: .35, rx: .095, ry: .075, warm: .50 },
    ];
    for (const core of cores) {
      const gx = cx + S * core.x;
      const gy = cy + S * core.y;
      const radius = S * core.ry;
      const inner = fctx.createRadialGradient(gx, gy, 0, gx, gy, radius);
      inner.addColorStop(0, hexA(speakingAura ? palette.amber : palette.ink, (.12 + auraDrive * .46) * core.warm));
      inner.addColorStop(.46, hexA(speakingAura ? palette.orange : palette.cyan, (.07 + auraDrive * .25) * core.warm));
      inner.addColorStop(1, hexA(palette.orange, 0));
      fctx.fillStyle = inner;
      fctx.beginPath();
      fctx.ellipse(gx, gy, S * core.rx, radius, 0, 0, Math.PI * 2);
      fctx.fill();
    }
    fctx.restore();

    // Rising syllables now intensify the internal light; no emitted rings.
    prevLevel = level;

    // Speaking-only particles skim the outer body contour, making the silhouette
    // glow without enclosing it in a ring.
    if (!reduce && speakingAura) {
      const particleCount = 48;
      for (let i = 0; i < particleCount; i++) {
        const travel = (phase * (.28 + level * .16) + i / particleCount) % 1;
        const upper = i % 3 !== 0;
        const side = i % 2 ? 1 : -1;
        const theta = travel * Math.PI;
        const mx = upper
          ? cx + side * S * (.17 + Math.sin(theta) * .035)
          : cx + side * S * (.08 + travel * .36);
        const my = upper
          ? hc + Math.cos(theta) * S * .22
          : cy + S * (.14 + Math.sin(travel * Math.PI * .62) * .25);
        const edgeFade = Math.sin(travel * Math.PI);
        const warm = i % 9 === 0;
        fctx.shadowBlur = 4 + level * 5;
        fctx.shadowColor = warm ? palette.orange : palette.cyan;
        fctx.fillStyle = hexA(warm ? palette.amber : palette.cyan, edgeFade * (.30 + energy * .58));
        fctx.beginPath();
        fctx.arc(mx, my, .55 + (i % 4) * .20, 0, Math.PI * 2);
        fctx.fill();
      }
      fctx.shadowBlur = 0;
    }

    // Connecting is the one state with no audio to visualise, so it gets a real
    // progress sweep — an arc, not a dashed ring, which would be
    // indistinguishable from the flanking arcs above.
    if (state === 'connecting') {
      const a = phase * 3.4;
      fctx.strokeStyle = hexA(col, 0.85);
      fctx.lineWidth = 1.5;
      fctx.lineCap = 'round';
      fctx.beginPath();
      fctx.arc(cx, hc, S * 0.37, a, a + Math.PI * 0.5);
      fctx.stroke();
      fctx.lineCap = 'butt';
    }
  }

  function frame(ts) {
    if (destroyed) return;
    phase = (ts || 0) / 1000;
    level += (levelTarget - level) * 0.18;
    paintFigure();
    raf = requestAnimationFrame(frame);
  }

  /* -------------------------------------------------------------- polling -- */

  // The SDK exposes frequency data as an async pull, not a stream, so sample it
  // on an interval rather than per animation frame — 20/s is plenty for a
  // visualiser and keeps headroom for the diagram and (later) hand tracking.
  let sampler = 0;

  function startSampling() {
    stopSampling();
    sampler = setInterval(async () => {
      if (!conversation) return;
      try {
        const data = state === 'speaking'
          ? await conversation.getOutputByteFrequencyData()
          : await conversation.getInputByteFrequencyData();
        if (!data || !data.length) return;
        spectrum = data;
        // Averaged over the voice band only — dividing by the full bin count
        // buries the signal under hundreds of silent high bins and leaves the
        // figure barely reacting to a normal speaking voice.
        const band = Math.max(8, Math.floor(data.length * 0.09));
        let sum = 0;
        for (let i = 0; i < band; i++) sum += data[i];
        levelTarget = Math.min(1, (sum / band) / 88);

        // Mark the moment the room goes quiet while we are listening. Reset it
        // whenever the client speaks again, so the timestamp always refers to
        // the end of their most recent utterance rather than the first pause.
        if (state === 'listening') {
          if (levelTarget > 0.06) quietSince = 0;
          else if (!quietSince) quietSince = performance.now();
        }
      } catch {
        // A pull can fail while the session is tearing down; the visual just
        // decays to idle rather than throwing every 50ms.
        spectrum = new Uint8Array(0);
        levelTarget = 0;
      }
    }, 50);
  }

  function stopSampling() {
    if (sampler) clearInterval(sampler);
    sampler = 0;
    spectrum = new Uint8Array(0);
    levelTarget = 0;
    ringLevel.fill(0);
    pulses.length = 0;
    prevLevel = 0;
  }

  /* ---------------------------------------------------------------- state -- */

  function setState(next, hint) {
    state = next;
    stateEl.textContent = STATE_LABEL[next] || next;
    if (hint !== undefined) hintEl.textContent = hint;
    root.classList.toggle('is-live', next !== 'idle' && next !== 'error');
    root.classList.toggle('is-speaking', next === 'speaking');
    root.classList.toggle('is-listening', next === 'listening');
    root.classList.toggle('is-error', next === 'error');
    onState(next);
  }

  /* ---------------------------------------------------------------- tools -- */

  // Handlers are wrapped so a thrown error or rejected promise reaches the agent
  // as something it can speak over, instead of stalling the conversation.
  function wrapTools() {
    const out = {};
    Object.keys(tools).forEach((name) => {
      out[name] = (params) => {
        const explain = (err) =>
          'That did not work: ' + ((err && err.message) || 'unknown error') +
          '. Tell the client and carry on.';
        // Timed because a slow handler stalls the whole turn: the agent cannot
        // start its second inference until the client tool has answered.
        const t0 = performance.now();
        const done = (v) => { logTiming('tool', performance.now() - t0, name); return v; };
        try {
          const r = tools[name](params || {});
          return r && typeof r.then === 'function'
            ? r.then(done, (e) => done(explain(e)))
            : done(r);
        } catch (err) {
          return done(explain(err));
        }
      };
    });
    return out;
  }

  /* -------------------------------------------------------------- session -- */

  async function start() {
    if (conversation || state === 'connecting') return;
    if (!agentId) {
      setState('error', 'No agent id configured');
      return;
    }
    setState('connecting', 'Allow microphone access');

    try {
      // Dynamic import so this file works unbuilt in a plain HTML page and
      // inside Vite without adding a dependency. @vite-ignore keeps Vite from
      // trying to pre-bundle a remote URL.
      const { Conversation } = await import(/* @vite-ignore */ SDK_URL);

      conversation = await Conversation.startSession({
        agentId,
        connectionType: 'webrtc',
        dynamicVariables: opts.dynamicVariables || {},
        clientTools: wrapTools(),
        onModeChange: ({ mode }) => {
          if (state === 'idle' || state === 'error') return;
          if (mode === 'speaking') {
            speakingSince = performance.now();
            // Everything between the client falling silent and the first audio
            // frame: turn detection, RAG retrieval, LLM inference (twice over,
            // on a turn that calls a tool) and TTS start-up.
            if (quietSince) logTiming('reply', performance.now() - quietSince, 'reply');
            quietSince = 0;
          }
          setState(mode === 'speaking' ? 'speaking' : 'listening', '');
        },
        onStatusChange: ({ status }) => {
          if (status === 'disconnected') teardown();
        },
        onMessage: ({ message, source }) => {
          // Show the agent's line under the state label — useful on a projector
          // where the room can read along, and invaluable when debugging.
          if (source === 'ai' && message) hintEl.textContent = message;
          // Under ?debug=voice, transcript and tool calls share one timeline.
          // That is what answers "why didn't the page move?": a line of
          // narration with no tool call logged after it means the agent never
          // asked for one, which is a prompt problem, not a page problem.
          if (DEBUG && message) console.log(`[voice] ${source === 'ai' ? 'agent' : 'client'}: ${message}`);
          // The host gets the transcript too. The products page uses it to
          // follow the guide to whatever it has started talking about, so the
          // screen keeps up even on a turn where the agent forgot to move it.
          if (opts.onMessage) {
            try { opts.onMessage({ message, source }); } catch { /* host hook is optional */ }
          }
        },
        onError: (err) => {
          setState('error', (err && err.message) || 'Connection failed');
        },
      });

      if (micMuted) await conversation.setMicMuted(true);
      setState('listening', '');
      startSampling();
    } catch (err) {
      conversation = null;
      const msg = (err && err.message) || String(err);
      // The overwhelmingly common causes are a denied mic prompt and an
      // insecure origin, so name them rather than surfacing a raw error.
      setState('error', /permission|denied|NotAllowed/i.test(msg)
        ? 'Microphone blocked — allow it and retry'
        : /secure|https/i.test(msg)
          ? 'Needs https or localhost'
          : msg);
    }
  }

  function teardown() {
    stopSampling();
    conversation = null;
    setState('idle', '');
  }

  async function stop() {
    stopSampling();
    const c = conversation;
    conversation = null;
    setState('idle', '');
    if (c) { try { await c.endSession(); } catch { /* already gone */ } }
  }

  function toggle() { return conversation ? stop() : start(); }

  async function setMicMuted(muted) {
    micMuted = !!muted;
    if (conversation) { try { await conversation.setMicMuted(micMuted); } catch { /* noop */ } }
    if (conversation) setState(micMuted ? 'thinking' : 'listening', micMuted ? 'Mic muted' : '');
    return micMuted;
  }

  /** Feed the agent context without the client hearing a question asked. */
  function say(message) {
    if (!conversation) return false;
    try { conversation.sendContextualUpdate(message); return true; } catch { return false; }
  }

  /* ----------------------------------------------------------------- wire -- */

  root.addEventListener('click', (e) => {
    if (e.target === endBtn) return;
    if (!conversation) start();
  });
  endBtn.addEventListener('click', (e) => { e.stopPropagation(); stop(); });
  root.tabIndex = 0;
  root.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); }
  });

  // Still needed without ResizeObserver, and for a devicePixelRatio change when
  // the window is dragged onto a projector with a different scale factor.
  const onResize = () => { fit(figure, fctx); };
  window.addEventListener('resize', onResize);
  requestAnimationFrame(() => { onResize(); raf = requestAnimationFrame(frame); });

  function destroy() {
    destroyed = true;
    cancelAnimationFrame(raf);
    stopSampling();
    if (ro) ro.disconnect();
    window.removeEventListener('resize', onResize);
    if (conversation) { try { conversation.endSession(); } catch { /* noop */ } }
    conversation = null;
    root.remove();
  }

  // `tools` is exposed deliberately: it lets you exercise a tool from the
  // browser console without a live session — window.IopexVoice.tools
  // .goToSection({section:'voices'}) — which is how the page-driving layer is
  // tested. The gesture layer uses the same handle.
  /**
   * Latency summary. `replies` is client-silence to first audio; `tools` is time
   * spent inside a client tool handler. A large reply figure with small tool
   * figures puts the delay on the agent side — model choice, prompt size or turn
   * detection — not in this page.
   */
  function report() {
    const stat = (rows) => {
      if (!rows.length) return null;
      const ms = rows.map((r) => r.ms).sort((a, b) => a - b);
      return {
        n: ms.length,
        median: ms[Math.floor(ms.length / 2)],
        worst: ms[ms.length - 1],
        mean: Math.round(ms.reduce((a, b) => a + b, 0) / ms.length),
      };
    };
    const byTool = {};
    timings.tools.forEach((r) => { (byTool[r.label] ||= []).push(r); });
    return {
      reply: stat(timings.replies),
      tools: Object.fromEntries(Object.entries(byTool).map(([k, v]) => [k, stat(v)])),
      raw: timings,
    };
  }

  return { start, stop, toggle, setMicMuted, say, tools, state: () => state,
           report, destroy };
}

/** #rrggbb -> rgba(). Accepts an rgba() string unchanged so palettes can mix. */
function hexA(color, alpha) {
  if (!color || color[0] !== '#') return color;
  const h = color.slice(1);
  const f = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = parseInt(f, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}
