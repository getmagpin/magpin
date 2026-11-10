/**
 * The hero: the whole flow in one take. A board in Chrome, Magpin's panel
 * reading it; Copy for Figma; the camera moves to Figma; ⌘V in the plugin,
 * its preview (as in the real plugin: the sketch of the section and the
 * palette), Create; the images load, are arranged, then placed on the canvas
 * already sorted by color, the palette beside them. Poster frame: the
 * finished moodboard.
 *
 * Wide screens see each window whole across; narrow ones get the same scene
 * cut closer, with three camera stops (the panel, the plugin, the canvas).
 */
import { Cheer, KeysBird, Magpie, type NestMemory, NestScene, SourceIcon, freshNest, prefersReducedMotion } from '@magpin/ui';
import type { JSX } from 'preact';
import { useLayoutEffect, useRef, useState } from 'preact/hooks';
import { Cursor, Photo, useInView, useStory } from '../parts';
import { PALETTE, PICTURES, byColor } from '../photos';

const TOTAL = PICTURES.length;
/** Thumbnails the panel shows: three rows of three. */
const THUMBS = 9;
const SORTED = byColor(PICTURES);

type View = 'paste' | 'preview' | 'build' | 'done';
type Stop = 'browser' | 'figma' | 'canvas';

interface Scene {
  stop: Stop;
  /** The panel shows a new board and waits for "Collect this board". */
  found: boolean;
  starting: boolean;
  count: number;
  scanned: boolean;
  copied: boolean;
  pressing: boolean;
  peek: boolean;
  keys: { mod: boolean; v: boolean };
  pasted: boolean;
  view: View;
  creating: boolean;
  /** Images loaded by the plugin (before anything is placed). */
  loaded: number;
  placed: number;
  /** Arranged: placing can start. */
  sorted: boolean;
  palette: boolean;
  build: number;
  cursor: { x: number; y: number; hand: boolean; down: boolean; hidden: boolean };
}

const START: Scene = {
  stop: 'browser',
  found: true,
  starting: false,
  count: 0,
  scanned: false,
  copied: false,
  pressing: false,
  peek: false,
  keys: { mod: false, v: false },
  pasted: false,
  view: 'paste',
  creating: false,
  loaded: 0,
  placed: 0,
  sorted: false,
  palette: false,
  build: 0,
  cursor: { x: 0, y: 0, hand: false, down: false, hidden: true },
};

/** The finished moodboard: what a still (or Reduce motion) shows. */
const POSTER: Scene = { ...START, stop: 'figma', found: false, count: TOTAL, scanned: true, copied: true, pasted: true, view: 'done', loaded: TOTAL, placed: TOTAL, sorted: true, palette: true, build: 1 };

/** Which of the three steps the story is on, and for about how long. */
export type OnBeat = (step: 0 | 1 | 2, ms: number) => void;

