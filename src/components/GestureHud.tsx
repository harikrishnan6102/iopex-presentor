import { useCallback, useEffect, useRef, useState } from 'react';
import { createGestureEngine, type Gesture, type HudFrame, type Phase, type Pose, type SwipeDir } from '../gesture/gestureEngine';
import {
  controller, applyZoom, currentZoom, enterCarousel, goHomeToCarousel, leaveCarousel, resetZoom, setMode,
} from '../kiosk/controller';
import { useKioskState, openProductKey } from '../kiosk/store';

/**
 * The gesture remote for the demo — binds the gesture engine to the kiosk and
 * shows the presenter (and the room) what the camera sees.
 *
 *   Gesture mode button / `g`      camera on → live at once, no wake gesture
 *   open-palm sweep ← → ↑ ↓        home, hero showing:  ↑ or → enters the carousel
 *                                  home, carousel:      → ← next / previous product, ↓ back to the logo
 *                                  product deck:        → ↑ next slide, ← ↓ previous slide
 *   thumbs up                      "click": hero → carousel · carousel → open the centred product
 *                                  deck → start the voice AI guide
 *   fist, hold                     → home carousel
 *   two fingers, hold              → start / continue the voice AI agent
 *   one finger, hold               → pause the agent
 *   both hands pinch, spread       → zoom in / out around the hands
 *
 * The HUD is a small bottom-left panel: live mirrored camera with the hand
 * skeleton, a state line, the gesture legend with the active one lit, a hold
 * progress ring so a hold never feels like "nothing is happening", and the
 * zoom factor while zooming.
 */

interface Legend { g: Gesture | 'swipe' | 'zoom'; icon: string; label: string; pose?: Pose }
const LEGEND: Legend[] = [
  { g: 'swipe', icon: '🖐', label: 'sweep ←→↑↓ · move', pose: 'open' },
  { g: 'select', icon: '👍', label: 'thumbs up · select', pose: 'thumbsUp' },
  { g: 'home', icon: '✊', label: 'fist · home', pose: 'fist' },
  { g: 'voiceResume', icon: '✌️', label: 'two · AI on / continue', pose: 'two' },
  { g: 'voicePause', icon: '☝️', label: 'one · AI pause', pose: 'one' },
  { g: 'zoom', icon: '🤏🤏', label: 'two pinch · zoom' },
];

const PHASE_LABEL: Record<Phase, string> = {
  off: 'camera off',
  loading: 'starting…',
  active: 'live',
  error: 'unavailable',
};

const PREVIEW_W = 224, PREVIEW_H = 168;

