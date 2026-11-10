/**
 * Clipboard exchange format between the extension and the Figma plugin.
 *
 * The clipboard holds plain text: the `MAGPIN:` marker followed by a versioned
 * JSON document. Only URLs travel; the plugin downloads the images itself.
 */

export const MAGPIN_PREFIX = 'MAGPIN:';
export const EXCHANGE_VERSION = 1;

export const SOURCE_IDS = ['pinterest', 'arena', 'cosmos', 'savee'] as const;
export type SourceId = (typeof SOURCE_IDS)[number];

export interface ExchangeItem {
  /** Stable id inside its source (pin id, block id…). */
  id: string;
  /** Highest resolution URL available. */
  imageUrl: string;
  /** Smaller URL to try when `imageUrl` cannot be loaded. Optional. */
  fallbackUrl?: string;
  /** Small rendition (~236 px), enough for color analysis and duplicates. Optional. */
  thumbUrl?: string;
  /** Known or estimated pixel size, used for layouts before download. */
  width?: number;
  height?: number;
}

export interface ExchangeBoard {
  source: SourceId;
  title: string;
  url: string;
  items: ExchangeItem[];
}

export interface ExchangePayload {
  magpin: typeof EXCHANGE_VERSION;
  createdAt: string;
  boards: ExchangeBoard[];
}

export type DecodeError =
  | 'not-magpin'
  | 'invalid-json'
  | 'unsupported-version'
  | 'invalid-structure'
  | 'empty';

export type DecodeResult =
  | { ok: true; payload: ExchangePayload; skippedItems: number }
  | { ok: false; error: DecodeError };

export function createPayload(boards: ExchangeBoard[], now: Date = new Date()): ExchangePayload {
  return { magpin: EXCHANGE_VERSION, createdAt: now.toISOString(), boards };
}

export function encodePayload(payload: ExchangePayload): string {
  return MAGPIN_PREFIX + JSON.stringify(payload);
}

/** Quick check used on paste, before parsing anything. */
export function looksLikeMagpin(text: string): boolean {
  return text.trimStart().startsWith(MAGPIN_PREFIX);
}

export function decodePayload(text: string): DecodeResult {
  const trimmed = text.trim();
  if (!trimmed.startsWith(MAGPIN_PREFIX)) return { ok: false, error: 'not-magpin' };

  let raw: unknown;
  try {
    raw = JSON.parse(trimmed.slice(MAGPIN_PREFIX.length));
  } catch {
    return { ok: false, error: 'invalid-json' };
  }

  if (!isRecord(raw)) return { ok: false, error: 'invalid-structure' };
  if (typeof raw.magpin !== 'number') return { ok: false, error: 'invalid-structure' };
  if (raw.magpin > EXCHANGE_VERSION) return { ok: false, error: 'unsupported-version' };
  if (raw.magpin !== EXCHANGE_VERSION) return { ok: false, error: 'invalid-structure' };
  if (!Array.isArray(raw.boards)) return { ok: false, error: 'invalid-structure' };

  let skippedItems = 0;
  const boards: ExchangeBoard[] = [];
  for (const rawBoard of raw.boards) {
    if (!isRecord(rawBoard) || !Array.isArray(rawBoard.items)) {
      return { ok: false, error: 'invalid-structure' };
    }
    const source = isSourceId(rawBoard.source) ? rawBoard.source : null;
    if (!source) return { ok: false, error: 'invalid-structure' };

    const items: ExchangeItem[] = [];
    for (const rawItem of rawBoard.items) {
      const item = parseItem(rawItem);
      if (item) items.push(item);
      else skippedItems++;
    }
    boards.push({
      source,
      title: typeof rawBoard.title === 'string' && rawBoard.title.trim() ? rawBoard.title.trim() : 'Untitled board',
      url: typeof rawBoard.url === 'string' ? rawBoard.url : '',
      items,
    });
  }

  const payload: ExchangePayload = {
    magpin: EXCHANGE_VERSION,
    createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : new Date(0).toISOString(),
    boards,
  };
  if (countItems(payload) === 0) return { ok: false, error: 'empty' };
  return { ok: true, payload, skippedItems };
}

export function countItems(payload: Pick<ExchangePayload, 'boards'>): number {
  return payload.boards.reduce((sum, board) => sum + board.items.length, 0);
}

/** Human title for a moodboard made of one or more boards. */
export function moodboardTitle(boards: Pick<ExchangeBoard, 'title'>[]): string {
  if (boards.length === 0) return 'Untitled';
  if (boards.length === 1) return boards[0]!.title;
  return `${boards[0]!.title} + ${boards.length - 1} more`;
}

function parseItem(value: unknown): ExchangeItem | null {
  if (!isRecord(value)) return null;
  const { id, imageUrl, fallbackUrl, thumbUrl, width, height } = value;
  if (typeof id !== 'string' || id.length === 0) return null;
  if (!isHttpsUrl(imageUrl)) return null;
  const item: ExchangeItem = { id, imageUrl };
  if (isHttpsUrl(fallbackUrl)) item.fallbackUrl = fallbackUrl;
  if (isHttpsUrl(thumbUrl)) item.thumbUrl = thumbUrl;
  if (isPositiveNumber(width) && isPositiveNumber(height)) {
    item.width = width;
    item.height = height;
  }
  return item;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isSourceId(value: unknown): value is SourceId {
  return typeof value === 'string' && (SOURCE_IDS as readonly string[]).includes(value);
}

function isPositiveNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function isHttpsUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}
