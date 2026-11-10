/**
 * Names of the color variables. Figma reads "/" as a group separator and
 * refuses ".", "{" and "}" in a name (they belong to its alias syntax); names
 * must be unique within a collection. Pure: covered by unit tests.
 */

/** One part of a name: no slash, dot, braces or control characters, spaces tidied. */
export function cleanSegment(value: string, fallback: string): string {
  const cleaned = value
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\//g, '-')
    .replace(/[.{}]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned || fallback;
}

/** "A", "A" → "A", "A 2", never one of `taken`. */
export function uniqueNames(names: readonly string[], taken: Iterable<string> = []): string[] {
  const used = new Set(taken);
  return names.map((name) => {
    let candidate = name;
    for (let n = 2; used.has(candidate); n++) candidate = `${name} ${n}`;
    used.add(candidate);
    return candidate;
  });
}

/**
 * Every board's palette, flattened in board order. One board: "Brick Red".
 * Several: each board is a group, "Board/Brick Red".
 */
export function variableNames(blocks: readonly { title: string; colors: readonly string[] }[]): string[] {
  const several = blocks.length > 1;
  const groups = uniqueNames(blocks.map((block) => cleanSegment(block.title, 'Board')));
  return blocks.flatMap((block, b) => {
    const names = uniqueNames(block.colors.map((name) => cleanSegment(name, 'Color')));
    return several ? names.map((name) => `${groups[b]}/${name}`) : names;
  });
}

/**
 * Updating a collection in place: which existing variable each wanted name
 * reuses (index into `existing`, or null for a new one), and which go.
 *
 * A variable already holding a wanted name keeps it; the others are reused in
 * order and renamed. A rename then never targets a name another variable still
 * holds, so there is no collision on the way, whatever the order.
 */
export function planVariableUpdate(existing: readonly string[], wanted: readonly string[]): { reuse: (number | null)[]; remove: number[] } {
  const byName = new Map<string, number>();
  existing.forEach((name, i) => {
    if (!byName.has(name)) byName.set(name, i);
  });
  const free = new Set(existing.map((_, i) => i));
  const reuse = wanted.map((name) => {
    const i = byName.get(name);
    if (i === undefined || !free.has(i)) return null;
    free.delete(i);
    return i;
  });
  const left = [...free];
  for (let w = 0; w < reuse.length && left.length > 0; w++) if (reuse[w] === null) reuse[w] = left.shift()!;
  return { reuse, remove: left };
}
