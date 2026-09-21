/**
 * Kiosk controller — the typed replacement for the original page's global
 * functions (showDigiVoxView, goHomeToCarousel, window.digivoxDeck …).
 *
 * Components register imperative handles here on mount; the voice tools, the
 * gesture layer, the idle/attract loop and the header all drive the kiosk
 * through the same entry points the arrows, dots, keyboard and swipe use.
 */
import { flushSync } from 'react-dom';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { PRODUCTS_BY_ID, applyProductAccent, isProductId, type ProductId } from '../data/products';
import { kioskStore, openProductKey, type Mode } from './store';

/* ------------------------------------------------------------ handles ---- */

export interface SceneHandle {
  /** Ease the live camera drift toward this product's cinematic signature. */
  setProductDrift(id: ProductId): void;
  /** Replay the particle symbol's fly-in formation, as on a fresh load. */
  replayFormation(): void;
}

export interface CarouselHandle {
  /** stopAutoplay + user-paused + restart on the first product, no animation. */
  resetToFirst(): void;
  /** Advance the coverflow by delta (wraps). Used by gestures on the home view. */
  step(delta: number): void;
  /**
   * Centre this product's card without opening its deck — the voice guide's
   * portfolio overview, where the coverflow follows what is being said.
   * Stops autoplay: the carousel must not drift off the product mid-sentence.
   */
  focus(id: ProductId): void;
  /** Which card is centred right now. */
  activeId(): ProductId;
  /** Open the product currently in the centre of the coverflow. */
  openActive(): void;
  /** True once the hero has scrolled away and the carousel is interactive. */
  isEntered(): boolean;
  /** Called every frame by the scene with the eased 0–1 split amount. */
  onSplit(split: number): void;
}

export interface DeckHandle {
  product: ProductId;
  labels: string[];
  index(): number;
  next(): void;
  prev(): void;
  goTo(i: number): void;
}

export interface VoiceHandle {
  start(): Promise<void>;
  pause(): boolean;
  /** Spoken "hold on": silenced, but still listening for "carry on". */
  hold(): boolean;
  resume(): boolean;
  isPaused(): boolean;
  setMicMuted(muted: boolean): Promise<boolean> | boolean;
  say(message: string): boolean;
  /** Hand it a turn it did not wait for — used to resume after a hold. */
  nudge(message: string): boolean;
  state(): string;
  /** Show/hide the humanoid bust (swipe the brand logo). */
  setRevealed(on: boolean): void;
  isRevealed(): boolean;
  /** End any call and take the panel off screen. */
  hide(): void;
  show(): void;
  isHidden(): boolean;
}

interface Registry {
  scene: SceneHandle | null;
  carousel: CarouselHandle | null;
  deck: DeckHandle | null;
  voice: VoiceHandle | null;
}

const reg: Registry = { scene: null, carousel: null, deck: null, voice: null };

/* --------------------------------------------------------------- zoom ---- */

/**
 * Gesture zoom: scales whatever the client is looking at — the active slide's
 * content on a deck, the coverflow stage on the home view — about the point
 * between the presenter's hands. Reset on every slide / view change so a
 * zoomed-in detail never leaks onto the next screen.
 */
let zoomEl: HTMLElement | null = null;
let zoomScale = 1;

function zoomTarget(): HTMLElement | null {
  return (
    document.querySelector<HTMLElement>('.k-slide.active > .wrap') ||
    document.querySelector<HTMLElement>('#logo-carousel .lc-stage')
  );
}

export function applyZoom(scale: number, x: number, y: number): void {
  const el = zoomTarget();
  if (!el) return;
  if (zoomEl && zoomEl !== el) clearZoomStyles(zoomEl);
  zoomEl = el;
  zoomScale = scale;
  const r = el.getBoundingClientRect();
  // Origin in the element's own (unscaled) box; clamp so the origin stays on it.
  const ox = Math.min(100, Math.max(0, ((x - r.left) / Math.max(1, r.width)) * 100));
  const oy = Math.min(100, Math.max(0, ((y - r.top) / Math.max(1, r.height)) * 100));
  el.style.willChange = 'transform';
  el.style.transformOrigin = `${ox}% ${oy}%`;
  el.style.transform = scale > 1.001 ? `scale(${scale.toFixed(3)})` : '';
  el.classList.toggle('is-zoomed', scale > 1.001);
}

