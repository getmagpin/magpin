/**
 * A magpie perched at the end of a title. Shared by the extension's intro,
 * its welcome page and the website.
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { Magpie, type Pose, dipKeyframes, hopKeyframes, play, poseTransform, prefersReducedMotion } from './magpie';

/**
 * The magpie at the end of a title: lands, wakes up, then potters about
 * (turns round, hops, pecks at the letters). `size` is its height; put it
 * right after the last word, it stands on the baseline.
 */
export function PerchedMagpie({ size = 66, sticker = false }: { size?: number; sticker?: boolean }) {
  // The bird's box (the mark is 221 × 312) and where its feet are in it.
  const box = { w: Math.round((size * 221) / 312), h: size };
  const [here, setHere] = useState(prefersReducedMotion());
  const bird = useRef<HTMLDivElement>(null);
  const pose = useRef<Pose>({ x: box.w * 0.52, y: box.h, facing: -1 });

  // Lands once the title is in.
  useEffect(() => {
    if (here) return;
    const timer = setTimeout(() => setHere(true), 520);
    return () => clearTimeout(timer);
  }, [here]);

  // Turned towards the title.
  useLayoutEffect(() => {
    if (here && bird.current) bird.current.style.transform = poseTransform(pose.current, size);
  }, [here]);

  useEffect(() => {
    if (!here || prefersReducedMotion()) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    const act = async () => {
      const el = bird.current;
      if (!alive || !el) return;
      const now = pose.current;
      const roll = Math.random();
      if (roll < 0.4) {
        // Turn round: look at the title, or away.
        const next: Pose = { ...now, facing: now.facing === 1 ? -1 : 1 };
        await play(el, hopKeyframes(now, next, size, size * 0.15), 320);
        pose.current = next;
      } else if (roll < 0.75) {
        // A little hop on the spot.
        await play(el, hopKeyframes(now, now, size, size * 0.24), 380);
      } else {
        // Peck at the letters.
        await play(el, dipKeyframes(now, size), 260);
        await play(el, dipKeyframes(now, size), 220);
      }
      if (alive) timer = setTimeout(() => void act(), 3200 + Math.random() * 3800);
    };
    timer = setTimeout(() => void act(), 2600);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [here]);

  return (
    <span class="mp-perch" style={{ width: `${box.w}px`, height: `${box.h}px` }}>
      {here ? (
        <span class="mp-perch__land">
          <Magpie size={size} wake innerRef={bird} class="intro__bird" sticker={sticker} />
        </span>
      ) : null}
    </span>
  );
}
