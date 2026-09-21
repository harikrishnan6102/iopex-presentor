# iOPEX Presenter — Kiosk (React + TypeScript)

The iOPEX products kiosk: a particle-logo home carousel plus five product decks
(elevAIte, DigiVox, Pexminer, DigiKoach, DigiAura), presented by an ElevenLabs
voice guide rendered as an animated bust, with two gesture inputs.

This is the React + TypeScript port of `legacy/iopex-products-kiosk-v2.html`.
Every animation and interaction of that page is preserved: the Three.js particle
symbol (fly-in formation, idle shimmer, scroll-driven swarm split, ambient flow
field with depth layers and cursor parallax, per-product cinematic camera
drift), the hero rotator with per-letter text roll, the coverflow carousel with
autoplay / play-pause / swipe / particle burst, the Framer-Motion-style slide
transitions, border beams, counters, tilt cards, report-shot loops, the
Manual/Gesture mode switch with camera motion-swipe, idle attract mode, and
hash routing with working back/forward.

## Run it

```bash
npm install
npm run dev        # http://localhost:8080 (falls back to the next free port)
npm run build      # typecheck + production bundle in dist/
npm run preview    # serve dist/ on :8081
```

**Microphone and camera need a secure context — https or localhost.**

## Access code

The kiosk URL is public, and every visitor who taps "Ask the guide" starts a
paid ElevenLabs session. A static code gates **the guide, not the site**: the
decks, the carousel and the gesture remote stay open to anyone walking past, and
the code is asked for once, at the moment a call would start.

Set the code in `.env.local` (gitignored, needs a rebuild to take effect):

```
VITE_ACCESS_CODE=your-code
```

or, to change it on a deployed build without rebuilding, in `index.html`:

```html
<script>window.IOPEX_ACCESS_CODE = 'your-code';</script>
```

With no code set anywhere there is no gate, so dev and CI are untouched.

| | |
| --- | --- |
| `?code=your-code` | unlocks without typing, then strips itself from the URL — for a kiosk that boots into a URL |
| `?lock` | forgets the unlock and asks again |
| `window.IopexAccess.lock()` | the same, from the console |

An unlock is remembered in `localStorage`, so the kiosk does not re-ask on every
reload. The prompt is a modal over the live page — Escape or "Not now" backs out
and leaves the guide idle.

**This is a door, not a lock.** The code ships inside the bundle; anyone who
opens devtools can read it. It stops a shared link from becoming a live session
for whoever clicks it, which is the bill you are seeing. The limits that
actually bound spend live on the agent itself — **Allowed origins**, a
**conversation limit**, and a per-conversation duration cap.

## Voice guide

The agent id resolves in this order: `?agent=agent_xxx` in the URL →
`window.IOPEX_VOICE_AGENT_ID` → `VITE_ELEVENLABS_AGENT_ID` in `.env` → the id
shipped with the original products page. Set **Allowed origins** and a
**conversation limit** on the agent before presenting.

Client tools declared for the kiosk (see `src/voice/kioskTools.ts`):
`showCarousel`, `highlightProduct`, `openProduct`, `goToSlide`, `nextSlide`,
`previousSlide`, `goHome`, `holdNarration`, `resumeNarration`, `getPageContext`.

`showCarousel` and `highlightProduct` exist for the portfolio overview: the
guide greets on the logo screen, brings up the carousel, then centres each
product's card as it introduces it — without opening any deck. `openProduct` is
the deep dive. The page also follows the guide's narration: naming a product out
loud centres its card on the carousel, or opens that deck if one is already open.

Drive the tools from the console without a live call:

```js
window.IopexVoice.tools.showCarousel({})
window.IopexVoice.tools.highlightProduct({ product: 'pexminer' })
window.IopexVoice.tools.openProduct({ product: 'digivox' })
window.IopexVoice.tools.goToSlide({ slide: 'Results' })
window.IopexVoice.tools.getPageContext()
window.IopexVoice.report()          // reply / tool latency summary
```

`?debug=voice` logs transcript, tool calls and timings. Client-tool failures are
warned to the console always, not just under that flag — when one fires the guide
tells the room it is "having a technical issue", so there needs to be something
to look at afterwards.

**Offline vs. a blip.** The SDK reports recoverable problems through the same
error callback as a dead session. Only a session that is actually disconnected
shows "Offline — tap to retry"; anything arriving while the transport is still
up is treated as transient, and any later traffic clears it. This matters beyond
the label: the attract loop reads this state, so a guide wrongly marked offline
also stopped counting as "someone is presenting" and let the kiosk jump back to
the carousel.

### Holding it, and turning it off

| How | Effect |
| --- | --- |
| **Hold** button on the panel | Silences the guide until you press Resume. Mic stays open. |
| Saying "hold on" / "pause" / "give us a minute" | Same thing — the agent calls `holdNarration`. |
| Saying "carry on" / "continue" / "we're back" | Resumes (`resumeNarration`). |
| Two-finger gesture | The presenter's hard pause: mic closed too, so the room is not heard at all. Resumed by gesture or button, never by voice. |
| `×` on the panel (top-right, on hover) | Ends any call and hides the guide for the session; releases the side gutter the deck reserves for it. |
| `Esc` | Ends a live call, leaves the panel in place. |
| `?voice=off` | Starts with the guide hidden. |

