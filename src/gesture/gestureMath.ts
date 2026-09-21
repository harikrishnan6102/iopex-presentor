/**
 * Pure gesture maths — no DOM, no MediaPipe runtime, so it can be unit-tested
 * with plain Node (`npm run test:gesture`). The engine feeds it landmarks and
 * motion samples and acts on what comes back.
 */

export interface Pt { x: number; y: number; z?: number }
export type LM = Pt[];

export type Pose = 'fist' | 'open' | 'one' | 'two' | 'thumbsUp';
export type SwipeDir = 'left' | 'right' | 'up' | 'down';

/* MediaPipe hand landmark indices */
export const WRIST = 0;
export const THUMB_IP = 3;
export const THUMB_TIP = 4;
export const INDEX_MCP = 5;
export const INDEX_PIP = 6;
export const INDEX_TIP = 8;
export const MIDDLE_MCP = 9;
export const MIDDLE_PIP = 10;
export const MIDDLE_TIP = 12;
export const RING_MCP = 13;
export const RING_PIP = 14;
export const RING_TIP = 16;
export const PINKY_MCP = 17;
export const PINKY_PIP = 18;
export const PINKY_TIP = 20;

export const dist = (a: Pt, b: Pt): number => Math.hypot(a.x - b.x, a.y - b.y);
export const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/** Wrist → middle knuckle. Every distance is divided by this, so thresholds
 *  hold whether the presenter is a metre from the laptop or across the room. */
export const handScale = (lm: LM): number => Math.max(1e-6, dist(lm[WRIST], lm[MIDDLE_MCP]));

/** Tip-to-wrist over PIP-to-wrist: >1 the finger is straight, <1 it is bent. */
export const fingerRatio = (lm: LM, tip: number, pip: number): number =>
  dist(lm[WRIST], lm[tip]) / Math.max(1e-6, dist(lm[WRIST], lm[pip]));

/** A finger is extended when its tip sits further from the wrist than its PIP. */
export const extended = (lm: LM, tip: number, pip: number): boolean => fingerRatio(lm, tip, pip) > 1.08;

/** Thumb extended: tip further from the pinky knuckle than the IP joint is. */
export const thumbOut = (lm: LM): boolean =>
  dist(lm[THUMB_TIP], lm[PINKY_MCP]) > dist(lm[THUMB_IP], lm[PINKY_MCP]) * 1.12;

/** Palm centre — steadier than the wrist for motion tracking. */
export function palmCenter(lm: LM): Pt {
  const ids = [WRIST, INDEX_MCP, MIDDLE_MCP, RING_MCP, PINKY_MCP];
  let x = 0, y = 0;
  for (const i of ids) { x += lm[i].x; y += lm[i].y; }
  return { x: x / ids.length, y: y / ids.length };
}

/** Thumb/index midpoint — where a person feels their pinch to be. */
export const pinchAnchor = (lm: LM): Pt => ({
  x: (lm[THUMB_TIP].x + lm[INDEX_TIP].x) / 2,
  y: (lm[THUMB_TIP].y + lm[INDEX_TIP].y) / 2,
});

/** Thumb-to-index gap as a fraction of hand scale. */
export const grip = (lm: LM): number => dist(lm[THUMB_TIP], lm[INDEX_TIP]) / handScale(lm);

/** Pose from finger geometry alone. */
export function geometricPose(lm: LM): Pose | null {
  const index = extended(lm, INDEX_TIP, INDEX_PIP);
  const middle = extended(lm, MIDDLE_TIP, MIDDLE_PIP);
  const ring = extended(lm, RING_TIP, RING_PIP);
  const pinky = extended(lm, PINKY_TIP, PINKY_PIP);
  const thumb = thumbOut(lm);
  const count = Number(index) + Number(middle) + Number(ring) + Number(pinky);
  if (count === 0) {
    // Thumb clearly above the knuckles with a closed fist → thumbs up
    if (thumb && lm[THUMB_TIP].y < lm[INDEX_MCP].y - handScale(lm) * 0.35) return 'thumbsUp';
    return thumb ? null : 'fist';
  }
  if (count >= 4 || (count === 3 && thumb)) return 'open';
  if (index && !middle && !ring && !pinky) return 'one';
  if (index && middle && !ring && !pinky) return 'two';
  return null; // in between: deliberately no pose rather than a wrong one
}

