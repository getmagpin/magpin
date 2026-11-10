/**
 * Shared collector for sources that render their grid lazily (Pinterest,
 * Cosmos, Savee): scroll the page ourselves, read cells as they appear,
 * de-duplicate, keep board order. Runs only when the user asks.
 */
import type { CollectProgress, CollectResult, CollectedItem, ItemReading } from './types';
import { emptySkips } from './types';

/** Tuning, kept together so it is easy to adjust after real-world tests. */
export const SCROLL_TUNING = {
  /** Fraction of the viewport scrolled per step. */
  stepRatio: 0.85,
  /** Pause after a step so the page can render the next cells. */
  stepDelayMs: 300,
  /** Pause while waiting at the end for the next page of items. */
  bottomDelayMs: 600,
  /** Steps in a row without new items before giving up, at the end. */
  idleStepsAtBottom: 6,
  /** Same, anywhere on the page (guards against endless recommendation feeds). */
  idleStepsAnywhere: 14,
} as const;

export interface ScrollSource {
  /** Finds the list that holds the board's items. Called at the top of the page. */
  findList(doc: Document): Element | null;
  /** Selector matching any list (used to find the list again if re-mounted). */
  listSelector: string;
  /** Cells of the board list. */
  cells(list: Element): Element[];
  readCell(cell: Element): ItemReading;
  /** Item count announced by the page, when it shows one. */
  expectedCount: number | null;
}

/**
 * Keeps hold of the board list while scrolling. If the page re-mounts it,
 * finds it again by its position among the page's lists.
 */
export class ListLock {
  private list: Element | null;
  private readonly position: number;

  constructor(
    private readonly doc: Document,
    private readonly source: Pick<ScrollSource, 'findList' | 'listSelector'>,
  ) {
    this.list = source.findList(doc);
    this.position = this.list ? Array.from(doc.querySelectorAll(source.listSelector)).indexOf(this.list) : -1;
  }

  get(): Element | null {
    if (this.list?.isConnected) return this.list;
    if (this.position < 0) return (this.list = this.source.findList(this.doc));
    this.list = this.doc.querySelectorAll(this.source.listSelector)[this.position] ?? null;
    return this.list;
  }
}

export async function scrollCollect(source: ScrollSource, onProgress: (progress: CollectProgress) => void, signal: AbortSignal): Promise<CollectResult> {
  const items = new Map<string, { item: CollectedItem; order: number; seq: number }>();
  const seenKeys = new Set<string>();
  const skippedKeys = new Set<string>();
  const skipped = emptySkips();
  let seq = 0;

  const harvest = (list: Element | null): CollectedItem[] => {
    const fresh: CollectedItem[] = [];
    if (!list) return fresh;
    for (const cell of source.cells(list)) {
      const reading = source.readCell(cell);
      if (reading.kind === 'skip') {
        if (!skippedKeys.has(reading.key)) {
          skippedKeys.add(reading.key);
          skipped[reading.reason]++;
        }
      } else if (reading.kind === 'image') {
        const { item, key } = reading;
        if (seenKeys.has(key) || seenKeys.has(`id:${item.id}`)) continue;
        seenKeys.add(key);
        seenKeys.add(`id:${item.id}`);
        items.set(item.id, { item, order: reading.order ?? Number.MAX_SAFE_INTEGER, seq: seq++ });
        fresh.push(item);
      }
    }
    return fresh;
  };

  const scroller = document.scrollingElement ?? document.documentElement;
  const startY = window.scrollY;
  window.scrollTo({ top: 0, behavior: 'instant' });
  await sleep(SCROLL_TUNING.stepDelayMs, signal);
  // Locked at the top of the page, before recommendation lists can render.
  const lock = new ListLock(document, source);

  let idle = 0;
  try {
    while (!signal.aborted) {
      const list = lock.get();
      const fresh = harvest(list);
      if (fresh.length > 0) onProgress({ newItems: fresh, found: items.size, skipped: { ...skipped } });
      idle = fresh.length > 0 ? 0 : idle + 1;

      const total = items.size + skipped.video + skipped.sponsored;
      if (source.expectedCount !== null && total >= source.expectedCount) break;

      // Stop at the end of the board's own list, not at the end of the page:
      // what follows can be recommendations. Pages grow the list as we near its
      // end, so we wait there a little before concluding.
      const pageBottom = window.scrollY + window.innerHeight >= scroller.scrollHeight - 4;
      const listBottom = list ? list.getBoundingClientRect().bottom <= window.innerHeight : pageBottom;
      const atEnd = listBottom || pageBottom;
      if (atEnd && idle >= SCROLL_TUNING.idleStepsAtBottom) break;
      if (idle >= SCROLL_TUNING.idleStepsAnywhere) break;

      if (!atEnd) window.scrollBy({ top: Math.round(window.innerHeight * SCROLL_TUNING.stepRatio), behavior: 'instant' });
      await sleep(atEnd ? SCROLL_TUNING.bottomDelayMs : SCROLL_TUNING.stepDelayMs, signal);
    }
  } finally {
    window.scrollTo({ top: startY, behavior: 'instant' });
  }

  const ordered = Array.from(items.values())
    .sort((a, b) => a.order - b.order || a.seq - b.seq)
    .map((entry) => entry.item);
  return { items: ordered, skipped: { ...skipped } };
}

export function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) return resolve();
    const timer = setTimeout(done, ms);
    signal.addEventListener('abort', done, { once: true });
    function done() {
      clearTimeout(timer);
      signal.removeEventListener('abort', done);
      resolve();
    }
  });
}

/** Board URL without query, fragment or trailing noise, used to compare pages. */
export function canonicalBoardUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const path = parsed.pathname.endsWith('/') ? parsed.pathname : `${parsed.pathname}/`;
    return `https://${parsed.hostname.toLowerCase()}${path}`;
  } catch {
    return url;
  }
}

/** Path segments of a URL, decoded. */
export function pathSegments(url: URL): string[] {
  return url.pathname
    .split('/')
    .filter(Boolean)
    .map((segment) => {
      try {
        return decodeURIComponent(segment);
      } catch {
        return segment;
      }
    });
}

export function textOf(element: Element | null): string {
  return (element?.textContent ?? '').replace(/\s+/g, ' ').trim();
}

/** Leading integer of "1,234 Pins", "41 Épingles", "115 elements"; null for "1.2k". */
export function parseCount(text: string): number | null {
  const match = /^\s*([\d][\d\s.,  ']*)(\s*[kKmM]\b)?/.exec(text);
  if (!match || match[2]) return null;
  const digits = (match[1] ?? '').replace(/\D/g, '');
  if (!digits) return null;
  const count = Number.parseInt(digits, 10);
  return Number.isFinite(count) ? count : null;
}
