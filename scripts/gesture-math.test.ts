/**
 * Unit tests for the pure gesture maths. Runs on plain Node (type stripping):
 *     npm run test:gesture
 */
import assert from 'node:assert/strict';
import {
  HoldTracker, TapDetector, classify, detectSwipe, geometricPose, type LM, type Pose, type Pt, type Sample,
} from '../src/gesture/gestureMath.ts';

/* ---------------------------------------------------------- hand factory -- */

type Finger = 'curl' | 'ext';
interface HandSpec { thumb: 'in' | 'out' | 'up'; index: Finger; middle: Finger; ring: Finger; pinky: Finger }

/** Synthetic 21-landmark hand in normalised image space, wrist at the bottom. */
function hand(spec: HandSpec): LM {
  const wrist: Pt = { x: 0.5, y: 0.8 };
  const scale = 0.12; // wrist → middle MCP
  const lm: Pt[] = new Array(21).fill(null).map(() => ({ x: 0, y: 0 }));
  lm[0] = wrist;
  const fingers: Array<[number, number, Finger, number]> = [
    // [mcp index, x offset (in hand widths), state, base x]
    [5, -0.06, spec.index, 0], [9, -0.02, spec.middle, 0], [13, 0.02, spec.ring, 0], [17, 0.06, spec.pinky, 0],
  ];
  for (const [mcp, dx, state] of fingers) {
    const bx = wrist.x + dx, by = wrist.y - scale;
    lm[mcp] = { x: bx, y: by };
    if (state === 'ext') {
      lm[mcp + 1] = { x: bx, y: by - scale * 0.5 };
      lm[mcp + 2] = { x: bx, y: by - scale * 0.85 };
      lm[mcp + 3] = { x: bx, y: by - scale * 1.15 };
    } else {
      // curled: tip folds back toward the palm, closer to the wrist than the PIP
      lm[mcp + 1] = { x: bx, y: by - scale * 0.35 };
      lm[mcp + 2] = { x: bx, y: by - scale * 0.15 };
      lm[mcp + 3] = { x: bx, y: by + scale * 0.05 };
    }
  }
  // thumb: CMC(1), MCP(2), IP(3), TIP(4) — off to the index side (negative x)
  const tx = wrist.x - 0.09;
  lm[1] = { x: wrist.x - 0.04, y: wrist.y - scale * 0.3 };
  lm[2] = { x: tx + 0.02, y: wrist.y - scale * 0.6 };
  if (spec.thumb === 'in') {
    lm[3] = { x: tx + 0.03, y: wrist.y - scale * 0.75 };
    lm[4] = { x: tx + 0.05, y: wrist.y - scale * 0.85 }; // tucked toward the palm
  } else if (spec.thumb === 'out') {
    lm[3] = { x: tx - 0.02, y: wrist.y - scale * 0.7 };
    lm[4] = { x: tx - 0.06, y: wrist.y - scale * 0.8 };
  } else {
    // up: pointing straight up, well above the knuckles
    lm[3] = { x: tx, y: wrist.y - scale * 1.2 };
    lm[4] = { x: tx, y: wrist.y - scale * 1.7 };
  }
  return lm;
}

const FIST = hand({ thumb: 'in', index: 'curl', middle: 'curl', ring: 'curl', pinky: 'curl' });
const OPEN = hand({ thumb: 'out', index: 'ext', middle: 'ext', ring: 'ext', pinky: 'ext' });
const ONE = hand({ thumb: 'in', index: 'ext', middle: 'curl', ring: 'curl', pinky: 'curl' });
const TWO = hand({ thumb: 'in', index: 'ext', middle: 'ext', ring: 'curl', pinky: 'curl' });
const THUMBS = hand({ thumb: 'up', index: 'curl', middle: 'curl', ring: 'curl', pinky: 'curl' });
const THREE = hand({ thumb: 'in', index: 'ext', middle: 'ext', ring: 'ext', pinky: 'curl' });

/* --------------------------------------------------------------- poses ---- */

assert.equal(geometricPose(FIST), 'fist', 'fist');
assert.equal(geometricPose(OPEN), 'open', 'open palm');
assert.equal(geometricPose(ONE), 'one', 'one finger');
assert.equal(geometricPose(TWO), 'two', 'two fingers');
assert.equal(geometricPose(THUMBS), 'thumbsUp', 'thumbs up');
assert.equal(geometricPose(THREE), null, 'three fingers is deliberately no pose');

