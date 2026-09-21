/**
 * Voice guide wiring for the iOPEX kiosk — the combined platforms and
 * applications deck (iopex-products-kiosk-v2.html).
 *
 * Separate from voice-boot.js rather than shared with it, because the two pages
 * navigate in completely different ways. The products page is one long scroll,
 * so its tools are "scroll to this heading". The kiosk is a home carousel plus
 * five product views, each a deck of four slides — nothing scrolls, views swap
 * and slides transition. "Where are we" is a pair here: which product is open,
 * and which slide of it. Every tool below moves one of those two axes.
 *
 * The kiosk's own script owns all of that machinery and already exposes it
 * globally, so this drives the page through the same entry points the arrows,
 * dots, keyboard and swipe use. Nothing here reaches into the kiosk's internals.
 */

import { createVoiceAgent } from './voice-agent.js';

/* ------------------------------------------------------------------ config -- */

// Override for a quick test with ?agent=agent_xxx or window.IOPEX_VOICE_AGENT_ID.
const AGENT_ID =
  new URLSearchParams(location.search).get('agent') ||
  window.IOPEX_VOICE_AGENT_ID ||
  '';

const PRODUCTS = {
  digivox: { show: 'showDigiVoxView', deck: 'digivoxDeck', open: 'digivoxPageOpen', name: 'DigiVox' },
  elevaite: { show: 'showElevAIteView', deck: 'elevaiteDeck', open: 'elevaitePageOpen', name: 'ElevAIte' },
  digikoach: { show: 'showDigiKoachView', deck: 'digikoachDeck', open: 'digikoachPageOpen', name: 'DigiKoach' },
  pexminer: { show: 'showPexminerView', deck: 'pexminerDeck', open: 'pexminerPageOpen', name: 'PexMiner' },
  digiaura: { show: 'showDigiAuraView', deck: 'digiauraDeck', open: 'digiauraPageOpen', name: 'DigiAura' },
};

const KEYS = Object.keys(PRODUCTS);
const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ------------------------------------------------------------------- page --- */

/** @returns {string|null} the open product's key, or null on the home view. */
function openKey() {
  return KEYS.find((k) => !!window[PRODUCTS[k].open]) || null;
}

/** Slide labels of a product, read from the DOM so they cannot drift. */
function slideLabels(key) {
  const view = document.getElementById(`${key}-view`);
  if (!view) return [];
  return Array.from(view.querySelectorAll('.k-slide')).map(
    (el, i) => el.getAttribute('data-label') || `Slide ${i + 1}`
  );
}

function currentSlide(key) {
  const view = document.getElementById(`${key}-view`);
  if (!view) return -1;
  return Array.from(view.querySelectorAll('.k-slide')).findIndex((el) =>
    el.classList.contains('active')
  );
}

function deckOf(key) {
  const d = window[PRODUCTS[key].deck];
  return d && typeof d.goTo === 'function' ? d : null;
}

// Keep in sync with TRANSITION_MS in createSlideDeck in the page.
const TRANSITION_MS = 700;

/**
 * Wait until the screen has actually changed, then until the deck will accept
 * input again.
 *
 * The kiosk ignores navigation while a slide is mid-transition (`transitioning`
 * in createSlideDeck) and clears that flag on its own timer, exactly
 * TRANSITION_MS after the call. Sleeping the same 700ms was a coin flip:
 * whichever timer fired first decided whether the next tool call was accepted
 * or silently dropped — which showed up as nextSlide cheerfully reporting the
 * slide it was already on.
 *
 * The deadline matters as much as the wait: client tools are awaited, so one
 * that never resolves stalls the agent's turn completely.
 *
 * @param {() => boolean} arrived
 * @param {number} [hold] extra wait once arrived, to clear the kiosk's own flag
 * @returns {Promise<void>}
 */
function settle(arrived, hold) {
  if (reduce) return Promise.resolve();
  const started = performance.now();
  const keep = hold === undefined ? TRANSITION_MS + 90 : hold;
  return new Promise((resolve) => {
    (function poll() {
      const waited = performance.now() - started;
      if (arrived() && waited >= keep) return resolve();
      if (waited > TRANSITION_MS * 3) return resolve();
      setTimeout(poll, 60);
    })();
  });
}

/** Index a next/prev will land on, wrapped the way the kiosk wraps it. */
function wrapIndex(key, delta) {
  const total = slideLabels(key).length || 1;
  return ((currentSlide(key) + delta) % total + total) % total;
}

/** What is on screen right now, as a sentence the agent can use verbatim. */
function describe() {
  const key = openKey();
  if (!key) return 'the home carousel, showing all five products';
  const labels = slideLabels(key);
  const i = currentSlide(key);
  const label = i >= 0 ? labels[i] : labels[0];
  return `${PRODUCTS[key].name}, on the "${label}" slide (${i + 1} of ${labels.length})`;
}

/* ------------------------------------------------------------------ tools --- */

