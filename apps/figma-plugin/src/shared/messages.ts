/**
 * Messages between the plugin UI (iframe) and the main thread (canvas).
 *
 * 1. Register: the UI hands each image to the main thread, which turns it into
 *    a Figma image (hash + size) without placing it yet.
 * 2. The UI analyses colors, removes duplicates, sorts and computes the layout.
 * 3. Build: the main thread places everything in one go, with the palette.
 */

import type { SourceId } from '@magpin/core';

export type LayoutKind = 'grid' | 'mosaic' | 'groups';

export interface Settings {
  columns: number;
  gap: number;
  layout: LayoutKind;
  sortByColor: boolean;
  palette: boolean;
  paletteSize: number;
  variables: boolean;
}

export type EditorType = 'figma' | 'figjam' | 'other';

export interface BuildItem {
  hash: string;
  x: number;
  y: number;
  width: number;
  height: number;
  /** Layer name: 01, 02… */
  name: string;
  /** Id of the image in its source (pin id…), kept as plugin data. */
  sourceId: string;
}

export interface BuildSwatch {
  x: number;
  y: number;
  size: number;
  hex: string;
  name: string;
}

export interface BuildPaletteColor {
  name: string;
  hex: string;
  /** 0..1 channels, as Figma expects. */
  rgb: { r: number; g: number; b: number };
}

export type VariablesMode = 'none' | 'create' | 'update';

/** One board: its images, group swatches and palette. */
export interface BuildBlock {
  title: string;
  /** Source of the board, shown with its mark and a link above the images. */
  source: SourceId | null;
  url: string | null;
  items: BuildItem[];
  swatches: BuildSwatch[];
  contentWidth: number;
  contentHeight: number;
  palette: BuildPaletteColor[];
}

export interface BuildRequest {
  /** Moodboard title: the board's, or "A + 2 more". */
  title: string;
  /** One block per board. Several blocks become one section per board. */
  blocks: BuildBlock[];
  variables: VariablesMode;
  collectionName: string;
}

export type UiToMain =
  | { type: 'ready' }
  | { type: 'save-settings'; settings: Settings }
  | { type: 'inspect'; collectionName: string }
  /** Image bytes already prepared by the UI (PNG, JPEG or GIF, at most 4096 px). */
  | { type: 'register-bytes'; index: number; bytes: Uint8Array }
  /** The UI could not download these URLs itself (CORS): let Figma fetch them. */
  | { type: 'register-urls'; index: number; urls: string[]; thumbUrl: string | null }
  | { type: 'build'; request: BuildRequest }
  | { type: 'cancel-build' }
  /** Answer to `canvas-paste`: remove the pasted text layers if the board was taken. */
  | { type: 'canvas-paste-result'; nodeIds: string[]; accepted: boolean };

export type Registered =
  | { ok: true; hash: string; width: number; height: number; thumbBytes: Uint8Array | null }
  | { ok: false };

export type MainToUi =
  | { type: 'init'; settings: Settings; editor: EditorType }
  | { type: 'inspection'; collectionName: string; exists: boolean }
  | { type: 'registered'; index: number; result: Registered }
  | { type: 'build-progress'; done: number; total: number }
  /** `error`: placing stopped on a failure (Figma's message); what got placed stays. */
  | { type: 'built'; placed: number; variables: { collectionName: string; count: number } | null; error?: string }
  /**
   * Figma keeps ⌘V for the canvas unless a text field of the plugin has focus,
   * so a board is often pasted as a text layer. The main thread spots it in the
   * selection and hands its text to the UI.
   */
  | { type: 'canvas-paste'; text: string; nodeIds: string[] };
