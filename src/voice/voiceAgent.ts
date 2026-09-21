/**
 * iOPEX voice guide — a live ElevenLabs agent rendered as an animated humanoid
 * bust standing above the "Ask the guide" pill: a stack of 3D cross-sections
 * that turns, nods and talks.
 *
 * Why not the <elevenlabs-convai> widget: it is a closed web component whose
 * only visual surface is two orb colours, an avatar image and its text labels.
 * The SDK exposes what a real visualiser needs instead: output frequency data
 * while the agent speaks, input frequency data while it listens, and
 * onModeChange to switch between the two.
 *
 * Framework-agnostic on purpose: owns its own DOM and exposes an imperative
 * handle. The React side (VoiceGuide.tsx) just mounts and unmounts it.
 */
import { Conversation, type VoiceConversation, type Mode, type Status } from '@elevenlabs/client';

export type VoiceState = 'idle' | 'connecting' | 'listening' | 'speaking' | 'thinking' | 'paused' | 'error';

export type ToolResult = string | number | void | Promise<string | number | void>;
export type ToolHandler = (params: Record<string, unknown>) => ToolResult;
export type ToolMap = Record<string, ToolHandler>;

export interface VoicePalette {
  amber: string; cyan: string; orange: string; ink: string; muted: string; ground: string; hair: string;
}

export interface VoiceAgentOptions {
  /** Public ElevenLabs agent id. */
  agentId: string;
  /** Client tools, name -> handler. */
  tools?: ToolMap;
  /** Prompt variables resolved at call start. */
  dynamicVariables?: Record<string, string | number | boolean>;
  palette?: Partial<VoicePalette>;
  /** Display name for the guide. Shown above the status line. */
  name?: string;
  container?: HTMLElement;
  onState?: (state: VoiceState) => void;
  onMessage?: (m: { message: string; source: 'ai' | 'user' }) => void;
  /**
   * Asked before every call, and the call only happens if it resolves true.
   * The kiosk uses it for the access code: the site stays open to anyone, the
   * paid session does not.
   */
  beforeStart?: () => boolean | Promise<boolean>;
}

interface TimingRow { ms: number; at: number; label: string }
interface Stat { n: number; median: number; worst: number; mean: number }

export interface VoiceAgentHandle {
  start(): Promise<void>;
  stop(): Promise<void>;
  toggle(): Promise<void>;
  setMicMuted(muted: boolean): Promise<boolean>;
  /** Presenter pause: mic closed, output silenced, agent told to hold. */
  pause(opts?: { listenForResume?: boolean }): boolean;
  /** Spoken "hold on": output silenced, mic left open to catch "carry on". */
  hold(): boolean;
  /** Undo pause(): mic open, output back, agent told to carry on. */
  resume(): boolean;
  isPaused(): boolean;
  /** Feed the agent context without the client hearing a question asked. */
  say(message: string): boolean;
  /**
   * Hand the agent a turn it did not wait for. Unlike say(), this arrives as a
   * user message, so the agent answers it — which is the only way to make a
   * room that said nothing move the presentation on.
   */
  nudge(message: string): boolean;
  /** Show/hide the humanoid. Off by default; collapses when a call ends. */
  setRevealed(on: boolean): void;
  isRevealed(): boolean;
  /** End any call and take the panel off screen (reversible via show()). */
  hide(): void;
  show(): void;
  isHidden(): boolean;
  tools: ToolMap;
  state(): VoiceState;
  report(): { reply: Stat | null; tools: Record<string, Stat | null>; raw: { replies: TimingRow[]; tools: TimingRow[] } };
  destroy(): void;
}

// Brand orange, not the earlier cool blue: the guide is part of the iOPEX
// mark. "cyan" keeps its name as the resting tone; speaking brightens it.
const DEFAULT_PALETTE: VoicePalette = {
  amber: '#FF8A1F',
  cyan: '#FF8A1F',
  orange: '#FF7A14',
  ink: '#FFB26B',
  muted: '#FF8A1F',
  ground: 'rgba(12,11,14,.86)',
  hair: 'rgba(255,138,31,.26)',
};

/**
 * Status, not identity. The guide's *name* is rendered on its own line above
 * these (see `nameEl`) — reading "Unavailable" as the assistant's name is
 * exactly what happened when the status was the only text in the panel.
 */
/**
 * How far above the bottom edge the panel sits: clear of the deck's chip and
 * arrow row (bottom:22px, ~40px tall) so the tabs keep their own line.
 */
const TABS_CLEARANCE = 76;

const STATE_LABEL: Record<VoiceState, string> = {
  idle: 'Tap to present',
  connecting: 'Connecting',
  listening: 'Listening',
  speaking: 'Speaking',
  thinking: 'Thinking',
  paused: 'Paused',
  error: 'Offline — tap to retry',
};

/** Shown when nothing else is: keeps the panel readable at a glance. */
const DEFAULT_NAME = 'iOPEX Guide';

