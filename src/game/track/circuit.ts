// Procedural race circuit: a smooth closed loop sampled from control points via a
// Catmull-Rom spline. Exposes the centerline, road width, ordered checkpoints,
// start/finish, grid spawn slots, and an off-track distance test. Pure math (no
// Phaser dependency) so the same geometry is trivially shared/testable.

export const WORLD_WIDTH = 2400;
export const WORLD_HEIGHT = 1500;
export const ROAD_WIDTH = 190;
export const ROAD_HALF_WIDTH = ROAD_WIDTH / 2;
export const CHECKPOINT_RADIUS = 150;

export interface Vec {
  x: number;
  y: number;
}

// Control points shaping the track (closed loop). Tuned to fit the world with a
// mix of straights and sweeping curves.
const CONTROL: Vec[] = [
  { x: 520, y: 380 },
  { x: 1250, y: 300 },
  { x: 1980, y: 460 },
  { x: 2060, y: 900 },
  { x: 1620, y: 1160 },
  { x: 1080, y: 980 },
  { x: 760, y: 1180 },
  { x: 360, y: 820 },
];

function catmullRom(p0: Vec, p1: Vec, p2: Vec, p3: Vec, t: number): Vec {
  const t2 = t * t;
  const t3 = t2 * t;
  return {
    x:
      0.5 *
      (2 * p1.x +
        (-p0.x + p2.x) * t +
        (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 +
        (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
    y:
      0.5 *
      (2 * p1.y +
        (-p0.y + p2.y) * t +
        (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 +
        (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
  };
}

function buildCenterline(samplesPerSeg = 16): Vec[] {
  const n = CONTROL.length;
  const pts: Vec[] = [];
  for (let i = 0; i < n; i++) {
    const p0 = CONTROL[(i - 1 + n) % n];
    const p1 = CONTROL[i];
    const p2 = CONTROL[(i + 1) % n];
    const p3 = CONTROL[(i + 2) % n];
    for (let s = 0; s < samplesPerSeg; s++) {
      pts.push(catmullRom(p0, p1, p2, p3, s / samplesPerSeg));
    }
  }
  return pts;
}

export const CENTERLINE: Vec[] = buildCenterline();

/** Number of ordered checkpoints (index 0 == start/finish line). */
export const CHECKPOINT_COUNT = 12;

export const CHECKPOINTS: Vec[] = Array.from(
  { length: CHECKPOINT_COUNT },
  (_, i) => {
    const idx =
      Math.round((i / CHECKPOINT_COUNT) * CENTERLINE.length) %
      CENTERLINE.length;
    return CENTERLINE[idx];
  },
);

/** Heading (radians) of the track at a given centerline index. */
function headingAt(index: number): number {
  const a = CENTERLINE[index % CENTERLINE.length];
  const b = CENTERLINE[(index + 1) % CENTERLINE.length];
  return Math.atan2(b.y - a.y, b.x - a.x);
}

export const START: Vec = CENTERLINE[0];
export const START_ANGLE = headingAt(0);

/** Squared distance from a point to segment ab. */
function distSqToSegment(px: number, py: number, a: Vec, b: Vec): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy || 1;
  let t = ((px - a.x) * dx + (py - a.y) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const cx = a.x + t * dx;
  const cy = a.y + t * dy;
  return (px - cx) ** 2 + (py - cy) ** 2;
}

/** Distance from a point to the track centerline (min over all segments). */
export function distanceToTrack(x: number, y: number): number {
  let best = Infinity;
  for (let i = 0; i < CENTERLINE.length; i++) {
    const a = CENTERLINE[i];
    const b = CENTERLINE[(i + 1) % CENTERLINE.length];
    const d = distSqToSegment(x, y, a, b);
    if (d < best) best = d;
  }
  return Math.sqrt(best);
}

export function isOnTrack(x: number, y: number): boolean {
  return distanceToTrack(x, y) <= ROAD_HALF_WIDTH;
}

/** Starting grid slot for the i-th car: staggered behind the start/finish line. */
export function gridSlot(i: number): { x: number; y: number; angle: number } {
  const perp = START_ANGLE + Math.PI / 2;
  const back = START_ANGLE + Math.PI; // point backwards along the track
  const row = Math.floor(i / 2);
  const col = i % 2;
  const lateral = (col === 0 ? -1 : 1) * (ROAD_HALF_WIDTH * 0.45);
  const behind = 70 + row * 90;
  return {
    x: START.x + Math.cos(perp) * lateral + Math.cos(back) * behind,
    y: START.y + Math.sin(perp) * lateral + Math.sin(back) * behind,
    angle: START_ANGLE,
  };
}
