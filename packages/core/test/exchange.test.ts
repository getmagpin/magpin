import { describe, expect, it } from 'vitest';
import {
  MAGPIN_PREFIX,
  countItems,
  createPayload,
  decodePayload,
  encodePayload,
  looksLikeMagpin,
  moodboardTitle,
  type ExchangeBoard,
} from '../src';

const board: ExchangeBoard = {
  source: 'pinterest',
  title: 'Branding café',
  url: 'https://www.pinterest.com/me/branding-cafe/',
  items: [
    { id: '1', imageUrl: 'https://i.pinimg.com/originals/aa/bb/cc/a.jpg', fallbackUrl: 'https://i.pinimg.com/736x/aa/bb/cc/a.jpg', width: 736, height: 1104 },
    { id: '2', imageUrl: 'https://i.pinimg.com/originals/dd/ee/ff/b.png' },
  ],
};

describe('exchange format', () => {
  it('round-trips through encode/decode', () => {
    const payload = createPayload([board], new Date('2026-11-08T21:00:00Z'));
    const text = encodePayload(payload);
    expect(text.startsWith(MAGPIN_PREFIX)).toBe(true);

    const result = decodePayload(text);
    expect(result).toEqual({ ok: true, payload, skippedItems: 0 });
  });

  it('matches the documented JSON shape', () => {
    const payload = createPayload([board], new Date('2026-11-08T21:00:00Z'));
    const json = JSON.parse(encodePayload(payload).slice(MAGPIN_PREFIX.length));
    expect(json).toMatchObject({ magpin: 1, createdAt: '2026-11-08T21:00:00.000Z', boards: [{ source: 'pinterest', title: 'Branding café' }] });
  });

  it('tolerates surrounding whitespace', () => {
    const text = `  \n${encodePayload(createPayload([board]))}\n `;
    expect(looksLikeMagpin(text)).toBe(true);
    expect(decodePayload(text).ok).toBe(true);
  });

  it('rejects text that is not Magpin', () => {
    expect(decodePayload('hello')).toEqual({ ok: false, error: 'not-magpin' });
    expect(looksLikeMagpin('{"magpin":1}')).toBe(false);
  });

  it('rejects broken JSON', () => {
    expect(decodePayload('MAGPIN:{oops')).toEqual({ ok: false, error: 'invalid-json' });
  });

  it('asks for an update on a newer version', () => {
    expect(decodePayload('MAGPIN:{"magpin":2,"boards":[]}')).toEqual({ ok: false, error: 'unsupported-version' });
  });

  it('rejects unknown sources and malformed boards', () => {
    expect(decodePayload('MAGPIN:{"magpin":1,"boards":[{"source":"flickr","items":[]}]}')).toEqual({ ok: false, error: 'invalid-structure' });
    expect(decodePayload('MAGPIN:{"magpin":1,"boards":{}}')).toEqual({ ok: false, error: 'invalid-structure' });
  });

  it('skips invalid items and keeps valid ones', () => {
    const text = MAGPIN_PREFIX + JSON.stringify({
      magpin: 1,
      createdAt: 'x',
      boards: [{
        source: 'pinterest', title: 'T', url: '', items: [
          { id: 'ok', imageUrl: 'https://i.pinimg.com/originals/a.jpg', width: 10, height: -1 },
          { id: 'http', imageUrl: 'http://insecure.example/a.jpg' },
          { id: '', imageUrl: 'https://i.pinimg.com/originals/b.jpg' },
          { imageUrl: 'https://i.pinimg.com/originals/c.jpg' },
          'nope',
        ],
      }],
    });
    const result = decodePayload(text);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.skippedItems).toBe(4);
    expect(result.payload.boards[0]!.items).toEqual([{ id: 'ok', imageUrl: 'https://i.pinimg.com/originals/a.jpg' }]);
  });

  it('reports an empty payload', () => {
    expect(decodePayload('MAGPIN:{"magpin":1,"boards":[]}')).toEqual({ ok: false, error: 'empty' });
  });

  it('defaults a missing title', () => {
    const result = decodePayload(MAGPIN_PREFIX + JSON.stringify({ magpin: 1, boards: [{ source: 'arena', items: [{ id: 'a', imageUrl: 'https://images.are.na/x' }] }] }));
    expect(result.ok && result.payload.boards[0]!.title).toBe('Untitled board');
  });

  it('counts items and names moodboards', () => {
    expect(countItems({ boards: [board, board] })).toBe(4);
    expect(moodboardTitle([board])).toBe('Branding café');
    expect(moodboardTitle([board, board, board])).toBe('Branding café + 2 more');
    expect(moodboardTitle([])).toBe('Untitled');
  });
});