export default function GestureHud() {
  const { mode } = useKioskState();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ringRef = useRef<SVGCircleElement>(null);
  const zoomRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<ReturnType<typeof createGestureEngine> | null>(null);

  const [phase, setPhase] = useState<Phase>('off');
  const [detail, setDetail] = useState<string>('');
  const [frame, setFrame] = useState<Pick<HudFrame, 'pose' | 'holding' | 'hands' | 'zooming'>>({
    pose: null, holding: null, hands: 0, zooming: false,
  });
  const [toast, setToast] = useState<string>('');
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastFrame = useRef<HudFrame | null>(null);
  const lastIdleReset = useRef(0);

  const say = useCallback((msg: string, ms = 1400) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), ms);
  }, []);

  /* --------------------------------------------------------- bindings ---- */

  const onGesture = useCallback((g: Gesture) => {
    controller.resetIdleTimer();
    const voice = controller.voice;
    const voiceLive = !!voice && voice.state() !== 'idle' && voice.state() !== 'error';
    switch (g) {
      case 'select': {
        // Thumbs up is the click. What it clicks depends on what is in front of the room.
        if (openProductKey()) {
          if (!voice) { say('voice guide not ready'); return; }
          if (voice.state() === 'paused') { voice.resume(); say('AI agent continued'); return; }
          if (voiceLive) { say('AI guide is live · sweep for slides'); return; }
          void voice.start();
          say('starting AI guide…');
          return;
        }
        const car = controller.carousel;
        if (!car) return;
        if (!car.isEntered()) { enterCarousel(); say('carousel'); return; }
        car.openActive();
        say('opening…');
        break;
      }
      case 'home':
        goHomeToCarousel();
        say('home');
        break;
      case 'voiceResume': {
        if (!voice) { say('voice guide not ready'); return; }
        if (voice.state() === 'paused') { voice.resume(); say('AI agent continued'); return; }
        if (voiceLive) { say('AI agent is live'); return; }
        void voice.start();
        say('starting AI agent…');
        break;
      }
      case 'voicePause':
        if (!voice || !voiceLive) { say('no AI call to pause'); return; }
        if (voice.pause()) say('AI agent paused'); else say('already paused');
        break;
    }
  }, [say]);

  const onSwipe = useCallback((dir: SwipeDir) => {
    controller.resetIdleTimer();
    /* Toward the presenter's right = forward, which is the on-screen arrow and
       every remote control ever made. It used to be left — the touchscreen
       metaphor of pushing content away — and presenting with it reads as
       inverted, because nobody is touching the content. Up stays forward so a
       sweep in either "onward" direction advances. */
    const forward = dir === 'right' || dir === 'up';
    const key = openProductKey();
    if (key) {
      const deck = controller.deck;
      if (!deck) return;
      if (forward) deck.next(); else deck.prev();
      controller.voice?.say(
        `The presenter moved to the ${forward ? 'next' : 'previous'} slide by hand gesture. Do not re-greet; carry on from here.`,
      );
      say(forward ? 'next ›' : '‹ previous');
      return;
    }
    const car = controller.carousel;
    if (!car) return;
    if (!car.isEntered()) {
      // Hero showing: any forward sweep brings the carousel up
      if (forward) { enterCarousel(); say('carousel'); }
      return;
    }
    if (dir === 'down') { leaveCarousel(); say('logo'); return; }
    if (dir === 'up') { car.openActive(); say('opening…'); return; }
    car.step(dir === 'right' ? 1 : -1);
    say(dir === 'right' ? 'next ›' : '‹ previous');
  }, [say]);

  /* ----------------------------------------------------------- engine ---- */

  useEffect(() => {
    const engine = createGestureEngine({
      currentZoom,
      onPhase: (p, d) => {
        setPhase(p);
        setDetail(d || '');
        if (p === 'error') console.warn('[gesture]', d); // stays on screen until Manual is chosen
        if (p === 'active') { controller.resetIdleTimer(); say('gestures live'); }
      },
      onGesture,
      onSwipe,
      onZoom: ({ scale, x, y, active }) => {
        if (active) applyZoom(scale, x, y);
        else if (scale <= 1.001) resetZoom();
        else applyZoom(scale, x, y);
        if (zoomRef.current) {
          zoomRef.current.textContent = `${scale.toFixed(2)}×`;
          zoomRef.current.style.opacity = active || scale > 1.001 ? '1' : '0';
        }
      },
      onFrame: (f) => {
        // A presenter gesturing is not "idle": keep the attract loop away while
        // a hand is in frame (throttled — this runs ~30×/s).
        if (f.hands > 0 && performance.now() - lastIdleReset.current > 5000) {
          lastIdleReset.current = performance.now();
          controller.resetIdleTimer();
        }
        // Progress ring is driven directly (it changes every frame); the rest
        // only re-renders when a discrete value changes.
        if (ringRef.current) {
          const C = 2 * Math.PI * 26;
          ringRef.current.style.strokeDashoffset = String(C * (1 - f.holdProgress));
          ringRef.current.style.opacity = f.holding ? '1' : '0';
        }
        const prev = lastFrame.current;
        if (!prev || prev.pose !== f.pose || prev.holding !== f.holding || prev.hands !== f.hands || prev.zooming !== f.zooming) {
          setFrame({ pose: f.pose, holding: f.holding, hands: f.hands, zooming: f.zooming });
        }
        lastFrame.current = f;
      },
    });
    engineRef.current = engine;
    window.IopexGesture = engine;
    if (canvasRef.current) engine.attachPreview(canvasRef.current);

    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      if (e.key === 'g' || e.key === 'G') {
        e.preventDefault();
        setMode(engine.phase() === 'off' ? 'gesture' : 'manual');
      }
    };
    window.addEventListener('keydown', onKey);
    console.info('[gesture] Gesture mode button or "g": camera on, gestures live at once.');

    return () => {
      window.removeEventListener('keydown', onKey);
      if (window.IopexGesture === engine) delete window.IopexGesture;
      engine.destroy();
      engineRef.current = null;
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, [onGesture, onSwipe, say]);

  /* the header switch is the on/off for the camera */
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    if (mode === 'gesture') void engine.start();
    else engine.stop();
  }, [mode]);

  /* attach the preview canvas whenever it (re)mounts */
  useEffect(() => {
    engineRef.current?.attachPreview(mode === 'gesture' ? canvasRef.current : null);
  }, [mode, phase]);

  if (mode !== 'gesture' && phase === 'off') return null;

  const activeLegend = (l: Legend): boolean => {
    if (frame.zooming) return l.g === 'zoom';
    if (frame.holding) return l.g === frame.holding;
    return !!l.pose && l.pose === frame.pose;
  };

  return (
    <aside className={`ghud ghud-${phase}`} aria-label="Gesture control">
      <div className="ghud-cam">
        <canvas ref={canvasRef} width={PREVIEW_W} height={PREVIEW_H} />
        <svg className="ghud-ring" viewBox="0 0 60 60" aria-hidden="true">
          <circle cx="30" cy="30" r="26" className="ghud-ring-bg" />
          <circle cx="30" cy="30" r="26" className="ghud-ring-fg" ref={ringRef} style={{ strokeDasharray: 2 * Math.PI * 26 }} />
        </svg>
        <div className="ghud-zoom" ref={zoomRef} style={{ opacity: 0 }}>1.00×</div>
        <div className={`ghud-dot ${phase}`} />
        {phase === 'loading' && <div className="ghud-wake">{detail}</div>}
        {phase === 'error' && <div className="ghud-wake err">{detail}</div>}
      </div>
      <div className="ghud-state">
        <span className="ghud-phase">{PHASE_LABEL[phase]}</span>
        <span className="ghud-hands">{frame.hands ? `${frame.hands} hand${frame.hands > 1 ? 's' : ''}` : 'no hand'}</span>
      </div>
      <ul className="ghud-legend">
        {LEGEND.map((l) => (
          <li key={l.g} className={activeLegend(l) ? 'on' : undefined}>
            <span className="ghud-ico" aria-hidden="true">{l.icon}</span>{l.label}
          </li>
        ))}
      </ul>
      <div className={`ghud-toast${toast ? ' show' : ''}`}>{toast}</div>
    </aside>
  );
}
