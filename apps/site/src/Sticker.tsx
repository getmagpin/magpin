/**
 * The hero's magpie, as a sticker you can peel off and stick somewhere else.
 *
 * 1. Press and pull: the sticker folds back from where you hold it, its blank
 *    back showing, the corner you hold staying under the pointer. (The fold is
 *    the line halfway between where you grabbed and where the pointer is: the
 *    front keeps one side of it, the back is the silhouette mirrored across it.)
 * 2. Past halfway it comes off: the fold lies back flat as the sticker lifts
 *    into your hand, face up and upright, the corner you hold still under the
 *    pointer (what is left of it slides toward the hand meanwhile).
 * 3. Carried, it follows the pointer with a little lag; let go and it settles
 *    down there.
 * Let go before halfway and it lies back flat.
 *
 * Mouse and trackpad only: on touch screens the bird stays put, so a swipe
 * over it still scrolls the page.
 */
import { type Eyes, Magpie, prefersReducedMotion } from '@magpin/ui';
import type { JSX } from 'preact';
import { useEffect, useRef } from 'preact/hooks';

const BOX = { w: 221, h: 312 };
/** Past this share of the way to a full peel, it finishes peeling by itself. */
const HALFWAY = 0.5;
const LIFT_MS = 260;
const LIFT = 1.06;

export interface Spot {
  x: number;
  y: number;
  /** Degrees: it sticks at the angle it had when let go. */
  turn: number;
}

interface Props {
  size: number;
  eyes: Eyes;
  /** Top-left of the sticker in its stage (the hero), and its angle. */
  at: Spot;
  /** The stage's box, to keep the sticker inside it. */
  stage: () => DOMRect | null;
  onStick: (at: Spot) => void;
}

type Vec = { x: number; y: number };
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

