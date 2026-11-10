/**
 * Turns what the user gives the plugin (a pasted Magpin payload, a Magpin ZIP,
 * loose images) into a list of jobs the builder can run.
 */
import {
  type ExchangePayload,
  type SourceId,
  countItems,
  decodePayload,
  dedupeItems,
  moodboardTitle,
  uniqueFolderNames,
  zipEntryName,
} from '@magpin/core';
import { unzipSync } from 'fflate';
import { type Loaded, loadFromUrls, prepareForFigma, sniffImageType } from './images';

export interface Job {
  /** Index of the board in `Prepared.boards`. */
  board: number;
  /** Id of the image in its source (pin id, file name…). */
  sourceId: string;
  load: (signal: AbortSignal) => Promise<Loaded>;
}

export interface Prepared {
  title: string;
  boards: PreparedBoard[];
  jobs: Job[];
  /** Invalid entries ignored while reading the input. */
  skipped: number;
  /** Same image in several boards (same id or URL), removed before loading. */
  duplicates: number;
  /** The pasted payload, kept to redo the duplicate check when boards are left out. */
  payload?: ExchangePayload;
}

export interface PreparedBoard {
  title: string;
  count: number;
  /** Where the board comes from; null for loose images or a plain ZIP. */
  source: SourceId | null;
  url: string | null;
}

export type PrepareError = { error: string };

export function fromPastedText(text: string): Prepared | PrepareError {
  const result = decodePayload(text);
  if (!result.ok) {
    switch (result.error) {
      case 'not-magpin':
        return { error: 'This is not a Magpin board. Copy one with the Magpin extension first.' };
      case 'unsupported-version':
        return { error: 'This board comes from a newer Magpin. Update the plugin, then paste again.' };
      case 'empty':
        return { error: 'This board has no images.' };
      default:
        return { error: 'The pasted board is damaged. Copy it again from the extension.' };
    }
  }
  return fromPayload(result.payload, result.skippedItems);
}

function fromPayload(payload: ExchangePayload, skipped: number): Prepared {
  // F6, first level: the same pin in two boards (same id or same image URL).
  const all = payload.boards.flatMap((board, index) => board.items.map((item) => ({ ...item, board: index })));
  const unique = new Set(dedupeItems(all));
  const jobs: Job[] = all
    .filter((item) => unique.has(item))
    .map((item) => ({
      board: item.board,
      sourceId: item.id,
      load: (signal: AbortSignal) =>
        loadFromUrls([item.imageUrl, ...(item.fallbackUrl ? [item.fallbackUrl] : [])], signal, item.thumbUrl ?? null),
    }));
  return {
    title: moodboardTitle(payload.boards),
    boards: payload.boards.map((board) => ({ title: board.title, count: board.items.length, source: board.source, url: board.url || null })),
    jobs,
    skipped,
    duplicates: all.length - jobs.length,
    payload,
  };
}

/**
 * The moodboard without the boards the user left out (indexes into
 * `prepared.boards`). Duplicates are checked again: an image shared with a
 * left-out board comes back in the board that stays.
 */
export function selectBoards(prepared: Prepared, excluded: ReadonlySet<number>): Prepared {
  if (excluded.size === 0) return prepared;
  if (prepared.payload) {
    const boards = prepared.payload.boards.filter((_, index) => !excluded.has(index));
    return fromPayload({ ...prepared.payload, boards }, prepared.skipped);
  }
  const newIndex = new Map<number, number>();
  const boards = prepared.boards.filter((_, index) => {
    if (excluded.has(index)) return false;
    newIndex.set(index, newIndex.size);
    return true;
  });
  return {
    ...prepared,
    title: moodboardTitle(boards),
    boards,
    jobs: prepared.jobs.filter((job) => newIndex.has(job.board)).map((job) => ({ ...job, board: newIndex.get(job.board)! })),
  };
}

const IMAGE_EXT = /\.(png|jpe?g|gif|webp|avif|bmp)$/i;

/**
 * Accepts a ZIP made by the extension (uses its magpin.json for titles and
 * order), any other ZIP of images, or loose image files.
 */
