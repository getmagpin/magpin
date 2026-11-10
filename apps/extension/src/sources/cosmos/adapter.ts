/**
 * Cosmos adapter (cosmos.so). Cluster pages render their elements lazily in a
 * virtual list; the shared collector scrolls and reads tiles as they appear.
 * Tiles carry stable `data-testid` attributes and the original size.
 */
import { canonicalBoardUrl, parseCount, pathSegments, scrollCollect, textOf } from '../scroll';
import type { BoardMeta, CollectedItem, ItemReading, SourceAdapter } from '../types';

/** Every Cosmos selector in one place: update here when the markup changes. */
export const COSMOS_SELECTORS = {
  grid: '[data-testid="cluster-elements-grid"]',
  tile: '[data-testid="element-tile"]',
  tileContent: '[data-elt-id]',
  image: 'img[data-testid="element-image-img"]',
  video: '[data-testid="element-tile-play-badge"], video',
  orderHolder: '[data-index]',
  title: '[data-testid="cluster-page-title"]',
  header: '[data-testid="cluster-header"]',
} as const;

const S = COSMOS_SELECTORS;
const CDN = /^https:\/\/cdn\.cosmos\.so\/([0-9a-f-]{36})/i;

const RESERVED_ROOTS = new Set([
  'about', 'apps', 'blog', 'discover', 'e', 'explore', 'home', 'legal', 'login', 'notifications', 'pricing', 'search',
  'sequence', 'settings', 'shop', 'signup', 'start', 'upgrade',
]);

/** `https://www.cosmos.so/{user}/{cluster}` (and a sub-cluster below it). */
export function matchCosmosCluster(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'https:' || !/^(www\.)?cosmos\.so$/i.test(parsed.hostname)) return false;
  const segments = pathSegments(parsed);
  if (segments.length < 2 || segments.length > 3) return false;
  return !RESERVED_ROOTS.has(segments[0]!.toLowerCase());
}

/** Element image id from any rendition URL. */
export function cosmosImageId(src: string): string | null {
  return CDN.exec(src)?.[1]?.toLowerCase() ?? null;
}

export function cosmosUrls(id: string) {
  const base = `https://cdn.cosmos.so/${id}`;
  return { imageUrl: base, fallbackUrl: `${base}?format=jpeg&w=2048`, thumbUrl: `${base}?format=jpeg&w=400` };
}

export function readCosmosTile(tile: Element): ItemReading {
  const elementId = tile.querySelector(S.tileContent)?.getAttribute('data-elt-id') ?? null;
  const image = tile.querySelector<HTMLImageElement>(S.image);
  const imageId = cosmosImageId(image?.getAttribute('src') ?? '');
  if (tile.querySelector(S.video)) return { kind: 'skip', reason: 'video', key: elementId ?? imageId ?? 'video' };
  if (!image || !imageId) return { kind: 'empty' };

  const item: CollectedItem = { id: elementId ?? imageId, ...cosmosUrls(imageId) };
  const width = Number(image.getAttribute('width'));
  const height = Number(image.getAttribute('height'));
  if (width > 0 && height > 0) {
    item.width = width;
    item.height = height;
  }
  const order = Number(tile.closest(S.orderHolder)?.getAttribute('data-index'));
  return { kind: 'image', item, key: imageId, order: Number.isFinite(order) ? order : null };
}

export function getCosmosMeta(doc: Document, href: string): BoardMeta {
  const header = textOf(doc.querySelector(S.header));
  const count = /(\d[\d,.\s ]*)\s*(elements?|éléments?)/i.exec(header);
  return {
    source: 'cosmos',
    title: textOf(doc.querySelector(S.title)) || doc.title.replace(/\s*[—–-]\s*by\s.*$/i, '').trim() || 'Cosmos cluster',
    url: canonicalBoardUrl(href),
    expectedCount: count ? parseCount(count[1]!) : null,
  };
}

export const cosmosDescriptor = {
  id: 'cosmos',
  label: 'Cosmos',
  itemNoun: 'element',
  match: matchCosmosCluster,
} as const;

export const cosmosAdapter: SourceAdapter = {
  ...cosmosDescriptor,
  getBoardMeta: (doc) => getCosmosMeta(doc, location.href),
  collectItems(onProgress, signal) {
    return scrollCollect(
      {
        findList: (doc) => doc.querySelector(S.grid),
        listSelector: S.grid,
        cells: (list) => Array.from(list.querySelectorAll(S.tile)),
        readCell: readCosmosTile,
        expectedCount: getCosmosMeta(document, location.href).expectedCount,
      },
      onProgress,
      signal,
    );
  },
};
