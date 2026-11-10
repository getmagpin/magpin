import { describe, expect, it } from 'vitest';
import { cleanSegment, planVariableUpdate, uniqueNames, variableNames } from '../src/main/variables';

describe('cleanSegment', () => {
  it('keeps plain names as they are', () => {
    expect(cleanSegment('Brick Red', 'Color')).toBe('Brick Red');
  });

  it('removes what Figma refuses or reads as a group', () => {
    expect(cleanSegment('Black/White', 'Board')).toBe('Black-White');
    expect(cleanSegment('Vol. 2 {draft}', 'Board')).toBe('Vol 2 draft');
    expect(cleanSegment('  a\tb\n ', 'Board')).toBe('a b');
  });

  it('falls back when nothing is left', () => {
    expect(cleanSegment('...', 'Board')).toBe('Board');
    expect(cleanSegment('', 'Color')).toBe('Color');
  });
});

describe('uniqueNames', () => {
  it('numbers repeats and avoids taken names', () => {
    expect(uniqueNames(['A', 'A', 'B'])).toEqual(['A', 'A 2', 'B']);
    expect(uniqueNames(['A', 'A 2', 'A'])).toEqual(['A', 'A 2', 'A 3']);
    expect(uniqueNames(['Sage'], ['Sage'])).toEqual(['Sage 2']);
  });
});

describe('variableNames', () => {
  it('uses the color names alone for one board', () => {
    expect(variableNames([{ title: 'Café', colors: ['Sage', 'Brick Red'] }])).toEqual(['Sage', 'Brick Red']);
  });

  it('groups by board, with clean and distinct group names', () => {
    const names = variableNames([
      { title: 'Type/Print', colors: ['Sage'] },
      { title: 'Type.Print', colors: ['Sage', 'Ink'] },
      { title: 'Vol. 1', colors: ['Ink'] },
    ]);
    expect(names).toEqual(['Type-Print/Sage', 'Type Print/Sage', 'Type Print/Ink', 'Vol 1/Ink']);
    expect(new Set(names).size).toBe(names.length);
    for (const name of names) expect(name).not.toMatch(/[.{}]|\/\/|^\/|\/$/);
  });
});

describe('planVariableUpdate', () => {
  /** Applies the plan the way code.ts does, failing on any name collision along the way. */
  function apply(existing: string[], wanted: string[]) {
    const plan = planVariableUpdate(existing, wanted);
    const live = new Map(existing.map((name, i) => [i, name]));
    const held = () => new Set(live.values());
    for (const i of plan.remove) live.delete(i);
    let created = 0;
    wanted.forEach((name, w) => {
      const reused = plan.reuse[w];
      if (reused === null || reused === undefined) {
        if (held().has(name)) throw new Error(`create collides: ${name}`);
        live.set(1000 + created++, name);
      } else if (live.get(reused) !== name) {
        if (held().has(name)) throw new Error(`rename collides: ${name}`);
        live.set(reused, name);
      }
    });
    return { plan, names: [...live.values()].sort(), created };
  }

  it('keeps variables that already hold a wanted name', () => {
    const { plan } = apply(['Sage', 'Ink', 'Clay'], ['Ink', 'Sage', 'Clay']);
    expect(plan.reuse).toEqual([1, 0, 2]);
    expect(plan.remove).toEqual([]);
  });

  it('swaps and renames without a collision on the way', () => {
    // Old order A, B; new palette B, C: A must not be renamed to B while B exists.
    const { plan, names } = apply(['A', 'B'], ['B', 'C']);
    expect(plan.reuse).toEqual([1, 0]);
    expect(names).toEqual(['B', 'C']);
  });

  it('removes extras and creates what is missing', () => {
    const fewer = apply(['A', 'B', 'C', 'D'], ['C', 'X']);
    expect(fewer.plan.remove).toHaveLength(2);
    expect(fewer.names).toEqual(['C', 'X']);
    const more = apply(['A'], ['B', 'C', 'A']);
    expect(more.plan.reuse).toEqual([null, null, 0]);
    expect(more.created).toBe(2);
    expect(more.names).toEqual(['A', 'B', 'C']);
  });
});