/** #rrggbb -> rgba(). Accepts an rgba() string unchanged so palettes can mix. */
export function hexA(color: string, alpha: number): string {
  if (!color || color[0] !== '#') return color;
  const h = color.slice(1);
  const f = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = parseInt(f, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

export function createVoiceAgent(opts: VoiceAgentOptions): VoiceAgentHandle {
  const agentId = opts.agentId;
  const palette: VoicePalette = { ...DEFAULT_PALETTE, ...opts.palette };
  const tools: ToolMap = opts.tools || {};
  const host = opts.container || document.body;
  const onState = opts.onState || (() => {});
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let conversation: VoiceConversation | null = null;
  let state: VoiceState = 'idle';
  let raf = 0;
  let destroyed = false;
  let micMuted = false;
  let paused = false;
  /** Paused by voice, so the mic stays open to catch "carry on". */
  let listenForResume = false;
  /** Last status from the SDK — the truth about whether the session is up. */
  let connected = false;
  /** Humanoid shown? Off by default; swiping the iOPEX logo turns it on. */
  let revealed = false;

  /* ------------------------------------------------------------- timings --- */

  // Latency probe. Off unless asked for: ?debug=voice or window.IOPEX_VOICE_DEBUG
  const DEBUG = /(^|[?&])debug=voice(&|$)/.test(location.search) || !!window.IOPEX_VOICE_DEBUG;
  const timings = { replies: [] as TimingRow[], tools: [] as TimingRow[] };
  let quietSince = 0;

  function logTiming(kind: 'tool' | 'reply', ms: number, label: string): void {
    const row: TimingRow = { ms: Math.round(ms), at: Date.now(), label };
    (kind === 'tool' ? timings.tools : timings.replies).push(row);
    if (DEBUG) console.log(`[voice] ${kind === 'tool' ? 'tool ' + label : 'reply'}: ${row.ms}ms`);
  }

  // Smoothed levels: raw frequency data is jittery.
  let level = 0;
  let levelTarget = 0;
  let spectrum: Uint8Array = new Uint8Array(0);
  let phase = 0;

  const RINGS = 30;
  const RING_SEGS = 22;
  const ringLevel = new Float32Array(RINGS);
  const FOCAL = 2.3;   // eye-to-origin distance, in figure heights
  const MOUTH = 0.325; // where the mouth sits down the figure

  /* ---------------------------------------------------------------- DOM ---- */

  const root = document.createElement('div');
  root.className = 'iopex-voice';
  root.setAttribute('role', 'complementary');
  root.setAttribute('aria-label', 'Voice guide');

  const style = document.createElement('style');
  style.textContent = `
    /* Bottom-right corner, sitting just above the deck's chip/arrow row so the
       tabs keep their own line. Collapsed by default: one "Tap to present"
       pill and nothing else. The humanoid is opt-in (swipe the iOPEX logo). */
    .iopex-voice{
      position:fixed; right:clamp(12px,1.6vw,26px); bottom:${TABS_CLEARANCE}px;
      z-index:2147482000; display:flex; flex-direction:column; align-items:center;
      gap:6px; padding:9px 16px; border-radius:999px;
      background:${palette.ground}; border:1px solid ${palette.hair};
      backdrop-filter:blur(18px) saturate(1.25);
      box-shadow:0 10px 40px rgba(0,0,0,.5), inset 0 1px 0 rgba(255,255,255,.04);
      font-family:ui-monospace,'SF Mono',SFMono-Regular,Menlo,Consolas,monospace;
      cursor:pointer; user-select:none;
      transition:padding .35s cubic-bezier(.2,.8,.2,1), border-radius .35s cubic-bezier(.2,.8,.2,1),
                 border-color .4s ease, box-shadow .4s ease, opacity .3s ease;
    }
    /* Expanded: a live call, or the humanoid revealed. */
    .iopex-voice.is-live, .iopex-voice.is-revealed{
      width:164px; padding:12px 12px 13px; border-radius:20px;
    }
    .iopex-voice.is-hidden{ display:none; }
    .iopex-voice.is-listening, .iopex-voice.is-connecting{ border-color:${hexA(palette.cyan, 0.58)};
      box-shadow:0 10px 40px rgba(0,0,0,.5), 0 0 0 1px ${hexA(palette.cyan, 0.08)}; }
    .iopex-voice.is-speaking{ border-color:${hexA(palette.amber, 0.34)};
      box-shadow:0 10px 40px rgba(0,0,0,.5), 0 0 0 1px ${hexA(palette.amber, 0.08)}; }
    .iopex-voice:focus-visible{ outline:2px solid ${palette.cyan}; outline-offset:3px; }

    /* The humanoid only exists once revealed — swipe the iOPEX logo. */
    .iopex-voice canvas.figure{
      position:relative; width:96px; height:88px;
      display:none; pointer-events:none; flex:none;
      -webkit-mask-image:linear-gradient(to bottom, #000 88%, transparent 100%);
      mask-image:linear-gradient(to bottom, #000 88%, transparent 100%);
      transition:width .4s cubic-bezier(.2,.8,.2,1), height .4s cubic-bezier(.2,.8,.2,1);
    }
    .iopex-voice.is-revealed canvas.figure{ display:block; }
    .iopex-voice.is-revealed.is-live canvas.figure{ width:108px; height:99px; }

    /* Level bars: shown whenever a call is live, revealed or not. */
    .iopex-voice canvas.vwave{
      width:132px; height:22px; display:none; flex:none; pointer-events:none;
    }
    .iopex-voice.is-live canvas.vwave{ display:block; }

    .iopex-voice .vtext{ display:flex; flex-direction:column; align-items:center; gap:2px; max-width:100%; min-width:0; }
    /* Collapsed shows the call-to-action alone — no name, no transcript. */
    .iopex-voice .vname{ display:none;
      font-size:11.5px; font-weight:600; letter-spacing:.02em; line-height:1.25;
      color:#fff; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:100%;
    }
    .iopex-voice.is-live .vname, .iopex-voice.is-revealed .vname{ display:block; }
    .iopex-voice .vstate{
      font-size:9.5px; letter-spacing:.16em; text-transform:uppercase;
      color:#FF8A1F; line-height:1.25; text-align:center; white-space:nowrap;
    }
    .iopex-voice.is-live .vstate, .iopex-voice.is-revealed .vstate{ font-size:9px; color:${palette.muted}; }
    .iopex-voice.is-speaking .vstate{ color:${palette.amber}; }
    .iopex-voice.is-listening .vstate, .iopex-voice.is-connecting .vstate{ color:${palette.cyan}; text-shadow:0 0 12px ${hexA(palette.cyan, 0.45)}; }
    .iopex-voice.is-error .vstate{ color:#ff6b6b; }
    .iopex-voice .vhint{ display:none;
      font-size:9.5px; letter-spacing:.01em; line-height:1.35; text-align:center;
      color:${palette.ink}; opacity:.5; max-width:100%;
      -webkit-line-clamp:3; -webkit-box-orient:vertical;
      overflow:hidden; overflow-wrap:anywhere;
    }
    .iopex-voice.is-live .vhint{ display:-webkit-box; }
    .iopex-voice .vhint:empty{ display:none; }

    .iopex-voice .vrow{ display:none; gap:6px; margin-top:3px; }
    .iopex-voice.is-live .vrow{ display:flex; }
    .iopex-voice .vbtn{
      appearance:none; border:1px solid ${palette.hair}; background:transparent;
      color:${palette.muted}; border-radius:999px; height:22px; padding:0 10px;
      font:inherit; font-size:9px; letter-spacing:.1em; text-transform:uppercase;
      cursor:pointer; display:inline-flex; align-items:center; justify-content:center;
      transition:color .2s ease, border-color .2s ease, background .2s ease;
    }
    .iopex-voice .vbtn:hover{ color:#fff; border-color:#ff6b6b; background:rgba(255,107,107,.14); }
    .iopex-voice .vhold:hover{ border-color:${hexA(palette.cyan, 0.6)}; background:${hexA(palette.cyan, 0.14)}; }
    .iopex-voice.is-held .vhold{
      color:#0b0b0e; background:${palette.amber}; border-color:${palette.amber};
    }
    .iopex-voice.is-held .vhold:hover{ background:${palette.amber}; color:#0b0b0e; }

    .iopex-voice .vclose{
      position:absolute; top:5px; right:5px; width:18px; height:18px; padding:0;
      appearance:none; border:0; background:transparent; color:${palette.muted};
      font:inherit; font-size:13px; line-height:1; border-radius:50%;
      cursor:pointer; opacity:0; transition:opacity .2s ease, color .2s ease;
      display:none;
    }
    .iopex-voice.is-live .vclose, .iopex-voice.is-revealed .vclose{ display:block; }
    .iopex-voice:hover .vclose, .iopex-voice .vclose:focus-visible{ opacity:.8; }
    .iopex-voice .vclose:hover{ color:#fff; }

    @media (max-width:1100px){
      .iopex-voice.is-live, .iopex-voice.is-revealed{ width:132px; }
      .iopex-voice canvas.figure{ width:76px; height:70px; }
      .iopex-voice.is-revealed.is-live canvas.figure{ width:86px; height:79px; }
      .iopex-voice canvas.vwave{ width:104px; }
      .iopex-voice .vhint{ display:none !important; }
    }
    /* Phone width: the chip row wraps and there is no right gutter, so centre
       it on the bottom edge instead of stacking it on the tabs. */
    @media (max-width:760px){
      .iopex-voice{
        right:auto; left:50%; transform:translateX(-50%); bottom:78px;
        flex-direction:row; max-width:calc(100vw - 32px); gap:10px;
      }
      .iopex-voice.is-live, .iopex-voice.is-revealed{
        width:auto; border-radius:999px; padding:8px 14px 8px 10px;
      }
      .iopex-voice canvas.figure{ width:44px; height:40px; }
      .iopex-voice.is-revealed.is-live canvas.figure{ width:48px; height:44px; }
      .iopex-voice canvas.vwave{ width:60px; height:18px; }
      .iopex-voice .vtext{ align-items:flex-start; }
      .iopex-voice .vstate{ text-align:left; }
      .iopex-voice .vrow{ margin-top:0; }
    }
    /* Keep the Guide comfortably above navigation and readable on 4K/8K displays. */
    @media (min-width:1800px) and (min-height:900px){
      .iopex-voice{ bottom:calc(${TABS_CLEARANCE}px + 42px); }
      .iopex-voice.is-live, .iopex-voice.is-revealed{
        width:196px; padding:15px 15px 17px; border-radius:24px; gap:8px;
      }
      .iopex-voice canvas.figure{ width:116px; height:106px; }
      .iopex-voice.is-revealed.is-live canvas.figure{ width:130px; height:119px; }
      .iopex-voice canvas.vwave{ width:158px; height:26px; }
      .iopex-voice .vname{ font-size:13px; }
      .iopex-voice.is-live .vstate, .iopex-voice.is-revealed .vstate{ font-size:10.5px; }
      .iopex-voice .vhint{ font-size:10.5px; }
      .iopex-voice .vbtn{ height:26px; padding:0 13px; font-size:10px; }
    }
    @media (prefers-reduced-motion: reduce){
      .iopex-voice, .iopex-voice canvas.figure{ transition:none; }
    }
  `;

  const figure = document.createElement('canvas');
  figure.className = 'figure';
  figure.setAttribute('aria-hidden', 'true');

  const wave = document.createElement('canvas');
  wave.className = 'vwave';
  wave.setAttribute('aria-hidden', 'true');

  const text = document.createElement('div');
  text.className = 'vtext';
  const nameEl = document.createElement('div');
  nameEl.className = 'vname';
  nameEl.textContent = opts.name || DEFAULT_NAME;
  const stateEl = document.createElement('div');
  stateEl.className = 'vstate';
  stateEl.textContent = STATE_LABEL.idle;
  const hintEl = document.createElement('div');
  hintEl.className = 'vhint';
  text.append(nameEl, stateEl, hintEl);

  const row = document.createElement('div');
  row.className = 'vrow';
  const holdBtn = document.createElement('button');
  holdBtn.className = 'vbtn vhold';
  holdBtn.type = 'button';
  holdBtn.textContent = 'Hold';
  holdBtn.title = 'Silence the guide until you resume';
  holdBtn.setAttribute('aria-label', 'Hold the guide');
  row.append(holdBtn);
  const endBtn = document.createElement('button');
  endBtn.className = 'vbtn';
  endBtn.type = 'button';
  endBtn.textContent = 'End';
  endBtn.title = 'End the call';
  endBtn.setAttribute('aria-label', 'End call');
  row.append(endBtn);

  const closeBtn = document.createElement('button');
  closeBtn.className = 'vclose';
  closeBtn.type = 'button';
  closeBtn.textContent = '×';
  closeBtn.title = 'Hide the voice guide for this session';
  closeBtn.setAttribute('aria-label', 'Hide the voice guide');

  root.append(style, closeBtn, figure, wave, text, row);
  host.appendChild(root);

  /* ------------------------------------------------------------ painting --- */

  const fctx = figure.getContext('2d')!;

  /**
   * Re-fit if the element's box no longer matches its backing store.
   *
   * The figure canvas is display:none between calls, so the panel can be laid
   * out at a different size by the time it comes back — and a canvas whose
   * backing store is stale (or still 0x0, if the one fit() after setRevealed
   * happened while the panel was mid-transition) draws perfectly correct
   * nothing. Cheap enough to check every frame, and it makes the humanoid's
   * return after END → start self-healing rather than a matter of timing.
   */
  function refit(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const box = canvas.getBoundingClientRect();
    if (!box.width || !box.height) return;
    if (canvas.width === Math.round(box.width * dpr) && canvas.height === Math.round(box.height * dpr)) return;
    fit(canvas, ctx);
  }

  function fit(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D): boolean {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const box = canvas.getBoundingClientRect();
    if (!box.width || !box.height) return false;
    canvas.width = Math.round(box.width * dpr);
    canvas.height = Math.round(box.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return true;
  }

  // The canvas changes CSS size mid-flight (CSS transition when a call goes
  // live); the backing store has to follow or the shoulders get sliced off.
  const wctx = wave.getContext('2d')!;
  const ro = 'ResizeObserver' in window
    ? new ResizeObserver(() => { fit(figure, fctx); fit(wave, wctx); })
    : null;
  if (ro) { ro.observe(figure); ro.observe(wave); }

  function accent(): string {
    if (state === 'error') return '#ff6b6b';
    return palette.cyan;
  }

  /** Voice lives in the low bins; clamp to the part of the spectrum that moves. */
  function bandValue(t: number): number {
    const len = spectrum.length;
    if (!len) return 0;
    const band = Math.max(8, Math.floor(len * 0.09));
    const bin = Math.min(len - 1, 3 + Math.floor(Math.pow(t, 1.35) * band));
    const tilt = 1 + t * 1.6;
    return Math.min(1, (spectrum[bin] / 255) * tilt);
  }

  /** Cross-section of the bust at t (0 crown, 1 chest crop): half width, half depth, forward offset. */
  function section(t: number): { rx: number; rz: number; dz: number } {
    const hy = (t - 0.215) / 0.235;
    if (hy < 1) {
      const k = Math.sqrt(Math.max(0, 1 - hy * hy));
      return { rx: 0.162 * k, rz: 0.182 * k, dz: 0.022 };
    }
    if (t < 0.52) return { rx: 0.060, rz: 0.066, dz: -0.005 };
    const e = Math.pow(Math.min(1, (t - 0.52) / 0.24), 0.75);
    return { rx: 0.060 + (0.50 - 0.060) * e, rz: 0.066 + (0.13 - 0.066) * e, dz: -0.02 * e };
  }

  interface Pt { x: number; y: number }
  function cubicPoint(p0: Pt, p1: Pt, p2: Pt, p3: Pt, t: number): Pt {
    const mt = 1 - t;
    return {
      x: mt * mt * mt * p0.x + 3 * mt * mt * t * p1.x + 3 * mt * t * t * p2.x + t * t * t * p3.x,
      y: mt * mt * mt * p0.y + 3 * mt * mt * t * p1.y + 3 * mt * t * t * p2.y + t * t * t * p3.y,
    };
  }

  function paintFigure(): void {
    refit(figure, fctx);
    const box = figure.getBoundingClientRect();
    const w = box.width, h = box.height;
    if (!w || !h) return;
    fctx.clearRect(0, 0, w, h);
    const col = accent();
    const live = spectrum.length > 0;

    // Ground: soft dark ellipse so the emitted-light figure never washes out
    // over a bright screenshot.
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

    const breathe = reduce ? 0 : (Math.sin(phase * 1.3) * 0.5 + 0.5) * 0.10;
    const energy = Math.min(1, level * 1.15 + breathe);

    const S = Math.min(h * 1.02, w / 1.12);
    const cx = w / 2;
    // A slow vertical drift on top of the sway, so the bust never sits dead still.
    const cy = h * 0.52 + (reduce ? 0 : Math.sin(phase * 0.8) * S * 0.012 + Math.sin(phase * 0.47) * S * 0.004);

    const sway = reduce ? 0 : Math.sin(phase * 0.55) * 0.30 + Math.sin(phase * 0.23) * 0.12;
    const yawHead = reduce ? 0 : sway + Math.sin(phase * 2.35) * level * 0.26;
    const yawBody = yawHead * 0.34;
    const pitch = reduce ? 0 : Math.sin(phase * 0.8) * 0.045 + Math.sin(phase * 3.1) * level * 0.09;
    const HEAD_PIVOT = 0.50;
    const PIVOT = 0.46;
    const cosP = Math.cos(pitch), sinP = Math.sin(pitch);

    const speakingAura = state === 'speaking';
    const auraDrive = speakingAura ? Math.min(1, 0.22 + level * 1.6) : 0.055;

    function project(rx: number, rz: number, dz: number, y: number, a: number, head: boolean): [number, number, number] {
      const X = rx * Math.cos(a);
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

    function arc(rx: number, rz: number, dz: number, y: number, a0: number, a1: number, head: boolean): void {
      fctx.beginPath();
      for (let j = 0; j <= RING_SEGS; j++) {
        const p = project(rx, rz, dz, y, a0 + (a1 - a0) * (j / RING_SEGS), head);
        if (j) fctx.lineTo(p[0], p[1]); else fctx.moveTo(p[0], p[1]);
      }
      fctx.stroke();
    }

    // Softly shaded volume beneath the contours: skull, jaw, neck, shoulders.
    const faceShift = Math.sin(yawHead) * S * 0.035;
    const headX = cx + faceShift;
    const headY = cy + (0.22 - PIVOT) * S + pitch * S * 0.08;
    const headW = S * 0.32;
    const headH = S * 0.43;
    const jawOpen = reduce ? 0 : level * S * 0.022;

    fctx.save();
    const torsoShade = fctx.createLinearGradient(cx - S * 0.43, 0, cx + S * 0.43, 0);
    torsoShade.addColorStop(0, hexA(palette.cyan, 0.025));
    torsoShade.addColorStop(0.42, hexA(palette.cyan, 0.13 + energy * 0.06));
    torsoShade.addColorStop(0.72, hexA(col, 0.10 + energy * 0.08));
    torsoShade.addColorStop(1, hexA(palette.cyan, 0.02));
    fctx.fillStyle = torsoShade;
    fctx.beginPath();
    fctx.moveTo(cx - S * 0.50, cy + S * 0.48);
    fctx.bezierCurveTo(cx - S * 0.49, cy + S * 0.25, cx - S * 0.21, cy + S * 0.14, cx - S * 0.075, cy + S * 0.12);
    fctx.lineTo(cx - S * 0.06, cy + S * 0.015);
    fctx.bezierCurveTo(cx - S * 0.19, cy - S * 0.07, cx - S * 0.20, cy - S * 0.34, headX, cy - S * 0.47);
    fctx.bezierCurveTo(cx + S * 0.20, cy - S * 0.34, cx + S * 0.19, cy - S * 0.07, cx + S * 0.06, cy + S * 0.015);
    fctx.lineTo(cx + S * 0.075, cy + S * 0.12);
    fctx.bezierCurveTo(cx + S * 0.21, cy + S * 0.14, cx + S * 0.49, cy + S * 0.25, cx + S * 0.50, cy + S * 0.48);
    fctx.closePath();
    fctx.fill();

    const skin = fctx.createRadialGradient(headX - headW * 0.16, headY - headH * 0.12, headW * 0.03, headX, headY, headH * 0.72);
    skin.addColorStop(0, hexA(speakingAura ? palette.amber : col, 0.42 + energy * 0.30));
    skin.addColorStop(0.34, hexA(speakingAura ? palette.orange : palette.cyan, 0.18 + auraDrive * 0.26));
    skin.addColorStop(0.72, hexA(palette.cyan, 0.10));
    skin.addColorStop(1, hexA(palette.cyan, 0.015));
    fctx.shadowColor = hexA(speakingAura ? palette.orange : palette.cyan, 0.5 + energy * 0.25);
    fctx.shadowBlur = S * 0.06;
    fctx.fillStyle = skin;
    fctx.beginPath();
    fctx.ellipse(headX, headY, headW * 0.49, headH * 0.52 + jawOpen, yawHead * 0.08, 0, Math.PI * 2);
    fctx.fill();
    fctx.restore();

    // The voice core glows from within the faceless volume.
    const face = project(0, 0.182, 0.022, 0.235, Math.PI / 2, true);
    const fr = S * 0.15;
    const glow = fctx.createRadialGradient(face[0], face[1], 0, face[0], face[1], fr);
    glow.addColorStop(0, hexA(speakingAura ? palette.amber : palette.ink, 0.42 + auraDrive * 0.50));
    glow.addColorStop(0.42, hexA(speakingAura ? palette.orange : palette.cyan, 0.16 + auraDrive * 0.25));
    glow.addColorStop(1, hexA(palette.cyan, 0));
    fctx.save();
    fctx.translate(face[0], face[1]);
    fctx.scale(1, 1.4);
    fctx.fillStyle = glow;
    fctx.beginPath();
    fctx.arc(0, 0, fr, 0, Math.PI * 2);
    fctx.fill();
    fctx.restore();

    const hc = cy + (0.215 - PIVOT) * S;

    // The head's circular contours: back half dim, front half doubled.
    fctx.lineCap = 'round';
    for (let i = 0; i < RINGS; i++) {
      const t = (i + 0.5) / RINGS;
      const sec = section(t);
      if (sec.rx < 0.006) continue;
      const head = t < 0.52;
      if (!head) continue;

      const d = Math.min(1, Math.abs(t - MOUTH) * 2.4);
      const target = live ? bandValue(d) : reduce ? 0.05 : 0.10 + Math.sin(phase * 2.1 - d * 3.0) * 0.06;
      const ease = target > ringLevel[i] ? 0.5 : 0.12;
      ringLevel[i] += (target - ringLevel[i]) * ease;

      const mouth = Math.exp(-Math.pow((t - MOUTH) / 0.075, 2));
      const open = reduce ? 0 : ringLevel[i] * mouth * (t > MOUTH ? 0.032 : -0.010);
      const swell = 1 + ringLevel[i] * (0.03 + mouth * 0.10);
      const chest = head ? 1 : 1 + breathe * 0.5 + level * 0.04;
      const y = t + open + (reduce ? 0 : Math.sin(phase * 5.6 + i * 0.8) * ringLevel[i] * 0.005 * (0.4 + mouth));

      const inFace = t > 0.215 && t < 0.425;
      const tint = inFace ? palette.ink : palette.cyan;
      const bright = Math.min(0.95, (inFace ? 0.58 : 0.42) + ringLevel[i] * 0.45);

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

    // Fine blue energy fibres inside the chest volume, following the pectoral sweep.
    interface Vein { p0: Pt; p1: Pt; p2: Pt; p3: Pt; offset: number }
    const veinPaths: Vein[] = [];
    const veinLayout = [
      { sx: 0.030, sy: 0.245, c1x: 0.080, c1y: 0.225, c2x: 0.165, c2y: 0.205, ex: 0.275, ey: 0.220 },
      { sx: 0.038, sy: 0.275, c1x: 0.105, c1y: 0.255, c2x: 0.245, c2y: 0.245, ex: 0.380, ey: 0.285 },
      { sx: 0.046, sy: 0.310, c1x: 0.125, c1y: 0.292, c2x: 0.285, c2y: 0.305, ex: 0.425, ey: 0.355 },
      { sx: 0.055, sy: 0.350, c1x: 0.135, c1y: 0.345, c2x: 0.260, c2y: 0.385, ex: 0.355, ey: 0.435 },
    ];
    for (let side = -1; side <= 1; side += 2) {
      for (let i = 0; i < veinLayout.length; i++) {
        const line = veinLayout[i];
        veinPaths.push({
          p0: { x: cx + side * S * line.sx, y: cy + S * line.sy },
          p1: { x: cx + side * S * line.c1x, y: cy + S * line.c1y },
          p2: { x: cx + side * S * line.c2x, y: cy + S * line.c2y },
          p3: { x: cx + side * S * line.ex, y: cy + S * line.ey },
          offset: (i / veinLayout.length + (side > 0 ? 0.5 : 0)) % 1,
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

      fctx.save();
      fctx.translate(0, 0.75);
      fctx.strokeStyle = hexA('#2A1505', 0.46);
      fctx.lineWidth = 2.15;
      traceVein();
      fctx.stroke();
      fctx.restore();

      fctx.shadowColor = hexA(palette.cyan, 0.55 + energy * 0.35);
      fctx.shadowBlur = 5 + energy * 6;
      fctx.strokeStyle = hexA(palette.cyan, 0.18 + energy * 0.18);
      fctx.lineWidth = 1.55;
      traceVein();
      fctx.stroke();

      const veinLight = fctx.createLinearGradient(vein.p0.x, vein.p0.y, vein.p3.x, vein.p3.y);
      veinLight.addColorStop(0, hexA(palette.ink, 0.18 + energy * 0.12));
      veinLight.addColorStop(0.48, hexA(palette.cyan, 0.62 + energy * 0.22));
      veinLight.addColorStop(1, hexA(palette.ink, 0.24 + energy * 0.14));
      fctx.shadowBlur = 0;
      fctx.strokeStyle = veinLight;
      fctx.lineWidth = 0.62;
      traceVein();
      fctx.stroke();

      fctx.strokeStyle = hexA(palette.ink, 0.52 + energy * 0.20);
      fctx.lineWidth = 0.22;
      fctx.setLineDash([S * 0.055, S * 0.035]);
      fctx.lineDashOffset = speakingAura && !reduce ? -phase * S * 0.12 : 0;
      traceVein();
      fctx.stroke();
      fctx.setLineDash([]);

      if (speakingAura) {
        const travel = reduce ? 0.55 : (phase * (0.62 + level * 0.36) + vein.offset) % 1;
        const packet = cubicPoint(vein.p0, vein.p1, vein.p2, vein.p3, travel);
        const packetGlow = fctx.createRadialGradient(packet.x, packet.y, 0, packet.x, packet.y, S * 0.035);
        packetGlow.addColorStop(0, hexA(palette.amber, 0.72 + level * 0.22));
        packetGlow.addColorStop(0.35, hexA(palette.orange, 0.42 + level * 0.22));
        packetGlow.addColorStop(1, hexA(palette.orange, 0));
        fctx.fillStyle = packetGlow;
        fctx.beginPath();
        fctx.arc(packet.x, packet.y, S * 0.035, 0, Math.PI * 2);
        fctx.fill();
        fctx.fillStyle = hexA(palette.amber, 0.82 + level * 0.16);
        fctx.beginPath();
        fctx.arc(packet.x - 0.35, packet.y - 0.35, 0.58 + level * 0.36, 0, Math.PI * 2);
        fctx.fill();
      }
    }
    fctx.restore();

    // Compact inner energy field: soft overlapping pools down through the chest.
    fctx.save();
    fctx.globalCompositeOperation = 'lighter';
    const cores = [
      { x: 0, y: -0.06, rx: 0.105, ry: 0.17, warm: 1 },
      { x: -0.034, y: 0.15, rx: 0.052, ry: 0.085, warm: 0.68 },
      { x: 0.034, y: 0.15, rx: 0.052, ry: 0.085, warm: 0.68 },
      { x: 0, y: 0.35, rx: 0.095, ry: 0.075, warm: 0.50 },
    ];
    for (const core of cores) {
      const gx = cx + S * core.x;
      const gy = cy + S * core.y;
      const radius = S * core.ry;
      const inner = fctx.createRadialGradient(gx, gy, 0, gx, gy, radius);
      inner.addColorStop(0, hexA(speakingAura ? palette.amber : palette.ink, (0.17 + auraDrive * 0.55) * core.warm));
      inner.addColorStop(0.46, hexA(speakingAura ? palette.orange : palette.cyan, (0.10 + auraDrive * 0.30) * core.warm));
      inner.addColorStop(1, hexA(palette.orange, 0));
      fctx.fillStyle = inner;
      fctx.beginPath();
      fctx.ellipse(gx, gy, S * core.rx, radius, 0, 0, Math.PI * 2);
      fctx.fill();
    }
    fctx.restore();

    // Speaking-only particles skim the outer body contour.
    if (!reduce && speakingAura) {
      const particleCount = 48;
      for (let i = 0; i < particleCount; i++) {
        const travel = (phase * (0.28 + level * 0.16) + i / particleCount) % 1;
        const upper = i % 3 !== 0;
        const side = i % 2 ? 1 : -1;
        const theta = travel * Math.PI;
        const mx = upper ? cx + side * S * (0.17 + Math.sin(theta) * 0.035) : cx + side * S * (0.08 + travel * 0.36);
        const my = upper ? hc + Math.cos(theta) * S * 0.22 : cy + S * (0.14 + Math.sin(travel * Math.PI * 0.62) * 0.25);
        const edgeFade = Math.sin(travel * Math.PI);
        const warm = i % 9 === 0;
        fctx.shadowBlur = 4 + level * 5;
        fctx.shadowColor = warm ? palette.orange : palette.cyan;
        fctx.fillStyle = hexA(warm ? palette.amber : palette.cyan, edgeFade * (0.30 + energy * 0.58));
        fctx.beginPath();
        fctx.arc(mx, my, 0.55 + (i % 4) * 0.20, 0, Math.PI * 2);
        fctx.fill();
      }
      fctx.shadowBlur = 0;
    }

    // Connecting: a real progress sweep, since there is no audio to visualise.
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

  /**
   * Level bars, the voice-note idiom people already know: tall and warm while
   * the guide speaks, short and cool while it listens. Read from across a
   * room, which the bust's fine ring detail is not.
   */
  const WAVE_BARS = 13;
  const barLevel = new Float32Array(WAVE_BARS);

  function paintWave(): void {
    const box = wave.getBoundingClientRect();
    const w = box.width, h = box.height;
    if (!w || !h) return;
    wctx.clearRect(0, 0, w, h);
    if (state === 'idle' || state === 'error') return;

    const speaking = state === 'speaking';
    const col = speaking ? palette.amber : palette.cyan;
    const gap = 3;
    const bw = Math.max(2, (w - gap * (WAVE_BARS - 1)) / WAVE_BARS);
    const mid = h / 2;

    for (let i = 0; i < WAVE_BARS; i++) {
      // Mirror the spectrum around the centre bar so the shape reads as one
      // voice rather than a left-to-right scroll.
      const t = Math.abs(i - (WAVE_BARS - 1) / 2) / ((WAVE_BARS - 1) / 2);
      // Per-bar shape: two slow travelling waves across the row (u = 0..1), so
      // neighbouring bars never move in lockstep and the row reads as a living
      // waveform rather than a symmetric meter.
      const u = i / (WAVE_BARS - 1);
      const shape = 0.3 + 0.7 * Math.abs(Math.sin(u * 2.399 + phase * 2.1)) * (0.55 + 0.45 * Math.abs(Math.cos(u * 0.91 - phase * 1.45)));
      let target: number;
      if (state === 'paused') {
        target = 0.06 + 0.04 * Math.abs(Math.sin(phase * 1.9));
      } else if (spectrum.length) {
        // Every bar reads the voice band (low bins outward), shaped per bar.
        target = (0.10 + 0.72 * bandValue(0.04 + 0.92 * Math.pow(t, 1.18))) * shape * (1 - t * 0.12);
      } else {
        // Connecting / thinking / silence: a slow travelling ripple, so the
        // panel never looks frozen mid-call.
        target = reduce ? 0.08 + 0.18 * shape : (0.10 + 0.5 * Math.abs(Math.sin(phase * 2.8 - i * 0.82))) * shape;
      }
      barLevel[i] += (Math.max(0.035, target) - barLevel[i]) * (0.3 + 0.18 * (i % 3) / 2);

      const bh = Math.max(3, Math.min(h * 0.94, barLevel[i] * h * 1.28));
      const x = i * (bw + gap);
      wctx.fillStyle = hexA(col, 0.35 + barLevel[i] * 0.6);
      wctx.beginPath();
      const r = Math.min(bw / 2, 2);
      const y = mid - bh / 2;
      if (typeof wctx.roundRect === 'function') wctx.roundRect(x, y, bw, bh, r);
      else wctx.rect(x, y, bw, bh);
      wctx.fill();
    }
  }

  function frame(ts: number): void {
    if (destroyed) return;
    refit(wave, wctx);
    phase = (ts || 0) / 1000;
    level += (levelTarget - level) * 0.18;
    paintFigure();
    paintWave();
    raf = requestAnimationFrame(frame);
  }

  /* -------------------------------------------------------------- polling -- */

  // Sample the SDK's frequency data 20x a second — plenty for a visualiser.
  let sampler: ReturnType<typeof setInterval> | 0 = 0;

  function startSampling(): void {
    stopSampling();
    sampler = setInterval(() => {
      if (!conversation || paused) return;
      try {
        const data = state === 'speaking'
          ? conversation.getOutputByteFrequencyData()
          : conversation.getInputByteFrequencyData();
        if (!data || !data.length) return;
        spectrum = data;
        const band = Math.max(8, Math.floor(data.length * 0.09));
        let sum = 0;
        for (let i = 0; i < band; i++) sum += data[i];
        levelTarget = Math.min(1, (sum / band) / 88);
        if (state === 'listening') {
          if (levelTarget > 0.06) quietSince = 0;
          else if (!quietSince) quietSince = performance.now();
        }
      } catch {
        spectrum = new Uint8Array(0);
        levelTarget = 0;
      }
    }, 50);
  }

  function stopSampling(): void {
    if (sampler) clearInterval(sampler);
    sampler = 0;
    spectrum = new Uint8Array(0);
    levelTarget = 0;
    ringLevel.fill(0);
  }

  /* ---------------------------------------------------------------- state -- */

  function setState(next: VoiceState, hint?: string): void {
    state = next;
    stateEl.textContent = STATE_LABEL[next] || next;
    if (hint !== undefined) hintEl.textContent = hint;
    root.classList.toggle('is-live', next !== 'idle' && next !== 'error');
    root.classList.toggle('is-held', next === 'paused');
    holdBtn.textContent = next === 'paused' ? 'Resume' : 'Hold';
    root.classList.toggle('is-speaking', next === 'speaking');
    root.classList.toggle('is-listening', next === 'listening');
    root.classList.toggle('is-connecting', next === 'connecting');
    root.classList.toggle('is-error', next === 'error');
    onState(next);
  }

  /* ---------------------------------------------------------------- tools -- */

  // Wrapped so a thrown error or rejected promise reaches the agent as text it
  // can speak over, instead of stalling the conversation.
  function wrapTools(): Record<string, (params: unknown) => ToolResult> {
    const out: Record<string, (params: unknown) => ToolResult> = {};
    Object.keys(tools).forEach((name) => {
      out[name] = (params: unknown) => {
        const explain = (err: unknown) => {
          // Always warn, not just under ?debug=voice: when this fires the guide
          // tells the room it is "having a technical issue", and without a log
          // there is nothing to go on afterwards.
          console.warn(`[voice] client tool "${name}" failed:`, err);
          return 'That did not work: ' + ((err as Error)?.message || 'unknown error') + '. Tell the client and carry on.';
        };
        const t0 = performance.now();
        const done = <T,>(v: T): T => { logTiming('tool', performance.now() - t0, name); return v; };
        try {
          const r = tools[name]((params as Record<string, unknown>) || {});
          return r && typeof (r as Promise<unknown>).then === 'function'
            ? (r as Promise<string | number | void>).then(done, (e) => done(explain(e)))
            : done(r);
        } catch (err) {
          return done(explain(err));
        }
      };
    });
    return out;
  }

  /* -------------------------------------------------------------- session -- */

  async function start(): Promise<void> {
    if (conversation || state === 'connecting') return;
    if (!agentId) {
      setState('error', 'No agent id configured');
      return;
    }
    if (opts.beforeStart) {
      // Before setRevealed/setState, so a refused start leaves the pill exactly
      // as it was rather than flashing the humanoid up and dropping it again.
      let allowed = false;
      try { allowed = await opts.beforeStart(); } catch (err) {
        console.warn('[voice] beforeStart threw; treating the call as refused:', err);
        allowed = false;
      }
      // Read through a closure: the awaited gap is long (someone is typing a
      // code) and another tap may have started a call in the meantime.
      const raced = (): boolean => !!conversation || state === 'connecting';
      if (raced()) return;
      if (!allowed) {
        // A tap that does nothing at all reads as a broken kiosk. Say why.
        setState('idle', 'Code needed — tap to enter it');
        return;
      }
    }
    // Presenting is when the guide should have a face. The collapsed pill is
    // the *idle* state; once a call starts the humanoid comes up on its own,
    // and the logo swipe stays available to toggle it either way.
    setRevealed(true);
    setState('connecting', 'Allow microphone access');

    try {
      conversation = await Conversation.startSession({
        agentId,
        connectionType: 'webrtc',
        dynamicVariables: opts.dynamicVariables || {},
        clientTools: wrapTools(),
        onModeChange: ({ mode }: { mode: Mode }) => {
          // Held, but the model started a turn anyway (it does, occasionally,
          // and it is the whole complaint). Re-assert the mute rather than
          // trusting the prompt: whatever it generates stays inaudible.
          if (paused) {
            if (mode === 'speaking') { try { conversation?.setVolume({ volume: 0 }); } catch { /* noop */ } }
            return;
          }
          // A mode change is proof the session is alive, so it also clears a
          // stale error. This used to early-return on 'error', which meant one
          // recoverable hiccup froze the panel on "Offline" for the rest of the
          // call while the guide carried on talking.
          if (state === 'idle') return;
          if (mode === 'speaking') {
            if (quietSince) logTiming('reply', performance.now() - quietSince, 'reply');
            quietSince = 0;
          }
          setState(mode === 'speaking' ? 'speaking' : 'listening', '');
        },
        onStatusChange: ({ status }: { status: Status }) => {
          connected = status === 'connected';
          if (status === 'disconnected') teardown();
        },
        onMessage: ({ message, source }) => {
          // Same reasoning as onModeChange: traffic means we are not offline.
          if (state === 'error' && connected) setState('listening', '');
          if (source === 'ai' && message) hintEl.textContent = message;
          if (DEBUG && message) console.log(`[voice] ${source === 'ai' ? 'agent' : 'client'}: ${message}`);
          if (opts.onMessage) {
            try { opts.onMessage({ message, source }); } catch { /* host hook is optional */ }
          }
        },
        onError: (message: string) => {
          // The SDK reports recoverable problems here too — a client tool that
          // failed, a transient transport blip — with the session still up.
          // Calling that "Offline" is wrong twice over: it mislabels a guide
          // that is still presenting, and (because the attract loop reads this
          // state) it lets the kiosk decide nobody is presenting and jump back
          // to the carousel. Only a session that is actually gone is an error.
          if (connected && conversation) {
            if (DEBUG) console.warn('[voice] recoverable error, session still up:', message);
            if (message) hintEl.textContent = message;
            return;
          }
          setState('error', message || 'Connection failed');
        },
      }) as VoiceConversation;

      if (micMuted) conversation.setMicMuted(true);
      setState('listening', '');
      startSampling();
    } catch (err) {
      conversation = null;
      setRevealed(false); // never connected — back to the plain pill
      const msg = (err as Error)?.message || String(err);
      setState('error', /permission|denied|NotAllowed/i.test(msg)
        ? 'Microphone blocked — allow it and retry'
        : /secure|https/i.test(msg)
          ? 'Needs https or localhost'
          : msg);
    }
  }

  function teardown(): void {
    stopSampling();
    conversation = null;
    connected = false;
    paused = false;
    setRevealed(false); // the reveal lasts for the call, not the session
    setState('idle', '');
  }

  async function stop(): Promise<void> {
    stopSampling();
    const c = conversation;
    conversation = null;
    connected = false;
    paused = false;
    setRevealed(false);
    setState('idle', '');
    if (c) { try { await c.endSession(); } catch { /* already gone */ } }
  }

  function toggle(): Promise<void> { return conversation ? stop() : start(); }

  async function setMicMuted(muted: boolean): Promise<boolean> {
    micMuted = !!muted;
    if (conversation) { try { conversation.setMicMuted(micMuted); } catch { /* noop */ } }
    if (conversation) setState(micMuted ? 'thinking' : 'listening', micMuted ? 'Mic muted' : '');
    return micMuted;
  }

  function say(message: string): boolean {
    if (!conversation) return false;
    try { conversation.sendContextualUpdate(message); return true; } catch { return false; }
  }

  function nudge(message: string): boolean {
    // Never while held: the whole contract of a hold is that the guide stays
    // quiet however long the silence lasts.
    if (!conversation || paused) return false;
    try { conversation.sendUserMessage(message); return true; } catch { return false; }
  }

  // The SDK has no pause: the closest honest thing is to close the mic, silence
  // the output and tell the agent to hold. Resume reverses all three. The
  // visual drops to a still "Paused" bust so the room can see it is on hold.
  /**
   * Two ways to stop it talking, and the difference is whether it can still
   * hear you:
   *
   * - `pause()` — the presenter's hard stop (two-finger gesture). Mic closed
   *   too, so the room can talk freely without the agent reacting to a word.
   *   Resumed by gesture, button or key, never by voice.
   * - `pause({ listenForResume: true })` — "hold on a minute", said out loud.
   *   The mic has to stay open or nothing could ever hear "carry on".
   *
   * Either way output volume goes to zero, so silence does not depend on the
   * model obeying the prompt — it physically cannot be heard until resumed.
   */
  function pause(opts?: { listenForResume?: boolean }): boolean {
    if (!conversation || paused) return false;
    paused = true;
    listenForResume = !!opts?.listenForResume;
    try { conversation.setMicMuted(listenForResume ? micMuted : true); } catch { /* noop */ }
    try { conversation.setVolume({ volume: 0 }); } catch { /* noop */ }
    say(listenForResume
      ? 'The client asked you to hold. Stop talking immediately. Stay completely silent — no check-ins, no "are you still there", no follow-up questions — however long the silence lasts. The only thing you respond to is someone telling you to continue, resume, carry on or go ahead. When that happens call resumeNarration first, then pick up in one short sentence.'
      : 'The presenter paused you. Stop talking immediately and stay silent until they say to continue.');
    spectrum = new Uint8Array(0);
    levelTarget = 0;
    setState('paused', listenForResume ? 'Say "carry on" to resume' : 'Two fingers to continue');
    return true;
  }

  function resume(): boolean {
    if (!conversation || !paused) return false;
    paused = false;
    listenForResume = false;
    try { conversation.setVolume({ volume: 1 }); } catch { /* noop */ }
    try { conversation.setMicMuted(micMuted); } catch { /* noop */ }
    setState('listening', '');
    say('The presenter asked you to continue. Pick up from where you left off in one short sentence.');
    return true;
  }

  /* ----------------------------------------------------------------- wire -- */

  /** Error state: drop whatever is left of the old session, then reconnect. */
  async function retry(): Promise<void> {
    stopSampling();
    const c = conversation;
    conversation = null;
    connected = false;
    paused = false;
    if (c) { try { await c.endSession(); } catch { /* already gone */ } }
    setState('idle', '');
    await start();
  }

  root.addEventListener('click', (e) => {
    if (e.target === endBtn || e.target === closeBtn || e.target === holdBtn) return;
    // "Tap to retry" used to be a lie: the handler below only started a call
    // when there was no conversation object, and an errored session still has
    // one — so tapping did nothing at all.
    if (state === 'error') { void retry(); return; }
    if (!conversation) void start();
  });
  endBtn.addEventListener('click', (e) => { e.stopPropagation(); void stop(); });
  holdBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (paused) resume(); else pause({ listenForResume: true });
  });
  closeBtn.addEventListener('click', (e) => { e.stopPropagation(); hide(); });
  root.tabIndex = 0;
  root.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (state === 'error') void retry(); else void toggle();
    }
  });

  const onResize = () => { fit(figure, fctx); fit(wave, wctx); };
  window.addEventListener('resize', onResize);
  requestAnimationFrame(() => { onResize(); raf = requestAnimationFrame(frame); });

  /**
   * Show or hide the humanoid. The panel is a plain "Tap to present" pill until
   * this is turned on (by swiping the iOPEX logo — see Dock), and it collapses
   * back on its own when the call ends, so the default screen stays clean.
   */
  function setRevealed(on: boolean): void {
    revealed = !!on;
    root.classList.toggle('is-revealed', revealed);
    // The canvas was display:none, so it has no backing store yet.
    if (revealed) requestAnimationFrame(() => { fit(figure, fctx); });
  }

  function isRevealed(): boolean { return revealed; }

  /**
   * Turn the guide off without tearing it down: ends any live call and takes
   * the panel off screen. `show()` brings it back, so a presenter who dismissed
   * it mid-demo is not stuck until a reload.
   */
  function hide(): void {
    void stop();
    root.classList.add('is-hidden');
    // Release the gutter the deck reserves for the rail (see extras.css).
    document.documentElement.classList.add('voice-hidden');
  }

  function show(): void {
    root.classList.remove('is-hidden');
    document.documentElement.classList.remove('voice-hidden');
  }

  function isHidden(): boolean {
    return root.classList.contains('is-hidden');
  }

  function destroy(): void {
    destroyed = true;
    cancelAnimationFrame(raf);
    stopSampling();
    if (ro) ro.disconnect();
    window.removeEventListener('resize', onResize);
    if (conversation) { try { void conversation.endSession(); } catch { /* noop */ } }
    conversation = null;
    document.documentElement.classList.remove('voice-hidden');
    root.remove();
  }

  function report() {
    const stat = (rows: TimingRow[]): Stat | null => {
      if (!rows.length) return null;
      const ms = rows.map((r) => r.ms).sort((a, b) => a - b);
      return {
        n: ms.length,
        median: ms[Math.floor(ms.length / 2)],
        worst: ms[ms.length - 1],
        mean: Math.round(ms.reduce((a, b) => a + b, 0) / ms.length),
      };
    };
    const byTool: Record<string, TimingRow[]> = {};
    timings.tools.forEach((r) => { (byTool[r.label] ||= []).push(r); });
    return {
      reply: stat(timings.replies),
      tools: Object.fromEntries(Object.entries(byTool).map(([k, v]) => [k, stat(v)])),
      raw: timings,
    };
  }

  return {
    start, stop, toggle, setMicMuted, pause, resume, isPaused: () => paused, say, nudge, tools,
    hold: () => pause({ listenForResume: true }),
    setRevealed, isRevealed,
    hide, show, isHidden,
    state: () => state, report, destroy,
  };
}
