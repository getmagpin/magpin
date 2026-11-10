/**
 * Magpin cards: 36 small comic panels, each a coloured scene with the magpie's
 * head at the bottom (the logo's own path). They are the "images" of the
 * website's demos, one main colour each so the colour sort reads at a glance.
 *
 *   node assets/cards/generate.ts
 *
 * Writes assets/cards/svg/*.svg (framed panels), apps/site/public/cards/*.svg
 * (frameless, the site draws the frame) and apps/site/src/cards.gen.ts (the
 * list with each card's colour and shape). Rendering to PNG/WebP is optional.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MARK_CLOSED_PATH } from '../../packages/ui/src/logo-closed-path.ts';
import { MARK_PATH } from '../../packages/ui/src/logo-path.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const INK = '#141210';
const W = 400;

type Pt = [number, number];
type Rng = () => number;
type Pose = 'open' | 'squint' | 'closed' | 'twig';

interface Spec {
  name: string;
  h: number;
  s: number;
  l: number;
  motif: Motif;
  pose?: Pose;
  /** Height over width. */
  ratio: number;
  /** Bird nudges: x offset (fraction of width) and tilt in degrees. */
  dx?: number;
  tilt?: number;
}

interface Pal {
  top: string;
  bottom: string;
  base: string;
  deep: string;
  mid: string;
  light: string;
  pale: string;
  h: number;
  s: number;
  l: number;
}

interface Ctx {
  W: number;
  H: number;
  rng: Rng;
  pal: Pal;
  /** The head, roughly: centre and radius. */
  head: { x: number; y: number; r: number };
  hsl: (h: number, s: number, l: number, a?: number) => string;
}

type Motif = (c: Ctx) => { back: string; front?: string };

// ---------- small helpers ----------

function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const n1 = (v: number) => String(Math.round(v * 10) / 10);
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const hsl = (h: number, s: number, l: number, a = 1) => {
  const hh = Math.round(((h % 360) + 360) % 360);
  const body = `${hh} ${clamp(Math.round(s), 0, 100)}% ${clamp(Math.round(l), 3, 97)}%`;
  return a === 1 ? `hsl(${body})` : `hsl(${body} / ${a})`;
};
const between = (rng: Rng, lo: number, hi: number) => lo + rng() * (hi - lo);

/** Smooth curve through points (Catmull-Rom as cubic Béziers). */
function curve(points: Pt[], closed = false): string {
  const p = points;
  const n = p.length;
  if (n < 2) return '';
  const at = (i: number): Pt => (closed ? p[(i + n) % n]! : p[clamp(i, 0, n - 1)]!);
  let d = `M${n1(p[0]![0])} ${n1(p[0]![1])}`;
  const last = closed ? n : n - 1;
  for (let i = 0; i < last; i++) {
    const p0 = at(i - 1);
    const p1 = at(i);
    const p2 = at(i + 1);
    const p3 = at(i + 2);
    const c1: Pt = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2: Pt = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += `C${n1(c1[0])} ${n1(c1[1])} ${n1(c2[0])} ${n1(c2[1])} ${n1(p2[0])} ${n1(p2[1])}`;
  }
  return closed ? `${d}Z` : d;
}

/** A hand-drawn straight line: a few points nudged off the ruler. */
function hand(x1: number, y1: number, x2: number, y2: number, rng: Rng, amp = 1.4, steps = 3): string {
  const pts: Pt[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const j = i === 0 || i === steps ? 0 : (rng() - 0.5) * 2 * amp;
    const len = Math.hypot(x2 - x1, y2 - y1) || 1;
    const nx = -(y2 - y1) / len;
    const ny = (x2 - x1) / len;
    pts.push([x1 + (x2 - x1) * t + nx * j, y1 + (y2 - y1) * t + ny * j]);
  }
  return curve(pts);
}

const stroke = (d: string, w: number, color = INK, extra = '') =>
  `<path d="${d}" fill="none" stroke="${color}" stroke-width="${n1(w)}" stroke-linecap="round" stroke-linejoin="round"${extra}/>`;
const shape = (d: string, fill: string, w = 3.2, color = INK, extra = '') =>
  `<path d="${d}" fill="${fill}"${w > 0 ? ` stroke="${color}" stroke-width="${n1(w)}" stroke-linejoin="round"` : ''}${extra}/>`;
const rot = (x: number, y: number, deg: number) => `transform="rotate(${n1(deg)} ${n1(x)} ${n1(y)})"`;

/** Points of a closed blob around a centre. */
function blob(cx: number, cy: number, rx: number, ry: number, rng: Rng, wob = 0.06, k = 10): Pt[] {
  const pts: Pt[] = [];
  for (let i = 0; i < k; i++) {
    const a = (i / k) * Math.PI * 2;
    const f = 1 + (rng() - 0.5) * 2 * wob;
    pts.push([cx + Math.cos(a) * rx * f, cy + Math.sin(a) * ry * f]);
  }
  return pts;
}

/** Four-point sparkle. */
function sparkle(x: number, y: number, r: number, fill = '#fff'): string {
  const k = r * 0.16;
  return `<path d="M${n1(x)} ${n1(y - r)}Q${n1(x + k)} ${n1(y - k)} ${n1(x + r)} ${n1(y)}Q${n1(x + k)} ${n1(y + k)} ${n1(x)} ${n1(y + r)}Q${n1(x - k)} ${n1(y + k)} ${n1(x - r)} ${n1(y)}Q${n1(x - k)} ${n1(y - k)} ${n1(x)} ${n1(y - r)}Z" fill="${fill}"/>`;
}

/** Asterisk star, drawn with strokes. */
function asterisk(x: number, y: number, r: number, rng: Rng, color = '#fff', w = 2.4): string {
  let out = '';
  const a0 = rng() * Math.PI;
  for (let i = 0; i < 4; i++) {
    const a = a0 + (i * Math.PI) / 4;
    out += stroke(`M${n1(x - Math.cos(a) * r)} ${n1(y - Math.sin(a) * r)}L${n1(x + Math.cos(a) * r)} ${n1(y + Math.sin(a) * r)}`, w, color);
  }
  return out;
}

function star5(x: number, y: number, r: number, deg: number): string {
  const pts: Pt[] = [];
  for (let i = 0; i < 10; i++) {
    const a = ((i * 36 + deg - 90) * Math.PI) / 180;
    const rr = i % 2 ? r * 0.46 : r;
    pts.push([x + Math.cos(a) * rr, y + Math.sin(a) * rr]);
  }
  return `M${pts.map(([a, b]) => `${n1(a)} ${n1(b)}`).join('L')}Z`;
}

function heart(x: number, y: number, s: number): string {
  // A heart of width ~2s, point at the bottom.
  return `M${n1(x)} ${n1(y + s * 0.9)}C${n1(x - s * 1.25)} ${n1(y + s * 0.05)} ${n1(x - s * 0.95)} ${n1(y - s * 0.95)} ${n1(x)} ${n1(y - s * 0.35)}C${n1(x + s * 0.95)} ${n1(y - s * 0.95)} ${n1(x + s * 1.25)} ${n1(y + s * 0.05)} ${n1(x)} ${n1(y + s * 0.9)}Z`;
}

function leaf(x: number, y: number, len: number, deg: number, fill: string, w = 3, vein = true): string {
  const half = len / 2;
  const wid = len * 0.32;
  const d = `M${n1(x - half)} ${n1(y)}C${n1(x - half * 0.4)} ${n1(y - wid)} ${n1(x + half * 0.5)} ${n1(y - wid * 0.9)} ${n1(x + half)} ${n1(y)}C${n1(x + half * 0.5)} ${n1(y + wid * 0.9)} ${n1(x - half * 0.4)} ${n1(y + wid)} ${n1(x - half)} ${n1(y)}Z`;
  const v = vein ? stroke(`M${n1(x - half * 0.85)} ${n1(y)}Q${n1(x)} ${n1(y - wid * 0.12)} ${n1(x + half * 0.7)} ${n1(y)}`, w * 0.7) : '';
  return `<g ${rot(x, y, deg)}>${shape(d, fill, w)}${v}</g>`;
}

/**
 * Cloud: round puffs on a flat bottom, (x, y) its bottom left. Drawn twice, ink
 * outline under the fill, so the puffs merge into one outlined shape.
 */
