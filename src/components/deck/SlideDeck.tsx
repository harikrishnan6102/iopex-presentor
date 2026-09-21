import { useCallback, useEffect, useRef, useState } from 'react';
import type { ProductId } from '../../data/products';
import { controller, goHomeToCarousel, resetIdleTimer, resetZoom } from '../../kiosk/controller';
import { useDeckEffects } from './useDeckEffects';
import type { SlideDef } from './SlideDef';

interface Props {
  product: ProductId;
  /** Short prefix for element ids: k / ev / dk / pm / da. */
  prefix: string;
  slides: SlideDef[];
}

const TRANSITION_MS = 700; // keep in sync with the .k-slide CSS transition duration
type Dir = 'next' | 'prev';

/**
 * One product's kiosk deck: full-screen slides with the Framer-Motion-style
 * crossfade + slide + scale transition, labelled chips, prev/home/next arrows,
 * keyboard, swipe (touch + mouse drag) and wheel. Camera gestures arrive
 * through the same next/prev/goTo primitives via the kiosk controller (see
 * GestureHud). Only the open product's deck is mounted, so every window-level
 * listener here belongs to the deck that is actually on screen.
 */
export default function SlideDeck({ product, prefix, slides }: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const slideRefs = useRef<(HTMLElement | null)[]>([]);
  const flashLeft = useRef<HTMLDivElement>(null);
  const flashRight = useRef<HTMLDivElement>(null);
  const dotsRef = useRef<HTMLDivElement>(null);

  const TOTAL = slides.length;
  const [idx, setIdx] = useState(0);
  const st = useRef({
    idx: 0,
    transitioning: false,
    /** Latest slide asked for while a transition was still running. */
    pending: null as null | number,
    timers: [] as ReturnType<typeof setTimeout>[],
  });

  /* shortest rotational direction between the current slide and a target */
  const directionTo = useCallback((newIdx: number): Dir => {
    let diff = newIdx - st.current.idx;
    if (Math.abs(diff) > TOTAL / 2) diff = diff > 0 ? diff - TOTAL : diff + TOTAL;
    return diff < 0 ? 'prev' : 'next';
  }, [TOTAL]);

  const setIndex = useCallback(function setIndexImpl(n: number, dir?: Dir): void {
    resetIdleTimer();
    const s = st.current;
    const newIdx = ((n % TOTAL) + TOTAL) % TOTAL;

    // A tap that lands mid-transition used to be dropped on the floor, so a
    // presenter tapping chips at any speed would silently stay put (tap How,
    // tap Results, end up back on Intro). Remember the last one asked for and
    // run it when the current transition finishes — the newest request wins,
    // so a burst of taps resolves to wherever they actually pointed last.
    if (s.transitioning) {
      s.pending = newIdx;
      return;
    }
    s.pending = null;
    if (newIdx === s.idx) return;
    const direction = dir || directionTo(newIdx);
    const oldEl = slideRefs.current[s.idx];
    const newEl = slideRefs.current[newIdx];
    if (!oldEl || !newEl) return;
    resetZoom(); // a gesture zoom belongs to the slide it was made on
    s.idx = newIdx;
    s.transitioning = true;
    setIdx(newIdx);

    const all = ['k-exit-left', 'k-exit-right', 'k-enter-left', 'k-enter-right'];
    newEl.classList.remove(...all);
    oldEl.classList.remove(...all);
    newEl.classList.add(direction === 'next' ? 'k-enter-right' : 'k-enter-left');
    void newEl.offsetWidth; // force layout so the entering position registers before animating

    requestAnimationFrame(() => {
      newEl.classList.remove('k-enter-right', 'k-enter-left');
      newEl.classList.add('active');
      oldEl.classList.remove('active');
      oldEl.classList.add(direction === 'next' ? 'k-exit-left' : 'k-exit-right');
    });

    s.timers.push(setTimeout(() => {
      oldEl.classList.remove('k-exit-left', 'k-exit-right');
      oldEl.scrollTop = 0; // a tall slide starts back at the top next time
      s.transitioning = false;
      const queued = s.pending;
      s.pending = null;
      if (queued !== null && queued !== s.idx) setIndexImpl(queued);
    }, TRANSITION_MS));
  }, [TOTAL, directionTo]);

  const flash = useCallback((dir: Dir) => {
    const el = dir === 'next' ? flashRight.current : flashLeft.current;
    if (!el) return;
    el.classList.add('show');
    st.current.timers.push(setTimeout(() => el.classList.remove('show'), 260));
  }, []);

  /* next/prev/goTo are the shared primitives every input mode calls.

     A relative step counts from wherever the deck is *heading*, not where it
     currently is, so four quick taps on the next arrow advance four slides
     rather than collapsing into one. Picking a chip is absolute, so there the
     newest pick simply replaces the pending one (see setIndex). */
  const step = useCallback((delta: number, dir: Dir) => {
    const s = st.current;
    setIndex((s.pending ?? s.idx) + delta, dir);
    flash(dir);
  }, [setIndex, flash]);
  const next = useCallback(() => { step(1, 'next'); }, [step]);
  const prev = useCallback(() => { step(-1, 'prev'); }, [step]);
  const goTo = useCallback((n: number) => { setIndex(n); }, [setIndex]);

  /* first slide starts visible; register the deck with the controller */
  useEffect(() => {
    slideRefs.current[0]?.classList.add('active');
    const unregister = controller.registerDeck({
      product,
      labels: slides.map((s) => s.label),
      index: () => st.current.idx,
      next, prev, goTo,
    });
    return () => {
      unregister();
      st.current.timers.forEach(clearTimeout);
      st.current.timers = [];
    };
  }, [product, slides, next, prev, goTo]);

  /* active chip scrolls into view within the (horizontally scrollable) bar */
  useEffect(() => {
    const dots = dotsRef.current?.querySelectorAll<HTMLElement>('.k-dot');
    const active = dots?.[idx];
    if (active?.scrollIntoView) active.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
  }, [idx]);

  /* keyboard */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') next(); else if (e.key === 'ArrowLeft') prev();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [next, prev]);

  /* swipe anywhere on the page — touch and mouse drag. Vertical drags scroll
     a tall slide's own content first; a slide change only fires once that
     content is at the relevant edge. */
  useEffect(() => {
    const SWIPE_PX = 42, FLICK_V = 0.35;
    let sx: number | null = null, sy = 0, stTime = 0, active = false, lastX = 0, lastY = 0;
    const cur = () => slideRefs.current[st.current.idx];

    const onStart = (x: number, y: number, target: EventTarget | null) => {
      const t = target as Element | null;
      if (t && t.closest && t.closest('.stage, input, button, a')) { active = false; return; }
      active = true; sx = x; sy = y; lastX = x; lastY = y; stTime = performance.now();
    };
    const onMove = (x: number, y: number) => {
      if (!active) return;
      const slideEl = cur();
      if (slideEl && slideEl.scrollHeight > slideEl.clientHeight + 1) slideEl.scrollTop -= (y - lastY);
      lastX = x; lastY = y;
    };
    const onEnd = (x: number, y: number) => {
      if (!active || sx === null) return;
      active = false;
      const dx = x - sx, dy = y - sy;
      const dt = performance.now() - stTime;
      const dist = Math.max(Math.abs(dx), Math.abs(dy));
      const v = dt > 0 ? dist / dt : 0;
      if (dist > SWIPE_PX || v > FLICK_V) {
        if (Math.abs(dy) > Math.abs(dx)) {
          const slideEl = cur();
          const atBottom = !slideEl || slideEl.scrollTop + slideEl.clientHeight >= slideEl.scrollHeight - 2;
          const atTop = !slideEl || slideEl.scrollTop <= 1;
          if (dy < 0 && atBottom) next();
          else if (dy > 0 && atTop) prev();
        } else {
          if (dx < 0) next(); else prev();
        }
      }
      sx = null;
    };

    const ts = (e: TouchEvent) => onStart(e.touches[0].clientX, e.touches[0].clientY, e.target);
    const tm = (e: TouchEvent) => { if (active) e.preventDefault(); onMove(e.touches[0].clientX, e.touches[0].clientY); };
    const te = (e: TouchEvent) => onEnd(e.changedTouches[0].clientX, e.changedTouches[0].clientY);
    const tc = () => onEnd(lastX, lastY);
    const md = (e: MouseEvent) => onStart(e.clientX, e.clientY, e.target);
    const mu = (e: MouseEvent) => onEnd(e.clientX, e.clientY);

    window.addEventListener('touchstart', ts, { passive: true });
    window.addEventListener('touchmove', tm, { passive: false });
    window.addEventListener('touchend', te, { passive: true });
    window.addEventListener('touchcancel', tc, { passive: true });
    window.addEventListener('mousedown', md);
    window.addEventListener('mouseup', mu);
    return () => {
      window.removeEventListener('touchstart', ts);
      window.removeEventListener('touchmove', tm);
      window.removeEventListener('touchend', te);
      window.removeEventListener('touchcancel', tc);
      window.removeEventListener('mousedown', md);
      window.removeEventListener('mouseup', mu);
    };
  }, [next, prev]);

  /* mouse wheel / trackpad — only changes slides once the active slide has
     reached the end of its own scrollable content in that direction */
  useEffect(() => {
    const WHEEL_THRESHOLD = 12, WHEEL_COOLDOWN_MS = 700;
    let cooldownUntil = 0;
    const onWheel = (e: WheelEvent) => {
      const now = performance.now();
      if (now < cooldownUntil) return;
      if (Math.abs(e.deltaY) < WHEEL_THRESHOLD) return;
      const activeEl = slideRefs.current[st.current.idx];
      if (activeEl) {
        const atBottom = activeEl.scrollTop + activeEl.clientHeight >= activeEl.scrollHeight - 2;
        const atTop = activeEl.scrollTop <= 1;
        if (e.deltaY > 0 && !atBottom) return;
        if (e.deltaY < 0 && !atTop) return;
      }
      e.preventDefault();
      cooldownUntil = now + WHEEL_COOLDOWN_MS;
      if (e.deltaY > 0) next(); else prev();
    };
    window.addEventListener('wheel', onWheel, { passive: false });
    return () => window.removeEventListener('wheel', onWheel);
  }, [next, prev]);

  /* reveal / counters / tilt scoped to this deck */
  useDeckEffects(rootRef);

  return (
    <div id={`${product}-view`} ref={rootRef} style={{ display: 'block' }}>
      <div className="k-viewport">
        <div className="k-track" id={`${prefix}Track`}>
          {slides.map((s, i) => (
            <section
              key={s.label + i}
              id={s.id}
              className={`${s.className ? s.className + ' ' : ''}k-slide`}
              data-label={s.label}
              ref={(el) => { slideRefs.current[i] = el; }}
            >
              {s.content}
            </section>
          ))}
        </div>
      </div>

      {/* kiosk bottom bar: labelled chips · prev arrow · home · next arrow */}
      <div className="k-dots" id={`${prefix}Dots`} ref={dotsRef}>
        {slides.map((s, i) => (
          <button
            key={s.label + i}
            className={`k-dot${i === idx ? ' active' : ''}`}
            aria-label={`Go to ${s.label}`}
            onClick={() => goTo(i)}
          >
            {s.label}
          </button>
        ))}
      </div>
      <div className="k-arrows">
        <button className="k-arrow k-prev" id={`${prefix}ArrowPrev`} aria-label="Previous" onClick={prev}>
          <svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7" /></svg>
        </button>
        <button className="k-arrow k-home" id={`${prefix}ArrowHome`} aria-label="Back to home" onClick={goHomeToCarousel}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 11.5 12 4l9 7.5" /><path d="M5 10v9a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1v-9" />
          </svg>
        </button>
        <button className="k-arrow k-next" id={`${prefix}ArrowNext`} aria-label="Next" onClick={next}>
          <svg viewBox="0 0 24 24"><path d="M9 5l7 7-7 7" /></svg>
        </button>
      </div>

      {/* edge flash on next / prev — feedback for swipes and gestures */}
      <div className="k-gesture-flash left" ref={flashLeft} />
      <div className="k-gesture-flash right" ref={flashRight} />
    </div>
  );
}
