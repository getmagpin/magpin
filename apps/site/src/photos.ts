/**
 * The "images" of the demos: the Magpin cards (assets/cards), small comic
 * panels with the magpie's head, one main colour each so the colour sort reads
 * at a glance and no one's photos are borrowed.
 */
import { CARDS } from './cards.gen';

export interface Picture {
  id: number;
  name: string;
  h: number;
  s: number;
  l: number;
  /** Height over width, for the mosaic. */
  ratio: number;
  src: string;
}

/**
 * The board, in the order it was pinned: every colour mixed up, as boards are.
 * (11 and 36 have no common factor, so stepping by 11 visits every card once.)
 */
export const PICTURES: Picture[] = CARDS.map((_, i) => CARDS[(i * 11) % CARDS.length]!).map((card) => ({
  ...card,
  src: `./cards/${String(card.id + 1).padStart(2, '0')}.svg`,
}));

const hsl = (h: number, s: number, l: number) => `hsl(${Math.round(((h % 360) + 360) % 360)} ${Math.max(0, Math.min(100, s))}% ${Math.max(4, Math.min(96, l))}%)`;

/** Main colour of a picture, for swatches (and behind the card while it loads). */
export const colorOf = (p: Picture) => hsl(p.h, p.s, p.l);

/** CSS background of a picture: the card, cropped from the bottom so the head stays. */
export function paint(p: Picture): string {
  return `url("${p.src}") 50% 100% / cover no-repeat, ${colorOf(p)}`;
}

/**
 * Sorted as Magpin sorts: colours round the hue wheel (cut where the board
 * has none), then the neutrals, light to dark.
 */
export function byColor(pictures: readonly Picture[]): Picture[] {
  const colourful = pictures.filter((p) => p.s >= 12);
  const neutral = pictures.filter((p) => p.s < 12).sort((a, b) => b.l - a.l);
  const cut = 300;
  const hue = (p: Picture) => (p.h - cut + 360) % 360;
  return [...colourful.sort((a, b) => hue(a) - hue(b) || b.l - a.l), ...neutral];
}

/** The board's palette: a few colors round the wheel, then ink, with the names Magpin gives them. */
export const PALETTE: { name: string; color: string; hex: string }[] = [
  { name: 'Red', color: '#DE4635', hex: '#DE4635' },
  { name: 'Amber', color: '#F0B938', hex: '#F0B938' },
  { name: 'Grass', color: '#6CA446', hex: '#6CA446' },
  { name: 'Steel Blue', color: '#389DA8', hex: '#389DA8' },
  { name: 'Amethyst', color: '#7F67C1', hex: '#7F67C1' },
  { name: 'Ink', color: '#1E1C1A', hex: '#1E1C1A' },
];
