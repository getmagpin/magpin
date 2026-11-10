import { seededRandom } from '@magpin/core';
import { describe, expect, it } from 'vitest';
import { TWIG, createWorld, groundAt, opacityOf, remove, spawn, step } from '../src/twigs';

const FRAME = 1000 / 60;
const run = (world: ReturnType<typeof createWorld>, ms: number) => {
  for (let t = 0; t < ms; t += FRAME) step(world, FRAME);
};

describe('falling twigs', () => {
  it('falls and comes to rest on the bottom of the page', () => {
    const world = createWorld(320, 600);
    const twig = spawn(world, { x: 160, y: 100 }, seededRandom(1));
    run(world, 3000);
    expect(twig.resting).toBe(true);
    for (const p of [twig.a, twig.b]) {
      expect(p.y).toBeLessThanOrEqual(600);
      expect(p.y).toBeGreaterThan(600 - TWIG.length);
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThanOrEqual(320);
    }
    // Its stem keeps its length.
    expect(Math.hypot(twig.b.x - twig.a.x, twig.b.y - twig.a.y)).toBeCloseTo(TWIG.length, 0);
  });

  it('piles up: a twig dropped on another rests on top of it', () => {
    const world = createWorld(320, 600);
    const random = seededRandom(7);
    const first = spawn(world, { x: 160, y: 300 }, random);
    run(world, 2500);
    const floorUnder = groundAt(world, (first.a.x + first.b.x) / 2);
    expect(floorUnder).toBeLessThan(600);
    const second = spawn(world, { x: (first.a.x + first.b.x) / 2, y: 200 }, random);
    run(world, 2500);
    expect(second.resting).toBe(true);
    expect(Math.min(second.a.y, second.b.y)).toBeLessThan(Math.min(first.a.y, first.b.y) + 1);
  });

  it('when the twig underneath goes, the one on top falls again', () => {
    const world = createWorld(320, 600);
    const random = seededRandom(3);
    const first = spawn(world, { x: 160, y: 400 }, random);
    run(world, 2500);
    const second = spawn(world, { x: (first.a.x + first.b.x) / 2, y: 300 }, random);
    run(world, 2500);
    const restedAt = Math.max(second.a.y, second.b.y);
    remove(world, first.id);
    expect(second.resting).toBe(false);
    run(world, 2500);
    expect(Math.max(second.a.y, second.b.y)).toBeGreaterThanOrEqual(restedAt);
  });

  it('fades out after a while and the page is empty again', () => {
    const world = createWorld(320, 600);
    const twig = spawn(world, { x: 100, y: 50 }, seededRandom(5));
    run(world, TWIG.life - 100);
    expect(opacityOf(twig)).toBe(1);
    run(world, 300);
    expect(opacityOf(twig)).toBeLessThan(1);
    run(world, TWIG.fade + 200);
    expect(world.twigs).toHaveLength(0);
    expect(groundAt(world, 100)).toBe(600);
  });

  it('keeps no more than the most twigs at once, dropping the oldest', () => {
    const world = createWorld(320, 600);
    const random = seededRandom(9);
    const first = spawn(world, { x: 10, y: 10 }, random);
    for (let i = 0; i < TWIG.max; i++) spawn(world, { x: 20 + (i % 280), y: 10 }, random);
    expect(world.twigs).toHaveLength(TWIG.max);
    expect(world.twigs.includes(first)).toBe(false);
  });
});
