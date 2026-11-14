import "@magpin/ui/styles.css";
import "./welcome.css";
import { KeysBird, PerchedMagpie, SourceIcon } from "@magpin/ui";
import type { SourceId } from "@magpin/core";
import type { ComponentChildren, JSX } from "preact";
import { render } from "preact";
import { AppIcon } from "@/src/AppIcon";
import {
  FIGMA_PLUGIN_URL,
  PASTE_SHORTCUT,
  PRIVACY_URL,
  SITE_URL,
  SOURCE_CODE_URL,
} from "@/src/config";

const MAC = PASTE_SHORTCUT.startsWith("⌘");

/** Opens in a new tab, with a small arrow that says so. */
function Out({
  href,
  class: extra,
  children,
}: {
  href: string;
  class?: string;
  children: ComponentChildren;
}) {
  return (
    <a class={extra} href={href} target="_blank" rel="noreferrer">
      {children}
      <span class="welcome__out" aria-hidden="true">
        ↗
      </span>
    </a>
  );
}

const SOURCES: { id: SourceId; name: string; href: string }[] = [
  { id: "pinterest", name: "Pinterest", href: "https://www.pinterest.com/" },
  { id: "arena", name: "Are.na", href: "https://www.are.na/" },
  { id: "cosmos", name: "Cosmos", href: "https://www.cosmos.so/" },
  { id: "savee", name: "Savee", href: "https://savee.com/" },
];

const PUZZLE =
  "M20.5 11H19V7c0-1.1-.9-2-2-2h-4V3.5C13 2.12 11.88 1 10.5 1S8 2.12 8 3.5V5H4c-1.1 0-1.99.9-1.99 2v3.8H3.5c1.49 0 2.7 1.21 2.7 2.7s-1.21 2.7-2.7 2.7H2V20c0 1.1.9 2 2 2h3.8v-1.5c0-1.49 1.21-2.7 2.7-2.7s2.7 1.21 2.7 2.7V22H17c1.1 0 2-.9 2-2v-4h1.5c1.38 0 2.5-1.12 2.5-2.5S21.88 11 20.5 11z";
const PIN =
  "M16 9V4h1c.55 0 1-.45 1-1s-.45-1-1-1H7c-.55 0-1 .45-1 1s.45 1 1 1h1v5c0 1.66-1.34 3-3 3v2h5.97v7l1 1 1-1v-7H19v-2c-1.66 0-3-1.34-3-3z";

/** Chrome's toolbar, its extensions menu open, Magpin pinned. */
function PinPicture() {
  return (
    <div class="viz viz--pin" aria-hidden="true">
      <div class="pinviz__bar">
        <span class="pinviz__url">pinterest.com/…/shiny-things</span>
        <span class="pinviz__puzzle">
          <svg viewBox="0 0 24 24" width="18" height="18">
            <path d={PUZZLE} fill="currentColor" />
          </svg>
        </span>
      </div>
      <div class="pinviz__menu">
        <span class="pinviz__label">Extensions</span>
        <span class="pinviz__row">
          <AppIcon size={22} />
          <span>Magpin</span>
          <svg class="pinviz__pin" viewBox="0 0 24 24" width="16" height="16">
            <path d={PIN} fill="currentColor" />
          </svg>
        </span>
      </div>
    </div>
  );
}

/** What lands in Figma: images sorted by color, neutrals last, and the palette beside them. */
const TILES = [
  ...Array.from(
    { length: 20 },
    (_, i) =>
      `hsl(${(i * 14.5) % 360} ${58 + (i % 3) * 6}% ${60 - (i % 4) * 5}%)`,
  ),
  "#e9e5dd",
  "#bdb8af",
  "#6e6a63",
  "#1f1d1b",
];
const PALETTE = [
  { name: "Red", hex: "#DE4635" },
  { name: "Amber", hex: "#F0B938" },
  { name: "Grass", hex: "#6CA446" },
  { name: "Steel Blue", hex: "#389DA8" },
  { name: "Amethyst", hex: "#7F67C1" },
  { name: "Ink", hex: "#1E1C1A" },
];

function MoodboardPicture() {
  return (
    <figure class="board" aria-hidden="true">
      <figcaption class="board__title">Moodboard — Shiny things</figcaption>
      <div class="board__body">
        <div class="board__grid">
          {TILES.map((color, i) => (
            <span
              key={i}
              style={{ background: color, "--i": i } as JSX.CSSProperties}
            />
          ))}
        </div>
        <ul class="board__palette">
          {PALETTE.map((swatch, i) => (
            <li key={swatch.name} style={{ "--i": i } as JSX.CSSProperties}>
              <span style={{ background: swatch.hex }} />
              {swatch.name}
            </li>
          ))}
        </ul>
      </div>
    </figure>
  );
}

