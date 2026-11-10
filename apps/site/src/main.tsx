import '@magpin/ui/styles.css';
import './site.css';
import { render } from 'preact';
import { App } from './App';

// Sections below the fold are skipped until they come near (content-visibility),
// with estimated heights. Before jumping to a section (a link to #how, or a page
// opened at #compare), they are all drawn, so the jump lands exactly.
const drawAll = () => document.documentElement.classList.add('is-drawn');
if (location.hash) drawAll();
document.addEventListener(
  'click',
  (event) => {
    if ((event.target as Element | null)?.closest?.('a[href^="#"]')) drawAll();
  },
  { capture: true },
);

render(<App />, document.getElementById('app')!);