function cloud(x: number, y: number, w: number, rng: Rng, fill: string, sw = 3.2): string {
  const puffs: [number, number, number][] = [];
  const k = 4;
  for (let i = 0; i < k; i++) {
    const t = (i + 0.5) / k;
    const r = w * (0.13 + Math.sin(t * Math.PI) * 0.1 + rng() * 0.04);
    puffs.push([x + w * t, y - r * 0.85, r]);
  }
  const base = `<rect x="${n1(x + w * 0.08)}" y="${n1(y - w * 0.12)}" width="${n1(w * 0.84)}" height="${n1(w * 0.12)}" rx="${n1(w * 0.06)}"`;
  const circles = (extra: string) => puffs.map(([cx, cy, r]) => `<circle cx="${n1(cx)}" cy="${n1(cy)}" r="${n1(r)}"${extra}/>`).join('');
  return `<g>${circles(` fill="${INK}" stroke="${INK}" stroke-width="${n1(sw * 2)}"`)}${base} fill="${INK}" stroke="${INK}" stroke-width="${n1(sw * 2)}"/>${circles(` fill="${fill}"`)}${base} fill="${fill}"/></g>`;
}

/** Focus lines from the edges toward the middle (manga). */
function focusLines(c: Ctx, count: number, color = INK, inner = 0.62): string {
  const { W: w, H: h, rng } = c;
  const cx = w / 2;
  const cy = h * 0.55;
  let out = '';
  for (let i = 0; i < count; i++) {
    const a = rng() * Math.PI * 2;
    const far = Math.hypot(w, h);
    const r1 = far * (inner + rng() * 0.12);
    const x1 = cx + Math.cos(a) * r1;
    const y1 = cy + Math.sin(a) * r1;
    const x2 = cx + Math.cos(a) * far;
    const y2 = cy + Math.sin(a) * far;
    out += stroke(`M${n1(x1)} ${n1(y1)}L${n1(x2)} ${n1(y2)}`, 1.6 + rng() * 2.2, color);
  }
  return out;
}

// ---------- motifs ----------

const burst: Motif = (c) => {
  const { W: w, H: h, pal, head } = c;
  const cx = head.x;
  const cy = head.y - head.r * 0.4;
  let out = '';
  const k = 16;
  const far = Math.hypot(w, h) * 1.2;
  for (let i = 0; i < k; i++) {
    if (i % 2) continue;
    const a1 = (i / k) * Math.PI * 2;
    const a2 = ((i + 1) / k) * Math.PI * 2;
    out += `<path d="M${n1(cx)} ${n1(cy)}L${n1(cx + Math.cos(a1) * far)} ${n1(cy + Math.sin(a1) * far)}L${n1(cx + Math.cos(a2) * far)} ${n1(cy + Math.sin(a2) * far)}Z" fill="${pal.light}"/>`;
  }
  out += `<circle cx="${n1(cx)}" cy="${n1(cy)}" r="${n1(head.r * 1.9)}" fill="${pal.pale}" opacity="0.55"/>`;
  out += focusLines(c, 46, INK, 0.5);
  return { back: out };
};

const flames: Motif = (c) => {
  const { W: w, H: h, rng, pal, hsl: col } = c;
  let out = '';
  const flame = (x: number, base: number, fh: number, fw: number, fill: string) => {
    const pts: Pt[] = [
      [x - fw / 2, base],
      [x - fw * 0.5 + between(rng, -6, 6), base - fh * 0.35],
      [x - fw * 0.22, base - fh * 0.72],
      [x + between(rng, -fw * 0.2, fw * 0.2), base - fh],
      [x + fw * 0.28, base - fh * 0.66],
      [x + fw * 0.52, base - fh * 0.3],
      [x + fw / 2, base],
    ];
    return shape(curve(pts, true), fill, 3.4);
  };
  const xs = [0.08, 0.3, 0.55, 0.78, 0.98, 0.18, 0.66, 0.9, 0.42];
  xs.forEach((fx, i) => {
    const fh = h * between(rng, 0.45, 0.85);
    out += flame(w * fx, h + 30, fh, w * between(rng, 0.22, 0.34), i < 5 ? pal.deep : pal.mid);
  });
  xs.slice(0, 6).forEach((fx) => {
    out += flame(w * fx, h + 20, h * between(rng, 0.25, 0.45), w * 0.14, col(pal.h + 26, 95, 70));
  });
  for (let i = 0; i < 12; i++) out += `<circle cx="${n1(rng() * w)}" cy="${n1(rng() * h * 0.5)}" r="${n1(between(rng, 2, 5))}" fill="${col(pal.h + 30, 95, 78)}"/>`;
  return { back: out };
};

const halftone: Motif = (c) => {
  const { W: w, H: h, pal } = c;
  let out = '';
  const step = 22;
  for (let row = 0, y = 6; y < h + step; row++, y += step * 0.86) {
    for (let x = (row % 2) * (step / 2); x < w + step; x += step) {
      const t = clamp(1 - Math.hypot(x - w * 0.95, y - h * 0.05) / (w * 1.15), 0, 1);
      if (t < 0.05) continue;
      out += `<circle cx="${n1(x)}" cy="${n1(y)}" r="${n1(1 + t * 9.5)}" fill="${pal.deep}"/>`;
    }
  }
  for (let i = 0; i < 7; i++) out += sparkle(c.rng() * w * 0.6, c.rng() * h * 0.5, between(c.rng, 6, 13));
  return { back: out };
};

const coins: Motif = (c) => {
  const { W: w, H: h, rng, pal, hsl: col } = c;
  let out = '';
  const coin = (x: number, y: number, r: number, tilt: number, deg: number) => {
    const ry = r * tilt;
    return `<g ${rot(x, y, deg)}><ellipse cx="${n1(x)}" cy="${n1(y + r * 0.12)}" rx="${n1(r)}" ry="${n1(ry)}" fill="${col(pal.h - 6, 70, 36)}" stroke="${INK}" stroke-width="3"/><ellipse cx="${n1(x)}" cy="${n1(y)}" rx="${n1(r)}" ry="${n1(ry)}" fill="${col(pal.h + 4, 92, 64)}" stroke="${INK}" stroke-width="3"/><ellipse cx="${n1(x)}" cy="${n1(y)}" rx="${n1(r * 0.66)}" ry="${n1(ry * 0.66)}" fill="none" stroke="${INK}" stroke-width="2"/>${stroke(`M${n1(x - r * 0.62)} ${n1(y - ry * 0.25)}Q${n1(x - r * 0.5)} ${n1(y - ry * 0.75)} ${n1(x - r * 0.05)} ${n1(y - ry * 0.85)}`, 3, '#fff')}</g>`;
  };
  const spots: [number, number, number][] = [
    [0.14, 0.12, 30], [0.5, 0.08, 22], [0.84, 0.16, 34], [0.3, 0.34, 26], [0.72, 0.4, 24], [0.1, 0.52, 22], [0.92, 0.58, 20], [0.56, 0.26, 16],
  ];
  for (const [fx, fy, r] of spots) out += coin(w * fx, h * fy, r * 1.15, between(rng, 0.35, 0.95), between(rng, -30, 30));
  for (let i = 0; i < 9; i++) out += sparkle(rng() * w, rng() * h * 0.6, between(rng, 5, 12));
  return { back: out, front: coin(w * 0.2, h * 0.9, 30, 0.42, -12) };
};

const sun: Motif = (c) => {
  const { W: w, pal, rng, head } = c;
  const cx = head.x - head.r * 0.1;
  const cy = head.y - head.r * 1.5;
  const R = w * 0.22;
  let out = '';
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2 + 0.1;
    const len = i % 2 ? R * 1.9 : R * 2.6;
    const a1 = a - 0.09;
    const a2 = a + 0.09;
    out += shape(`M${n1(cx + Math.cos(a1) * R * 1.1)} ${n1(cy + Math.sin(a1) * R * 1.1)}L${n1(cx + Math.cos(a) * len)} ${n1(cy + Math.sin(a) * len)}L${n1(cx + Math.cos(a2) * R * 1.1)} ${n1(cy + Math.sin(a2) * R * 1.1)}Z`, pal.light, 3);
  }
  out += shape(curve(blob(cx, cy, R, R, rng, 0.02, 14), true), pal.pale, 3.4);
  out += stroke(`M${n1(cx - R * 0.55)} ${n1(cy - R * 0.3)}Q${n1(cx - R * 0.45)} ${n1(cy - R * 0.62)} ${n1(cx - R * 0.1)} ${n1(cy - R * 0.7)}`, 3.4, '#fff');
  return { back: out };
};

