import preact from '@preact/preset-vite';
import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// Plugin UI: everything (JS, CSS, fonts) inlined into dist/ui.html, as Figma requires.
export default defineConfig({
  root: 'src/ui',
  plugins: [preact(), viteSingleFile()],
  build: {
    outDir: '../../dist',
    emptyOutDir: false,
    target: 'es2020',
    assetsInlineLimit: Number.MAX_SAFE_INTEGER,
    rollupOptions: {
      input: 'src/ui/ui.html',
    },
  },
});
