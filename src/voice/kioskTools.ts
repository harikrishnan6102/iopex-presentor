/**
 * Voice guide wiring for the iOPEX kiosk.
 *
 * The kiosk is a home carousel plus five product decks of four slides each —
 * nothing scrolls, views swap and slides transition. "Where are we" is a pair:
 * which product is open, and which slide of it. Every tool below moves one of
 * those two axes, through the same entry points the arrows, dots, keyboard and
 * swipe use (the kiosk controller).
 *
 * Tool names must match the client tools declared on the ElevenLabs agent.
 */
import { PRODUCTS_BY_ID, PRODUCT_IDS, isProductId, type ProductId } from '../data/products';
import { carouselVisible, controller, goHomeToCarousel, openProduct, showCarousel } from '../kiosk/controller';
import { openProductKey } from '../kiosk/store';
import { slideLabelsFor } from '../components/ProductView';
import type { ToolMap } from './voiceAgent';

const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// Keep in sync with TRANSITION_MS in SlideDeck.
const TRANSITION_MS = 700;

function currentSlide(key: ProductId): number {
  const d = controller.deck;
  return d && d.product === key ? d.index() : -1;
}

function deckOf(key: ProductId) {
  const d = controller.deck;
  return d && d.product === key ? d : null;
}

/**
 * The screen has changed; give the transition a moment before telling the agent
 * it can describe what is there. Short on purpose: the agent's own round trip
 * adds most of a second anyway, and every millisecond spent here is a
 * millisecond the turn cannot end — which is felt most when somebody is trying
 * to interrupt.
 */
const SETTLE_HOLD_MS = 350;

/** Never hold a turn open longer than this, whatever the screen is doing. */
const SETTLE_DEADLINE_MS = TRANSITION_MS * 2;

/**
 * Bumped when the room speaks. A tool waiting on an animation is the last thing
 * that should stand between a question and an answer, so anything in flight
 * gives up immediately and reports where the screen got to.
 */
let interruptedAt = 0;

/** Called when a user transcript arrives: cut short anything still waiting. */
export function abortSettles(): void {
  interruptedAt = performance.now();
  // Somebody spoke, so whatever the guide was part-way through is over and a
  // new turn is beginning. Give the deck its move back: answering "what does
  // it cost" by turning to the Results slide must never be refused because the
  // turn the question interrupted had already moved once.
  deckMovesThisTurn = 0;
  lastVoiceState = '';
}

/**
 * Wait until the screen has actually changed, then until the deck will accept
 * input again. Client tools are awaited, so one that never resolves stalls the
 * agent's turn completely — hence the deadline, and the interrupt.
 */
function settle(arrived: () => boolean, hold?: number): Promise<void> {
  if (reduce) return Promise.resolve();
  const started = performance.now();
  const keep = hold === undefined ? SETTLE_HOLD_MS : hold;
  return new Promise((resolve) => {
    (function poll() {
      const waited = performance.now() - started;
      if (interruptedAt > started) return resolve();
      if (arrived() && waited >= keep) return resolve();
      if (waited > SETTLE_DEADLINE_MS) return resolve();
      setTimeout(poll, 60);
    })();
  });
}

function wrapIndex(key: ProductId, delta: number): number {
  const total = slideLabelsFor(key).length || 1;
  return ((currentSlide(key) + delta) % total + total) % total;
}

/** What is on screen right now, as a sentence the agent can use verbatim. */
function describe(): string {
  const key = openProductKey();
  if (!key) {
    const centred = controller.carousel?.activeId();
    const where = carouselVisible() ? 'the product carousel' : 'the opening iOPEX logo screen';
    return centred
      ? `${where}, with ${PRODUCTS_BY_ID[centred].spokenName} centred`
      : where;
  }
  const labels = slideLabelsFor(key);
  const i = currentSlide(key);
  const label = i >= 0 ? labels[i] : labels[0];
  return `${PRODUCTS_BY_ID[key].spokenName}, on the "${label}" slide (${Math.max(i, 0) + 1} of ${labels.length})`;
}

/* -------------------------------------------------------------- following --- */

/**
 * Product-name cues for following the guide's own narration: left to narrate,
 * the agent talks about PexMiner while the screen is still on DigiVox, so the
 * page listens and follows along. Only product names — slide labels are words
 * like "why" and "how" that appear in ordinary speech constantly.
 */
