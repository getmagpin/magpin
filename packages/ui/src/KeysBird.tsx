/**
 * The ⌘ V keycaps with the magpie perched on them: the hero of the paste
 * screen. It lands on ⌘ when the screen opens and wakes up, then hops from
 * ⌘ to V and back, which shows the shortcut. The key it stands on gives a
 * little under its weight and goes all the way down when it lands. The caps
 * also press with the real keys (the bird squints while you hold one), and
 * when a board is pasted it shuts its eyes with joy.
 */
import { Cheer, Magpie, type Pose, hopKeyframes, play, poseTransform, prefersReducedMotion } from './magpie';
import type { JSX } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';

const SIZE = 46;
const IDLE_EVERY_MS = 3400;
/** When the bird lands on ⌘, once the keys are in. */
const LANDS_AT_MS = 520;

interface KeysBirdProps {
  mac: boolean;
  down: { mod: boolean; v: boolean };
  /** A board was just pasted. */
  celebrate: boolean;
  /** Hops from key to key now and then on its own (default on). */
  idle?: boolean;
}

const order = (i: number) => ({ '--i': i }) as JSX.CSSProperties;

export function KeysBird({ mac, down, celebrate, idle = true }: KeysBirdProps) {
  const keys = [useRef<HTMLElement>(null), useRef<HTMLElement>(null)] as const;
  const bird = useRef<HTMLDivElement>(null);
  const pose = useRef<Pose | null>(null);
  const on = useRef<0 | 1>(0);
  const busy = useRef(false);
  const [here, setHere] = useState(false);
  // Eyes shut while it drops in; they open as it lands.
  const [awake, setAwake] = useState(false);
  const [perch, setPerch] = useState<0 | 1 | null>(null);
  const [impact, setImpact] = useState<0 | 1 | null>(null);
  const [cheer, setCheer] = useState<{ x: number; y: number } | null>(null);

  /** Feet in the middle of a key's top face. */
  const spot = (key: 0 | 1, facing: 1 | -1): Pose | null => {
    const el = keys[key].current;
    return el ? { x: el.offsetLeft + el.offsetWidth * 0.5, y: el.offsetTop + 2, facing } : null;
  };

  /** The key gives all the way under the landing, then holds the bird's weight. */
  const land = (key: 0 | 1) => {
    on.current = key;
    setAwake(true);
    setPerch(key);
    setImpact(key);
    setTimeout(() => setImpact(null), 140);
  };

  const hop = async (key: 0 | 1, height = 30, duration = 420) => {
    const from = pose.current;
    if (!from || busy.current) return;
    const target = spot(key, key === on.current ? from.facing : key === 1 ? 1 : -1);
    if (!target) return;
    busy.current = true;
    if (key !== on.current) setPerch(null);
    await play(bird.current, hopKeyframes(from, target, SIZE, height), duration);
    pose.current = target;
    land(key);
    busy.current = false;
  };

  // Arrives once the keys are in.
  useEffect(() => {
    const timer = setTimeout(() => setHere(true), prefersReducedMotion() ? 0 : LANDS_AT_MS);
    return () => clearTimeout(timer);
  }, []);

  // Drops onto ⌘, then wanders between the keys now and then.
  useEffect(() => {
    if (!here) return;
    const start = spot(0, 1);
    const el = bird.current;
    if (!start || !el) return;
    pose.current = start;
    el.style.transform = poseTransform(start, SIZE);
    if (prefersReducedMotion()) {
      land(0);
      return;
    }
    let alive = true;
    let timer: ReturnType<typeof setInterval> | undefined;
    // No other hop while it drops in.
    busy.current = true;
    void (async () => {
      const above: Pose = { ...start, y: start.y - 44 };
      await play(
        el,
        [
          { transform: poseTransform(above, SIZE), opacity: 0, easing: 'cubic-bezier(0.5, 0, 0.9, 0.5)' },
          { offset: 0.25, opacity: 1 },
          { offset: 0.6, transform: poseTransform(start, SIZE, 'scale(1.1, 0.86)'), easing: 'cubic-bezier(0.23, 1, 0.32, 1)' },
          { offset: 0.82, transform: poseTransform(start, SIZE, 'scale(0.97, 1.04)') },
          { transform: poseTransform(start, SIZE), opacity: 1 },
        ],
        560,
      );
      busy.current = false;
      if (!alive) return;
      land(0);
      if (idle) timer = setInterval(() => void hop(on.current === 0 ? 1 : 0), IDLE_EVERY_MS);
    })();
    return () => {
      alive = false;
      clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [here]);

  // Follow the real keys.
  useEffect(() => {
    if (down.mod && on.current !== 0) void hop(0, 26, 300);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [down.mod]);
  useEffect(() => {
    if (down.v && on.current !== 1) void hop(1, 26, 300);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [down.v]);

  // Pasted: two quick hops of joy on the spot, and a burst.
  useEffect(() => {
    if (!celebrate) return;
    const at = pose.current;
    if (at) setCheer({ x: at.x - at.facing * 2, y: at.y - SIZE * 0.74 });
    void (async () => {
      await hop(on.current, 24, 280);
      await hop(on.current, 14, 220);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [celebrate]);

  const state = (key: 0 | 1) => {
    const pressed = (key === 0 ? down.mod : down.v) || impact === key;
    return pressed ? ' is-down' : perch === key ? ' is-perched' : '';
  };
  const eyes = !awake || celebrate ? 'closed' : down.mod || down.v ? 'squint' : 'open';
  return (
    <div class="keys" aria-hidden="true">
      <kbd ref={keys[0]} class={`keycap keycap--mod${state(0)}`} style={order(0)}>
        {mac ? (
          <>
            <span class="keycap__glyph">⌘</span>
            <span class="keycap__name">command</span>
          </>
        ) : (
          <span class="keycap__name">ctrl</span>
        )}
      </kbd>
      <kbd ref={keys[1]} class={`keycap keycap--v${state(1)}`} style={order(1)}>
        <span class="keycap__letter">V</span>
      </kbd>
      {here ? <Magpie size={SIZE} eyes={eyes} innerRef={bird} /> : null}
      {cheer && celebrate ? <Cheer size={SIZE} style={{ left: `${cheer.x}px`, top: `${cheer.y}px` }} /> : null}
    </div>
  );
}
