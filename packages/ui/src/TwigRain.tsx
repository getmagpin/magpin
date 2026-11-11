/**
 * A little toy: click anywhere in the host (but on a button or a link) and a
 * twig appears there, falls to the bottom of the host and piles up with the
 * others. After a few seconds they fade away. Drawn on a canvas that never
 * catches a click; the host needs `position: relative`.
 */
import { TWIG_PATHS, prefersReducedMotion } from './magpie';
import type { RefObject } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import { TWIG, type Twig, type TwigWorld, createWorld, opacityOf, resizeWorld, spawn, step } from './twigs';

/** The twig of the beak: stem from its cut end (175, 86) to its fork (237, -16). */
const BASE = { x: 175, y: 86 };
const OWN_ANGLE = Math.atan2(-16 - 86, 237 - 175);
const SCALE = TWIG.length / Math.hypot(237 - 175, -16 - 86);
// Built on first draw: Path2D only exists in a browser (the site renders this module at build time too).
let paths: Path2D[] | null = null;
const twigPaths = () => (paths ??= TWIG_PATHS.map((d) => new Path2D(d)));

function draw(ctx: CanvasRenderingContext2D, twig: Twig) {
  const alpha = opacityOf(twig);
  if (alpha <= 0) return;
  // Pops in at the click: a quick ease-out from smaller.
  const grow = Math.min(1, twig.age / 140);
  const pop = 0.55 + 0.45 * (1 - (1 - grow) ** 3);
  const mid = { x: (twig.a.x + twig.b.x) / 2, y: (twig.a.y + twig.b.y) / 2 };
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(mid.x, mid.y);
  ctx.scale(pop, pop);
  ctx.translate(-mid.x, -mid.y);
  ctx.translate(twig.a.x, twig.a.y);
  ctx.rotate(Math.atan2(twig.b.y - twig.a.y, twig.b.x - twig.a.x));
  ctx.scale(SCALE, twig.flip ? -SCALE : SCALE);
  ctx.rotate(-OWN_ANGLE);
  ctx.translate(-BASE.x, -BASE.y);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  // A thin outline of page around each twig, so the pile reads.
  ctx.strokeStyle = '#fff';
  twigPaths().forEach((path, i) => {
    ctx.lineWidth = (i === 0 ? 10 : 8) + 9;
    ctx.stroke(path);
  });
  ctx.strokeStyle = '#000';
  twigPaths().forEach((path, i) => {
    ctx.lineWidth = i === 0 ? 10 : 8;
    ctx.stroke(path);
  });
  ctx.restore();
}

export function TwigRain({
  host,
  onWorld,
  onDrop,
}: {
  host: RefObject<HTMLElement>;
  /** The twigs' world (where they lie), for others to look at; null when it goes. */
  onWorld?: (world: TwigWorld | null) => void;
  /** Called each time a twig is dropped. */
  onDrop?: () => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const callbacks = useRef({ onWorld, onDrop });
  callbacks.current = { onWorld, onDrop };

  useEffect(() => {
    const area = host.current;
    const el = canvas.current;
    const ctx = el?.getContext('2d');
    if (!area || !el || !ctx || prefersReducedMotion()) return;
    const world = createWorld(area.clientWidth, area.clientHeight);
    callbacks.current.onWorld?.(world);
    let frame = 0;
    let last = 0;

    const fit = () => {
      const dpr = window.devicePixelRatio || 1;
      const width = area.clientWidth;
      const height = area.clientHeight;
      el.width = Math.round(width * dpr);
      el.height = Math.round(height * dpr);
      el.style.width = `${width}px`;
      el.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      resizeWorld(world, width, height);
    };
    const render = () => {
      ctx.clearRect(0, 0, world.width, world.height);
      for (const twig of world.twigs) draw(ctx, twig);
    };
    const tick = (time: number) => {
      const alive = step(world, last ? Math.min(64, time - last) : 1000 / 60);
      last = time;
      render();
      frame = alive ? requestAnimationFrame(tick) : 0;
      if (!alive) last = 0;
    };
    const onDown = (event: PointerEvent) => {
      if (event.button !== 0) return;
      if ((event.target as HTMLElement).closest('button, a, input, textarea, select, [role="button"]')) return;
      const box = area.getBoundingClientRect();
      spawn(world, { x: event.clientX - box.left, y: event.clientY - box.top });
      callbacks.current.onDrop?.();
      if (!frame) frame = requestAnimationFrame(tick);
    };

    fit();
    const observer = new ResizeObserver(() => {
      fit();
      render();
    });
    observer.observe(area);
    area.addEventListener('pointerdown', onDown);
    return () => {
      observer.disconnect();
      area.removeEventListener('pointerdown', onDown);
      cancelAnimationFrame(frame);
      callbacks.current.onWorld?.(null);
    };
  }, [host]);

  return <canvas ref={canvas} class="mp-twig-rain" aria-hidden="true" />;
}
