/**
 * The first screen, before a board is open: the title swipes in word by
 * word, the magpie lands on it, wakes up and potters about; the steps and the
 * sources follow one after the other. That plays once per panel: coming back
 * here from a board, the screen is simply there.
 */
import type { SourceId } from '@magpin/core';
import { PerchedMagpie, SourceIcon, TwigRain } from '@magpin/ui';
import type { JSX } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';

/** The opening has played in this panel. */
let played = false;

const SOURCES: { id: SourceId; name: string; url: string }[] = [
  { id: 'pinterest', name: 'Pinterest', url: 'https://www.pinterest.com/' },
  { id: 'arena', name: 'Are.na', url: 'https://www.are.na/' },
  { id: 'cosmos', name: 'Cosmos', url: 'https://www.cosmos.so/' },
  { id: 'savee', name: 'Savee', url: 'https://savee.com/' },
];

const STEPS = ['Open a board, a channel or a cluster', 'Pick images, add more boards if you like', 'Copy, then paste in the Magpin plugin'];

/** Order of appearance, for the stagger. */
const at = (step: number): JSX.CSSProperties => ({ '--i': step }) as JSX.CSSProperties;

export function Intro() {
  const area = useRef<HTMLElement>(null);
  const [still] = useState(played);
  useEffect(() => {
    played = true;
  }, []);
  return (
    <section ref={area} class={`hero hero--intro intro${still ? ' is-still' : ''}`}>
      <TwigRain host={area} />
      <h1 class="mp-display mp-display--xl intro__title" aria-label="Open a board">
        <Word i={0}>Open</Word> <Word i={1}>a</Word>{' '}
        <span class="intro__last">
          <Word i={2}>board</Word>
          <PerchedMagpie />
        </span>
      </h1>
      <p class="mp-text mp-text--muted hero__sub intro__in" style={at(4)}>
        On Pinterest, Are.na, Cosmos or Savee. Magpin loads every image here, ready for Figma.
      </p>
      <ol class="steps intro__steps">
        {STEPS.map((step, i) => (
          <li key={step} class="intro__in intro__step" style={at(5 + i)}>
            <span class="steps__n">{String(i + 1).padStart(2, '0')}</span>
            <span>{step}</span>
          </li>
        ))}
      </ol>
      <div class="intro__sources intro__in" style={at(9)}>
        <p class="mp-label">Works with</p>
        <div class="intro__chips">
          {SOURCES.map((source) => (
            <a key={source.id} class="intro__chip" href={source.url} target="_blank" rel="noreferrer">
              <SourceIcon source={source.id} size={16} decorative />
              {source.name}
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}

/** A word that slides up out of its own line, like a curtain. */
function Word({ i, children }: { i: number; children: string }) {
  return (
    <span class="intro__word" aria-hidden="true">
      <span class="intro__word-in" style={at(i)}>
        {children}
      </span>
    </span>
  );
}
