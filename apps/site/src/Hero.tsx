/**
 * The hero, on a white page. The magpie hops in with a twig in its beak,
 * drops it in the middle, and the headline appears around it: "Copy" on one
 * side, "Paste" on the other, level with the middle of the bird. Then the twig goes, and
 * the two parts (the Chrome extension, then the Figma plugin) come in below.
 *
 * With Reduce motion the bird is simply there and the text is in place.
 */
import { type Eyes, Magpie, type Pose, SourceIcon, TWIG_PATHS, dipKeyframes, hopKeyframes, play, poseTransform, prefersReducedMotion } from '@magpin/ui';
import type { JSX } from 'preact';
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { ChromeButton, FigmaButton, SOURCES, Then } from './parts';
import { PeelSticker, type Spot } from './Sticker';

const BOX = { w: 221, h: 312 };
/** The twig's own box in the bird's units (it pokes out of the beak). */
const TWIG_BOX = { x: 166, y: -48, w: 104, h: 140 };
/** Turning the twig by this lays its main stem flat. */
const LIE_FLAT = 58;

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
/** How long the twig takes to fall from the beak to the ground. */
const FALL = 520;

export function Hero({ onHero }: { onHero: (inHero: boolean) => void }) {
  const still = prefersReducedMotion();
  const section = useRef<HTMLElement>(null);
  const slot = useRef<HTMLSpanElement>(null);
  const bird = useRef<HTMLDivElement>(null);
  const twigEl = useRef<HTMLSpanElement>(null);
  const [size, setSize] = useState(0);
  const [carrying, setCarrying] = useState(!still);
  const [eyes, setEyes] = useState<Eyes>('open');
  const [twig, setTwig] = useState<Pose | null>(null);
  const [told, setTold] = useState(still);
  const [toolbar] = useState(isChromium);
  const [inView, setInView] = useState(true);
  // Where the bird stands: its slot between the two halves of the headline.
  const target = useRef<Pose>({ x: 0, y: 0, facing: 1 });
  const done = useRef(still);
  // Once it has landed, the bird is a sticker you can peel off and move (mouse and trackpad).
  const [settled, setSettled] = useState(still);
  const [home, setHome] = useState<Spot>({ x: 0, y: 0, turn: 0 });
  const [moved, setMoved] = useState<Spot | null>(null);
  const [canPeel] = useState(() => typeof window !== 'undefined' && window.matchMedia('(hover: hover) and (pointer: fine)').matches);

  useEffect(() => onHero(inView), [inView]);

  // Measure the slot (and keep the bird in it when the page resizes after the intro).
  useLayoutEffect(() => {
    const host = section.current;
    const place = slot.current;
    if (!host || !place) return;
    const measure = () => {
      const h = host.getBoundingClientRect();
      const s = place.getBoundingClientRect();
      target.current = { x: s.left - h.left + s.width / 2, y: s.top - h.top + s.height, facing: 1 };
      setSize(Math.round(s.height));
      setHome({ x: s.left - h.left + s.width / 2 - ((s.height * 221) / 312) * 0.52, y: s.top - h.top, turn: 0 });
      if (done.current && bird.current) bird.current.style.transform = poseTransform(target.current, Math.round(s.height));
    };
    measure();
    document.fonts?.ready.then(measure).catch(() => undefined);
    const observer = new ResizeObserver(measure);
    observer.observe(host);
    observer.observe(place);
    const seen = new IntersectionObserver(([entry]) => setInView(Boolean(entry?.isIntersecting)), { threshold: 0.25 });
    seen.observe(host);
    return () => {
      observer.disconnect();
      seen.disconnect();
    };
  }, []);

  // The intro, once the bird has its size. It runs to the end whatever happens
  // meanwhile (fonts landing, a resize, a zoom): only leaving the page stops it,
  // and each hop aims at where the slot is now, at the bird's current size.
  const started = useRef(false);
  const mounted = useRef(true);
  useEffect(
    () => () => {
      mounted.current = false;
    },
    [],
  );
  const sizeNow = useRef(0);
  sizeNow.current = size;
  useLayoutEffect(() => {
    if (!size || started.current) return;
    started.current = true;
    const el = bird.current;
    if (!el) return;
    if (still) {
      el.style.transform = poseTransform(target.current, size);
      return;
    }
    const alive = () => mounted.current;
    const now = () => sizeNow.current || size;
    let pose: Pose = { x: -size * 0.5, y: target.current.y, facing: 1 };
    el.style.transform = poseTransform(pose, size);
    void (async () => {
      await wait(450);
      // In from the left, in four hops, twig in the beak.
      const hops = 4;
      const from = pose.x;
      for (let i = 1; i <= hops && alive(); i++) {
        const to = target.current;
        const next: Pose = { x: from + ((to.x - from) * i) / hops, y: to.y, facing: 1 };
        await play(el, hopKeyframes(pose, next, now(), now() * 0.14), 380);
        pose = next;
      }
      if (!alive()) return;
      // Drops it in the middle.
      await play(el, dipKeyframes(pose, now()), 300);
      if (!alive()) return;
      setCarrying(false);
      setTwig(pose);
      setEyes('squint');
      // The twig falls; the moment it touches the ground, it is gone (and the squint ends).
      await wait(FALL);
      setEyes('open');
      const gone = twigEl.current?.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 160, easing: 'ease-out', fill: 'forwards' });
      await gone?.finished.catch(() => undefined);
      if (!alive()) return;
      setTwig(null);
      // Exactly in its slot, even if the page moved during the intro.
      el.style.transform = poseTransform(target.current, now());
      // The headline arrives around the bird.
      setTold(true);
      done.current = true;
      setSettled(true);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size]);

  // The twig falls from the beak to the ground, turning flat.
  useLayoutEffect(() => {
    const el = twigEl.current?.firstElementChild as HTMLElement | null;
    if (!twig || !el || typeof el.animate !== 'function') return;
    const k = size / BOX.h;
    const startY = (TWIG_BOX.y + TWIG_BOX.h / 2) * k - size; // twig centre, from the feet
    const drop = -startY - 7 * k;
    el.animate(
      [
        { transform: 'none', easing: 'cubic-bezier(0.5, 0, 0.9, 0.5)' },
        // It lands at the bird's feet, in the middle, short of the headline either side.
        { transform: `translate(${(-40 * k).toFixed(1)}px, ${drop.toFixed(1)}px) rotate(${LIE_FLAT}deg)` },
      ],
      { duration: FALL, fill: 'forwards' },
    );
  }, [twig]);

  // The headline sits either side of the bird.
  let n = 0;
  const half = (lines: string[]) =>
    lines.map((line, l) => (
      <span key={l} class="hero__line">
        {line.split(' ').map((word, i, all) => (
          <span key={i}>
            <span class="title__word">
              <span class="title__in" style={{ '--i': n++ } as JSX.CSSProperties}>
                {word}
              </span>
            </span>
            {i < all.length - 1 ? ' ' : ''}
          </span>
        ))}
      </span>
    ));

  const k = size / BOX.h;
  return (
    <section ref={section} class={`hero${told ? ' is-told' : ''}`} id="top">
      {/*
        The name, very faint, behind everything, stretched to fill the whole
        screen: the word's own box (Anton's caps are 0.86 em tall, the word
        2.6 em wide) drawn into the hero with no aspect kept.
      */}
      <svg class="hero__mark" viewBox="0 -86 260 86" preserveAspectRatio="none" aria-hidden="true">
        <text x="0" y="0" font-size="100" textLength="260" lengthAdjust="spacingAndGlyphs">
          MAGPIN
        </text>
      </svg>
      <div class="hero__main">
        <h1 class={`title hero__title${told ? ' is-seen' : ''}`} aria-label="Copy, paste">
          <span class="hero__half hero__half--from" aria-hidden="true">
            {half(['Copy'])}
          </span>
          <span ref={slot} class="hero__slot" aria-hidden="true" />
          <span class="hero__half hero__half--to" aria-hidden="true">
            {half(['Paste'])}
          </span>
        </h1>
        <p class="hero__lead hero__in" style={{ '--d': '360ms' } as JSX.CSSProperties}>
          Magpin turns any board into a Figma moodboard, sorted by color.
        </p>
        {/* Two parts that work together: say so, in order. */}
        <div class="duo hero__in" style={{ '--d': '460ms' } as JSX.CSSProperties}>
          <div class="duo__step">
            <p class="duo__label">
              <span class="duo__n">1</span> Chrome extension
            </p>
            <ChromeButton />
          </div>
          <Then />
          <div class="duo__step">
            <p class="duo__label">
              <span class="duo__n">2</span> Figma plugin
            </p>
            <FigmaButton />
          </div>
        </div>
      </div>
      {/* Lower down, on its own: where it works. */}
      <div class="hero__works hero__in" style={{ '--d': '620ms' } as JSX.CSSProperties}>
        <span class="label">Works with</span>
        <Ticker />
      </div>

      {twig && size ? (
        // The twig, where the beak let go of it.
        <span
          ref={twigEl}
          class="hero__twig"
          aria-hidden="true"
          style={{
            transform: `translate(${(twig.x - BOX.w * k * 0.52 + TWIG_BOX.x * k).toFixed(1)}px, ${(twig.y - size + TWIG_BOX.y * k).toFixed(1)}px)`,
            width: `${TWIG_BOX.w * k}px`,
            height: `${TWIG_BOX.h * k}px`,
          }}
        >
          <svg viewBox={`${TWIG_BOX.x} ${TWIG_BOX.y} ${TWIG_BOX.w} ${TWIG_BOX.h}`} width={TWIG_BOX.w * k} height={TWIG_BOX.h * k}>
            {TWIG_PATHS.map((d, i) => (
              <path key={d} d={d} fill="none" stroke="currentColor" stroke-width={i === 0 ? 10 : 8} stroke-linecap="round" />
            ))}
          </svg>
        </span>
      ) : null}
      {size && settled && canPeel ? (
        <PeelSticker size={size} eyes={eyes} at={moved ?? home} stage={() => section.current?.getBoundingClientRect() ?? null} onStick={setMoved} />
      ) : size ? (
        <Magpie size={size} twig={carrying} eyes={eyes} innerRef={bird} class="hero__bird" sticker />
      ) : null}
      {toolbar ? <ToolbarHint shown={told && inView} /> : null}
    </section>
  );
}

