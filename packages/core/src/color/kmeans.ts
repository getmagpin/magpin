/**
 * k-means in OKLab with k-means++ seeding. Deterministic for a given seed.
 */
import { type Lab, deltaE } from './oklab';
import { seededRandom } from './random';

export interface Cluster {
  center: Lab;
  /** Number of points assigned to the cluster. */
  count: number;
}

export interface KMeansOptions {
  seed?: number;
  maxIterations?: number;
}

/** Clusters sorted by size, biggest first. Empty clusters are dropped. */
export function kmeans(points: readonly Lab[], k: number, options: KMeansOptions = {}): Cluster[] {
  const n = points.length;
  if (n === 0 || k < 1) return [];
  const random = seededRandom(options.seed ?? 1);
  const maxIterations = options.maxIterations ?? 16;
  const centers = seedCenters(points, Math.min(k, n), random);
  const assignment = new Int32Array(n).fill(-1);

  for (let iteration = 0; iteration < maxIterations; iteration++) {
    let changed = false;
    for (let i = 0; i < n; i++) {
      const nearest = nearestCenter(points[i]!, centers);
      if (assignment[i] !== nearest) {
        assignment[i] = nearest;
        changed = true;
      }
    }
    if (!changed && iteration > 0) break;

    const sums = centers.map(() => ({ L: 0, a: 0, b: 0, count: 0 }));
    for (let i = 0; i < n; i++) {
      const sum = sums[assignment[i]!]!;
      const point = points[i]!;
      sum.L += point.L;
      sum.a += point.a;
      sum.b += point.b;
      sum.count++;
    }
    sums.forEach((sum, c) => {
      if (sum.count > 0) centers[c] = { L: sum.L / sum.count, a: sum.a / sum.count, b: sum.b / sum.count };
    });
  }

  const counts = new Array<number>(centers.length).fill(0);
  for (let i = 0; i < n; i++) counts[assignment[i]!]!++;
  return centers
    .map((center, c) => ({ center, count: counts[c]! }))
    .filter((cluster) => cluster.count > 0)
    .sort((x, y) => y.count - x.count);
}

function nearestCenter(point: Lab, centers: readonly Lab[]): number {
  let best = 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let c = 0; c < centers.length; c++) {
    const center = centers[c]!;
    const dL = point.L - center.L;
    const da = point.a - center.a;
    const db = point.b - center.b;
    const distance = dL * dL + da * da + db * db;
    if (distance < bestDistance) {
      bestDistance = distance;
      best = c;
    }
  }
  return best;
}

/** k-means++: each new center is drawn proportionally to its squared distance. */
function seedCenters(points: readonly Lab[], k: number, random: () => number): Lab[] {
  const centers: Lab[] = [points[Math.floor(random() * points.length)]!];
  const distances = points.map((point) => deltaE(point, centers[0]!) ** 2);
  while (centers.length < k) {
    const total = distances.reduce((sum, d) => sum + d, 0);
    if (total === 0) break; // every remaining point equals a center
    let target = random() * total;
    let index = 0;
    for (; index < distances.length - 1; index++) {
      target -= distances[index]!;
      if (target <= 0) break;
    }
    const center = points[index]!;
    centers.push(center);
    points.forEach((point, i) => {
      distances[i] = Math.min(distances[i]!, deltaE(point, center) ** 2);
    });
  }
  return centers;
}
