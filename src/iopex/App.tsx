import { useEffect } from 'react';
import CanvasBackground from './components/CanvasBackground';
import Dock from './components/Dock';
import HomeView from './components/HomeView';
import ProductView from './components/ProductView';
import VoiceGuide from './components/VoiceGuide';
import GestureHud from './components/GestureHud';
import { useKioskState } from './kiosk/store';
import { exposeGlobals, refreshScroll, resetIdleTimer, routeFromHash, setAttractEnabled, stopIdleTimer } from './kiosk/controller';

export default function App() {
  const { view } = useKioskState();

  /* after every view switch the page's scrollable height changes; ScrollTrigger
     must re-measure or the hero→carousel scrub gets stuck */
  useEffect(() => { refreshScroll(); }, [view]);

  useEffect(() => {
    exposeGlobals();

    /* initial-load hash routing — skipPush: the URL is already at this hash */
    routeFromHash(true);

    /* back/forward: the browser has already moved to this entry, so never
       re-push (that is what used to break the back button) */
    const onPop = () => routeFromHash(true);
    window.addEventListener('popstate', onPop);

    /* IDLE / ATTRACT MODE — unattended showroom display: after 90s with no
       interaction, back out to the home carousel and nudge it into its
       entered state so autoplay (if left playing) takes over.

       A live voice call counts as interaction (see presentationInProgress in
       the controller), and `?attract=off` turns the loop off outright for a
       staffed demo, where being pulled back to the carousel is never wanted. */
    if (/(^|[?&])attract=off(&|$)/.test(location.search)) setAttractEnabled(false);
    const evts: (keyof WindowEventMap)[] = ['pointerdown', 'pointermove', 'wheel', 'touchstart', 'keydown'];
    evts.forEach((evt) => window.addEventListener(evt, resetIdleTimer, { passive: true }));
    resetIdleTimer();

    return () => {
      window.removeEventListener('popstate', onPop);
      evts.forEach((evt) => window.removeEventListener(evt, resetIdleTimer));
      stopIdleTimer();
    };
  }, []);

  return (
    <>
      <CanvasBackground />
      <Dock />
      <HomeView />
      {view !== 'home' && <ProductView product={view} />}
      <VoiceGuide />
      <GestureHud />
    </>
  );
}