/** MediaPipe canned gesture labels → our poses. */
export const CANNED: Record<string, Pose> = {
  Closed_Fist: 'fist',
  Open_Palm: 'open',
  Pointing_Up: 'one',
  Victory: 'two',
  Thumb_Up: 'thumbsUp',
};

/**
 * Classifier first, geometry as tie-breaker / fallback. The classifier is
 * better at thumbs-up; geometry is better at counting fingers.
 */
export function classify(lm: LM, cannedName: string | undefined, cannedScore: number, minScore: number): Pose | null {
  const geo = geometricPose(lm);
  const canned = cannedName && cannedScore >= minScore ? CANNED[cannedName] ?? null : null;
  if (canned && geo) {
    if (canned === geo) return canned;
    if (canned === 'thumbsUp') return 'thumbsUp';
    if (geo === 'thumbsUp') return null;
    if ((canned === 'one' || canned === 'two') && (geo === 'one' || geo === 'two')) return geo;
    return null;
  }
  return canned ?? geo;
}

/* ----------------------------------------------------------- motion ------ */

export interface Sample { x: number; y: number; t: number; pose: Pose | null }

export interface SwipeOpts {
  /** How far back to look, ms. */
  windowMs: number;
  /** Minimum travel along the dominant axis, in normalised image units (x is aspect-corrected by the caller). */
  dist: number;
  /** Share of samples that must read as an open palm. Blurred frames read as null and are tolerated. */
  openRatio: number;
  /** Any sample with one of these definite poses vetoes the swipe. */
  wobble: number;
  mirror: boolean;
}

/**
 * A swipe is one open-hand sweep along one axis: enough travel inside the
 * window, nearly monotonic (a reversal means a fidget, not a swipe), and the
 * cross-axis travel clearly smaller. Returns the direction as the PRESENTER
 * experiences it: with a mirrored camera, the hand going to image-left is the
 * presenter moving toward their right.
 */
export function detectSwipe(samples: Sample[], now: number, o: SwipeOpts): SwipeDir | null {
  const recent = samples.filter((s) => now - s.t <= o.windowMs);
  if (recent.length < 3) return null;
  // Closed or counting hands never swipe; unclassified (blurred) frames are neutral.
  if (recent.some((s) => s.pose && s.pose !== 'open')) return null;
  const openFrames = recent.filter((s) => s.pose === 'open').length;
  if (openFrames < Math.max(2, recent.length * o.openRatio)) return null;

  const first = recent[0], last = recent[recent.length - 1];
  const dx = last.x - first.x, dy = last.y - first.y;
  const horizontal = Math.abs(dx) >= Math.abs(dy);
  const main = horizontal ? dx : dy;
  const cross = horizontal ? dy : dx;
  if (Math.abs(main) < o.dist) return null;
  if (Math.abs(cross) > Math.abs(main) * 0.6) return null; // diagonal: ambiguous, wait

  // Monotonic along the main axis, within a wobble
  const axis = horizontal ? (s: Sample) => s.x : (s: Sample) => s.y;
  const lo = Math.min(axis(first), axis(last)) - o.wobble, hi = Math.max(axis(first), axis(last)) + o.wobble;
  if (!recent.every((s) => axis(s) >= lo && axis(s) <= hi)) return null;

  if (horizontal) {
    const towardRight = o.mirror ? dx < 0 : dx > 0;
    return towardRight ? 'right' : 'left';
  }
  return dy < 0 ? 'up' : 'down'; // image y grows downward
}

/* ------------------------------------------------------- hold tracker ---- */

export interface HoldOpts<G extends string> { hold: Record<G, number>; gapMs: number; refireGapMs: number }

/**
 * Turns a per-frame pose stream into "held for N ms" events with release
 * gating. Fingers pass through "fist" on the way to almost any pose, so
 * nothing fires without a hold, and a pose that fired must be let go before
 * it can fire again — one physical gesture, one event.
 */
export class HoldTracker<P extends string, G extends string> {
  private held: P | null = null;
  private heldSince = 0;
  private heldLastSeen = 0;
  private fired: P | null = null;
  private firedReleasedAt = 0;
  private readonly map: Record<P, G | null>;
  private readonly o: HoldOpts<G>;

