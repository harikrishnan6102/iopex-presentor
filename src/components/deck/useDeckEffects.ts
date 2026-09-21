import { useEffect, type RefObject } from 'react';
import { gsap } from 'gsap';

/**
 * Per-deck micro-interactions, scoped to the deck's root element:
 *   - [data-tilt]  mouse-tilt cards (fine pointers only)
 *   - [data-anim]  scroll reveal
 *   - [data-count] counters
 *   - .ring-grid   scoring rings (kept for parity; no slide uses them today)
 */
export function useDeckEffects(rootRef: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const isFine = window.matchMedia('(hover:hover) and (pointer:fine)').matches && window.innerWidth > 900;
    const cleanups: (() => void)[] = [];

    /* tilt */
    if (isFine) {
      root.querySelectorAll<HTMLElement>('[data-tilt]').forEach((el) => {
        const rotX = gsap.quickTo(el, 'rotationX', { duration: 0.5, ease: 'power3' });
        const rotY = gsap.quickTo(el, 'rotationY', { duration: 0.5, ease: 'power3' });
        gsap.set(el, { transformPerspective: 1000 });
        const move = (e: MouseEvent) => {
          const r = el.getBoundingClientRect();
          const px = (e.clientX - r.left) / r.width - 0.5;
          const py = (e.clientY - r.top) / r.height - 0.5;
          rotY(px * 14); rotX(py * -14);
        };
        const leave = () => { rotX(0); rotY(0); };
        el.addEventListener('mousemove', move);
        el.addEventListener('mouseleave', leave);
        cleanups.push(() => { el.removeEventListener('mousemove', move); el.removeEventListener('mouseleave', leave); });
      });
    }

    /* scroll reveal */
    const timers: ReturnType<typeof setTimeout>[] = [];
    const io = new IntersectionObserver((entries) => {
      entries.forEach((en, i) => {
        if (en.isIntersecting) {
          timers.push(setTimeout(() => en.target.classList.add('in'), i * 60));
          io.unobserve(en.target);
        }
      });
    }, { threshold: 0.2 });
    root.querySelectorAll('[data-anim]').forEach((el) => io.observe(el));

    /* counters */
    const tweens: gsap.core.Tween[] = [];
    const animateCount = (el: HTMLElement) => {
      const target = parseFloat(el.getAttribute('data-count') || '0');
      const suffix = el.getAttribute('data-suffix') || '';
      const obj = { v: 0 };
      tweens.push(gsap.to(obj, {
        v: target, duration: 1.6, ease: 'power2.out',
        onUpdate: () => { el.textContent = Math.round(obj.v) + suffix; },
      }));
    };
    const countIO = new IntersectionObserver((entries) => {
      entries.forEach((en) => {
        if (en.isIntersecting) { animateCount(en.target as HTMLElement); countIO.unobserve(en.target); }
      });
    }, { threshold: 0.6 });
    root.querySelectorAll('[data-count]').forEach((el) => countIO.observe(el));

    /* scoring rings */
    const animateRings = (scope: Element) => {
      scope.querySelectorAll<SVGElement>('.ring').forEach((c) => {
        const pct = parseFloat(c.getAttribute('data-pct') || '0');
        const len = 100.5;
        tweens.push(gsap.to(c, { strokeDashoffset: len - (len * pct / 100), duration: 1.4, ease: 'power2.out' }));
      });
      scope.querySelectorAll<HTMLElement>('.num').forEach((n) => {
        const t = parseFloat(n.getAttribute('data-num') || '0');
        const o = { v: 0 };
        tweens.push(gsap.to(o, { v: t, duration: 1.3, ease: 'power2.out', onUpdate: () => { n.textContent = String(Math.round(o.v)); } }));
      });
    };
    const ringIO = new IntersectionObserver((entries) => {
      entries.forEach((en) => { if (en.isIntersecting) { animateRings(en.target); ringIO.unobserve(en.target); } });
    }, { threshold: 0.4 });
    root.querySelectorAll('.ring-grid').forEach((el) => ringIO.observe(el));

    return () => {
      cleanups.forEach((fn) => fn());
      timers.forEach(clearTimeout);
      tweens.forEach((t) => t.kill());
      io.disconnect(); countIO.disconnect(); ringIO.disconnect();
    };
  }, [rootRef]);
}
