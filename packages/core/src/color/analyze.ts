/**
 * Per-image color analysis (F7): the image is reduced to about 64 px by the
 * caller, its pixels are clustered in OKLab (k = 4) and the dominant color is
 * the biggest cluster.
 */
import { type Cluster, kmeans } from './kmeans';
import { type Lab, rgbToOklab } from './oklab';
import { seededRandom } from './random';

export interface ColorAnalysis {
  dominant: Lab;
  clusters: Cluster[];
}

const OPAQUE = 128;

/** Opaque pixels of an RGBA buffer, in OKLab. */
export function rgbaToLab(rgba: ArrayLike<number>): Lab[] {
  const points: Lab[] = [];
  for (let i = 0; i + 3 < rgba.length; i += 4) {
    if (rgba[i + 3]! < OPAQUE) continue;
    points.push(rgbToOklab(rgba[i]!, rgba[i + 1]!, rgba[i + 2]!));
  }
  return points;
}

export function analyzePixels(rgba: ArrayLike<number>, options: { k?: number; seed?: number } = {}): ColorAnalysis | null {
  const points = rgbaToLab(rgba);
  if (points.length === 0) return null;
  const clusters = kmeans(points, options.k ?? 4, { seed: options.seed ?? 7 });
  const dominant = clusters[0]?.center;
  return dominant ? { dominant, clusters } : null;
}

/** A random sample of opaque pixels, used to build the palette of the whole board. */
export function samplePixels(rgba: ArrayLike<number>, count: number, seed = 11): Lab[] {
  const points = rgbaToLab(rgba);
  if (points.length <= count) return points;
  const random = seededRandom(seed);
  return Array.from({ length: count }, () => points[Math.floor(random() * points.length)]!);
}
