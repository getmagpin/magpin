/**
 * Geometry of the nest scene: a woven bowl of twigs floating on the page.
 * Drawn like the logo, as a woodcut: a solid black bowl that fills up from
 * the bottom, covered in the same twig the magpie carries, each with a thin
 * white outline, so the weave reads as white lines on black. Generated from
 * a fixed seed, so the nest is the same every time and only its growth
 * follows the progress.
 */
import { seededRandom } from '@magpin/core';

export const SCENE = { w: 320, h: 150 };
/** The bowl: rim ellipse at rimY, bottom `depth` px lower. */
export const NEST = { x: 160, rimY: 101, rx: 53, ry: 10, depth: 31 };
/** The page the magpie hops on: level with the bottom of the nest. */
export const GROUND_Y = 139;
/** Where the magpie waits, left and right of the nest. */
export const PERCH_X = { left: 62, right: 258 } as const;

/**
 * A twig of the nest: the very twig the magpie carries in its beak (same
 * shape, same size), laid somewhere on the bowl.
 */
export interface NestTwig {
  /** Centre of the twig, in scene px. */
  x: number;
  y: number;
  /** Direction from the cut end to the forked end, in degrees (0 = right). */
  angle: number;
  /** Mirrored, so the forks don't all fall on the same side. */
  flip: boolean;
  /** Back twigs sit behind the bird, front ones over it. */
  layer: 'back' | 'front';
  /** How high the nest is once this twig is in (0 = rim, 1 = bottom). */
  depth: number;
}

interface Point {
  x: number;
  y: number;
}

/** A horizontal ring of the bowl at depth t (0 = rim, 1 = bottom). */
function ringAt(t: number) {
  return {
    cx: NEST.x,
    cy: NEST.rimY + NEST.depth * t,
    rx: NEST.rx * (1 - 0.38 * t * t),
    ry: NEST.ry * (1 - 0.5 * t),
  };
}

const ring = ringAt;
const fmt = (p: Point) => `${p.x.toFixed(1)} ${p.y.toFixed(1)}`;
const degrees = (radians: number) => (radians * 180) / Math.PI;

/** A point on the bowl at an angle round it (0..pi in front) and a depth down it. */
function onBowl(angle: number, t: number, spread = 1): Point {
  const r = ring(Math.min(1, Math.max(0, t)));
  return { x: r.cx + r.rx * spread * Math.cos(angle), y: r.cy + r.ry * Math.sin(angle) };
}

/** Direction along the bowl's ring at that angle, pointing right, in degrees. */
function along(angle: number, t: number): number {
  const r = ring(t);
  const dx = -r.rx * Math.sin(angle);
  const dy = r.ry * Math.cos(angle);
  return degrees(dx < 0 ? Math.atan2(-dy, -dx) : Math.atan2(dy, dx));
}

/**
 * All the twigs of the finished nest, in the order the magpie brings them:
 * the bowl from the bottom up, crossed this way and that, then the rim,
 * front and back, then a few twigs sticking out.
 */
