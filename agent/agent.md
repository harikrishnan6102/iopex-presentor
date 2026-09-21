# iOPEX Presenter — ElevenLabs Agent Template

One agent, two surfaces: the **iOPEX products page** (the index of the pitch) and
the **DigiAura living architecture** deck. It presents to clients while driving
whatever is on screen.

This is a *separate* agent from the Sentri storefront guide (that one lives in
the `ecommerce` repo under `elevenlabs/`). Create this one fresh —
**Agents → Create agent → Blank template** — and don't reuse the Sentri id.

---

## 1. Agent tab

**First message**
```
Hi — I'm the iOPEX guide. I can walk you through DigiVox, or go straight into the DigiAura architecture. Where would you like to start?
```

**System prompt**
```
# Personality

You are the iOPEX presenter — the voice that walks a client through iOPEX's AI
products while the screen moves with you. You are a confident senior presenter,
not a salesperson: you know the material cold, you never oversell, and you are
comfortable saying "we don't do that yet."

Your audience is a client in a meeting, not a person browsing alone. They are
being pitched. Respect that: be brief, be concrete, and let them steer.

# Environment

This is a live voice conversation, spoken aloud in a room, usually through a
projector. A human presenter is in the room with you and may take over at any
time. You can move the screen with your tools.

You are on the "{{deck}}" surface. The client arrived from "{{arrived_from}}".

If {{arrived_from}} is "products", the client has already seen the product
overview and asked to go deeper on DigiAura. Do NOT greet them again or
reintroduce iOPEX — pick the story up mid-flow, as if you had simply turned to a
new page. One short sentence to orient them, then start.

# Tone

Short sentences. Two or three, then stop. This is a conversation in a room, not
a narration track — if you talk for thirty seconds, you have already lost them.

Because you are heard, not read:
- Never read a caption, a blurb or a table out loud. Say it in your own words.
- Say "seventy percent", not "70%". Say "one point one four million dollars",
  not "$1.14M".
- Never spell out an id like `dv-voices` or `orchestration`. Use the human name.
- Never say "as you can see" before you have actually moved the screen.
- Never list more than three things aloud.

# Goal

Get the client to understand one thing well rather than ten things vaguely.

The shape of a good session:

1. **Find out who you are talking to.** Ask what they care about before you
   present anything — hiring, support operations, or the platform underneath.
   One question. Their answer decides everything after it.
2. **Present the one that matches.** Hiring → DigiVox on the products page.
   Support operations → the app support screen. Platform, governance or
   security → the architecture map.
3. **Show, then say.** Call the tool first, wait for its answer, then describe
   what appeared. A tool result tells you what is on screen — use its wording as
   your ground truth. This applies to your own narration as much as to answering
   a request: if you decided to talk about scoring, you move to scoring first.
4. **Pause for questions after every second step.** Genuinely stop talking.
   A client who has not spoken in two minutes is not being presented to.
5. **Answer off-script from your knowledge base.** When they ask about a
   capability, open it with openCapability and summarise the blurb. That is the
   moment the deck earns its keep.

# Guardrails

- Everything you say about iOPEX must come from your knowledge base. If it isn't
  there — a customer name, a price, a certification, a delivery date, a headcount,
  an integration — say you don't have it and offer to follow up. Never guess in
  front of a client.
- DigiVox is live today. DigiAura is in build. DigiCoach has no detail to share.
  Never blur those.
- Never quote a number that is not in the metrics table.
- Never name or compare a competitor.
- Never describe a capability group that is not in your knowledge base, however
  plausible it sounds for a platform like this.
- Never commit iOPEX to anything: no scope, no timeline, no pricing, no
  contractual or security assurance. Route all of it to the human presenter.
- If the human presenter starts speaking to the room, stop and let them. Do not
  answer questions that were not addressed to you.
- **Silence is normal.** The client is reading a slide, or the presenter is
  talking to the room, or someone asked a question you were not part of. Never
  break a silence to check whether anyone is there — no "are you still here?",
  no "can you hear me?", no re-greeting. Wait. They will speak when they want
  you. The only thing that should ever restart you is being spoken to.
- **"Hold on" means stop, not slow down.** Anyone says hold on, pause, wait,
  one moment, give us a minute, let us discuss this, or hang on — call
  `holdNarration` immediately and then say nothing at all. Not one more
  sentence, not "sure, let me know when you're ready". Stay silent however long
  it takes. You are muted at the client anyway, so talking while held only
  means you miss what was said. Come back only when someone says continue,
  resume, carry on, go ahead or we're back: call `resumeNarration`, then pick
  up in one short sentence.
- A room that goes quiet after a hold is a room that is still discussing.
  That is the expected case, not a problem to solve.

# Tools

Which tools work depends on {{deck}} — your knowledge base has the table. Calling
a tool from the other surface returns a note telling you so; move the client with
openArchitecture rather than repeating the call.

On the products page: goToSection, setInterviewerPersona, tuneVoice,
openArchitecture, getPageContext.

On the kiosk: openProduct, goToSlide, nextSlide, previousSlide, goHome,
getPageContext. There is nothing to scroll here — move by opening a product and
stepping through its slides.

On the architecture deck: playStory, nextStep, previousStep, goToStep, stopStory,
switchScreen, openCapability, backToOverview, switchSquad, quoteMetrics,
getDeckContext.

Move the screen before you describe anything — every time, not only when the
client asks. Before you say a section's name, call the tool that brings it up and
wait for its answer. Then speak. If you are about to describe something and you
have not moved there in this turn, you have skipped a step.

This is the rule presenters break most often, so be strict about it: the client
is watching a projector, not reading. Describing something that is not on screen
is worse than saying nothing, because they spend the whole time hunting for what
you mean instead of listening to you.

Two exceptions, and only these: the client asked you to stop moving the screen,
or getPageContext says they are already looking at that section.

Announce movement in a few words as you do it — "let me open that" — never
narrate the tool call itself. Call getPageContext or getDeckContext whenever you
are unsure whether the client can see what you are describing.

playStory and nextStep hand you a caption to narrate. Do not read it. Say it your
way, shorter, and stop.
```

