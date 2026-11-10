/**
 * Small shared pieces of the site: the pictures, the cursor, the buttons to
 * the stores, scroll reveals, and the clock the demos run on (only while
 * they are on screen, never with Reduce motion).
 */
import { MagpieHead, SourceIcon, prefersReducedMotion } from '@magpin/ui';
import type { ComponentChildren, JSX, RefObject } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { CHROME_STORE_URL, FIGMA_PLUGIN_URL } from './links';
import { type Picture, paint } from './photos';

export function Photo({ p, class: extra, style }: { p: Picture; class?: string; style?: JSX.CSSProperties }) {
  return <span class={`photo${extra ? ` ${extra}` : ''}`} style={{ background: paint(p), ...style }} />;
}

/** True once (or while) the element is on screen. */
export function useInView<T extends Element>(options: { once?: boolean; threshold?: number } = {}): [RefObject<T>, boolean] {
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        const visible = Boolean(entry?.isIntersecting);
        if (visible || !options.once) setInView(visible);
        if (visible && options.once) observer.disconnect();
      },
      { threshold: options.threshold ?? 0.2 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, inView];
}

const STOP = Symbol('stop');
export interface Story {
  wait: (ms: number) => Promise<void>;
}

/**
 * Plays a story while `active`: in a loop, or just once (the first time it is
 * on screen, then it rests on its last frame). Leaving the screen stops it at
 * once (its pending waits never resolve); `reset` puts the scene back to its
 * first frame before each run. A new `rerun` value starts it over from the top
 * (the story can read where to begin from its own state).
 */
export function useStory(active: boolean, story: (s: Story) => Promise<void>, reset: () => void, once = false, rerun?: unknown) {
  const played = useRef(false);
  useEffect(() => {
    if (!active || prefersReducedMotion() || (once && played.current)) return;
    played.current = true;
    let cancelled = false;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const wait = (ms: number) =>
      new Promise<void>((resolve, reject) => {
        if (cancelled) return reject(STOP);
        const timer = setTimeout(() => {
          timers.delete(timer);
          if (cancelled) reject(STOP);
          else resolve();
        }, ms);
        timers.add(timer);
      });
    void (async () => {
      try {
        do {
          reset();
          await wait(60);
          await story({ wait });
        } while (!cancelled && !once);
      } catch (error) {
        if (error !== STOP) throw error;
      }
    })();
    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, rerun]);
}

/** Rises in once, when scrolled into view. */
export function Reveal({ children, class: extra, delay = 0, as: Tag = 'div' }: { children: ComponentChildren; class?: string; delay?: number; as?: 'div' | 'section' | 'li' }) {
  const [ref, seen] = useInView<HTMLDivElement>({ once: true, threshold: 0.15 });
  return (
    <Tag ref={ref as never} class={`reveal${seen ? ' is-seen' : ''}${extra ? ` ${extra}` : ''}`} style={{ '--d': `${delay}ms` } as JSX.CSSProperties}>
      {children}
    </Tag>
  );
}

/** macOS cursors, from the Stageshow kit (MIT). */
export function Cursor({ x, y, hand = false, down = false, hidden = false }: { x: number; y: number; hand?: boolean; down?: boolean; hidden?: boolean }) {
  return (
    <span class={`cursor${down ? ' is-down' : ''}${hidden ? ' is-hidden' : ''}`} style={{ transform: `translate(${x}px, ${y}px)` }} aria-hidden="true">
      {hand ? (
        <svg width="26" height="26" viewBox="0 0 32 32" fill="none" style={{ marginLeft: '-9px', marginTop: '-2px' }}>
          <path
            d="M10.6 6a1.7 1.7 0 0 1 3.4 0v6.6a1.3 1.3 0 0 1 2.6 0v.7a1.3 1.3 0 0 1 2.6 0v.7a1.3 1.3 0 0 1 2.6 0V19c0 3.1-2 5.6-5 5.6h-2.6c-2 0-3.3-.9-4.4-2.4l-3.1-4.1c-.6-.9-.4-2 .5-2.5.8-.4 1.7-.2 2.3.5l1.1 1.4V6Z"
            fill="#fff"
            stroke="#000"
            stroke-width="1.1"
            stroke-linejoin="round"
          />
          <path d="M14 12.6v3.6M16.6 13.3v3M19.2 14v2.6" stroke="#000" stroke-width="1" stroke-linecap="round" />
        </svg>
      ) : (
        <svg height="24" width="24" viewBox="0 0 32 32" fill="none" style={{ marginLeft: '-10px', marginTop: '-7px' }}>
          <g transform="translate(10 7)">
            <path d="m6.148 18.473 1.863-1.003 1.615-.839-2.568-4.816h4.332l-11.379-11.408v16.015l3.316-3.221z" fill="#fff" />
            <path d="m6.431 17 1.765-.941-2.775-5.202h3.604l-8.025-8.043v11.188l2.53-2.442z" fill="#000" />
          </g>
        </svg>
      )}
    </span>
  );
}

/** On hover, the magpie's head rises from behind the button's top edge and winks. */
function Peek() {
  return (
    <span class="peek" aria-hidden="true">
      <MagpieHead size={26} class="peek__head" />
    </span>
  );
}

export function ChromeButton({ label = 'Add to Chrome', small = false }: { label?: string; small?: boolean }) {
  return (
    <a class={`cta${small ? ' cta--small' : ''}`} href={CHROME_STORE_URL} target="_blank" rel="noreferrer">
      {small ? null : <Peek />}
      {label}
      <span class="cta__free">Free</span>
    </a>
  );
}

export function FigmaButton({ label = 'Get the Figma plugin' }: { label?: string }) {
  return (
    <a class="cta cta--line" href={FIGMA_PLUGIN_URL} target="_blank" rel="noreferrer">
      <Peek />
      <img src="./figma.svg" alt="" width="10" height="15" />
      {label}
    </a>
  );
}

/** A hand-drawn arrow from the Chrome step to the Figma step. */
export function Then() {
  return (
    <svg class="duo__then" viewBox="0 0 64 28" width="64" height="28" aria-hidden="true">
      <path d="M4 18 C 16 6, 34 4, 56 13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
      <path d="M47 6.5 L 57 13.4 L 46.4 18.6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
  );
}

export const SOURCES = [
  { id: 'pinterest', name: 'Pinterest' },
  { id: 'arena', name: 'Are.na' },
  { id: 'cosmos', name: 'Cosmos' },
  { id: 'savee', name: 'Savee' },
] as const;

export function SourceMarks({ size = 16 }: { size?: number }) {
  return (
    <span class="marks">
      {SOURCES.map((s) => (
        <span key={s.id} class="marks__item" title={s.name}>
          <SourceIcon source={s.id} size={size} />
          {s.name}
        </span>
      ))}
    </span>
  );
}
