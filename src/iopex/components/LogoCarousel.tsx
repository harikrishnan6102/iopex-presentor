import { useCallback, useEffect, useRef, useState } from 'react';
import { gsap } from 'gsap';
import { PRODUCTS, LIGHT_THEME_PRODUCTS, applyProductAccent } from '../data/products';
import { controller, openProduct } from '../kiosk/controller';

/* ---------- COVERFLOW LAYOUT ---------- */
const CF_SPACING = 30;   // % of stage width between each depth step
const CF_DURATION = 0.9; // seconds
const CF_EASE = 'power3.inOut';
const LC_CAPTION_MS = 700; // matches .lc-caption.fade / .lc-title-logo transition
const AUTOPLAY_INTERVAL_MS = 4200;

function shortestOffset(index: number, active: number, count: number): number {
  let raw = ((index - active) % count + count) % count;
  if (raw > count / 2) raw -= count;
  return raw;
}

/* small sparks flung outward from the logo's own on-screen position, in the
   product's just-applied accent pair (plain DOM + CSS keyframe) */
function spawnLogoParticleBurst(targetEl: HTMLElement | null): void {
  if (!targetEl || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const rect = targetEl.getBoundingClientRect();
  const cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2;
  const wrap = document.createElement('div');
  wrap.style.cssText = `position:fixed; left:${cx}px; top:${cy}px; width:0; height:0; z-index:60; pointer-events:none;`;
  const COUNT = 20;
  for (let i = 0; i < COUNT; i++) {
    const p = document.createElement('span');
    p.className = 'lc-particle';
    const angle = (Math.PI * 2 * i / COUNT) + (Math.random() * 0.5 - 0.25);
    const dist = 55 + Math.random() * 100;
    p.style.setProperty('--tx', `${Math.cos(angle) * dist}px`);
    p.style.setProperty('--ty', `${Math.sin(angle) * dist * 0.7 - 18}px`);
    p.style.animationDelay = `${Math.random() * 0.06}s`;
    wrap.appendChild(p);
  }
  document.body.appendChild(wrap);
  setTimeout(() => wrap.remove(), 950);
}

interface Props {
  heroRef: React.RefObject<HTMLElement | null>;
  hidden: boolean;
}

/**
 * Logo-split product carousel — a fixed layer between the 3D canvas and the
 * page. Fades in as the particle mark parts down the middle; once entered,
 * advances on its own (autoplay, default paused) with a coverflow glide.
 */
export default function LogoCarousel({ heroRef, hidden }: Props) {
  const lcRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLImageElement>(null);
  const cardRefs = useRef<(HTMLDivElement | null)[]>([]);

  const [activeIndex, setActiveIndex] = useState(0);
  const [caption, setCaption] = useState(() => PRODUCTS[0]);
  const [captionFade, setCaptionFade] = useState(false);
  const [autoplayRunning, setAutoplayRunning] = useState(false);

  // mutable state shared by timers, swipe handlers and the frame callback
  const st = useRef({
    activeIndex: 0,
    switching: false,
    autoplayRunning: false,
    autoplayUserPaused: true, // defaults to paused — the person hits play
    autoplayTimer: null as ReturnType<typeof setTimeout> | null,
    hasEntered: false,
    captionTimer: null as ReturnType<typeof setTimeout> | null,
    switchTimer: null as ReturnType<typeof setTimeout> | null,
  });

  const layoutCoverflow = useCallback((animate: boolean) => {
    const active = st.current.activeIndex;
    cardRefs.current.forEach((card, i) => {
      if (!card) return;
      const offset = shortestOffset(i, active, PRODUCTS.length);
      const abs = Math.abs(offset);
      card.classList.toggle('is-center', offset === 0);
      gsap.to(card, {
        xPercent: offset * CF_SPACING,
        rotateY: offset === 0 ? 0 : offset > 0 ? -38 : 38,
        scale: offset === 0 ? 1 : abs === 1 ? 0.74 : 0.56,
        opacity: offset === 0 ? 1 : abs === 1 ? 0.55 : 0.16,
        filter: offset === 0 ? 'blur(0px)' : abs === 1 ? 'blur(1.5px)' : 'blur(3px)',
        zIndex: 10 - abs,
        duration: animate ? CF_DURATION : 0,
        ease: CF_EASE,
      });
    });
  }, []);

  /* ---------- AUTOPLAY ---------- */
  const goToProductRef = useRef<(index: number, opts?: { manual?: boolean }) => void>(() => {});

  const scheduleAutoplay = useCallback(() => {
    const s = st.current;
    s.autoplayTimer = setTimeout(() => {
      goToProductRef.current(s.activeIndex + 1);
      if (s.autoplayRunning) scheduleAutoplay();
    }, AUTOPLAY_INTERVAL_MS);
  }, []);
  const startAutoplay = useCallback(() => {
    const s = st.current;
    if (s.autoplayRunning) return;
    s.autoplayRunning = true;
    setAutoplayRunning(true);
    scheduleAutoplay();
  }, [scheduleAutoplay]);
  const stopAutoplay = useCallback(() => {
    const s = st.current;
    s.autoplayRunning = false;
    setAutoplayRunning(false);
    if (s.autoplayTimer) clearTimeout(s.autoplayTimer);
  }, []);
  const restartAutoplay = useCallback(() => {
    const s = st.current;
    if (!s.autoplayRunning) return;
    if (s.autoplayTimer) clearTimeout(s.autoplayTimer);
    scheduleAutoplay();
  }, [scheduleAutoplay]);

  /* set without the caption fade — initial layout and "back to home" reset */
  const setActiveProduct = useCallback((index: number, animate: boolean) => {
    const s = st.current;
    s.activeIndex = index;
    setActiveIndex(index);
    const p = PRODUCTS[index];
    setCaption(p);
    applyProductAccent(p);
    layoutCoverflow(animate);
  }, [layoutCoverflow]);

  /* ---------- ADVANCING BETWEEN PRODUCTS ---------- */
  const goToProduct = useCallback((index: number, opts?: { manual?: boolean }) => {
    const s = st.current;
    index = ((index % PRODUCTS.length) + PRODUCTS.length) % PRODUCTS.length;
    if (index === s.activeIndex || s.switching) return;
    s.switching = true;
    setCaptionFade(true);
    if (s.captionTimer) clearTimeout(s.captionTimer);
    s.captionTimer = setTimeout(() => {
      const p = PRODUCTS[index];
      setCaption(p);
      setCaptionFade(false);
      applyProductAccent(p);
      spawnLogoParticleBurst(titleRef.current);
    }, LC_CAPTION_MS);
    s.activeIndex = index;
    setActiveIndex(index);
    layoutCoverflow(true);
    if (s.switchTimer) clearTimeout(s.switchTimer);
    s.switchTimer = setTimeout(() => { s.switching = false; }, CF_DURATION * 1000);
    if (opts?.manual) restartAutoplay();
  }, [layoutCoverflow, restartAutoplay]);
  goToProductRef.current = goToProduct;

  /* called every frame from the scene with the eased 0–1 split amount — this
     only drives the entering fade/split; once entered, autoplay takes over */
  const onSplit = useCallback((splitAmount: number) => {
    const lc = lcRef.current;
    const s = st.current;
    if (lc) {
      lc.style.opacity = String(splitAmount);
      lc.classList.toggle('interactive', splitAmount > 0.5);
    }
    const hero = heroRef.current;
    if (hero) {
      hero.style.opacity = String(1 - splitAmount);
      hero.style.pointerEvents = splitAmount > 0.5 ? 'none' : '';
    }
    if (splitAmount > 0.98 && !s.hasEntered) {
      s.hasEntered = true;
      if (!s.autoplayUserPaused) startAutoplay();
    } else if (splitAmount < 0.5 && s.hasEntered) {
      s.hasEntered = false;
      stopAutoplay();
    }
  }, [heroRef, startAutoplay, stopAutoplay]);

  /* initial layout + registration with the kiosk controller */
  useEffect(() => {
    setActiveProduct(0, false);
    if (stageRef.current) gsap.set(stageRef.current, { perspective: 1400 });
    const unregister = controller.registerCarousel({
      resetToFirst() {
        stopAutoplay();
        st.current.autoplayUserPaused = true;
        setActiveProduct(0, false);
      },
      step(delta) { goToProductRef.current(st.current.activeIndex + delta, { manual: true }); },
      focus(id) {
        const i = PRODUCTS.findIndex((p) => p.id === id);
        if (i < 0) return;
        // The guide is talking about this product; autoplay gliding on to the
        // next one three seconds later is exactly what must not happen.
        stopAutoplay();
        st.current.autoplayUserPaused = true;
        goToProductRef.current(i);
      },
      activeId() { return PRODUCTS[st.current.activeIndex].id; },
      openActive() { openProduct(PRODUCTS[st.current.activeIndex].page); },
      isEntered() { return !!lcRef.current?.classList.contains('interactive'); },
      onSplit,
    });
    return () => {
      unregister();
      const s = st.current;
      if (s.autoplayTimer) clearTimeout(s.autoplayTimer);
      if (s.captionTimer) clearTimeout(s.captionTimer);
      if (s.switchTimer) clearTimeout(s.switchTimer);
    };
  }, [setActiveProduct, stopAutoplay, onSplit]);

  /* ---------- TOUCH / DRAG SWIPE (scoped to the coverflow stage) ---------- */
  useEffect(() => {
    const stage = stageRef.current, lc = lcRef.current;
    if (!stage || !lc) return;
    const SWIPE_PX = 40;
    let sx = 0, sy = 0, dragging = false, moved = false, mouseDown = false;
    const onStart = (x: number, y: number) => {
      if (!lc.classList.contains('interactive')) { dragging = false; return; }
      dragging = true; moved = false; sx = x; sy = y;
    };
    const onMove = (x: number, y: number) => {
      if (!dragging) return;
      if (Math.abs(x - sx) > 10 || Math.abs(y - sy) > 10) moved = true;
    };
    const onEnd = (x: number, y: number) => {
      if (!dragging) return;
      dragging = false;
      const dx = x - sx, dy = y - sy;
      if (Math.abs(dx) > SWIPE_PX && Math.abs(dx) > Math.abs(dy)) {
        goToProductRef.current(st.current.activeIndex + (dx < 0 ? 1 : -1), { manual: true });
      }
    };
    const ts = (e: TouchEvent) => { const t = e.touches[0]; onStart(t.clientX, t.clientY); };
    const tm = (e: TouchEvent) => {
      const t = e.touches[0];
      onMove(t.clientX, t.clientY);
      if (dragging && moved) e.preventDefault();
    };
    const te = (e: TouchEvent) => { onEnd(e.changedTouches[0].clientX, e.changedTouches[0].clientY); };
    const tc = () => { dragging = false; };
    const md = (e: MouseEvent) => { mouseDown = true; onStart(e.clientX, e.clientY); };
    const mm = (e: MouseEvent) => { if (mouseDown) onMove(e.clientX, e.clientY); };
    const mu = (e: MouseEvent) => { if (mouseDown) { mouseDown = false; onEnd(e.clientX, e.clientY); } };
    /* capture-phase click suppressor: a drag-release never also counts as a card tap */
    const click = (e: MouseEvent) => { if (moved) { e.stopPropagation(); e.preventDefault(); moved = false; } };

    stage.addEventListener('touchstart', ts, { passive: true });
    stage.addEventListener('touchmove', tm, { passive: false });
    stage.addEventListener('touchend', te, { passive: true });
    stage.addEventListener('touchcancel', tc, { passive: true });
    stage.addEventListener('mousedown', md);
    window.addEventListener('mousemove', mm);
    window.addEventListener('mouseup', mu);
    stage.addEventListener('click', click, true);
    return () => {
      stage.removeEventListener('touchstart', ts);
      stage.removeEventListener('touchmove', tm);
      stage.removeEventListener('touchend', te);
      stage.removeEventListener('touchcancel', tc);
      stage.removeEventListener('mousedown', md);
      window.removeEventListener('mousemove', mm);
      window.removeEventListener('mouseup', mu);
      stage.removeEventListener('click', click, true);
    };
  }, []);

  const onCardClick = (i: number) => {
    if (i === st.current.activeIndex) openProduct(PRODUCTS[i].page);
    else goToProduct(i, { manual: true });
  };

  const onPlayPause = () => {
    if (st.current.autoplayRunning) {
      st.current.autoplayUserPaused = true;
      stopAutoplay();
    } else {
      st.current.autoplayUserPaused = false;
      startAutoplay();
    }
  };

  return (
    <div id="logo-carousel" aria-hidden="true" ref={lcRef} style={{ display: hidden ? 'none' : undefined }}>
      <div className="lc-stage" id="lc-stage" ref={stageRef}>
        {PRODUCTS.map((p, i) => (
          <div
            key={p.id}
            className="cf-card"
            role="button"
            aria-label={`View ${p.title}`}
            ref={(el) => { cardRefs.current[i] = el; }}
            onClick={() => onCardClick(i)}
          >
            <div className={`lc-fbar${LIGHT_THEME_PRODUCTS[p.id] ? ' theme-light' : ''}`}><span /><span /><span /></div>
            <div className="lc-shot-wrap"><img className="lc-shot" src={p.img} alt={p.title} /></div>
          </div>
        ))}
      </div>

      <div className={`lc-caption${captionFade ? ' fade' : ''}`} id="lc-caption">
        <img className="lc-title-logo" id="lc-title" src={caption.logo} alt={caption.title} ref={titleRef} />
        <p id="lc-tagline">{caption.tagline}</p>
      </div>

      <div className="lc-nav">
        <button
          className={`lc-playpause${autoplayRunning ? '' : ' is-paused'}`}
          id="lcPlayPause"
          type="button"
          aria-label={autoplayRunning ? 'Pause carousel autoplay' : 'Play carousel autoplay'}
          aria-pressed={!autoplayRunning}
          onClick={onPlayPause}
        >
          <svg className="icon-pause" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><rect x="3" y="2" width="4" height="12" rx="1" /><rect x="9" y="2" width="4" height="12" rx="1" /></svg>
          <svg className="icon-play" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M4 2.6c0-.9 1-1.5 1.8-1l8 5.4c.7.5.7 1.5 0 2l-8 5.4c-.8.5-1.8-.1-1.8-1V2.6z" /></svg>
        </button>
        <div className="lc-dots" id="lc-dots">
          {PRODUCTS.map((p, i) => (
            <button
              key={p.id}
              className={`dot${i === activeIndex ? ' current' : ''}`}
              aria-label={`Go to ${p.title}`}
              onClick={() => goToProduct(i, { manual: true })}
            />
          ))}
        </div>
      </div>

      <div className="lc-product-links" id="lc-product-links">
        {PRODUCTS.map((p, i) => (
          <button
            key={p.id}
            className={`lc-product-link${i === activeIndex ? ' current' : ''}`}
            aria-label={`Go to ${p.title}`}
            onClick={() => openProduct(p.page)}
          >
            {p.title}
          </button>
        ))}
      </div>
    </div>
  );
}
