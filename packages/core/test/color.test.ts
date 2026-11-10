import { describe, expect, it } from 'vitest';
import {
  type Lab,
  NEUTRAL_CHROMA,
  analyzePixels,
  buildPalette,
  deltaE,
  groupByFamily,
  hexToOklab,
  hueCut,
  hueFamily,
  isNeutral,
  kmeans,
  labToHex,
  nameColors,
  nearestColorName,
  oklabToOklch,
  orderPalette,
  rgbToOklab,
  samplePixels,
  sortByColor,
} from '../src';

/** RGBA buffer made of `n` pixels of each given color. */
function pixels(...runs: [hex: string, count: number][]): Uint8ClampedArray {
  const out: number[] = [];
  for (const [hex, count] of runs) {
    const value = Number.parseInt(hex.slice(1), 16);
    for (let i = 0; i < count; i++) out.push((value >> 16) & 255, (value >> 8) & 255, value & 255, 255);
  }
  return new Uint8ClampedArray(out);
}

describe('OKLab', () => {
  it('matches reference values', () => {
    const white = rgbToOklab(255, 255, 255);
    expect(white.L).toBeCloseTo(1, 3);
    expect(Math.abs(white.a) + Math.abs(white.b)).toBeLessThan(1e-3);
    const red = rgbToOklab(255, 0, 0);
    expect(red.L).toBeCloseTo(0.628, 2);
    expect(red.a).toBeCloseTo(0.225, 2);
    expect(red.b).toBeCloseTo(0.126, 2);
  });

  it('round-trips through hex', () => {
    for (const hex of ['#000000', '#FFFFFF', '#B2442F', '#2554C7', '#9CAF88', '#FFDE21']) {
      expect(labToHex(hexToOklab(hex))).toBe(hex);
    }
  });

  it('gives hues in degrees', () => {
    expect(oklabToOklch(hexToOklab('#FF0000')).h).toBeGreaterThan(20);
    expect(oklabToOklch(hexToOklab('#FF0000')).h).toBeLessThan(35);
    expect(oklabToOklch(hexToOklab('#0000FF')).h).toBeGreaterThan(255);
  });
});

describe('kmeans', () => {
  it('finds well separated clusters, biggest first', () => {
    const points: Lab[] = [
      ...Array.from({ length: 60 }, (_, i) => hexToOklab(i % 2 ? '#FF0000' : '#F80808')),
      ...Array.from({ length: 30 }, () => hexToOklab('#0000FF')),
      ...Array.from({ length: 10 }, () => hexToOklab('#FFFFFF')),
    ];
    const clusters = kmeans(points, 3, { seed: 1 });
    expect(clusters.map((c) => c.count)).toEqual([60, 30, 10]);
    expect(deltaE(clusters[1]!.center, hexToOklab('#0000FF'))).toBeLessThan(0.01);
  });

  it('is deterministic and survives degenerate input', () => {
    const points = Array.from({ length: 50 }, (_, i) => rgbToOklab(i * 5, 100, 200 - i * 3));
    expect(kmeans(points, 4, { seed: 9 })).toEqual(kmeans(points, 4, { seed: 9 }));
    expect(kmeans([], 3)).toEqual([]);
    expect(kmeans([hexToOklab('#123456')], 4)).toHaveLength(1);
    expect(kmeans(Array.from({ length: 5 }, () => hexToOklab('#777777')), 3)).toHaveLength(1);
  });
});

describe('analyzePixels', () => {
  it('returns the biggest cluster as dominant color', () => {
    const analysis = analyzePixels(pixels(['#1E5631', 700], ['#F2E8CF', 250], ['#BC4749', 74]));
    expect(analysis).not.toBeNull();
    expect(labToHex(analysis!.dominant)).toBe('#1E5631');
  });

  it('ignores transparent pixels and empty images', () => {
    const rgba = pixels(['#FF0000', 10], ['#0000FF', 30]);
    for (let i = 40; i < rgba.length; i += 4) rgba[i + 3] = 0; // make the blue ones transparent
    expect(labToHex(analyzePixels(rgba)!.dominant)).toBe('#FF0000');
    expect(analyzePixels(new Uint8ClampedArray(0))).toBeNull();
  });

  it('samples a fixed number of pixels', () => {
    expect(samplePixels(pixels(['#FF0000', 500]), 50)).toHaveLength(50);
    expect(samplePixels(pixels(['#FF0000', 20]), 50)).toHaveLength(20);
  });
});

