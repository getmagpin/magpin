// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ARENA_SELECTORS, arenaAdapter, arenaChannelSlug, arenaMetaFromChannel, decodeArenaImageUrl, getArenaPageMeta, matchArenaChannel, readArenaBlock, readArenaCell } from '../src/sources/arena/adapter';
import { COSMOS_SELECTORS, cosmosImageId, getCosmosMeta, matchCosmosCluster, readCosmosTile } from '../src/sources/cosmos/adapter';
import { findSource, sourceLabel } from '../src/sources';
import { SAVEE_SELECTORS, getSaveeMeta, matchSaveeBoard, parseSaveeAsset, readSaveeItem } from '../src/sources/savee/adapter';
import type { ItemReading } from '../src/sources/types';

const fixture = (name: string) => readFileSync(join(import.meta.dirname, 'fixtures', name), 'utf8');
const html = (name: string) => new DOMParser().parseFromString(fixture(name), 'text/html');
const images = (readings: ItemReading[]) => readings.flatMap((r) => (r.kind === 'image' ? [r] : []));

describe('source registry', () => {
  it.each([
    ['https://www.pinterest.com/me/board/', 'pinterest'],
    ['https://www.are.na/are-na-team/arena-influences', 'arena'],
    ['https://www.cosmos.so/yarron/packaging', 'cosmos'],
    ['https://savee.com/kugis/boards/web/', 'savee'],
    ['https://www.google.com/', null],
  ])('%s → %s', (url, id) => {
    expect(findSource(url)?.id ?? null).toBe(id);
  });

  it('labels sources', () => {
    expect(sourceLabel('arena')).toBe('Are.na');
    expect(sourceLabel('cosmos')).toBe('Cosmos');
  });
});

