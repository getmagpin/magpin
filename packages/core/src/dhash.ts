/**
 * Second-level de-duplication (F6, plugin side): a 64-bit difference hash.
 * Two images whose hashes differ by 5 bits or less are the same picture;
 * we keep the bigger one.
 */
import { type Lab, deltaE } from './color/oklab';

export const DHASH_SIZE = { width: 9, height: 8 } as const;
export const DUPLICATE_MAX_BITS = 5;

/** Luminance (0..255) of each pixel of an RGBA buffer. */
export function grayFromRgba(rgba: ArrayLike<number>): number[] {
  const gray: number[] = [];
  for (let i = 0; i + 3 < rgba.length; i += 4) {
    gray.push(0.299 * rgba[i]! + 0.587 * rgba[i + 1]! + 0.114 * rgba[i + 2]!);
  }
  return gray;
}

/**
 * dHash of a 9×8 grayscale grid (row-major): each bit tells whether a pixel
 * is brighter than its right neighbour. Returned as 16 hex characters.
 */
export function dHash(gray: ArrayLike<number>): string {
  const { width, height } = DHASH_SIZE;
  if (gray.length < width * height) throw new Error(`dHash needs ${width * height} values, got ${gray.length}`);
  let hex = '';
  let nibble = 0;
  let bits = 0;
  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width - 1; col++) {
      const left = gray[row * width + col]!;
      const right = gray[row * width + col + 1]!;
      nibble = (nibble << 1) | (left > right ? 1 : 0);
      if (++bits === 4) {
        hex += nibble.toString(16);
        nibble = 0;
        bits = 0;
      }
    }
  }
  return hex;
}

const POPCOUNT = [0, 1, 1, 2, 1, 2, 2, 3, 1, 2, 2, 3, 2, 3, 3, 4];

export function hammingDistance(a: string, b: string): number {
  if (a.length !== b.length) return Number.POSITIVE_INFINITY;
  let distance = 0;
  for (let i = 0; i < a.length; i++) {
    distance += POPCOUNT[Number.parseInt(a[i]!, 16) ^ Number.parseInt(b[i]!, 16)]!;
  }
  return distance;
}

export interface VisualEntry {
  hash: string;
  /** Pixel area: the bigger copy wins. */
  area: number;
  /**
   * Dominant color, when known. Flat images all hash alike (a plain red and a
   * plain blue square both give 000…), so two entries also need close colors.
   */
  color?: Lab | null;
}

/** Colors further apart than this are never duplicates. */
const DUPLICATE_MAX_COLOR_DISTANCE = 0.1;

/** Marks which entries to keep. Bigger images are considered first. */
export function findVisualDuplicates(entries: readonly VisualEntry[], maxBits = DUPLICATE_MAX_BITS): { keep: boolean[]; removed: number } {
  const order = entries.map((_, index) => index).sort((x, y) => entries[y]!.area - entries[x]!.area || x - y);
  const kept: number[] = [];
  const keep = new Array<boolean>(entries.length).fill(false);
  for (const index of order) {
    const entry = entries[index]!;
    const duplicate = kept.some((other) => {
      const candidate = entries[other]!;
      if (hammingDistance(entry.hash, candidate.hash) > maxBits) return false;
      if (entry.color && candidate.color && deltaE(entry.color, candidate.color) > DUPLICATE_MAX_COLOR_DISTANCE) return false;
      return true;
    });
    if (!duplicate) {
      kept.push(index);
      keep[index] = true;
    }
  }
  return { keep, removed: entries.length - kept.length };
}
