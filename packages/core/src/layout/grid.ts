/**
 * Grid layout (F8): fixed-width columns, square cells. Images fill their cell
 * (Figma image paint in FILL mode crops them to a square).
 */

export interface Placement {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface LayoutResult {
  placements: Placement[];
  width: number;
  height: number;
}

export interface GridOptions {
  columns: number;
  gap: number;
  cellSize: number;
}

export const DEFAULT_GRID: GridOptions = { columns: 6, gap: 16, cellSize: 320 };

export const GRID_LIMITS = {
  columns: { min: 1, max: 20 },
  gap: { min: 0, max: 200 },
} as const;

export function clampGridOptions(options: Partial<GridOptions>): GridOptions {
  const columns = clampInt(options.columns ?? DEFAULT_GRID.columns, GRID_LIMITS.columns.min, GRID_LIMITS.columns.max);
  const gap = clampInt(options.gap ?? DEFAULT_GRID.gap, GRID_LIMITS.gap.min, GRID_LIMITS.gap.max);
  const cellSize = Math.max(1, Math.round(options.cellSize ?? DEFAULT_GRID.cellSize));
  return { columns, gap, cellSize };
}

/** Position of the cell at `index` (row-major order). */
export function gridCell(index: number, options: GridOptions): Placement {
  const column = index % options.columns;
  const row = Math.floor(index / options.columns);
  const step = options.cellSize + options.gap;
  return { x: column * step, y: row * step, width: options.cellSize, height: options.cellSize };
}

export function gridLayout(count: number, options: GridOptions): LayoutResult {
  const placements = Array.from({ length: count }, (_, index) => gridCell(index, options));
  if (count === 0) return { placements, width: 0, height: 0 };
  const columnsUsed = Math.min(count, options.columns);
  const rows = Math.ceil(count / options.columns);
  return {
    placements,
    width: columnsUsed * options.cellSize + (columnsUsed - 1) * options.gap,
    height: rows * options.cellSize + (rows - 1) * options.gap,
  };
}

function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.round(value)));
}
