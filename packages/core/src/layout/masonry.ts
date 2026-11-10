/**
 * Mosaic layout (F8), Pinterest-style: fixed column width, height from the
 * image's aspect ratio, each image goes into the shortest column.
 */
import type { LayoutResult, Placement } from './grid';

export interface MasonryOptions {
  columns: number;
  gap: number;
  columnWidth: number;
}

/** `aspects` are height / width ratios; unknown ratios count as square. */
export function masonryLayout(aspects: readonly (number | null | undefined)[], options: MasonryOptions): LayoutResult {
  const { columns, gap, columnWidth } = options;
  const heights = new Array<number>(Math.max(1, columns)).fill(0);
  const placements: Placement[] = aspects.map((aspect) => {
    const ratio = aspect && Number.isFinite(aspect) && aspect > 0 ? Math.min(aspect, 5) : 1;
    const column = shortest(heights);
    const height = Math.max(1, Math.round(columnWidth * ratio));
    const placement = { x: column * (columnWidth + gap), y: heights[column]!, width: columnWidth, height };
    heights[column] = heights[column]! + height + gap;
    return placement;
  });
  if (placements.length === 0) return { placements, width: 0, height: 0 };
  const used = Math.min(placements.length, columns);
  return {
    placements,
    width: used * columnWidth + (used - 1) * gap,
    height: Math.max(...heights) - gap,
  };
}

function shortest(heights: readonly number[]): number {
  let best = 0;
  for (let i = 1; i < heights.length; i++) if (heights[i]! < heights[best]!) best = i;
  return best;
}