describe('sortByColor', () => {
  const lab = (hex: string) => hexToOklab(hex);

  it('orders chromatic colors by hue and puts neutrals last, light to dark', () => {
    const input = ['#000000', '#2554C7', '#FFFFFF', '#E3262F', '#2E9E4F', '#808080', '#FFDE21', '#FF7F00'];
    const sorted = sortByColor(input, lab);
    // Neutrals at the end, light to dark.
    expect(sorted.slice(-3)).toEqual(['#FFFFFF', '#808080', '#000000']);
    // Chromatic part follows the hue circle (rotation-agnostic): consecutive hues.
    const chromatic = sorted.slice(0, 5).map((hex) => oklabToOklch(lab(hex)).h);
    const steps = chromatic.slice(1).map((h, i) => (h - chromatic[i]! + 360) % 360);
    expect(steps.every((step) => step < 180)).toBe(true);
  });

  it('keeps items without a color at the very end, in order', () => {
    const sorted = sortByColor(['a', 'red', 'b'], (item) => (item === 'red' ? lab('#FF0000') : null));
    expect(sorted).toEqual(['red', 'a', 'b']);
  });

  it('cuts the hue circle at the widest gap', () => {
    // Hues cluster around 350..10 degrees: the cut must not split them.
    expect(hueCut([350, 355, 2, 8, 180])).toBe(180);
    expect(hueCut([10, 20, 30])).toBe(10);
    expect(hueCut([])).toBe(0);
  });

  it('produces a gradient without isolated hue jumps on a varied set', () => {
    const hexes = Array.from({ length: 36 }, (_, i) => {
      const hue = (i * 10) % 360;
      return hslHex(hue, 70, 50);
    });
    const sorted = sortByColor([...hexes].reverse(), lab).map((hex) => oklabToOklch(lab(hex)).h);
    const jumps = sorted.slice(1).filter((h, i) => {
      const step = Math.abs(h - sorted[i]!);
      return Math.min(step, 360 - step) > 45;
    });
    expect(jumps.length).toBeLessThanOrEqual(1);
  });
});

describe('hue families', () => {
  it('classifies typical colors', () => {
    expect(hueFamily(hexToOklab('#E3262F'))).toBe('red');
    expect(hueFamily(hexToOklab('#FF7F00'))).toBe('orange');
    expect(hueFamily(hexToOklab('#FFDE21'))).toBe('yellow');
    expect(hueFamily(hexToOklab('#2E9E4F'))).toBe('green');
    expect(hueFamily(hexToOklab('#00B7EB'))).toBe('cyan');
    expect(hueFamily(hexToOklab('#2554C7'))).toBe('blue');
    expect(hueFamily(hexToOklab('#6A0DAD'))).toBe('purple');
    expect(hueFamily(hexToOklab('#FF69B4'))).toBe('pink');
    expect(hueFamily(hexToOklab('#7A7A7A'))).toBe('neutral');
  });

  it('treats very low chroma as neutral', () => {
    expect(isNeutral({ L: 0.5, a: NEUTRAL_CHROMA / 2, b: 0 })).toBe(true);
    expect(isNeutral({ L: 0.5, a: NEUTRAL_CHROMA * 2, b: 0 })).toBe(false);
  });

  it('groups in family order, unknown items joining the neutral row', () => {
    const groups = groupByFamily(['#2554C7', '#E3262F', '?', '#FFFFFF', '#1560BD'], (hex) => (hex === '?' ? null : hexToOklab(hex)));
    expect(groups.map((g) => g.family)).toEqual(['red', 'blue', 'neutral']);
    expect(groups[1]!.items).toHaveLength(2);
    expect(groups[2]!.items).toEqual(['#FFFFFF', '?']);
  });
});

