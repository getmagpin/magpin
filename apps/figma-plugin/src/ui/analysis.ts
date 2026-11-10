/**
 * Color and duplicate analysis of one image, in the UI iframe (it has canvas).
 * The image is decoded straight to ~64 px, which keeps it fast on big boards.
 */
import { DHASH_SIZE, type Lab, analyzePixels, dHash, grayFromRgba, samplePixels } from '@magpin/core';

export interface Analysis {
  dominant: Lab | null;
  /** Pixel sample feeding the board palette. */
  samples: Lab[];
  /** 64-bit dHash, 16 hex characters. */
  hash: string | null;
}

const ANALYSIS_WIDTH = 64;
const SAMPLES_PER_IMAGE = 160;

let canvas: HTMLCanvasElement | null = null;

function pixelsOf(bitmap: ImageBitmap, width: number, height: number): Uint8ClampedArray {
  canvas ??= document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('2D canvas unavailable');
  context.clearRect(0, 0, width, height);
  context.drawImage(bitmap, 0, 0, width, height);
  return context.getImageData(0, 0, width, height).data;
}

export async function analyzeBytes(bytes: Uint8Array): Promise<Analysis | null> {
  let bitmap: ImageBitmap;
  try {
    // Only the width is given: the browser keeps the aspect ratio.
    bitmap = await createImageBitmap(new Blob([bytes as BlobPart]), { resizeWidth: ANALYSIS_WIDTH, resizeQuality: 'medium' });
  } catch {
    return null;
  }
  try {
    const small = pixelsOf(bitmap, bitmap.width, bitmap.height);
    const tiny = pixelsOf(bitmap, DHASH_SIZE.width, DHASH_SIZE.height);
    return {
      dominant: analyzePixels(small, { k: 4 })?.dominant ?? null,
      samples: samplePixels(small, SAMPLES_PER_IMAGE),
      hash: dHash(grayFromRgba(tiny)),
    };
  } catch {
    return null;
  } finally {
    bitmap.close();
  }
}