const stars: Motif = (c) => {
  const { W: w, H: h, rng, pal } = c;
  let out = '';
  const pts: [number, number, number][] = [
    [0.15, 0.1, 30], [0.52, 0.16, 22], [0.86, 0.09, 26], [0.3, 0.38, 20], [0.75, 0.36, 34], [0.08, 0.6, 18], [0.95, 0.62, 16], [0.48, 0.02, 12],
  ];
  for (const [fx, fy, r] of pts) out += shape(star5(w * fx, h * fy, r * 1.1, between(rng, -20, 20)), rng() < 0.5 ? pal.pale : '#fff', 3.2);
  for (let i = 0; i < 18; i++) out += `<circle cx="${n1(rng() * w)}" cy="${n1(rng() * h * 0.7)}" r="${n1(between(rng, 1.6, 3.4))}" fill="${INK}"/>`;
  return { back: out };
};

const grass: Motif = (c) => {
  const { W: w, H: h, rng, pal } = c;
  const blade = (x: number, len: number, lean: number, fill: string) => {
    const base = h + 10;
    const wid = between(rng, 9, 16);
    const tip: Pt = [x + lean, base - len];
    return shape(`M${n1(x - wid)} ${n1(base)}Q${n1(x - wid * 0.4 + lean * 0.3)} ${n1(base - len * 0.6)} ${n1(tip[0])} ${n1(tip[1])}Q${n1(x + wid * 0.4 + lean * 0.4)} ${n1(base - len * 0.5)} ${n1(x + wid)} ${n1(base)}Z`, fill, 2.8);
  };
  let back = '';
  for (let i = 0; i < 22; i++) back += blade(rng() * w, h * between(rng, 0.25, 0.7), between(rng, -60, 60), i % 3 ? pal.mid : pal.deep);
  let front = '';
  for (let i = 0; i < 9; i++) {
    const x = rng() < 0.5 ? between(rng, -10, w * 0.22) : between(rng, w * 0.78, w + 10);
    front += blade(x, h * between(rng, 0.2, 0.42), between(rng, -40, 40), i % 2 ? pal.light : pal.deep);
  }
  for (let i = 0; i < 10; i++) back += `<circle cx="${n1(rng() * w)}" cy="${n1(rng() * h * 0.45)}" r="${n1(between(rng, 2, 4))}" fill="#fff"/>`;
  return { back, front };
};

const hills: Motif = (c) => {
  const { W: w, H: h, rng, pal, hsl: col } = c;
  let out = `<circle cx="${n1(w * 0.76)}" cy="${n1(h * 0.18)}" r="${n1(w * 0.09)}" fill="${col(pal.h + 10, 70, 88)}" stroke="${INK}" stroke-width="3"/>`;
  const layers = [
    [0.36, pal.light],
    [0.5, pal.base],
    [0.64, pal.mid],
    [0.8, pal.deep],
  ] as const;
  for (const [fy, fill] of layers) {
    const pts: Pt[] = [[-20, h + 20]];
    const k = 4;
    for (let i = 0; i <= k; i++) pts.push([-20 + ((w + 40) * i) / k, h * fy + between(rng, -h * 0.07, h * 0.07)]);
    pts.push([w + 20, h + 20]);
    out += shape(`M-20 ${n1(h + 20)}${curve(pts.slice(1, -1)).replace('M', 'L')}L${w + 20} ${n1(h + 20)}Z`, fill, 3.2);
  }
  out += cloud(w * 0.08, h * 0.22, w * 0.28, rng, '#fff');
  return { back: out };
};

const leaves: Motif = (c) => {
  const { W: w, H: h, rng, pal } = c;
  let back = '';
  const fills = [pal.light, pal.mid, pal.deep, pal.pale];
  for (let i = 0; i < 14; i++) back += leaf(rng() * w, rng() * h * 0.62, between(rng, 34, 70), between(rng, -80, 80), fills[i % 4]!);
  const front = leaf(w * 0.86, h * 0.86, 56, 30, pal.light) + leaf(w * 0.12, h * 0.74, 44, -50, pal.mid);
  return { back, front };
};

const ferns: Motif = (c) => {
  const { W: w, H: h, rng, pal } = c;
  let out = '';
  const frond = (x0: number, y0: number, x1: number, y1: number, bend: number, fill: string) => {
    const mx = (x0 + x1) / 2 + bend;
    const my = (y0 + y1) / 2;
    let g = stroke(`M${n1(x0)} ${n1(y0)}Q${n1(mx)} ${n1(my)} ${n1(x1)} ${n1(y1)}`, 3.6);
    const k = 9;
    for (let i = 1; i < k; i++) {
      const t = i / k;
      const x = (1 - t) * (1 - t) * x0 + 2 * (1 - t) * t * mx + t * t * x1;
      const y = (1 - t) * (1 - t) * y0 + 2 * (1 - t) * t * my + t * t * y1;
      const dx = 2 * (1 - t) * (mx - x0) + 2 * t * (x1 - mx);
      const dy = 2 * (1 - t) * (my - y0) + 2 * t * (y1 - my);
      const a = (Math.atan2(dy, dx) * 180) / Math.PI;
      const len = 46 * (1 - t * 0.6);
      g += leaf(x + Math.cos(((a - 60) * Math.PI) / 180) * len * 0.5, y + Math.sin(((a - 60) * Math.PI) / 180) * len * 0.5, len, a - 60, fill, 2.6, false);
      g += leaf(x + Math.cos(((a + 60) * Math.PI) / 180) * len * 0.5, y + Math.sin(((a + 60) * Math.PI) / 180) * len * 0.5, len, a + 60, fill, 2.6, false);
    }
    return g;
  };
  out += frond(-20, h * 0.95, w * 0.42, h * 0.02, -40, pal.mid);
  out += frond(w + 20, h * 0.9, w * 0.6, -10, 50, pal.light);
  out += frond(-20, h * 0.3, w * 0.3, -20, 20, pal.deep);
  for (let i = 0; i < 8; i++) out += `<circle cx="${n1(rng() * w)}" cy="${n1(rng() * h * 0.6)}" r="${n1(between(rng, 2, 3.5))}" fill="#fff"/>`;
  return { back: out };
};

const pines: Motif = (c) => {
  const { W: w, H: h, rng, pal, hsl: col } = c;
  let out = '';
  const tree = (x: number, base: number, th: number, fill: string) => {
    let g = '';
    const tiers = 3;
    for (let i = 0; i < tiers; i++) {
      const top = base - th + (i * th) / (tiers + 0.6);
      const bot = top + th * 0.5;
      const half = (th * 0.22 * (i + 1.2)) / 1.6;
      g += shape(`M${n1(x)} ${n1(top)}L${n1(x + half)} ${n1(bot)}L${n1(x - half)} ${n1(bot)}Z`, fill, 3);
    }
    return g;
  };
  const rows = [
    [0.55, 0.42, pal.light],
    [0.72, 0.5, pal.mid],
    [0.95, 0.6, pal.deep],
  ] as const;
  out += `<circle cx="${n1(w * 0.2)}" cy="${n1(h * 0.14)}" r="${n1(w * 0.07)}" fill="${col(pal.h, 20, 92)}" stroke="${INK}" stroke-width="3"/>`;
  for (const [fy, fh, fill] of rows) {
    for (let x = -10 + rng() * 30; x < w + 30; x += between(rng, 44, 70)) out += tree(x, h * fy, h * fh * between(rng, 0.7, 1), fill);
  }
  return { back: out };
};

const eggs: Motif = (c) => {
  const { W: w, H: h, rng, pal } = c;
  let out = '';
  const egg = (x: number, y: number, r: number, deg: number) => {
    let g = `<g ${rot(x, y, deg)}>${shape(`M${n1(x)} ${n1(y - r * 1.25)}C${n1(x + r * 0.85)} ${n1(y - r * 1.25)} ${n1(x + r)} ${n1(y + r)} ${n1(x)} ${n1(y + r)}C${n1(x - r)} ${n1(y + r)} ${n1(x - r * 0.85)} ${n1(y - r * 1.25)} ${n1(x)} ${n1(y - r * 1.25)}Z`, '#fbfaf5', 3.2)}`;
    for (let i = 0; i < 7; i++) g += `<circle cx="${n1(x + between(rng, -r * 0.6, r * 0.6))}" cy="${n1(y + between(rng, -r * 0.8, r * 0.6))}" r="${n1(between(rng, 1.6, 3.6))}" fill="${pal.deep}"/>`;
    return `${g}</g>`;
  };
  const spots: [number, number, number][] = [
    [0.15, 0.14, 26], [0.46, 0.1, 20], [0.8, 0.18, 30], [0.28, 0.42, 22], [0.68, 0.44, 18], [0.9, 0.62, 22], [0.1, 0.66, 20],
  ];
  for (const [fx, fy, r] of spots) out += egg(w * fx, h * fy, r, between(rng, -35, 35));
  return { back: out };
};