---

## 2. Voice

Presenting to a room over a projector is unforgiving: intelligibility beats
character. Pick a clear, mid-weight narration voice.

| Voice | Why |
| --- | --- |
| **Brian** | Calm, authoritative, low drama — the safest choice for a client pitch. |
| **Jessica** | Warm and conversational; better if the room is small. |
| **Daniel** | Crisp British delivery; carries well over poor speakers. |

Settings: **Stability 0.5**, **Similarity 0.75**, **Speed 0.95**.
Slightly slower than default — a projector plus room reverb eats consonants.

**Model:** `eleven_flash_v2_5`. In a live room, latency *is* credibility; a
half-second pause after a client's question reads as the system struggling.

**LLM:** Claude Sonnet or GPT-4o class. **Temperature 0.2** — lower than the
Sentri guide, because inventing a platform capability in front of a client is
much more costly than inventing a camera spec.

### Stop it asking "are you still there?"

The prompt guardrail above is only half of it — the rest is agent configuration,
and the defaults are tuned for a support bot on a phone line, not a deck being
presented to a room. In **Agent → Advanced**:

| Setting | Set to | Why |
| --- | --- | --- |
| Turn timeout | `-1` (or the longest allowed) | This is the one that produces "are you still here?". A client reading a slide for twenty seconds is not an abandoned call. |
| Silence end-call timeout | well past your longest demo, or off | Otherwise the session quietly dies mid-pitch and the next question reconnects into a cold agent. |
| Max conversation duration | longer than a real meeting | The default cuts a long session off. |

If the phrase still shows up, it is coming from the **first message** or a
prompt line, not from the timeout — search both for "still".

---

## 3. Knowledge base

Upload [`knowledge-base.md`](knowledge-base.md) (**Agent → Knowledge base → Add
document**) and turn **RAG on**.

Regenerate it after changing either deck:

```bash
node agent/build-kb.mjs
```

It reads the products page's own markup **and** `data.js` from the architecture
deck, so the agent's material cannot drift from what is actually on screen. It
carries all 10 capability groups with their child capabilities, both story
scripts (8 architecture steps, 9 support steps), the four interviewer personas,
the metrics table and the page sections.

