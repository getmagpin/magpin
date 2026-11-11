import { renderToString } from 'preact-render-to-string';
import { App } from './App';

/**
 * The page as HTML, written into index.html at build time (scripts/prerender.mjs):
 * search engines and link previews read the whole text without running any script,
 * and the first paint already shows the page. In the browser, main.tsx renders over
 * these elements and takes them over.
 */
export function render(): string {
  return renderToString(<App />);
}
