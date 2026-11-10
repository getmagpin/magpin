/**
 * One small demo per feature, each with a visible cause: a switch that sorts,
 * a palette that becomes variables, a duplicate that leaves, boards that
 * merge, a layout picker. They loop only while on screen.
 */
import { Magpie, SourceIcon, prefersReducedMotion } from '@magpin/ui';
import type { JSX } from 'preact';
import { useRef, useState } from 'preact/hooks';
import { Photo, useInView, useStory } from '../parts';
import { PALETTE, PICTURES, type Picture, byColor } from '../photos';


/** Sort by color: a switch, and the board falls into a gradient. */
export function SortDemo() {
  const [stage, active] = useInView<HTMLDivElement>({ threshold: 0.4 });
  // Plays once when seen (a press of the switch, the board sorts); then it is yours to flip.
  const [sorted, setSorted] = useState(prefersReducedMotion());
  const [pressing, setPressing] = useState(false);
  const touched = useRef(false);
  useStory(
    active,
    async ({ wait }) => {
      await wait(900);
      if (touched.current) return;
      setPressing(true);
      await wait(140);
      setPressing(false);
      if (!touched.current) setSorted(true);
    },
    () => {
      if (!touched.current) setSorted(false);
    },
    true,
  );
  const order = sorted ? byColor(PICTURES) : PICTURES;
  return (
    <div ref={stage} class="demo demo--sort">
      <div class="sortgrid" role="img" aria-label={sorted ? 'The board, sorted by color.' : 'The board, as it was pinned.'}>
        {PICTURES.map((p) => {
          const i = order.indexOf(p);
          return <Photo key={p.id} p={p} class="sortgrid__cell" style={{ '--x': i % 12, '--y': Math.floor(i / 12) } as JSX.CSSProperties} />;
        })}
      </div>
      <button
        type="button"
        class={`chip${pressing ? ' is-pressed' : ''}`}
        role="switch"
        aria-checked={sorted}
        onClick={() => {
          touched.current = true;
          setSorted((s) => !s);
        }}
      >
        Sort by color
        <span class={`toggle${sorted ? '' : ' is-off'}`} />
      </button>
    </div>
  );
}

