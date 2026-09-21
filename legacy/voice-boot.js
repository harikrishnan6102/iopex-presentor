/**
 * Voice guide wiring for the iOPEX products page (the index of the pitch).
 *
 * The agent drives this page while it talks: it scrolls to sections, switches
 * the DigiVox interviewer persona, moves the voice-tuning sliders, and hands off
 * to the DigiAura architecture deck when the conversation gets that far.
 *
 * Tool names here must match the client tools declared on the agent — see
 * agent/agent.md.
 */
import { createVoiceAgent } from './voice-agent.js';

/* ------------------------------------------------------------------ config -- */

// Public ElevenLabs agent id. Not a secret — it ships in the page either way.
// Override for a quick test with ?agent=agent_xxx or window.IOPEX_VOICE_AGENT_ID.
const AGENT_ID =
  new URLSearchParams(location.search).get('agent') ||
  window.IOPEX_VOICE_AGENT_ID ||
  '';

// Where the DigiAura architecture deck is served. Vite dev default; point this
// at the built deck when presenting for real.
const ARCHITECTURE_URL =
  window.IOPEX_ARCHITECTURE_URL || 'http://localhost:5173/';

/* ------------------------------------------------------------------- deck --- */

// Anchors the agent can send the client to. `.hero` and `.dv-cta` are classes
// rather than ids in this page, hence the selector rather than an id lookup.
const SECTIONS = {
  hero: '.hero',
  products: '#products',
  digivox: '#digivox',
  why: '#dv-why',
  setup: '#dv-setup',
  voices: '#dv-voices',
  scoring: '#dv-scoring',
  platform: '#dv-platform',
  results: '#dv-results',
  cta: '.dv-cta',
};

const PERSONAS = ['monika', 'akash', 'ryan', 'jane'];
const TUNER_KEYS = ['empathy', 'exploration', 'rapport', 'speed'];

const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Scroll an element into view and resolve only once the page has actually
 * arrived. Three things make the obvious one-liner wrong here:
 *
 *   - The page sets `html { scroll-behavior: smooth }`, so scrollIntoView is
 *     smooth whatever `behavior` you pass — `'auto'` means "use the CSS value",
 *     not "jump". Chrome's smooth scroll is also distance-scaled, so crossing
 *     this 6300px page takes seconds.
 *   - Each new smooth scroll restarts the last one. The agent narrates a tour,
 *     so calls arrive back to back and the page can end up never arriving
 *     anywhere.
 *   - scrollIntoView returns immediately. The tool was reporting "the client
 *     can see it now" while the page was still somewhere else entirely, and the
 *     agent would describe a section that was not on screen yet.
 *
 * So this owns the animation: fixed budget, cancels the previous one, and
 * resolves at the end. Client tools are awaited (see wrapTools in
 * voice-agent.js), so the agent starts talking only once the view has landed.
 *
 * @param {Element} el
 * @param {'start'|'center'} [block]
 * @returns {Promise<void>}
 */
let scrollToken = 0;

function scrollTo(el, block) {
  scrollToken += 1;
  const token = scrollToken;
  if (!el) return Promise.resolve();

  // The dock is fixed to the top, so scrolling a heading to y=0 parks it
  // underneath the dock. Measured rather than hard-coded: its padding is in vh.
  const dock = document.querySelector('.dock');
  const inset = dock ? dock.getBoundingClientRect().height + 12 : 0;

  const box = el.getBoundingClientRect();
  const max = document.documentElement.scrollHeight - window.innerHeight;
  const wanted = block === 'center'
    ? box.top + window.scrollY - (window.innerHeight - box.height) / 2
    : box.top + window.scrollY - inset;
  const to = Math.max(0, Math.min(max, wanted));
  const from = window.scrollY;
  const delta = to - from;

  // The page's own CSS smoothing has to be off while we drive it frame by
  // frame, or every step of the animation starts a second animation.
  const root = document.documentElement;
  const cssBehavior = root.style.scrollBehavior;
  root.style.scrollBehavior = 'auto';
  const restore = () => { root.style.scrollBehavior = cssBehavior; };

  if (reduce || Math.abs(delta) < 2) {
    window.scrollTo(0, to);
    restore();
    return Promise.resolve();
  }

  // Distance-aware but capped: a tour of the whole deck should not spend three
  // seconds gliding while the guide waits to speak.
  const ms = Math.min(700, 240 + Math.abs(delta) * 0.12);
  return new Promise((resolve) => {
    const t0 = performance.now();
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      restore();
      resolve();
    };
    // A tool that never returns blocks the agent's next inference, and the turn
    // dies silently. requestAnimationFrame does not run in a backgrounded tab,
    // so the animation alone is not a guarantee: this jumps to the target and
    // answers anyway if the frames never come.
    const guard = setTimeout(() => {
      if (!settled && token === scrollToken) window.scrollTo(0, to);
      finish();
    }, ms + 300);
    function step(now) {
      // A newer call has taken over; leave the scroll to it.
      if (token !== scrollToken) { clearTimeout(guard); finish(); return; }
      const u = Math.min(1, (now - t0) / ms);
      const e = u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
      window.scrollTo(0, from + delta * e);
      if (u < 1) requestAnimationFrame(step);
      else { clearTimeout(guard); finish(); }
    }
    requestAnimationFrame(step);
  });
}