/**
 * The sources, on a slow loop that fades out at both edges (a mask, so it
 * works over the watermark too). Two identical halves slide by half their width, so the loop has no
 * seam; it pauses under the pointer and stands still with Reduce motion.
 */
function Ticker() {
  const run = [...SOURCES, ...SOURCES];
  return (
    <div class="ticker">
      <span class="sr-only">{SOURCES.map((s) => s.name).join(', ')}</span>
      <div class="ticker__track" aria-hidden="true">
        {[0, 1].map((half) => (
          <span key={half} class="ticker__half">
            {run.map((s, i) => (
              <span key={`${s.id}${i}`} class="ticker__item">
                <SourceIcon source={s.id} size={18} />
                {s.name}
              </span>
            ))}
          </span>
        ))}
      </div>
    </div>
  );
}

/**
 * In Chrome, an arrow up to the toolbar, where extensions live: once added,
 * Magpin is pinned up there. Only on desktop Chromium browsers, only while
 * the hero is on screen.
 */
function ToolbarHint({ shown }: { shown: boolean }) {
  return (
    <div class={`toolbar-hint${shown ? ' is-shown' : ''}`} aria-hidden="true">
      <svg viewBox="0 0 96 112" width="96" height="112">
        <path class="toolbar-hint__line" pathLength={1} d="M8 106 C 30 104, 46 92, 46 76 C 46 62, 32 60, 30 70 C 28 82, 52 82, 64 64 C 74 48, 80 28, 84 8" />
        <path class="toolbar-hint__head" pathLength={1} d="M74 17 L 84.5 6 L 91 20" />
      </svg>
      <span class="toolbar-hint__text">Pin here, with your extensions</span>
    </div>
  );
}

/** Chrome, Edge, Brave, Arc…: the browsers Magpin installs in. */
function isChromium(): boolean {
  try {
    const brands = (navigator as Navigator & { userAgentData?: { brands?: { brand: string }[] } }).userAgentData?.brands ?? [];
    return brands.some((b) => /Chrom|Edge|Brave|Opera/.test(b.brand)) && window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  } catch {
    return false;
  }
}