const PRODUCT_CUES: Record<ProductId, string[]> = {
  digivox: ['digivox', 'digi vox'],
  elevaite: ['elevaite', 'elev ai', 'eleva8'],
  digikoach: ['digikoach', 'digi koach', 'digicoach'],
  pexminer: ['pexminer', 'pex miner'],
  digiaura: ['digiaura', 'digi aura'],
};

/**
 * Slide cues, for following the narration *inside* a deck.
 *
 * Bare "why" and "how" are ordinary words and would fire constantly, so every
 * cue here is a phrase — and they are the phrases the slides themselves use as
 * their eyebrow, which is what the guide ends up paraphrasing. Each entry lists
 * the labels it could mean, because the decks do not share a vocabulary: the
 * third slide is "How" on four products and "Features" on DigiAura, the fourth
 * is "Results" on two and "What you get" on three.
 */
const SLIDE_CUES: { labels: string[]; cues: string[] }[] = [
  {
    labels: ['why'],
    cues: ['why we built', 'why we made', 'why this exists', 'what we kept hearing',
      'the problem', 'the problem was', 'what was going wrong', 'the maturity curve'],
  },
  {
    labels: ['how', 'features'],
    cues: ['how it works', 'how this works', 'how it actually works', 'the way it works',
      'set it up once', 'four steps', 'step one', 'the agent chain', 'five agents',
      'the feature', 'the features'],
  },
  {
    labels: ['results', 'what you get'],
    cues: ['what you get', 'the results', 'results and outcomes', 'the outcomes',
      'after the interview', 'the numbers', 'the report', 'what comes out'],
  },
];

// An explicit tool call wins over the transcript. -Infinity, not 0, because
// performance.now() starts near zero and a plain 0 would mute the follower for
// the opening of the pitch.
let lastMove = -Infinity;

/**
 * How long an explicit tool call owns the screen, so a tool call and the
 * sentence that describes it do not fight over the opening of a turn.
 *
 * It suppresses the *first* move of a turn only. It used to drop the whole
 * message, which broke the one sequence it most needed to allow: the guide
 * calls showCarousel and then, immediately, names all five products in one
 * breath. The tool call was inside this window, so the entire overview was
 * discarded and the carousel sat on the first product to the end.
 */
const MOVE_OWNS_MS = 2500;

/**
 * Whether the narration may centre carousel cards by itself. Off.
 *
 * The page is given the turn's text in one piece, and the room is given it as
 * speech over the following half-minute. Nothing the page receives tells it
 * where in that text the voice currently is, so every version of this — a
 * character-rate estimate, a delay window, one move per message — has put the
 * carousel on DigiVox while ElevAIte was still being described. The lead is not
 * a tuning problem: the information simply is not there.
 *
 * So the overview is driven by highlightProduct alone, which moves the screen
 * at the instant the guide means it to. If the guide describes a product
 * without calling the tool, the card now stays put. That is the failure this
 * trades for, and it is the cheaper one: a card that has not caught up is a
 * card the room can still read, while a card that has run ahead is the screen
 * contradicting the voice.
 *
 * `?follow=carousel` puts it back for a side-by-side comparison.
 */
const FOLLOW_CAROUSEL = /(^|[?&])follow=carousel(&|$)/.test(location.search);

/**
 * Whether the narration may change slides inside a deck by itself. Also off.
 *
 * This was kept when the carousel follower was retired, on the grounds that
 * "how it works" is a phrase the guide says *while* on that subject rather
 * than a name it drops in passing. That distinction is real but it does not
 * help, because the lead is the same: the turn's text arrives here complete,
 * and the cue is found in it the instant it lands — several seconds before the
 * room hears the guide say it. So the deck jumped to the How slide while the
 * intro was still being read out, which is the same mismatch as a card running
 * ahead, in a smaller frame.
 *
 * Slides now move on nextSlide, previousSlide and goToSlide, which the guide
 * calls at the moment it means to move — and which the prompt already requires
 * one of per slide. `?follow=slides` puts the old behaviour back.
 */
const FOLLOW_SLIDES = /(^|[?&])follow=slides(&|$)/.test(location.search);