export function weaveNest(seed = 5): NestTwig[] {
  const random = seededRandom(seed);
  const twigs: NestTwig[] = [];
  const jitter = (range: number) => (random() - 0.5) * 2 * range;
  const twig = (at: Point, angle: number, layer: NestTwig['layer'], depth: number): NestTwig => ({
    x: Math.round(at.x * 10) / 10,
    y: Math.round(at.y * 10) / 10,
    // Either way round: forks to the left or to the right.
    angle: Math.round(angle + (random() < 0.5 ? 180 : 0)),
    flip: random() < 0.5,
    layer,
    depth,
  });

  // The bowl, bottom up, spread round it (golden-ratio steps), every other
  // twig slanted the other way so they cross.
  const BOWL = 44;
  for (let i = 0; i < BOWL; i++) {
    const level = Math.min(1, Math.max(0.05, 0.95 - (0.86 * i) / (BOWL - 1) + jitter(0.04)));
    const angle = Math.PI * (0.1 + 0.8 * ((i * 0.618 + 0.31) % 1));
    // The first ones lie almost flat, on the page; then they cross.
    const slant = (i % 2 === 0 ? 1 : -1) * (i < 3 ? 4 + random() * 6 : 14 + random() * 24);
    twigs.push(twig(onBowl(angle, level, 0.9), along(angle, level) + slant, 'front', level));
  }

  // The rim: the front lip first (it closes the bowl), then the back edge,
  // behind the bird.
  const RIM = 11;
  for (let i = 0; i < RIM; i++) {
    const front = Math.PI * (0.03 + (0.94 * i) / (RIM - 1)) + jitter(0.04);
    twigs.push(twig(onBowl(front, 0.03, 0.97), along(front, 0.03) + jitter(12), 'front', 0));
  }
  for (let i = 0; i < RIM; i++) {
    const back = Math.PI * (1.06 + (0.88 * i) / (RIM - 1)) + jitter(0.04);
    twigs.push(twig(onBowl(back, 0, 0.94), along(back, 0) + jitter(10), 'back', 0));
  }

  // Twigs sticking out: off the rim at both ends, out of the flanks, under the bowl.
  const { x, rimY, rx, depth } = NEST;
  const strays: [Point, number][] = [
    [{ x: x - rx - 4, y: rimY - 3 }, 205],
    [{ x: x + rx + 4, y: rimY - 2 }, -25],
    [{ x: x - rx + 2, y: rimY + depth * 0.5 }, 160],
    [{ x: x + rx - 4, y: rimY + depth * 0.6 }, 15],
    [{ x: x - 20, y: rimY + depth + 3 }, 165],
    [{ x: x + 24, y: rimY + depth + 2 }, 10],
  ];
  for (const [at, angle] of strays) twigs.push({ x: at.x, y: at.y, angle: Math.round(angle + jitter(8)), flip: random() < 0.5, layer: 'front', depth: 0 });
  return twigs;
}

/**
 * How far the nest gets for a moodboard of `images` images, in twigs: a
 * single twig for a handful of images, a whole nest from 500.
 */
export const NEST_TIERS: readonly (readonly [images: number, twigs: number])[] = [
  [10, 1],
  [25, 3],
  [50, 8],
  [100, 16],
  [200, 30],
  [350, 44],
  [500, 58],
];
export function nestGoal(images: number, total: number): number {
  if (images <= 0) return 0;
  for (const [upTo, twigs] of NEST_TIERS) if (images <= upTo) return Math.min(total, twigs);
  return total;
}
/** From this many twigs the bowl is up to the rim: the bird can sit in it. */
export const NEST_SITTABLE = 44;

/** How high the nest is once `placed` twigs are in: 1 = nothing yet, 0 = up to the rim. */
export function nestDepth(twigs: readonly NestTwig[], placed: number): number {
  let depth = 1;
  for (let i = 0; i < Math.min(placed, twigs.length); i++) depth = Math.min(depth, twigs[i]!.depth);
  return depth;
}

/** Where the bird lands on the nest once `placed` twigs are in. */
export function nestTop(twigs: readonly NestTwig[], placed: number): number {
  return placed <= 0 ? GROUND_Y : ring(nestDepth(twigs, placed)).cy;
}

/**
 * The bowl as a solid shape, from its front edge at depth `top` down to the
 * bottom: black under the twigs as the nest fills up, and, whole, the page
 * colour that hides a bird sitting in the nest below the rim.
 */
export function bowlPath(top = 0, inset = 0.88): string {
  // Never quite up to the rim: the lip twigs make the edge.
  const t0 = Math.min(1, Math.max(0.1, top));
  // Slightly inside the twigs, so their ends make the outline.
  const ring = (t: number) => {
    const r = ringAt(t);
    return { ...r, rx: r.rx * inset };
  };
  const upper = ring(t0);
  const points: Point[] = [];
  for (let i = 0; i <= 12; i++) {
    const angle = Math.PI - (Math.PI * i) / 12;
    points.push({ x: upper.cx + upper.rx * Math.cos(angle), y: upper.cy + upper.ry * Math.sin(angle) });
  }
  for (let i = 1; i <= 6; i++) {
    const r = ring(t0 + ((1 - t0) * i) / 6);
    points.push({ x: r.cx + r.rx, y: r.cy });
  }
  const bottom = ring(1);
  for (let i = 1; i < 12; i++) {
    const angle = (Math.PI * i) / 12;
    points.push({ x: bottom.cx + bottom.rx * Math.cos(angle), y: bottom.cy + bottom.ry * Math.sin(angle) });
  }
  for (let i = 6; i >= 1; i--) {
    const r = ring(t0 + ((1 - t0) * i) / 6);
    points.push({ x: r.cx - r.rx, y: r.cy });
  }
  return `M ${points.map(fmt).join(' L ')} Z`;
}
