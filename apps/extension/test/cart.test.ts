import { describe, expect, it } from 'vitest';
import { type CartBoard, EchoFilter, applyReading, buildExport, displayTitle, itemsAfterReading, renameBoard, selectedItems, upsertBoard } from '../src/cart';
import type { CollectedItem } from '../src/sources/types';

const pin = (id: string, hash: string): CollectedItem => ({
  id,
  imageUrl: `https://i.pinimg.com/originals/aa/bb/cc/${hash}.jpg`,
  fallbackUrl: `https://i.pinimg.com/736x/aa/bb/cc/${hash}.jpg`,
  thumbUrl: `https://i.pinimg.com/236x/aa/bb/cc/${hash}.jpg`,
});

const board = (key: string, items: CollectedItem[], deselected: string[] = []): CartBoard => ({
  key,
  source: 'pinterest',
  title: `Board ${key}`,
  url: `https://www.pinterest.com/me/${key}/`,
  items,
  deselected,
  addedAt: 1,
});

describe('cart', () => {
  it('keeps each board selection', () => {
    expect(selectedItems(board('a', [pin('1', 'h1'), pin('2', 'h2')], ['2'])).map((i) => i.id)).toEqual(['1']);
  });

  it('exports three boards as one moodboard, each image once in the count and the ZIP', () => {
    const summary = buildExport([
      board('a', [pin('1', 'h1'), pin('2', 'h2'), pin('3', 'h3')], ['3']),
      // Same pin (same id), and a repin of h2 under another id (same image).
      board('b', [pin('1', 'h1'), pin('20', 'h2'), pin('4', 'h4')]),
      board('c', [pin('5', 'h5')]),
    ]);
    expect(summary.zip.map((b) => b.items.map((i) => i.id))).toEqual([['1', '2'], ['4'], ['5']]);
    expect(summary.total).toBe(4);
    expect(summary.duplicates).toBe(2);
    expect(summary.zip[0]).toMatchObject({ source: 'pinterest', title: 'Board a', url: 'https://www.pinterest.com/me/a/' });
    // Thumbnails travel for the plugin's color analysis.
    expect(summary.copy[0]!.items[0]!.thumbUrl).toContain('/236x/');
  });

  it('copies each board whole, so leaving one out in Figma gives its shared images back', () => {
    const summary = buildExport([board('a', [pin('1', 'h1'), pin('2', 'h2')]), board('b', [pin('1', 'h1'), pin('20', 'h2'), pin('4', 'h4')])]);
    expect(summary.copy.map((b) => b.items.map((i) => i.id))).toEqual([
      ['1', '2'],
      ['1', '20', '4'],
    ]);
    // The count still says what the user gets once the plugin removed them.
    expect(summary.total).toBe(3);
    expect(summary.duplicates).toBe(2);
  });

  it('drops boards left empty by the selection (and, in the ZIP, by duplicates)', () => {
    const summary = buildExport([board('a', [pin('1', 'h1')]), board('b', [pin('1', 'h1')]), board('c', [pin('2', 'h2')], ['2'])]);
    expect(summary.zip.map((b) => b.title)).toEqual(['Board a']);
    expect(summary.copy.map((b) => b.title)).toEqual(['Board a', 'Board b']);
  });

  it('updates a board in place, keeping its position and date', () => {
    const cart = [board('a', []), board('b', [])];
    const next = upsertBoard(cart, { ...board('a', [pin('1', 'h1')]), addedAt: 99 });
    expect(next.map((b) => b.key)).toEqual(['a', 'b']);
    expect(next[0]!.items).toHaveLength(1);
    expect(next[0]!.addedAt).toBe(1);
    expect(upsertBoard(cart, board('c', [])).map((b) => b.key)).toEqual(['a', 'b', 'c']);
  });

  it('renames a board, keeps the name across re-scans, exports it', () => {
    let cart = [board('a', [pin('1', 'h1')])];
    cart = renameBoard(cart, 'a', '  Lamp   refs ');
    expect(displayTitle(cart[0]!)).toBe('Lamp refs');
    // A re-scan brings the page title back: the user's name stays.
    cart = upsertBoard(cart, { ...board('a', [pin('1', 'h1'), pin('2', 'h2')]), title: '(20) Pinterest' });
    expect(displayTitle(cart[0]!)).toBe('Lamp refs');
    expect(buildExport(cart).copy[0]!.title).toBe('Lamp refs');
    // Emptying the name goes back to the board's own title.
    cart = renameBoard(cart, 'a', '');
    expect(displayTitle(cart[0]!)).toBe('(20) Pinterest');
  });

  it('never shrinks a board with a reading stopped early', () => {
    const before = [pin('1', 'h1'), pin('2', 'h2'), pin('3', 'h3')];
    const short = [pin('1', 'h1')];
    expect(itemsAfterReading(before, { items: short, stopped: true })).toBe(before);
    // A reading that got to the end is the board as it is now.
    expect(itemsAfterReading(before, { items: short, stopped: false })).toBe(short);
    expect(itemsAfterReading(null, { items: short, stopped: true })).toBe(short);
  });

  it('follows a new reading of a board in the cart, keeping its name and selection', () => {
    let cart = renameBoard([board('a', [pin('1', 'h1'), pin('2', 'h2')], ['2']), board('b', [])], 'a', 'Lamps');
    const reading = { title: 'Lamp refs', url: 'https://www.pinterest.com/me/a/', stopped: false, items: [pin('1', 'h1'), pin('2', 'h2'), pin('3', 'h3')] };
    cart = applyReading(cart, 'a', reading);
    expect(cart[0]).toMatchObject({ title: 'Lamp refs', customTitle: 'Lamps', deselected: ['2'] });
    expect(cart[0]!.items).toHaveLength(3);
    // Stopped early with fewer items: the cart keeps its list.
    expect(applyReading(cart, 'a', { ...reading, stopped: true, items: [pin('1', 'h1')] })[0]!.items).toHaveLength(3);
    // Not in the cart, or nothing new: the same cart comes back.
    expect(applyReading(cart, 'z', reading)).toBe(cart);
    expect(applyReading(cart, 'a', reading)).toBe(cart);
  });

  it('tells the echo of its own writes from changes made elsewhere', () => {
    const echoes = new EchoFilter();
    const first = [board('a', [])];
    const second = [board('a', []), board('b', [])];
    echoes.wrote(first);
    echoes.wrote(second);
    // Echoes come back in order; an older one must not count as news.
    expect(echoes.isEcho(JSON.parse(JSON.stringify(first)))).toBe(true);
    expect(echoes.isEcho(JSON.parse(JSON.stringify(second)))).toBe(true);
    expect(echoes.isEcho(second)).toBe(false);
    expect(echoes.isEcho([board('c', [])])).toBe(false);
  });
});