const waves: Motif = (c) => {
  const { W: w, H: h, rng, pal, hsl: col } = c;
  let out = '';
  const bands = 6;
  for (let i = 0; i < bands; i++) {
    const y = h * (0.12 + (i * 0.85) / bands);
    const amp = 10 + i * 2.5;
    const len = 90 + i * 8;
    const shift = rng() * len;
    const pts: Pt[] = [];
    for (let x = -len; x <= w + len; x += len / 4) pts.push([x + shift, y + Math.sin((x / len) * Math.PI * 2) * amp]);
    const fill = [pal.pale, pal.light, pal.base, pal.mid, pal.deep, col(pal.h, pal.s + 8, pal.l - 26)][i]!;
    out += shape(`${curve(pts)}L${n1(w + len * 2)} ${n1(h + 20)}L${n1(-len * 2)} ${n1(h + 20)}Z`, fill, 3.2);
    for (let x = -len; x <= w + len; x += len) {
      const cx = x + shift + len * 0.25;
      out += stroke(`M${n1(cx - 14)} ${n1(y - amp + 6)}q8 -10 18 -4`, 2.6, '#fff');
    }
  }
  return { back: out };
};

const bubbles: Motif = (c) => {
  const { W: w, H: h, rng, pal } = c;
  let back = '';
  for (let i = 0; i < 16; i++) {
    const x = rng() * w;
    const y = rng() * h * 0.75;
    const r = between(rng, 6, 34);
    back += `<circle cx="${n1(x)}" cy="${n1(y)}" r="${n1(r)}" fill="${pal.pale}" fill-opacity="0.5" stroke="${INK}" stroke-width="${n1(r > 14 ? 3 : 2.2)}"/>`;
    back += stroke(`M${n1(x - r * 0.55)} ${n1(y - r * 0.15)}A${n1(r * 0.6)} ${n1(r * 0.6)} 0 0 1 ${n1(x - r * 0.1)} ${n1(y - r * 0.6)}`, r > 14 ? 3 : 2, '#fff');
  }
  const front = `<circle cx="${n1(w * 0.85)}" cy="${n1(h * 0.82)}" r="16" fill="${pal.pale}" fill-opacity="0.5" stroke="${INK}" stroke-width="2.6"/>`;
  return { back, front };
};

const clouds: Motif = (c) => {
  const { W: w, H: h, rng } = c;
  let out = '';
  const spots: [number, number, number][] = [
    [-0.06, 0.16, 0.5], [0.52, 0.1, 0.42], [0.2, 0.38, 0.36], [0.66, 0.42, 0.46], [-0.1, 0.6, 0.3],
  ];
  for (const [fx, fy, fw] of spots) out += cloud(w * fx, h * fy, w * fw, rng, '#fff');
  return { back: out };
};

const snow: Motif = (c) => {
  const { W: w, H: h, rng } = c;
  let out = '';
  const flake = (x: number, y: number, r: number) => {
    let g = '';
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const ex = x + Math.cos(a) * r;
      const ey = y + Math.sin(a) * r;
      g += stroke(`M${n1(x)} ${n1(y)}L${n1(ex)} ${n1(ey)}`, 2.4, '#fff');
      const bx = x + Math.cos(a) * r * 0.6;
      const by = y + Math.sin(a) * r * 0.6;
      for (const s of [-1, 1]) {
        const b = a + s * 0.7;
        g += stroke(`M${n1(bx)} ${n1(by)}L${n1(bx + Math.cos(b) * r * 0.3)} ${n1(by + Math.sin(b) * r * 0.3)}`, 2, '#fff');
      }
    }
    return g;
  };
  for (let i = 0; i < 10; i++) out += flake(rng() * w, rng() * h * 0.66, between(rng, 8, 20));
  for (let i = 0; i < 30; i++) out += `<circle cx="${n1(rng() * w)}" cy="${n1(rng() * h)}" r="${n1(between(rng, 1.6, 4))}" fill="#fff"/>`;
  return { back: out };
};

/** Paper planes, with dashed trails. */
const planes: Motif = (c) => {
  const { W: w, H: h, rng, pal } = c;
  let out = '';
  const plane = (x: number, y: number, s: number, deg: number) => {
    const body = `M${n1(x + s)} ${n1(y)}L${n1(x - s)} ${n1(y - s * 0.55)}L${n1(x - s * 0.55)} ${n1(y)}L${n1(x - s)} ${n1(y + s * 0.5)}Z`;
    const fold = `M${n1(x + s)} ${n1(y)}L${n1(x - s * 0.55)} ${n1(y)}L${n1(x - s * 0.8)} ${n1(y + s * 0.28)}Z`;
    const trail = `M${n1(x - s * 1.4)} ${n1(y + s * 0.1)}C${n1(x - s * 3)} ${n1(y + s * 0.6)} ${n1(x - s * 3.6)} ${n1(y - s * 1.4)} ${n1(x - s * 5.4)} ${n1(y - s * 0.4)}`;
    return `<g ${rot(x, y, deg)}>${stroke(trail, 2.6, '#fff', ' stroke-dasharray="7 8"')}${shape(body, '#fff', 3)}${shape(fold, pal.pale, 3)}</g>`;
  };
  const spots: [number, number, number, number][] = [
    [0.7, 0.14, 44, -14], [0.26, 0.28, 36, 8], [0.84, 0.46, 30, -24], [0.14, 0.56, 26, -6],
  ];
  for (const [fx, fy, s, deg] of spots) out += plane(w * fx, h * fy, s, deg + between(rng, -6, 6));
  out += cloud(w * 0.4, h * 0.15, w * 0.3, rng, pal.light);
  for (let i = 0; i < 6; i++) out += sparkle(rng() * w, rng() * h * 0.6, between(rng, 4, 9));
  return { back: out };
};

const rain: Motif = (c) => {
  const { W: w, H: h, rng, pal } = c;
  let out = '';
  for (let x = 8; x < w; x += between(rng, 14, 24)) {
    const len = h * between(rng, 0.35, 0.9);
    out += stroke(`M${n1(x)} -10L${n1(x)} ${n1(len)}`, between(rng, 3, 5), pal.deep);
  }
  for (let i = 0; i < 12; i++) {
    const x = rng() * w;
    const y = rng() * h * 0.8;
    out += shape(`M${n1(x)} ${n1(y - 8)}Q${n1(x + 5)} ${n1(y + 1)} ${n1(x)} ${n1(y + 4)}Q${n1(x - 5)} ${n1(y + 1)} ${n1(x)} ${n1(y - 8)}Z`, '#fff', 0);
  }
  return { back: out };
};

const night: Motif = (c) => {
  const { W: w, H: h, rng, hsl: col, pal } = c;
  let out = `<circle cx="${n1(w / 2)}" cy="${n1(h * 0.95)}" r="${n1(w * 0.62)}" fill="${col(pal.h, 30, 46)}" opacity="0.8"/>`;
  const mx = w * 0.72;
  const my = h * 0.2;
  const R = w * 0.12;
  out += `<path d="M${n1(mx)} ${n1(my - R)}A${n1(R)} ${n1(R)} 0 1 0 ${n1(mx + R * 0.9)} ${n1(my + R * 0.5)}A${n1(R * 0.82)} ${n1(R * 0.82)} 0 1 1 ${n1(mx)} ${n1(my - R)}Z" fill="${col(48, 90, 82)}" stroke="${INK}" stroke-width="3"/>`;
  for (let i = 0; i < 26; i++) out += `<circle cx="${n1(rng() * w)}" cy="${n1(rng() * h * 0.6)}" r="${n1(between(rng, 1, 2.6))}" fill="#fff"/>`;
  for (let i = 0; i < 5; i++) out += sparkle(rng() * w, rng() * h * 0.55, between(rng, 6, 11));
  return { back: out };
};

