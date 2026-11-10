import type { ExchangeItem, SourceId } from '@magpin/core';

/** An image collected from a board, with the small URL used in the side panel. */
export interface CollectedItem extends ExchangeItem {
  thumbUrl: string;
}

export interface BoardMeta {
  source: SourceId;
  title: string;
  url: string;
  /** Item count announced by the page, when it shows one. */
  expectedCount: number | null;
}

export interface SkipCounts {
  video: number;
  sponsored: number;
}

export interface CollectProgress {
  /** Items found since the previous progress call, in board order. */
  newItems: CollectedItem[];
  found: number;
  skipped: SkipCounts;
}

export interface CollectResult {
  items: CollectedItem[];
  skipped: SkipCounts;
}

/** What the side panel needs to know about a source: no DOM access. */
export interface SourceDescriptor {
  id: SourceId;
  label: string;
  /** What the page calls its items, for its own count ("41 pins"): it counts videos too. */
  itemNoun: string;
  /** True when `url` is a board page this source can read. */
  match(url: string): boolean;
}

/** The full adapter, which runs in the page as a content script. */
export interface SourceAdapter extends SourceDescriptor {
  getBoardMeta(doc: Document): BoardMeta | Promise<BoardMeta>;
  collectItems(onProgress: (progress: CollectProgress) => void, signal: AbortSignal): Promise<CollectResult>;
}

/** What a grid cell (or an API entry) turned out to be. */
export type ItemReading =
  | { kind: 'image'; item: CollectedItem; key: string; order: number | null }
  | { kind: 'skip'; reason: 'video' | 'sponsored'; key: string }
  | { kind: 'empty' };

export function emptySkips(): SkipCounts {
  return { video: 0, sponsored: 0 };
}
