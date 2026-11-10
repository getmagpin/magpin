import preact from '@preact/preset-vite';
import { type Plugin, defineConfig } from 'vite';

/**
 * The stylesheet goes inline in index.html (about 10 kB gzipped): no request
 * blocks the first paint. The two fonts the hero shows are preloaded, so the
 * headline does not wait for the CSS to be parsed to start fetching them.
 */
function inlineCss(): Plugin {
  return {
    name: 'magpin:inline-css',
    apply: 'build',
    enforce: 'post',
    generateBundle(_, bundle) {
      const html = Object.values(bundle).find((file) => file.type === 'asset' && file.fileName.endsWith('.html'));
      if (!html || html.type !== 'asset') return;
      let page = String(html.source);
      for (const file of Object.values(bundle)) {
        if (file.type !== 'asset' || !file.fileName.endsWith('.css')) continue;
        const link = page.match(new RegExp(`<link[^>]*href="\\./${file.fileName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"[^>]*>`));
        if (!link) continue;
        // Its relative URLs (the fonts) now start from the page, not from assets/.
        const dir = file.fileName.slice(0, file.fileName.lastIndexOf('/') + 1);
        const css = String(file.source).replace(/url\(\.\/([^)]+)\)/g, `url(./${dir}$1)`);
        page = page.replace(link[0], () => `<style>${css}</style>`);
        delete bundle[file.fileName];
      }
      const fonts = Object.keys(bundle).filter((name) => /(anton-latin-400|geist-latin-wght)-normal-[\w-]+\.woff2$/.test(name));
      let head = fonts.map((name) => `<link rel="preload" href="./${name}" as="font" type="font/woff2" crossorigin />`).join('');
      // Link previews need absolute URLs: given the site's address (SITE_URL, set
      // by the deploy), the share image becomes absolute and the page canonical.
      const site = process.env.SITE_URL?.replace(/\/?$/, '/');
      if (site) {
        page = page.replace(/content="\.\/(og-image\.png)"/g, `content="${site}$1"`);
        head += `<link rel="canonical" href="${site}" /><meta property="og:url" content="${site}" />`;
      }
      html.source = page.replace('</title>', `</title>${head}`);
    },
  };
}

// A static one-page site: `pnpm build:site` writes apps/site/dist, ready for any static host.
export default defineConfig({
  base: './',
  plugins: [preact(), inlineCss()],
  server: { port: 5178 },
  preview: { port: 5178 },
});