  constructor(map: Record<P, G | null>, o: HoldOpts<G>) {
    this.map = map;
    this.o = o;
  }

  reset(): void { this.held = this.fired = null; }

  /** Abandon the current hold (the pose is doing something else, e.g. tapping). */
  cancel(): void { this.held = null; }

  /** @returns the gesture that just completed (once), plus what is being held and its 0–1 progress. */
  update(seen: P | null, now: number): { fired: G | null; holding: G | null; progress: number } {
    if (this.fired) {
      if (seen === this.fired) this.firedReleasedAt = 0;
      else if (!this.firedReleasedAt) this.firedReleasedAt = now;
      else if (now - this.firedReleasedAt > this.o.refireGapMs) this.fired = null;
    }
    const g = seen ? this.map[seen] : null;
    if (seen && g && seen !== this.fired) {
      if (this.held !== seen) { this.held = seen; this.heldSince = now; }
      this.heldLastSeen = now;
    } else if (this.held && now - this.heldLastSeen > this.o.gapMs) {
      this.held = null;
    }
    if (!this.held) return { fired: null, holding: null, progress: 0 };
    const hg = this.map[this.held] as G;
    const progress = clamp((now - this.heldSince) / this.o.hold[hg], 0, 1);
    if (progress >= 1) {
      this.fired = this.held;
      this.firedReleasedAt = 0;
      this.held = null;
      return { fired: hg, holding: null, progress: 0 };
    }
    return { fired: null, holding: hg, progress };
  }
}

/* -------------------------------------------------------- tap detector ---- */

export interface TapOpts {
  /** Index ratio below which the finger counts as bent (a "press"). */
  bent: number;
  /** Ratio above which it counts as straight again (release). Hysteresis. */
  straight: number;
  /** A press + release must complete within this long to be a tap. */
  tapMs: number;
  /** Two taps closer than this are a double tap. */
  doubleMs: number;
}

/**
 * Air "click" with the index finger: pointing (only the index up), then the
 * fingertip dips and comes back. Two of those in quick succession is a
 * double tap — the kiosk's "select". Measured on the finger's own extension
 * ratio, not the classifier, because a bending finger is exactly the frame the
 * classifier is least sure about.
 */
export class TapDetector {
  private pressedAt = 0;
  private lastTapAt = 0;
  /** Ratio on the previous pointing frame; 0 = "not pointing", so a press can
   *  only begin after a genuinely straight index has been seen. */
  private lastRatio = 0;
  private readonly o: TapOpts;

  constructor(o: TapOpts) { this.o = o; }

  reset(): void { this.pressedAt = 0; this.lastTapAt = 0; this.lastRatio = 0; }

  /** True while a press is in progress — the hold tracker should stand down. */
  get pressing(): boolean { return this.pressedAt > 0; }

  /**
   * @param lm     landmarks of the primary hand
   * @param now    timestamp, ms
   * @returns 'tap' on a completed single tap, 'double' when it is the second of a pair
   */
  update(lm: LM, now: number): 'tap' | 'double' | null {
    // Only the index may be out; an open hand bending fingers is not a click.
    const others = extended(lm, MIDDLE_TIP, MIDDLE_PIP) || extended(lm, RING_TIP, RING_PIP) || extended(lm, PINKY_TIP, PINKY_PIP);
    if (others) { this.pressedAt = 0; this.lastRatio = 0; return null; }

    const r = fingerRatio(lm, INDEX_TIP, INDEX_PIP);
    let out: 'tap' | 'double' | null = null;
    if (!this.pressedAt) {
      // straight → bent begins a press, but only from a genuinely pointing finger
      if (this.lastRatio > this.o.straight && r < this.o.bent) this.pressedAt = now;
    } else if (r > this.o.straight) {
      // bent → straight completes the press
      const held = now - this.pressedAt;
      this.pressedAt = 0;
      if (held <= this.o.tapMs) {
        out = this.lastTapAt && now - this.lastTapAt <= this.o.doubleMs ? 'double' : 'tap';
        this.lastTapAt = out === 'double' ? 0 : now;
      }
    } else if (now - this.pressedAt > this.o.tapMs) {
      this.pressedAt = 0; // too slow: that was a curl, not a click
    }
    this.lastRatio = r;
    return out;
  }
}
