/**
 * Pure arrangement step: duplicates (dHash), then for each board its color
 * sort, layout and palette. No DOM, no Figma: covered by unit tests.
 *
 * Several boards stay distinct: one block per board, each with its own
 * layout and palette (the main thread turns blocks into sections).
 */
import {
  DEFAULT_GRID,
  type HueFamily,
  type Lab,
  type PaletteColor,
  type Placement,
  type SourceId,
  buildPalette,
  findVisualDuplicates,
  gridLayout,
  groupByFamily,
  groupsLayout,
  labToHex,
  layerNumber,
  masonryLayout,
  mixLab,
  sortByColor,
} from '@magpin/core';
import type { BuildItem, BuildSwatch, Settings } from '../shared/messages';
import type { Analysis } from './analysis';

export interface Entry {
  /** Index of the board the image comes from. */
  board: number;
  sourceId: string;
  hash: string;
  width: number;
  height: number;
  analysis: Analysis | null;
}

export interface Block {
  title: string;
  source: SourceId | null;
  url: string | null;
  items: BuildItem[];
  swatches: BuildSwatch[];
  contentWidth: number;
  contentHeight: number;
  palette: PaletteColor[];
}

export interface Arrangement {
  /** One block per board that still has images, in board order. */
  blocks: Block[];
  /** Images removed as visual duplicates, across all boards. */
  duplicates: number;
}

const CELL_SIZE = DEFAULT_GRID.cellSize;
const SWATCH_SIZE = 96;

const FAMILY_LABELS: Record<HueFamily, string> = {
  red: 'Reds',
  orange: 'Oranges',
  yellow: 'Yellows',
  green: 'Greens',
  cyan: 'Cyans',
  blue: 'Blues',
  purple: 'Purples',
  pink: 'Pinks',
  neutral: 'Neutrals',
};

export interface BoardInfo {
  title: string;
  source?: SourceId | null;
  url?: string | null;
}

export function arrange(entries: readonly Entry[], settings: Settings, boards: readonly BoardInfo[]): Arrangement {
  // F6, second level, across boards: same picture (dHash within 5 bits) → keep
  // the biggest copy, wherever it is.
  const analysed = entries.flatMap((entry, index) => (entry.analysis?.hash ? [{ entry, index }] : []));
  const { keep } = findVisualDuplicates(
    analysed.map(({ entry }) => ({ hash: entry.analysis!.hash!, area: entry.width * entry.height, color: entry.analysis!.dominant })),
  );
  const dropped = new Set(analysed.filter((_, k) => !keep[k]).map(({ index }) => index));
  const kept = entries.filter((_, index) => !dropped.has(index));

  const blocks = boards.flatMap((info, board) => {
    const own = kept.filter((entry) => entry.board === board);
    return own.length > 0 ? [arrangeBlock(info, own, settings)] : [];
  });
  return { blocks, duplicates: dropped.size };
}

export function arrangeBlock(info: BoardInfo, entries: readonly Entry[], settings: Settings): Block {
  const colorOf = (entry: Entry): Lab | null => entry.analysis?.dominant ?? null;
  const { columns, gap } = settings;
  let ordered: Entry[];
  let placements: Placement[];
  let swatches: BuildSwatch[] = [];
  let width: number;
  let height: number;

  if (settings.layout === 'groups') {
    const groups = groupByFamily(entries, colorOf);
    ordered = groups.flatMap((group) => group.items);
    const result = groupsLayout(
      groups.map((group) => group.items.length),
      { columns, gap, cellSize: CELL_SIZE, swatchSize: SWATCH_SIZE, groupGap: Math.max(96, gap * 6) },
    );
    placements = result.placements;
    swatches = groups.map((group, i) => {
      const colors = group.items.map(colorOf).filter((color): color is Lab => color !== null);
      const spot = result.swatches[i]!;
      return { x: spot.x, y: spot.y, size: spot.width, hex: colors.length ? labToHex(mixLab(colors)) : '#B4B4B4', name: FAMILY_LABELS[group.family] };
    });
    ({ width, height } = result);
  } else {
    ordered = settings.sortByColor ? sortByColor(entries, colorOf) : [...entries];
    const result =
      settings.layout === 'mosaic'
        ? masonryLayout(ordered.map((entry) => entry.height / entry.width), { columns, gap, columnWidth: CELL_SIZE })
        : gridLayout(ordered.length, { columns, gap, cellSize: CELL_SIZE });
    placements = result.placements;
    ({ width, height } = result);
  }

  const items: BuildItem[] = ordered.map((entry, i) => ({
    hash: entry.hash,
    ...placements[i]!,
    name: layerNumber(i, ordered.length),
    sourceId: entry.sourceId,
  }));
  const palette = settings.palette ? buildPalette(entries.flatMap((entry) => entry.analysis?.samples ?? []), { count: settings.paletteSize }) : [];
  return { title: info.title, source: info.source ?? null, url: info.url ?? null, items, swatches, contentWidth: width, contentHeight: height, palette };
}
