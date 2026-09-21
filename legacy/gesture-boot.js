/**
 * Wires the gesture layer to the iOPEX products page.
 *
 * gesture-layer.js only reports what the hand is doing. This file decides what
 * that means on this page, exactly as voice-boot.js does for the agent's tools.
 * The deck has its own bindings.
 *
 * Gestures are opt-in and start stopped: a camera light coming on unannounced
 * in a client meeting is not acceptable, and the presenter should choose the
 * moment. Press `g` to arm, `g` again to release the camera.
 *
 *   g    arm / release hand tracking
 *   d    camera preview with landmarks (tuning aid)
 *
 * Nothing here needs the voice agent. With no ElevenLabs session the pointer
 * and section navigation still work; only the mic gate is inert.
 */
import { createGestureLayer } from './gesture-layer.js';

// Same order as the agent's goToSection tool, so "next" means what a client
// would expect: the order the pitch runs in.
const SECTION_ORDER = [
  '.hero', '#products', '#digivox', '#dv-why', '#dv-setup', '#dv-voices',
  '#dv-scoring', '#dv-platform', '#dv-results', '.dv-cta',
];

const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function currentSectionIndex() {
  const middle = window.innerHeight / 2;
  let best = 0;
  SECTION_ORDER.forEach((sel, i) => {
    const el = document.querySelector(sel);
    if (!el) return;
    const box = el.getBoundingClientRect();
    if (box.top <= middle && box.bottom >= middle) best = i;
  });
  return best;
}

function step(delta) {
  const next = Math.min(SECTION_ORDER.length - 1, Math.max(0, currentSectionIndex() + delta));
  const el = document.querySelector(SECTION_ORDER[next]);
  if (!el) return;
  el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
  // Tell the agent where the room just went, so it does not describe the
  // section the client has scrolled away from. Silent when there is no call.
  try {
    window.IopexVoice?.say?.(
      'The presenter moved the page to the ' + SECTION_ORDER[next] + ' section by gesture. ' +
      'Do not re-greet; carry on from here if you were mid-sentence.'
    );
  } catch { /* no session */ }
}

/* ------------------------------------------------------------------ toast --- */

// Gestures are invisible input. Without feedback the presenter cannot tell
// armed-but-no-hand from not-armed, and will keep waving at a dead camera.
let toastEl = null;
let toastTimer = 0;

function toast(msg, sticky) {
  if (!toastEl) {
    toastEl = document.createElement('div');
    toastEl.style.cssText =
      'position:fixed;left:50%;bottom:96px;transform:translateX(-50%);z-index:2147482050;' +
      'padding:7px 14px;border-radius:999px;background:rgba(16,16,19,.88);' +
      'border:1px solid rgba(120,200,215,.2);backdrop-filter:blur(12px);' +
      'font:10px/1.4 ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.1em;' +
      'text-transform:uppercase;color:#B7C1CD;pointer-events:none;' +
      'transition:opacity .25s ease;opacity:0;';
    document.body.appendChild(toastEl);
  }
  toastEl.textContent = msg;
  toastEl.style.opacity = '1';
  clearTimeout(toastTimer);
  if (!sticky) toastTimer = setTimeout(() => { toastEl.style.opacity = '0'; }, 2200);
}

/* ---------------------------------------------------------------- gestures --- */

const gestures = createGestureLayer({
  debug: /(^|[?&])debug=gesture(&|$)/.test(location.search),

  onPoint({ x, y, pinching }) {
    try { window.IOPEX_CURSOR?.moveTo(x, y, { active: pinching }); } catch { /* optional */ }
  },

  onPinch(down) {
    // Pinch-to-talk: closed hand opens the microphone. This is the room-audio
    // fix — the agent stops answering the human presenter talking to the room.
    // Inverted deliberately: muted is the resting state.
    try { window.IopexVoice?.setMicMuted?.(!down); } catch { /* optional */ }
    const live = (() => { try { return window.IopexVoice?.state?.() !== 'idle'; } catch { return false; } })();
    toast(down
      ? (live ? 'mic open' : 'pinch held — no call running')
      : (live ? 'mic muted' : 'released'));
  },

  onPose(name) {
    // Open palm advances, fist goes back. Chosen this way round because an open
    // palm is the natural "and next" gesture when facing a room, and a fist is
    // deliberate enough that it will not fire by accident mid-sentence.
    if (name === 'open') { step(1); toast('next section'); }
    else if (name === 'fist') { step(-1); toast('previous section'); }
  },

  onState(state, detail) {
    if (state === 'error') { toast(detail || 'gesture error', true); console.warn('[gesture]', detail); }
    else if (state === 'loading') toast(detail || 'loading', true);
    else if (state === 'running') toast(detail === 'tracking' ? 'tracking' : (detail || 'armed'), detail !== 'tracking');
    else if (state === 'lost') toast(detail || 'no hand', true);
    else if (state === 'idle') {
      toast('hand tracking off');
      try { window.IOPEX_CURSOR?.release(); } catch { /* optional */ }
    }
  },
});

window.IopexGesture = gestures;

window.addEventListener('keydown', (e) => {
  // Ignore while typing, and leave modified keys to the browser.
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const t = e.target;
  if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;

  if (e.key === 'g' || e.key === 'G') {
    e.preventDefault();
    gestures.toggle();
  } else if (e.key === 'd' || e.key === 'D') {
    e.preventDefault();
    const on = !document.body.dataset.gestureDebug;
    document.body.dataset.gestureDebug = on ? '1' : '';
    if (!on) delete document.body.dataset.gestureDebug;
    gestures.setDebug(on);
    toast(on ? 'camera preview on' : 'camera preview off');
  }
});

console.info('[gesture] press "g" to arm hand tracking, "d" for the camera preview');