/** The palette, named, and the same colours as Figma variables. */
export function PaletteDemo() {
  const [stage, active] = useInView<HTMLDivElement>({ threshold: 0.4 });
  const [shown, setShown] = useState(prefersReducedMotion() ? PALETTE.length : 0);
  useStory(
    active,
    async ({ wait }) => {
      await wait(300);
      for (let n = 1; n <= PALETTE.length; n++) {
        setShown(n);
        await wait(160);
      }
    },
    () => setShown(0),
    true,
  );
  return (
    <div ref={stage} class="demo demo--palette" role="img" aria-label="The board's palette, named, and saved as Figma color variables.">
      <div class="vars">
        <div class="vars__head">
          <span>Magpin / Shiny things</span>
          <span class="vars__mode">Value</span>
        </div>
        {PALETTE.map((c, i) => (
          <div key={c.name} class={`vars__row${i < shown ? ' is-in' : ''}`}>
            <span class="vars__dot" style={{ background: c.color }} />
            <span class="vars__name">{c.name}</span>
            <span class="vars__hex mp-num">{c.hex}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Images found in more than one of the three boards: placed once. */
const DUPLICATES = 4;

const BOARDS = [
  { source: 'pinterest', title: 'Shiny things', count: 36, pics: [0, 1, 3] },
  { source: 'arena', title: 'Material studies', count: 41, pics: [7, 14, 22] },
  { source: 'savee', title: 'Type & signs', count: 27, pics: [18, 24, 31] },
] as const;

/** What each board brings to the moodboard: a few of the same images turn up twice. */
const SECTIONS = [
  [0, 1, 3, 9, 12, 20],
  [7, 14, 22, 1, 26, 30],
  [18, 24, 31, 3, 14, 33],
];
const repeated = (section: number, n: number) => SECTIONS.slice(0, section).some((s) => s.includes(n));

/** Boards from different sources, into one moodboard; repeats placed once. */
export function BoardsDemo() {
  const [stage, active] = useInView<HTMLDivElement>({ threshold: 0.4 });
  const [inside, setInside] = useState(prefersReducedMotion() ? 3 : 0);
  // Once all three are in, the repeats leave.
  const [deduped, setDeduped] = useState(prefersReducedMotion());
  useStory(
    active,
    async ({ wait }) => {
      await wait(500);
      for (let n = 1; n <= 3; n++) {
        setInside(n);
        await wait(520);
      }
      await wait(500);
      setDeduped(true);
    },
    () => {
      setInside(0);
      setDeduped(false);
    },
    true,
  );
  const images = BOARDS.slice(0, inside).reduce((sum, b) => sum + b.count, 0) - (deduped ? DUPLICATES : 0);
  return (
    <div ref={stage} class="demo demo--boards" role="img" aria-label="Boards from Pinterest, Are.na and Savee in one moodboard, duplicates left out.">
      <div class="boards">
        {BOARDS.map((b, i) => (
          <div key={b.title} class={`boardcard${i < inside ? ' is-in' : ''}`} style={{ '--i': i } as JSX.CSSProperties}>
            <span class="boardcard__pics">
              {b.pics.map((n) => (
                <Photo key={n} p={PICTURES[n]!} />
              ))}
            </span>
            <span class="boardcard__text">
              <span class="boardcard__title">
                <SourceIcon source={b.source} size={12} />
                {b.title}
              </span>
              <span class="boardcard__meta mp-num">{b.count} images</span>
            </span>
          </div>
        ))}
      </div>
      {/* The moodboard: one section per board; an image already placed fades out. */}
      <div class="merge" aria-hidden="true">
        {SECTIONS.map((pics, i) => (
          <div key={i} class={`merge__sec${i < inside ? ' is-in' : ''}`}>
            <span class="merge__name">{BOARDS[i]!.title}</span>
            <span class="merge__grid">
              {pics.map((n) => (
                <Photo key={n} p={PICTURES[n]!} class={deduped && repeated(i, n) ? 'is-gone' : undefined} />
              ))}
            </span>
          </div>
        ))}
      </div>
      <div class="cartline mp-num">
        <span class="cartline__label">Moodboard</span>
        <span key={`${inside}${deduped}`} class="mp-swap">
          {inside === 0 ? 'Empty' : `${inside} board${inside > 1 ? 's' : ''} · ${images} images`}
          {deduped ? <em class="cartline__dupes"> · {DUPLICATES} duplicates left out</em> : null}
        </span>
      </div>
    </div>
  );
}

type Layout = 'grid' | 'mosaic' | 'colors';
const LAYOUTS: Layout[] = ['grid', 'mosaic', 'colors'];
/** Twelve cards from four colour families (three each), pinned mixed up. */
const TWELVE = ['Sun', 'Bubbles', 'Hearts', 'Leaves', 'Burst', 'Planes', 'Coins', 'Ferns', 'Daisies', 'Clouds', 'Flames', 'Grass'].map(
  (name) => PICTURES.find((p) => p.name === name)!,
);

/** Where each of the twelve pictures sits in a layout (in a 236 × 150 box). */
function place(layout: Layout): { x: number; y: number; w: number; h: number }[] {
  const gap = 6;
  if (layout === 'grid') {
    const size = (236 - gap * 5) / 6;
    return TWELVE.map((_, i) => ({ x: (i % 6) * (size + gap), y: Math.floor(i / 6) * (size + gap), w: size, h: size }));
  }
  if (layout === 'mosaic') {
    const cols = 4;
    const w = (236 - gap * (cols - 1)) / cols;
    const heights = Array(cols).fill(0) as number[];
    return TWELVE.map((p) => {
      const c = heights.indexOf(Math.min(...heights));
      const h = Math.round(w * p.ratio * 0.62);
      const spot = { x: c * (w + gap), y: heights[c]!, w, h };
      heights[c]! += h + gap;
      return spot;
    });
  }
  // Colors: one block per family (three in a row), two blocks a row.
  const sorted = byColor(TWELVE);
  const inner = 4;
  const between = 14;
  const size = (236 - between - inner * 4) / 6;
  const spots = new Map<Picture, { x: number; y: number; w: number; h: number }>();
  for (let f = 0; f < 4; f++) {
    const x0 = (f % 2) * (3 * size + 2 * inner + between);
    const y0 = 20 + Math.floor(f / 2) * (size + between);
    sorted.slice(f * 3, f * 3 + 3).forEach((p, i) => spots.set(p, { x: x0 + i * (size + inner), y: y0, w: size, h: size }));
  }
  return TWELVE.map((p) => spots.get(p)!);
}

/** Grid, Mosaic, Colors: the picker's pill slides, the images move. */
export function LayoutDemo() {
  const [stage, active] = useInView<HTMLDivElement>({ threshold: 0.4 });
  const [layout, setLayout] = useState<Layout>('grid');
  // Shows the three once when seen; then the picker is yours.
  const touched = useRef(false);
  useStory(
    active,
    async ({ wait }) => {
      for (const next of ['mosaic', 'colors'] as Layout[]) {
        await wait(1500);
        if (touched.current) return;
        setLayout(next);
      }
    },
    () => {
      if (!touched.current) setLayout('grid');
    },
    true,
  );
  const spots = place(layout);
  const index = LAYOUTS.indexOf(layout);
  return (
    <div ref={stage} class="demo demo--layout">
      <span
        class="seg seg--demo"
        role="radiogroup"
        aria-label="Layout"
        // As a radio group should: one tab stop, the arrow keys move the choice.
        onKeyDown={(event) => {
          const step = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 0;
          if (!step) return;
          event.preventDefault();
          const next = LAYOUTS[(index + step + LAYOUTS.length) % LAYOUTS.length]!;
          touched.current = true;
          setLayout(next);
          const group = event.currentTarget as HTMLElement;
          requestAnimationFrame(() => group.querySelector<HTMLElement>('[aria-checked="true"]')?.focus());
        }}
      >
        <span class="seg__pill" style={{ transform: `translateX(${index * 100}%)` }} />
        {LAYOUTS.map((l) => (
          <button
            key={l}
            type="button"
            role="radio"
            aria-checked={l === layout}
            tabIndex={l === layout ? 0 : -1}
            class={`seg__opt${l === layout ? ' is-on' : ''}`}
            onClick={() => {
              touched.current = true;
              setLayout(l);
            }}
          >
            {l === 'colors' ? 'Colors' : l === 'grid' ? 'Grid' : 'Mosaic'}
          </button>
        ))}
      </span>
      <div class="layoutbox" role="img" aria-label={`The moodboard as ${layout === 'colors' ? 'groups by color' : `a ${layout}`}.`}>
        {TWELVE.map((p, i) => {
          const s = spots[i]!;
          return <Photo key={p.id} p={p} class="layoutbox__cell" style={{ transform: `translate(${s.x}px, ${s.y}px)`, width: `${s.w}px`, height: `${s.h}px` }} />;
        })}
      </div>
    </div>
  );
}

/** No account, no server, no tracking: the magpie keeps an eye out. */
export function PrivateDemo() {
  return (
    <div class="demo demo--private" aria-hidden="true">
      <Magpie size={88} class="private__bird" sticker />
    </div>
  );
}
