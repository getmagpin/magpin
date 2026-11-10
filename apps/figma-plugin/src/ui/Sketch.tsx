/**
 * The moodboard to come, sketched as it will sit on the Figma canvas: the
 * section "Moodboard — Board" with its images (grey blocks at their real
 * proportions: 320 px cells, the chosen columns and spacing), and the Palette
 * frame beside it, one row per colour. Nothing is loaded: it is a plan.
 *
 * Each setting has its own visible effect, and the setting under the pointer
 * (or being changed) lights up its part: the columns as layout-grid bands, the
 * spacing as hatched gutters, the order as a light-to-dark ramp, the palette
 * frame outlined. The palette always shows every colour, so "one more colour"
 * reads as one more row.
 */
import type { JSX } from 'preact';
import { useRef } from 'preact/hooks';
import type { LayoutKind } from '../shared/messages';

/** The part of the sketch a setting is about. */
export type SketchPart = 'columns' | 'spacing' | 'sort' | 'palette';

const CELL = 320;
const SWATCH = 96;
/** Stand-in shapes for the mosaic (height over width). */
const RATIOS = [1.25, 0.8, 1.5, 1, 1.33, 0.9, 1.2, 1.4, 0.75, 1.1];
/** Share of the images in each colour group, largest first. */
const GROUP_SHARES = [0.32, 0.26, 0.2, 0.14, 0.08];
/** Pinned order, before sorting: a stable shuffle of shades. */
const MIXED = [0.62, 0.15, 0.85, 0.4, 0.05, 0.7, 0.3, 0.95, 0.5, 0.2, 0.78, 0.1, 0.58, 0.88, 0.35, 0.45, 0.68, 0.25, 0.8, 0.02, 0.52, 0.92, 0.12, 0.74];

/** Layout of the sketch box, px. */
const LABEL = 16;
const PAD = 7;
const PALETTE_W = { min: 64, max: 96, share: 0.25 };
const BETWEEN = 10;
/** Height of a palette row, px. */
const ROW = 9.5;

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface SketchProps {
  /** The moodboard's title, as the real section gets it ("A + 2 more"). */
  title: string;
  layout: LayoutKind;
  columns: number;
  gap: number;
  sortByColor: boolean;
  palette: boolean;
  paletteSize: number;
  variables: boolean;
  images: number;
  /** The part to light up (the setting pointed at or being changed). */
  focus: SketchPart | null;
  /** Inner size of the sketch, px. */
  width: number;
  height: number;
}

/** A grey for a place in the light-to-dark ramp (0 = lightest); stronger when the order is lit. */
const shade = (t: number, strong = false) => `hsl(0 0% ${(strong ? 90 - t * 42 : 91 - t * 26).toFixed(1)}%)`;

export function Sketch({ title, layout, columns, gap, sortByColor, palette, paletteSize, variables, images, focus, width, height }: SketchProps) {
  const paletteW = palette ? Math.round(Math.min(PALETTE_W.max, Math.max(PALETTE_W.min, width * PALETTE_W.share))) : 0;
  const sectionW = width - (palette ? paletteW + BETWEEN : 0);
  const frameH = height - LABEL;
  const { tiles, swatches, contentWidth, cols, bandsX } = sketchLayout(layout, columns, gap, images);
  const scale = (sectionW - PAD * 2) / contentWidth;
  const sorted = layout === 'groups' || sortByColor;
  // Palette rows on screen since the sketch appeared don't slide in; only the
  // ones added later do (fewest rows seen so far = rows never remounted).
  const steadyRows = useRef(paletteSize);
  if (paletteSize < steadyRows.current) steadyRows.current = paletteSize;

  const place = (b: Box): JSX.CSSProperties => ({
    transform: `translate(${(PAD + b.x * scale).toFixed(1)}px, ${(PAD + b.y * scale).toFixed(1)}px)`,
    width: `${Math.max(1, b.w * scale).toFixed(1)}px`,
    height: `${Math.max(1, b.h * scale).toFixed(1)}px`,
  });

  // The palette: every colour, one row each, light to dark. The frame hugs its
  // rows (auto layout, as in Figma), so one more colour makes it one row taller.
  const rowGap = 3;
  const rowH = Math.min(ROW, (frameH - PAD * 2 - rowGap * (paletteSize - 1)) / paletteSize);
  const paletteH = PAD * 2 + paletteSize * rowH + (paletteSize - 1) * rowGap;
  const chip = rowH;

  return (
    <div class={`sketch${focus ? ` is-focus-${focus}` : ''}${variables && palette ? ' has-variables' : ''}`} style={{ height: `${height}px` }} aria-hidden="true">
      <span class="sketch__label" style={{ width: `${sectionW}px` }}>
        Moodboard — {title}
      </span>
      <div class="sketch__section" style={{ width: `${sectionW}px`, height: `${frameH}px` }}>
        {/* Columns lit up: the layout grid, as Figma draws it. */}
        <div class="sketch__grid">
          {Array.from({ length: cols }, (_, c) => (
            <span key={c} style={place({ x: bandsX + c * (CELL + gap), y: -PAD / scale, w: CELL, h: (frameH + PAD) / scale })} />
          ))}
        </div>
        {tiles.map((b, i) => {
          const t = sorted ? (b.group !== undefined ? b.group / 4 : i / Math.max(1, tiles.length - 1)) : MIXED[i % MIXED.length]!;
          return <span key={`t${i}`} class="sketch__tile" style={{ ...place(b), background: shade(t, focus === 'sort') }} />;
        })}
        {swatches.map((b, i) => (
          <span key={`s${i}`} class="sketch__swatch" style={{ ...place(b), background: shade(i / 4 + 0.35) }} />
        ))}
      </div>
      <span class="sketch__label sketch__label--palette" style={{ left: `${sectionW + BETWEEN}px`, width: `${paletteW}px`, opacity: palette ? 1 : 0 }}>
        Palette
      </span>
      <div class={`sketch__palette${palette ? '' : ' is-off'}`} style={{ left: `${sectionW + BETWEEN}px`, width: `${Math.max(paletteW, 1)}px`, height: `${paletteH.toFixed(1)}px` }}>
        {Array.from({ length: paletteSize }, (_, i) => (
          <span key={i} class={`sketch__row${i >= steadyRows.current ? ' is-new' : ''}`} style={{ transform: `translateY(${(PAD + i * (rowH + rowGap)).toFixed(1)}px)`, height: `${rowH.toFixed(1)}px` }}>
            <span class="sketch__chip" style={{ width: `${chip.toFixed(1)}px`, height: `${chip.toFixed(1)}px`, background: shade(0.15 + (i / Math.max(1, paletteSize - 1)) * 0.85) }} />
            <span class="sketch__name" />
          </span>
        ))}
      </div>
    </div>
  );
}

