/**
 * Builds a moodboard in three steps:
 *
 * 1. Load: a few images at a time, each registered as a Figma image (hash +
 *    size) and analysed (dominant color, palette sample, dHash).
 * 2. Arrange: duplicates, color sort, layout, palette (pure, see arrange.ts).
 * 3. Place: one build request; the main thread places everything in batches.
 *
 * Stopping while loading keeps what is loaded; while placing, keeps what is placed.
 */
import type { PaletteColor, SourceId } from '@magpin/core';
import type { BuildPaletteColor, MainToUi, Registered, Settings, UiToMain, VariablesMode } from '../shared/messages';
import { type Analysis, analyzeBytes } from './analysis';
import { type Entry, arrange } from './arrange';
import { onMainMessage, postToMain } from './bridge';
import { resetBlockedHosts } from './images';
import type { Prepared } from './sources';

const CONCURRENCY = 6;
/** One image that takes longer than this (download + Figma) is skipped as failed. */
const IMAGE_TIMEOUT = 30_000;

export type BuildPhase = 'loading' | 'arranging' | 'placing';

export interface BuildProgress {
  phase: BuildPhase;
  done: number;
  total: number;
  failed: number;
}

export interface BuildResult {
  placed: number;
  failed: number;
  /** First level (same id or URL) plus second level (same picture). */
  duplicates: number;
  cancelled: boolean;
  /** Images neither the plugin window nor Figma could download. */
  blockedByCdn: number;
  /** Palette of each board, in board order. */
  palettes: { title: string; source: SourceId | null; colors: PaletteColor[] }[];
  variables: { collectionName: string; count: number } | null;
  /** Placing failed on the canvas (Figma's message); what got placed stays. */
  error: string | null;
}

export interface BuildOptions {
  settings: Settings;
  variables: VariablesMode;
  collectionName: string;
}

