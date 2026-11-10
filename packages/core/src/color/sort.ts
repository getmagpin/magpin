/**
 * Color sort (F7) and hue families (F8 color groups).
 *
 * Chromatic images are ordered by OKLCH hue, then by lightness. Low-chroma
 * images (black, white, gray) form their own group at the end, light to dark.
 */
import { type Lab, chroma, oklabToOklch } from './oklab';

/** Below this OKLCH chroma a color reads as black, white or gray. */
export const NEUTRAL_CHROMA = 0.04;

/** Hue bins used by the sort. Lightness alternates direction from bin to bin. */
const HUE_BINS = 16;

export function isNeutral(color: Lab): boolean {
  return chroma(color) < NEUTRAL_CHROMA;
}

/**
 * Sorts items by their dominant color. Items without a color keep their
 * relative order at the very end.
 *
 * - The hue circle is cut at its widest empty gap, so a run of similar hues is
 *   never split between the start and the end.
 * - Within each hue bin, lightness goes light→dark then dark→light in the next
 *   bin (serpentine), which avoids brightness jumps at bin edges.
 */
export function sortByColor<T>(items: readonly T[], colorOf: (item: T) => Lab | null | undefined): T[] {
  const chromatic: { item: T; h: number; L: number }[] = [];
  const neutral: { item: T; L: number }[] = [];
  const unknown: T[] = [];

  for (const item of items) {
    const color = colorOf(item);
    if (!color) unknown.push(item);
    else if (isNeutral(color)) neutral.push({ item, L: color.L });
    else {
      const { h, L } = oklabToOklch(color);
      chromatic.push({ item, h, L });
    }
  }

  const start = hueCut(chromatic.map((entry) => entry.h));
  const binSize = 360 / HUE_BINS;
  const keyed = chromatic.map((entry) => {
    const rotated = (entry.h - start + 360) % 360;
    return { ...entry, rotated, bin: Math.min(HUE_BINS - 1, Math.floor(rotated / binSize)) };
  });
  keyed.sort((x, y) => {
    if (x.bin !== y.bin) return x.bin - y.bin;
    const lightFirst = x.bin % 2 === 0;
    const byLightness = lightFirst ? y.L - x.L : x.L - y.L;
    return byLightness || x.rotated - y.rotated;
  });

  neutral.sort((x, y) => y.L - x.L);
  return [...keyed.map((entry) => entry.item), ...neutral.map((entry) => entry.item), ...unknown];
}

/** Start of the hue circle: the end of the widest gap between hues present. */
export function hueCut(hues: readonly number[]): number {
  if (hues.length < 2) return 0;
  const sorted = [...hues].sort((a, b) => a - b);
  let bestGap = -1;
  let cut = 0;
  for (let i = 0; i < sorted.length; i++) {
    const current = sorted[i]!;
    const next = i + 1 < sorted.length ? sorted[i + 1]! : sorted[0]! + 360;
    const gap = next - current;
    if (gap > bestGap) {
      bestGap = gap;
      cut = next % 360;
    }
  }
  return cut;
}

export type HueFamily = 'red' | 'orange' | 'yellow' | 'green' | 'cyan' | 'blue' | 'purple' | 'pink' | 'neutral';

/** Family order of the "color groups" layout. */
export const HUE_FAMILIES: readonly HueFamily[] = ['red', 'orange', 'yellow', 'green', 'cyan', 'blue', 'purple', 'pink', 'neutral'];

/**
 * OKLCH hue ranges (degrees, start inclusive). Pink wraps around 0°.
 * Calibrated on reference colors: red #FF0000 ≈ 29°, orange #FF7F00 ≈ 53°,
 * yellow #FFDE21 ≈ 98°, green #2E9E4F ≈ 149°, teal ≈ 195°, sky ≈ 227°,
 * blue #0000FF ≈ 264°, indigo ≈ 302°, hot pink ≈ 352°.
 */
const FAMILY_RANGES: readonly [HueFamily, number, number][] = [
  ['pink', 320, 10],
  ['red', 10, 45],
  ['orange', 45, 75],
  ['yellow', 75, 115],
  ['green', 115, 175],
  ['cyan', 175, 235],
  ['blue', 235, 280],
  ['purple', 280, 320],
];

export function hueFamily(color: Lab): HueFamily {
  if (isNeutral(color)) return 'neutral';
  const { h } = oklabToOklch(color);
  for (const [family, from, to] of FAMILY_RANGES) {
    const inRange = from < to ? h >= from && h < to : h >= from || h < to;
    if (inRange) return family;
  }
  return 'red';
}

export interface ColorGroup<T> {
  family: HueFamily;
  items: T[];
}

/** Groups items by hue family, in family order, each group sorted by color. */
export function groupByFamily<T>(items: readonly T[], colorOf: (item: T) => Lab | null | undefined): ColorGroup<T>[] {
  const buckets = new Map<HueFamily, T[]>();
  const unknown: T[] = [];
  for (const item of items) {
    const color = colorOf(item);
    if (!color) {
      unknown.push(item);
      continue;
    }
    const family = hueFamily(color);
    const bucket = buckets.get(family) ?? [];
    bucket.push(item);
    buckets.set(family, bucket);
  }
  const groups = HUE_FAMILIES.flatMap((family) => {
    const bucket = buckets.get(family);
    return bucket ? [{ family, items: sortByColor(bucket, colorOf) }] : [];
  });
  // Images we could not analyze join the neutral row, at its end.
  if (unknown.length > 0) {
    const neutral = groups.find((group) => group.family === 'neutral');
    if (neutral) neutral.items.push(...unknown);
    else groups.push({ family: 'neutral', items: unknown });
  }
  return groups;
}
