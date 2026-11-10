/**
 * Feedback from the magpie, over the top edge of the dock.
 *
 * - Peek, after a copy or a download: its head pops up and winks (or squints
 *   when something went wrong), with a short line beside it. Click the bird
 *   or press Esc to send it back down; it also leaves on its own after a
 *   while, but not while the pointer or the focus is on it.
 * - Delivery, when a board goes into the moodboard: the whole bird hops in
 *   with a twig, drops it into the moodboard below, and hops off.
 *
 * Neither speaks for itself: the panel's live region reads their words out.
 */
import { type Eyes, Magpie, type Pose, TWIG_PATHS, dipKeyframes, hopKeyframes, play, poseTransform, prefersReducedMotion } from '@magpin/ui';
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';

export interface Notice {
  title: string;
  detail?: string;
  /** wink: it worked. hmm: it did not. */
  mood: 'wink' | 'hmm';
  action?: { label: string; run: () => void };
}

/** Bird height: big enough that the head alone fills the peek. */
const BIRD = 104;
const STAY_MS = 6500;
/** Once let go after its time is up, it stays a beat before leaving. */
const LINGER_MS = 1500;
const LEAVE_MS = 220;

export function Peek({ notice, onClose }: { notice: Notice; onClose: () => void }) {
  const [eyes, setEyes] = useState<Eyes>('open');
  const [winking, setWinking] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const closed = useRef(false);
  const closing = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Pointer over it or focus inside: it stays. `due`: its time is up meanwhile.
  const held = useRef({ hover: false, focus: false, due: false });
  const linger = useRef<ReturnType<typeof setTimeout> | null>(null);

  const leave = () => {
    if (closed.current) return;
    closed.current = true;
    setLeaving(true);
    closing.current = setTimeout(onClose, prefersReducedMotion() ? 0 : LEAVE_MS);
  };
  const hold = (part: 'hover' | 'focus', on: boolean) => {
    held.current[part] = on;
    if (linger.current) clearTimeout(linger.current);
    linger.current = null;
    if (!held.current.hover && !held.current.focus && held.current.due) linger.current = setTimeout(leave, LINGER_MS);
  };
  useEffect(
    () => () => {
      if (closing.current) clearTimeout(closing.current);
      if (linger.current) clearTimeout(linger.current);
    },
    [],
  );

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    const at = (ms: number, run: () => void) => timers.push(setTimeout(run, ms));
    if (notice.mood === 'wink') {
      // Up, a beat, then a slow wink with a tilt of the head.
      at(520, () => {
        setWinking(true);
        setEyes('closed');
      });
      at(900, () => setEyes('open'));
      at(1100, () => setWinking(false));
    } else {
      at(450, () => setEyes('squint'));
    }
    at(STAY_MS, () => {
      if (held.current.hover || held.current.focus) held.current.due = true;
      else leave();
    });
    // Esc sends it down, except while typing (Esc there cancels the edit).
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || (event.target as Element | null)?.closest?.('input, textarea')) return;
      leave();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      timers.forEach(clearTimeout);
      document.removeEventListener('keydown', onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      class={`peek${leaving ? ' is-leaving' : ''}`}
      onMouseEnter={() => hold('hover', true)}
      onMouseLeave={() => hold('hover', false)}
      onFocusIn={() => hold('focus', true)}
      onFocusOut={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) hold('focus', false);
      }}
    >
      <button type="button" class="peek__bird" aria-label="Dismiss" onClick={leave}>
        <span class={`peek__rise${winking ? ' is-winking' : ''}`}>
          <Magpie size={BIRD} eyes={eyes} blinks={notice.mood === 'wink'} />
        </span>
      </button>
      <div class="peek__text">
        <p class="peek__title">{notice.title}</p>
        {notice.detail ? <p class="peek__detail">{notice.detail}</p> : null}
        {notice.action ? (
          <button
            type="button"
            class="peek__action"
            onClick={() => {
              notice.action?.run();
              leave();
            }}
          >
            {notice.action.label}
          </button>
        ) : null}
      </div>
    </div>
  );
}

/** Bird height for the delivery. */
const COURIER = 46;
const COURIER_W = (COURIER * 221) / 312;

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function Delivery({ title, detail, onDrop, onClose }: { title: string; detail?: string; onDrop: () => void; onClose: () => void }) {
  const stage = useRef<HTMLDivElement>(null);
  const bird = useRef<HTMLDivElement>(null);
  const [carrying, setCarrying] = useState(true);
  const [eyes, setEyes] = useState<Eyes>('open');
  const [fall, setFall] = useState<Pose | null>(null);
  const [leaving, setLeaving] = useState(false);

  // Placed before the first paint, so the bird never shows up in a corner.
  useLayoutEffect(() => {
    let alive = true;
    const width = stage.current?.clientWidth ?? 340;
    const ground = stage.current?.clientHeight ?? 72;
    let pose: Pose = { x: width + 36, y: ground, facing: -1 };
    const place = (to: Pose) => {
      pose = to;
      if (bird.current) bird.current.style.transform = poseTransform(to, COURIER);
    };
    const hopTo = async (to: Pose, height: number, duration: number) => {
      await play(bird.current, hopKeyframes(pose, to, COURIER, height), duration);
      pose = to;
    };
    const spot = width - 58;
    place(pose);

    void (async () => {
      if (prefersReducedMotion()) {
        place({ x: spot, y: ground, facing: -1 });
        setCarrying(false);
        onDrop();
        await wait(2600);
        if (alive) onClose();
        return;
      }
      // In from the right, twig in the beak.
      await hopTo({ x: width - 14, y: ground, facing: -1 }, 18, 300);
      await hopTo({ x: spot, y: ground, facing: -1 }, 18, 300);
      if (!alive) return;
      // Drops it into the moodboard below.
      await play(bird.current, dipKeyframes(pose, COURIER), 260);
      if (!alive) return;
      setCarrying(false);
      setFall(pose);
      onDrop();
      setEyes('squint');
      await wait(1300);
      if (!alive) return;
      setEyes('open');
      await wait(700);
      // Off it goes.
      setLeaving(true);
      await hopTo({ x: width - 10, y: ground, facing: 1 }, 18, 300);
      await hopTo({ x: width + 40, y: ground, facing: 1 }, 18, 300);
      if (alive) onClose();
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div class={`peek deliver${leaving ? ' is-leaving' : ''}`}>
      <div class="peek__text">
        <p class="peek__title">{title}</p>
        {detail ? <p class="peek__detail">{detail}</p> : null}
      </div>
      <div ref={stage} class="deliver__stage" aria-hidden="true">
        {fall ? (
          // The twig, where the beak let go of it, falling behind the edge.
          <span class="deliver__twig" style={{ transform: poseTransform(fall, COURIER), width: `${COURIER_W}px`, height: `${COURIER}px` }}>
            <svg viewBox="0 0 221 312" width={COURIER_W} height={COURIER}>
              {TWIG_PATHS.map((d, i) => (
                <path key={d} d={d} fill="none" stroke="currentColor" stroke-width={i === 0 ? 10 : 8} stroke-linecap="round" />
              ))}
            </svg>
          </span>
        ) : null}
        <Magpie size={COURIER} twig={carrying} eyes={eyes} innerRef={bird} />
      </div>
    </div>
  );
}
