/**
 * Image preparation in the UI iframe, which has fetch and canvas.
 *
 * Figma accepts PNG, JPEG and GIF up to 4096 px per side. Anything else
 * (WebP, AVIF, oversized images) is redrawn on a canvas first.
 *
 * The iframe has a `null` origin, so it can only read CDNs that answer with
 * `Access-Control-Allow-Origin: *`. When a host refuses, we hand the URL to
 * the main thread, which asks Figma to fetch it (figma.createImageAsync).
 */

export const FIGMA_MAX_SIDE = 4096;

export type ImageKind = 'png' | 'jpeg' | 'gif' | 'webp' | 'avif' | 'bmp' | null;

/** Detects the format from the first bytes (content types can lie). */
export function sniffImageType(bytes: Uint8Array): ImageKind {
  const b = bytes;
  if (b.length < 12) return null;
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'png';
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpeg';
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38) return 'gif';
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'webp';
  if (b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70) {
    const brand = String.fromCharCode(b[8]!, b[9]!, b[10]!, b[11]!);
    if (brand === 'avif' || brand === 'avis') return 'avif';
  }
  if (b[0] === 0x42 && b[1] === 0x4d) return 'bmp';
  return null;
}

export function isFigmaNative(kind: ImageKind): kind is 'png' | 'jpeg' | 'gif' {
  return kind === 'png' || kind === 'jpeg' || kind === 'gif';
}

/** Scale factor that brings the longest side under Figma's limit. */
export function fitScale(width: number, height: number, max = FIGMA_MAX_SIDE): number {
  const longest = Math.max(width, height);
  return longest > max ? max / longest : 1;
}

/**
 * Returns bytes Figma can take as-is, or redraws the image. Returns null when
 * the browser cannot decode it.
 */
export async function prepareForFigma(bytes: Uint8Array): Promise<Uint8Array | null> {
  const kind = sniffImageType(bytes);
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(new Blob([bytes as BlobPart]));
  } catch {
    return null;
  }
  try {
    const scale = fitScale(bitmap.width, bitmap.height);
    if (isFigmaNative(kind) && scale === 1) return bytes;

    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) return null;
    context.imageSmoothingQuality = 'high';
    context.drawImage(bitmap, 0, 0, width, height);
    // Keep transparency for PNG-like sources; photos go to JPEG.
    const type = kind === 'png' || kind === 'gif' || kind === 'webp' ? 'image/png' : 'image/jpeg';
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, 0.92));
    return blob ? new Uint8Array(await blob.arrayBuffer()) : null;
  } finally {
    bitmap.close();
  }
}

export type Loaded = { kind: 'bytes'; bytes: Uint8Array } | { kind: 'urls'; urls: string[]; thumbUrl: string | null } | { kind: 'failed' };

/**
 * Hosts whose CDN refused the iframe (CORS) during this build: skip straight
 * to Figma's own fetch. Cleared at the start of each build.
 */
const blockedHosts = new Set<string>();
const probes = new Map<string, Promise<void>>();

export function resetBlockedHosts(): void {
  blockedHosts.clear();
  probes.clear();
}

/** `thumbUrl` travels with URLs handed to Figma: the main thread sends it back for color analysis. */
export async function loadFromUrls(urls: readonly string[], signal: AbortSignal, thumbUrl: string | null = null): Promise<Loaded> {
  const forFigma: string[] = [];
  for (const url of urls) {
    const host = hostOf(url);
    if (blockedHosts.has(host)) {
      forFigma.push(url);
      continue;
    }
    let response: Response;
    try {
      response = await fetch(url, { signal, credentials: 'omit', referrerPolicy: 'no-referrer' });
    } catch (error) {
      if (signal.aborted) throw error;
      // No readable answer: refused by CORS, or the network failed. Let Figma
      // try; skip the iframe for this host only if it really is a refusal.
      noteRefusal(host, url);
      forFigma.push(url);
      continue;
    }
    if (!response.ok) continue; // 403/404: try the next rendition
    try {
      const prepared = await prepareForFigma(new Uint8Array(await response.arrayBuffer()));
      if (prepared) return { kind: 'bytes', bytes: prepared };
    } catch (error) {
      if (signal.aborted) throw error;
      // Cut off halfway: Figma may still get it.
      forFigma.push(url);
    }
  }
  return forFigma.length > 0 ? { kind: 'urls', urls: forFigma, thumbUrl } : { kind: 'failed' };
}

/**
 * A fetch that failed could be CORS or the network. Online, an opaque answer
 * to the same URL without CORS means the host is up and refuses the iframe.
 */
function noteRefusal(host: string, url: string): void {
  if (!navigator.onLine || blockedHosts.has(host) || probes.has(host)) return;
  const probe = fetch(url, { method: 'HEAD', mode: 'no-cors', credentials: 'omit', referrerPolicy: 'no-referrer' })
    .then((response) => {
      if (response.type === 'opaque') blockedHosts.add(host);
    })
    .catch(() => undefined)
    .finally(() => probes.delete(host));
  probes.set(host, probe);
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}
