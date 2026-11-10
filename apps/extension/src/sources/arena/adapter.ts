/**
 * Are.na adapter.
 *
 * Public channels: the public API v3 (exact block types, originals, sizes):
 *   GET https://api.are.na/v3/channels/{slug}             → title, counts
 *   GET https://api.are.na/v3/channels/{slug}/contents    → blocks, paginated
 *
 * Private channels (new channels are private by default) answer 401 without a
 * token, and Magpin never handles tokens. It then reads the channel page the
 * signed-in user is looking at, like for Cosmos and Savee.
 */
import { canonicalBoardUrl, pathSegments, scrollCollect, textOf } from '../scroll';
import type { BoardMeta, CollectResult, CollectedItem, ItemReading, SourceAdapter } from '../types';
import { emptySkips } from '../types';

export const ARENA_API = 'https://api.are.na/v3';
const PER_PAGE = 100;

/** First path segments that are never a channel owner. */
const RESERVED_ROOTS = new Set([
  'about', 'admin', 'block', 'blocks', 'blog', 'channel', 'community', 'developers', 'editorial', 'explore', 'faq', 'feed',
  'groups', 'log_in', 'login', 'notifications', 'pricing', 'privacy', 'search', 'settings', 'sign_up', 'signup', 'terms', 'tools',
]);
/** Second segments that are profile tabs, not channels. */
const PROFILE_TABS = new Set(['channels', 'blocks', 'followers', 'following', 'groups', 'index', 'table', 'all']);

export function matchArenaChannel(url: string): boolean {
  return arenaChannelSlug(url) !== null;
}

/** `https://www.are.na/{owner}/{channel}` → `{channel}`. */
export function arenaChannelSlug(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'https:' || !/^(www\.)?are\.na$/i.test(parsed.hostname)) return null;
  const segments = pathSegments(parsed);
  if (segments.length !== 2) return null;
  const [owner = '', channel = ''] = segments;
  if (RESERVED_ROOTS.has(owner.toLowerCase()) || PROFILE_TABS.has(channel.toLowerCase())) return null;
  return channel;
}

interface ArenaImage {
  src?: string;
  width?: number;
  height?: number;
  small?: { src?: string };
  medium?: { src?: string };
  large?: { src?: string };
}

interface ArenaBlock {
  id: number;
  type: string;
  title?: string | null;
  image?: ArenaImage | null;
}

/** Turns one API block into an item, a skipped video, or nothing. */
export function readArenaBlock(block: ArenaBlock): ItemReading {
  if (block.type === 'Embed') return { kind: 'skip', reason: 'video', key: String(block.id) };
  if (block.type !== 'Image' || !block.image?.src) return { kind: 'empty' };
  const image = block.image;
  const item: CollectedItem = {
    id: String(block.id),
    imageUrl: image.src!,
    thumbUrl: image.small?.src ?? image.medium?.src ?? image.src!,
  };
  const fallback = image.large?.src ?? image.medium?.src;
  if (fallback) item.fallbackUrl = fallback;
  if (image.width && image.height) {
    item.width = image.width;
    item.height = image.height;
  }
  return { kind: 'image', item, key: String(block.id), order: null };
}

/**
 * The channel's counts take in every block (text, links, other channels), not
 * only images, so they give no total to read up to: `expectedCount` is null.
 */
export function arenaMetaFromChannel(channel: { title?: string }, href: string): BoardMeta {
  return {
    source: 'arena',
    title: channel.title?.trim() || 'Are.na channel',
    url: canonicalBoardUrl(href),
    expectedCount: null,
  };
}

/** The API refused: private channel (or gone). The page may still show it. */
export class ArenaAccessError extends Error {}

async function api<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`${ARENA_API}${path}`, { signal, credentials: 'omit', headers: { Accept: 'application/json' } });
  if (response.status === 401 || response.status === 403 || response.status === 404) {
    throw new ArenaAccessError(`Are.na API answered ${response.status}`);
  }
  if (response.status === 429) throw new Error('Are.na is limiting requests. Wait a minute, then scan again.');
  if (!response.ok) throw new Error(`Are.na answered ${response.status}.`);
  return (await response.json()) as T;
}

// ---------- Page reading (private channels) ----------

/** Every selector of the channel page in one place: update here when it changes. */
export const ARENA_SELECTORS = {
  list: '[data-testid="virtuoso-item-list"]',
  cell: '[data-testid="grid-cell"]',
  blockLink: 'a[href*="/block/"]',
  /** Resized renditions; GIFs are shown straight from the CDN. */
  image: 'img[src*="images.are.na/"], img[src*="d2w9rnfcy7mm78.cloudfront.net/"]',
  /** Badges over the preview: a link icon (Link block), a provider name (Embed), a count. */
  badge: '[data-grid-cell-content] span',
  orderHolder: '[data-index]',
  title: 'h1',
} as const;

const ARENA_CDN = 'https://d2w9rnfcy7mm78.cloudfront.net';

/**
 * images.are.na URLs carry a base64 JSON with the file key and the resize to
 * apply: `{"bucket":"arena_images","key":"29774986/original_….jpg","edits":…}`.
 * The key gives the original on the CDN.
 */
export function decodeArenaImageUrl(src: string): { key: string } | null {
  const match = /images\.are\.na\/([A-Za-z0-9+/=_-]+)/.exec(src);
  if (!match) return null;
  try {
    const base64 = match[1]!.replace(/-/g, '+').replace(/_/g, '/');
    const json = JSON.parse(atob(base64 + '='.repeat((4 - (base64.length % 4)) % 4))) as { key?: unknown };
    return typeof json.key === 'string' && json.key.length > 0 ? { key: json.key } : null;
  } catch {
    return null;
  }
}

