/**
 * Pinterest image URLs look like https://i.pinimg.com/<size>/<aa>/<bb>/<cc>/<hash>.<ext>
 * where <size> is 236x, 474x, 736x, 1200x, originals… The same <hash> exists in
 * every size, so it is a reliable image key.
 */

const PINIMG = /^https:\/\/i\.pinimg\.com\/([^/]+)\/(.+)$/i;

export interface PinimgUrl {
  size: string;
  /** Everything after the size segment, e.g. `92/c5/74/92c5….jpg`. */
  path: string;
  /** File name without extension. */
  hash: string;
}

export function parsePinimgUrl(url: string): PinimgUrl | null {
  const match = PINIMG.exec(url.split(/[?#]/)[0] ?? '');
  if (!match) return null;
  const [, size = '', path = ''] = match;
  const file = path.split('/').pop() ?? '';
  const hash = file.replace(/\.[a-z0-9]+$/i, '');
  if (!hash) return null;
  return { size, path, hash };
}

export function pinimgUrl(size: string, path: string): string {
  return `https://i.pinimg.com/${size}/${path}`;
}

/** Avatars and other small square crops, e.g. `75x75_RS`, `30x30_RS`. */
export function isAvatarSize(size: string): boolean {
  return /_RS$/i.test(size) || /^\d+x\d+$/i.test(size);
}

/** Thumbnails of video pins live under /videos/thumbnails/. */
export function isVideoThumbnail(url: string): boolean {
  return /i\.pinimg\.com\/videos\//i.test(url);
}

interface SrcsetEntry {
  url: string;
  weight: number;
}

/** Parses `a.jpg 1x, b.jpg 2x` or `a.jpg 236w, b.jpg 736w`. */
export function parseSrcset(srcset: string): SrcsetEntry[] {
  return srcset
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const [url = '', descriptor = '1x'] = part.split(/\s+/);
      const weight = Number.parseFloat(descriptor) || 1;
      return { url, weight };
    })
    .filter((entry) => entry.url.length > 0);
}

export interface ResolvedImage {
  imageUrl: string;
  fallbackUrl: string;
  thumbUrl: string;
  hash: string;
}

/**
 * Picks the best URLs for a pin image: the original when the page lists it,
 * otherwise the original rebuilt from the path, with /736x/ as fallback.
 */
export function resolvePinImage(src: string, srcset: string | null): ResolvedImage | null {
  const candidates = [src, ...parseSrcset(srcset ?? '').map((entry) => entry.url)];
  const parsed = candidates.map((url) => ({ url, info: parsePinimgUrl(url) })).filter((c) => c.info !== null);
  const first = parsed[0];
  if (!first?.info) return null;
  const { path, hash } = first.info;

  const listedOriginal = parsed.find((c) => c.info?.size.toLowerCase() === 'originals');
  return {
    imageUrl: listedOriginal?.url ?? pinimgUrl('originals', path),
    fallbackUrl: pinimgUrl('736x', path),
    thumbUrl: pinimgUrl('236x', path),
    hash,
  };
}
