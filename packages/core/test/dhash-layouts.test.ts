import { describe, expect, it } from 'vitest';
import { type Placement, dHash, findVisualDuplicates, grayFromRgba, groupsLayout, hammingDistance, hexToOklab, masonryLayout } from '../src';

const gradient = (offset = 0) => Array.from({ length: 72 }, (_, i) => ((i % 9) * 20 + offset + Math.floor(i / 9) * 3) % 256);

describe('dHash', () => {
  it('produces 16 hex characters and is stable', () => {
    const hash = dHash(gradient());
    expect(hash).toMatch(/^[0-9a-f]{16}$/);
    expect(dHash(gradient())).toBe(hash);
  });

  it('ignores uniform brightness changes and catches different pictures', () => {
    const base = gradient();
    const brighter = base.map((v) => Math.min(255, v + 10));
    expect(hammingDistance(dHash(base), dHash(brighter))).toBeLessThanOrEqual(5);
    const mirrored = Array.from({ length: 72 }, (_, i) => base[Math.floor(i / 9) * 9 + (8 - (i % 9))]!);
    expect(hammingDistance(dHash(base), dHash(mirrored))).toBeGreaterThan(5);
  });

  it('rejects grids that are too small', () => {
    expect(() => dHash([1, 2, 3])).toThrow();
  });

  it('computes luminance from RGBA', () => {
    expect(grayFromRgba([255, 255, 255, 255, 0, 0, 0, 255])).toEqual([255, 0]);
  });

  it('counts differing bits', () => {
    expect(hammingDistance('0000000000000000', '000000000000000f')).toBe(4);
    expect(hammingDistance('ffffffffffffffff', '0000000000000000')).toBe(64);
    expect(hammingDistance('00', '0000')).toBe(Number.POSITIVE_INFINITY);
  });
});

describe('findVisualDuplicates', () => {
  it('keeps the biggest copy of each picture', () => {
    const a = dHash(gradient());
    const nearlyA = a.slice(0, 15) + ((Number.parseInt(a[15]!, 16) ^ 1).toString(16));
    const b = 'f0f0f0f0f0f0f0f0';
    const result = findVisualDuplicates([
      { hash: a, area: 100 },
      { hash: b, area: 50 },
      { hash: nearlyA, area: 400 },
    ]);
    expect(result).toEqual({ keep: [false, true, true], removed: 1 });
  });

  it('does not merge flat images of different colors', () => {
    const flat = '0000000000000000';
    const result = findVisualDuplicates([
      { hash: flat, area: 10, color: hexToOklab('#FF0000') },
      { hash: flat, area: 10, color: hexToOklab('#0000FF') },
      { hash: flat, area: 20, color: hexToOklab('#FE0101') },
    ]);
    expect(result.keep).toEqual([false, true, true]);
  });
});

function overlaps(a: Placement, b: Placement): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

function noOverlap(placements: Placement[]): boolean {
  for (let i = 0; i < placements.length; i++) {
    for (let j = i + 1; j < placements.length; j++) if (overlaps(placements[i]!, placements[j]!)) return false;
  }
  return true;
}

describe('masonryLayout', () => {
  it.each([10, 100, 500])('places %i images without overlap, inside its bounds', (count) => {
    const aspects = Array.from({ length: count }, (_, i) => [1.5, 0.75, 1, 1.33, 2.2][i % 5]!);
    const result = masonryLayout(aspects, { columns: 6, gap: 16, columnWidth: 320 });
    expect(result.placements).toHaveLength(count);
    expect(noOverlap(result.placements)).toBe(true);
    for (const p of result.placements) {
      expect(p.x + p.width).toBeLessThanOrEqual(result.width);
      expect(p.y + p.height).toBeLessThanOrEqual(result.height);
    }
  });

  it('puts each image in the shortest column', () => {
    const result = masonryLayout([2, 1, 1, 1], { columns: 2, gap: 0, columnWidth: 100 });
    expect(result.placements.map((p) => p.x)).toEqual([0, 100, 100, 0]);
    expect(result.placements[1]!.height).toBe(100);
  });

  it('treats unknown ratios as square and caps extreme ones', () => {
    const result = masonryLayout([null, Number.NaN, 50], { columns: 3, gap: 0, columnWidth: 100 });
    expect(result.placements.map((p) => p.height)).toEqual([100, 100, 500]);
  });
});

describe('groupsLayout', () => {
  it.each([[[10]], [[30, 40, 30]], [[100, 150, 50, 120, 80]]])('places groups %j without overlap', (counts) => {
    const options = { columns: 6, gap: 16, cellSize: 320, swatchSize: 64, groupGap: 96 };
    const result = groupsLayout(counts, options);
    const total = counts.reduce((a, b) => a + b, 0);
    expect(result.placements).toHaveLength(total);
    expect(result.swatches).toHaveLength(counts.length);
    expect(noOverlap([...result.placements, ...result.swatches])).toBe(true);
    for (const p of [...result.placements, ...result.swatches]) {
      expect(p.x + p.width).toBeLessThanOrEqual(result.width);
      expect(p.y + p.height).toBeLessThanOrEqual(result.height);
    }
  });

  it('starts each group on its own row, after its swatch', () => {
    const result = groupsLayout([2, 1], { columns: 6, gap: 10, cellSize: 100, swatchSize: 40, groupGap: 50 });
    expect(result.placements[0]).toEqual({ x: 60, y: 0, width: 100, height: 100 });
    expect(result.placements[2]!.y).toBe(150);
    expect(result.swatches[1]).toEqual({ x: 0, y: 150, width: 40, height: 40 });
  });
});
