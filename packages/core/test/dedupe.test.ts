import { describe, expect, it } from 'vitest';
import { dedupeItems, normalizeImageUrl } from '../src';

describe('normalizeImageUrl', () => {
  it('drops query and fragment and lowercases the host', () => {
    expect(normalizeImageUrl('https://I.PINIMG.com/736x/a/b.jpg?x=1#y')).toBe('https://i.pinimg.com/736x/a/b.jpg');
  });

  it('returns invalid input trimmed', () => {
    expect(normalizeImageUrl('  not a url ')).toBe('not a url');
  });
});

describe('dedupeItems', () => {
  it('removes duplicates by id and by URL, keeping the first', () => {
    const items = [
      { id: '1', imageUrl: 'https://cdn.example/a.jpg' },
      { id: '1', imageUrl: 'https://cdn.example/other.jpg' },
      { id: '2', imageUrl: 'https://cdn.example/a.jpg?size=2' },
      { id: '3', imageUrl: 'https://cdn.example/c.jpg' },
    ];
    expect(dedupeItems(items).map((item) => item.id)).toEqual(['1', '3']);
  });

  it('supports a source-specific key', () => {
    const items = [
      { id: 'a', imageUrl: 'https://i.pinimg.com/236x/ab/cd/ef/hash1.jpg', hash: 'hash1' },
      { id: 'b', imageUrl: 'https://i.pinimg.com/originals/ab/cd/ef/hash1.jpg', hash: 'hash1' },
      { id: 'c', imageUrl: 'https://i.pinimg.com/originals/ab/cd/ef/hash2.jpg', hash: 'hash2' },
    ];
    expect(dedupeItems(items, (item) => item.hash).map((item) => item.id)).toEqual(['a', 'c']);
  });
});