/**
 * One deck move per spoken turn. `?slides=free` lifts it.
 *
 * Retiring the narration follower did not fix the decks, because the follower
 * was never what moved them: the model was. Asked to "narrate the four slides,
 * moving with nextSlide", it does the whole product in a single turn —
 * openProduct, nextSlide, nextSlide, nextSlide, and the narration for all four
 * slides — and generates it in about two seconds. The tool calls land at that
 * speed. The speech comes out of the speakers over the next half-minute. So the
 * deck is sitting on Results while the room is still hearing the intro, and no
 * change to how the *page* reads the transcript can touch that, because the
 * page is not the one moving.
 *
 * The overview does not have this problem, and the reason is instructive: it is
 * held to one product per turn, so the model must stop speaking to get its next
 * move, and the silence nudge hands it back three seconds later. The turn
 * boundary is what keeps voice and screen together. Decks were never given the
 * same rule.
 *
 * So the page enforces it. The first deck move of a turn goes through; a second
 * is refused, with a tool result telling the guide to finish the sentence and
 * stop. That is not a failure it has to recover from — stopping is exactly what
 * it should have done, and the nudge is already there to restart it.
 *
 * Enforced here rather than only in the prompt because the prompt has asked for
 * this ("one slide, one move, every time") through several rounds of the room
 * reporting the opposite. A rule the page keeps is kept.
 */
const ONE_DECK_MOVE_PER_TURN = !/(^|[?&])slides=free(&|$)/.test(location.search);

const CMD_DEBUG = /(^|[?&])debug=voice(&|$)/.test(location.search) || !!window.IOPEX_VOICE_DEBUG;

/**
 * Who moved the screen, and when. `?debug=voice` in the URL.
 *
 * Worth keeping: when the room reports that the screen was on the wrong card,
 * the one thing that cannot be reconstructed afterwards is whether the guide
 * asked for that card or the page decided on it.
 */
function trace(what: string): void {
  if (CMD_DEBUG) console.log(`[kiosk] ${(performance.now() / 1000).toFixed(1)}s ${what}`);
}

function markMove(): void {
  lastMove = performance.now();
}

/** Deck moves made in the turn currently being spoken. See ONE_DECK_MOVE_PER_TURN. */
let deckMovesThisTurn = 0;
let lastDeckMoveAt = -Infinity;
let lastVoiceState = '';

/**
 * A turn that has been refused its move must never be stuck refused. If no
 * deck move has been attempted for this long, whatever the modes did, the
 * budget comes back — a deck that stops advancing is a worse failure in a room
 * than one that advances a beat early, and this is the floor under that.
 *
 * Comfortably longer than a batch (a model emits its whole turn's tool calls
 * within a second or two) and shorter than a slide's narration, so it releases
 * between turns and never inside one.
 */
const DECK_BUDGET_STALE_MS = 8000;

/**
 * Told when the guide's turn ends, so the next one starts with its move back.
 *
 * Only a *speaking → listening* transition counts, not any report of
 * `listening`. The distinction matters: a turn's tool calls are made before its
 * first audio, while the mode is still `listening` from the turn before, so
 * treating every `listening` as a boundary would hand the budget back in the
 * middle of the very burst it exists to break up.
 *
 * Coming out of `speaking` is a real boundary: the SDK reports it when the last
 * of the turn's audio has left the speakers, not when the model stopped
 * generating. So the count covers exactly the stretch the room is listening to.
 */
export function noteVoiceState(state: string): void {
  const ended = (lastVoiceState === 'speaking' && state === 'listening') || state === 'idle';
  lastVoiceState = state;
  if (!ended) return;
  if (deckMovesThisTurn) trace(`turn ended after ${deckMovesThisTurn} deck move(s)`);
  deckMovesThisTurn = 0;
}

/**
 * Claim this turn's deck move. Returns a refusal to hand straight back to the
 * guide if the turn has already had one, or null to go ahead.
 */
function claimDeckMove(what: string): string | null {
  if (!ONE_DECK_MOVE_PER_TURN) return null;
  const now = performance.now();
  if (deckMovesThisTurn === 0 || now - lastDeckMoveAt > DECK_BUDGET_STALE_MS) {
    deckMovesThisTurn = 1;
    lastDeckMoveAt = now;
    return null;
  }
  trace(`${what} refused: this turn already moved the deck`);
  // Worded as the instruction it is. An error would be narrated aloud, and a
  // guide apologising for a tool is worse than a slide arriving a beat late.
  return `Not yet — you have already moved the deck once this turn, and the client is ` +
    `still hearing what you said about ${describe()}. Finish that sentence and stop ` +
    `speaking. The kiosk hands you another turn about three seconds later; move then ` +
    `and describe the next slide. Do not mention this message.`;
}

