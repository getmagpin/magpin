/**
 * Savee adapter (savee.com). Board pages load items as you scroll; the shared
 * collector scrolls and reads them. Image URLs encode the size:
 * `dm.savee-cdn.com/asset-image/w420/{id}.avif` → original at
 * `asset-image/original/{id}.jpg`. Videos live under `asset-video/`.
 */
import { canonicalBoardUrl, pathSegments, scrollCollect, textOf } from '../scroll';
import type { BoardMeta, CollectedItem, ItemReading, SourceAdapter } from '../types';

/** Every Savee selector in one place: update here when the markup changes. */
export const SAVEE_SELECTORS = {
  list: 'main',
  item: '[id^="grid-item-"]',
  image: 'img[src*="savee-cdn.com/asset-"]',
  title: 'h1',
} as const;

const S = SAVEE_SELECTORS;
const ASSET = /^https:\/\/([a-z0-9-]+\.savee-cdn\.com)\/(asset-image|asset-video|asset-gif)\/[^/]+\/([0-9a-z]+)\.[a-z0-9]+/i;

/** `https://savee.com/{user}/boards/{board}/`. */
export function matchSaveeBoard(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'https:' || !/^(www\.)?savee\.com$/i.test(parsed.hostname)) return false;
  const segments = pathSegments(parsed);
  return segments.length === 3 && segments[1]!.toLowerCase() === 'boards';
}

export function parseSaveeAsset(src: string): { host: string; kind: string; id: string } | null {
  const match = ASSET.exec(src);
  return match ? { host: match[1]!.toLowerCase(), kind: match[2]!.toLowerCase(), id: match[3]! } : null;
}

export function saveeUrls(host: string, id: string) {
  const base = `https://${host}/asset-image`;
  return { imageUrl: `${base}/original/${id}.jpg`, fallbackUrl: `${base}/original/${id}.avif`, thumbUrl: `${base}/w420/${id}.jpg` };
}

export function readSaveeItem(cell: Element): ItemReading {
  const code = cell.id.replace(/^grid-item-/, '') || null;
  const image = cell.querySelector<HTMLImageElement>(S.image);
  const asset = parseSaveeAsset(image?.getAttribute('src') ?? '');
  if (!asset) return { kind: 'empty' };
  if (asset.kind === 'asset-video') return { kind: 'skip', reason: 'video', key: code ?? asset.id };
  const item: CollectedItem = { id: code ?? asset.id, ...saveeUrls(asset.host, asset.id) };
  return { kind: 'image', item, key: asset.id, order: null };
}

export function getSaveeMeta(doc: Document, href: string): BoardMeta {
  return {
    source: 'savee',
    title: textOf(doc.querySelector(S.title)) || doc.title.replace(/\s*[–—-]\s*board by.*$/i, '').trim() || 'Savee board',
    url: canonicalBoardUrl(href),
    expectedCount: null,
  };
}

export const saveeDescriptor = {
  id: 'savee',
  label: 'Savee',
  itemNoun: 'item',
  match: matchSaveeBoard,
} as const;

export const saveeAdapter: SourceAdapter = {
  ...saveeDescriptor,
  getBoardMeta: (doc) => getSaveeMeta(doc, location.href),
  collectItems(onProgress, signal) {
    return scrollCollect(
      {
        findList: (doc) => doc.querySelector(S.list) ?? doc.body,
        listSelector: S.list,
        cells: (list) => Array.from(list.querySelectorAll(S.item)),
        readCell: readSaveeItem,
        expectedCount: null,
      },
      onProgress,
      signal,
    );
  },
};
