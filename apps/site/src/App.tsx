import { TwigRain, type TwigWorld, groundAt } from '@magpin/ui';
import type { ComponentChildren, JSX } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { BoardsDemo, LayoutDemo, PaletteDemo, PrivateDemo, SortDemo } from './demos/FeatureDemos';
import { FlowDemo } from './demos/FlowDemo';
import { Hero } from './Hero';
import { LineBird } from './LineBird';
import { CHROME_STORE_URL, FIGMA_PLUGIN_URL } from './links';
import { ChromeButton, FigmaButton, Reveal, Then } from './parts';

export function App() {
  // The hero has its own buttons (and the toolbar arrow): the nav's stays hidden,
  // intro included, until the hero scrolls away and the next section comes up.
  const [inHero, setInHero] = useState(true);
  return (
    <>
      <Nav cta={!inHero} />
      <main>
        <Hero onHero={setInHero} />
        <HowItWorks />
        <Features />
        <Compare />
        <Closing />
      </main>
    </>
  );
}

function Nav({ cta }: { cta: boolean }) {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  return (
    <header class={`nav${scrolled ? ' is-scrolled' : ''}${cta ? '' : ' is-quiet'}`}>
      <a class="nav__brand" href="#top" aria-label="Magpin, back to top">
        <img src="./icon.png" alt="" width="30" height="30" />
        <span>Magpin</span>
      </a>
      <nav class="nav__links" aria-label="Sections">
        <a href="#how">How it works</a>
        <a href="#features">Features</a>
        <a href="#compare">Compare</a>
      </nav>
      <ChromeButton small />
    </header>
  );
}

function SectionHead({ id, label, title, children }: { id?: string; label: string; title: string; children?: ComponentChildren }) {
  return (
    <Reveal class="head">
      <p class="label" id={id}>
        {label}
      </p>
      <h2 class="title">{title}</h2>
      {children ? <div class="head__sub">{children}</div> : null}
    </Reveal>
  );
}

const STEPS = [
  { n: '01', title: 'Collect a board', text: 'Click Magpin in Chrome, then Collect this board. It reads every image, at full size.' },
  { n: '02', title: 'Copy it', text: 'Uncheck what you don’t want, then Copy for Figma.' },
  { n: '03', title: 'Paste in Figma', text: 'Press ⌘V in the plugin, then Create moodboard. It lands sorted by color, with its palette.' },
];