export function PeelSticker({ size, eyes, at, stage, onStick }: Props) {
  const w = Math.round((size * BOX.w) / BOX.h);
  const root = useRef<HTMLDivElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const front = useRef<HTMLDivElement>(null);
  const back = useRef<HTMLDivElement>(null);
  const flap = useRef<HTMLDivElement>(null);
  const atRef = useRef(at);
  atRef.current = at;
  // Read by the pointer handlers, which are set up once: a resize mid-drag keeps the drag.
  const dims = useRef({ w, size });
  dims.current = { w, size };

  // Placed by its props whenever it is not in someone's hand.
  const held = useRef(false);
  useEffect(() => {
    if (!held.current && root.current) root.current.style.transform = place(at);
  });

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    let mode: 'idle' | 'peel' | 'lifting' | 'lifted' = 'idle';
    let released = false;
    let grab: Vec = { x: 0, y: 0 };
    let start: Vec = { x: 0, y: 0 };
    let pointer: Vec = { x: 0, y: 0 };
    let from: Spot = atRef.current;
    let spot: Spot = atRef.current;
    let pull: Vec = { x: 0, y: 0 };
    let frame = 0;

    /** A vector from the page's frame into the sticker's (unturned) frame, and back. */
    const toLocal = (v: Vec, turn: number): Vec => {
      const a = (-turn * Math.PI) / 180;
      return { x: v.x * Math.cos(a) - v.y * Math.sin(a), y: v.x * Math.sin(a) + v.y * Math.cos(a) };
    };
    const toPage = (v: Vec, turn: number) => toLocal(v, -turn);

    /** How far the corner must be pulled, along `dir`, for the fold to clear the whole sticker. */
    const fullPull = (dir: Vec) => {
      const { w, size } = dims.current;
      const margin = 10;
      const corners = [
        [-margin, -margin],
        [w + margin, -margin],
        [-margin, size + margin],
        [w + margin, size + margin],
      ];
      const reach = Math.max(...corners.map(([x, y]) => (x! - grab.x) * dir.x + (y! - grab.y) * dir.y));
      return 2 * reach;
    };

    // ---- The fold (2D): front clipped, back mirrored across the fold line. ----
    const fold = (p: Vec) => {
      const len = Math.hypot(p.x, p.y);
      if (len < 0.5) return flat();
      const n = { x: p.x / len, y: p.y / len };
      const m = { x: grab.x + p.x / 2, y: grab.y + p.y / 2 };
      const t = { x: -n.y, y: n.x };
      const far = 4000;
      const poly = `polygon(${[
        [m.x + t.x * far, m.y + t.y * far],
        [m.x - t.x * far, m.y - t.y * far],
        [m.x - t.x * far + n.x * far, m.y - t.y * far + n.y * far],
        [m.x + t.x * far + n.x * far, m.y + t.y * far + n.y * far],
      ]
        .map(([x, y]) => `${x!.toFixed(1)}px ${y!.toFixed(1)}px`)
        .join(', ')})`;
      front.current!.style.clipPath = poly;
      back.current!.style.clipPath = poly;
      back.current!.style.visibility = 'visible';
      const dot = m.x * n.x + m.y * n.y;
      flap.current!.style.transform = `matrix(${(1 - 2 * n.x * n.x).toFixed(4)}, ${(-2 * n.x * n.y).toFixed(4)}, ${(-2 * n.x * n.y).toFixed(4)}, ${(1 - 2 * n.y * n.y).toFixed(4)}, ${(2 * dot * n.x).toFixed(2)}, ${(2 * dot * n.y).toFixed(2)})`;
    };
    const flat = () => {
      front.current!.style.clipPath = '';
      back.current!.style.clipPath = '';
      back.current!.style.visibility = 'hidden';
    };

    const clampTo = (s: Spot): Spot => {
      const box = stage();
      if (!box) return s;
      const { w, size } = dims.current;
      return { ...s, x: Math.min(box.width - w * 0.6, Math.max(-w * 0.4, s.x)), y: Math.min(box.height - size * 0.7, Math.max(56, s.y)) };
    };

    // ---- 2. Past halfway it comes off into the hand. ----
    /** The pull right now (local), and the sticker moved so the held corner stays under the pointer. */
    const live = () => toLocal({ x: pointer.x - start.x, y: pointer.y - start.y }, from.turn);
    const follow = (p: Vec, scale: number) => {
      const d = live();
      const shift = toPage({ x: d.x - p.x, y: d.y - p.y }, from.turn);
      spot = { ...from, x: from.x + shift.x, y: from.y + shift.y };
      el.style.transform = place(spot, scale);
    };

    const lift = () => {
      mode = 'lifting';
      const begin = pull;
      const t0 = performance.now();
      el.classList.add('is-lifted');
      const step = () => {
        const k = Math.min(1, (performance.now() - t0) / LIFT_MS);
        const e = easeOut(k);
        const p = { x: begin.x * (1 - e), y: begin.y * (1 - e) };
        // The fold lies back flat while the sticker rises into the hand.
        fold(p);
        follow(p, 1 + (LIFT - 1) * e);
        if (k < 1) {
          frame = requestAnimationFrame(step);
          return;
        }
        flat();
        follow({ x: 0, y: 0 }, LIFT);
        mode = 'lifted';
        if (released) drop();
        else carry();
      };
      frame = requestAnimationFrame(step);
    };

    // ---- 3. Carried: follows the pointer with a little lag, upright. ----
    const carry = () => {
      const step = () => {
        if (mode !== 'lifted') return;
        const target = clampTo({ x: from.x + pointer.x - start.x, y: from.y + pointer.y - start.y, turn: from.turn });
        spot = { ...spot, x: spot.x + (target.x - spot.x) * 0.32, y: spot.y + (target.y - spot.y) * 0.32 };
        el.style.transform = place(spot, LIFT);
        frame = requestAnimationFrame(step);
      };
      frame = requestAnimationFrame(step);
    };

    // ---- Let go: it settles where it is, the shadow drawing in. ----
    const drop = () => {
      cancelAnimationFrame(frame);
      mode = 'idle';
      released = false;
      el.classList.remove('is-lifted', 'is-held');
      el.style.transform = place(spot);
      if (!prefersReducedMotion()) {
        body.current?.animate(
          [
            { transform: `scale(${LIFT})`, easing: 'cubic-bezier(0.4, 0, 0.6, 1)' },
            { offset: 0.5, transform: 'scale(0.985)', easing: 'cubic-bezier(0.3, 0.7, 0.4, 1)' },
            { transform: 'none' },
          ],
          { duration: 380 },
        );
      }
      held.current = false;
      onStick(spot);
    };

    // ---- Pointer ----
    const down = (e: PointerEvent) => {
      if (e.button !== 0 || mode !== 'idle') return;
      e.preventDefault();
      cancelAnimationFrame(frame);
      el.setPointerCapture(e.pointerId);
      const { w, size } = dims.current;
      // Where it was grabbed, in the sticker's own (unturned) box.
      const r = body.current!.getBoundingClientRect();
      const off = toLocal({ x: e.clientX - (r.left + r.width / 2), y: e.clientY - (r.top + r.height / 2) }, atRef.current.turn);
      grab = { x: w / 2 + off.x, y: size / 2 + off.y };
      start = { x: e.clientX, y: e.clientY };
      pointer = start;
      from = atRef.current;
      spot = from;
      pull = { x: 0, y: 0 };
      released = false;
      mode = 'peel';
      held.current = true;
      el.classList.add('is-held');
    };

    const move = (e: PointerEvent) => {
      if (mode === 'idle') return;
      pointer = { x: e.clientX, y: e.clientY };
      if (mode !== 'peel') return;
      pull = toLocal({ x: pointer.x - start.x, y: pointer.y - start.y }, from.turn);
      const len = Math.hypot(pull.x, pull.y);
      if (len < 0.5) return flat();
      if (len < fullPull({ x: pull.x / len, y: pull.y / len }) * HALFWAY) fold(pull);
      else lift();
    };

    const up = () => {
      if (mode === 'idle') return;
      if (mode === 'peel') {
        // Not halfway: it lies back flat.
        mode = 'idle';
        held.current = false;
        el.classList.remove('is-held');
        const begin = pull;
        if (Math.hypot(begin.x, begin.y) < 0.5 || prefersReducedMotion()) return flat();
        const t0 = performance.now();
        const step = () => {
          const k = Math.min(1, (performance.now() - t0) / 240);
          const e = 1 - easeOut(k);
          if (k < 1) {
            fold({ x: begin.x * e, y: begin.y * e });
            frame = requestAnimationFrame(step);
          } else flat();
        };
        frame = requestAnimationFrame(step);
        return;
      }
      if (mode === 'lifted') return drop();
      // Still coming off: it settles as soon as it is in hand.
      released = true;
    };

    el.addEventListener('pointerdown', down);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    return () => {
      cancelAnimationFrame(frame);
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const box = { width: `${w}px`, height: `${size}px` } as JSX.CSSProperties;
  return (
    <div ref={root} class="peel" style={box} aria-hidden="true">
      <div ref={body} class="peel__body" style={box}>
        <div ref={front} class="peel__front" style={box}>
          <Magpie size={size} eyes={eyes} sticker />
        </div>
        {/* While folding: the back, mirrored across the fold. */}
        <div ref={back} class="peel__back" style={box}>
          <div ref={flap} class="peel__flap" style={box}>
            <Magpie size={size} blinks={false} sticker class="peel__paper" />
          </div>
        </div>
      </div>
    </div>
  );
}

function place(s: Spot, scale = 1): string {
  return `translate(${s.x.toFixed(1)}px, ${s.y.toFixed(1)}px) rotate(${s.turn.toFixed(2)}deg)${scale !== 1 ? ` scale(${scale.toFixed(4)})` : ''}`;
}