/** What the badges over a cell say about its block type. */
export function arenaCellKind(cell: Element): 'image' | 'link' | 'embed' {
  const badges = Array.from(cell.querySelectorAll(ARENA_SELECTORS.badge));
  if (badges.some((badge) => badge.querySelector('svg'))) return 'link';
  // Embeds show their provider ("YouTube", "Vimeo"); images show at most a count.
  if (badges.some((badge) => /[a-z]/i.test(textOf(badge)))) return 'embed';
  return 'image';
}

export function readArenaCell(cell: Element): ItemReading {
  const id = /\/block\/(\d+)/.exec(cell.querySelector(ARENA_SELECTORS.blockLink)?.getAttribute('href') ?? '')?.[1] ?? null;
  const image = cell.querySelector<HTMLImageElement>(ARENA_SELECTORS.image);
  const src = image?.getAttribute('src') ?? '';
  const direct = src.startsWith(`${ARENA_CDN}/`) ? { key: src.slice(ARENA_CDN.length + 1).split('?')[0]! } : null;
  const decoded = direct ?? decodeArenaImageUrl(src);
  if (!id || !image || !decoded) return { kind: 'empty' };
  // Same rule as the API path: Image blocks only, embeds counted as videos.
  const kind = arenaCellKind(cell);
  if (kind === 'embed') return { kind: 'skip', reason: 'video', key: id };
  if (kind === 'link') return { kind: 'empty' };
  const order = Number(cell.closest(ARENA_SELECTORS.orderHolder)?.getAttribute('data-index'));
  // Biggest rendition the page lists, as fallback if the original fails.
  const listed = (image.getAttribute('srcset') ?? '').split(',').map((part) => part.trim().split(/\s+/)[0]).filter(Boolean);
  const item: CollectedItem = {
    id,
    imageUrl: `${ARENA_CDN}/${decoded.key}`,
    fallbackUrl: listed[listed.length - 1] ?? src,
    thumbUrl: src,
  };
  return { kind: 'image', item, key: decoded.key, order: Number.isFinite(order) ? order : null };
}

export function getArenaPageMeta(doc: Document, href: string): BoardMeta {
  const title = textOf(doc.querySelector(ARENA_SELECTORS.title)) || doc.title.replace(/\s*[|–—-]\s*Are\.na\s*$/i, '').trim();
  return {
    source: 'arena',
    title: title || arenaChannelSlug(href) || 'Are.na channel',
    url: canonicalBoardUrl(href),
    // The page's "Length" counts every block too.
    expectedCount: null,
  };
}

function collectFromPage(onProgress: Parameters<SourceAdapter['collectItems']>[0], signal: AbortSignal) {
  return scrollCollect(
    {
      findList: (doc) => doc.querySelector(ARENA_SELECTORS.list),
      listSelector: ARENA_SELECTORS.list,
      cells: (list) => Array.from(list.querySelectorAll(ARENA_SELECTORS.cell)),
      readCell: readArenaCell,
      expectedCount: null,
    },
    onProgress,
    signal,
  );
}

export const arenaDescriptor = {
  id: 'arena',
  label: 'Are.na',
  itemNoun: 'block',
  match: matchArenaChannel,
} as const;

export const arenaAdapter: SourceAdapter = {
  ...arenaDescriptor,

  async getBoardMeta(doc) {
    const slug = arenaChannelSlug(location.href)!;
    try {
      return arenaMetaFromChannel(await api(`/channels/${encodeURIComponent(slug)}`), location.href);
    } catch {
      // Private channel (or API down): what the page shows.
      return getArenaPageMeta(doc, location.href);
    }
  },

  async collectItems(onProgress, signal): Promise<CollectResult> {
    try {
      return await collectFromApi(onProgress, signal);
    } catch (error) {
      if (!(error instanceof ArenaAccessError)) throw error;
      // Private channel: read what the signed-in user sees.
      return collectFromPage(onProgress, signal);
    }
  },
};

async function collectFromApi(onProgress: Parameters<SourceAdapter['collectItems']>[0], signal: AbortSignal): Promise<CollectResult> {
  const slug = encodeURIComponent(arenaChannelSlug(location.href)!);
  const items: CollectedItem[] = [];
  const seen = new Set<string>();
  const skipped = emptySkips();
  for (let page = 1; !signal.aborted; page++) {
    let result: { data: ArenaBlock[]; meta: { has_more_pages?: boolean } };
    try {
      result = await api(`/channels/${slug}/contents?per=${PER_PAGE}&page=${page}`, signal);
    } catch (error) {
      // Stop (or the panel going away) aborts the request in flight: what was
      // read so far is the result, like for the scrolling sources.
      if (signal.aborted) break;
      throw error;
    }
    const fresh: CollectedItem[] = [];
    for (const block of result.data) {
      const reading = readArenaBlock(block);
      if (reading.kind === 'skip') skipped[reading.reason]++;
      if (reading.kind !== 'image' || seen.has(reading.key)) continue;
      seen.add(reading.key);
      fresh.push(reading.item);
    }
    items.push(...fresh);
    onProgress({ newItems: fresh, found: items.length, skipped: { ...skipped } });
    if (!result.meta.has_more_pages) break;
  }
  return { items, skipped };
}
