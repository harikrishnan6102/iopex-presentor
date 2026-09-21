import { useEffect, useRef } from 'react';
import { gsap } from 'gsap';
import { HERO_SLIDES, HERO_SLIDE_ORDER, type ProductId } from '../data/products';
import { openProduct, anyProductOpen } from '../kiosk/controller';

const HERO_ROTATE_MS = 8500;
const HERO_TRANSITION_MS = 800; // keep in sync with the .hero-slide CSS transition

/**
 * Per-letter "TextRoll" headline: one span per letter (decorative), plus the
 * full text for screen readers.
 */
function RollTitle({ text }: { text: string }) {
  return (
    <h1 data-rollified="true">
      {text.split('').map((ch, i) => (
        <span className="htr-letter" aria-hidden="true" key={i}>
          <span className="htr-inner">{ch === ' ' ? ' ' : ch}</span>
        </span>
      ))}
      <span className="sr-only">{text}</span>
    </h1>
  );
}

/* 'out' rotates each letter forward and away, 'in' rotates each down into
   place, staggered for the rolling feel. */
function rollHeroTitle(h1El: HTMLElement | null, mode: 'in' | 'out'): void {
  if (!h1El) return;
  h1El.querySelectorAll<HTMLElement>('.htr-letter').forEach((letterEl, i) => {
    letterEl.classList.remove('htr-roll-in', 'htr-roll-out');
    void letterEl.offsetWidth; // force reflow so the animation restarts cleanly
    const inner = letterEl.querySelector<HTMLElement>('.htr-inner');
    if (inner) inner.style.animationDelay = `${i * 0.025}s`;
    letterEl.classList.add(mode === 'in' ? 'htr-roll-in' : 'htr-roll-out');
  });
}

interface HeroProps { heroRef: React.RefObject<HTMLElement | null> }

/** Rotating hero banner — logo + headline + lede per product, cycling on a timer. */
export default function Hero({ heroRef }: HeroProps) {
  const slideRefs = useRef<Partial<Record<ProductId, HTMLDivElement | null>>>({});

  useEffect(() => {
    // Entrance
    const tween = gsap.from('.hero-rotator, .scroll-cue', {
      opacity: 0, y: 24, duration: 0.9, stagger: 0.08, ease: 'power2.out', delay: 0.2,
    });

    const slides = HERO_SLIDE_ORDER.map((id) => slideRefs.current[id]).filter((el): el is HTMLDivElement => !!el);
    let idx = 0;
    let timer: ReturnType<typeof setInterval> | null = null;
    const leavingTimers: ReturnType<typeof setTimeout>[] = [];

    if (slides.length > 1) {
      timer = setInterval(() => {
        if (anyProductOpen()) return; // hold the cycle while a product page covers the screen
        const current = slides[idx];
        idx = (idx + 1) % slides.length;
        const next = slides[idx];
        current.classList.remove('is-active');
        current.classList.add('is-leaving');
        rollHeroTitle(current.querySelector('h1'), 'out');
        leavingTimers.push(setTimeout(() => current.classList.remove('is-leaving'), HERO_TRANSITION_MS));
        next.classList.add('is-active');
        rollHeroTitle(next.querySelector('h1'), 'in');
        /* The particle symbol stays put while the hero cycles: no per-product
           camera drift and no formation replay on each loop — the mark is brand
           identity, and re-flying it every 40s read as the page glitching. */
      }, HERO_ROTATE_MS);
    }

    return () => {
      tween.kill();
      if (timer) clearInterval(timer);
      leavingTimers.forEach(clearTimeout);
    };
  }, []);

  return (
    <section className="hero" ref={heroRef}>
      <div className="hero-rotator" id="hero-rotator">
        {HERO_SLIDES.map((s) => (
          <div
            key={s.id}
            className={`hero-slide${s.id === 'elevaite' ? ' is-active' : ''}`}
            id={`hero-slide-${s.id}`}
            data-product={s.id}
            style={{ cursor: 'pointer' }}
            ref={(el) => { slideRefs.current[s.id] = el; }}
            onClick={() => openProduct(s.id)}
          >
            <img className="hero-slide-logo" src={s.logo} alt={s.alt} />
            <RollTitle text={s.title} />
            <p className="lede">{s.lede}</p>
          </div>
        ))}
      </div>
      <div
        className="scroll-cue"
        id="scrollCue"
        style={{ cursor: 'pointer' }}
        onClick={() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'smooth' })}
      >
        <span>SCROLL</span><span className="line" />
      </div>
    </section>
  );
}