const orbits: Motif = (c) => {
  const { W: w, H: h, rng, pal, hsl: col } = c;
  let out = '';
  for (let i = 0; i < 3; i++) out += `<ellipse cx="${n1(w / 2)}" cy="${n1(h * 0.62)}" rx="${n1(w * (0.42 + i * 0.16))}" ry="${n1(h * (0.18 + i * 0.08))}" fill="none" stroke="#fff" stroke-width="2" stroke-dasharray="4 9" opacity="0.8"/>`;
  const px = w * 0.8;
  const py = h * 0.16;
  out += `<circle cx="${n1(px)}" cy="${n1(py)}" r="${n1(w * 0.14)}" fill="${pal.light}" stroke="${INK}" stroke-width="3.2"/>`;
  out += stroke(`M${n1(px - w * 0.11)} ${n1(py - 6)}q${n1(w * 0.1)} 8 ${n1(w * 0.22)} -2`, 2.6, pal.deep);
  out += `<ellipse cx="${n1(px)}" cy="${n1(py)}" rx="${n1(w * 0.26)}" ry="${n1(w * 0.06)}" fill="none" stroke="${INK}" stroke-width="3.2" ${rot(px, py, -18)}/>`;
  out += `<circle cx="${n1(w * 0.16)}" cy="${n1(h * 0.34)}" r="${n1(w * 0.06)}" fill="${col(pal.h + 40, 60, 74)}" stroke="${INK}" stroke-width="3"/>`;
  out += `<circle cx="${n1(w * 0.36)}" cy="${n1(h * 0.1)}" r="${n1(w * 0.03)}" fill="${pal.pale}" stroke="${INK}" stroke-width="2.6"/>`;
  for (let i = 0; i < 20; i++) out += `<circle cx="${n1(rng() * w)}" cy="${n1(rng() * h * 0.7)}" r="${n1(between(rng, 1, 2.4))}" fill="#fff"/>`;
  return { back: out };
};

const notes: Motif = (c) => {
  const { W: w, H: h, rng, pal } = c;
  let out = '';
  const note = (x: number, y: number, s: number, deg: number, beamed: boolean) => {
    let g = `<g ${rot(x, y, deg)}>`;
    const head = (hx: number) => `<ellipse cx="${n1(hx)}" cy="${n1(y)}" rx="${n1(s * 0.62)}" ry="${n1(s * 0.44)}" fill="#fff" stroke="${INK}" stroke-width="3" ${rot(hx, y, -22)}/>`;
    g += stroke(`M${n1(x + s * 0.55)} ${n1(y - 2)}L${n1(x + s * 0.55)} ${n1(y - s * 2.4)}`, 3.2);
    if (beamed) {
      const x2 = x + s * 1.9;
      g += stroke(`M${n1(x2 + s * 0.55)} ${n1(y - 2)}L${n1(x2 + s * 0.55)} ${n1(y - s * 2.4)}`, 3.2);
      g += shape(`M${n1(x + s * 0.55)} ${n1(y - s * 2.4)}L${n1(x2 + s * 0.55)} ${n1(y - s * 2.4)}L${n1(x2 + s * 0.55)} ${n1(y - s * 2)}L${n1(x + s * 0.55)} ${n1(y - s * 2)}Z`, INK, 2);
      g += head(x) + head(x2);
    } else {
      g += stroke(`M${n1(x + s * 0.55)} ${n1(y - s * 2.4)}q${n1(s * 0.8)} ${n1(s * 0.5)} ${n1(s * 0.5)} ${n1(s * 1.3)}`, 3.2);
      g += head(x);
    }
    return `${g}</g>`;
  };
  const spots: [number, number, number, boolean][] = [
    [0.12, 0.24, 15, false], [0.42, 0.18, 13, true], [0.78, 0.12, 16, false], [0.7, 0.42, 12, true], [0.18, 0.56, 13, false], [0.9, 0.62, 11, false],
  ];
  for (const [fx, fy, s, b] of spots) out += note(w * fx, h * fy, s * 1.3, between(rng, -18, 18), b);
  for (let i = 0; i < 3; i++) {
    const y = h * (0.06 + i * 0.05);
    out += stroke(`M-10 ${n1(y + 30)}Q${n1(w * 0.5)} ${n1(y - 20)} ${n1(w + 10)} ${n1(y + 24)}`, 2, pal.deep);
  }
  return { back: out };
};

/** Manga shading: long diagonal hatching in the corners, a beam of light across. */
const hatching: Motif = (c) => {
  const { W: w, H: h, rng, pal } = c;
  let out = `<path d="M${n1(w * 0.02)} -10L${n1(w * 0.36)} -10L${n1(w * 0.0)} ${n1(h + 10)}L${n1(-w * 0.34)} ${n1(h + 10)}Z" fill="${pal.light}" opacity="0.7"/>`;
  // Which strokes fall in shade: far from a diagonal band through the middle.
  const shade = (x: number, y: number) => Math.abs((x - w * 0.5) * 0.6 + (y - h * 0.45) * -0.8) / (w * 0.5);
  for (let k = -h; k < w + h; k += 9) {
    // Each hatch line runs down-left at about 50°.
    let start: number | null = null;
    const steps = 24;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const x = k - t * h * 0.84;
      const y = t * h;
      const dark = shade(x, y) + Math.sin(k * 0.07 + t * 5) * 0.12 > 0.62;
      if (dark && start === null) start = t;
      if ((!dark || i === steps) && start !== null) {
        const t2 = t;
        if (t2 - start > 0.04) out += stroke(hand(k - start * h * 0.84, start * h, k - t2 * h * 0.84, t2 * h, rng, 1, 2), between(rng, 1.8, 2.8));
        start = null;
      }
    }
  }
  for (let i = 0; i < 8; i++) out += `<circle cx="${n1(rng() * w)}" cy="${n1(rng() * h * 0.6)}" r="${n1(between(rng, 1.4, 3))}" fill="${INK}"/>`;
  return { back: out };
};