// classifier agreement / disagreement rules
assert.equal(classify(FIST, 'Closed_Fist', 0.9, 0.55), 'fist');
assert.equal(classify(FIST, 'None', 0.9, 0.55), 'fist', 'None falls back to geometry');
assert.equal(classify(FIST, 'Open_Palm', 0.3, 0.55), 'fist', 'low-confidence classifier is ignored');
assert.equal(classify(FIST, 'Open_Palm', 0.9, 0.55), null, 'confident disagreement fires nothing');
assert.equal(classify(THUMBS, 'Thumb_Up', 0.9, 0.55), 'thumbsUp');
assert.equal(classify(FIST, 'Thumb_Up', 0.9, 0.55), 'thumbsUp', 'classifier wins on thumbs up');
assert.equal(classify(TWO, 'Pointing_Up', 0.9, 0.55), 'two', 'geometry wins on finger count');
assert.equal(classify(THREE, 'Victory', 0.9, 0.55), 'two', 'geometry undecided → classifier');

/* --------------------------------------------------------------- swipe ---- */

const SW = { windowMs: 380, dist: 0.16, openRatio: 0.5, wobble: 0.03, mirror: true };
function sweep(from: Pt, to: Pt, ms: number, pose: Pose | null = 'open', n = 10): Sample[] {
  const out: Sample[] = [];
  for (let i = 0; i <= n; i++) {
    out.push({ x: from.x + (to.x - from.x) * (i / n), y: from.y + (to.y - from.y) * (i / n), t: (i / n) * ms, pose });
  }
  return out;
}
function oscillation(cycles: number, amp: number, ms: number): Sample[] {
  const out: Sample[] = [];
  const n = 20;
  for (let i = 0; i <= n; i++) out.push({ x: 0.5 + Math.sin((i / n) * Math.PI * 2 * cycles) * amp, y: 0.5, t: (i / n) * ms, pose: 'open' });
  return out;
}
const P = (x: number, y: number): Pt => ({ x, y });
// In the mirrored camera image, the hand moving to image-left (dx<0) is the presenter moving to THEIR right.
assert.equal(detectSwipe(sweep(P(0.7, 0.5), P(0.3, 0.5), 300), 300, SW), 'right', 'image-left sweep → presenter right');
assert.equal(detectSwipe(sweep(P(0.3, 0.5), P(0.7, 0.5), 300), 300, SW), 'left', 'image-right sweep → presenter left');
assert.equal(detectSwipe(sweep(P(0.3, 0.5), P(0.7, 0.5), 300), 300, { ...SW, mirror: false }), 'right', 'unmirrored');
assert.equal(detectSwipe(sweep(P(0.5, 0.7), P(0.5, 0.3), 300), 300, SW), 'up', 'hand rising → up');
assert.equal(detectSwipe(sweep(P(0.5, 0.3), P(0.5, 0.7), 300), 300, SW), 'down', 'hand dropping → down');
assert.equal(detectSwipe(sweep(P(0.3, 0.3), P(0.7, 0.7), 300), 300, SW), null, 'a diagonal is ambiguous — nothing fires');
assert.equal(detectSwipe(sweep(P(0.45, 0.5), P(0.55, 0.5), 300), 300, SW), null, 'too short');
assert.equal(detectSwipe(sweep(P(0.3, 0.5), P(0.7, 0.5), 300, 'fist'), 300, SW), null, 'closed hand does not swipe');
assert.equal(detectSwipe(sweep(P(0.3, 0.5), P(0.7, 0.5), 300, 'one'), 300, SW), null, 'a pointing hand does not swipe');
assert.equal(detectSwipe(sweep(P(0.3, 0.5), P(0.7, 0.5), 1500), 1500, SW), null, 'too slow — only the tail is inside the window');
assert.equal(detectSwipe(oscillation(1, 0.2, 300), 300, SW), null, 'a back-and-forth is not a swipe');
// Motion blur: the classifier drops to null mid-sweep, geometry-less frames are neutral
const blurred = sweep(P(0.3, 0.5), P(0.7, 0.5), 300).map((s, i) => (i % 2 ? { ...s, pose: null } : s));
assert.equal(detectSwipe(blurred, 300, SW), 'left', 'half the frames unclassified still swipes');
const mostlyBlurred = sweep(P(0.3, 0.5), P(0.7, 0.5), 300).map((s, i) => (i % 4 ? { ...s, pose: null } : s));
assert.equal(detectSwipe(mostlyBlurred, 300, SW), null, 'but not when almost nothing reads as an open hand');

/* ---------------------------------------------------------------- taps ---- */

