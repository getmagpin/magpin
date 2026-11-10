import { createPayload, encodePayload, hexToOklab, hueFamily, type Lab } from '@magpin/core';
import { describe, expect, it } from 'vitest';
import type { Settings } from '../src/shared/messages';
import { type Entry, arrange } from '../src/ui/arrange';
import { fromPastedText, selectBoards } from '../src/ui/sources';

const settings = (patch: Partial<Settings> = {}): Settings => ({
  columns: 4,
  gap: 16,
  layout: 'grid',
  sortByColor: true,
  palette: true,
  paletteSize: 6,
  variables: true,
  ...patch,
});

/** Distinct hashes far apart from each other (no accidental duplicates). */
function spreadHash(seed: number): string {
  let hex = '';
  let x = seed * 2654435761;
  for (let i = 0; i < 16; i++) {
    x = (x * 1103515245 + 12345) >>> 0;
    hex += (x >>> 28).toString(16);
  }
  return hex;
}

let n = 0;
function entry(hex: string | null, options: { hash?: string; size?: [number, number]; board?: number } = {}): Entry {
  const color: Lab | null = hex ? hexToOklab(hex) : null;
  n++;
  return {
    board: options.board ?? 0,
    sourceId: `pin-${n}`,
    hash: `figma-${n}`,
    width: options.size?.[0] ?? 736,
    height: options.size?.[1] ?? 1104,
    analysis: color ? { dominant: color, samples: Array.from({ length: 40 }, () => color), hash: options.hash ?? spreadHash(n) } : null,
  };
}

/** Arrangement of a single board. */
function single(entries: Entry[], s: Settings) {
  const { blocks, duplicates } = arrange(entries, s, [{ title: 'Board' }]);
  return { ...(blocks[0] ?? { items: [], swatches: [], contentWidth: 0, contentHeight: 0, palette: [] }), duplicates };
}