describe('palette', () => {
  it('orders a neutral palette from light to dark', () => {
    const lab = (hex: string) => ({ hex, lab: hexToOklab(hex) });
    const ordered = orderPalette([lab('#9A8A7A'), lab('#DFDAD3'), lab('#7E7062'), lab('#C7BEB6'), lab('#B1A497')]);
    expect(ordered.map((c) => c.hex)).toEqual(['#DFDAD3', '#C7BEB6', '#B1A497', '#9A8A7A', '#7E7062']);
  });

  it('orders a colorful palette as a smooth path from the lightest color', () => {
    const lab = (hex: string) => ({ hex, lab: hexToOklab(hex) });
    const input = [lab('#1E5631'), lab('#F3E9D2'), lab('#2554C7'), lab('#9CAF88'), lab('#14213D'), lab('#E2725B')];
    const ordered = orderPalette(input);
    const cost = (list: typeof input) => list.slice(1).reduce((sum, c, i) => sum + deltaE(c.lab, list[i]!.lab), 0);
    expect(ordered[0]!.hex).toBe('#F3E9D2');
    expect(cost(ordered)).toBeLessThanOrEqual(cost(input));
    // Reads as a gradient: the darkest color closes the palette.
    expect(ordered[ordered.length - 1]!.hex).toBe('#14213D');
    // Close hues stay together: pink next to red, not separated by green.
    const bright = orderPalette(['#E3262F', '#FFDE21', '#2554C7', '#FFFFFF', '#000000', '#2E9E4F', '#FF69B4'].map(lab));
    const at = (hex: string) => bright.findIndex((c) => c.hex === hex);
    expect(Math.abs(at('#FF69B4') - at('#E3262F'))).toBe(1);
  });

  it('returns the requested number of distinct colors, in display order', () => {
    const samples = [
      ...Array.from({ length: 400 }, () => hexToOklab('#F3E9D2')),
      ...Array.from({ length: 250 }, () => hexToOklab('#1E5631')),
      ...Array.from({ length: 150 }, () => hexToOklab('#BC4749')),
      ...Array.from({ length: 100 }, () => hexToOklab('#2554C7')),
      ...Array.from({ length: 60 }, () => hexToOklab('#FFDE21')),
      ...Array.from({ length: 40 }, () => hexToOklab('#111111')),
    ];
    const palette = buildPalette(samples, { count: 6 });
    expect(palette).toHaveLength(6);
    // Display order starts from the lightest color.
    expect(palette[0]!.hex).toBe('#F3E9D2');
    expect(palette.map((c) => c.hex)).toContain('#111111');
    for (let i = 0; i < palette.length; i++) {
      for (let j = i + 1; j < palette.length; j++) expect(deltaE(palette[i]!.lab, palette[j]!.lab)).toBeGreaterThanOrEqual(0.07);
    }
    expect(new Set(palette.map((c) => c.name)).size).toBe(6);
  });

  it('merges near-identical colors instead of listing them twice', () => {
    const samples = [
      ...Array.from({ length: 300 }, (_, i) => hexToOklab(i % 2 ? '#FF0000' : '#FA0505')),
      ...Array.from({ length: 300 }, () => hexToOklab('#0000FF')),
    ];
    const palette = buildPalette(samples, { count: 5 });
    expect(palette.length).toBeLessThanOrEqual(5);
    const reds = palette.filter((c) => hueFamily(c.lab) === 'red');
    expect(reds).toHaveLength(1);
  });

  it('clamps the count to 3..8 and handles no samples', () => {
    const samples = Array.from({ length: 500 }, (_, i) => rgbToOklab((i * 37) % 256, (i * 91) % 256, (i * 53) % 256));
    expect(buildPalette(samples, { count: 20 }).length).toBeLessThanOrEqual(8);
    expect(buildPalette(samples, { count: 3 })).toHaveLength(3);
    expect(buildPalette(samples, { count: 1 })).toHaveLength(3);
    expect(buildPalette([], { count: 6 })).toEqual([]);
  });
});

describe('color names', () => {
  it('names colors readably and uniquely', () => {
    expect(nearestColorName(hexToOklab('#B3452E'))).toBe('Brick Red');
    expect(nearestColorName(hexToOklab('#9DB089'))).toBe('Sage');
    expect(nearestColorName(hexToOklab('#FFFFFF'))).toBe('White');
    expect(nameColors([hexToOklab('#9CAF88'), hexToOklab('#9EB18A'), hexToOklab('#000000')])).toEqual(['Sage', 'Sage 2', 'Black']);
  });
});

function hslHex(h: number, s: number, l: number): string {
  const sat = s / 100;
  const light = l / 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = sat * Math.min(light, 1 - light);
  const f = (n: number) => Math.round(255 * (light - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1))));
  return `#${[f(0), f(8), f(4)].map((c) => c.toString(16).padStart(2, '0')).join('').toUpperCase()}`;
}