/** Figma's plugin list, Magpin in it. */
function FigmaPicture() {
  return (
    <div class="viz viz--figma" aria-hidden="true">
      <div class="figviz">
        <div class="figviz__head">
          <img src="/figma.svg" width="11" height="16" alt="" />
          <span>Plugins</span>
        </div>
        <div class="figviz__row">
          <AppIcon size={26} />
          <span class="figviz__name">
            Magpin
            <small>Figma · FigJam</small>
          </span>
          <span class="figviz__run">Run</span>
        </div>
      </div>
    </div>
  );
}

function Welcome() {
  // The bird stands at the end of the title, about as tall as its letters.
  const titleSize = Math.min(104, Math.max(48, window.innerWidth * 0.068));
  return (
    <div class="welcome">
      <header class="welcome__top">
        <a
          class="welcome__brand"
          href={SITE_URL}
          target="_blank"
          rel="noreferrer"
        >
          <AppIcon size={34} />
          <span>Magpin</span>
        </a>
        <nav class="welcome__nav" aria-label="Magpin's website">
          <Out href={`${SITE_URL}#how`}>How it works</Out>
          <Out href={`${SITE_URL}#features`}>Features</Out>
        </nav>
      </header>

      <main>
        <section class="welcome__hero">
          <div class="welcome__intro">
            <p class="welcome__status">
              <span class="welcome__tick" aria-hidden="true">
                <svg viewBox="0 0 12 12" width="12" height="12">
                  <path
                    d="M2.5 6.2 4.9 8.5 9.5 3.6"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.9"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  />
                </svg>
              </span>
              Installed
            </p>
            <h1 class="mp-display welcome__title">
              Your next moodboard is one paste{" "}
              <span class="welcome__last">
                away.
                <PerchedMagpie size={Math.round(titleSize * 0.9)} />
              </span>
            </h1>
            <p class="welcome__lead">
              Magpin is in Chrome. Pin it, add the free Figma plugin, then open
              any board you like.
            </p>
            <div class="welcome__ctas">
              <Out class="mp-btn mp-btn--primary" href={FIGMA_PLUGIN_URL}>
                Get the Figma plugin
              </Out>
              <Out class="mp-btn mp-btn--secondary" href={`${SITE_URL}#how`}>
                See how it works
              </Out>
            </div>
          </div>
          <MoodboardPicture />
        </section>

        <ol class="welcome__steps">
          <li class="step">
            <PinPicture />
            <span class="step__n">01</span>
            <h2>Pin Magpin</h2>
            <p>
              Click the puzzle icon in Chrome's toolbar, then the pin next to
              Magpin. It stays one click away.
            </p>
          </li>
          <li class="step">
            <FigmaPicture />
            <span class="step__n">02</span>
            <h2>Add the Figma plugin</h2>
            <p>
              Install Magpin from the Figma Community. Free, in Figma and
              FigJam.{" "}
              <Out class="welcome__link" href={FIGMA_PLUGIN_URL}>
                Get the plugin
              </Out>
            </p>
          </li>
          <li class="step">
            <div class="viz viz--keys" aria-hidden="true">
              <KeysBird
                mac={MAC}
                down={{ mod: false, v: false }}
                celebrate={false}
              />
            </div>
            <span class="step__n">03</span>
            <h2>Collect, copy, paste</h2>
            <p>
              On a board, click Magpin, then <strong>Collect this board</strong>{" "}
              and <strong>Copy for Figma</strong>. In Figma, run Magpin and
              press <kbd class="mp-kbd">{PASTE_SHORTCUT}</kbd>.
            </p>
          </li>
        </ol>

        <section class="welcome__sources" aria-labelledby="works-with">
          <p class="mp-label" id="works-with">
            Works with
          </p>
          <ul>
            {SOURCES.map((source) => (
              <li key={source.id}>
                <a href={source.href} target="_blank" rel="noreferrer">
                  <SourceIcon source={source.id} size={18} decorative />
                  {source.name}
                </a>
              </li>
            ))}
          </ul>
        </section>
      </main>

      <footer class="welcome__foot">
        <p class="mp-label">No tracking. No account. No Magpin server.</p>
        <nav class="welcome__links" aria-label="More about Magpin">
          <Out href={SITE_URL}>Website</Out>
          <Out href={PRIVACY_URL}>Privacy</Out>
          <Out href={SOURCE_CODE_URL}>Source code</Out>
          <Out href={`${SOURCE_CODE_URL}/issues`}>Report a problem</Out>
        </nav>
      </footer>
    </div>
  );
}

render(<Welcome />, document.getElementById("app")!);
