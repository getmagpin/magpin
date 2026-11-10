/**
 * The reading of a board: the magpie on the progress line, the count, Stop.
 * The bird always moves left to right, total known or not (then the progress
 * is an estimate). When the reading ends it plays its ending (the bar fills
 * up, the bird gets to the end and celebrates; or it squints when stopped,
 * short of the page's count, or empty-handed) and only then folds away.
 */
import { ProgressBar, formatCount, pluralize } from '@magpin/ui';
import { useEffect, useRef, useState } from 'preact/hooks';
import { type ScanEnding, scanEnding, scanProgress } from '@/src/progress';
import { ScanBird } from './ScanBird';

interface CollectProps {
  collecting: boolean;
  /** Images found so far. */
  count: number;
  /** Items looked at that the page's own count takes in: images and skipped videos. */
  scanned: number;
  /** The page's own count, when it shows one. */
  expected: number | null;
  /** What the page calls its items ("pin"). */
  noun: string;
  /** The reading was stopped before the end. */
  stopped: boolean;
  onStop: () => void;
  /** Reads the ending out to screen readers. */
  announce: (text: string) => void;
}

export function Collect({ collecting, count, scanned, expected, noun, stopped, onStop, announce }: CollectProps) {
  const [shown, setShown] = useState(collecting);
  // Frozen when the reading ends: the list on screen can change after that.
  const [done, setDone] = useState<{ ending: ScanEnding; label: string } | null>(null);
  const [leaving, setLeaving] = useState(false);
  // Clock for the estimate when the total is unknown.
  const startedAt = useRef(Date.now());
  const [now, setNow] = useState(Date.now());
  // The bird never walks back, even if a total turns up mid-way.
  const furthest = useRef(0);

  useEffect(() => {
    if (!collecting || expected) return;
    const timer = setInterval(() => setNow(Date.now()), 400);
    return () => clearInterval(timer);
  }, [collecting, expected]);

  useEffect(() => {
    if (collecting) {
      startedAt.current = Date.now();
      furthest.current = 0;
      setNow(Date.now());
      setShown(true);
      setDone(null);
      setLeaving(false);
      return;
    }
    if (!shown) return;
    const ending = scanEnding({ found: count, scanned, expected, stopped });
    const label =
      ending === 'success'
        ? `Collected ${pluralize(count, 'image')}`
        : ending === 'partial'
          ? `Found ${formatCount(scanned)} of ${pluralize(expected ?? 0, noun)}`
          : ending === 'empty'
            ? 'Nothing found on this board'
            : `Stopped at ${formatCount(count)}`;
    setDone({ ending, label });
    announce(label);
    // Only a full reading celebrates, and takes its time doing so.
    const success = ending === 'success';
    const fold = setTimeout(() => setLeaving(true), success ? 2300 : 1400);
    const hide = setTimeout(() => setShown(false), success ? 2650 : 1750);
    return () => {
      clearTimeout(fold);
      clearTimeout(hide);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collecting]);

  if (!shown) return null;
  if (!done) furthest.current = Math.max(furthest.current, scanProgress(expected ? scanned : count, expected, now - startedAt.current));
  const success = done?.ending === 'success';
  const value = success ? 1 : furthest.current;
  const classes = ['collect', done ? 'is-done' : '', leaving ? 'is-leaving' : ''].filter(Boolean).join(' ');
  return (
    <section class={classes}>
      <div class="collect__inner">
        <ScanBird progress={value} done={done ? (success ? 'success' : 'stopped') : null} />
        <ProgressBar value={value} label="Collecting images" />
        <div class="collect__row">
          <span class="mp-label mp-num">
            {done ? done.label : expected ? `Collecting ${formatCount(Math.min(scanned, expected))} / ${pluralize(expected, noun)}` : `Collecting ${formatCount(count)}`}
          </span>
          {done ? null : (
            <button type="button" class="mp-link" onClick={onStop}>
              Stop
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
