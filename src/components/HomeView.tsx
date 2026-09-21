import { useRef } from 'react';
import Hero from './Hero';
import LogoCarousel from './LogoCarousel';
import { useKioskState } from '../kiosk/store';

/**
 * The home surface: fixed logo-split carousel + the scrolling <main> (hero and
 * three short product "scroll slots" whose content is hidden by CSS — they only
 * add the scroll distance that drives the hero→carousel scrub).
 *
 * Kept mounted while a product deck is open (display:none, like the original)
 * so the carousel keeps its state and GSAP transforms.
 */
export default function HomeView() {
  const { view } = useKioskState();
  const hidden = view !== 'home';
  const heroRef = useRef<HTMLElement | null>(null);

  return (
    <>
      <LogoCarousel heroRef={heroRef} hidden={hidden} />

      <main style={{ display: hidden ? 'none' : undefined }}>
        <Hero heroRef={heroRef} />

        <section className="product" id="digivox">
          <div className="wrap">
            <div className="p-text">
              <div className="status live"><span className="dot" />Live</div>
              <h2>DigiVox</h2>
              <p className="desc">AI interview and proctoring platform — live today. DigiVox runs live, adaptive interviews end to end: scheduling, questioning, scoring, and proctoring, so your hiring team spends its time deciding, not coordinating.</p>
              <div className="p-stats">
                <div className="p-stat"><b>1,200+</b><span>candidates interviewed</span></div>
                <div className="p-stat"><b>800+</b><span>interviews · Manila</span></div>
                <div className="p-stat"><b>300+</b><span>interviews · India</span></div>
              </div>
            </div>
            <div className="shot-frame">
              <div className="fbar"><span /><span /><span /></div>
              <img src="https://aurora.growatiopex.com/sites/default/files/2026-09/digivox-homescreen.png" alt="DigiVox home screen — My Interviews dashboard" loading="lazy" />
            </div>
          </div>
        </section>

        <section className="product reverse" id="digiaura">
          <div className="wrap">
            <div className="p-text">
              <div className="status dev"><span className="dot" />Coming soon</div>
              <h2>DigiAura</h2>
              <p className="desc">The next product in the iOPEX suite. Screens are coming soon — DigiAura extends the same focused, production-grade approach to a new part of the operations workflow.</p>
            </div>
            <div className="shot-frame">
              <div className="fbar"><span /><span /><span /></div>
              <img src="https://aurora.growatiopex.com/sites/default/files/2026-09/digiaura.png" alt="DigiAura product preview" loading="lazy" />
            </div>
          </div>
        </section>

        <section className="product" id="digikoach">
          <div className="wrap">
            <div className="p-text">
              <div className="status dev"><span className="dot" />Coming soon</div>
              <h2>DigiKoach</h2>
              <p className="desc">AI coaching and development platform — coming soon. DigiKoach brings structured, ongoing coaching to every stage of an employee's growth.</p>
            </div>
            <div className="shot-frame">
              <div className="fbar"><span /><span /><span /></div>
              <img src="https://aurora.growatiopex.com/sites/default/files/2026-09/267a76ca-a13b-494c-9348-638cc21d0e0f.png" alt="DigiKoach product preview" loading="lazy" />
            </div>
          </div>
        </section>
      </main>
    </>
  );
}
