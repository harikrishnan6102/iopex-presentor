import { useCallback, useEffect, useRef, useState } from 'react';
import { createVoiceAgent } from '../voice/voiceAgent';
import AccessGate from '../access/AccessGate';
import { consumeUrlParams, isUnlocked, lock, requiredCode } from '../access/accessCode';
import { kioskTools, abortSettles, followNarration, followSpokenCommand, noteVoiceState } from '../voice/kioskTools';
import { controller } from '../kiosk/controller';
import { openProductKey } from '../kiosk/store';
import { resolveAgentId } from '../config';

/**
 * Mounts the ElevenLabs voice guide (the animated bust + "Ask the guide" pill)
 * and wires the kiosk client tools to it.
 *
 * Also guards the one expensive thing on the kiosk: a call only starts once the
 * access code has been entered. Every route in goes through agent.start() — the
 * pill, the keyboard, the thumbs-up and two-finger gestures, the console — so
 * the check sits there rather than on any one of them.
 *
 * The handle is exposed as window.IopexVoice so the tools can be exercised from
 * the console without a live call:
 *   window.IopexVoice.tools.openProduct({ product: 'digivox' })
 */
/**
 * How long the guide waits for a reply before carrying on by itself.
 *
 * A kiosk is not a phone call: nobody feels obliged to answer it, and most
 * people stand there waiting to be shown something. The greeting ends, the room
 * says nothing, and a well-behaved agent waits — which reads as the thing having
 * frozen. So after this long the page hands the agent a turn and tells it to
 * move on.
 *
 * Deliberately short. It only ever fires when *nobody at all* has spoken since
 * the guide stopped talking, so it cannot cut anyone off — and between the five
 * products of the overview it is the entire gap the room sees. At five seconds
 * every handover read as a stall: the guide finishes a product, asks nothing,
 * and the screen sits still for a beat long enough to look broken.
 *
 * Three seconds is what the room asked for: long enough that each product lands
 * as its own beat rather than the deck running on by itself, short enough that
 * the pause reads as the presenter drawing breath. Do not shorten it to close
 * the gap — the gap is the point, and a shorter one only hands the agent its
 * next turn while the tail of the last one is still coming out of the speakers.
 */
const NUDGE_MS = 3000;

/**
 * How long after the last sign of a human it keeps carrying on by itself.
 *
 * This used to be a count — three in a row and it stopped. That is wrong for a
 * walkthrough: nobody speaks during a good presentation, so the fourth slide
 * onwards fell back to the agent's own turn timeout and the deck
 * crawled. A presentation is many silent turns in a row; an abandoned kiosk is
 * silent *and* untouched, which is what this actually measures.
 *
 * Long enough to outlast the walkthrough itself: five products and their decks
 * run well past five minutes, and a room that is listening properly touches
 * nothing and says nothing the whole way through. Cutting the nudge off partway
 * would put the deck straight back on the agent's own turn timeout — the
 * crawl this exists to prevent.
 */
const UNATTENDED_MS = 20 * 60 * 1000;

const NUDGE_TEXT =
  '(Nobody replied. Continue with the next step of the walkthrough now — move the screen ' +
  'and keep presenting. Do not ask again whether to continue, do not greet again, and do ' +
  'not mention that no one answered.)';

