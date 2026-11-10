/**
 * The magpie as a character: the logo mark, optionally carrying a twig, with
 * eyes that open, squint, close and blink, and the motion helpers that make it
 * hop. Shared by the extension and the plugin.
 */
import type { JSX, Ref } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { MARK_CLOSED_PATH } from './logo-closed-path';
import { MARK_PATH } from './logo-path';

/** The bird's own box (the logo mark). A carried twig pokes out of it. */
const BOX = { w: 221, h: 312 };
/** Width of the bird for a given height. */
export const MAGPIE_ASPECT = BOX.w / BOX.h;
/** Where the feet are in the bird's box, as a fraction (hop pivot). */
export const MAGPIE_FEET = { x: 0.52, y: 1 };

/** The mark is a body with the eye cut out; split them so the eye can move. */
function splitEye(path: string): { body: string; eye: string } {
  const [body = '', ...eye] = path.split(/(?=M )/);
  return { body: body.trim(), eye: eye.join(' ').trim() };
}
const OPEN_BEAK = splitEye(MARK_PATH);
const SHUT_BEAK = splitEye(MARK_CLOSED_PATH);

/** Twig gripped in the shut beak, drawn behind the bird (the beak hides it). */
export const TWIG_PATHS = [
  'M 175 86 C 186 66, 200 44, 214 22 C 222 9, 230 -4, 237 -16',
  'M 237 -16 C 239 -26, 242 -34, 246 -42',
  'M 237 -16 C 246 -20, 255 -22, 264 -21',
  'M 222 7 C 228 5, 233 6, 238 9',
];

/**
 * The shut eye: a thin crescent at the top of the eye, tilted like the beak.
 * Closing, the open eye squashes up into it.
 */
const SHUT_EYE =
  'M 86 62.5 C 95 61, 105 56.5, 113.5 49.5 C 115.5 47.8, 118 45.6, 119.6 46.4 C 121 47.4, 120.2 51.5, 117.6 55.2 C 111.5 63.2, 100.5 67.6, 86 62.5 Z';

export type Eyes = 'open' | 'squint' | 'closed';

interface MagpieProps {
  /** Height of the bird in px. The twig is added around it, never shrinks it. */
  size: number;
  /** Carries a twig, beak shut on it. */
  twig?: boolean;
  eyes?: Eyes;
  /** Blinks now and then. */
  blinks?: boolean;
  /** Opens its eyes when it appears. */
  wake?: boolean;
  class?: string;
  innerRef?: Ref<HTMLDivElement>;
  /** Drawn as a sticker: a white outline and a soft shadow, like the icon. */
  sticker?: boolean;
}

let stickers = 0;

/**
 * The sticker look, as on the icon: the silhouette grown by a few pixels and
 * filled white (blur then a hard alpha threshold, so the outline stays round),
 * a soft shadow under it, the bird on top. Sized in px whatever the bird's size.
 */
function StickerFilter({ id, size }: { id: string; size: number }) {
  const k = size / BOX.h;
  const outline = Math.max(3, size * 0.026);
  const spread = outline / (1.7 * k);
  return (
    <filter id={id} x="-25%" y="-15%" width="150%" height="135%" color-interpolation-filters="sRGB">
      <feGaussianBlur in="SourceAlpha" stdDeviation={spread.toFixed(2)} result="blur" />
      <feComponentTransfer in="blur" result="grown">
        <feFuncA type="linear" slope="12" intercept="-0.6" />
      </feComponentTransfer>
      <feGaussianBlur in="grown" stdDeviation={((outline * 0.7) / k).toFixed(2)} result="soft" />
      <feOffset in="soft" dy={((outline * 0.55) / k).toFixed(2)} result="drop" />
      <feFlood flood-color="#000" flood-opacity="0.2" />
      <feComposite in2="drop" operator="in" result="shadow" />
      <feFlood flood-color="#fff" />
      <feComposite in2="grown" operator="in" result="white" />
      <feMerge>
        <feMergeNode in="shadow" />
        <feMergeNode in="white" />
        <feMergeNode in="SourceGraphic" />
      </feMerge>
    </filter>
  );
}

