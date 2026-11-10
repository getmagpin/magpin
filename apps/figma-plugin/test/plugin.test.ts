// @vitest-environment happy-dom
import { createPayload, encodePayload } from '@magpin/core';
import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { FIGMA_MAX_SIDE, fitScale, isFigmaNative, sniffImageType } from '../src/ui/images';
import { fromFiles, fromPastedText } from '../src/ui/sources';

const bytes = (...values: number[]) => new Uint8Array([...values, ...new Array(16).fill(0)]);

describe('sniffImageType', () => {
  it('recognizes formats from magic bytes', () => {
    expect(sniffImageType(bytes(0x89, 0x50, 0x4e, 0x47))).toBe('png');
    expect(sniffImageType(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe('jpeg');
    expect(sniffImageType(bytes(0x47, 0x49, 0x46, 0x38))).toBe('gif');
    expect(sniffImageType(bytes(0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50))).toBe('webp');
    expect(sniffImageType(bytes(0, 0, 0, 0x1c, 0x66, 0x74, 0x79, 0x70, 0x61, 0x76, 0x69, 0x66))).toBe('avif');
    expect(sniffImageType(bytes(1, 2, 3, 4))).toBeNull();
    expect(sniffImageType(new Uint8Array([0x89]))).toBeNull();
  });

  it('knows which formats Figma takes as-is', () => {
    expect(isFigmaNative('png')).toBe(true);
    expect(isFigmaNative('jpeg')).toBe(true);
    expect(isFigmaNative('gif')).toBe(true);
    expect(isFigmaNative('webp')).toBe(false);
    expect(isFigmaNative(null)).toBe(false);
  });
});

describe('fitScale', () => {
  it('keeps images under the limit and shrinks larger ones', () => {
    expect(fitScale(736, 1104)).toBe(1);
    expect(fitScale(FIGMA_MAX_SIDE, 100)).toBe(1);
    expect(fitScale(8192, 2000)).toBe(0.5);
    expect(fitScale(3000, 6000) * 6000).toBe(FIGMA_MAX_SIDE);
  });
});

const board = (title: string, ids: string[]) => ({
  source: 'pinterest' as const,
  title,
  url: 'https://www.pinterest.com/me/board/',
  items: ids.map((id) => ({ id, imageUrl: `https://i.pinimg.com/originals/aa/bb/cc/${id}.jpg`, fallbackUrl: `https://i.pinimg.com/736x/aa/bb/cc/${id}.jpg` })),
});

describe('fromPastedText', () => {
  it('builds one job per item across boards', () => {
    const text = encodePayload(createPayload([board('Café', ['1', '2']), board('Type', ['3'])]));
    const prepared = fromPastedText(text);
    expect('error' in prepared).toBe(false);
    if ('error' in prepared) return;
    expect(prepared.title).toBe('Café + 1 more');
    expect(prepared.boards).toEqual([
      { title: 'Café', count: 2, source: 'pinterest', url: 'https://www.pinterest.com/me/board/' },
      { title: 'Type', count: 1, source: 'pinterest', url: 'https://www.pinterest.com/me/board/' },
    ]);
    expect(prepared.jobs.map((job) => job.sourceId)).toEqual(['1', '2', '3']);
  });

  it('explains what went wrong', () => {
    expect(fromPastedText('hello')).toEqual({ error: expect.stringContaining('not a Magpin board') });
    expect(fromPastedText('MAGPIN:{"magpin":9,"boards":[]}')).toEqual({ error: expect.stringContaining('newer Magpin') });
  });
});

describe('fromFiles', () => {
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0, 0, 0, 0, 0]);

  it('restores board order from the Magpin ZIP manifest', async () => {
    const payload = createPayload([board('Café', ['b', 'a']), board('Café', ['c'])]);
    const zip = zipSync({
      'magpin.json': strToU8(encodePayload(payload)),
      // Written in a scrambled order on purpose.
      'Café (2)/1-c.png': png,
      'Café/2-a.png': png,
      'Café/1-b.png': png,
      'notes.txt': strToU8('ignored'),
    });
    const prepared = await fromFiles([new File([zip], 'Magpin - Café.zip')]);
    expect('error' in prepared).toBe(false);
    if ('error' in prepared) return;
    expect(prepared.jobs.map((job) => job.sourceId)).toEqual(['1-b', '2-a', '1-c']);
    expect(prepared.boards).toEqual([
      { title: 'Café', count: 2, source: 'pinterest', url: 'https://www.pinterest.com/me/board/' },
      { title: 'Café', count: 1, source: 'pinterest', url: 'https://www.pinterest.com/me/board/' },
    ]);
  });

  it('accepts a plain ZIP of images, sorted naturally', async () => {
    const zip = zipSync({ 'img10.png': png, 'img2.png': png, '__MACOSX/._img2.png': png });
    const prepared = await fromFiles([new File([zip], 'refs.zip')]);
    if ('error' in prepared) throw new Error(prepared.error);
    expect(prepared.jobs.map((job) => job.sourceId)).toEqual(['img2', 'img10']);
    expect(prepared.title).toBe('refs');
  });

  it('accepts loose images and rejects everything else', async () => {
    const loose = await fromFiles([new File([png], 'a.png')]);
    expect('error' in loose ? loose.error : loose.jobs.length).toBe(1);
    expect(await fromFiles([new File(['hello'], 'notes.txt')])).toEqual({ error: expect.stringContaining('No images found') });
  });
});