export default function VoiceGuide() {
  const [asking, setAsking] = useState(false);
  // Held across the await: beforeStart returns this promise, the dialog settles it.
  const answer = useRef<((ok: boolean) => void) | null>(null);

  const settle = useCallback((ok: boolean) => {
    setAsking(false);
    const resolve = answer.current;
    answer.current = null;
    resolve?.(ok);
  }, []);

  useEffect(() => {
    // ?code=… unlocks a kiosk that boots into a URL; ?lock forgets it again.
    consumeUrlParams();
    const agentId = resolveAgentId();

    /* ---- carry on when the room says nothing ---- */
    const nudgeOff = /(^|[?&])nudge=off(&|$)/.test(location.search);
    let nudgeTimer: ReturnType<typeof setTimeout> | null = null;
    let lastHumanAt = performance.now();
    const cancelNudge = () => { if (nudgeTimer) { clearTimeout(nudgeTimer); nudgeTimer = null; } };
    const armNudge = () => {
      cancelNudge();
      if (nudgeOff || performance.now() - lastHumanAt > UNATTENDED_MS) return;
      nudgeTimer = setTimeout(() => {
        nudgeTimer = null;
        window.IopexVoice?.nudge(NUDGE_TEXT);
      }, NUDGE_MS);
    };
    // Anything that means a person is present, not only speech: a presenter
    // driving by hand or gesture is a room worth presenting to.
    const sawHuman = () => { lastHumanAt = performance.now(); };
    const humanEvents: (keyof WindowEventMap)[] = ['pointerdown', 'keydown', 'touchstart'];
    humanEvents.forEach((e) => window.addEventListener(e, sawHuman, { passive: true }));
    const agent = createVoiceAgent({
      agentId,
      tools: kioskTools,
      // Brand orange throughout — the guide reads as part of the iOPEX mark,
      // brightening (not changing hue) while it speaks.
      palette: { amber: '#FF8A1F', cyan: '#FF8A1F', orange: '#FF7A14', ink: '#FFB26B', muted: '#FF8A1F' },
      name: 'iOPEX Guide',
      beforeStart: () => {
        if (isUnlocked()) return true;
        setAsking(true);
        return new Promise<boolean>((resolve) => { answer.current = resolve; });
      },
      dynamicVariables: { deck: 'kiosk', entry_section: openProductKey() || 'home' },
      onState: (voiceState) => {
        // The deck gets one move per spoken turn, and this is where a turn is
        // declared over — once the last of its audio has actually played out.
        noteVoiceState(voiceState);
        // Only while it is genuinely waiting on the room: not mid-sentence, not
        // thinking, not held, not idle.
        if (voiceState === 'listening') armNudge(); else cancelNudge();
      },
      onMessage: ({ message, source }) => {
        if (source === 'ai' && message) followNarration(message);
        // Someone is in the room after all — and let go of any tool still
        // waiting on an animation: they are talking.
        if (source === 'user' && message) { sawHuman(); cancelNudge(); abortSettles(); }
        // "Hold on" / "carry on" are handled here rather than waiting for the
        // agent to call a tool — while it is holding, it is deliberately not
        // taking turns, so the tool would never fire.
        if (source === 'user' && message) followSpokenCommand(message);
      },
    });
    window.IopexVoice = agent;
    window.IopexAccess = { lock, isUnlocked };
    const unregister = controller.registerVoice({
      start: () => agent.start(),
      pause: () => agent.pause(),
      hold: () => agent.hold(),
      resume: () => agent.resume(),
      isPaused: () => agent.isPaused(),
      setMicMuted: (m) => agent.setMicMuted(m),
      say: (m) => agent.say(m),
      nudge: (m) => agent.nudge(m),
      state: () => agent.state(),
      setRevealed: (on) => agent.setRevealed(on),
      isRevealed: () => agent.isRevealed(),
      hide: () => agent.hide(),
      show: () => agent.show(),
      isHidden: () => agent.isHidden(),
    });

    /* Turning the guide off. Three ways, because "how do I switch this off"
       should never have one obscure answer: the × on the panel, `?voice=off`
       for a run where it should never appear, and Escape while it is live. */
    if (/(^|[?&])voice=off(&|$)/.test(location.search)) agent.hide();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && agent.state() !== 'idle') { e.preventDefault(); void agent.stop(); }
    };
    window.addEventListener('keydown', onKey);
    if (!requiredCode()) {
      console.warn('[voice] No access code configured (VITE_ACCESS_CODE / window.IOPEX_ACCESS_CODE) — the guide starts without asking.');
    }
    if (!agentId) {
      console.warn('[voice] No ElevenLabs agent id. Set VITE_ELEVENLABS_AGENT_ID in .env or append ?agent=agent_xxx to the URL.');
    }
    return () => {
      window.removeEventListener('keydown', onKey);
      unregister();
      if (window.IopexVoice === agent) delete window.IopexVoice;
      delete window.IopexAccess;
      cancelNudge();
      humanEvents.forEach((e) => window.removeEventListener(e, sawHuman));
      // A pending prompt must not leave start() awaiting a promise nobody owns.
      answer.current?.(false);
      agent.destroy();
    };
  }, []);

  return asking ? <AccessGate onDone={settle} /> : null;
}