const spiral: Motif = (c) => {
  const { W: w, H: h, pal, head } = c;
  const cx = head.x;
  const cy = head.y - head.r * 0.8;
  const pts: Pt[] = [];
  const turns = 5;
  for (let i = 0; i <= turns * 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    const r = 6 + (i / (turns * 24)) * Math.hypot(w, h) * 0.75;
    pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  return { back: stroke(curve(pts), 22, pal.mid) + stroke(curve(pts), 3, INK, ' transform="translate(0 0)"') };
};

const confetti: Motif = (c) => {
  const { W: w, H: h, rng, pal, hsl: col } = c;
  const fills = [pal.light, pal.pale, '#fff', col(pal.h + 30, 70, 64), col(pal.h - 30, 70, 60), pal.deep];
  const piece = (i: number) => {
    const x = rng() * w;
    const y = rng() * h * 0.78;
    const deg = rng() * 360;
    const f = fills[i % fills.length]!;
    if (i % 3 === 0) return stroke(`M${n1(x - 12)} ${n1(y)}q6 -8 12 0t12 0`, 4, f, ` ${rot(x, y, deg)}`);
    if (i % 3 === 1) return `<circle cx="${n1(x)}" cy="${n1(y)}" r="${n1(between(rng, 3, 6))}" fill="${f}" stroke="${INK}" stroke-width="2"/>`;
    return `<rect x="${n1(x - 7)}" y="${n1(y - 4)}" width="14" height="8" fill="${f}" stroke="${INK}" stroke-width="2" ${rot(x, y, deg)}/>`;
  };
  let back = '';
  for (let i = 0; i < 44; i++) back += piece(i);
  let front = '';
  for (let i = 0; i < 5; i++) front += piece(i * 7 + 1);
  return { back, front };
};

const hearts: Motif = (c) => {
  const { W: w, H: h, rng, pal } = c;
  let out = '';
  const spots: [number, number, number][] = [
    [0.22, 0.12, 30], [0.62, 0.1, 22], [0.84, 0.3, 38], [0.4, 0.34, 26], [0.12, 0.44, 20], [0.68, 0.52, 16], [0.36, 0.02, 14], [0.92, 0.7, 14],
  ];
  spots.forEach(([fx, fy, s], i) => {
    const x = w * fx;
    const y = h * fy;
    out += `<g ${rot(x, y, between(rng, -18, 18))}>${i % 3 === 0 ? shape(heart(x, y, s), pal.light, 3.4, pal.deep) : stroke(heart(x, y, s), 3.4, pal.deep)}</g>`;
  });
  out += focusLines(c, 34, INK, 0.58);
  return { back: out };
};

const daisies: Motif = (c) => {
  const { W: w, H: h, rng, pal } = c;
  let out = '';
  const daisy = (x: number, y: number, r: number) => {
    let g = '';
    const k = 9;
    const a0 = rng() * Math.PI;
    for (let i = 0; i < k; i++) {
      const a = a0 + (i / k) * Math.PI * 2;
      const px = x + Math.cos(a) * r * 0.58;
      const py = y + Math.sin(a) * r * 0.58;
      g += `<ellipse cx="${n1(px)}" cy="${n1(py)}" rx="${n1(r * 0.46)}" ry="${n1(r * 0.2)}" fill="#fff" stroke="${INK}" stroke-width="2.6" ${rot(px, py, (a * 180) / Math.PI)}/>`;
    }
    g += `<circle cx="${n1(x)}" cy="${n1(y)}" r="${n1(r * 0.26)}" fill="${pal.pale}" stroke="${INK}" stroke-width="2.6"/>`;
    return g;
  };
  const spots: [number, number, number][] = [
    [0.14, 0.14, 40], [0.56, 0.08, 30], [0.88, 0.26, 44], [0.34, 0.4, 32], [0.06, 0.58, 30], [0.72, 0.5, 24],
  ];
  for (const [fx, fy, r] of spots) out += daisy(w * fx, h * fy, r);
  return { back: out, front: daisy(w * 0.9, h * 0.88, 34) };
};

const curtains: Motif = (c) => {
  const { W: w, H: h, rng, pal, hsl: col } = c;
  let out = `<ellipse cx="${n1(w / 2)}" cy="${n1(h * 0.62)}" rx="${n1(w * 0.42)}" ry="${n1(h * 0.5)}" fill="${col(pal.h, 50, 62)}" opacity="0.75"/>`;
  const drape = (side: 1 | -1) => {
    let g = '';
    const x0 = side === -1 ? -10 : w + 10;
    const folds = 4;
    const width = w * 0.26;
    for (let i = 0; i < folds; i++) {
      const xa = x0 - side * (width * i) / folds;
      const xb = x0 - side * (width * (i + 1)) / folds;
      const sway = side * between(rng, 6, 16);
      g += shape(`M${n1(xa)} -10L${n1(xb)} -10Q${n1(xb - sway)} ${n1(h * 0.55)} ${n1(xb + side * 10)} ${n1(h + 10)}L${n1(xa)} ${n1(h + 10)}Z`, i % 2 ? pal.deep : pal.mid, 3);
    }
    return g;
  };
  out += drape(-1) + drape(1);
  let valance = `M-10 -10L${w + 10} -10L${w + 10} ${n1(h * 0.09)}`;
  const k = 6;
  for (let i = k; i > 0; i--) valance += `Q${n1(((i - 0.5) / k) * w)} ${n1(h * 0.16)} ${n1(((i - 1) / k) * w)} ${n1(h * 0.09)}`;
  out += shape(`${valance}Z`, pal.deep, 3);
  for (let i = 0; i < 5; i++) out += sparkle(between(rng, w * 0.3, w * 0.7), between(rng, h * 0.2, h * 0.5), between(rng, 5, 9), col(48, 90, 80));
  return { back: out };
};

const sunset: Motif = (c) => {
  const { W: w, H: h, pal, hsl: col, head } = c;
  const cx = w * 0.5;
  const cy = head.y - head.r * 1.2;
  const R = w * 0.34;
  let out = `<circle cx="${n1(cx)}" cy="${n1(cy)}" r="${n1(R)}" fill="${col(pal.h + 30, 95, 74)}" stroke="${INK}" stroke-width="3.4"/>`;
  for (let i = 0; i < 5; i++) {
    const y = cy + R * (0.05 + i * 0.2);
    out += `<rect x="${n1(cx - R - 4)}" y="${n1(y)}" width="${n1(R * 2 + 8)}" height="${n1(4 + i * 3)}" fill="${pal.base}"/>`;
  }
  for (let i = 0; i < 5; i++) {
    const y = h * (0.66 + i * 0.07);
    out += stroke(`M${n1(w * (0.1 - i * 0.04))} ${n1(y)}L${n1(w * (0.45 - i * 0.03))} ${n1(y)}`, 3, pal.deep);
    out += stroke(`M${n1(w * (0.62 + i * 0.03))} ${n1(y + 6)}L${n1(w * (0.95 + i * 0.03))} ${n1(y + 6)}`, 3, pal.deep);
  }
  out += cloud(w * 0.02, h * 0.2, w * 0.3, c.rng, pal.pale);
  out += cloud(w * 0.7, h * 0.12, w * 0.32, c.rng, pal.pale);
  return { back: out };
};

const twigs: Motif = (c) => {
  const { W: w, H: h, rng, pal, hsl: col } = c;
  let out = '';
  const branch = (x0: number, y0: number, x1: number, y1: number, width: number) => {
    let g = stroke(hand(x0, y0, x1, y1, rng, 6, 4), width + 3.4) + stroke(hand(x0, y0, x1, y1, rng, 0, 1), width, col(pal.h, 40, 46));
    for (let i = 0; i < 3; i++) {
      const t = between(rng, 0.2, 0.8);
      const bx = x0 + (x1 - x0) * t;
      const by = y0 + (y1 - y0) * t;
      const a = Math.atan2(y1 - y0, x1 - x0) + (rng() < 0.5 ? -0.7 : 0.7);
      const len = between(rng, 30, 60);
      g += stroke(`M${n1(bx)} ${n1(by)}L${n1(bx + Math.cos(a) * len)} ${n1(by + Math.sin(a) * len)}`, width * 0.5 + 3);
      g += stroke(`M${n1(bx)} ${n1(by)}L${n1(bx + Math.cos(a) * len)} ${n1(by + Math.sin(a) * len)}`, width * 0.5, col(pal.h, 40, 46));
    }
    return g;
  };
  out += branch(-20, h * 0.18, w * 0.7, h * 0.02, 9);
  out += branch(w + 20, h * 0.42, w * 0.3, h * 0.26, 8);
  out += branch(-20, h * 0.62, w * 0.24, h * 0.5, 7);
  out += leaf(w * 0.32, h * 0.08, 38, -20, col(90, 40, 52));
  out += leaf(w * 0.78, h * 0.3, 34, 30, col(90, 40, 46));
  return { back: out };
};

const feathers: Motif = (c) => {
  const { W: w, H: h, rng, pal } = c;
  let out = '';
  const feather = (x: number, y: number, len: number, deg: number, fill: string) => {
    const half = len / 2;
    const wid = len * 0.2;
    let d = `M${n1(x - half)} ${n1(y)}C${n1(x - half * 0.2)} ${n1(y - wid * 1.3)} ${n1(x + half * 0.6)} ${n1(y - wid)} ${n1(x + half)} ${n1(y)}`;
    d += `L${n1(x + half * 0.5)} ${n1(y + wid * 0.5)}L${n1(x + half * 0.38)} ${n1(y + wid * 0.75)}L${n1(x + half * 0.1)} ${n1(y + wid * 0.82)}L${n1(x - half * 0.05)} ${n1(y + wid * 1.05)}C${n1(x - half * 0.5)} ${n1(y + wid * 0.9)} ${n1(x - half * 0.8)} ${n1(y + wid * 0.4)} ${n1(x - half)} ${n1(y)}Z`;
    return `<g ${rot(x, y, deg)}>${shape(d, fill, 3)}${stroke(`M${n1(x - half - 14)} ${n1(y + 3)}Q${n1(x)} ${n1(y - 2)} ${n1(x + half - 4)} ${n1(y)}`, 2.6)}</g>`;
  };
  const spots: [number, number, number][] = [
    [0.22, 0.12, 110], [0.7, 0.1, 90], [0.4, 0.36, 80], [0.86, 0.42, 100], [0.12, 0.54, 70],
  ];
  spots.forEach(([fx, fy, len], i) => {
    out += feather(w * fx, h * fy, len, between(rng, -50, 40), i % 2 ? '#fff' : pal.pale);
  });
  return { back: out };
};

const pins: Motif = (c) => {
  const { W: w, H: h, rng, pal, hsl: col } = c;
  let out = '';
  for (let i = 0; i < 90; i++) out += `<circle cx="${n1(rng() * w)}" cy="${n1(rng() * h)}" r="${n1(between(rng, 1, 2.2))}" fill="${pal.mid}"/>`;
  const note = (x: number, y: number, nw: number, nh: number, deg: number, fill: string) =>
    `<g ${rot(x, y, deg)}>${shape(`M${n1(x - nw / 2)} ${n1(y - nh / 2)}L${n1(x + nw / 2)} ${n1(y - nh / 2)}L${n1(x + nw / 2)} ${n1(y + nh / 2)}L${n1(x - nw / 2)} ${n1(y + nh / 2)}Z`, fill, 3)}${stroke(`M${n1(x - nw * 0.3)} ${n1(y)}L${n1(x + nw * 0.3)} ${n1(y)}`, 2.2, pal.deep)}${stroke(`M${n1(x - nw * 0.3)} ${n1(y + nh * 0.18)}L${n1(x + nw * 0.15)} ${n1(y + nh * 0.18)}`, 2.2, pal.deep)}<circle cx="${n1(x)}" cy="${n1(y - nh / 2 + 9)}" r="7" fill="${INK}"/><circle cx="${n1(x - 2)}" cy="${n1(y - nh / 2 + 7)}" r="2" fill="#fff"/></g>`;
  out += note(w * 0.2, h * 0.16, 96, 80, -8, '#fff');
  out += note(w * 0.62, h * 0.12, 80, 96, 6, col(pal.h, 60, 72));
  out += note(w * 0.88, h * 0.42, 70, 74, -4, '#fff');
  out += note(w * 0.08, h * 0.5, 70, 64, 10, col(pal.h, 60, 72));
  return { back: out };
};

const glass: Motif = (c) => {
  const { W: w, H: h, rng, hsl: col } = c;
  const cx = w * 0.52;
  const cy = h * 0.36;
  let out = '';
  const rays = 13;
  const angles: number[] = [];
  for (let i = 0; i < rays; i++) angles.push((i / rays) * Math.PI * 2 + between(rng, -0.15, 0.15));
  for (let i = 0; i < rays; i++) {
    if (i % 3 === 0) {
      const a1 = angles[i]!;
      const a2 = angles[(i + 1) % rays]!;
      const r1 = between(rng, 30, 70);
      const r2 = between(rng, 120, 220);
      out += `<path d="M${n1(cx + Math.cos(a1) * r1)} ${n1(cy + Math.sin(a1) * r1)}L${n1(cx + Math.cos(a1) * r2)} ${n1(cy + Math.sin(a1) * r2)}L${n1(cx + Math.cos(a2) * r2)} ${n1(cy + Math.sin(a2) * r2)}L${n1(cx + Math.cos(a2) * r1)} ${n1(cy + Math.sin(a2) * r1)}Z" fill="${col(0, 0, 84)}"/>`;
    }
  }
  for (const a of angles) out += stroke(hand(cx, cy, cx + Math.cos(a) * 500, cy + Math.sin(a) * 500, rng, 4, 4), 3.4, col(0, 0, 60));
  for (const r of [40, 95, 170]) {
    for (let i = 0; i < rays; i++) {
      if (rng() < 0.35) continue;
      const a1 = angles[i]!;
      const a2 = angles[(i + 1) % rays]!;
      const rr = r * between(rng, 0.85, 1.15);
      out += stroke(`M${n1(cx + Math.cos(a1) * rr)} ${n1(cy + Math.sin(a1) * rr)}L${n1(cx + Math.cos(a2) * rr * between(rng, 0.9, 1.1))} ${n1(cy + Math.sin(a2) * rr)}`, 3, col(0, 0, 60));
    }
  }
  out += `<circle cx="${n1(cx)}" cy="${n1(cy)}" r="20" fill="${col(0, 0, 74)}"/>`;
  return { back: out };
};

const checker: Motif = (c) => {
  const { W: w, H: h, pal, hsl: col } = c;
  const horizon = h * 0.4;
  let out = `<rect x="0" y="${n1(horizon)}" width="${w}" height="${n1(h - horizon)}" fill="${pal.light}"/>`;
  const vx = w / 2;
  const cols = 12;
  const rows = 9;
  const rowY = (j: number) => horizon + (h - horizon) * ((Math.pow(1.45, j) - 1) / (Math.pow(1.45, rows) - 1)) * 1.2;
  for (let j = 0; j < rows; j++) {
    for (let i = -cols; i < cols; i++) {
      if ((i + j) % 2) continue;
      const y1 = rowY(j);
      const y2 = rowY(j + 1);
      const spread = (y: number) => (y - horizon) / (h - horizon);
      const x = (k: number, y: number) => vx + (k * 60 * spread(y) * 2.2);
      out += `<path d="M${n1(x(i, y1))} ${n1(y1)}L${n1(x(i + 1, y1))} ${n1(y1)}L${n1(x(i + 1, y2))} ${n1(y2)}L${n1(x(i, y2))} ${n1(y2)}Z" fill="${col(0, 0, pal.l - 30)}"/>`;
    }
  }
  out += stroke(`M-10 ${n1(horizon)}L${w + 10} ${n1(horizon)}`, 3.4);
  out += `<ellipse cx="${n1(w / 2)}" cy="${n1(h * 0.98)}" rx="${n1(w * 0.36)}" ry="${n1(h * 0.05)}" fill="${INK}" opacity="0.25"/>`;
  return { back: out };
};

const target: Motif = (c) => {
  const { W: w, H: h, pal, head, hsl: col } = c;
  const cx = head.x;
  const cy = head.y - head.r * 0.3;
  let out = '';
  const max = Math.hypot(w, h);
  for (let r = max, i = 0; r > 20; r -= 34, i++) {
    out += `<circle cx="${n1(cx)}" cy="${n1(cy)}" r="${n1(r)}" fill="${i % 2 ? pal.light : col(0, 0, pal.l - 8)}" stroke="${INK}" stroke-width="3"/>`;
  }
  return { back: out };
};

const glints: Motif = (c) => {
  const { W: w, H: h, rng, hsl: col } = c;
  let out = `<circle cx="${n1(w / 2)}" cy="${n1(h * 0.78)}" r="${n1(w * 0.5)}" fill="${col(0, 0, 44)}"/>`;
  out += `<circle cx="${n1(w / 2)}" cy="${n1(h * 0.78)}" r="${n1(w * 0.36)}" fill="${col(0, 0, 54)}"/>`;
  const ring = (x: number, y: number, r: number, deg: number) =>
    `<g ${rot(x, y, deg)}><ellipse cx="${n1(x)}" cy="${n1(y)}" rx="${n1(r)}" ry="${n1(r * 0.7)}" fill="none" stroke="${col(46, 80, 62)}" stroke-width="7"/><path d="M${n1(x - 9)} ${n1(y - r * 0.7 - 4)}L${n1(x)} ${n1(y - r * 0.7 - 18)}L${n1(x + 9)} ${n1(y - r * 0.7 - 4)}Z" fill="#fff" stroke="${INK}" stroke-width="2"/></g>`;
  out += ring(w * 0.2, h * 0.16, 22, -20) + ring(w * 0.8, h * 0.3, 18, 25);
  for (let i = 0; i < 14; i++) out += sparkle(rng() * w, rng() * h * 0.6, between(rng, 4, 14));
  return { back: out };
};

const spotlight: Motif = (c) => {
  const { W: w, H: h, rng, head, hsl: col } = c;
  const x = head.x;
  let out = `<path d="M${n1(x - w * 0.12)} -10L${n1(x + w * 0.12)} -10L${n1(x + w * 0.5)} ${n1(h + 10)}L${n1(x - w * 0.5)} ${n1(h + 10)}Z" fill="${col(48, 40, 86)}" opacity="0.32"/>`;
  out += `<path d="M${n1(x - w * 0.07)} -10L${n1(x + w * 0.07)} -10L${n1(x + w * 0.34)} ${n1(h + 10)}L${n1(x - w * 0.34)} ${n1(h + 10)}Z" fill="${col(48, 50, 90)}" opacity="0.35"/>`;
  for (let i = 0; i < 26; i++) {
    const y = rng() * h * 0.7;
    const spread = (y / h) * w * 0.45;
    out += `<circle cx="${n1(x + between(rng, -spread, spread))}" cy="${n1(y)}" r="${n1(between(rng, 1, 2.4))}" fill="#fff" opacity="0.8"/>`;
  }
  return { back: out };
};

// ---------- the cards ----------

const SPECS: Spec[] = [
  { name: 'Burst', h: 2, s: 72, l: 50, motif: burst, ratio: 1.25, tilt: -4 },
  { name: 'Flames', h: 14, s: 80, l: 54, motif: flames, ratio: 1.33 },
  { name: 'Halftone', h: 24, s: 84, l: 58, motif: halftone, ratio: 1 },
  { name: 'Coins', h: 40, s: 86, l: 58, motif: coins, ratio: 1.25 },
  { name: 'Sun', h: 50, s: 92, l: 60, motif: sun, ratio: 1.5, pose: 'squint' },
  { name: 'Stars', h: 60, s: 72, l: 62, motif: stars, ratio: 1.25 },
  { name: 'Grass', h: 82, s: 50, l: 54, motif: grass, ratio: 1.33 },
  { name: 'Hills', h: 68, s: 34, l: 46, motif: hills, ratio: 1 },
  { name: 'Leaves', h: 98, s: 42, l: 52, motif: leaves, ratio: 1.25, dx: 0.03 },
  { name: 'Ferns', h: 130, s: 38, l: 42, motif: ferns, ratio: 1.5 },
  { name: 'Pines', h: 150, s: 38, l: 36, motif: pines, ratio: 1.25 },
  { name: 'Eggs', h: 158, s: 38, l: 74, motif: eggs, ratio: 1, pose: 'squint' },
  { name: 'Waves', h: 180, s: 48, l: 42, motif: waves, ratio: 1.33 },
  { name: 'Bubbles', h: 190, s: 58, l: 54, motif: bubbles, ratio: 1.25 },
  { name: 'Clouds', h: 200, s: 62, l: 66, motif: clouds, ratio: 1.5 },
  { name: 'Snow', h: 208, s: 44, l: 76, motif: snow, ratio: 1.25, pose: 'closed' },
  { name: 'Planes', h: 214, s: 52, l: 54, motif: planes, ratio: 1.33 },
  { name: 'Rain', h: 224, s: 40, l: 56, motif: rain, ratio: 1.25, pose: 'closed' },
  { name: 'Night', h: 232, s: 46, l: 22, motif: night, ratio: 1, pose: 'closed' },
  { name: 'Orbits', h: 248, s: 42, l: 44, motif: orbits, ratio: 1.25 },
  { name: 'Notes', h: 262, s: 42, l: 60, motif: notes, ratio: 1.5, pose: 'squint' },
  { name: 'Hatching', h: 278, s: 32, l: 42, motif: hatching, ratio: 1.25, tilt: 5 },
  { name: 'Spiral', h: 290, s: 36, l: 74, motif: spiral, ratio: 1 },
  { name: 'Confetti', h: 312, s: 54, l: 52, motif: confetti, ratio: 1.33, pose: 'squint' },
  { name: 'Hearts', h: 326, s: 58, l: 82, motif: hearts, ratio: 1.25, pose: 'squint' },
  { name: 'Daisies', h: 340, s: 56, l: 58, motif: daisies, ratio: 1.5 },
  { name: 'Curtains', h: 350, s: 60, l: 32, motif: curtains, ratio: 1.25 },
  { name: 'Sunset', h: 10, s: 72, l: 70, motif: sunset, ratio: 1 },
  { name: 'Twigs', h: 26, s: 36, l: 36, motif: twigs, ratio: 1.33, pose: 'twig' },
  { name: 'Feathers', h: 34, s: 42, l: 76, motif: feathers, ratio: 1.25 },
  { name: 'Pins', h: 44, s: 50, l: 86, motif: pins, ratio: 1.5 },
  { name: 'Glass', h: 0, s: 0, l: 95, motif: glass, ratio: 1.25 },
  { name: 'Checker', h: 0, s: 0, l: 78, motif: checker, ratio: 1 },
  { name: 'Target', h: 0, s: 0, l: 58, motif: target, ratio: 1.33 },
  { name: 'Glints', h: 0, s: 0, l: 24, motif: glints, ratio: 1.25 },
  { name: 'Spotlight', h: 0, s: 0, l: 9, motif: spotlight, ratio: 1.25 },
];

// ---------- the bird ----------

function splitEye(path: string): { body: string; eye: string } {
  const [body = '', ...eye] = path.split(/(?=M )/);
  return { body: body.trim(), eye: eye.join(' ').trim() };
}
const OPEN = splitEye(MARK_PATH);
const SHUT = splitEye(MARK_CLOSED_PATH);
const EYE_BOX = { x: 77.7, y: 55.4, w: 50.7, h: 49.8 };
const SHUT_EYE =
  'M 86 62.5 C 95 61, 105 56.5, 113.5 49.5 C 115.5 47.8, 118 45.6, 119.6 46.4 C 121 47.4, 120.2 51.5, 117.6 55.2 C 111.5 63.2, 100.5 67.6, 86 62.5 Z';
const TWIG = [
  'M 175 86 C 186 66, 200 44, 214 22 C 222 9, 230 -4, 237 -16',
  'M 237 -16 C 239 -26, 242 -34, 246 -42',
  'M 237 -16 C 246 -20, 255 -22, 264 -21',
  'M 222 7 C 228 5, 233 6, 238 9',
];

/** Rounds a long path's numbers to whole units (plenty at these sizes). */
const tight = (d: string) => d.replace(/-?\d+\.\d+/g, (v) => String(Math.round(Number(v) * 2) / 2));

function bird(pose: Pose, x: number, y: number, s: number, tilt: number, pivot: Pt, wood: string): string {
  const shapeOf = pose === 'twig' ? SHUT : OPEN;
  let g = `<g transform="rotate(${n1(tilt)} ${n1(pivot[0])} ${n1(pivot[1])}) translate(${n1(x)} ${n1(y)}) scale(${(Math.round(s * 1000) / 1000).toString()})">`;
  // The twig: wood with an ink outline, behind the beak.
  if (pose === 'twig') {
    TWIG.forEach((d, i) => (g += `<path d="${d}" fill="none" stroke="${INK}" stroke-width="${i === 0 ? 13 : 11}" stroke-linecap="round"/>`));
    TWIG.forEach((d, i) => (g += `<path d="${d}" fill="none" stroke="${wood}" stroke-width="${i === 0 ? 6 : 4.5}" stroke-linecap="round"/>`));
  }
  g += `<path d="${tight(shapeOf.body)}" fill="${INK}"/>`;
  if (pose === 'closed') g += `<path d="${SHUT_EYE}" fill="#fff"/>`;
  else if (pose === 'squint') {
    const top = EYE_BOX.y;
    g += `<path d="${tight(shapeOf.eye)}" fill="#fff" transform="translate(0 ${n1(top)}) scale(1 0.5) translate(0 ${n1(-top)})"/>`;
  } else g += `<path d="${tight(shapeOf.eye)}" fill="#fff"/>`;
  return `${g}</g>`;
}

// ---------- assembly ----------

function card(spec: Spec, index: number, framed: boolean): string {
  const H = Math.round(W * spec.ratio);
  const rng = mulberry32(index * 7919 + 17);
  const { h, s, l } = spec;
  const dark = l < 30;
  const pal: Pal = {
    h,
    s,
    l,
    top: hsl(h - 4, s + 4, l - (dark ? 6 : 12)),
    bottom: hsl(h + 4, s - 4, l + (dark ? 10 : 12)),
    base: hsl(h, s, l),
    deep: hsl(h - 4, s + 6, l - 20),
    mid: hsl(h - 2, s + 2, l - 9),
    light: hsl(h + 4, s - 6, l + 14),
    pale: hsl(h + 6, s - 10, Math.min(96, l + 28)),
  };
  // The head: a bit over half the width (beak included), eye low in the panel.
  const scale = (W * 0.56) / 176;
  const bx = W * (0.5 + (spec.dx ?? 0)) - 136 * scale;
  const by = H - W * 0.3 - 80 * scale;
  const head = { x: bx + 108 * scale, y: by + 72 * scale, r: 70 * scale };
  const ctx: Ctx = { W, H, rng, pal, head, hsl };
  const art = spec.motif(ctx);
  const frame = framed ? 8 : 0;
  const clip = framed ? `<clipPath id="p"><rect x="${frame / 2}" y="${frame / 2}" width="${W - frame}" height="${H - frame}" rx="7"/></clipPath>` : '';
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">`,
    `<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${pal.top}"/><stop offset="1" stop-color="${pal.bottom}"/></linearGradient>${clip}</defs>`,
    framed ? '<g clip-path="url(#p)">' : '<g>',
    `<rect width="${W}" height="${H}" fill="url(#g)"/>`,
    art.back,
    bird(spec.pose ?? 'open', bx, by, scale, spec.tilt ?? 0, [head.x, H], hsl(30, 52, 58)),
    art.front ?? '',
    '</g>',
    framed ? `<rect x="${frame / 2}" y="${frame / 2}" width="${W - frame}" height="${H - frame}" rx="7" fill="none" stroke="${INK}" stroke-width="${frame}"/>` : '',
    '</svg>',
  ].join('');
}

const pad = (i: number) => String(i + 1).padStart(2, '0');
const slug = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-');

const svgDir = join(ROOT, 'assets/cards/svg');
const siteDir = join(ROOT, 'apps/site/public/cards');
mkdirSync(svgDir, { recursive: true });
mkdirSync(siteDir, { recursive: true });

SPECS.forEach((spec, i) => {
  writeFileSync(join(svgDir, `magpin-card-${pad(i)}-${slug(spec.name)}.svg`), card(spec, i, true));
  writeFileSync(join(siteDir, `${pad(i)}.svg`), card(spec, i, false));
});

const list = SPECS.map((spec, i) => `  { id: ${i}, name: '${spec.name}', h: ${spec.h}, s: ${spec.s}, l: ${spec.l}, ratio: ${spec.ratio} },`).join('\n');
writeFileSync(
  join(ROOT, 'apps/site/src/cards.gen.ts'),
  `// Generated by assets/cards/generate.ts. Do not edit by hand.\n/** The Magpin cards: one main colour each (hsl), height over width. */\nexport const CARDS = [\n${list}\n] as const;\n`,
);
console.log(`${SPECS.length} cards written`);
