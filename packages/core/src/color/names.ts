/**
 * Readable color names for the palette variables ("Brick Red", "Sage"…),
 * matched by nearest OKLab distance. A curated, designer-friendly list.
 */
import { type Lab, deltaE, hexToOklab } from './oklab';

const NAMED: readonly [string, string][] = [
  // Neutrals
  ['White', '#FFFFFF'],
  ['Off White', '#F5F3EE'],
  ['Ivory', '#FFFDF0'],
  ['Cream', '#F3E9D2'],
  ['Bone', '#E3DAC9'],
  ['Light Gray', '#D6D6D6'],
  ['Silver', '#BDBDBD'],
  ['Ash', '#A9ABA6'],
  ['Gray', '#808080'],
  ['Stone', '#8D8680'],
  ['Taupe', '#857766'],
  ['Slate', '#5B6370'],
  ['Charcoal', '#36454F'],
  ['Graphite', '#3A3A3A'],
  ['Ink', '#1C2028'],
  ['Jet', '#161616'],
  ['Black', '#000000'],
  // Reds
  ['Red', '#D7263D'],
  ['Scarlet', '#FF2400'],
  ['Crimson', '#DC143C'],
  ['Cherry', '#990F1C'],
  ['Wine', '#722F37'],
  ['Burgundy', '#800020'],
  ['Maroon', '#5C1A1B'],
  ['Brick Red', '#B2442F'],
  ['Rust', '#B7410E'],
  ['Terracotta', '#E2725B'],
  ['Tomato', '#FF6347'],
  ['Coral', '#FF7F50'],
  ['Salmon', '#FA8072'],
  // Pinks
  ['Pink', '#FFC0CB'],
  ['Blush', '#E8B4B8'],
  ['Dusty Rose', '#C0868B'],
  ['Rose', '#E4717A'],
  ['Hot Pink', '#FF69B4'],
  ['Magenta', '#E0218A'],
  ['Fuchsia', '#C21E9A'],
  ['Raspberry', '#B3446C'],
  ['Mauve', '#B784A7'],
  ['Peach', '#FFCBA4'],
  ['Apricot', '#F8B88B'],
  // Oranges and browns
  ['Orange', '#FF7F00'],
  ['Tangerine', '#F28500'],
  ['Amber', '#FFBF00'],
  ['Pumpkin', '#E8751A'],
  ['Burnt Orange', '#CC5500'],
  ['Copper', '#B87333'],
  ['Caramel', '#C68E3F'],
  ['Tan', '#D2B48C'],
  ['Camel', '#C19A6B'],
  ['Sand', '#D8C3A5'],
  ['Beige', '#E9DCC9'],
  ['Khaki', '#C3B091'],
  ['Brown', '#7B4B2A'],
  ['Sienna', '#A0522D'],
  ['Coffee', '#6F4E37'],
  ['Mocha', '#967259'],
  ['Chocolate', '#5A3825'],
  ['Umber', '#635147'],
  ['Espresso', '#3C2A21'],
  // Yellows
  ['Yellow', '#FFDE21'],
  ['Lemon', '#FFF44F'],
  ['Butter', '#F8E8A0'],
  ['Sunflower', '#FFC512'],
  ['Mustard', '#E1AD01'],
  ['Gold', '#D4AF37'],
  ['Honey', '#EBA937'],
  ['Ochre', '#CC7722'],
  ['Straw', '#E4D96F'],
  ['Olive', '#808000'],
  ['Chartreuse', '#C1E01F'],
  // Greens
  ['Lime', '#A4D32F'],
  ['Pistachio', '#93C572'],
  ['Green', '#2E9E4F'],
  ['Grass', '#5DA130'],
  ['Kelly Green', '#4CBB17'],
  ['Emerald', '#50C878'],
  ['Jade', '#00A86B'],
  ['Mint', '#A8E6CF'],
  ['Seafoam', '#93E9BE'],
  ['Sage', '#9CAF88'],
  ['Moss', '#8A9A5B'],
  ['Olive Green', '#6B7F3A'],
  ['Forest Green', '#228B22'],
  ['Hunter Green', '#355E3B'],
  ['Bottle Green', '#006A4E'],
  ['Pine', '#01796F'],
  ['Teal', '#008080'],
  // Cyans and blues
  ['Turquoise', '#40E0D0'],
  ['Aqua', '#3FD0D4'],
  ['Cyan', '#00B7EB'],
  ['Petrol', '#005F6A'],
  ['Ice', '#DDF1F5'],
  ['Powder Blue', '#B0E0E6'],
  ['Baby Blue', '#A1CAF1'],
  ['Sky Blue', '#87CEEB'],
  ['Steel Blue', '#4682B4'],
  ['Cornflower', '#6495ED'],
  ['Azure', '#007FFF'],
  ['Blue', '#2554C7'],
  ['Royal Blue', '#4169E1'],
  ['Cobalt', '#0047AB'],
  ['Klein Blue', '#002FA7'],
  ['Sapphire', '#0F52BA'],
  ['Denim', '#1560BD'],
  ['Navy', '#14213D'],
  ['Midnight Blue', '#191970'],
  ['Periwinkle', '#9CA6E8'],
  ['Slate Blue', '#6A5ACD'],
  // Purples
  ['Indigo', '#4B0082'],
  ['Purple', '#6A0DAD'],
  ['Violet', '#7F3FBF'],
  ['Grape', '#6F2DA8'],
  ['Amethyst', '#9966CC'],
  ['Lavender', '#C3B1E1'],
  ['Lilac', '#C8A2C8'],
  ['Orchid', '#DA70D6'],
  ['Plum', '#8E4585'],
  ['Aubergine', '#3D0734'],
];

let table: { name: string; lab: Lab }[] | null = null;

function namedColors() {
  table ??= NAMED.map(([name, hex]) => ({ name, lab: hexToOklab(hex) }));
  return table;
}

export function nearestColorName(color: Lab): string {
  let best = 'Color';
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const entry of namedColors()) {
    const distance = deltaE(color, entry.lab);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = entry.name;
    }
  }
  return best;
}

/** Names for a list of colors, made unique: "Sage", "Sage 2"… */
export function nameColors(colors: readonly Lab[]): string[] {
  const used = new Map<string, number>();
  return colors.map((color) => {
    const base = nearestColorName(color);
    const count = (used.get(base) ?? 0) + 1;
    used.set(base, count);
    return count === 1 ? base : `${base} ${count}`;
  });
}
