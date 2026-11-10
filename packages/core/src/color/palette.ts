/**
 * Board palette (F9): k-means over a sample of the pixels of every image.
 * Colors closer than a ΔE OK threshold are merged, then ranked by weight.
 */
import { kmeans } from './kmeans';
import { nameColors } from './names';
import { type Lab, type Rgb, deltaE, mixLab, oklabToRgb, rgbToHex } from './oklab';

export interface PaletteColor {
  name: string;
  hex: string;
  rgb: Rgb;
  lab: Lab;
  /** Share of the sampled pixels, 0..1. */
  weight: number;
}

export const PALETTE_LIMITS = { min: 3, max: 8, default: 6 } as const;

export interface PaletteOptions {
  count?: number;
  /** Colors closer than this (ΔE OK) are merged. */
  mergeDistance?: number;
  seed?: number;
}

export function buildPalette(samples: readonly Lab[], options: PaletteOptions = {}): PaletteColor[] {
  if (samples.length === 0) return [];
  const count = Math.min(PALETTE_LIMITS.max, Math.max(PALETTE_LIMITS.min, Math.round(options.count ?? PALETTE_LIMITS.default)));
  const mergeDistance = options.mergeDistance ?? 0.07;

  // Over-segment, then merge near-identical clusters.
  let clusters = kmeans(samples, count + 4, { seed: options.seed ?? 3 }).map((cluster) => ({ lab: cluster.center, weight: cluster.count }));
  clusters = mergeClose(clusters, mergeDistance);
  clusters.sort((x, y) => y.weight - x.weight);

  // Weight decides which colors make it; the display order is a smooth gradient.
  const top = orderPalette(clusters.slice(0, count));
  const total = samples.length;
  const names = nameColors(top.map((cluster) => cluster.lab));
  return top.map((cluster, i) => {
    const rgb = oklabToRgb(cluster.lab);
    return { name: names[i]!, hex: rgbToHex(rgb), rgb, lab: cluster.lab, weight: cluster.weight / total };
  });
}

/**
 * Display order of a palette: the smoothest path through the colors, starting
 * from the lightest. A neutral palette comes out light to dark; a colorful one
 * keeps neighbouring hues and tones together, with no harsh jump. Exact search
 * (palettes have at most 8 colors, so at most 7! paths).
 */
export function orderPalette<T extends { lab: Lab }>(colors: readonly T[]): T[] {
  if (colors.length <= 2) return [...colors].sort((x, y) => y.lab.L - x.lab.L);
  const start = colors.reduce((best, color, i) => (color.lab.L > colors[best]!.lab.L ? i : best), 0);
  const distance = colors.map((a) => colors.map((b) => deltaE(a.lab, b.lab)));

  let bestPath: number[] = [];
  let bestCost = Number.POSITIVE_INFINITY;
  const path = [start];
  const used = new Set([start]);
  const visit = (cost: number) => {
    if (cost >= bestCost) return;
    if (path.length === colors.length) {
      bestCost = cost;
      bestPath = [...path];
      return;
    }
    const last = path[path.length - 1]!;
    for (let next = 0; next < colors.length; next++) {
      if (used.has(next)) continue;
      used.add(next);
      path.push(next);
      visit(cost + distance[last]![next]!);
      path.pop();
      used.delete(next);
    }
  };
  visit(0);
  return bestPath.map((i) => colors[i]!);
}

function mergeClose(clusters: { lab: Lab; weight: number }[], distance: number) {
  const result = [...clusters];
  let merged = true;
  while (merged) {
    merged = false;
    outer: for (let i = 0; i < result.length; i++) {
      for (let j = i + 1; j < result.length; j++) {
        const a = result[i]!;
        const b = result[j]!;
        if (deltaE(a.lab, b.lab) < distance) {
          result[i] = { lab: mixLab([a.lab, b.lab], [a.weight, b.weight]), weight: a.weight + b.weight };
          result.splice(j, 1);
          merged = true;
          break outer;
        }
      }
    }
  }
  return result;
}
