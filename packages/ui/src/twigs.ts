/**
 * A little physics for the twigs that fall where you click on the intro
 * screen. Each twig is a stick between two points (Verlet integration): it
 * falls, bounces a little, slides, and comes to rest. Twigs at rest build up
 * the ground (a height per column of pixels), so the next ones pile on top.
 * After a while a twig fades away; what rested on it falls again.
 */

export interface Point {
  x: number;
  y: number;
}

export interface Twig {
  id: number;
  /** Cut end and forked end of the stem. */
  a: Point;
  b: Point;
  /** Positions one step ago (Verlet: velocity = position - previous). */
  pa: Point;
  pb: Point;
  /** Mirrored drawing, so the forks don't all fall on the same side. */
  flip: boolean;
  resting: boolean;
  /** Touched the ground or the pile during the last step. */
  touching: boolean;
  /** Frames spent nearly still, on the ground. */
  still: number;
  /** Age in ms, and the age at which it starts to fade. */
  age: number;
  life: number;
}

export interface TwigWorld {
  width: number;
  height: number;
  twigs: Twig[];
  /** Top of the ground (page bottom or the pile) for each column of pixels. */
  ground: Float32Array;
  nextId: number;
}

export const TWIG = {
  /** Stem length, px. */
  length: 30,
  /** Half the stem's thickness, px: how far it sits above what it rests on. */
  radius: 1.6,
  /** How long a twig stays, ms, before fading out. */
  life: 7000,
  fade: 600,
  /** Most twigs at once: beyond, the oldest go. */
  max: 140,
};

const GRAVITY = 1800; // px/s²
const BOUNCE = 0.28;
const FRICTION = 0.55;
const AIR = 0.995;

export function createWorld(width: number, height: number): TwigWorld {
  const world: TwigWorld = { width, height, twigs: [], ground: new Float32Array(Math.max(1, Math.ceil(width))), nextId: 1 };
  rebuildGround(world);
  return world;
}

export function resizeWorld(world: TwigWorld, width: number, height: number): void {
  world.width = width;
  world.height = height;
  world.ground = new Float32Array(Math.max(1, Math.ceil(width)));
  for (const twig of world.twigs) wake(twig);
  rebuildGround(world);
}

/** A new twig at a point, turned any way, popping up a little. */
export function spawn(world: TwigWorld, at: Point, random: () => number = Math.random): Twig {
  const angle = random() * Math.PI * 2;
  const half = TWIG.length / 2;
  const dx = Math.cos(angle) * half;
  const dy = Math.sin(angle) * half;
  const a = { x: at.x - dx, y: at.y - dy };
  const b = { x: at.x + dx, y: at.y + dy };
  // Initial velocity per step: a small hop up and sideways, and a spin.
  const kick = { x: (random() - 0.5) * 3, y: -1.5 - random() * 2.5 };
  const spin = (random() - 0.5) * 0.12;
  const twig: Twig = {
    id: world.nextId++,
    a,
    b,
    pa: { x: a.x - kick.x - spin * -dy, y: a.y - kick.y - spin * dx },
    pb: { x: b.x - kick.x + spin * -dy, y: b.y - kick.y + spin * dx },
    flip: random() < 0.5,
    resting: false,
    touching: false,
    still: 0,
    age: 0,
    life: TWIG.life,
  };
  world.twigs.push(twig);
  if (world.twigs.length > TWIG.max) remove(world, world.twigs[0]!.id);
  return twig;
}

/** Height of the ground under x. */
export function groundAt(world: TwigWorld, x: number): number {
  const i = Math.min(world.ground.length - 1, Math.max(0, Math.round(x)));
  return world.ground[i]!;
}

/** Advances the world by dt ms (in fixed steps). Returns false once nothing is left. */
export function step(world: TwigWorld, dt: number): boolean {
  const steps = Math.max(1, Math.min(4, Math.round(dt / (1000 / 60))));
  const h = 1 / 60;
  for (let s = 0; s < steps; s++) {
    for (const twig of world.twigs) {
      twig.age += 1000 / 60;
      if (twig.resting) continue;
      // In contact, the rocking dies down quickly; in the air, barely.
      const damping = twig.touching ? 0.8 : AIR;
      for (const [p, prev] of [
        [twig.a, twig.pa],
        [twig.b, twig.pb],
      ] as const) {
        const vx = (p.x - prev.x) * damping;
        const vy = (p.y - prev.y) * damping;
        prev.x = p.x;
        prev.y = p.y;
        p.x += vx;
        p.y += vy + GRAVITY * h * h;
      }
      twig.touching = false;
      for (let k = 0; k < 3; k++) {
        keepLength(twig);
        collide(world, twig);
      }
      settle(world, twig);
    }
    // Twigs past their time go; what they held up wakes.
    const expired = world.twigs.filter((twig) => twig.age > twig.life + TWIG.fade);
    for (const twig of expired) remove(world, twig.id);
  }
  return world.twigs.length > 0;
}

