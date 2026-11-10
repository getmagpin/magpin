/**
 * Pure DOM readers for Pinterest board pages. No scrolling, no timers:
 * everything here is covered by tests on recorded HTML.
 */
import { ListLock, canonicalBoardUrl, parseCount, textOf } from '../scroll';
import type { BoardMeta, CollectedItem, ItemReading } from '../types';
import { matchPinterestBoard } from './match';
import { PINTEREST_SELECTORS as S } from './selectors';
import { isAvatarSize, isVideoThumbnail, parsePinimgUrl, resolvePinImage } from './urls';

/** Width of the /736x/ rendition, used to turn an aspect ratio into a size. */
const REFERENCE_WIDTH = 736;

export type GridItemReading = ItemReading;

/**
 * The list that holds the board's own pins: the one containing the first cell.
 *
 * Only reliable at the top of the page. Below the board, Pinterest renders a
 * second list ("More like this") and virtualizes the board list, which can then
 * hold no cell at all. The collector therefore locks the list found here
 * before scrolling (see `BoardListLock`).
 */
export function findBoardList(root: ParentNode): Element | null {
  const firstItem = root.querySelector(S.gridItem);
  if (!firstItem) return null;
  return firstItem.closest(S.gridList) ?? firstItem.parentElement;
}

/** Cells of `list` itself, ignoring nested or sibling grids. */
export function boardGridItems(root: ParentNode, list: Element | null = findBoardList(root)): Element[] {
  if (!list) return [];
  return Array.from(list.querySelectorAll(S.gridItem)).filter((cell) => (cell.closest(S.gridList) ?? cell.parentElement) === list);
}

/** The Pinterest board list, held while scrolling (see `ListLock`). */
export class BoardListLock extends ListLock {
  constructor(doc: Document) {
    super(doc, { findList: findBoardList, listSelector: S.gridList });
  }
}

export function readGridItem(cell: Element): GridItemReading {
  const image = pickPinImage(cell);
  const link = cell.querySelector<HTMLAnchorElement>(S.pinLink);
  const pinId = link ? extractPinId(link.getAttribute('href') ?? '') : null;

  if (cell.querySelector(S.sponsored)) {
    const key = pinId ?? image?.getAttribute('src') ?? `order-${readOrder(cell) ?? 'unknown'}`;
    return { kind: 'skip', reason: 'sponsored', key };
  }
  if (!image) return { kind: 'empty' };

  const src = image.getAttribute('src') ?? '';
  if (cell.querySelector(S.video) || isVideoThumbnail(src)) {
    return { kind: 'skip', reason: 'video', key: pinId ?? src };
  }

  const resolved = resolvePinImage(src, image.getAttribute('srcset'));
  if (!resolved) return { kind: 'empty' };

  const ratio = readAspectRatio(cell);
  const item: CollectedItem = {
    id: pinId ?? `img-${resolved.hash}`,
    imageUrl: resolved.imageUrl,
    fallbackUrl: resolved.fallbackUrl,
    thumbUrl: resolved.thumbUrl,
  };
  if (ratio) {
    item.width = REFERENCE_WIDTH;
    item.height = Math.round(REFERENCE_WIDTH * ratio);
  }
  return { kind: 'image', item, key: resolved.hash, order: readOrder(cell) };
}

export function getPinterestBoardMeta(doc: Document, href: string): BoardMeta {
  const title = readBoardTitle(doc);
  // Signed in, the canonical link can point to the home page, and after an
  // in-page navigation it can still be the previous board's: trust it only
  // when it is this board (same path), otherwise use the address of the tab.
  const canonicalHref = doc.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.getAttribute('href');
  const canonical = canonicalHref ? absoluteUrl(canonicalHref, href) : null;
  return {
    source: 'pinterest',
    title,
    url: canonicalBoardUrl(canonical && matchPinterestBoard(canonical) && samePath(canonical, href) ? canonical : href),
    expectedCount: parsePinCount(textOf(doc.querySelector(S.pinCount))),
  };
}

/**
 * Board name, by priority. Selectors are tried one at a time: a comma list
 * would return the first match in document order, and signed-in pages start
 * with a hidden <h1>Pinterest</h1>.
 */
export function readBoardTitle(doc: Document): string {
  for (const selector of S.boardTitle) {
    const text = cleanTitle(textOf(doc.querySelector(selector)));
    if (text && !isGenericTitle(text)) return text;
  }
  for (const heading of Array.from(doc.querySelectorAll('h1'))) {
    const text = cleanTitle(textOf(heading));
    if (text && !isGenericTitle(text)) return text;
  }
  const fromPageTitle = cleanTitle(doc.title.replace(/\s*[|\-–—]\s*Pinterest\s*$/i, ''));
  if (fromPageTitle && !isGenericTitle(fromPageTitle)) return fromPageTitle;
  return 'Pinterest board';
}

/** Drops the unread counter Pinterest puts in front of titles: "(20) Lamp" → "Lamp". */
function cleanTitle(text: string): string {
  return text.replace(/^\(\d+\+?\)\s*/, '').trim();
}

function isGenericTitle(text: string): boolean {
  return /^pinterest$/i.test(text.trim());
}

/**
 * "41 Épingles", "1,234 Pins", "1 234 Pins", "1.234 Pins" → exact count.
 * Abbreviated counts ("1.2k Pins") are approximate, so they return null.
 */
export function parsePinCount(text: string): number | null {
  return parseCount(text);
}

export function extractPinId(href: string): string | null {
  const match = /\/pin\/([\w-]+)/.exec(href);
  return match?.[1] ?? null;
}

function pickPinImage(cell: Element): HTMLImageElement | null {
  const images = Array.from(cell.querySelectorAll<HTMLImageElement>(S.pinImage));
  return (
    images.find((img) => {
      const info = parsePinimgUrl(img.getAttribute('src') ?? '');
      return info !== null && !isAvatarSize(info.size);
    }) ?? null
  );
}

function readAspectRatio(cell: Element): number | null {
  for (const box of Array.from(cell.querySelectorAll<HTMLElement>(S.aspectBox))) {
    const value = /padding-bottom:\s*([\d.]+)%/.exec(box.getAttribute('style') ?? '')?.[1];
    const ratio = value ? Number.parseFloat(value) / 100 : Number.NaN;
    if (Number.isFinite(ratio) && ratio > 0.05 && ratio < 20) return ratio;
  }
  return null;
}

function readOrder(cell: Element): number | null {
  const holder = cell.hasAttribute(S.gridItemIndexAttr) ? cell : cell.querySelector(`[${S.gridItemIndexAttr}]`);
  const value = holder?.getAttribute(S.gridItemIndexAttr);
  const order = value ? Number.parseInt(value, 10) : Number.NaN;
  return Number.isFinite(order) ? order : null;
}

function samePath(a: string, b: string): boolean {
  const path = (url: string) => new URL(url).pathname.replace(/\/+$/, '').toLowerCase();
  try {
    return path(a) === path(b);
  } catch {
    return false;
  }
}

function absoluteUrl(url: string, base: string): string | null {
  try {
    return new URL(url, base).href;
  } catch {
    return null;
  }
}

