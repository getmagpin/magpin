import { describe, expect, it } from 'vitest';
import { DEFAULT_GRID, clampGridOptions, gridLayout, type Placement } from '../src';

function overlaps(a: Placement, b: Placement): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

describe('gridLayout', () => {
  it.each([0, 1, 10, 100, 500])('lays out %i items without overlap', (count) => {
    const { placements, width, height } = gridLayout(count, DEFAULT_GRID);
    expect(placements).toHaveLength(count);
    // Neighbours are enough to detect overlap in a regular grid.
    for (let i = 0; i < placements.length; i++) {
      for (const j of [i + 1, i + DEFAULT_GRID.columns]) {
        if (j < placements.length) expect(overlaps(placements[i]!, placements[j]!)).toBe(false);
      }
    }
    for (const placement of placements) {
      expect(placement.x + placement.width).toBeLessThanOrEqual(width);
      expect(placement.y + placement.height).toBeLessThanOrEqual(height);
    }
  });

  it('computes exact bounds', () => {
    const options = { columns: 3, gap: 10, cellSize: 100 };
    expect(gridLayout(4, options)).toMatchObject({ width: 320, height: 210 });
    expect(gridLayout(2, options)).toMatchObject({ width: 210, height: 100 });
    expect(gridLayout(4, options).placements[3]).toEqual({ x: 0, y: 110, width: 100, height: 100 });
  });
});

describe('clampGridOptions', () => {
  it('fills defaults and clamps out-of-range values', () => {
    expect(clampGridOptions({})).toEqual(DEFAULT_GRID);
    expect(clampGridOptions({ columns: 0, gap: -5 })).toMatchObject({ columns: 1, gap: 0 });
    expect(clampGridOptions({ columns: 99, gap: 1000 })).toMatchObject({ columns: 20, gap: 200 });
    expect(clampGridOptions({ columns: Number.NaN })).toMatchObject({ columns: 1 });
  });
});