function clearZoomStyles(el: HTMLElement): void {
  el.style.transform = '';
  el.style.transformOrigin = '';
  el.style.willChange = '';
  el.classList.remove('is-zoomed');
}

export function resetZoom(): void {
  if (zoomEl) clearZoomStyles(zoomEl);
  zoomEl = null;
  zoomScale = 1;
}

export function currentZoom(): number {
  return zoomEl && zoomEl.isConnected ? zoomScale : 1;
}

/* -------------------------------------------------------------- views ---- */

const PRODUCT_HASHES = new Set(['#digivox', '#elevaite', '#digikoach', '#pexminer', '#digiaura']);

/**
 * `flush` renders synchronously so the caller can measure the page
 * (document.body.scrollHeight) right after switching, exactly as the original
 * display:none toggles allowed. Never flush from inside a React render/effect —
 * initial hash routing runs from an effect and uses the plain path.
 */
function setView(view: 'home' | ProductId, flush = false): void {
  if (flush) {
    try { flushSync(() => kioskStore.set({ view })); return; } catch { /* fall through */ }
  }
  kioskStore.set({ view });
}

/** Open one product deck on top of the (kept-alive) home view. */
export function openProduct(id: ProductId, skipPush = false): void {
  resetZoom();
  resetIdleTimer();
  applyProductAccent(PRODUCTS_BY_ID[id]);
  reg.scene?.setProductDrift(id);
  setView(id);
  document.body.style.overflow = 'hidden';
  if (!skipPush) history.pushState({ [id]: true }, '', `#${id}`);
}

/** Back to the home view, wherever scroll happened to be left. */
export function showHome(skipPush = false, flush = false): void {
  resetZoom();
  setView('home', flush);
  document.body.style.overflow = '';
  if (!skipPush && PRODUCT_HASHES.has(location.hash)) {
    history.pushState(null, '', location.pathname + location.search);
  }
}

/**
 * Called by App after every view commit. The product page we just hid/showed
 * changes document.body's total height and the scroll choreography is scrubbed
 * against it; ScrollTrigger caches those pixel positions, so without a refresh
 * the split animation ends up stuck after visiting a product page.
 */
export function refreshScroll(): void {
  ScrollTrigger.refresh();
}

function carouselScrollTarget(): number {
  return Math.round((document.body.scrollHeight - window.innerHeight) * 0.3);
}

/** Scroll the home page from the hero into the carousel (what the SCROLL cue does). */
export function enterCarousel(): void {
  window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'smooth' });
}

