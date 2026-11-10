import { DEFAULT_GRID, gridLayout, groupsLayout, masonryLayout } from '@magpin/core';
import { describe, expect, it } from 'vitest';
import { sketchLayout } from '../src/ui/Sketch';

const CELL = DEFAULT_GRID.cellSize;

describe('sketchLayout', () => {
  it('is as wide as the real grid and mosaic, even with fewer images than columns', () => {
    for (const images of [1, 3, 6, 40]) {
      const grid = sketchLayout('grid', 6, 16, images);
      expect(grid.contentWidth).toBe(gridLayout(images, { columns: 6, gap: 16, cellSize: CELL }).width);
      expect(grid.cols).toBe(Math.min(6, images));
      const mosaic = sketchLayout('mosaic', 6, 16, images);
      expect(mosaic.contentWidth).toBe(masonryLayout(new Array(images).fill(1), { columns: 6, gap: 16, columnWidth: CELL }).width);
      expect(mosaic.cols).toBe(Math.min(6, images));
    }
  });

  it('draws the column bands after the swatches for color groups', () => {
    const groups = sketchLayout('groups', 4, 16, 40);
    expect(groups.cols).toBe(4);
    expect(groups.bandsX).toBe(96 + 16 * 2);
    // Same width as the real layout for groups this size.
    const real = groupsLayout([13, 10, 8, 6, 3], { columns: 4, gap: 16, cellSize: CELL, swatchSize: 96, groupGap: 96 });
    expect(groups.contentWidth).toBe(real.width);
    for (const tile of groups.tiles) expect(tile.x).toBeGreaterThanOrEqual(groups.bandsX);
  });

  it('narrows color groups to their biggest group', () => {
    const groups = sketchLayout('groups', 6, 16, 3);
    expect(groups.cols).toBe(1);
    expect(groups.contentWidth).toBe(96 + 32 + CELL);
  });
});