export function Magpie({ size, twig = false, eyes = 'open', blinks = true, wake = false, class: extra, innerRef, sticker = false }: MagpieProps) {
  const [filterId] = useState(() => `mp-sticker-${++stickers}`);
  const svg = useRef<SVGSVGElement>(null);
  const [awake, setAwake] = useState(!wake);
  const state: Eyes = awake ? eyes : 'closed';
  const stateRef = useRef(state);
  stateRef.current = state;

  // Eyes open a beat after the bird shows up, then a double blink.
  useEffect(() => {
    if (!wake) return;
    if (prefersReducedMotion()) {
      setAwake(true);
      return;
    }
    const open = setTimeout(() => setAwake(true), 280);
    const flutter = setTimeout(() => blink(svg.current, true), 1100);
    return () => {
      clearTimeout(open);
      clearTimeout(flutter);
    };
  }, [wake]);

  // Idle blinks at uneven intervals, sometimes twice.
  useEffect(() => {
    if (!blinks || prefersReducedMotion()) return;
    let timer: ReturnType<typeof setTimeout>;
    const next = () => {
      timer = setTimeout(() => {
        if (stateRef.current === 'open') blink(svg.current, Math.random() < 0.25);
        next();
      }, 2400 + Math.random() * 3600);
    };
    next();
    return () => clearTimeout(timer);
  }, [blinks]);

  const shape = twig ? SHUT_BEAK : OPEN_BEAK;
  const width = size * MAGPIE_ASPECT;
  return (
    <div ref={innerRef} class={`mp-magpie${extra ? ` ${extra}` : ''}`} style={{ width: `${width}px`, height: `${size}px` }} aria-hidden="true">
      <svg ref={svg} viewBox={`0 0 ${BOX.w} ${BOX.h}`} width={width} height={size} data-eyes={state}>
        {sticker ? <StickerFilter id={filterId} size={size} /> : null}
        <g filter={sticker ? `url(#${filterId})` : undefined}>
          {twig
            ? TWIG_PATHS.map((d, i) => <path key={d} d={d} fill="none" stroke="currentColor" stroke-width={i === 0 ? 10 : 8} stroke-linecap="round" />)
            : null}
          <path fill="currentColor" d={shape.body} />
          {/* The gaze group lets the eye look around without touching its blink. */}
          <g class="mp-magpie__gaze">
            <path class="mp-magpie__eye" d={shape.eye} />
            <path class="mp-magpie__shut" d={SHUT_EYE} />
          </g>
        </g>
      </svg>
    </div>
  );
}

/** The head alone, cut at the neck as on the sticker: for peeks over an edge. `size` is its height. */
const HEAD = { x: 44, y: -2, w: 184, h: 142 };
export function MagpieHead({ size, class: extra }: { size: number; class?: string }) {
  return (
    <svg
      class={`mp-head${extra ? ` ${extra}` : ''}`}
      viewBox={`${HEAD.x} ${HEAD.y} ${HEAD.w} ${HEAD.h}`}
      width={Math.round((size * HEAD.w) / HEAD.h)}
      height={size}
      aria-hidden="true"
    >
      <path fill="currentColor" d={OPEN_BEAK.body} />
      <path class="mp-head__eye" d={OPEN_BEAK.eye} />
    </svg>
  );
}

/**
 * The success: a little burst of rays above the bird's head. Place it at the
 * centre of the head; `size` is the bird's height.
 */
export function Cheer({ size, class: extra, style }: { size: number; class?: string; style?: JSX.CSSProperties }) {
  const vars = {
    '--r': `${Math.round(size * 0.56)}px`,
    '--len': `${Math.max(4, Math.round(size * 0.15))}px`,
    '--w': `${Math.max(1.5, Math.round(size * 0.037 * 2) / 2)}px`,
  } as JSX.CSSProperties;
  return (
    <span class={`mp-cheer${extra ? ` ${extra}` : ''}`} style={{ ...vars, ...style }} aria-hidden="true">
      {[-64, -32, 0, 32, 64].map((angle) => (
        <i key={angle} style={{ '--a': `${angle}deg` } as JSX.CSSProperties} />
      ))}
    </span>
  );
}