export interface SketchLayout {
  tiles: (Box & { group?: number })[];
  swatches: Box[];
  contentWidth: number;
  /** Columns in use: fewer images than columns use fewer (as the real layouts do). */
  cols: number;
  /** Where the first column starts (after the swatches, for color groups). */
  bandsX: number;
}

/** Width of `cols` columns of cells. */
const widthOf = (cols: number, gap: number) => cols * CELL + (cols - 1) * gap;

/** Where each grey block goes, in the moodboard's own units (px in Figma). */
export function sketchLayout(layout: LayoutKind, columns: number, gap: number, images: number): SketchLayout {
  // Fewer images than columns: only the columns in use count (packages/core layouts).
  const cols = Math.min(Math.max(1, columns), Math.max(1, images));
  // Enough blocks to fill the view, never more than there are images.
  const shown = Math.min(images, cols * 4);

  if (layout === 'mosaic') {
    const heights = Array<number>(cols).fill(0);
    const tiles = Array.from({ length: shown }, (_, i) => {
      const c = heights.indexOf(Math.min(...heights));
      const h = CELL * RATIOS[i % RATIOS.length]!;
      const box = { x: c * (CELL + gap), y: heights[c]!, w: CELL, h };
      heights[c]! += h + gap;
      return box;
    });
    return { tiles, swatches: [], contentWidth: widthOf(cols, gap), cols, bandsX: 0 };
  }

  if (layout === 'groups') {
    // Groups stacked: a colour swatch, then that group's images in the grid.
    const left = SWATCH + gap * 2;
    const groupGap = Math.max(96, gap * 6);
    const counts = GROUP_SHARES.map((share) => Math.max(1, Math.round(images * share))).slice(0, Math.min(GROUP_SHARES.length, Math.max(1, images)));
    // As wide as the biggest group needs (packages/core groupsLayout).
    const groupCols = Math.min(cols, Math.max(...counts));
    const tiles: (Box & { group: number })[] = [];
    const swatches: Box[] = [];
    let top = 0;
    counts.forEach((count, g) => {
      if (tiles.length >= shown) return;
      swatches.push({ x: 0, y: top, w: SWATCH, h: SWATCH });
      const n = Math.min(count, shown - tiles.length);
      for (let i = 0; i < n; i++) tiles.push({ x: left + (i % cols) * (CELL + gap), y: top + Math.floor(i / cols) * (CELL + gap), w: CELL, h: CELL, group: g });
      const rows = Math.max(1, Math.ceil(count / cols));
      top += Math.max(SWATCH, rows * CELL + (rows - 1) * gap) + groupGap;
    });
    return { tiles, swatches, contentWidth: left + widthOf(groupCols, gap), cols: groupCols, bandsX: left };
  }

  const tiles = Array.from({ length: shown }, (_, i) => ({ x: (i % cols) * (CELL + gap), y: Math.floor(i / cols) * (CELL + gap), w: CELL, h: CELL }));
  return { tiles, swatches: [], contentWidth: widthOf(cols, gap), cols, bandsX: 0 };
}
