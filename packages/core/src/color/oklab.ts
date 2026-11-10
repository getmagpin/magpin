/**
 * sRGB ↔ OKLab ↔ OKLCH (Björn Ottosson, 2020). OKLab is perceptually uniform:
 * Euclidean distance approximates how different two colors look (ΔE OK).
 */

/** 8-bit sRGB channels, 0..255. */
export interface Rgb {
  r: number;
  g: number;
  b: number;
}

/** L in 0..1, a and b roughly −0.4..0.4. */
export interface Lab {
  L: number;
  a: number;
  b: number;
}

/** L 0..1, chroma C ≥ 0, hue h in degrees 0..360. */
export interface Lch {
  L: number;
  C: number;
  h: number;
}

const LINEAR = Array.from({ length: 256 }, (_, c) => {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
});

function fromLinear(v: number): number {
  // Out-of-gamut values are clipped.
  const c = v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
  return Number.isFinite(c) ? Math.min(255, Math.max(0, Math.round(c * 255))) : 0;
}

export function rgbToOklab(r: number, g: number, b: number): Lab {
  const lr = LINEAR[r & 255]!;
  const lg = LINEAR[g & 255]!;
  const lb = LINEAR[b & 255]!;
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  return {
    L: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    a: 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    b: 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  };
}

export function oklabToRgb({ L, a, b }: Lab): Rgb {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return {
    r: fromLinear(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    g: fromLinear(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    b: fromLinear(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  };
}

export function oklabToOklch({ L, a, b }: Lab): Lch {
  const C = Math.sqrt(a * a + b * b);
  const h = ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360;
  return { L, C, h };
}

export function chroma({ a, b }: Lab): number {
  return Math.sqrt(a * a + b * b);
}

/** ΔE OK: Euclidean distance in OKLab. */
export function deltaE(x: Lab, y: Lab): number {
  const dL = x.L - y.L;
  const da = x.a - y.a;
  const db = x.b - y.b;
  return Math.sqrt(dL * dL + da * da + db * db);
}

export function mixLab(colors: readonly Lab[], weights?: readonly number[]): Lab {
  let L = 0;
  let a = 0;
  let b = 0;
  let total = 0;
  colors.forEach((color, i) => {
    const w = weights?.[i] ?? 1;
    L += color.L * w;
    a += color.a * w;
    b += color.b * w;
    total += w;
  });
  if (total === 0) return { L: 0, a: 0, b: 0 };
  return { L: L / total, a: a / total, b: b / total };
}

export function rgbToHex({ r, g, b }: Rgb): string {
  return `#${[r, g, b].map((c) => c.toString(16).padStart(2, '0')).join('').toUpperCase()}`;
}

export function hexToRgb(hex: string): Rgb {
  const clean = hex.replace('#', '');
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean;
  const value = Number.parseInt(full, 16);
  return { r: (value >> 16) & 255, g: (value >> 8) & 255, b: value & 255 };
}

export function hexToOklab(hex: string): Lab {
  const { r, g, b } = hexToRgb(hex);
  return rgbToOklab(r, g, b);
}

export function labToHex(lab: Lab): string {
  return rgbToHex(oklabToRgb(lab));
}
