// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { BoardListLock, boardGridItems, extractPinId, findBoardList, getPinterestBoardMeta, parsePinCount, readBoardTitle, readGridItem } from '../src/sources/pinterest/dom';
import { canonicalBoardUrl, matchPinterestBoard } from '../src/sources/pinterest/match';
import { isAvatarSize, isVideoThumbnail, parsePinimgUrl, parseSrcset, resolvePinImage } from '../src/sources/pinterest/urls';

const fixture = (name: string) => readFileSync(join(import.meta.dirname, 'fixtures', name), 'utf8');

function loadDocument(html: string): Document {
  return new DOMParser().parseFromString(html, 'text/html');
}

describe('matchPinterestBoard', () => {
  it.each([
    'https://www.pinterest.com/pinterestfr/week-end-foliage-en-france/',
    'https://fr.pinterest.com/me/branding-cafe/',
    'https://www.pinterest.com/me/branding-cafe/logos/',
    'https://www.pinterest.com/me/branding-cafe?invite_code=1',
    'https://pinterest.com/me/caf%C3%A9/',
  ])('accepts board %s', (url) => {
    expect(matchPinterestBoard(url)).toBe(true);
  });

  it.each([
    'https://www.pinterest.com/',
    'https://www.pinterest.com/me/',
    'https://www.pinterest.com/me/_saved/',
    'https://www.pinterest.com/me/_created/',
    'https://www.pinterest.com/me/pins/',
    'https://www.pinterest.com/pin/123456789/',
    'https://www.pinterest.com/search/pins/?q=cafe',
    'https://www.pinterest.com/ideas/home-decor/935249274030/',
    'https://www.pinterest.com/a/b/c/d/',
    'http://www.pinterest.com/me/board/',
    'https://www.notpinterest.com/me/board/',
    'https://www.pinterest.com.evil.io/me/board/',
    'not a url',
  ])('rejects %s', (url) => {
    expect(matchPinterestBoard(url)).toBe(false);
  });

  it('canonicalizes board URLs', () => {
    expect(canonicalBoardUrl('https://FR.pinterest.com/me/board?x=1#y')).toBe('https://fr.pinterest.com/me/board/');
  });
});

describe('Pinterest image URLs', () => {
  const path = '92/c5/74/92c5745b2d932843c85d7a8a2b5fd8f3.jpg';

  it('parses size, path and hash', () => {
    expect(parsePinimgUrl(`https://i.pinimg.com/236x/${path}`)).toEqual({ size: '236x', path, hash: '92c5745b2d932843c85d7a8a2b5fd8f3' });
    expect(parsePinimgUrl('https://example.com/236x/a.jpg')).toBeNull();
  });

  it('parses srcset descriptors', () => {
    expect(parseSrcset('a.jpg 1x, b.jpg 2x,  c.jpg 736w')).toEqual([
      { url: 'a.jpg', weight: 1 },
      { url: 'b.jpg', weight: 2 },
      { url: 'c.jpg', weight: 736 },
    ]);
  });

  it('uses the original listed in srcset, with 736x as fallback', () => {
    const resolved = resolvePinImage(`https://i.pinimg.com/236x/${path}`, `https://i.pinimg.com/236x/${path} 1x, https://i.pinimg.com/originals/92/c5/74/92c5745b2d932843c85d7a8a2b5fd8f3.png 4x`);
    expect(resolved).toEqual({
      imageUrl: 'https://i.pinimg.com/originals/92/c5/74/92c5745b2d932843c85d7a8a2b5fd8f3.png',
      fallbackUrl: `https://i.pinimg.com/736x/${path}`,
      thumbUrl: `https://i.pinimg.com/236x/${path}`,
      hash: '92c5745b2d932843c85d7a8a2b5fd8f3',
    });
  });

  it('rebuilds the original when srcset does not list it', () => {
    expect(resolvePinImage(`https://i.pinimg.com/474x/${path}`, null)?.imageUrl).toBe(`https://i.pinimg.com/originals/${path}`);
  });

  it('recognizes avatars and video thumbnails', () => {
    expect(isAvatarSize('75x75_RS')).toBe(true);
    expect(isAvatarSize('60x60')).toBe(true);
    expect(isAvatarSize('236x')).toBe(false);
    expect(isAvatarSize('originals')).toBe(false);
    expect(isVideoThumbnail('https://i.pinimg.com/videos/thumbnails/originals/aa/bb/cc/x.0000000.jpg')).toBe(true);
  });
});