describe('Are.na', () => {
  it('matches channel URLs only', () => {
    expect(matchArenaChannel('https://www.are.na/are-na-team/arena-influences')).toBe(true);
    expect(matchArenaChannel('https://are.na/someone/my-channel?tab=x')).toBe(true);
    expect(arenaChannelSlug('https://www.are.na/are-na-team/arena-influences')).toBe('arena-influences');
    for (const url of ['https://www.are.na/', 'https://www.are.na/someone', 'https://www.are.na/block/123', 'https://www.are.na/explore/channels', 'https://www.are.na/someone/channels', 'https://www.are.na/a/b/c', 'http://www.are.na/a/b']) {
      expect(matchArenaChannel(url)).toBe(false);
    }
  });

  it('keeps image blocks with their original, counts embeds as videos', () => {
    const contents = JSON.parse(fixture('arena-contents.json')) as { data: Parameters<typeof readArenaBlock>[0][] };
    const readings = contents.data.map(readArenaBlock);
    const found = images(readings);
    expect(found).toHaveLength(8);
    expect(readings.filter((r) => r.kind === 'skip')).toHaveLength(2);
    for (const { item } of found) {
      expect(item.imageUrl).toMatch(/^https:\/\/d2w9rnfcy7mm78\.cloudfront\.net\/\d+\/original_/);
      expect(item.thumbUrl).toMatch(/^https:\/\/images\.are\.na\//);
      expect(item.fallbackUrl).toMatch(/^https:\/\/images\.are\.na\//);
      expect(item.width).toBeGreaterThan(0);
    }
  });

  it('reads the channel title, with no total (its counts take in every block, not only images)', () => {
    const channel = JSON.parse(fixture('arena-channel.json'));
    expect(arenaMetaFromChannel(channel, 'https://www.are.na/are-na-team/arena-influences?x=1')).toEqual({
      source: 'arena',
      title: 'Arena Influences',
      url: 'https://www.are.na/are-na-team/arena-influences/',
      expectedCount: null,
    });
  });
});

describe('Are.na page (private channels)', () => {
  it('decodes the original file key from images.are.na URLs', () => {
    const json = '{"bucket":"arena_images","key":"29774986/original_7c82b61a80fddb4f99555926decae37d.jpg","edits":{"resize":{"width":400}}}';
    const url = `https://images.are.na/${btoa(json)}`;
    expect(decodeArenaImageUrl(url)).toEqual({ key: '29774986/original_7c82b61a80fddb4f99555926decae37d.jpg' });
    expect(decodeArenaImageUrl('https://images.are.na/not-base64!')).toBeNull();
    expect(decodeArenaImageUrl('https://example.com/x.jpg')).toBeNull();
  });

  it('reads the blocks a channel page shows, with originals and board order', () => {
    const doc = html('arena-channel-page.html');
    const cells = Array.from(doc.querySelector(ARENA_SELECTORS.list)!.querySelectorAll(ARENA_SELECTORS.cell));
    expect(cells.length).toBeGreaterThan(20);
    const found = images(cells.map(readArenaCell));
    // 32 rendered cells, of which text, link and embed blocks are not images.
    expect(found.length).toBeGreaterThanOrEqual(12);
    expect(new Set(found.map((r) => r.item.id)).size).toBe(found.length);
    for (const { item, order } of found) {
      expect(item.id).toMatch(/^\d+$/);
      // File names vary (hash, old upload names, no extension): only the shape matters.
      expect(item.imageUrl).toMatch(/^https:\/\/d2w9rnfcy7mm78\.cloudfront\.net\/\d+\/original_[^/]+$/);
      // Resized rendition, or the CDN file itself for GIFs.
      expect(item.thumbUrl).toMatch(/^https:\/\/(images\.are\.na|d2w9rnfcy7mm78\.cloudfront\.net)\//);
      expect(order).not.toBeNull();
    }
  });

  it('keeps image blocks only, like the API (types checked against the API)', () => {
    // Block types of the recorded channel, as the public API reports them.
    const expected: Record<string, string> = {
      '137005': 'video', '399146': 'video', '529716': 'video',
      '101962': 'empty', '1154772': 'empty', '996783': 'empty',
      '12664': 'image', '243625': 'image', '717590': 'image', '841357': 'image', '854486': 'image', '932': 'image',
      '1236138': 'empty', '409888': 'empty',
    };
    const doc = html('arena-channel-page.html');
    for (const cell of Array.from(doc.querySelectorAll(ARENA_SELECTORS.cell))) {
      const id = /\/block\/(\d+)/.exec(cell.querySelector('a')?.getAttribute('href') ?? '')?.[1];
      if (!id || !(id in expected)) continue;
      const reading = readArenaCell(cell);
      const got = reading.kind === 'skip' ? reading.reason : reading.kind;
      expect([id, got]).toEqual([id, expected[id]]);
    }
  });

  it('reads the channel title from the page', () => {
    expect(getArenaPageMeta(html('arena-channel-page.html'), 'https://www.are.na/are-na-team/arena-influences')).toMatchObject({
      source: 'arena',
      title: 'Arena Influences',
      url: 'https://www.are.na/are-na-team/arena-influences/',
      expectedCount: null,
    });
  });
});

describe('Cosmos', () => {
  it('matches cluster URLs only', () => {
    expect(matchCosmosCluster('https://www.cosmos.so/yarron/packaging')).toBe(true);
    expect(matchCosmosCluster('https://cosmos.so/yarron/packaging/sub')).toBe(true);
    for (const url of ['https://www.cosmos.so/', 'https://www.cosmos.so/yarron', 'https://www.cosmos.so/explore/branding', 'https://www.cosmos.so/e/12345', 'https://www.cosmos.so/search/elements/x']) {
      expect(matchCosmosCluster(url)).toBe(false);
    }
  });

  it('reads tiles from a recorded cluster page, at full resolution', () => {
    const doc = html('cosmos-cluster.html');
    const tiles = Array.from(doc.querySelector(COSMOS_SELECTORS.grid)!.querySelectorAll(COSMOS_SELECTORS.tile));
    expect(tiles.length).toBeGreaterThan(50);
    const readings = tiles.map(readCosmosTile);
    const found = images(readings);
    expect(found.length).toBeGreaterThan(50);
    expect(new Set(found.map((r) => r.item.id)).size).toBe(found.length);
    for (const { item, order } of found) {
      expect(item.imageUrl).toMatch(/^https:\/\/cdn\.cosmos\.so\/[0-9a-f-]{36}$/);
      expect(item.thumbUrl).toContain('w=400');
      expect(item.width).toBeGreaterThan(0);
      expect(order).not.toBeNull();
    }
    expect(readings.some((r) => r.kind === 'skip' && r.reason === 'video')).toBe(true);
  });

  it('reads the cluster title', () => {
    expect(getCosmosMeta(html('cosmos-cluster.html'), 'https://www.cosmos.so/yarron/packaging')).toMatchObject({ source: 'cosmos', title: 'Packaging', url: 'https://www.cosmos.so/yarron/packaging/' });
  });

  it('extracts image ids from any rendition', () => {
    expect(cosmosImageId('https://cdn.cosmos.so/01A11B54-427b-7766-80ec-b27e8a411838?format=webp&w=400')).toBe('01a11b54-427b-7766-80ec-b27e8a411838');
    expect(cosmosImageId('https://example.com/x')).toBeNull();
  });
});

describe('Savee', () => {
  it('matches board URLs only', () => {
    expect(matchSaveeBoard('https://savee.com/kugis/boards/web/')).toBe(true);
    for (const url of ['https://savee.com/', 'https://savee.com/kugis/', 'https://savee.com/kugis/boards/', 'https://savee.com/i/abc/', 'https://savee.com/features/']) {
      expect(matchSaveeBoard(url)).toBe(false);
    }
  });

  it('reads items from a recorded board page and skips videos', () => {
    const doc = html('savee-board.html');
    const cells = Array.from(doc.querySelectorAll(SAVEE_SELECTORS.item));
    expect(cells.length).toBeGreaterThan(20);
    const readings = cells.map(readSaveeItem);
    const found = images(readings);
    expect(found.length).toBeGreaterThan(15);
    expect(readings.some((r) => r.kind === 'skip' && r.reason === 'video')).toBe(true);
    for (const { item } of found) {
      expect(item.imageUrl).toMatch(/^https:\/\/dm\.savee-cdn\.com\/asset-image\/original\/[0-9a-z]+\.jpg$/);
      expect(item.thumbUrl).toMatch(/\/w420\/[0-9a-z]+\.jpg$/);
    }
  });

  it('parses asset URLs and reads the title', () => {
    expect(parseSaveeAsset('https://dm.savee-cdn.com/asset-image/w420/6ae619ec3c9caf45864f9e0e.avif')).toEqual({ host: 'dm.savee-cdn.com', kind: 'asset-image', id: '6ae619ec3c9caf45864f9e0e' });
    expect(getSaveeMeta(html('savee-board.html'), 'https://savee.com/kugis/boards/web/')).toMatchObject({ source: 'savee', title: '! web' });
  });
});

describe('Are.na reading through the API', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('stopped mid-way, ends with what it read so far instead of an error', async () => {
    vi.stubGlobal('location', { href: 'https://www.are.na/are-na-team/arena-influences' });
    const controller = new AbortController();
    let calls = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        if (calls++ === 0) return { ok: true, status: 200, json: async () => JSON.parse(fixture('arena-contents.json')) };
        // Stop pressed while the second page is on its way.
        controller.abort();
        throw new DOMException('signal is aborted without reason', 'AbortError');
      }),
    );
    const result = await arenaAdapter.collectItems(() => undefined, controller.signal);
    expect(result.items).toHaveLength(8);
    expect(result.skipped.video).toBe(2);
  });
});