/**
 * Move the page's cursor ring onto whatever the agent just acted on, so the
 * client's eye is led to it. Without this the ring only ever responds to a real
 * mouse, and the guide talks about things with nothing on screen indicating
 * which one it means. Optional by design: the ring belongs to the products page,
 * so a missing handle is a no-op rather than a broken tool.
 */
function point(selOrEl) {
  try { window.IOPEX_CURSOR?.pointAt(selOrEl); } catch { /* ring is optional */ }
}

function visibleSection() {
  const middle = window.innerHeight / 2;
  let best = 'hero';
  for (const [name, sel] of Object.entries(SECTIONS)) {
    const el = document.querySelector(sel);
    if (!el) continue;
    const box = el.getBoundingClientRect();
    if (box.top <= middle && box.bottom >= middle) best = name;
  }
  return best;
}

function currentPersona() {
  const active = document.querySelector('.persona.active');
  return active ? PERSONAS[+active.getAttribute('data-persona')] : null;
}

function tunerValues() {
  const sliders = document.querySelectorAll('[data-eq]');
  const out = {};
  TUNER_KEYS.forEach((k, i) => {
    if (sliders[i]) out[k] = parseFloat(sliders[i].value);
  });
  return out;
}

/* -------------------------------------------------------------- following --- */

/**
 * Phrases that mean a section, for following the guide's own narration.
 *
 * The agent is instructed to call goToSection before describing anything, but
 * an LLM does that reliably only when the client asks for it by name — left to
 * narrate, it talks about scoring while the screen is still on setup. Rather
 * than rely on the prompt, the page listens to what the guide is saying and
 * follows along.
 *
 * Cues have to be specific enough that hearing one is real evidence, so they
 * are phrases rather than bare words: "score" appears in half the pitch, "the
 * scoring report" does not.
 */
const SECTION_CUES = {
  products: ['our products', 'product line', 'three products', 'each product'],
  digivox: ['digivox'],
  why: ['why digivox', 'hiring bottleneck', 'the problem with hiring', 'screening problem'],
  setup: ['set it up', 'setting it up', 'the setup', 'job description', 'create an evaluation'],
  voices: ['interviewer', 'persona', 'voice tuner', 'voice tuning', 'monika', 'akash', 'ryan', 'jane'],
  scoring: ['the scoring', 'scoring report', 'scorecard', 'evaluation report', 'shortlist', 'how we score'],
  platform: ['the platform', 'integrations', 'your ats', 'fits into'],
  results: ['the results', 'the impact', 'time to hire', 'return on investment'],
  cta: ['next steps', 'get started', 'talk to us'],
};

// An explicit tool call always wins over the transcript: if the guide moved the
// page itself, the words that follow are describing where it already is.
// -Infinity, not 0: performance.now() starts near zero, so a plain 0 reads as
// "a tool moved the page just now" and mutes the follower for the first several
// seconds of every call — which is exactly the opening of the pitch.
let lastToolMove = -Infinity;
let lastFollow = -Infinity;

function markToolMove() {
  lastToolMove = performance.now();
}

/**
 * Move the page to whatever the guide has started talking about.
 * @param {string} text one line of agent transcript
 */
function followNarration(text) {
  const now = performance.now();
  if (now - lastToolMove < 6000) return;
  // Long enough that a 700ms scroll finishes and the guide gets a sentence out
  // before the page can move again; short enough to keep up with a brisk tour.
  if (now - lastFollow < 1200) return;

  const hay = String(text || '').toLowerCase();
  // Longest matching cue wins. "the platform" and "the platform's scoring"
  // should not be decided by whichever key happens to come first.
  let best = null;
  let bestLen = 0;
  for (const [name, cues] of Object.entries(SECTION_CUES)) {
    for (const cue of cues) {
      if (cue.length > bestLen && hay.includes(cue)) { best = name; bestLen = cue.length; }
    }
  }
  if (!best || best === visibleSection()) return;

  const el = document.querySelector(SECTIONS[best]);
  if (!el) return;
  lastFollow = now;
  scrollTo(el, 'start').then(() => {
    point(el.querySelector('h1, h2, .h-title, .eyebrow') || el);
  });
}

/* ------------------------------------------------------------------ tools --- */