/** One quick blink (or two): the eye squashes up into the crescent and back. */
export function blink(svg: Element | null, twice = false): void {
  const eye = svg?.querySelector('.mp-magpie__eye');
  const shut = svg?.querySelector('.mp-magpie__shut');
  if (!eye || !shut || prefersReducedMotion() || typeof eye.animate !== 'function') return;
  const frames = (open: string, closed: string): Keyframe[] =>
    twice
      ? [{ transform: open }, { offset: 0.18, transform: closed }, { offset: 0.42, transform: open }, { offset: 0.6, transform: closed }, { transform: open }]
      : [{ transform: open }, { offset: 0.4, transform: closed }, { transform: open }];
  const timing = { duration: twice ? 460 : 210, easing: 'cubic-bezier(0.45, 0, 0.55, 1)' };
  eye.animate(frames('scaleY(1)', 'scaleY(0)'), timing);
  shut.animate(frames('scaleY(0)', 'scaleY(1)'), timing);
}

export interface Pose {
  /** Feet position in the stage, px. */
  x: number;
  y: number;
  /** 1 = facing right (the mark's own direction), -1 = left. */
  facing: 1 | -1;
}

/** Transform placing a magpie `size` px tall with its feet at the pose. */
export function poseTransform(pose: Pose, size: number, extra = ''): string {
  const left = pose.x - size * MAGPIE_ASPECT * MAGPIE_FEET.x;
  const top = pose.y - size * MAGPIE_FEET.y;
  return `translate(${left.toFixed(1)}px, ${top.toFixed(1)}px) scaleX(${pose.facing}) ${extra}`.trim();
}

/** One hop: crouch, jump in an arc, land with a little squash. */
export function hopKeyframes(from: Pose, to: Pose, size: number, height: number): Keyframe[] {
  const facing = to.facing;
  const at = (x: number, y: number, squash = '') => poseTransform({ x, y, facing }, size, squash);
  const peak = { x: (from.x + to.x) / 2, y: Math.min(from.y, to.y) - height };
  return [
    { offset: 0, transform: at(from.x, from.y, 'scale(1.06, 0.9)'), easing: 'cubic-bezier(0.2, 0.7, 0.4, 1)' },
    { offset: 0.14, transform: at(from.x, from.y - 2, 'scale(0.94, 1.08)'), easing: 'cubic-bezier(0.25, 0.6, 0.45, 1)' },
    { offset: 0.5, transform: at(peak.x, peak.y), easing: 'cubic-bezier(0.55, 0, 0.75, 0.4)' },
    { offset: 0.88, transform: at(to.x, to.y, 'scale(1.08, 0.88)'), easing: 'cubic-bezier(0.23, 1, 0.32, 1)' },
    { offset: 1, transform: at(to.x, to.y) },
  ];
}

/** Dip forward (drop a twig, peck, press a key). */
export function dipKeyframes(pose: Pose, size: number): Keyframe[] {
  const at = (extra: string) => poseTransform(pose, size, extra);
  return [
    { transform: at(''), easing: 'cubic-bezier(0.3, 0.7, 0.4, 1)' },
    { offset: 0.45, transform: at('translateY(3px) rotate(14deg)'), easing: 'cubic-bezier(0.23, 1, 0.32, 1)' },
    { transform: at('') },
  ];
}

/** Settle down into a nest: sink a little with a soft squash. */
export function settleKeyframes(from: Pose, to: Pose, size: number): Keyframe[] {
  const at = (p: Pose, extra = '') => poseTransform(p, size, extra);
  return [
    { transform: at(from), easing: 'cubic-bezier(0.3, 0.7, 0.4, 1)' },
    { offset: 0.55, transform: at(to, 'scale(1.06, 0.92)'), easing: 'cubic-bezier(0.23, 1, 0.32, 1)' },
    { transform: at(to) },
  ];
}

export function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

/** Runs keyframes and resolves when done (or immediately with reduced motion). */
export async function play(el: HTMLElement | null, keyframes: Keyframe[], duration: number): Promise<void> {
  if (!el) return;
  const last = keyframes[keyframes.length - 1]!;
  if (prefersReducedMotion()) {
    el.style.transform = String(last.transform ?? '');
    return;
  }
  const animation = el.animate(keyframes, { duration, fill: 'forwards' });
  try {
    await animation.finished;
  } catch {
    // Cancelled: keep the end pose.
  }
  el.style.transform = String(last.transform ?? '');
  animation.cancel();
}