const tools = {
  openProduct({ product }) {
    const key = String(product || '').toLowerCase().replace(/[^a-z]/g, '');
    const p = PRODUCTS[key];
    if (!p) return `Unknown product "${product}". Available: ${KEYS.join(', ')}.`;
    if (openKey() === key) return `Already on ${p.name}. The client is looking at ${describe()}.`;

    const show = window[p.show];
    if (typeof show !== 'function') return `The ${p.name} view is not on this page.`;
    markMove();
    show();
    return settle(() => openKey() === key && currentSlide(key) >= 0)
      .then(() => `Opened ${p.name}. The client can see ${describe()}.`);
  },

  goToSlide({ slide }) {
    const key = openKey();
    if (!key) return 'No product is open yet. Call openProduct first, then pick a slide.';
    const labels = slideLabels(key);
    const deck = deckOf(key);
    if (!deck) return `The ${PRODUCTS[key].name} deck is not ready yet.`;

    const want = String(slide || '').trim().toLowerCase();
    // Accept a label or a position, because the agent has both in front of it:
    // the labels came from getPageContext, the number from counting them out.
    let idx = labels.findIndex((l) => l.toLowerCase() === want);
    if (idx === -1 && /^\d+$/.test(want)) idx = parseInt(want, 10) - 1;
    if (idx === -1) idx = labels.findIndex((l) => l.toLowerCase().includes(want));
    if (idx < 0 || idx >= labels.length) {
      return `Unknown slide "${slide}". ${PRODUCTS[key].name} has: ${labels.join(', ')}.`;
    }
    if (idx === currentSlide(key)) return `Already on "${labels[idx]}".`;

    markMove();
    deck.goTo(idx);
    return settle(() => currentSlide(key) === idx).then(() => `Now showing ${describe()}.`);
  },

  nextSlide() {
    const key = openKey();
    if (!key) return 'No product is open yet. Call openProduct first.';
    const deck = deckOf(key);
    if (!deck) return `The ${PRODUCTS[key].name} deck is not ready yet.`;
    markMove();
    const want = wrapIndex(key, 1);
    deck.next();
    return settle(() => currentSlide(key) === want).then(() => `Now showing ${describe()}.`);
  },

  previousSlide() {
    const key = openKey();
    if (!key) return 'No product is open yet. Call openProduct first.';
    const deck = deckOf(key);
    if (!deck) return `The ${PRODUCTS[key].name} deck is not ready yet.`;
    markMove();
    const want = wrapIndex(key, -1);
    deck.prev();
    return settle(() => currentSlide(key) === want).then(() => `Now showing ${describe()}.`);
  },

  goHome() {
    if (!openKey()) return 'Already on the home carousel.';
    const home = window.goHomeToCarousel || window.showHomeView;
    if (typeof home !== 'function') return 'The home view is not reachable from here.';
    markMove();
    home();
    return settle(() => openKey() === null).then(() => `Back on ${describe()}.`);
  },

  getPageContext() {
    const key = openKey();
    const labels = key ? slideLabels(key) : [];
    return `The client is looking at ${describe()}.` +
      (key ? ` Slides available: ${labels.join(', ')}.` : ` Products available: ${KEYS.join(', ')}.`);
  },
};

/* -------------------------------------------------------------- following --- */

/**
 * Phrases that mean a product, for following the guide's own narration.
 *
 * The agent is told to move the screen before describing anything, but left to
 * narrate it does that only intermittently — it talks about PexMiner while the
 * screen is still on DigiVox. So the page listens to what the guide is saying
 * and follows along, the same way voice-boot.js does for the products page.
 *
 * Only product names here. Slide labels are words like "why" and "how", which
 * appear in ordinary speech constantly; following those would have the deck
 * jumping around mid-sentence, which is worse than not following at all.
 */
const PRODUCT_CUES = {
  digivox: ['digivox', 'digi vox'],
  elevaite: ['elevaite', 'elev ai', 'eleva8'],
  digikoach: ['digikoach', 'digi koach', 'digicoach'],
  pexminer: ['pexminer', 'pex miner'],
  digiaura: ['digiaura', 'digi aura'],
};

// An explicit tool call wins: if the guide moved the screen itself, the words
// that follow are describing where it already is. -Infinity, not 0, because
// performance.now() starts near zero and a plain 0 would mute the follower for
// the opening of the pitch.
let lastMove = -Infinity;
let lastFollow = -Infinity;

function markMove() {
  lastMove = performance.now();
}

/** @param {string} text one line of agent transcript */
function follow(text) {
  const now = performance.now();
  if (now - lastMove < 6000) return;
  if (now - lastFollow < 2000) return;

  const hay = String(text || '').toLowerCase();
  let best = null;
  let bestLen = 0;
  for (const [key, cues] of Object.entries(PRODUCT_CUES)) {
    for (const cue of cues) {
      if (cue.length > bestLen && hay.includes(cue)) { best = key; bestLen = cue.length; }
    }
  }
  if (!best || best === openKey()) return;

  const show = window[PRODUCTS[best].show];
  if (typeof show !== 'function') return;
  lastFollow = now;
  show();
}

/* ------------------------------------------------------------------- boot --- */

const agent = createVoiceAgent({
  agentId: AGENT_ID,
  tools,
  // The same palette the products page uses, so the guide looks identical on
  // both surfaces: cool blue body, warm brand energy only while it speaks.
  palette: {
    amber: '#FFC845',
    cyan: '#19A7FF',
    orange: '#FF6B00',
    ink: '#BCEBFF',
    muted: '#91A9BC',
  },
  dynamicVariables: {
    deck: 'kiosk',
    entry_section: openKey() || 'home',
  },
  onMessage: ({ message, source }) => {
    if (source === 'ai' && message) follow(message);
  },
});

// Handle for the gesture layer to attach to later: pinch-to-talk becomes
// window.IopexVoice.setMicMuted(false) on pinch, true on release.
window.IopexVoice = agent;

if (!AGENT_ID) {
  console.warn(
    '[voice] No ElevenLabs agent id. Set window.IOPEX_VOICE_AGENT_ID before this ' +
    'module loads, or append ?agent=agent_xxx to the URL.'
  );
}
