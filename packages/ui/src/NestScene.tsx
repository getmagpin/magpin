/**
 * Progress as a little story: the magpie fetches twigs (the very twig it
 * carries in its beak) and builds its nest on the blank page.
 *
 * How far it gets depends on the size of the moodboard: a single twig for a
 * handful of images, a whole nest for a big one. The nest grows with the
 * progress; the bird brings several twigs per trip when it falls behind.
 * When the build is over, the story doesn't stop dead: it carries on to the
 * next screen, the last twigs fall into place, the bird settles and the
 * whole thing ends on a small celebration.
 */
import { Cheer, type Eyes, Magpie, type Pose, TWIG_PATHS, dipKeyframes, hopKeyframes, play, poseTransform, prefersReducedMotion, settleKeyframes } from './magpie';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { GROUND_Y, NEST, NEST_SITTABLE, PERCH_X, SCENE, bowlPath, nestDepth, nestGoal, nestTop, type NestTwig, weaveNest } from './nest';

const BIRD = 54;
/** The twig in the beak and the twigs of the nest: one shape, one size. */
const TWIG_SCALE = BIRD / 312;
const TWIG_PIVOT = { x: 206, y: 35 };
/** Direction of the twig's stem in the bird's drawing, in degrees. */
const TWIG_OWN_ANGLE = -58.7;
/** Sunk in the nest, the rim hiding its legs. */
const SITTING: Pose = { x: NEST.x + 6, y: NEST.rimY + 25, facing: -1 };
/** The black mass of the bowl shows once there is something of a nest. */
const BOWL_FROM = 8;

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Where the story is. Kept by the app, so it carries on from one screen to the next. */
export interface NestMemory {
  placed: number;
  pose: Pose | null;
  carrying: boolean;
}
export const freshNest = (): NestMemory => ({ placed: 0, pose: null, carrying: false });

interface NestSceneProps {
  /** 0..1 */
  progress: number;
  /** Size of the moodboard: how far the nest gets. */
  images: number;
  memory: NestMemory;
  /** The build is over: finish the story and celebrate. */
  complete?: boolean;
  /** The build was stopped: no more twigs, no celebration. */
  stopped?: boolean;
}

function Twig({ twig }: { twig: NestTwig }) {
  const transform = `translate(${twig.x} ${twig.y}) rotate(${twig.angle}) scale(${TWIG_SCALE} ${twig.flip ? -TWIG_SCALE : TWIG_SCALE}) rotate(${-TWIG_OWN_ANGLE}) translate(${-TWIG_PIVOT.x} ${-TWIG_PIVOT.y})`;
  return (
    <g class="nest__twig">
      <g transform={transform}>
        {TWIG_PATHS.map((d, i) => (
          <path key={`halo-${d}`} class="nest__halo" d={d} stroke-width={(i === 0 ? 10 : 8) + 12} />
        ))}
        {TWIG_PATHS.map((d, i) => (
          <path key={d} class="nest__stem" d={d} stroke-width={i === 0 ? 10 : 8} />
        ))}
      </g>
    </g>
  );
}