export async function fromFiles(files: readonly File[]): Promise<Prepared | PrepareError> {
  const entries: { path: string; bytes: Uint8Array }[] = [];
  let manifest: ExchangePayload | null = null;
  let title = '';

  for (const file of files) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (/\.zip$/i.test(file.name) || isZip(bytes)) {
      let unzipped: Record<string, Uint8Array>;
      try {
        unzipped = unzipSync(bytes);
      } catch {
        return { error: `${file.name} is not a readable ZIP.` };
      }
      title ||= file.name.replace(/\.zip$/i, '').replace(/^Magpin - /, '');
      for (const [path, data] of Object.entries(unzipped)) {
        if (path.startsWith('__MACOSX/') || path.endsWith('/')) continue;
        if (path === 'magpin.json') {
          const decoded = decodePayload(new TextDecoder().decode(data));
          if (decoded.ok) manifest = decoded.payload;
          continue;
        }
        if (IMAGE_EXT.test(path) || sniffImageType(data)) entries.push({ path, bytes: data });
      }
    } else if (IMAGE_EXT.test(file.name) || sniffImageType(bytes)) {
      title ||= 'Dropped images';
      entries.push({ path: file.name, bytes });
    }
  }

  if (entries.length === 0) return { error: 'No images found. Drop a Magpin ZIP or image files.' };

  const ordered = manifest ? orderByManifest(entries, manifest) : null;
  const boards: PreparedBoard[] = ordered?.boards ?? [{ title: title || 'Imported images', count: entries.length, source: null, url: null }];
  const list = ordered?.entries ?? [...entries].sort((a, b) => a.path.localeCompare(b.path, undefined, { numeric: true }));

  return {
    title: manifest ? moodboardTitle(manifest.boards) : boards[0]!.title,
    boards,
    jobs: list.map((entry, index) => ({
      board: boardOf(index, boards),
      sourceId: baseName(entry.path),
      load: async () => {
        const bytes = await prepareForFigma(entry.bytes);
        return bytes ? { kind: 'bytes', bytes } : { kind: 'failed' };
      },
    })),
    skipped: 0,
    duplicates: 0,
  };
}

/** Puts files back in board order using the ZIP's manifest; keeps unknown files at the end. */
function orderByManifest(entries: { path: string; bytes: Uint8Array }[], manifest: ExchangePayload) {
  const byStem = new Map(entries.map((entry) => [stripExt(entry.path), entry]));
  const used = new Set<string>();
  const folders = uniqueFolderNames(manifest.boards.map((board) => board.title));
  const ordered: { path: string; bytes: Uint8Array }[] = [];
  const boards: PreparedBoard[] = [];

  manifest.boards.forEach((board, b) => {
    let count = 0;
    board.items.forEach((item, index) => {
      const stem = `${folders[b]}/${stripExt(zipEntryName(index, board.items.length, item.id, 'x'))}`;
      const entry = byStem.get(stem);
      if (!entry) return;
      used.add(stem);
      ordered.push(entry);
      count++;
    });
    if (count > 0) boards.push({ title: board.title, count, source: board.source, url: board.url || null });
  });

  const rest = entries.filter((entry) => !used.has(stripExt(entry.path)));
  if (rest.length > 0) boards.push({ title: 'Other images', count: rest.length, source: null, url: null });
  if (countItems({ boards: manifest.boards }) === 0 && rest.length === 0) return null;
  return { entries: [...ordered, ...rest], boards };
}

/** Board of the n-th file, given the files are listed board after board. */
function boardOf(index: number, boards: readonly { count: number }[]): number {
  let end = 0;
  for (let b = 0; b < boards.length; b++) {
    end += boards[b]!.count;
    if (index < end) return b;
  }
  return Math.max(0, boards.length - 1);
}

function isZip(bytes: Uint8Array): boolean {
  return bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
}

function stripExt(path: string): string {
  return path.replace(/\.[a-z0-9]+$/i, '');
}

function baseName(path: string): string {
  return stripExt(path.split('/').pop() ?? path);
}
