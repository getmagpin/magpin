import { describe, expect, it } from 'vitest';
import { GROUND_Y, NEST, NEST_SITTABLE, NEST_TIERS, bowlPath, nestDepth, nestGoal, nestTop, weaveNest } from '../src/nest';

const numbers = (d: string) => (d.match(/-?\d+(\.\d+)?|NaN|Infinity/g) ?? []).map(Number);

describe('nest geometry', () => {
  it('weaves the same nest every time', () => {
    expect(weaveNest()).toEqual(weaveNest());
  });

  it('builds the bowl from the bottom up, rim last', () => {
    const twigs = weaveNest();
    let previous = 1;
    for (let placed = 1; placed <= twigs.length; placed++) {
      const depth = nestDepth(twigs, placed);
      expect(depth).toBeLessThanOrEqual(previous);
      previous = depth;
    }
    expect(previous).toBe(0);
    const bowl = twigs.filter((twig) => twig.depth > 0);
    expect(bowl.length).toBeGreaterThan(twigs.length / 2);
    expect(twigs.slice(bowl.length).every((twig) => twig.depth === 0)).toBe(true);
    expect(twigs.some((twig) => twig.layer === 'back')).toBe(true);
  });

  it('keeps every twig around the nest with finite coordinates', () => {
    for (const twig of weaveNest()) {
      for (const value of [twig.x, twig.y, twig.angle]) expect(Number.isFinite(value)).toBe(true);
      expect(twig.x).toBeGreaterThan(NEST.x - NEST.rx - 12);
      expect(twig.x).toBeLessThan(NEST.x + NEST.rx + 12);
      expect(twig.y).toBeGreaterThan(NEST.rimY - 14);
      expect(twig.y).toBeLessThan(NEST.rimY + NEST.depth + 8);
    }
    for (const top of [0, 0.5, 1]) for (const value of numbers(bowlPath(top))) expect(Number.isFinite(value)).toBe(true);
  });

  it('grows the nest with the size of the moodboard, in tiers', () => {
    const total = weaveNest().length;
    expect(nestGoal(0, total)).toBe(0);
    expect(nestGoal(1, total)).toBe(1);
    expect(nestGoal(10, total)).toBe(1);
    expect(nestGoal(11, total)).toBeGreaterThan(1);
    let previous = 0;
    for (const images of [1, 10, 25, 50, 100, 200, 350, 500, 501, 5000]) {
      const goal = nestGoal(images, total);
      expect(goal).toBeGreaterThanOrEqual(previous);
      previous = goal;
    }
    expect(nestGoal(501, total)).toBe(total);
    // Small boards don't make a nest to sit in; big ones do.
    expect(nestGoal(100, total)).toBeLessThan(NEST_SITTABLE);
    expect(nestGoal(350, total)).toBeGreaterThanOrEqual(NEST_SITTABLE);
    expect(NEST_TIERS.every(([, twigs]) => twigs <= total)).toBe(true);
  });

  it('rises as twigs come in, from the page to the rim', () => {
    const twigs = weaveNest();
    expect(nestTop(twigs, 0)).toBe(GROUND_Y);
    let previous = Infinity;
    for (let placed = 1; placed <= twigs.length; placed++) {
      const top = nestTop(twigs, placed);
      expect(top).toBeLessThanOrEqual(previous);
      previous = top;
    }
    expect(previous).toBe(NEST.rimY);
  });
});