describe('board page (recorded, logged out)', () => {
  let doc: Document;
  beforeAll(() => {
    doc = loadDocument(fixture('pinterest-board-logged-out.html'));
  });

  it('reads the board meta', () => {
    const meta = getPinterestBoardMeta(doc, 'https://fr.pinterest.com/pinterestfr/week-end-foliage-en-france/?utm=x');
    expect(meta).toEqual({
      source: 'pinterest',
      title: 'Week-end foliage en France',
      url: 'https://fr.pinterest.com/pinterestfr/week-end-foliage-en-france/',
      expectedCount: 41,
    });
  });

  it('reads the board name, not the hidden "Pinterest" heading (seen signed in)', () => {
    const titled = (body: string, title = '') => loadDocument(`<title>${title}</title>${body}`);
    expect(readBoardTitle(titled('<h1>Pinterest</h1><div data-test-id="board-title"><h1>Saucisse Club</h1></div>'))).toBe('Saucisse Club');
    expect(readBoardTitle(titled('<h1>Pinterest</h1><main><h1>Birds</h1></main>'))).toBe('Birds');
    expect(readBoardTitle(titled('<h1>Pinterest</h1>', 'Birds | Pinterest'))).toBe('Birds');
    expect(readBoardTitle(titled('<h1>Pinterest</h1>', 'Pinterest'))).toBe('Pinterest board');
    // Unread counter in front of the page title.
    expect(readBoardTitle(titled('', '(20) Pinterest'))).toBe('Pinterest board');
    expect(readBoardTitle(titled('', '(3) Lamp | Pinterest'))).toBe('Lamp');
  });

  it('ignores a canonical link that is not the board (seen signed in)', () => {
    const signedIn = loadDocument('<link rel="canonical" href="https://www.pinterest.com/"><div data-test-id="board-title"><h1>Saucisse Club</h1></div>');
    expect(getPinterestBoardMeta(signedIn, 'https://www.pinterest.com/me/saucisse-club/').url).toBe('https://www.pinterest.com/me/saucisse-club/');
  });

  it("ignores the previous board's canonical link after an in-page navigation", () => {
    const stale = loadDocument('<link rel="canonical" href="https://www.pinterest.com/me/lamps/"><div data-test-id="board-title"><h1>Saucisse Club</h1></div>');
    expect(getPinterestBoardMeta(stale, 'https://fr.pinterest.com/me/saucisse-club/').url).toBe('https://fr.pinterest.com/me/saucisse-club/');
    // Same board on another host: the canonical one wins.
    expect(getPinterestBoardMeta(stale, 'https://fr.pinterest.com/me/Lamps').url).toBe('https://www.pinterest.com/me/lamps/');
  });

  it('collects every rendered pin once, in board order, at high resolution', () => {
    const readings = boardGridItems(doc).map(readGridItem);
    const images = readings.flatMap((r) => (r.kind === 'image' ? [r] : []));
    expect(readings).toHaveLength(25);
    expect(images).toHaveLength(25);
    expect(new Set(images.map((r) => r.key)).size).toBe(25);
    // Server-rendered cells carry no data-grid-item-idx: the collector then
    // keeps discovery order, which is DOM order.
    expect(images.every((r) => r.order === null)).toBe(true);

    for (const { item } of images) {
      expect(item.imageUrl).toMatch(/^https:\/\/i\.pinimg\.com\/originals\//);
      expect(item.fallbackUrl).toMatch(/^https:\/\/i\.pinimg\.com\/736x\//);
      expect(item.thumbUrl).toMatch(/^https:\/\/i\.pinimg\.com\/236x\//);
      expect(item.id).toMatch(/^img-[0-9a-f]+$/);
      expect(item.width).toBe(736);
      expect(item.height).toBeGreaterThan(100);
    }
  });

  it('ignores the board owner avatar', () => {
    const urls = boardGridItems(doc).map(readGridItem).flatMap((r) => (r.kind === 'image' ? [r.item.imageUrl] : []));
    expect(urls.some((url) => url.includes('_RS'))).toBe(false);
  });
});

describe('grid cells (logged-in markup)', () => {
  const cell = (inner: string) => loadDocument(`<div role="list"><div data-grid-item="true" role="listitem"><div data-grid-item-idx="7">${inner}</div></div></div>`).querySelector('[data-grid-item]')!;
  const img = (size = '236x') => `<img src="https://i.pinimg.com/${size}/ab/cd/ef/abcdef0123.jpg" srcset="https://i.pinimg.com/${size}/ab/cd/ef/abcdef0123.jpg 1x, https://i.pinimg.com/736x/ab/cd/ef/abcdef0123.jpg 3x">`;

  it('uses the pin id from the pin link', () => {
    const reading = readGridItem(cell(`<a href="/pin/987654321/">${img()}</a>`));
    expect(reading).toMatchObject({ kind: 'image', item: { id: '987654321' }, order: 7, key: 'abcdef0123' });
  });

  it('skips video pins', () => {
    expect(readGridItem(cell(`<a href="/pin/1/">${img()}<video></video></a>`))).toMatchObject({ kind: 'skip', reason: 'video' });
    expect(readGridItem(cell('<img src="https://i.pinimg.com/videos/thumbnails/originals/ab/cd/ef/x.0000000.jpg">'))).toMatchObject({ kind: 'skip', reason: 'video' });
  });

  it('skips sponsored pins', () => {
    expect(readGridItem(cell(`<div data-test-id="oneTapPromotedPin">${img()}</div>`))).toMatchObject({ kind: 'skip', reason: 'sponsored' });
  });

  it('returns empty for cells without a pin image', () => {
    expect(readGridItem(cell('<img src="https://i.pinimg.com/75x75_RS/aa/bb/cc/avatar.jpg">'))).toEqual({ kind: 'empty' });
  });

  it('extracts pin ids', () => {
    expect(extractPinId('/pin/123/')).toBe('123');
    expect(extractPinId('https://www.pinterest.com/pin/AbC-9_x/?nic=1')).toBe('AbC-9_x');
    expect(extractPinId('/me/board/')).toBeNull();
  });
});

describe('board list vs. "More like this"', () => {
  // Shape seen on a real board once scrolled: the board list is virtualized
  // (empty) and the recommendations list below it holds cells.
  const cellHtml = (hash: string, idx: number) =>
    `<div data-grid-item="true" role="listitem"><div data-grid-item-idx="${idx}"><img src="https://i.pinimg.com/236x/aa/bb/cc/${hash}.jpg"></div></div>`;

  it('locks the list found at the top and ignores recommendations later', () => {
    const doc = loadDocument(`<main><div role="list" id="board">${cellHtml('board1', 0)}${cellHtml('board2', 1)}</div><h2>More like this</h2><div role="list" id="more"></div></main>`);
    const lock = new BoardListLock(doc);
    expect(lock.get()?.id).toBe('board');

    // Scroll past the board: its cells unmount, recommendations mount.
    doc.getElementById('board')!.innerHTML = '';
    doc.getElementById('more')!.innerHTML = cellHtml('reco1', 0) + cellHtml('reco2', 1);

    expect(findBoardList(doc)?.id).toBe('more'); // the naive lookup is fooled…
    expect(lock.get()?.id).toBe('board'); // …the lock is not
    expect(boardGridItems(doc, lock.get())).toHaveLength(0);
  });

  it('finds the board list again by position if it is re-mounted', () => {
    const doc = loadDocument(`<main><section><div role="list" id="board">${cellHtml('b', 0)}</div></section><div role="list" id="more">${cellHtml('r', 0)}</div></main>`);
    const lock = new BoardListLock(doc);
    const section = doc.querySelector('section')!;
    section.innerHTML = `<div role="list" id="board-again">${cellHtml('b2', 5)}</div>`;
    expect(lock.get()?.id).toBe('board-again');
  });
});

describe('parsePinCount', () => {
  it.each([
    ['41 Épingles', 41],
    ['312 Pins', 312],
    ['1,234 Pins', 1234],
    ['1 234 Épingles', 1234],
    ['1 234 Épingles', 1234],
    ['1.234 Pins', 1234],
    ['1.2k Pins', null],
    ['3M Pins', null],
    ['', null],
    ['Pins', null],
  ])('%s → %s', (text, expected) => {
    expect(parsePinCount(text)).toBe(expected);
  });
});