Holding does not rely on the model at all, in either direction:

- **The command is recognised on the page**, from the user transcript, not by
  the agent calling a tool. Routing it through a tool meant the model had to
  take a turn to act on it — and holding is the one moment it has been told to
  stay silent, so a spoken "carry on" would sit there doing nothing while the
  button worked fine. `holdNarration` / `resumeNarration` stay declared as a
  second path; whichever fires first lands on the same hold()/resume().
- **The silence is enforced at the client.** Output volume goes to zero, and if
  a turn starts anyway the mute is re-asserted, so anything generated while
  held is inaudible whatever the model does.

A cue only counts as a command in a short utterance (5 words for hold, 8 for
resume). "Hold on" is a command; *"hold on, can you explain the scoring again"*
is a question, and muting the guide mid-question is worse than missing the cue.
The same limit keeps room cross-talk from resuming it by accident. `?debug=voice`
logs both the commands that fire and the cues it deliberately ignored.

The difference between **hold** and the **two-finger pause** is only whether the
mic stays open — hold has to keep listening, or nothing could hear "carry on".
The gesture pause closes the mic, so it is resumed by gesture or button only.

If the agent keeps asking **"are you still here?"**, that is agent-side, not the
page: it is the *turn timeout* in ElevenLabs (**Agent → Advanced**), whose default
assumes a phone support call rather than a client reading a slide. See
`agent/agent.md` → *Stop it asking "are you still there?"* for the settings and
the prompt guardrail that go with it.

### Where it sits

The guide lives in the **bottom-right corner**, above the deck's chip and arrow
row so the tabs keep their own line. By default it is collapsed to a single
**Tap to present** pill — no bust, no name, nothing else.

**Starting a call brings the humanoid up by itself** — the collapsed pill is the
idle state, not the presenting one. It collapses again when the call ends, so
the resting screen stays clean.

**Swipe the iOPEX logo** (drag it ~36px, any direction — up, down or sideways)
to bring the humanoid up by hand without starting a call. Tapping the logo still returns to the home
carousel — a swipe suppresses the click that follows it, and a drag under 36px
counts as a tap.

The gesture starts on the logo but completes on the window, so a swipe that
leaves the logo's box — which an upward one does almost immediately — still
lands. Binding the release to the element itself is why only sideways swipes
used to work.

That swipe only ever *reveals*; it is deliberately not a toggle. The logo is a
wide target across the top of the screen, so a presenter swiping between slides
catches it in passing, and as a toggle that silently put the guide away
mid-presentation. Once the humanoid is up it stays up through slide changes,
product changes and trips back to the carousel; it comes down when the call
ends, or with the panel's own x.

The decks reserve a column on the **right only** (`--voice-gutter` in
`src/styles/extras.css`) so no slide runs under the panel, and the slide stays
centred in the space actually left rather than being pinched by an equal dead
margin on the side the panel does not occupy. The gutter collapses to zero when
the guide is hidden. Below 760px there is no gutter to stand in, so the panel
falls back to a compact bar centred on the bottom edge.

While a call is live the panel shows level bars — warm and tall as the guide
speaks, cool and low as it listens — above its name and status, whether or not
the humanoid is revealed. The **name** is its own line: the status ("Listening",
"Offline — tap to retry") used to be the only text there and got read as the
assistant's name.

## Gestures — the presentation remote

One camera, MediaPipe GestureRecognizer (two hands). Turn it on with the
**Gesture** button in the header (or press `g`): the camera and the model start
together and gestures are **live the moment the model is loaded** — no wake
gesture. The HUD in the bottom-left shows the live camera with the hand
skeleton, the state, the legend with the active gesture lit, a hold-progress
ring and the zoom level.

| Gesture | Home — hero showing | Home — carousel | Product deck |
| --- | --- | --- | --- |
| 🖐 **Open-palm sweep →** (toward your right) | enter the carousel | next product | next slide |
| 🖐 **sweep ←** | — | previous product | previous slide |
| 🖐 **sweep ↑** | enter the carousel | open the centred product | next slide |
| 🖐 **sweep ↓** | — | back up to the logo | previous slide |
| 👍 **Thumbs up** (the "click", ~0.3s) | enter the carousel | open the centred product | start the voice AI guide |
| ✊ **Fist, hold** ~0.8s | home carousel, restarted | same | same |
| ✌️ **Two fingers, hold** ~0.4s | start the voice AI agent, or continue it if paused | | |
| ☝️ **One finger, hold** ~0.5s | pause the AI agent (mic closed, output silenced, agent told to hold) | | |
| 🤏🤏 **Both hands pinch**, spread / close | zoom in / out (1×–3×) around the point between your hands; releases keep the zoom, a slide or view change resets it | | |

Design rules that keep it fast *and* reliable on stage:

