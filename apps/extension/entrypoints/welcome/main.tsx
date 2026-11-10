import '@magpin/ui/styles.css';
import './welcome.css';
import { PerchedMagpie } from '@magpin/ui';
import { render } from 'preact';
import { AppIcon } from '@/src/AppIcon';
import { FIGMA_PLUGIN_URL, PASTE_SHORTCUT } from '@/src/config';

function Welcome() {
  // The bird stands at the end of the title, about as tall as its letters.
  const titleSize = Math.min(112, Math.max(52, window.innerWidth * 0.072));
  return (
    <main class="welcome">
      <header class="welcome__top">
        <span class="welcome__brand">
          <AppIcon size={38} />
          <span>Magpin</span>
        </span>
        <span class="mp-label">Installed</span>
      </header>

      <section class="welcome__hero">
        <h1 class="mp-display welcome__title">
          Your moodboard arrives already{' '}
          <span class="welcome__last">
            sorted.
            <PerchedMagpie size={Math.round(titleSize * 0.92)} />
          </span>
        </h1>
        <p class="welcome__lead">
          Collect boards from Pinterest, Are.na, Cosmos and Savee, copy them, paste them in Figma. Free, unlimited, no account.
        </p>
      </section>

      <ol class="welcome__steps">
        <li>
          <span class="welcome__n">01</span>
          <h2>Pin Magpin</h2>
          <p>Click the puzzle icon in Chrome's toolbar, then the pin next to Magpin.</p>
        </li>
        <li>
          <span class="welcome__n">02</span>
          <h2>Get the Figma plugin</h2>
          <p>Install Magpin from the Figma Community. It works in Figma and FigJam.</p>
          <a class="mp-btn mp-btn--primary" href={FIGMA_PLUGIN_URL} target="_blank" rel="noreferrer">
            Get the plugin
          </a>
        </li>
        <li>
          <span class="welcome__n">03</span>
          <h2>Open a board</h2>
          <p>
            On Pinterest, Are.na, Cosmos or Savee, click the Magpin icon, then <strong>Collect this board</strong> and{' '}
            <strong>Copy for Figma</strong>. In Figma, run Magpin and press <kbd class="mp-kbd">{PASTE_SHORTCUT}</kbd>.
          </p>
        </li>
      </ol>

      <footer class="welcome__foot">
        <p class="mp-label">No tracking. No account. No Magpin server.</p>
      </footer>
    </main>
  );
}

render(<Welcome />, document.getElementById('app')!);
