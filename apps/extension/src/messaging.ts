/**
 * Port protocol between the side panel and the collector content script.
 * The panel opens the port; closing the panel closes it and stops collection.
 */
import type { BoardMeta, CollectedItem, SkipCounts } from './sources/types';

export const COLLECT_PORT = 'magpin:collect';

export type PanelToPage = { type: 'start' } | { type: 'stop' };

export type PageToPanel =
  | { type: 'meta'; meta: BoardMeta }
  | { type: 'unsupported' }
  | { type: 'progress'; newItems: CollectedItem[]; found: number; skipped: SkipCounts }
  /** `meta` is read again at the end: in-page navigation can leave the page on the previous board's info for a moment. */
  | { type: 'done'; meta: BoardMeta | null; items: CollectedItem[]; skipped: SkipCounts; stopped: boolean }
  | { type: 'error'; message: string };
