/**
 * A small magpie on the footer's line, as on the scan line while a board is
 * read: it hops along, one way then the other, stops, pecks, and once in a
 * while does a backflip. When someone drops twigs (a click above), a "!" pops
 * over its head; twigs lying on its way, it jumps over.
 *
 * Only while the line is on screen; with Reduce motion it just stands there.
 */
import { Magpie, type Pose, dipKeyframes, hopKeyframes, play, poseTransform, prefersReducedMotion } from '@magpin/ui';
import { useEffect, useRef, useState } from 'preact/hooks';
import { useInView } from './parts';

const SIZE = 44;
/** How close its feet come to each end of the line, px: its body (not quite centred on its feet) just reaches the ends. */
const EDGE = { start: 20, end: 18 };
/** Room ahead of the bird along the line, px. */
const roomAhead = (pose: Pose, width: number) => (pose.facing === 1 ? width - EDGE.end - pose.x : pose.x - EDGE.start);
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const between = (lo: number, hi: number) => lo + Math.random() * (hi - lo);

/** A hop that turns into a full turn backwards in the air, round the bird's middle. */
function backflipKeyframes(from: Pose, to: Pose, size: number, height: number): Keyframe[] {
  const back = to.facing === 1 ? -1 : 1;
  const spin = (deg: number) => `translate(0, ${-size * 0.5}px) rotate(${deg * back}deg) translate(0, ${size * 0.5}px)`;
  const at = (x: number, y: number, extra: string) => poseTransform({ x, y, facing: to.facing }, size, extra);
  const midX = (from.x + to.x) / 2;
  return [
    { offset: 0, transform: at(from.x, from.y, 'scale(1.08, 0.86)'), easing: 'cubic-bezier(0.2, 0.7, 0.4, 1)' },
    { offset: 0.16, transform: at(from.x, from.y - 4, `${spin(0)} scale(0.94, 1.08)`), easing: 'cubic-bezier(0.3, 0.6, 0.5, 1)' },
    { offset: 0.5, transform: at(midX, from.y - height, spin(180)), easing: 'cubic-bezier(0.5, 0, 0.7, 0.5)' },
    { offset: 0.86, transform: at(to.x, to.y, `${spin(360)} scale(1.1, 0.86)`), easing: 'cubic-bezier(0.23, 1, 0.32, 1)' },
    { offset: 1, transform: at(to.x, to.y, spin(360)) },
  ];
}

interface LineBirdProps {
  /** Goes up each time a twig is dropped: the bird starts. */
  drops: number;
  /** How high the twigs pile at a point of the page (clientX), px. */
  pileAt: (clientX: number) => number;
}

