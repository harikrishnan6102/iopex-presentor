import { useEffect, useRef } from 'react';
import { useKioskState } from '../kiosk/store';
import { controller, goHomeToCarousel, setMode } from '../kiosk/controller';

const BRAND_LOGO = 'https://www.growatiopex.com/assets/img/brand/logos/horizontal/svg/horizontal-white.svg';

/** Shared fixed header: brand (→ home carousel) and the Manual/Gesture switch. */
/** A drag has to travel this far across the logo before it counts as a swipe. */
const SWIPE_PX = 36;

export default function Dock() {
  const { mode } = useKioskState();
  const drag = useRef<{ x: number; y: number } | null>(null);
  const swiped = useRef(false);

  /* Swiping the brand logo reveals the humanoid guide; the logo's own job
     (tap = back to the carousel) still works, because a swipe suppresses the
     click that the browser fires after it. The deck's global swipe handler
     ignores anything inside an <a>, so these do not fight.

     Any direction counts, up included — which is the one people reach for, and
     also the one that leaves the logo's own box mid-gesture. Pointer capture is
     what makes that work: without it the release lands on whatever is under the
     finger by then and never reaches this handler at all.

     Reveal only — never a toggle. The logo is a wide target across the top of
     the screen, so a presenter swiping between slides would catch it in
     passing and put the guide away without meaning to. Once the humanoid is up
     it stays up; it comes down when the call ends, or with the panel's own x. */
  const onLogoDown = (e: React.PointerEvent) => {
    drag.current = { x: e.clientX, y: e.clientY };
    swiped.current = false;
  };

  /* The gesture starts on the logo but finishes on the window. An upward swipe
     leaves the logo's box almost immediately, so a pointerup bound to the
     element itself never fires — which is why only sideways swipes worked.
     Window-level means the release is caught wherever the finger ends up, and
     it still runs before the click, so the tap suppression below holds. */
  useEffect(() => {
    const finish = (e: PointerEvent) => {
      const d = drag.current;
      drag.current = null;
      if (!d) return;
      if (Math.hypot(e.clientX - d.x, e.clientY - d.y) < SWIPE_PX) return;
      swiped.current = true;
      controller.voice?.setRevealed(true);
    };
    const cancel = () => { drag.current = null; };
    window.addEventListener('pointerup', finish);
    window.addEventListener('pointercancel', cancel);
    return () => {
      window.removeEventListener('pointerup', finish);
      window.removeEventListener('pointercancel', cancel);
    };
  }, []);

  return (
    <header className="dock">
      <div className="brand">
        <a
          href="#"
          aria-label="Back to top"
          title="Tap for the home carousel · swipe to bring up the guide (any direction)"
          style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', touchAction: 'none' }}
          onPointerDown={onLogoDown}
          onClick={(e) => {
            e.preventDefault();
            if (swiped.current) { swiped.current = false; return; }
            goHomeToCarousel();
          }}
        >
          <img className="brand-logo" id="brandLogo" src={BRAND_LOGO} alt="iOPEX Technologies" />
          <span className="brand-divider" />
          <span className="site-portal-name">Experience</span>
        </a>
      </div>
      <nav className="nav-links" style={{ display: 'none' }}>
        <a href="#digivox">DigiVox</a>
      </nav>
      <div className="dock-right">
        {/* visible on every view so the presenter can arm the camera before
            opening a product — the whole kiosk is gesture-driven from here */}
        <div className={`k-mode k-mode-icon k-mode-2 mode-${mode}`} id="modeSwitch">
          <div className="k-mode-thumb" />
          <button
            className={mode === 'manual' ? 'active' : undefined}
            data-mode="manual"
            aria-label="Manual mode"
            title="Manual mode"
            onClick={() => setMode('manual')}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 11.5V5a1.5 1.5 0 0 1 3 0v5M12 10V4a1.5 1.5 0 0 1 3 0v6M15 10.5V6a1.5 1.5 0 0 1 3 0v8a6 6 0 0 1-6 6h-1.5a5 5 0 0 1-4-2l-3.1-4.4a1.4 1.4 0 0 1 2.2-1.7L8 14" />
            </svg>
          </button>
          <button
            className={mode === 'gesture' ? 'active' : undefined}
            data-mode="gesture"
            aria-label="Gesture mode (camera)"
            title="Gesture mode — camera on, gestures live at once"
            onClick={() => setMode('gesture')}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M23 7l-7 5 7 5V7z" />
              <rect x="1" y="5" width="15" height="14" rx="2" />
            </svg>
          </button>
        </div>
        <button className="theme-btn" id="themeToggle" aria-label="Toggle theme" style={{ display: 'none' }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
          </svg>
        </button>
      </div>
    </header>
  );
}
