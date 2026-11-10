/**
 * File and folder naming for the ZIP export (F5):
 * one folder per board, files named `<index>-<id>.<ext>`.
 */

const FORBIDDEN = /[<>:"/\\|?*\u0000-\u001f\u007f]/g;
const MAX_NAME_LENGTH = 80;

/** Safe on macOS, Windows and Linux, and accepted by chrome.downloads. */
export function sanitizeFileName(name: string, fallback = 'board'): string {
  const cleaned = name
    .normalize('NFC')
    .replace(FORBIDDEN, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+|\.+$/g, '')
    .trim()
    .slice(0, MAX_NAME_LENGTH)
    .trim();
  return cleaned.length > 0 ? cleaned : fallback;
}

/** Gives every board a distinct folder name: "Board", "Board (2)"… */
export function uniqueFolderNames(titles: readonly string[]): string[] {
  const used = new Map<string, number>();
  return titles.map((title) => {
    const base = sanitizeFileName(title);
    const key = base.toLowerCase();
    const count = (used.get(key) ?? 0) + 1;
    used.set(key, count);
    return count === 1 ? base : `${base} (${count})`;
  });
}

/**
 * Layer name of the image at `index` in a moodboard of `total` images:
 * "01"…"14", "001"…"170". 1-based, padded so layers sort in board order.
 */
export function layerNumber(index: number, total: number, minWidth = 2): string {
  const width = Math.max(minWidth, String(Math.max(total, 1)).length);
  return String(index + 1).padStart(width, '0');
}

/** `007-123456.jpg`. The index is 1-based and padded so files sort in board order. */
export function zipEntryName(index: number, total: number, id: string, ext: string): string {
  const width = String(Math.max(total, 1)).length;
  const position = String(index + 1).padStart(width, '0');
  return `${position}-${sanitizeFileName(id, 'image')}.${ext}`;
}

const EXT_BY_TYPE: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/avif': 'avif',
};

/** File extension from the response content type, then from the URL path. */
export function imageExtension(contentType: string | null, url: string): string {
  const type = contentType?.split(';')[0]?.trim().toLowerCase();
  if (type && EXT_BY_TYPE[type]) return EXT_BY_TYPE[type];
  try {
    const match = /\.([a-z0-9]{3,4})$/i.exec(new URL(url).pathname);
    const ext = match?.[1]?.toLowerCase();
    if (ext === 'jpeg') return 'jpg';
    if (ext && Object.values(EXT_BY_TYPE).includes(ext)) return ext;
  } catch {
    // fall through
  }
  return 'jpg';
}

export function zipFileName(titles: readonly string[]): string {
  if (titles.length === 1) return `Magpin - ${sanitizeFileName(titles[0]!)}.zip`;
  return `Magpin - ${titles.length} boards.zip`;
}
