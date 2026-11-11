// Writes the rendered page into dist/index.html, inside <div id="app">.
// Runs after `vite build` and the SSR build of src/prerender.tsx (see package.json).
import { readFile, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const ssrDir = `${root}node_modules/.cache/prerender`;
const page = `${root}dist/index.html`;

const { render } = await import(pathToFileURL(`${ssrDir}/prerender.js`).href);
const html = render();
const source = await readFile(page, 'utf8');
const empty = '<div id="app"></div>';
if (!source.includes(empty)) throw new Error(`prerender: ${empty} not found in dist/index.html`);
await writeFile(page, source.replace(empty, () => `<div id="app">${html}</div>`));
await rm(ssrDir, { recursive: true, force: true });
console.log(`prerender: ${(html.length / 1024).toFixed(1)} kB of HTML written into dist/index.html`);