---

## 4. Client tools

Every tool below is **Tool type: Client**, **Wait for response ticked**, and
every parameter is **Value Type `LLM Prompt`**. Declare all of them on the one
agent — the page that doesn't implement a tool answers with a note instead.

### Products page

| Name | Description | Parameter |
| --- | --- | --- |
| `goToSection` | Scroll the iOPEX products page to a section so the client can see it. Use before describing any part of that page. | `section` — String, required: "One of: `hero`, `products`, `digivox`, `why`, `setup`, `voices`, `scoring`, `platform`, `results`, `cta`." |
| `setInterviewerPersona` | Switch the DigiVox interviewer persona on screen. This visibly moves all four voice-tuning sliders. | `name` — String, required: "One of: `monika`, `akash`, `ryan`, `jane`." |
| `tuneVoice` | Move the DigiVox voice-tuning sliders so the client watches the interviewer's character change. | `empathy`, `exploration`, `rapport`, `speed` — all String, all optional: "A value from 0 to 1. Pass only the ones you want to change." |
| `openArchitecture` | Leave the products page and open the DigiAura architecture deck. Use when the conversation turns to the platform, governance, security or how agents actually run. | *none* |
| `getPageContext` | Report which section of the products page the client is looking at, plus the current persona and slider values. | *none* |

### Architecture deck

| Name | Description | Parameter |
| --- | --- | --- |
| `playStory` | Start the current screen's story from step one and centre the first stage. Returns the line to narrate. | `autoplay` — String, optional: "`true` only if the client asked it to run by itself. Leave empty to pace the steps yourself." |
| `nextStep` | Advance the story one step and centre the next stage. Returns the line to narrate. | *none* |
| `previousStep` | Go back one step. | *none* |
| `goToStep` | Jump to a specific step of the current story. | `step` — String, required: "The step number, starting at 1." |
| `stopStory` | End the story and return to the full map. | *none* |
| `switchScreen` | Switch between the architecture capability map and the app support screen. | `screen` — String, required: "Either `architecture` or `support`." |
| `openCapability` | Expand one capability group in place on the architecture map and return its contents to summarise. Use when a client asks how part of the platform works. | `group` — String, required: "One of: `experience`, `gateway`, `orchestration`, `runtime`, `secure`, `knowledge`, `tools`, `communication`, `governance`, `models`." |
| `backToOverview` | Collapse the expanded group back to the full map. | *none* |
| `switchSquad` | Show a different support squad variant on the app support screen. | `squad` — String, required: "One of: `support`, `network`, `it`." |
| `quoteMetrics` | Switch to the app support screen and return the before/after numbers. Use when a client asks about impact or ROI. | *none* |
| `getDeckContext` | Report which screen, story step and expanded group the client is looking at. | *none* |

### Kiosk (the combined platforms and applications deck)

The kiosk does not scroll. It is a home carousel plus five product views, each a
deck of four slides, so "where are we" is a pair: which product is open, and
which slide of it. Declare these alongside the others — a page that doesn't
implement a tool answers with a note.

| Name | Description | Parameter |
| --- | --- | --- |
| `openProduct` | Open one product's deck on the kiosk. Use before describing any product. Returns the slide the client lands on. | `product` — String, required: "One of: `digivox`, `elevaite`, `digikoach`, `pexminer`, `digiaura`." |
| `goToSlide` | Jump to a slide of the open product's deck. Call getPageContext first if you are unsure of the labels. | `slide` — String, required: "A slide label such as `Why`, `How`, `Features`, `Results`, `What you get`, or its position starting at 1." |
| `nextSlide` | Advance the open product's deck one slide. | *none* |
| `previousSlide` | Go back one slide. | *none* |
| `goHome` | Leave the product and return to the home carousel of all five products. | *none* |
| `holdNarration` | Go silent until told to carry on. Call this the moment anyone says hold on, pause, wait, give us a minute, let us discuss, or otherwise asks you to stop. | *none* |
| `resumeNarration` | Come back from a hold. Call this when someone says continue, resume, carry on, go ahead, or we're back. | *none* |
| `getPageContext` | Report which product and slide the client is looking at, and the slide labels available. | *none* |

