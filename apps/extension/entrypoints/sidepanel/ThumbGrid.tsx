import { useRef } from 'preact/hooks';
import type { CollectedItem } from '@/src/sources/types';

interface ThumbGridProps {
  items: CollectedItem[];
  deselected: Set<string>;
  onChange: (next: Set<string>) => void;
}

/**
 * Square thumbnails in board order. Click toggles, Shift+click applies the new
 * state to the whole range since the last click.
 */
export function ThumbGrid({ items, deselected, onChange }: ThumbGridProps) {
  const anchor = useRef<number | null>(null);

  const toggle = (index: number, shiftKey: boolean) => {
    const item = items[index];
    if (!item) return;
    const nextSelected = deselected.has(item.id);
    const next = new Set(deselected);
    const from = shiftKey && anchor.current !== null ? Math.min(anchor.current, index) : index;
    const to = shiftKey && anchor.current !== null ? Math.max(anchor.current, index) : index;
    for (let i = from; i <= to; i++) {
      const id = items[i]?.id;
      if (!id) continue;
      if (nextSelected) next.delete(id);
      else next.add(id);
    }
    anchor.current = index;
    onChange(next);
  };

  return (
    <ul class="grid" aria-label="Board images">
      {items.map((item, index) => {
        const selected = !deselected.has(item.id);
        return (
          <li key={item.id}>
            <button
              type="button"
              class="thumb"
              aria-pressed={selected}
              aria-label={`Image ${index + 1}`}
              onClick={(event) => toggle(index, event.shiftKey)}
              // Keep Shift+click from selecting text in the panel.
              onMouseDown={(event) => event.shiftKey && event.preventDefault()}
            >
              <img src={item.thumbUrl} alt="" loading="lazy" decoding="async" draggable={false} />
              <span class="thumb__check" aria-hidden="true">
                <svg viewBox="0 0 12 12" width="10" height="10">
                  <path d="M2.5 6.2 4.9 8.5 9.5 3.6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
                </svg>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
