/**
 * Progress shown while a board is read. With a known total it is plain
 * count / total. Without one (a board Magpin has never seen), it is an
 * estimate that keeps moving forward, slower and slower, and never quite
 * reaches the end: the end comes when the reading does.
 */
export function scanProgress(count: number, expected: number | null, elapsedMs: number): number {
  if (expected && expected > 0) return Math.min(1, count / expected);
  const x = Math.max(0, elapsedMs) / 8000 + Math.max(0, count) / 80;
  return 0.95 * (x / (x + 1));
}

/**
 * How a reading ended:
 * - `stopped`: the user (or the page going away) stopped it;
 * - `empty`: it got to the end and found no image;
 * - `partial`: it got to the end clearly short of the page's own count;
 * - `success`: anything else.
 *
 * `scanned` counts images plus skipped videos, like the page's own count.
 * A pin or two can be missing from any count (deleted, hidden), so "clearly
 * short" leaves 2% of slack, at least one item.
 */
export type ScanEnding = 'success' | 'partial' | 'empty' | 'stopped';

export function scanEnding({ found, scanned, expected, stopped }: { found: number; scanned: number; expected: number | null; stopped: boolean }): ScanEnding {
  if (stopped) return 'stopped';
  if (found === 0) return 'empty';
  if (expected && expected - scanned > Math.max(1, Math.round(expected * 0.02))) return 'partial';
  return 'success';
}