- A swipe is one sweep of an open hand inside ~380ms along one axis; a
  diagonal, a back-and-forth or a closed hand fires nothing. Frames the
  classifier cannot read (motion blur) are neutral, so a fast sweep still lands.
- Every hold gesture needs a **hold**, then a **release** before it can fire
  again — one physical gesture, one event. The ring on the HUD shows the hold.
- MediaPipe's canned classifier is cross-checked against finger geometry
  (`src/gesture/gestureMath.ts`); a low-confidence or contradictory frame fires nothing.
- With **two hands** in frame only zoom runs — forming a pinch never triggers a
  swipe or a hold.
- All timings live in one `TUNING` object in `src/gesture/gestureEngine.ts`.
  `window.IopexGesture.diagnose()` tells the failure modes apart (no camera / no
  model / no hand seen / no detections).

`npm run test:gesture` runs the pure gesture-maths tests (pose geometry,
classifier rules, 4-direction swipe, hold/refire) on plain Node.

## Layout

```
index.html                 Vite entry (fonts only; everything else is in src/)
src/main.tsx               mounts <App/> + global styles
src/App.tsx                hash routing, idle/attract loop, view switch
src/kiosk/store.ts         view + mode state (useSyncExternalStore)
src/kiosk/controller.ts    typed replacement for the old window globals:
                           openProduct / showHome / goHomeToCarousel / registry
src/data/products.ts       product catalogue, hero copy, camera drift, accents
src/scene/ParticleScene.ts Three.js backdrop (logo swarm + ambient field)
src/components/
  CanvasBackground.tsx     mounts the scene
  Dock.tsx                 header: brand → home, Manual/Gesture switch
  HomeView.tsx, Hero.tsx, LogoCarousel.tsx
  ProductView.tsx          picks the deck for the open product
  deck/SlideDeck.tsx       slides, chips, arrows, keys, swipe, wheel
  deck/useDeckEffects.ts   reveal / counters / tilt / rings
  slides/*.tsx             the five decks' content
  VoiceGuide.tsx           mounts the ElevenLabs bust + kiosk tools
  GestureHud.tsx           gesture engine → kiosk bindings + the on-screen HUD
src/voice/voiceAgent.ts    ElevenLabs session + canvas bust, pause/resume
src/voice/kioskTools.ts    client tools + narration follower
src/gesture/gestureEngine.ts MediaPipe GestureRecognizer → wave/hold/swipe/zoom events
src/gesture/gestureMath.ts pure geometry + detectors + HoldTracker (unit-tested)
scripts/gesture-math.test.ts
src/styles/global.css      the kiosk page's stylesheet, verbatim
src/styles/extras.css      gesture HUD + zoom transitions
legacy/                    the original static files, for reference
agent/                     ElevenLabs agent template + knowledge-base builder
```

Console-friendly globals for parity with the old page: `window.IopexKiosk`,
`window.showDigiVoxView()`, `window.goHomeToCarousel()`, and so on.

## Carrying on through silence

A kiosk is not a phone call — people walk up, hear the greeting and wait to be
shown something. Five seconds after the guide stops talking with nobody having
replied, the page hands it a turn telling it to move on, so the walkthrough
flows instead of stalling on "shall I continue?".

It only fires when nobody has spoken since the guide finished, so it can never
cut anyone off, and it never fires on a hold. Three in a row without a human
word and it stops — an empty room should not be presented the whole portfolio at
full price.

```
?nudge=off      # turn it off for a session
```

Tuning lives in `NUDGE_MS` / `MAX_NUDGES` in `src/components/VoiceGuide.tsx`.

## Idle / attract mode

Unattended kiosk behaviour: after 90s with no interaction the page backs out of
whatever product is open and returns to the home carousel.

**A live voice call counts as interaction.** It did not use to, which is why a
deck would snap back to the carousel part-way through the guide explaining
DigiVox — the presenter was talking, so nothing touched the pointer or keyboard
for 45s and the attract loop fired. The timer now re-arms instead of firing
while a call is anything other than idle or errored.

For a staffed demo, turn the loop off outright:

```
?attract=off                       # for the session
window.IopexKiosk.setAttractEnabled(false)   # from the console
```

## Notes

- React StrictMode is deliberately off: the scene, voice agent and gesture layer
  are heavy imperative singletons and double-mounting them in dev only costs time.
- The MediaPipe wasm runtime is bundled from the npm package (no CDN version
  mismatch); only the ~8MB hand model downloads from Google's model store.
- `agent/agent-portfolio.md` + `agent/knowledge-base-portfolio.md` are the
  current ElevenLabs setup: the team's walkthrough script (greet on the logo
  screen, overview on the carousel, deep dive per product) with every figure
  tagged "on screen" or "script only". `agent/agent.md` and
  `agent/knowledge-base.md` are the older two-surface pair, kept for reference.
- `agent/knowledge-base.md` covers the kiosk (five products x four slides,
  every figure read off the live slides) alongside the architecture deck and the
  older products page. `agent/build-kb.mjs` still only generates the
  products-page section and knows nothing about the kiosk, so that file is partly
  hand-maintained: change a slide's numbers and you must change them there too,
  or the guide will confidently quote the old ones.
