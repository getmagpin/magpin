import { defineConfig } from 'vite';

// Main thread (canvas code): one classic script, conservative syntax for Figma's sandbox.
export default defineConfig({
  build: {
    target: 'es2017',
    outDir: 'dist',
    emptyOutDir: false,
    minify: true,
    lib: {
      entry: 'src/main/code.ts',
      formats: ['iife'],
      name: 'magpin',
      fileName: () => 'code.js',
    },
  },
});