interface Mention { id: ProductId; at: number }
interface SlideMention { labels: string[]; at: number }

/** Every occurrence of any of `cues`, with where it falls in the text. */
function occurrences(hay: string, cues: string[]): number[] {
  const at: number[] = [];
  for (const cue of cues) {
    for (let from = 0; ; ) {
      const i = hay.indexOf(cue, from);
      if (i === -1) break;
      at.push(i);
      from = i + cue.length;
    }
  }
  return at;
}

/** Every slide the text points at, in the order they are spoken. */
function slideMentionsIn(hay: string): SlideMention[] {
  const found: SlideMention[] = [];
  for (const group of SLIDE_CUES) {
    for (const at of occurrences(hay, group.cues)) found.push({ labels: group.labels, at });
  }
  found.sort((a, b) => a.at - b.at);
  return found.filter((m, i) => {
    const prev = found[i - 1];
    return !prev || prev.labels !== m.labels;
  });
}

/** Move the open deck to whichever of `labels` it actually has. */
function moveToSlide(labels: string[]): void {
  const key = openProductKey();
  if (!key) return;
  const deck = controller.deck;
  if (!deck || deck.product !== key) return;
  const have = slideLabelsFor(key).map((l) => l.toLowerCase());
  for (const want of labels) {
    const idx = have.indexOf(want);
    if (idx >= 0) {
      if (idx !== deck.index()) deck.goTo(idx);
      return;
    }
  }
}

/** Every product named in the text, in the order they are spoken. */
function mentionsIn(hay: string): Mention[] {
  const found: Mention[] = [];
  for (const id of PRODUCT_IDS) {
    for (const at of occurrences(hay, PRODUCT_CUES[id])) found.push({ id, at });
  }
  found.sort((a, b) => a.at - b.at);
  // "DigiVox" also matches "digi vox" at a nearby offset, and a product named
  // twice in a row is one move, not two.
  return found.filter((m, i) => {
    const prev = found[i - 1];
    return !prev || (prev.id !== m.id && m.at - prev.at > 3);
  });
}

/**
 * Centre a card the narration has reached. Only ever called from the home view:
 * the coverflow is the visual there, so naming a product centres its card —
 * opening the whole deck mid-overview would be too big a jump off a guess.
 */
function moveTo(id: ProductId): void {
  // Still on the logo screen: centring a card nobody can see is the same as
  // doing nothing, so bring the carousel up on the way. This is what makes the
  // overview work even when the agent never calls showCarousel itself.
  if (!carouselVisible()) { showCarousel(id); return; }
  const from = controller.carousel?.activeId();
  if (!from || from === id) return;
  // The overview walks the cards in catalogue order, so the only move the
  // narration can justify on its own is the very next one. Anything else is the
  // guide referring to a product rather than moving to it — "the gaps PexMiner
  // found", said while presenting DigiKoach, is the case that used to send the
  // carousel two cards backwards mid-sentence. A genuine jump out of order is
  // what highlightProduct is for, and that bypasses all of this.
  if (PRODUCT_IDS.indexOf(id) !== PRODUCT_IDS.indexOf(from) + 1) return;
  controller.carousel?.focus(id);
}

/**
 * The last thing the guide said, so a hold can be resumed from it. A hold can
 * last ten minutes and the model's own context is not reliable across that.
 */
let lastNarration = '';

function narrationTail(): string {
  const t = lastNarration.trim();
  if (!t) return '';
  return t.length <= 240 ? t : '…' + t.slice(-240);
}

/** Where the screen is and what it was mid-sentence on, for coming off hold. */
export function resumeContext(): string {
  const tail = narrationTail();
  return `(They said to carry on. You are off hold and can be heard again. The client is looking at ${describe()}.` +
    (tail ? ` You were part-way through saying: "${tail}"` : '') +
    ' Pick up from exactly there in one short sentence — do not greet, do not start the product again,' +
    ' and do not recap what they missed. If they asked for something else while you were held, do that instead.)';
}