/** The whole flow in one demo, its three steps lighting up underneath as it plays. */
function HowItWorks() {
  const [beat, setBeat] = useState<{ step: number; ms: number; run: number } | null>(null);
  // Picking a step plays the demo from there.
  const [jump, setJump] = useState<{ step: number; key: number }>({ step: 0, key: 0 });
  return (
    <section class="section section--how">
      <div class="wrap">
        <SectionHead id="how" label="How it works" title="Collect. Copy. Paste." />
      </div>
      <div class="wrap wrap--wide">
        <FlowDemo jump={jump} onBeat={(step, ms) => setBeat((b) => ({ step, ms, run: (b?.run ?? 0) + 1 }))} />
      </div>
      <div class="wrap">
        <ol class={`beats${beat ? ' is-live' : ''}`}>
          {STEPS.map((step, i) => {
            const on = beat?.step === i;
            return (
              <li key={step.n} class={`beat${on ? ' is-on' : ''}`}>
                <button type="button" class="beat__btn" aria-current={on ? 'step' : undefined} onClick={() => setJump((j) => ({ step: i, key: j.key + 1 }))}>
                  <span class="beat__bar" aria-hidden="true">
                    {on ? <i key={beat!.run} style={{ '--ms': `${beat!.ms}ms` } as JSX.CSSProperties} /> : null}
                  </span>
                  <span class="step__n">{step.n}</span>
                  <span class="beat__title">{step.title}</span>
                  <span class="beat__text">{step.text}</span>
                </button>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}

function Tile({ title, text, children, class: extra, delay = 0 }: { title: string; text: string; children: ComponentChildren; class?: string; delay?: number }) {
  return (
    <Reveal class={`tile${extra ? ` ${extra}` : ''}`} delay={delay}>
      {children}
      <div class="tile__text">
        <h3>{title}</h3>
        <p>{text}</p>
      </div>
    </Reveal>
  );
}

function Features() {
  return (
    <section class="section section--wash">
      <div class="wrap">
        <SectionHead id="features" label="Features" title="Every pin, in its place." />
        <div class="bento">
          <Tile class="tile--wide" title="Sorted by color" text="Every image falls into a gradient, neutrals last.">
            <SortDemo />
          </Tile>
          <Tile title="Its palette, as variables" text="Named colors, saved as Figma variables.">
            <PaletteDemo />
          </Tile>
          <Tile title="Three layouts" text="Grid, mosaic, or grouped by color.">
            <LayoutDemo />
          </Tile>
          <Tile class="tile--wide" title="Many boards, no repeats" text="Copy boards from any source together. Each keeps its section; an image found twice is placed once.">
            <BoardsDemo />
          </Tile>
        </div>
        {/* Not a tile: said plainly, on the page itself. */}
        <Reveal class="pledge">
          <PrivateDemo />
          <div>
            <p class="pledge__line">No account. No server. No tracking.</p>
            <p class="pledge__sub">Magpin reads a board only when you ask. Images go straight from the source to your computer or your Figma file.</p>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

const YES = (
  <span class="yes" role="img" aria-label="Yes">
    <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true">
      <path d="M2.5 6.2 4.9 8.5 9.5 3.6" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
  </span>
);
const NO = (
  <span class="no" role="img" aria-label="Not mentioned">
    —
  </span>
);

// Same things first, then what only Magpin does: the checks fall away in a triangle.
const ROWS: { label: string; cells: (JSX.Element | string)[] }[] = [
  { label: 'Price', cells: ['Free', 'Free for 30 pins per paste · Pro $29 one-time', 'Free for 30 pins · Pro $52 lifetime', '$25 one-time · no free version'] },
  { label: 'Sources', cells: ['Pinterest, Are.na, Cosmos, Savee', 'Pinterest', 'Pinterest', 'Pinterest'] },
  { label: 'ZIP download', cells: [YES, YES, YES, YES] },
  { label: 'FigJam', cells: [YES, YES, YES, NO] },
  { label: 'No account', cells: [YES, YES, NO, NO] },
  { label: 'Sorted by color', cells: [YES, NO, NO, NO] },
  { label: 'Palette and Figma color variables', cells: [YES, NO, NO, NO] },
  { label: 'Duplicates removed', cells: [YES, NO, NO, NO] },
  { label: 'Several boards in one moodboard', cells: [YES, NO, NO, NO] },
];

function Compare() {
  return (
    <section class="section section--compare">
      <div class="wrap">
        <Reveal class="free">
          <h2 class="title title--free" id="compare">
            Free. All of it.
          </h2>
          <div class="free__sub">
            <p>No pin limit, no Pro plan, no account. The extension, the plugin and every feature, for every board.</p>
          </div>
        </Reveal>
        <Reveal class="compare">
          {/* Scrolls sideways on a phone: reachable with the keyboard too. */}
          <div class="compare__scroll" tabIndex={0} role="region" aria-label="Magpin compared with other tools">
            <table>
              <thead>
                <tr>
                  <th scope="col">
                    <span class="sr-only">Feature</span>
                  </th>
                  <th scope="col" class="compare__us">
                    <img src="./icon.png" alt="" width="22" height="22" />
                    Magpin
                  </th>
                  <th scope="col">Pinpasta</th>
                  <th scope="col">Pinora</th>
                  <th scope="col">PinGrabber</th>
                </tr>
              </thead>
              <tbody>
                {ROWS.map((row) => (
                  <tr key={row.label}>
                    <th scope="row">{row.label}</th>
                    {row.cells.map((cell, i) => (
                      <td key={i} class={i === 0 ? 'compare__us' : undefined}>
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p class="compare__note">From each product’s own website, checked November 2026. A dash means the site doesn’t mention it.</p>
        </Reveal>
      </div>
    </section>
  );
}

function Closing() {
  const area = useRef<HTMLDivElement>(null);
  // The twigs dropped here, so the footer's magpie can react and jump over them.
  const twigs = useRef<TwigWorld | null>(null);
  const [drops, setDrops] = useState(0);
  const pileAt = (clientX: number) => {
    const world = twigs.current;
    const stage = area.current;
    if (!world || !stage) return 0;
    const x = clientX - stage.getBoundingClientRect().left;
    if (x < 0 || x > world.width) return 0;
    return Math.max(0, world.height - groundAt(world, x));
  };
  return (
    <section class="closing">
      {/* One last card: the call to action, then a small footer line. */}
      <div class="closing__panel">
        <div ref={area} class="closing__stage">
          <TwigRain host={area} onWorld={(world) => (twigs.current = world)} onDrop={() => setDrops((n) => n + 1)} />
          <Reveal class="wrap closing__inner">
            <h2 class="title title--closing">Your next moodboard is one paste away.</h2>
            <div class="duo closing__duo">
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
            {/* The twigs only fall with motion on: no promise when Reduce motion is set. */}
            <p class="closing__hint">
              Psst: <span class="when-mouse">click</span>
              <span class="when-touch">tap</span> anywhere around here.
            </p>
          </Reveal>
        </div>
        <Footer drops={drops} pileAt={pileAt} />
      </div>
    </section>
  );
}

function Footer({ drops, pileAt }: { drops: number; pileAt: (clientX: number) => number }) {
  return (
    <footer class="footer">
      <div class="footer__row">
        {/* A magpie potters along the footer's line. */}
        <LineBird drops={drops} pileAt={pileAt} />
        <span class="nav__brand">
          <img src="./icon.png" alt="" width="24" height="24" />
          <span>Magpin</span>
        </span>
        <span class="footer__line">Free. Unlimited. No account. No tracking.</span>
        <span class="footer__links">
          <a href="./privacy.html">Privacy</a>
          <a href={CHROME_STORE_URL} target="_blank" rel="noreferrer">
            Chrome Web Store
          </a>
          <a href={FIGMA_PLUGIN_URL} target="_blank" rel="noreferrer">
            Figma Community
          </a>
        </span>
      </div>
    </footer>
  );
}