export async function buildMoodboard(
  prepared: Prepared,
  options: BuildOptions,
  onProgress: (progress: BuildProgress) => void,
  signal: AbortSignal,
): Promise<BuildResult> {
  const total = prepared.jobs.length;
  const pending = new Map<number, (result: Registered) => void>();
  let onPlaced: (done: number, total: number) => void = () => undefined;
  let resolveBuilt: (message: Extract<MainToUi, { type: 'built' }>) => void = () => undefined;
  const built = new Promise<Extract<MainToUi, { type: 'built' }>>((resolve) => (resolveBuilt = resolve));
  // A host that refused the plugin window last time may answer now.
  resetBlockedHosts();

  const stopListening = onMainMessage((message) => {
    if (message.type === 'registered') pending.get(message.index)?.(message.result);
    else if (message.type === 'build-progress') onPlaced(message.done, message.total);
    else if (message.type === 'built') resolveBuilt(message);
  });

  /** Hands an image to the main thread; gives up (not registered) when `imageSignal` aborts. */
  const register = (index: number, message: UiToMain, imageSignal: AbortSignal) =>
    new Promise<Registered>((resolve) => {
      if (imageSignal.aborted) return resolve({ ok: false });
      const settle = (result: Registered) => {
        pending.delete(index);
        imageSignal.removeEventListener('abort', onAbort);
        resolve(result);
      };
      const onAbort = () => settle({ ok: false });
      imageSignal.addEventListener('abort', onAbort, { once: true });
      pending.set(index, settle);
      postToMain(message);
    });

  try {
    // 1. Load and analyse.
    const entries: (Entry | null)[] = new Array(total).fill(null);
    let done = 0;
    let failed = 0;
    let blockedByCdn = 0;
    onProgress({ phase: 'loading', done, total, failed });

    let next = 0;
    const worker = async () => {
      while (!signal.aborted) {
        const index = next++;
        const job = prepared.jobs[index];
        if (!job) return;
        const image = imageSignal(signal, IMAGE_TIMEOUT);
        try {
          const loaded = await job.load(image.signal);
          if (signal.aborted) return;
          let result: Registered = { ok: false };
          let analysis: Analysis | null = null;
          if (loaded.kind === 'bytes') {
            [result, analysis] = await Promise.all([
              register(index, { type: 'register-bytes', index, bytes: loaded.bytes }, image.signal),
              analyzeBytes(loaded.bytes),
            ]);
          } else if (loaded.kind === 'urls') {
            result = await register(index, { type: 'register-urls', index, urls: loaded.urls, thumbUrl: loaded.thumbUrl }, image.signal);
            if (result.ok && result.thumbBytes) analysis = await analyzeBytes(result.thumbBytes);
            // Figma said no (not a timeout): the CDN refuses both paths.
            if (!result.ok && !image.signal.aborted) blockedByCdn++;
          }
          if (signal.aborted) return;
          if (result.ok) entries[index] = { board: job.board, sourceId: job.sourceId, hash: result.hash, width: result.width, height: result.height, analysis };
        } catch {
          if (signal.aborted) return;
        } finally {
          image.dispose();
        }
        done++;
        if (!entries[index]) failed++;
        onProgress({ phase: 'loading', done, total, failed });
      }
    };
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, total) }, worker));
    const cancelledWhileLoading = signal.aborted;

    // 2. Arrange. It runs in one go: let "Arranging" show first.
    onProgress({ phase: 'arranging', done, total, failed });
    await nextPaint();
    const loaded = entries.filter((entry): entry is Entry => entry !== null);
    const arrangement = arrange(loaded, options.settings, prepared.boards);
    const duplicates = prepared.duplicates + arrangement.duplicates;
    const palettes = arrangement.blocks.filter((block) => block.palette.length > 0).map((block) => ({ title: block.title, source: block.source, colors: block.palette }));
    const base = { failed, duplicates, blockedByCdn, palettes };
    const itemCount = arrangement.blocks.reduce((sum, block) => sum + block.items.length, 0);
    if (itemCount === 0) return { ...base, placed: 0, cancelled: signal.aborted, variables: null, error: null };

    // 3. Place. Stopped while loading: what loaded is placed in full.
    onPlaced = (placedCount, placedTotal) => onProgress({ phase: 'placing', done: placedCount, total: placedTotal, failed });
    onProgress({ phase: 'placing', done: 0, total: itemCount, failed });
    const cancel = () => postToMain({ type: 'cancel-build' });
    if (!cancelledWhileLoading) signal.addEventListener('abort', cancel, { once: true });
    postToMain({
      type: 'build',
      request: {
        title: prepared.title,
        blocks: arrangement.blocks.map((block) => ({ ...block, palette: block.palette.map(toFigmaColor) })),
        variables: options.variables,
        collectionName: options.collectionName,
      },
    });
    const result = await built;
    signal.removeEventListener('abort', cancel);
    return { ...base, placed: result.placed, cancelled: signal.aborted, variables: result.variables, error: result.error ?? null };
  } finally {
    stopListening();
  }
}

/** Aborts with the build, or after `timeout` ms for this one image. */
function imageSignal(build: AbortSignal, timeout: number): { signal: AbortSignal; dispose: () => void } {
  const controller = new AbortController();
  const abort = () => controller.abort();
  const timer = setTimeout(abort, timeout);
  build.addEventListener('abort', abort, { once: true });
  if (build.aborted) abort();
  return {
    signal: controller.signal,
    dispose: () => {
      clearTimeout(timer);
      build.removeEventListener('abort', abort);
    },
  };
}

/** Resolves once the browser had a chance to paint (or soon anyway, if the window is hidden). */
function nextPaint(): Promise<void> {
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(fallback);
      resolve();
    };
    const fallback = setTimeout(done, 100);
    requestAnimationFrame(() => setTimeout(done, 0));
  });
}

function toFigmaColor(color: PaletteColor): BuildPaletteColor {
  return { name: color.name, hex: color.hex, rgb: { r: color.rgb.r / 255, g: color.rgb.g / 255, b: color.rgb.b / 255 } };
}
