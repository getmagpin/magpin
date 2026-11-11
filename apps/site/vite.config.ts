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

/**
 * What search engines read besides the page: robots.txt, and with the site's
 * address (SITE_URL) a sitemap and structured data describing Magpin.
 */
function seo(): Plugin {
  return {
    name: 'magpin:seo',
    apply: 'build',
    enforce: 'post',
    generateBundle(_, bundle) {
      const site = process.env.SITE_URL?.replace(/\/?$/, '/');
      const robots = ['User-agent: *', 'Allow: /', ...(site ? ['', `Sitemap: ${site}sitemap.xml`] : [])].join('\n');
      this.emitFile({ type: 'asset', fileName: 'robots.txt', source: `${robots}\n` });
      if (!site) return;

      const today = new Date().toISOString().slice(0, 10);
      const urls = [site, `${site}privacy`]
        .map((loc) => `  <url><loc>${loc}</loc><lastmod>${today}</lastmod></url>`)
        .join('\n');
      this.emitFile({
        type: 'asset',
        fileName: 'sitemap.xml',
        source: `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`,
      });

      // For AI assistants (llmstxt.org): what Magpin is, in Markdown, with its links.
      this.emitFile({
        type: 'asset',
        fileName: 'llms.txt',
        source: `# Magpin

> Magpin turns any board from Pinterest, Are.na, Cosmos or Savee into a Figma moodboard, sorted by color, with its palette. A free Chrome extension collects the board and a free Figma plugin builds the moodboard. No account, no server, no tracking. Open source under the MIT license.

Magpin comes in two parts that work together:

- The Chrome extension reads a board when the user clicks "Collect this board", then copies it for Figma or downloads its full-size images as a ZIP. Several boards can go into one moodboard.
- The Figma plugin, for Figma and FigJam, takes the pasted board, leaves duplicates out, sorts the images by color and lays them out as a Grid, a Mosaic or grouped by color, with a palette of 3 to 8 named colors saved as Figma color variables.

## Links

- [Website](${site}): what Magpin does, how it works, its features and how it compares
- [Privacy policy](${site}privacy): what the extension and the plugin read, keep and send
- [Source code](https://github.com/getmagpin/magpin): the extension, the plugin and the site
- [Developer guide](https://github.com/getmagpin/magpin/blob/main/docs/DEVELOPMENT.md): how Magpin works under the hood

## Optional

- [Report a problem](https://github.com/getmagpin/magpin/issues)
`,
      });

      const html = Object.values(bundle).find((file) => file.type === 'asset' && file.fileName.endsWith('.html'));
      if (!html || html.type !== 'asset') return;
      const description =
        'Magpin turns any board from Pinterest, Are.na, Cosmos or Savee into a Figma moodboard, sorted by color, with its palette. Free, unlimited, no account.';
      const data = {
        '@context': 'https://schema.org',
        '@graph': [
          { '@type': 'WebSite', '@id': `${site}#website`, url: site, name: 'Magpin', description, inLanguage: 'en', publisher: { '@id': `${site}#magpin` } },
          { '@type': 'Organization', '@id': `${site}#magpin`, name: 'Magpin', url: site, logo: `${site}icon.png`, sameAs: ['https://github.com/getmagpin/magpin'] },
          {
            '@type': 'SoftwareApplication',
            name: 'Magpin',
            url: site,
            description,
            image: `${site}og-image.png`,
            applicationCategory: 'DesignApplication',
            applicationSubCategory: 'Chrome extension and Figma plugin',
            operatingSystem: 'Chrome, Figma, FigJam',
            isAccessibleForFree: true,
            license: 'https://opensource.org/licenses/MIT',
            offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
            featureList: [
              'Collect boards from Pinterest, Are.na, Cosmos and Savee',
              'Paste them into Figma or FigJam as a moodboard',
              'Images sorted by color',
              'A palette of 3 to 8 named colors, saved as Figma color variables',
              'Grid, Mosaic and Colors layouts',
              'Several boards in one moodboard, duplicates left out',
              'ZIP download of the full-size images',
            ],
            publisher: { '@id': `${site}#magpin` },
          },
        ],
      };
      const script = `<script type="application/ld+json">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>`;
      html.source = String(html.source).replace('</head>', `${script}</head>`);
    },
  };
}

// A static one-page site: `pnpm build:site` writes apps/site/dist, ready for any static host.
export default defineConfig({
  base: './',
  plugins: [preact(), inlineCss(), seo()],
  // One Preact for the page and @magpin/ui: pnpm keeps a second copy for
  // preact-render-to-string, and two copies break the hooks.
  resolve: { dedupe: ['preact'] },
  server: { port: 5178 },
  preview: { port: 5178 },
});