describe('arrange', () => {
  it('sorts by color, numbers layers and keeps neutrals last', () => {
    const entries = [entry('#FFFFFF'), entry('#2554C7'), entry('#E3262F'), entry('#2E9E4F'), entry('#000000')];
    const result = single(entries, settings());
    const colors = result.items.map((item) => entries.find((e) => e.hash === item.hash)!.analysis!.dominant!);
    expect(colors.slice(-2).map((c) => hueFamily(c))).toEqual(['neutral', 'neutral']);
    expect(colors[3]!.L).toBeGreaterThan(colors[4]!.L); // white before black
    expect(result.items.map((item) => item.name)).toEqual(['01', '02', '03', '04', '05']);
    expect(result.items.every((item) => item.sourceId.startsWith('pin-'))).toBe(true);
  });

  it('keeps the original order when color sort is off', () => {
    const entries = [entry('#FFFFFF'), entry('#2554C7'), entry('#E3262F')];
    const result = single(entries, settings({ sortByColor: false }));
    expect(result.items.map((item) => item.hash)).toEqual(entries.map((e) => e.hash));
  });

  it('removes visual duplicates and keeps the biggest copy', () => {
    const small = entry('#2554C7', { hash: 'abcdefabcdefabcd', size: [236, 354] });
    const big = entry('#2554C7', { hash: 'abcdefabcdefabce', size: [1200, 1800] });
    const other = entry('#E3262F', { hash: '0123456789012345' });
    const result = single([small, big, other], settings());
    expect(result.duplicates).toBe(1);
    expect(result.items.map((item) => item.hash).sort()).toEqual([big.hash, other.hash].sort());
  });

  it('lays out a mosaic from real aspect ratios', () => {
    const entries = [entry('#E3262F', { size: [100, 200], hash: '0000000000000000' }), entry('#E3262F', { size: [100, 50], hash: 'ffffffffffffffff' })];
    const result = single(entries, settings({ layout: 'mosaic', sortByColor: false }));
    expect(result.items.map((item) => item.height)).toEqual([640, 160]);
  });

  it('makes one group per hue family with a swatch, unknown colors with neutrals', () => {
    const entries = [entry('#E3262F'), entry('#2554C7'), entry('#D7263D'), entry(null), entry('#FFFFFF')];
    const result = single(entries, settings({ layout: 'groups' }));
    expect(result.swatches.map((s) => s.name)).toEqual(['Reds', 'Blues', 'Neutrals']);
    expect(result.items).toHaveLength(5);
    expect(result.swatches[0]!.hex).toMatch(/^#[0-9A-F]{6}$/);
  });

  it('builds a palette only when asked', () => {
    const entries = [entry('#E3262F'), entry('#2554C7'), entry('#FFDE21'), entry('#2E9E4F'), entry('#000000'), entry('#FFFFFF')];
    expect(single(entries, settings({ paletteSize: 5 })).palette).toHaveLength(5);
    expect(single(entries, settings({ palette: false })).palette).toEqual([]);
  });

  it('handles an empty board', () => {
    expect(arrange([], settings(), [{ title: 'Board' }])).toEqual({ blocks: [], duplicates: 0 });
  });
});

describe('several boards', () => {
  it('keeps one block per board, each sorted, numbered and with its own palette', () => {
    const entries = [
      entry('#2554C7', { board: 0 }),
      entry('#E3262F', { board: 1 }),
      entry('#FFFFFF', { board: 0 }),
      entry('#2E9E4F', { board: 1 }),
      entry('#FFDE21', { board: 1 }),
    ];
    const { blocks } = arrange(entries, settings(), [{ title: 'Social', source: 'pinterest', url: 'https://www.pinterest.com/me/social/' }, { title: 'Mockups', source: 'cosmos', url: null }]);
    expect(blocks.map((b) => b.title)).toEqual(['Social', 'Mockups']);
    expect(blocks.map((b) => b.source)).toEqual(['pinterest', 'cosmos']);
    expect(blocks[0]!.url).toBe('https://www.pinterest.com/me/social/');
    expect(blocks.map((b) => b.items.length)).toEqual([2, 3]);
    expect(blocks[1]!.items.map((i) => i.name)).toEqual(['01', '02', '03']);
    expect(blocks.every((b) => b.palette.length > 0)).toBe(true);
    // Each block starts at its own origin.
    expect(blocks[1]!.items[0]).toMatchObject({ x: 0, y: 0 });
  });

  it('removes a duplicate across boards and drops a board left empty', () => {
    const a = entry('#2554C7', { board: 0, hash: '1111111111111111', size: [1200, 1200] });
    const b = entry('#2554C7', { board: 1, hash: '1111111111111110', size: [236, 236] });
    const { blocks, duplicates } = arrange([a, b], settings(), [{ title: 'First' }, { title: 'Second' }]);
    expect(duplicates).toBe(1);
    expect(blocks.map((block) => block.title)).toEqual(['First']);
  });
});

describe('first-level duplicates across boards', () => {
  it('drops the same pin or image found in two boards, keeping board indexes', () => {
    const item = (id: string, hash: string) => ({ id, imageUrl: `https://i.pinimg.com/originals/aa/bb/cc/${hash}.jpg`, thumbUrl: `https://i.pinimg.com/236x/aa/bb/cc/${hash}.jpg` });
    const payload = createPayload([
      { source: 'pinterest', title: 'A', url: '', items: [item('1', 'h1'), item('2', 'h2')] },
      { source: 'pinterest', title: 'B', url: '', items: [item('1', 'h1'), item('9', 'h2'), item('3', 'h3')] },
    ]);
    const prepared = fromPastedText(encodePayload(payload));
    if ('error' in prepared) throw new Error(prepared.error);
    expect(prepared.jobs.map((job) => `${job.board}:${job.sourceId}`)).toEqual(['0:1', '0:2', '1:3']);
    expect(prepared.duplicates).toBe(2);
  });
});

describe('leaving boards out before building', () => {
  const item = (id: string, hash: string) => ({ id, imageUrl: `https://i.pinimg.com/originals/aa/bb/cc/${hash}.jpg` });
  const pasted = () => {
    const prepared = fromPastedText(
      encodePayload(
        createPayload([
          { source: 'pinterest', title: 'A', url: '', items: [item('1', 'h1'), item('2', 'h2')] },
          { source: 'arena', title: 'B', url: '', items: [item('1', 'h1'), item('3', 'h3')] },
          { source: 'savee', title: 'C', url: '', items: [item('4', 'h4')] },
        ]),
      ),
    );
    if ('error' in prepared) throw new Error(prepared.error);
    return prepared;
  };

  it('keeps everything when nothing is left out', () => {
    const prepared = pasted();
    expect(selectBoards(prepared, new Set())).toBe(prepared);
  });

  it('drops the left-out board, renumbers the others and retitles', () => {
    const selected = selectBoards(pasted(), new Set([1]));
    expect(selected.boards.map((board) => board.title)).toEqual(['A', 'C']);
    expect(selected.jobs.map((job) => `${job.board}:${job.sourceId}`)).toEqual(['0:1', '0:2', '1:4']);
    expect(selected.title).toBe('A + 1 more');
  });

  it('brings back an image that was only dropped as a duplicate of a left-out board', () => {
    const selected = selectBoards(pasted(), new Set([0]));
    expect(selected.jobs.map((job) => `${job.board}:${job.sourceId}`)).toEqual(['0:1', '0:3', '1:4']);
    expect(selected.duplicates).toBe(0);
    expect(selected.title).toBe('B + 1 more');
  });
});
