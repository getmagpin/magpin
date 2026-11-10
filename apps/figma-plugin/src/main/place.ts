/**
 * Where to put a new moodboard on the page: in rows, left to right, without
 * covering anything. A moodboard goes to the right of the others while the
 * row has room, then to the next row; a free gap big enough is used too.
 */

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PlaceOptions {
  /** Space kept around everything. */
  gap: number;
  /** Rows don't grow wider than this (unless one moodboard alone is wider). */
  rowWidth: number;
}

/** First free spot in reading order: top row first, leftmost first. */
export function findSpot(existing: readonly Rect[], size: { width: number; height: number }, { gap, rowWidth }: PlaceOptions): { x: number; y: number } | null {
  const rects = existing.filter((r) => Number.isFinite(r.x + r.y + r.width + r.height) && r.width >= 0 && r.height >= 0);
  if (rects.length === 0) return null;
  const left = Math.min(...rects.map((r) => r.x));
  const top = Math.min(...rects.map((r) => r.y));
  const right = left + Math.max(rowWidth, size.width);

  // A row can start at the top, or just under anything.
  const rows = [...new Set([top, ...rects.map((r) => r.y + r.height + gap)])].sort((a, b) => a - b);
  for (const y of rows) {
    // What stands in the way at this height, left to right.
    const blocking = rects
      .filter((r) => r.y < y + size.height + gap && r.y + r.height + gap > y)
      .sort((a, b) => a.x - b.x);
    let x = left;
    for (const r of blocking) {
      if (x + size.width + gap <= r.x) break;
      x = Math.max(x, r.x + r.width + gap);
    }
    if (x + size.width <= right) return { x: Math.round(x), y: Math.round(y) };
  }
  // Unreachable (the last row is under everything), but stay safe.
  return { x: Math.round(left), y: Math.round(Math.max(...rects.map((r) => r.y + r.height)) + gap) };
}