export function NestScene({ progress, images, memory, complete = false, stopped = false }: NestSceneProps) {
  const twigs = useMemo(() => weaveNest(), []);
  const goal = nestGoal(images, twigs.length);
  const [placed, setPlaced] = useState(Math.min(memory.placed, goal));
  const [carrying, setCarrying] = useState(memory.carrying);
  const [eyes, setEyes] = useState<Eyes>('open');
  const [cheer, setCheer] = useState<{ x: number; y: number } | null>(null);
  // A new story: the bird wakes up. Carried over from the last screen: it's awake.
  const [wake] = useState(memory.pose === null);
  const target = complete ? goal : stopped ? placed : Math.min(goal, Math.round(progress * goal));
  const bird = useRef<HTMLDivElement>(null);
  const targetRef = useRef(target);
  targetRef.current = target;
  const placedRef = useRef(placed);
  placedRef.current = placed;
  const carryingRef = useRef(carrying);
  carryingRef.current = carrying;

  // Keep the story for the next screen, as it goes (an effect could be
  // dropped when this screen gives way to the next).
  memory.placed = placed;
  memory.carrying = carrying;

  useEffect(() => {
    let alive = true;
    const reduced = prefersReducedMotion();
    let pose: Pose = memory.pose ?? { x: PERCH_X.left, y: GROUND_Y, facing: 1 };
    const commit = (to: Pose) => {
      pose = to;
      memory.pose = to;
    };
    const place = (to: Pose) => {
      commit(to);
      if (bird.current) bird.current.style.transform = poseTransform(to, BIRD);
    };
    const hopTo = async (to: Pose, height: number, duration: number) => {
      await play(bird.current, hopKeyframes(pose, to, BIRD, height), duration);
      commit(to);
    };
    /** Height the bird stands at, on the page or on the nest so far. */
    const standY = (count: number) => (count < BOWL_FROM ? GROUND_Y : nestTop(twigs, count) - 1);
    /** Feet just behind the next twig, so the beak drops it in place. */
    const dropSpot = (facing: 1 | -1): Pose => {
      const twig = twigs[Math.min(placedRef.current, twigs.length - 1)]!;
      const x = Math.min(NEST.x + NEST.rx, Math.max(NEST.x - NEST.rx, twig.x - facing * 14));
      return { x, y: standY(placedRef.current), facing };
    };
    const dropTwig = async (count: number) => {
      await play(bird.current, dipKeyframes(pose, BIRD), 240);
      setCarrying(false);
      setPlaced((current) => Math.min(goal, current + count));
      setEyes('squint');
      void wait(360).then(() => alive && setEyes('open'));
    };
    const fresh = memory.pose === null;
    place(pose);

    /** Back on stage if it was off fetching a twig, and drop what's in the beak. */
    const comeBack = async () => {
      if (pose.x < 0 || pose.x > SCENE.w) {
        const left = pose.x < 0;
        await hopTo({ x: left ? PERCH_X.left : PERCH_X.right, y: GROUND_Y, facing: left ? 1 : -1 }, 24, 340);
      }
      if (!alive) return;
      if (carryingRef.current && placedRef.current < goal) {
        await hopTo(dropSpot(pose.facing), 24, 340);
        await dropTwig(1);
      } else {
        setCarrying(false);
      }
    };

    /** Stopped: no more twigs; it comes back, drops its twig and stays. */
    const rest = async () => {
      if (reduced) {
        setCarrying(false);
        place({ x: PERCH_X.left, y: GROUND_Y, facing: 1 });
        return;
      }
      await comeBack();
    };

    const build = async () => {
      // `side`: the edge the bird fetches its next twig from.
      let side: -1 | 1 = pose.x > NEST.x ? 1 : -1;
      let facingNest = true;
      if (fresh) await wait(500);
      while (alive) {
        const behind = targetRef.current - placedRef.current;
        if (behind <= 0) {
          // Wait on the perch, turned towards the nest.
          if (!facingNest && !reduced) {
            await hopTo({ ...pose, facing: side === -1 ? 1 : -1 }, 8, 220);
            facingNest = true;
          }
          await wait(180);
          continue;
        }
        if (reduced) {
          setPlaced(targetRef.current);
          await wait(200);
          continue;
        }
        const perch = side === -1 ? PERCH_X.left : PERCH_X.right;
        const offstage = side === -1 ? -44 : SCENE.w + 44;
        const inward: 1 | -1 = side === -1 ? 1 : -1;
        // Off to fetch a twig, and back with it.
        if (!carryingRef.current) {
          await hopTo({ x: offstage, y: GROUND_Y, facing: side }, 24, 380);
          if (!alive) return;
          setCarrying(true);
          await wait(160);
          await hopTo({ x: perch, y: GROUND_Y, facing: inward }, 24, 380);
        }
        if (!alive) return;
        // To the spot, drop it in; more at once when the build runs ahead.
        await hopTo(dropSpot(inward), 26, 360);
        if (!alive) return;
        await dropTwig(Math.max(1, Math.min(6, Math.ceil(behind / 3))));
        // On to the perch on the other side.
        const next = side === -1 ? PERCH_X.right : PERCH_X.left;
        await wait(120);
        await hopTo({ x: next, y: GROUND_Y, facing: inward }, 30, 420);
        side = side === -1 ? 1 : -1;
        facingNest = false;
      }
    };

    const finish = async () => {
      const sits = goal >= NEST_SITTABLE;
      const final: Pose = sits ? SITTING : { x: NEST.x - 30, y: standY(goal), facing: 1 };
      if (reduced) {
        setCarrying(false);
        setPlaced(goal);
        place(final);
        return;
      }
      await comeBack();
      // The rest falls into place, quickly, while the bird makes its way.
      const rest = goal - placedRef.current;
      if (rest > 0) {
        const step = Math.max(22, Math.min(70, 700 / rest));
        void (async () => {
          for (let i = 0; i < rest && alive; i++) {
            setPlaced((current) => Math.min(goal, current + 1));
            await wait(step);
          }
        })();
        await wait(Math.min(500, step * rest));
      }
      if (!alive) return;
      if (sits) {
        await hopTo({ x: SITTING.x, y: NEST.rimY - 3, facing: SITTING.facing }, 22, 420);
        await play(bird.current, settleKeyframes(pose, SITTING, BIRD), 460);
        commit(SITTING);
      } else if (Math.abs(pose.x - final.x) > 2 || Math.abs(pose.y - final.y) > 2) {
        await hopTo(final, 22, 400);
      }
      if (!alive) return;
      // Success: eyes shut with joy, two little hops, a burst of rays.
      setEyes('closed');
      setCheer({ x: pose.x - pose.facing * 2, y: pose.y - BIRD * 0.74 });
      await play(bird.current, hopKeyframes(pose, pose, BIRD, 14), 340);
      await play(bird.current, hopKeyframes(pose, pose, BIRD, 8), 260);
      await wait(1100);
      if (alive) setEyes('open');
    };

    void (complete ? finish() : stopped ? rest() : build());
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [complete]);

  const shown = twigs.slice(0, placed);
  const label = complete ? 'Moodboard built' : `Building the moodboard, ${Math.round(progress * 100)}%`;
  return (
    <div class="nest" role="img" aria-label={label}>
      <svg class="nest__layer" viewBox={`0 0 ${SCENE.w} ${SCENE.h}`} width="100%" height={SCENE.h} aria-hidden="true">
        {shown.map((twig, i) => (twig.layer === 'back' ? <Twig key={i} twig={twig} /> : null))}
      </svg>
      <div class="nest__stage">
        <Magpie size={BIRD} twig={carrying} eyes={eyes} wake={wake} innerRef={bird} />
        {cheer ? <Cheer size={BIRD} style={{ left: `${cheer.x}px`, top: `${cheer.y}px` }} /> : null}
      </div>
      <svg class="nest__layer nest__layer--front" viewBox={`0 0 ${SCENE.w} ${SCENE.h}`} width="100%" height={SCENE.h} aria-hidden="true">
        {placed > 0 ? <path class={`nest__bowl${placed < BOWL_FROM ? ' is-hidden' : ''}`} d={bowlPath(nestDepth(twigs, placed))} /> : null}
        {shown.map((twig, i) => (twig.layer === 'front' ? <Twig key={i} twig={twig} /> : null))}
      </svg>
    </div>
  );
}