/** Scroll the home page back up to the hero / particle logo. */
export function leaveCarousel(): void {
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/**
 * Every explicit "go home" action (header logo, each deck's home arrow, the
 * voice goHome tool) lands on the fully-engaged carousel — restarted on the
 * first product, particle symbol re-assembling, just like a fresh visit.
 */
export function goHomeToCarousel(): void {
  showHome(false, true);
  refreshScroll();
  reg.carousel?.resetToFirst();
  reg.scene?.replayFormation();
  window.scrollTo({ top: carouselScrollTarget(), behavior: 'smooth' });
}

/**
 * Bring the client from the logo screen to the product carousel, without the
 * reset `goHomeToCarousel` does. The greeting happens on the logo; the
 * portfolio overview happens here, so the guide needs a way to travel between
 * them that does not throw the coverflow back to the first product.
 */
export function showCarousel(focusId?: ProductId): void {
  if (anyProductOpen()) { showHome(false, true); refreshScroll(); }
  resetIdleTimer();
  if (focusId) reg.carousel?.focus(focusId);
  const target = carouselScrollTarget();
  if (window.scrollY < target * 0.9) window.scrollTo({ top: target, behavior: 'smooth' });
}

/** Is the carousel actually on screen (past the hero→carousel split)? */
export function carouselVisible(): boolean {
  return !anyProductOpen() && window.scrollY >= carouselScrollTarget() * 0.85;
}

export function setMode(mode: Mode): void {
  kioskStore.set({ mode });
}

export function anyProductOpen(): boolean {
  return openProductKey() !== null;
}

/* ------------------------------------------------------ idle / attract ---- */

const IDLE_MS = 90000;
let idleTimer: ReturnType<typeof setTimeout> | null = null;
let attractEnabled = true;

/**
 * A live voice call IS the presentation. The attract loop only exists for an
 * unattended kiosk, so anything that means "a human is presenting right now"
 * has to count as activity — otherwise a two-minute answer about DigiVox ends
 * with the deck snapping back to the home carousel mid-sentence.
 *
 * Pointer/key/gesture events cover a person driving by hand; this covers the
 * case where the only thing moving is the agent's voice.
 */
function presentationInProgress(): boolean {
  const v = reg.voice;
  if (!v) return false;
  try {
    const st = v.state();
    return st !== 'idle' && st !== 'error';
  } catch {
    return false;
  }
}

function enterAttractState(): void {
  // Re-arm rather than fire: the call is still going, so check again later.
  if (presentationInProgress()) { resetIdleTimer(); return; }
  if (anyProductOpen()) { showHome(false, true); refreshScroll(); }
  // Nudge past the hero->carousel threshold so the carousel finishes entering
  // on its own and (if the person left it playing) its autoplay resumes.
  const target = carouselScrollTarget();
  if (window.scrollY < target * 0.6) window.scrollTo({ top: target, behavior: 'smooth' });
}

export function resetIdleTimer(): void {
  if (idleTimer) clearTimeout(idleTimer);
  if (!attractEnabled) { idleTimer = null; return; }
  idleTimer = setTimeout(enterAttractState, IDLE_MS);
}

/**
 * Turn the unattended-kiosk attract loop off for a staffed demo, where being
 * returned to the carousel is never what anyone wants. `?attract=off` in the
 * URL does the same thing for the whole session.
 */
export function setAttractEnabled(on: boolean): void {
  attractEnabled = !!on;
  if (attractEnabled) resetIdleTimer();
  else if (idleTimer) { clearTimeout(idleTimer); idleTimer = null; }
}

export function isAttractEnabled(): boolean {
  return attractEnabled;
}

export function stopIdleTimer(): void {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = null;
}

/* -------------------------------------------------------------- routing -- */

export function routeFromHash(skipPush: boolean): void {
  const key = location.hash.replace(/^#/, '');
  if (isProductId(key)) openProduct(key, skipPush);
  else showHome(true);
}

/* ------------------------------------------------------------ registry ---- */

export const controller = {
  registerScene(h: SceneHandle): () => void { reg.scene = h; return () => { if (reg.scene === h) reg.scene = null; }; },
  registerCarousel(h: CarouselHandle): () => void { reg.carousel = h; return () => { if (reg.carousel === h) reg.carousel = null; }; },
  registerDeck(h: DeckHandle): () => void { reg.deck = h; return () => { if (reg.deck === h) reg.deck = null; }; },
  registerVoice(h: VoiceHandle): () => void { reg.voice = h; return () => { if (reg.voice === h) reg.voice = null; }; },
  get scene() { return reg.scene; },
  get carousel() { return reg.carousel; },
  get deck() { return reg.deck; },
  get voice() { return reg.voice; },
  openProduct,
  showHome,
  goHomeToCarousel,
  showCarousel,
  carouselVisible,
  enterCarousel,
  leaveCarousel,
  setMode,
  anyProductOpen,
  resetIdleTimer,
  setAttractEnabled,
  isAttractEnabled,
  applyZoom,
  resetZoom,
  currentZoom,
  openKey: openProductKey,
};

export type KioskController = typeof controller;

/* Console-friendly globals, kept for parity with the original page/README:
     window.IopexKiosk.openProduct('digivox')
     window.showDigiVoxView()  window.goHomeToCarousel()  */
export function exposeGlobals(): void {
  const w = window as unknown as Record<string, unknown>;
  w.IopexKiosk = controller;
  w.showHomeView = (skipPush?: boolean) => showHome(!!skipPush);
  w.goHomeToCarousel = goHomeToCarousel;
  w.showDigiVoxView = (skipPush?: boolean) => openProduct('digivox', !!skipPush);
  w.showElevAIteView = (skipPush?: boolean) => openProduct('elevaite', !!skipPush);
  w.showDigiKoachView = (skipPush?: boolean) => openProduct('digikoach', !!skipPush);
  w.showPexminerView = (skipPush?: boolean) => openProduct('pexminer', !!skipPush);
  w.showDigiAuraView = (skipPush?: boolean) => openProduct('digiaura', !!skipPush);
}