/**
 * Follow the guide's own narration — now only to bring the carousel up.
 *
 * What this no longer does is pace the carousel, because it never could. The
 * turn's text arrives here in one piece, seconds ahead of the voice saying it,
 * and nothing in it says where the voice has got to. Every attempt at closing
 * that gap — a character-rate estimate, a delay window, one move per message —
 * ran the screen ahead and put the client on DigiVox while ElevAIte was being
 * described. Walking the five products is the agent's job, one highlightProduct
 * per turn; see FOLLOW_CAROUSEL.
 *
 * Slides went the same way, for the same reason — see FOLLOW_SLIDES. What is
 * left is the one job the follower can still do without running ahead of
 * anything: bringing the carousel up from the logo screen, where there is
 * nothing on screen yet for a premature move to contradict.
 */
export function followNarration(text: string): void {
  const now = performance.now();
  if (text) lastNarration = String(text);
  const hay = String(text || '').toLowerCase();

  // Inside a deck the guide is presenting one product, and nothing it says is
  // a reason to move the screen: a passing mention of another product is a
  // comparison rather than a request to change decks, and a slide cue arrives
  // here well ahead of the voice. The deck moves on tool calls only.
  const open = openProductKey();

  if (open) {
    if (!FOLLOW_SLIDES) return;
    if (now - lastMove < MOVE_OWNS_MS) return;
    // Naming another product in here is a comparison — "the gaps PexMiner
    // found", while presenting DigiKoach — and swapping the whole deck for it
    // is the largest move the kiosk can make off the largest guess. Changing
    // deck is openProduct's job.
    const slide = slideMentionsIn(hay)[0];
    if (slide) { trace(`follower moves to ${slide.labels[0]}`); moveToSlide(slide.labels); }
    return;
  }

  const product = mentionsIn(hay)[0];
  if (!product) return;

  // Nothing on screen yet: the guide is naming products over the logo screen
  // having skipped showCarousel. Bringing the carousel up cannot contradict the
  // voice — there is nothing there to contradict — so this one stays.
  if (!carouselVisible()) { trace(`follower opens carousel on ${product.id}`); moveTo(product.id); return; }

  if (!FOLLOW_CAROUSEL) { trace(`follower ignored "${product.id}" (tool calls own the carousel)`); return; }
  if (now - lastMove < MOVE_OWNS_MS) return;
  moveTo(product.id);
}

/* ------------------------------------------- spoken hold / resume commands --- */

/**
 * "Hold on" and "carry on" recognised on the page, not by the agent.
 *
 * Going through a client tool means the model has to decide to take a turn and
 * call it — and it is the one moment it reliably will not, because holding is
 * exactly when it has been told to stay silent. So a spoken "carry on" would
 * sit there doing nothing while the Hold button worked fine.
 *
 * The transcript arrives either way (the mic stays open through a hold), so
 * match on it directly. The agent tools stay declared as a second path: if the
 * model does call one, it lands on the same hold()/resume().
 */
const HOLD_CUES = [
  'hold on', 'hold up', 'hang on', 'hold', 'pause', 'wait',
  'one moment', 'just a moment', 'give us a minute', 'give us a sec',
  'stop talking', 'be quiet', 'quiet for a moment', 'stop for a second',
  'let us discuss', 'we need to discuss',
];

const RESUME_CUES = [
  'carry on', 'carry on please', 'continue', 'resume', 'go ahead', 'go on',
  'keep going', 'carry on then', 'we are back', 'were back', 'back to you',
  'you can continue', 'unpause', 'off you go', 'please continue',
];

/**
 * A command is a short utterance. "Hold on" is a command; "hold on, can you
 * explain the scoring again" is a question that happens to start with it, and
 * muting the guide mid-question is worse than missing the cue. Cross-talk
 * between people in the room runs long, which the same limit filters out.
 */
const HOLD_MAX_WORDS = 5;
// Being stuck on hold is the worse failure, so allow a little more room here.
const RESUME_MAX_WORDS = 8;