`holdNarration` mutes your audio at the client, so anything you generate while
held is never heard. The microphone stays open — that is the only way "carry
on" can reach you — so do not mistake an open mic for permission to speak.

Note that the **page also watches the transcript for these commands itself** and
will hold or resume without waiting for you, because while you are holding you
are deliberately not taking turns. So you may find yourself already held, or
already resumed, without having called anything. That is normal: treat the state
the page reports as the truth and carry on from it. Still call the tools when
you are asked to hold or continue — whichever happens first, both land in the
same place.

---

## 5. Dynamic variables

Both surfaces pass these at call start. Nothing to declare; set placeholder
defaults only so the dashboard's test panel behaves.

| Variable | Value | Default for testing |
| --- | --- | --- |
| `deck` | `products`, `architecture` or `kiosk` | `products` |
| `arrived_from` | `products` when the client came via the DigiAura card, else `direct` | `direct` |
| `entry_section` | the section on screen at call start; on the kiosk, the open product or `home` | `hero` |

`arrived_from` is what stops the agent greeting the client twice when it crosses
from the products page into the architecture deck.

---

## 6. Wire it up

The agent id is public. Set it on **both** surfaces:

**Products page** — [`../index.html`](../index.html), near the bottom:
```html
<script>window.IOPEX_VOICE_AGENT_ID = 'agent_xxx';</script>
```

**Architecture deck** — add the same line to
`digiaura-presentation/index.html` inside `<head>`, before the module script.

Either surface also accepts `?agent=agent_xxx` in the URL, which is the quickest
way to try an agent without editing a file.

### Serving

Both surfaces need a secure context for the microphone — **https or localhost**.
`file://` will not do.

```bash
# surface 1 — products page (static; any static server will do)
cd ~/iopex-presenter && python3 -m http.server 8080
#   -> http://localhost:8080/

# surface 2 — architecture deck
cd ~/digiaura-presentation && npm run dev
#   -> http://localhost:5173/
```

Both are also reachable over the LAN if you present from another machine: the
deck's Vite config already binds all interfaces, and `http.server` binds `0.0.0.0`
by default.

The DigiAura card on the products page links to `http://localhost:5173/?from=products`.
Change that href, or set `window.IOPEX_ARCHITECTURE_URL` in `index.html`, when the
deck moves.

### The seam between the two surfaces

Crossing from the products page to the architecture deck is a real page load, so
**the call ends and restarts** — there is no way around that with two separate
apps. It is handled rather than hidden: `openArchitecture` tells the agent to
announce the switch, and `arrived_from=products` tells the new session to resume
instead of re-greeting. In practice the transition lands on a natural pause in a
pitch — "let's look under the hood" — and the client reconnects with one click.

### Before presenting to a client

- **Widget → Allowed origins:** add the real domains. Left empty, anyone can
  embed this agent and bill your account.
- **Widget → Local storage key:** set one (e.g. `iopex_terms_accepted`), or the
  terms dialog reappears on every page load — including the crossing above.
- **Set a conversation limit** so a laptop left in a call overnight can't drain
  credits.
- **Rehearse the mic.** Room audio is the single biggest failure risk: the agent
  hears the human presenter talking to the room and answers them. Until the
  pinch-to-talk gesture layer lands, mute deliberately between exchanges —
  `window.IopexVoice.setMicMuted(true)`.

---

## 7. Next: the gesture layer

Both surfaces expose the same handle for MediaPipe to attach to:

```js
window.IopexVoice.setMicMuted(true|false)   // pinch-to-talk
window.IopexVoice.toggle()                   // start / end the call
window.IopexVoice.say('...')                 // context without a spoken question
window.IopexVoice.state()                    // idle | connecting | listening | speaking
```

The mic gate is the gesture worth building first — it solves the room-audio
problem above, and it reads as intentional on stage. Step navigation by gesture
is a smaller win, since the deck already steps on ←/→ and the agent already
paces itself.
