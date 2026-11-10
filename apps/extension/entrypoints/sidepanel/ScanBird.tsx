import { Cheer, type Eyes, Magpie, prefersReducedMotion } from '@magpin/ui';
import { useEffect, useRef, useState } from 'preact/hooks';

const BIRD = 28;

/**
 * While a board is read, the magpie hops along the progress line, left to
 * right, pecking up images.
 *
 * When the reading is over it doesn't stop dead: it finishes the hop it's in,
 * glides to the end of the line, then celebrates (eyes shut, two hops, a
 * burst of rays) or, when it was stopped early, just squints.
 */
export function ScanBird({ progress, done }: { progress: number; done: 'success' | 'stopped' | null }) {
  const bounce = useRef<HTMLDivElement>(null);
  const [stage, setStage] = useState<'scan' | 'landing' | 'end'>('scan');

  useEffect(() => {
    if (!done) {
      setStage('scan');
      return;
    }
    if (prefersReducedMotion()) {
      setStage('end');
      return;
    }
    // Let the current hop land before standing still.
    const el = bounce.current;
    let landed = false;
    const land = () => {
      if (landed) return;
      landed = true;
      setStage('landing');
    };
    el?.addEventListener('animationiteration', land, { once: true });
    const fallback = setTimeout(land, 1050);
    // Then, once the glide to the end is over, the finish.
    const end = setTimeout(() => setStage('end'), 1150);
    return () => {
      el?.removeEventListener('animationiteration', land);
      clearTimeout(fallback);
      clearTimeout(end);
    };
  }, [done]);

  const left = done === 'success' ? 1 : progress;
  const eyes: Eyes = stage === 'end' ? (done === 'success' ? 'closed' : 'squint') : 'open';
  return (
    <div class={`scanbird${done ? ' is-done' : ''}`} aria-hidden="true">
      <div class="scanbird__track" style={{ left: `${Math.min(100, Math.max(0, left * 100))}%` }}>
        <div class="scanbird__face">
          <div ref={bounce} class={`scanbird__bounce is-${stage}${done ? ` is-${done}` : ''}`}>
            <Magpie size={BIRD} eyes={eyes} wake />
            {stage === 'end' && done === 'success' ? <Cheer size={BIRD} class="scanbird__cheer" /> : null}
          </div>
        </div>
      </div>
    </div>
  );
}