function normalise(text: string): string {
  return String(text || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Whole-phrase match, so "wait" does not fire inside "waiting". */
function hasCue(hay: string, cues: string[]): boolean {
  return cues.some((cue) => new RegExp(`(^|\\s)${cue}($|\\s)`).test(hay));
}

let lastCommand = 0;

// Same switch as the voice agent's: ?debug=voice logs why a spoken command did
// or did not fire, which is the only way to tell "never heard it" apart from
// "heard it, judged it part of a sentence" in a live room.

/**
 * Called for every user transcript. Returns what it did, for logging/tests.
 */
export function followSpokenCommand(text: string): 'hold' | 'resume' | null {
  const voice = controller.voice;
  if (!voice) return null;
  const state = voice.state();
  if (state === 'idle' || state === 'error') return null;

  const hay = normalise(text);
  if (!hay) return null;
  const words = hay.split(' ').length;

  // One transcript often arrives as several partial updates; do not thrash.
  const now = performance.now();
  if (now - lastCommand < 1200) return null;

  const held = voice.isPaused();
  const cues = held ? RESUME_CUES : HOLD_CUES;
  const limit = held ? RESUME_MAX_WORDS : HOLD_MAX_WORDS;
  const matched = hasCue(hay, cues);

  if (matched && words <= limit) {
    lastCommand = now;
    if (held) {
      voice.resume();
      // The spoken path never reaches resumeNarration: while held the model is
      // deliberately not taking turns, so it will not call a tool. Without this
      // it comes back to nothing and simply stays quiet.
      voice.nudge(resumeContext());
    } else {
      voice.hold();
    }
    if (CMD_DEBUG) console.log(`[voice] spoken ${held ? 'resume' : 'hold'}: "${hay}"`);
    return held ? 'resume' : 'hold';
  }
  if (CMD_DEBUG && matched) {
    console.log(`[voice] ignored ${held ? 'resume' : 'hold'} cue in a ${words}-word utterance ` +
      `(limit ${limit}, treated as conversation): "${hay}"`);
  }
  return null;
}

/* ------------------------------------------------------------------ tools --- */

export const kioskTools: ToolMap = {
  openProduct({ product }) {
    const key = String(product || '').toLowerCase().replace(/[^a-z]/g, '');
    if (!isProductId(key)) return `Unknown product "${String(product)}". Available: ${PRODUCT_IDS.join(', ')}.`;
    const p = PRODUCTS_BY_ID[key];
    if (openProductKey() === key) return `Already on ${p.spokenName}. The client is looking at ${describe()}.`;
    // Opening a deck lands on its first slide, which is a deck move like any
    // other: the guide narrates the intro from here and should stop there.
    const busy = claimDeckMove(`openProduct(${key})`);
    if (busy) return busy;
    markMove();
    openProduct(key);
    return settle(() => openProductKey() === key && currentSlide(key) >= 0)
      .then(() => `Opened ${p.spokenName}. The client can see ${describe()}.`);
  },

  /**
   * Leave the opening logo screen and bring up the product carousel — the
   * portfolio overview. Optionally centres one product's card on arrival.
   */
  showCarousel({ product }) {
    const want = String(product || '').toLowerCase().replace(/[^a-z]/g, '');
    const key = isProductId(want) ? want : undefined;
    if (product && !key) {
      return `Unknown product "${String(product)}". Available: ${PRODUCT_IDS.join(', ')}.`;
    }
    markMove();
    showCarousel(key);
    return settle(() => carouselVisible() && (!key || controller.carousel?.activeId() === key))
      .then(() => `The client is now looking at ${describe()}.`);
  },

  /**
   * Centre one product's card while narrating the overview — the coverflow
   * follows what is being said, without opening the deck.
   */
  highlightProduct({ product }) {
    const key = String(product || '').toLowerCase().replace(/[^a-z]/g, '');
    if (!isProductId(key)) return `Unknown product "${String(product)}". Available: ${PRODUCT_IDS.join(', ')}.`;
    const carousel = controller.carousel;
    if (!carousel) return 'The carousel is not ready yet.';
    if (openProductKey()) {
      return `The ${PRODUCTS_BY_ID[openProductKey()!].spokenName} deck is open, so the carousel is not on screen. ` +
        'Call showCarousel first, or openProduct to move straight to another deck.';
    }
    trace(`highlightProduct(${key}) from ${carousel.activeId()}`);
    markMove();
    showCarousel(key);
    // A focus that lands mid-glide is dropped by the coverflow; ask again once.
    setTimeout(() => { if (carousel.activeId() !== key) carousel.focus(key); }, TRANSITION_MS);
    return settle(() => carousel.activeId() === key)
      .then(() => `Now centred on ${PRODUCTS_BY_ID[key].spokenName}. The client is looking at ${describe()}.`);
  },

  goToSlide({ slide }) {
    const key = openProductKey();
    if (!key) return 'No product is open yet. Call openProduct first, then pick a slide.';
    const labels = slideLabelsFor(key);
    const deck = deckOf(key);
    if (!deck) return `The ${PRODUCTS_BY_ID[key].spokenName} deck is not ready yet.`;

    const want = String(slide || '').trim().toLowerCase();
    let idx = labels.findIndex((l) => l.toLowerCase() === want);
    if (idx === -1 && /^\d+$/.test(want)) idx = parseInt(want, 10) - 1;
    if (idx === -1) idx = labels.findIndex((l) => l.toLowerCase().includes(want));
    if (idx < 0 || idx >= labels.length) {
      return `Unknown slide "${String(slide)}". ${PRODUCTS_BY_ID[key].spokenName} has: ${labels.join(', ')}.`;
    }
    if (idx === currentSlide(key)) return `Already on "${labels[idx]}".`;

    const busy = claimDeckMove(`goToSlide(${labels[idx]})`);
    if (busy) return busy;
    markMove();
    deck.goTo(idx);
    return settle(() => currentSlide(key) === idx).then(() => `Now showing ${describe()}.`);
  },

  nextSlide() {
    const key = openProductKey();
    if (!key) return 'No product is open yet. Call openProduct first.';
    const deck = deckOf(key);
    if (!deck) return `The ${PRODUCTS_BY_ID[key].spokenName} deck is not ready yet.`;
    const busy = claimDeckMove('nextSlide');
    if (busy) return busy;
    markMove();
    const want = wrapIndex(key, 1);
    deck.next();
    return settle(() => currentSlide(key) === want).then(() => `Now showing ${describe()}.`);
  },

  previousSlide() {
    const key = openProductKey();
    if (!key) return 'No product is open yet. Call openProduct first.';
    const deck = deckOf(key);
    if (!deck) return `The ${PRODUCTS_BY_ID[key].spokenName} deck is not ready yet.`;
    // Going back is usually an answer to a question rather than narration, but
    // it is still the deck moving under the room's eyes; same budget.
    const busy = claimDeckMove('previousSlide');
    if (busy) return busy;
    markMove();
    const want = wrapIndex(key, -1);
    deck.prev();
    return settle(() => currentSlide(key) === want).then(() => `Now showing ${describe()}.`);
  },

  goHome() {
    if (!openProductKey()) return 'Already on the home carousel.';
    markMove();
    goHomeToCarousel();
    return settle(() => openProductKey() === null).then(() => `Back on ${describe()}.`);
  },

  /**
   * "Hold on", "give us a minute", "pause" — said out loud, mid-meeting,
   * usually because the room wants to talk among themselves. Silences the
   * guide until someone tells it to carry on. The mic stays open (that is the
   * only way "carry on" can ever be heard) but output is muted at the client,
   * so the room is not relying on the model choosing to stay quiet.
   */
  holdNarration() {
    const voice = controller.voice;
    if (!voice) return 'The voice guide is not available.';
    if (voice.isPaused()) return 'Already holding. Stay silent until they say to continue.';
    if (!voice.hold()) return 'There is no live call to hold.';
    return 'You are now on hold and cannot be heard. Say nothing further. Do not ask if they are still there, do not check in, however long the silence lasts. Wait for someone to say continue, resume, carry on or go ahead — then call resumeNarration and pick up in one short sentence.';
  },

  /** "Carry on" / "we're back" — undoes holdNarration. */
  resumeNarration() {
    const voice = controller.voice;
    if (!voice) return 'The voice guide is not available.';
    if (!voice.isPaused()) return 'You were not on hold — carry on as normal.';
    voice.resume();
    return resumeContext();
  },

  getPageContext() {
    const key = openProductKey();
    const labels = key ? slideLabelsFor(key) : [];
    return `The client is looking at ${describe()}.` +
      (key
        ? ` Slides available: ${labels.join(', ')}.`
        : ` Products available: ${PRODUCT_IDS.join(', ')}.` +
          ' Use highlightProduct to centre one on the carousel, openProduct to open its deck.');
  },
};