/** 1 while alive, then fading to 0. */
export function opacityOf(twig: Twig): number {
  if (twig.age <= twig.life) return 1;
  return Math.max(0, 1 - (twig.age - twig.life) / TWIG.fade);
}

export function remove(world: TwigWorld, id: number): void {
  const index = world.twigs.findIndex((twig) => twig.id === id);
  if (index < 0) return;
  const [gone] = world.twigs.splice(index, 1);
  // What it held up falls again.
  if (gone?.resting) rebuildGround(world);
}

function wake(twig: Twig): void {
  twig.resting = false;
  twig.touching = false;
  twig.still = 0;
  twig.pa = { ...twig.a };
  twig.pb = { ...twig.b };
}

function keepLength(twig: Twig): void {
  const dx = twig.b.x - twig.a.x;
  const dy = twig.b.y - twig.a.y;
  const distance = Math.hypot(dx, dy) || 1;
  const push = (distance - TWIG.length) / distance / 2;
  twig.a.x += dx * push;
  twig.a.y += dy * push;
  twig.b.x -= dx * push;
  twig.b.y -= dy * push;
}

function collide(world: TwigWorld, twig: Twig): void {
  const r = TWIG.radius;
  for (const [p, prev] of [
    [twig.a, twig.pa],
    [twig.b, twig.pb],
  ] as const) {
    // Side walls.
    if (p.x < r) {
      p.x = r;
      prev.x = p.x + (p.x - prev.x) * BOUNCE;
    } else if (p.x > world.width - r) {
      p.x = world.width - r;
      prev.x = p.x + (p.x - prev.x) * BOUNCE;
    }
    const floor = groundAt(world, p.x) - r;
    if (p.y > floor) {
      twig.touching = true;
      const vy = p.y - prev.y;
      p.y = floor;
      // A real impact bounces a little; a slow contact just rests.
      prev.y = vy > 1.2 ? p.y + vy * BOUNCE : p.y;
      prev.x = p.x - (p.x - prev.x) * FRICTION;
    }
  }
  // The middle of the stem can't go through a bump in the pile either.
  const mid = { x: (twig.a.x + twig.b.x) / 2, y: (twig.a.y + twig.b.y) / 2 };
  const floor = groundAt(world, mid.x) - r;
  if (mid.y > floor) {
    // Held up by its middle: lifted, and its fall stopped there.
    const lift = mid.y - floor;
    twig.touching = true;
    twig.a.y -= lift;
    twig.b.y -= lift;
    twig.pa.y = twig.a.y;
    twig.pb.y = twig.b.y;
  }
}

function settle(world: TwigWorld, twig: Twig): void {
  const speed = Math.hypot(twig.a.x - twig.pa.x, twig.a.y - twig.pa.y) + Math.hypot(twig.b.x - twig.pb.x, twig.b.y - twig.pb.y);
  twig.still = speed < 0.15 && twig.touching ? twig.still + 1 : 0;
  if (twig.still < 12) return;
  twig.resting = true;
  twig.pa = { ...twig.a };
  twig.pb = { ...twig.b };
  addToGround(world, twig);
}

function addToGround(world: TwigWorld, twig: Twig): void {
  const [left, right] = twig.a.x < twig.b.x ? [twig.a, twig.b] : [twig.b, twig.a];
  const from = Math.max(0, Math.floor(left.x - TWIG.radius));
  const to = Math.min(world.ground.length - 1, Math.ceil(right.x + TWIG.radius));
  for (let x = from; x <= to; x++) {
    const t = right.x === left.x ? 0.5 : Math.min(1, Math.max(0, (x - left.x) / (right.x - left.x)));
    const top = left.y + (right.y - left.y) * t - TWIG.radius * 2;
    if (top < world.ground[x]!) world.ground[x] = top;
  }
}

/**
 * The ground again from the twigs at rest, bottom up: each one must still
 * lie on the page or on a twig under it, or it wakes up and falls.
 */
function rebuildGround(world: TwigWorld): void {
  world.ground.fill(world.height);
  const resting = world.twigs.filter((twig) => twig.resting).sort((p, q) => Math.max(q.a.y, q.b.y) - Math.max(p.a.y, p.b.y));
  for (const twig of resting) {
    const mid = { x: (twig.a.x + twig.b.x) / 2, y: (twig.a.y + twig.b.y) / 2 };
    const gap = Math.min(...[twig.a, twig.b, mid].map((p) => groundAt(world, p.x) - p.y));
    if (gap > TWIG.radius + 1.5) wake(twig);
    else addToGround(world, twig);
  }
}
