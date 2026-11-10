import { describe, expect, it } from 'vitest';
import { type Rect, findSpot } from '../src/main/place';

const options = { gap: 100, rowWidth: 5000 };
const size = { width: 1000, height: 800 };
const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

/** Places `count` moodboards one after the other, as successive pastes would. */
function pasteMany(count: number, sizes: (i: number) => { width: number; height: number }, start: Rect[] = [{ x: 0, y: 0, width: 1000, height: 800 }]) {
  const page = [...start];
  for (let i = 0; i < count; i++) {
    const s = sizes(i);
    const spot = findSpot(page, s, options)!;
    page.push({ ...spot, ...s });
  }
  return page;
}

describe('findSpot', () => {
  it('has no opinion on an empty page', () => {
    expect(findSpot([], size, options)).toBeNull();
  });

  it('goes to the right of what is there while the row has room', () => {
    expect(findSpot([{ x: 0, y: 0, width: 1000, height: 800 }], size, options)).toEqual({ x: 1100, y: 0 });
  });

  it('wraps to a new row under the tallest one at the end of the row', () => {
    const page = pasteMany(6, () => size);
    // 1000 wide + 100 gap: four fit in 5000, the fifth starts a new row.
    expect(page.slice(0, 4).map((r) => r.y)).toEqual([0, 0, 0, 0]);
    expect(page[4]).toMatchObject({ x: 0, y: 900 });
    expect(page[5]).toMatchObject({ x: 1100, y: 900 });
  });

  it('never covers anything, whatever the sizes', () => {
    const page = pasteMany(30, (i) => ({ width: 400 + ((i * 737) % 2200), height: 300 + ((i * 431) % 2600) }));
    for (let i = 0; i < page.length; i++) for (let j = i + 1; j < page.length; j++) expect(overlaps(page[i]!, page[j]!)).toBe(false);
    const right = Math.max(...page.map((r) => r.x + r.width));
    expect(right).toBeLessThanOrEqual(options.rowWidth + 2600);
  });

  it('uses a free gap big enough', () => {
    const page: Rect[] = [
      { x: 0, y: 0, width: 1000, height: 800 },
      { x: 2400, y: 0, width: 1000, height: 800 },
    ];
    expect(findSpot(page, size, options)).toEqual({ x: 1100, y: 0 });
  });

  it('gives a board wider than a row a row of its own', () => {
    const spot = findSpot([{ x: 0, y: 0, width: 1000, height: 800 }], { width: 9000, height: 500 }, options);
    expect(spot).toEqual({ x: 0, y: 900 });
  });
});
