/**
 * Cart (F3): several boards merged into one moodboard. Each board keeps its
 * own selection. Stored in chrome.storage.local, so it survives closing the
 * panel, switching tabs and restarting Chrome.
 */
import { type ExchangeBoard, type SourceId, dedupeItems } from '@magpin/core';
import { browser } from 'wxt/browser';
import { parsePinimgUrl } from './sources/pinterest/urls';
import type { CollectedItem } from './sources/types';

export interface CartBoard {
  /** Canonical board URL. */
  key: string;
  source: SourceId;
  title: string;
  url: string;
  /** Everything collected on the board, selected or not. */
  items: CollectedItem[];
  deselected: string[];
  addedAt: number;
  /** Title chosen by the user in the cart, used instead of the page's. */
  customTitle?: string;
}

/** The title shown and exported: the user's if they renamed the board. */
export function displayTitle(board: Pick<CartBoard, 'title' | 'customTitle'>): string {
  return board.customTitle?.trim() || board.title;
}

export function selectedItems(board: Pick<CartBoard, 'items' | 'deselected'>): CollectedItem[] {
  const off = new Set(board.deselected);
  return board.items.filter((item) => !off.has(item.id));
}

export interface ExportSummary {
  /**
   * For Copy: each board with its selected images, shared ones included. The
   * Figma plugin removes duplicates itself when it reads the paste, so leaving
   * a board out there gives its shared images back to the boards that stay.
   */
  copy: ExchangeBoard[];
  /** For the ZIP: each image once across all boards (first occurrence wins). */
  zip: ExchangeBoard[];
  /** Images the user gets, after de-duplication (in the ZIP, and in Figma). */
  total: number;
  /** Same image found in more than one place, left out (F6, first level). */
  duplicates: number;
}

/** Same picture across sizes and boards: the CDN file name (Pinterest hash…). */
function imageKey(item: CollectedItem): string | null {
  return parsePinimgUrl(item.imageUrl)?.hash ?? null;
}

/** Turns boards into the exchange format: selected images only, empty boards dropped. */
export function buildExport(boards: readonly Pick<CartBoard, 'source' | 'title' | 'customTitle' | 'url' | 'items' | 'deselected'>[]): ExportSummary {
  const tagged = boards.flatMap((board, b) => selectedItems(board).map((item) => ({ ...item, board: b })));
  const unique = new Set(dedupeItems(tagged, imageKey));
  const exchange = (keep: (item: (typeof tagged)[number]) => boolean): ExchangeBoard[] =>
    boards
      .map((board, b) => ({
        source: board.source,
        title: displayTitle(board),
        url: board.url,
        items: tagged.filter((item) => item.board === b && keep(item)).map(({ board: _board, ...item }) => item),
      }))
      .filter((board) => board.items.length > 0);
  return { copy: exchange(() => true), zip: exchange((item) => unique.has(item)), total: unique.size, duplicates: tagged.length - unique.size };
}

/**
 * Puts `board` in the cart, replacing the entry with the same key in place.
 * A rename made in the cart survives re-scans of the board.
 */
export function upsertBoard(cart: readonly CartBoard[], board: CartBoard): CartBoard[] {
  const index = cart.findIndex((entry) => entry.key === board.key);
  if (index === -1) return [...cart, board];
  const previous = cart[index]!;
  const next = [...cart];
  next[index] = { ...board, addedAt: previous.addedAt, customTitle: board.customTitle ?? previous.customTitle };
  return next;
}

/** What a reading of a board brings back. */
export interface Reading {
  title: string;
  url: string;
  items: CollectedItem[];
  /** Stopped before the end (by the user, or the page going away). */
  stopped: boolean;
}

/**
 * The items a board keeps after a new reading. A reading stopped early never
 * shrinks a board read before: the earlier, longer list stays.
 */
export function itemsAfterReading(before: CollectedItem[] | null | undefined, reading: Pick<Reading, 'items' | 'stopped'>): CollectedItem[] {
  return reading.stopped && before && before.length > reading.items.length ? before : reading.items;
}

/**
 * A board of the cart was read again: its items and page title follow (the
 * user's title and selection stay). Returns `cart` itself when the board is
 * not in it or nothing changed.
 */
export function applyReading(cart: CartBoard[], key: string, reading: Reading): CartBoard[] {
  const index = cart.findIndex((entry) => entry.key === key);
  const previous = cart[index];
  if (!previous) return cart;
  const items = itemsAfterReading(previous.items, reading);
  if (items === previous.items && reading.title === previous.title && reading.url === previous.url) return cart;
  const next = [...cart];
  next[index] = { ...previous, items, title: reading.title, url: reading.url };
  return next;
}

/** Sets (or clears, with an empty title) the user's title of a board. */
export function renameBoard(cart: readonly CartBoard[], key: string, title: string): CartBoard[] {
  return cart.map((board) => {
    if (board.key !== key) return board;
    const clean = title.replace(/\s+/g, ' ').trim();
    const { customTitle: _old, ...rest } = board;
    return clean && clean !== board.title ? { ...rest, customTitle: clean } : rest;
  });
}

// ---------- Storage ----------

const STORAGE_KEY = 'magpin.cart.v1';

/**
 * `chrome.storage` exists only once the extension runs with the `storage`
 * permission. A panel reopened with new code before the extension itself is
 * reloaded runs without it: the cart then lives in memory until reload.
 */
function storage() {
  const api = (browser as { storage?: typeof browser.storage } | undefined)?.storage;
  if (!api?.local) console.warn('[magpin] chrome.storage unavailable: reload the extension in chrome://extensions to keep the moodboard.');
  return api?.local ? api : null;
}

export async function readCart(): Promise<CartBoard[]> {
  try {
    const stored = await storage()?.local.get(STORAGE_KEY);
    const value = stored?.[STORAGE_KEY];
    return Array.isArray(value) ? (value as CartBoard[]) : [];
  } catch {
    return [];
  }
}

export async function writeCart(boards: CartBoard[]): Promise<void> {
  try {
    await storage()?.local.set({ [STORAGE_KEY]: boards });
  } catch {
    // Kept in memory only.
  }
}

/**
 * Storage tells every panel about every write, its own included. This keeps
 * the writes a panel made until they come back, so their echo is not taken
 * for news: an echo of an older write landing after a newer change would
 * briefly undo it.
 */
export class EchoFilter {
  private pending: string[] = [];

  wrote(boards: readonly CartBoard[]): void {
    this.pending.push(JSON.stringify(boards));
    // Echoes can be dropped (same value written twice): never let it grow.
    if (this.pending.length > 20) this.pending.shift();
  }

  /** True for the echo of one of our writes, forgotten then with any older ones. */
  isEcho(boards: readonly CartBoard[]): boolean {
    const index = this.pending.indexOf(JSON.stringify(boards));
    if (index === -1) return false;
    this.pending.splice(0, index + 1);
    return true;
  }
}

/** Calls `listener` whenever the stored cart changes (writes of this panel included). */
export function watchCart(listener: (boards: CartBoard[]) => void): () => void {
  const api = storage();
  if (!api?.onChanged) return () => undefined;
  const onChanged = (changes: Record<string, { newValue?: unknown }>, area: string) => {
    if (area !== 'local' || !(STORAGE_KEY in changes)) return;
    const value = changes[STORAGE_KEY]?.newValue;
    listener(Array.isArray(value) ? (value as CartBoard[]) : []);
  };
  api.onChanged.addListener(onChanged);
  return () => api.onChanged.removeListener(onChanged);
}
