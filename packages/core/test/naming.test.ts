import { describe, expect, it } from 'vitest';
import { imageExtension, layerNumber, sanitizeFileName, uniqueFolderNames, zipEntryName, zipFileName } from '../src';

describe('sanitizeFileName', () => {
  it('removes forbidden characters and trims', () => {
    expect(sanitizeFileName('  Brand: "café" / 2026?  ')).toBe('Brand café 2026');
    expect(sanitizeFileName('...hidden...')).toBe('hidden');
    expect(sanitizeFileName('a\u0000b')).toBe('a b');
  });

  it('falls back when nothing is left', () => {
    expect(sanitizeFileName('???')).toBe('board');
    expect(sanitizeFileName('', 'x')).toBe('x');
  });

  it('limits the length', () => {
    expect(sanitizeFileName('a'.repeat(200))).toHaveLength(80);
  });
});

describe('uniqueFolderNames', () => {
  it('suffixes repeated titles, case-insensitively', () => {
    expect(uniqueFolderNames(['Moodboard', 'moodboard', 'Other', 'Moodboard'])).toEqual(['Moodboard', 'moodboard (2)', 'Other', 'Moodboard (3)']);
  });
});

describe('zipEntryName', () => {
  it('pads the 1-based index to the total width', () => {
    expect(zipEntryName(0, 312, '123', 'jpg')).toBe('001-123.jpg');
    expect(zipEntryName(9, 9, 'abc', 'png')).toBe('10-abc.png');
    expect(zipEntryName(4, 1000, 'x/y', 'gif')).toBe('0005-x y.gif');
  });
});

describe('layerNumber', () => {
  it('numbers from 1, padded to the total, at least two digits', () => {
    expect(layerNumber(0, 14)).toBe('01');
    expect(layerNumber(13, 14)).toBe('14');
    expect(layerNumber(0, 170)).toBe('001');
    expect(layerNumber(169, 170)).toBe('170');
    expect(layerNumber(0, 1)).toBe('01');
    expect(layerNumber(41, 1200)).toBe('0042');
  });
});

describe('imageExtension', () => {
  it('prefers the content type', () => {
    expect(imageExtension('image/png; charset=binary', 'https://x/a.jpg')).toBe('png');
    expect(imageExtension('image/webp', 'https://x/a')).toBe('webp');
  });

  it('falls back to the URL, then to jpg', () => {
    expect(imageExtension(null, 'https://x/a.JPEG?x=1')).toBe('jpg');
    expect(imageExtension('application/octet-stream', 'https://x/a.gif')).toBe('gif');
    expect(imageExtension(null, 'https://x/a')).toBe('jpg');
  });
});

describe('zipFileName', () => {
  it('names the archive after the board', () => {
    expect(zipFileName(['Branding café'])).toBe('Magpin - Branding café.zip');
    expect(zipFileName(['a', 'b', 'c'])).toBe('Magpin - 3 boards.zip');
  });
});