export function LineBird({ drops, pileAt }: LineBirdProps) {
  const [track, seen] = useInView<HTMLDivElement>({ threshold: 0.1 });
  const bird = useRef<HTMLDivElement>(null);
  const [cheer, setCheer] = useState<{ x: number; key: number } | null>(null);
  const pose = useRef<Pose>({ x: 0, y: 0, facing: 1 });
  const pile = useRef(pileAt);
  pile.current = pileAt;

  // A twig dropped: "!" over its head (following it), and it stops short after its hop.
  const startled = useRef(false);
  const bang = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (drops === 0) return;
    startled.current = true;
    setCheer({ x: 0, key: drops });
    let frame = 0;
    const follow = () => {
      const el = bird.current;
      const box = track.current;
      const mark = bang.current;
      if (el && box && mark) {
        const r = el.getBoundingClientRect();
        mark.style.left = `${(r.left + r.width / 2 - box.getBoundingClientRect().left).toFixed(1)}px`;
        mark.style.bottom = `${(box.getBoundingClientRect().top - r.top + 6).toFixed(1)}px`;
      }
      frame = requestAnimationFrame(follow);
    };
    frame = requestAnimationFrame(follow);
    const timer = setTimeout(() => setCheer(null), 1100);
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(timer);
    };
  }, [drops]);

  // Starts a little way in, facing the length of the line.
  useEffect(() => {
    const el = bird.current;
    const box = track.current;
    if (!el || !box) return;
    pose.current = { x: Math.min(120, box.clientWidth * 0.2), y: 0, facing: 1 };
    el.style.transform = poseTransform(pose.current, SIZE);
  }, []);

  useEffect(() => {
    if (!seen || prefersReducedMotion()) return;
    let alive = true;
    const run = async () => {
      await wait(900);
      while (alive) {
        const el = bird.current;
        const width = track.current?.clientWidth ?? 0;
        if (!el || width < 80) return;
        const now = pose.current;
        if (startled.current) {
          // Something fell: it freezes a moment, looking.
          startled.current = false;
          await wait(between(700, 1000));
          continue;
        }
        // It goes right to the end of the line before turning back; otherwise it mostly keeps going.
        const ahead = roomAhead(now, width);
        if (ahead < 6 || Math.random() < 0.06) {
          const turned: Pose = { ...now, facing: now.facing === 1 ? -1 : 1 };
          await play(el, hopKeyframes(now, turned, SIZE, SIZE * 0.3), 340);
          pose.current = turned;
          continue;
        }
        const roll = Math.random();
        if (roll < 0.62) {
          // A run of little hops along the line.
          const hops = 2 + Math.floor(Math.random() * 4);
          for (let i = 0; i < hops && alive && !startled.current; i++) {
            const p = pose.current;
            const room = roomAhead(p, width);
            if (room < 6) break;
            // Twigs on the way: a bigger jump, over them, to clear ground beyond.
            const left = track.current!.getBoundingClientRect().left;
            const pileOver = (from: number, to: number) => {
              let high = 0;
              for (let x = Math.min(from, to); x <= Math.max(from, to); x += 4) high = Math.max(high, pile.current(left + x));
              return high;
            };
            let step = Math.min(room, between(30, 52));
            let over = pileOver(p.x + 6 * p.facing, p.x + (step + 10) * p.facing);
            if (over > 2) {
              // Land where the ground is clear again (or as far as the line allows).
              let reach = step;
              while (reach < Math.min(room, 320) && pileOver(p.x + reach * p.facing - 8, p.x + reach * p.facing + 8) > 2) reach += 8;
              step = Math.min(room, reach + 6);
              over = pileOver(p.x, p.x + step * p.facing);
            }
            const next: Pose = { ...p, x: p.x + step * p.facing };
            const jump = over > 2;
            // The bigger the pile (higher, wider), the higher and longer the leap.
            const height = jump ? SIZE * 0.35 + over * 1.3 + 12 + step * 0.12 : SIZE * 0.3;
            const time = jump ? Math.min(900, 440 + (height - SIZE * 0.35) * 3.2) : 330;
            await play(el, hopKeyframes(p, next, SIZE, height), time);
            pose.current = next;
          }
          await wait(between(150, 450));
        } else if (roll < 0.86) {
          // Stops and pecks at the line.
          await play(el, dipKeyframes(now, SIZE), 260);
          await play(el, dipKeyframes(now, SIZE), 220);
          await wait(between(400, 900));
        } else {
          // A backflip, landing a little further on.
          const room = roomAhead(now, width);
          const next: Pose = { ...now, x: now.x + Math.min(room, 44) * now.facing };
          await play(el, backflipKeyframes(now, next, SIZE, SIZE * 1.4), 680);
          pose.current = next;
          await wait(between(500, 900));
        }
      }
    };
    void run();
    return () => {
      alive = false;
    };
  }, [seen]);

  return (
    <div ref={track} class="linebird" aria-hidden="true">
      <Magpie size={SIZE} innerRef={bird} class="linebird__bird" />
      {cheer ? (
        <span ref={bang} key={cheer.key} class="linebird__bang">
          !
        </span>
      ) : null}
    </div>
  );
}