const tools = {
  goToSection({ section }) {
    const name = String(section || '').toLowerCase();
    const sel = SECTIONS[name];
    if (!sel) {
      return `Unknown section "${name}". Available: ${Object.keys(SECTIONS).join(', ')}.`;
    }
    const el = document.querySelector(sel);
    if (!el) return `The "${name}" section is not on this page.`;
    markToolMove();
    return scrollTo(el, 'start').then(() => {
      // The heading, not the whole section: a ring centred on a full-height
      // section lands in empty space between the two columns.
      point(el.querySelector('h1, h2, .h-title, .eyebrow') || el);
      return `Scrolled to ${name}. The client can see it now.`;
    });
  },

  setInterviewerPersona({ name }) {
    const want = String(name || '').toLowerCase();
    const idx = PERSONAS.indexOf(want);
    if (idx === -1) return `Unknown persona "${want}". Available: ${PERSONAS.join(', ')}.`;

    const btn = document.querySelector(`.persona[data-persona="${idx}"]`);
    if (!btn) return `The ${want} persona is not on this page.`;

    // Click rather than set state directly: the page's own handler updates the
    // name, all four sliders and the equaliser together.
    markToolMove();
    return scrollTo(document.querySelector(SECTIONS.voices), 'center').then(() => {
      btn.click();
      point(btn);
      const vals = tunerValues();
      return `Switched the interviewer to ${want}. The tuner now reads ` +
        TUNER_KEYS.map((k) => `${k} ${vals[k]}`).join(', ') + '.';
    });
  },

  tuneVoice(params) {
    const sliders = document.querySelectorAll('[data-eq]');
    if (!sliders.length) return 'The voice tuner is not on this page.';

    const applied = [];
    TUNER_KEYS.forEach((key, i) => {
      const raw = params[key];
      if (raw === undefined || raw === null || raw === '') return;
      const v = Math.max(0, Math.min(1, parseFloat(raw)));
      if (Number.isNaN(v)) return;
      sliders[i].value = String(v);
      // The page listens for 'input', not 'change' — dispatching it is what
      // redraws the value label and the equaliser.
      sliders[i].dispatchEvent(new Event('input', { bubbles: true }));
      applied.push(`${key} ${v.toFixed(1)}`);
      // Points at the last slider touched, which is the one still animating.
      point(sliders[i]);
    });

    if (!applied.length) {
      return `Nothing to change. Pass one or more of: ${TUNER_KEYS.join(', ')} (0 to 1).`;
    }
    markToolMove();
    return scrollTo(document.querySelector(SECTIONS.voices), 'center').then(
      () => `Tuned ${applied.join(', ')}. The equaliser is reacting on screen.`
    );
  },

  openArchitecture() {
    // A real navigation, so the call ends here. The deck picks the story back up
    // from the `from=products` hint rather than greeting the client again.
    point('.p-card a, .p-card');
    const url = new URL(ARCHITECTURE_URL);
    url.searchParams.set('from', 'products');
    setTimeout(() => { window.location.href = url.toString(); }, 400);
    return 'Opening the DigiAura architecture deck. Say that you are switching to ' +
      'the architecture view — the voice guide reconnects there in a moment.';
  },

  getPageContext() {
    return JSON.stringify({
      page: 'iOPEX products (index)',
      visibleSection: visibleSection(),
      interviewerPersona: currentPersona(),
      tuner: tunerValues(),
      theme: document.documentElement.getAttribute('data-theme'),
    });
  },
};

// Client tools are declared once on the agent but only registered on the page
// that implements them. Without stubs, calling an architecture tool from here
// would leave the agent waiting on a tool that does not exist.
const ARCHITECTURE_ONLY = [
  'playStory', 'nextStep', 'previousStep', 'goToStep', 'stopStory',
  'switchScreen', 'openCapability', 'backToOverview', 'switchSquad',
  'quoteMetrics', 'getDeckContext',
];
ARCHITECTURE_ONLY.forEach((name) => {
  tools[name] = () =>
    `"${name}" only works on the DigiAura architecture deck. The client is still on ` +
    'the products page — call openArchitecture first, then continue there.';
});

/* ------------------------------------------------------------------- boot --- */

const css = getComputedStyle(document.documentElement);
const v = (name, fallback) => (css.getPropertyValue(name).trim() || fallback);

const agent = createVoiceAgent({
  agentId: AGENT_ID,
  tools,
  // Cool blue defines the guide; warm brand energy appears while it speaks.
  palette: {
    amber: '#FFC845',
    cyan: '#19A7FF',
    orange: '#FF6B00',
    ink: '#BCEBFF',
    muted: v('--text-dim', '#989ea7'),
  },
  dynamicVariables: {
    deck: 'products',
    entry_section: visibleSection(),
  },
  onMessage: ({ message, source }) => {
    if (source === 'ai' && message) followNarration(message);
  },
  onState: (next) => {
    // Hand the ring back when the call ends. Left guided, it sits pulsing over
    // whatever the guide mentioned last, which reads as a stuck UI.
    if (next === 'idle' || next === 'error') {
      try { window.IOPEX_CURSOR?.release(); } catch { /* ring is optional */ }
    }
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