export function FlowDemo({ onBeat, jump }: { onBeat?: OnBeat; jump?: { step: number; key: number } } = {}) {
  const [stage, active] = useInView<HTMLDivElement>({ threshold: 0.35 });
  const [scene, setScene] = useState<Scene>(prefersReducedMotion() ? POSTER : START);
  const [camera, setCamera] = useState(0);
  const strip = useRef<HTMLDivElement>(null);
  const jumped = useRef(0);
  const nest = useRef<NestMemory>(freshNest());
  const [loop, setLoop] = useState(0);
  const startAt = useRef(0);
  if (jump && jump.key !== jumped.current) {
    jumped.current = jump.key;
    startAt.current = jump.step;
  }
  const sceneRef = useRef(scene);
  sceneRef.current = scene;
  const set = (patch: Partial<Scene> | ((s: Scene) => Partial<Scene>)) => setScene((s) => ({ ...s, ...(typeof patch === 'function' ? patch(s) : patch) }));

  // ---- Camera: where each stop sits on the strip. ----
  const compact = () => (stage.current?.clientWidth ?? 1000) < 760;
  const region = (name: string) => strip.current?.querySelector<HTMLElement>(`[data-stop="${name}"]`) ?? null;
  const boxOf = (el: HTMLElement) => {
    const s = strip.current!.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    return { x: r.left - s.left, y: r.top - s.top, w: r.width, h: r.height };
  };
  const cameraFor = (stop: Stop): number => {
    const width = stage.current?.clientWidth ?? 1000;
    const total = strip.current?.scrollWidth ?? width;
    const name = compact() ? { browser: 'panel', figma: 'plugin', canvas: 'canvas' }[stop] : stop === 'canvas' ? 'figma' : stop;
    const el = region(name);
    if (!el) return 0;
    const box = boxOf(el);
    const gutter = 24;
    const x = compact() ? box.x + box.w / 2 - width / 2 : box.x - gutter;
    return -Math.max(0, Math.min(total - width, x));
  };
  const go = (stop: Stop) => {
    setCamera(cameraFor(stop));
    set({ stop });
  };
  // The cursor's spot over an element, once the camera has arrived.
  const aim = (selector: string, stop: Stop, dx = 0.5, dy = 0.5) => {
    const el = strip.current?.querySelector<HTMLElement>(selector);
    if (!el) return { x: 0, y: 0 };
    const box = boxOf(el);
    return { x: box.x + box.w * dx + cameraFor(stop), y: box.y + box.h * dy };
  };

  useLayoutEffect(() => {
    setCamera(cameraFor(scene.stop));
    const observer = new ResizeObserver(() => setCamera(cameraFor(sceneRef.current.stop)));
    if (stage.current) observer.observe(stage.current);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useStory(
    active,
    async ({ wait }) => {
      const cursorTo = (selector: string, stop: Stop, extra: Partial<Scene['cursor']> = {}) =>
        set((s) => ({ cursor: { ...s.cursor, ...aim(selector, stop), hidden: false, ...extra } }));
      // Clicks land in the lower part of a button, where a finger would press.
      const low = (selector: string, stop: Stop) => aim(selector, stop, 0.5, 0.7);
      const click = async () => {
        set((s) => ({ cursor: { ...s.cursor, down: true } }));
        await wait(130);
        set((s) => ({ cursor: { ...s.cursor, down: false } }));
      };

      // A step picked below the demo starts the story there (once).
      const from = startAt.current;
      startAt.current = 0;

      // 1. The panel shows the board; Collect this board; it reads it.
      if (from <= 0) {
        onBeat?.(0, 8700);
        set({ found: true });
        cursorTo('[data-target="collect"]', 'browser', { hand: true, ...low('[data-target="collect"]', 'browser') });
        await wait(1150);
        set({ starting: true });
        await click();
        set({ starting: false, found: false });
        await wait(120);
        set((s) => ({ cursor: { ...s.cursor, hand: false, ...aim('[data-target="grid"]', 'browser', 0.62, 0.3), hidden: false } }));
        // One image after the other, slowly enough to see each one land.
        for (let n = 1; n <= TOTAL; n++) {
          set({ count: n });
          await wait(n <= 9 ? 230 : 150);
        }
        set({ scanned: true });
        await wait(900);
      } else {
        set({ found: false, count: TOTAL, scanned: true });
      }

      // 2. Copy for Figma.
      if (from <= 1) {
        onBeat?.(1, 2450);
        cursorTo('[data-target="copy"]', 'browser', { hand: true, ...low('[data-target="copy"]', 'browser') });
        await wait(820);
        set({ pressing: true });
        await click();
        set({ pressing: false, copied: true, peek: true });
        await wait(1500);
      } else {
        set({ copied: true });
      }

      // 3. Over to Figma; the panel quietly starts over, out of sight.
      onBeat?.(2, 12900);
      go('figma');
      set((s) => ({ cursor: { ...s.cursor, hand: false } }));
      await wait(250);
      cursorTo('[data-target="paste"]', 'figma', { hand: false, ...low('[data-target="paste"]', 'figma') });
      await wait(900);
      await click();
      await wait(250);
      set({ keys: { mod: true, v: false } });
      await wait(260);
      set({ keys: { mod: true, v: true } });
      await wait(140);
      set({ keys: { mod: false, v: false }, pasted: true });
      await wait(620);
      set({ view: 'preview', pasted: false });
      // Chrome is well out of sight now: its panel starts over for the next board.
      set({ count: 0, scanned: false, copied: false, peek: false });
      await wait(700);

      // 4. Create.
      cursorTo('[data-target="create"]', 'figma', { hand: true, ...low('[data-target="create"]', 'figma') });
      await wait(800);
      set({ creating: true });
      await click();
      set({ creating: false, view: 'build' });
      nest.current = freshNest();
      setLoop((n) => n + 1);
      await wait(200);

      // 5. As the plugin does it: load the images, arrange them, then place
      // them on the canvas, already sorted by color, the palette beside them.
      for (let n = 1; n <= TOTAL; n++) {
        set({ loaded: n, build: (0.55 * n) / TOTAL });
        await wait(30);
      }
      set({ sorted: true, build: 0.6 });
      await wait(450);
      set((s) => ({ cursor: { ...s.cursor, hand: false, ...aim('[data-target="canvas-rest"]', 'canvas') } }));
      go('canvas');
      await wait(300);
      for (let n = 1; n <= TOTAL; n++) {
        set({ placed: n, build: 0.6 + (0.35 * n) / TOTAL });
        await wait(32);
      }
      await wait(300);
      set({ palette: true, build: 1 });
      await wait(400);
      go('figma');
      set({ view: 'done' });
      await wait(3600);

      // 6. Back to Chrome for the next board; Figma clears behind the camera.
      set((s) => ({ cursor: { ...s.cursor, hidden: true } }));
      go('browser');
      await wait(1300);
    },
    () => {
      nest.current = freshNest();
      setScene({ ...START, cursor: { ...START.cursor, ...aim('[data-target="grid"]', 'browser', 0.62, 0.3) } });
      setCamera(cameraFor('browser'));
      setLoop((n) => n + 1);
    },
    false,
    jump?.key,
  );

  const progress = scene.count / TOTAL;
  return (
    <div ref={stage} class="flow" aria-label="Magpin in action: a board read in Chrome, then pasted into Figma, sorted by color with its palette." role="img">
      <div ref={strip} class="flow__strip" style={{ transform: `translateX(${camera}px)` }}>
        {/* Chrome: the board, and Magpin's side panel reading it. */}
        <div class="win win--browser" data-stop="browser">
          <div class="win__bar">
            <span class="win__lights">
              <i />
              <i />
              <i />
            </span>
            <span class="win__url">pinterest.com/…/shiny-things</span>
          </div>
          <div class="browser">
            <div class="board">
              <div class="board__head">
                <div class="board__title">Shiny things</div>
                <div class="board__meta">36 pins</div>
              </div>
              <div class="board__grid">
                {PICTURES.slice(0, 20).map((p) => (
                  <Photo key={p.id} p={p} class="board__pin" style={{ aspectRatio: `1 / ${p.ratio}` }} />
                ))}
              </div>
            </div>
            <Panel scene={scene} progress={progress} />
          </div>
        </div>

        {/* Figma: the canvas, and the Magpin plugin. */}
        <div class="win win--figma" data-stop="figma">
          <div class="win__bar win__bar--figma">
            <span class="win__lights">
              <i />
              <i />
              <i />
            </span>
            <span class="figma__file">Moodboards</span>
            <span class="figma__share">Share</span>
          </div>
          <div class="figma">
            <div class="figma__layers">
              <div class="figma__layers-title">Layers</div>
              <div class={`figma__layer${scene.placed > 0 ? ' is-in' : ''}`}>
                <span class="figma__section-icon" />
                Moodboard — Shiny things
              </div>
              {['01', '02', '03', '04', '05'].map((n, i) => (
                <div key={n} class={`figma__layer figma__layer--child${scene.placed > i * 6 ? ' is-in' : ''}`}>
                  <span class="figma__rect-icon" />
                  {n}
                </div>
              ))}
              <div class={`figma__layer figma__layer--child${scene.palette ? ' is-in' : ''}`}>
                <span class="figma__frame-icon" />
                Palette
              </div>
            </div>
            <div class="figma__canvas" data-target="canvas-rest">
              <div class={`fsection${scene.placed > 0 ? ' is-in' : ''}`} data-stop="canvas">
                <div class="fsection__label">Moodboard — Shiny things</div>
                <div class="fsection__body">
                  <div class="fsection__grid">
                    {SORTED.map((p, index) => {
                      const shown = index < scene.placed;
                      return (
                        <span
                          key={p.id}
                          class={`fsection__cell${shown ? ' is-in' : ''}`}
                          style={{ '--x': index % 6, '--y': Math.floor(index / 6) } as JSX.CSSProperties}
                        >
                          <Photo p={p} />
                        </span>
                      );
                    })}
                  </div>
                  <div class={`fsection__palette${scene.palette ? ' is-in' : ''}`}>
                    {PALETTE.map((c, i) => (
                      <span key={c.name} class="swatch" style={{ '--i': i } as JSX.CSSProperties}>
                        <span class="swatch__color" style={{ background: c.color }} />
                        <span class="swatch__name">{c.name}</span>
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
            <Plugin scene={scene} nest={nest.current} loop={loop} />
          </div>
        </div>
      </div>
      <Cursor {...scene.cursor} />
    </div>
  );
}

/** Magpin's side panel, as it looks while reading a board. */
function Panel({ scene, progress }: { scene: Scene; progress: number }) {
  const view = useRef<HTMLDivElement>(null);
  const shown = Math.ceil((scene.count * THUMBS) / TOTAL);
  // Keep the newest thumbnail in view (offsets are measured from the view itself).
  useLayoutEffect(() => {
    const box = view.current;
    if (!box) return;
    if (shown === 0) {
      box.scrollTop = 0;
      return;
    }
    const last = box.querySelector<HTMLElement>(`[data-i="${shown - 1}"]`);
    if (!last) return;
    const top = Math.max(0, last.offsetTop + last.offsetHeight - box.clientHeight + 4);
    if (Math.abs(top - box.scrollTop) > 1) box.scrollTo({ top, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
  }, [shown]);
  return (
    <div class="panel" data-stop="panel">
      <div class="panel__top">
        <span class="brand">
          <img src="./icon.png" alt="" width="26" height="26" />
          <span class="brand__name">Magpin</span>
        </span>
        <span class="panel__source">
          <SourceIcon source="pinterest" size={12} />
          Pinterest
        </span>
      </div>
      <div class="panel__title">Shiny things</div>
      <div class="panel__meta">
        {scene.found ? `${TOTAL} images on the board` : `${scene.count} ${scene.count === 1 ? 'image' : 'images'}${scene.scanned ? ' · Scan again' : ''}`}
      </div>
      <div class={`panel__scan${scene.scanned ? ' is-done' : ''}`}>
        <div class="panel__line">
          <span class="panel__fill" style={{ transform: `scaleX(${scene.scanned ? 1 : progress})` }} />
          <span class="panel__bird" style={{ left: `${(scene.scanned ? 1 : progress) * 100}%` }}>
            <span class={scene.scanned ? 'panel__hop is-end' : scene.found ? 'panel__hop is-still' : 'panel__hop'}>
              <Magpie size={24} eyes={scene.scanned ? 'closed' : 'open'} blinks={false} />
              {scene.scanned ? <Cheer size={24} class="panel__cheer" /> : null}
            </span>
          </span>
        </div>
        {scene.found ? (
          // A new board waits for the user, as in the extension.
          <div class="panel__start">
            <span class={`dockbtn dockbtn--ink${scene.starting ? ' is-pressed' : ''}`} data-target="collect">
              Collect this board
            </span>
            <span class="panel__hint">Magpin reads every image on it, at full size.</span>
          </div>
        ) : (
          <div class="panel__row">
            <span>{scene.scanned ? `Collected ${scene.count} images` : `Collecting ${scene.count} / ${TOTAL}`}</span>
            <span class="panel__stop">{scene.scanned ? '' : 'Stop'}</span>
          </div>
        )}
      </div>
      {/*
        Nine thumbnails, portrait like the pins on the board, in a tidy grid:
        they fill in one after the other, row by row, while the count runs on
        above; the view follows the newest row.
      */}
      <div ref={view} class="panel__view" data-target="grid">
        <div class="panel__grid">
          {PICTURES.slice(0, THUMBS).map((p, i) => (
            <span key={p.id} data-i={i} class={`panel__thumb${i < shown ? ' is-in' : ''}`}>
              <Photo p={p} />
              <i class="panel__check" />
            </span>
          ))}
        </div>
      </div>
      <div class="panel__dock">
        {scene.peek ? (
          <div class="panel__peek">
            <span class="panel__peek-bird">
              <Magpie size={70} eyes="closed" blinks={false} />
            </span>
            <span class="panel__peek-text">
              <strong>Copied {TOTAL} images</strong>
              In Figma, run Magpin and press ⌘V.
            </span>
          </div>
        ) : null}
        {/* As in the extension: offered once the board is read. */}
        {scene.scanned ? <span class="dockbtn dockbtn--wash">+ Add to moodboard</span> : null}
        <span class={`dockbtn dockbtn--ink${scene.pressing ? ' is-pressed' : ''}`} data-target="copy">
          <span key={scene.copied ? 'copied' : 'copy'} class="mp-swap">
            {scene.copied ? '✓ Copied' : 'Copy for Figma'}
          </span>
        </span>
        <span class="dockbtn dockbtn--line">Download ZIP</span>
      </div>
    </div>
  );
}

/** The Magpin plugin window, inside Figma. */
function Plugin({ scene, nest, loop }: { scene: Scene; nest: NestMemory; loop: number }) {
  return (
    <div class="plugin" data-stop="plugin">
      <div class="plugin__bar">
        <img src="./icon.png" alt="" width="16" height="16" />
        Magpin
        <span class="plugin__close">×</span>
      </div>
      <div class="plugin__body" data-target="paste">
        <div class="plugin__top">
          <span class="brand">
            <img src="./icon.png" alt="" width="24" height="24" />
            <span class="brand__name">Magpin</span>
          </span>
        </div>
        {scene.view === 'paste' ? (
          <div class="plugin__paste" key={`paste-${loop}`}>
            <KeysBird mac down={scene.keys} celebrate={scene.pasted} idle={false} />
            <div class="plugin__headline">Paste your board</div>
            <div class="plugin__sub">Copy a board with the Magpin extension, then press ⌘V here or right on the canvas.</div>
          </div>
        ) : scene.view === 'preview' ? (
          // The plugin's preview: the sketch of the moodboard to come (the
          // section and its Palette frame, in grey), the count, the board,
          // then the settings, grouped; Create docked at the bottom.
          <div class="plugin__preview mp-swap">
            <div class="psketch" aria-hidden="true">
              <span class="psketch__label">Moodboard — Shiny things</span>
              <span class="psketch__label psketch__label--palette">Palette</span>
              <span class="psketch__section">
                {Array.from({ length: SKETCH_TILES }, (_, i) => (
                  <i key={i} style={{ background: shade(i / (SKETCH_TILES - 1)) }} />
                ))}
              </span>
              <span class="psketch__palette">
                {PALETTE.map((c, i) => (
                  <i key={c.name}>
                    <b style={{ background: shade(0.15 + (i / (PALETTE.length - 1)) * 0.85) }} />
                    <u />
                  </i>
                ))}
              </span>
            </div>
            <div class="plugin__count">36</div>
            <div class="plugin__label">Images</div>
            <div class="plugin__board">
              <SourceIcon source="pinterest" size={14} />
              <span>Shiny things</span>
              <span class="plugin__muted">36</span>
            </div>
            <div class="plugin__group">Layout</div>
            <span class="seg seg--full">
              <i class="is-on">Grid</i>
              <i>Mosaic</i>
              <i>Colors</i>
            </span>
            <div class="plugin__hint">Same-size squares, row after row.</div>
            <div class="plugin__row">
              <span>Columns</span>
              <span class="pstep">
                <i>−</i>6<i>+</i>
              </span>
            </div>
          </div>
        ) : (
          <div class="plugin__stage" key={`stage-${loop}`}>
            <NestScene progress={scene.build} images={240} memory={nest} complete={scene.view === 'done'} />
            {scene.view === 'done' ? (
              <>
                <div class="plugin__headline mp-swap">Done</div>
                <div class="plugin__sub">
                  36 images placed in <strong>Moodboard — Shiny things</strong>
                </div>
              </>
            ) : (
              <>
                <div class="plugin__progress mp-num">
                  {scene.placed > 0 ? scene.placed : scene.loaded}
                  <span> / 36</span>
                </div>
                <div class="plugin__sub">{scene.placed > 0 ? 'Placing in Figma' : scene.sorted ? 'Arranging' : 'Loading images'}</div>
              </>
            )}
          </div>
        )}
      </div>
      {scene.view === 'preview' ? (
        <div class="plugin__dock mp-swap">
          <span class={`dockbtn dockbtn--ink${scene.creating ? ' is-pressed' : ''}`} data-target="create">
            Create moodboard
          </span>
          <span class="plugin__over">Start over</span>
        </div>
      ) : null}
    </div>
  );
}

/** The preview sketch's blocks: four rows of six, light to dark (sorted by color). */
const SKETCH_TILES = 24;
/** The sketch's greys, as in the plugin (0 = lightest). */
const shade = (t: number) => `hsl(0 0% ${(91 - t * 26).toFixed(1)}%)`;
