/**
 * Color groups layout (F8): one block per hue family, each opened by a small
 * swatch of the group's color, images in square cells after it.
 */
import { type LayoutResult, type Placement, gridCell } from './grid';

export interface GroupsOptions {
  columns: number;
  gap: number;
  cellSize: number;
  /** Diameter of the group swatch. */
  swatchSize: number;
  /** Extra space between two groups. */
  groupGap: number;
}

export interface GroupsLayoutResult extends LayoutResult {
  /** One swatch per group, same order as the input counts. */
  swatches: Placement[];
}

/** `counts[i]` images in group i. Placements follow the groups in order. */
export function groupsLayout(counts: readonly number[], options: GroupsOptions): GroupsLayoutResult {
  const { columns, gap, cellSize, swatchSize, groupGap } = options;
  const offsetX = swatchSize + gap * 2;
  const placements: Placement[] = [];
  const swatches: Placement[] = [];
  let top = 0;
  let widest = 0;

  counts.forEach((count) => {
    swatches.push({ x: 0, y: top, width: swatchSize, height: swatchSize });
    for (let i = 0; i < count; i++) {
      const cell = gridCell(i, { columns, gap, cellSize });
      placements.push({ x: offsetX + cell.x, y: top + cell.y, width: cell.width, height: cell.height });
    }
    const rows = Math.max(1, Math.ceil(count / columns));
    const used = Math.max(1, Math.min(count, columns));
    widest = Math.max(widest, offsetX + used * cellSize + (used - 1) * gap);
    top += Math.max(swatchSize, rows * cellSize + (rows - 1) * gap) + groupGap;
  });

  if (counts.length === 0) return { placements, swatches, width: 0, height: 0 };
  return { placements, swatches, width: widest, height: top - groupGap };
}