const taps = new TapDetector({ bent: 0.98, straight: 1.07, tapMs: 420, doubleMs: 750 });
/** Index finger with a given tip/PIP ratio (others curled). */
function pointing(ratio: number): LM {
  const lm = hand({ thumb: 'in', index: 'ext', middle: 'curl', ring: 'curl', pinky: 'curl' });
  const wrist = lm[0], pip = lm[6];
  const dPip = Math.hypot(pip.x - wrist.x, pip.y - wrist.y);
  lm[8] = { x: pip.x, y: wrist.y - dPip * ratio }; // tip straight above the wrist at the wanted ratio
  return lm;
}
const STRAIGHT = pointing(1.3), BENT = pointing(0.85);
const tapSeq = (seq: Array<[LM, number]>) => seq.map(([lm, t]) => taps.update(lm, t)).filter(Boolean);
assert.deepEqual(tapSeq([[STRAIGHT, 0], [STRAIGHT, 50], [BENT, 100], [BENT, 150], [STRAIGHT, 250]]), ['tap'], 'one press+release is a tap');
assert.deepEqual(tapSeq([[STRAIGHT, 300], [BENT, 400], [STRAIGHT, 500]]), ['double'], 'a second tap within 750ms is a double');
assert.deepEqual(tapSeq([[STRAIGHT, 600], [BENT, 700], [STRAIGHT, 800]]), ['tap'], 'the pair is consumed — the next is a fresh single');
taps.reset();
assert.deepEqual(tapSeq([[STRAIGHT, 0], [BENT, 100], [BENT, 400], [BENT, 600], [STRAIGHT, 700]]), [], 'a slow curl is not a click');
taps.reset();
assert.deepEqual(tapSeq([[STRAIGHT, 0], [BENT, 100], [STRAIGHT, 200], [STRAIGHT, 1200], [BENT, 1300], [STRAIGHT, 1400]]), ['tap', 'tap'], 'two taps too far apart stay singles');
taps.reset();
const OPENHAND = hand({ thumb: 'out', index: 'ext', middle: 'ext', ring: 'ext', pinky: 'ext' });
assert.deepEqual(tapSeq([[OPENHAND, 0], [BENT, 100], [STRAIGHT, 200]]), [], 'a press must start from a pointing finger, not an open hand');

/* ---------------------------------------------------------------- hold ---- */

type P = 'fist' | 'open' | 'one';
type G = 'home' | 'pause';
const tracker = new HoldTracker<P, G>({ fist: 'home', open: null, one: 'pause' }, {
  hold: { home: 1000, pause: 500 }, gapMs: 160, refireGapMs: 500,
});
let fired: G[] = [];
const feed = (seq: Array<[P | null, number]>) => { for (const [p, t] of seq) { const r = tracker.update(p, t); if (r.fired) fired.push(r.fired); } };

feed([['fist', 0], ['fist', 300], ['fist', 600], ['fist', 900]]);
assert.deepEqual(fired, [], 'not yet held long enough');
const mid = tracker.update('fist', 950);
assert.equal(mid.holding, 'home'); assert.ok(mid.progress > 0.9 && mid.progress < 1, 'progress reported mid-hold');
feed([['fist', 1000]]);
assert.deepEqual(fired, ['home'], 'fires once the hold completes');
feed([['fist', 1200], ['fist', 3000]]);
assert.deepEqual(fired, ['home'], 'keeps NOT re-firing while the fist stays closed');
feed([[null, 3100], [null, 3700], ['fist', 3800], ['fist', 4900]]);
assert.deepEqual(fired, ['home', 'home'], 're-fires only after a release and a fresh hold');

fired = [];
feed([['one', 5000], [null, 5100], ['one', 5200], ['one', 5500]]);
assert.deepEqual(fired, ['pause'], 'a short flicker (<160ms) does not break the hold');
fired = [];
feed([['one', 5600], [null, 5700], [null, 5900], ['one', 6000], ['one', 6400]]);
assert.deepEqual(fired, [], 'the pose that just fired must be released ≥500ms before it can re-arm');
feed([[null, 6500], [null, 7100], ['one', 7200], [null, 7300], [null, 7500], ['one', 7600], ['one', 8000]]);
assert.deepEqual(fired, [], 'a long gap (>160ms) restarts the hold');
feed([['one', 8100]]);
assert.deepEqual(fired, ['pause'], 'fresh hold after release completes');
fired = [];
feed([['open', 8000], ['open', 9000], ['open', 12000]]);
assert.deepEqual(fired, [], 'an open palm never holds');

console.log('gesture-math: all assertions passed');
