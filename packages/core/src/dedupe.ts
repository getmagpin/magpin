/**
 * First-level de-duplication (F6, extension side): by id and by normalized URL.
 * The visual (dHash) level lives in the plugin and comes in phase 2.
 */

/** Lowercases the host and drops query string and fragment. */
export function normalizeImageUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.protocol}//${parsed.host.toLowerCase()}${parsed.pathname}`;
  } catch {
    return url.trim();
  }
}

export interface Dedupable {
  id: string;
  imageUrl: string;
}

/**
 * Keeps the first occurrence of each item. Two items are duplicates when they
 * share an id or a normalized image URL. `keyOf` lets a source add its own key
 * (for example the Pinterest image hash, identical across sizes).
 */
export function dedupeItems<T extends Dedupable>(items: readonly T[], keyOf?: (item: T) => string | null): T[] {
  const seen = new Set<string>();
  const result: T[] = [];
  for (const item of items) {
    const keys = [`id:${item.id}`, `url:${normalizeImageUrl(item.imageUrl)}`];
    const extra = keyOf?.(item);
    if (extra) keys.push(`key:${extra}`);
    if (keys.some((key) => seen.has(key))) continue;
    keys.forEach((key) => seen.add(key));
    result.push(item);
  }
  return result;
}
