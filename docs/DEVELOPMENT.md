# Developing Magpin

How Magpin is built, how to run it from source, and how it works under the hood. For what Magpin does, see the [README](../README.md). How it is published (site, Figma Community, Chrome Web Store): [DEPLOY.md](DEPLOY.md), in French.

## Repository

```
apps/
  extension/       Chrome MV3 extension (WXT + Preact): side panel, collector, ZIP
  figma-plugin/    Figma plugin: main thread (canvas) + UI (Preact, single HTML file)
packages/
  core/            Shared and tested: exchange format, duplicates (id/URL, dHash), color
                   (OKLab, k-means, sort, families, palette, names), layouts, naming
  ui/              Design system: tokens, fonts (Anton, Geist), the magpie (animated
                   character), Button, ProgressBar, source marks
  site/            The one-page website (Vite + Preact, static): a hero where the magpie
                   drops a twig and the headline appears around it, demos built from the
                   real components (magpie, ⌘V keys, nest) and the cards, comparison
assets/logo/       Source logo, traced SVG mark, head sticker (the icon), magpie variants
assets/cards/      36 comic cards with the magpie's head (generator, SVG, PNG 1000 px)
```

## Requirements

- Node 20 or later
- pnpm (`npm i -g pnpm`)
- Google Chrome 116 or later (side panel API; also the manifest's `minimum_chrome_version`)
- Figma desktop app (to import a development plugin)

## Install and build

```bash
pnpm install
pnpm build
```

This produces:

- `apps/extension/.output/chrome-mv3/`: the unpacked extension
- `apps/figma-plugin/dist/`: `code.js` and `ui.html`, referenced by `apps/figma-plugin/manifest.json`

### Load the extension in Chrome

1. Open `chrome://extensions` and turn on **Developer mode**.
2. Click **Load unpacked** and pick `apps/extension/.output/chrome-mv3`.
3. A welcome page opens. Pin Magpin in the toolbar (puzzle icon, then the pin).

For live reload while coding: `pnpm dev:extension` opens a Chrome with the extension loaded.

### The website

```bash
pnpm dev:site     # http://localhost:5178
pnpm build:site   # static files in apps/site/dist, for any static host
```

The site's images are the Magpin cards: 36 small comic panels, one main colour each, with the magpie's head drawn from the logo's own path. `node assets/cards/generate.ts` writes them again (framed SVGs in `assets/cards/svg`, frameless ones in `apps/site/public/cards`, and their list in `apps/site/src/cards.gen.ts`); `assets/cards/png` holds 1000 px PNG renders of the framed ones.

The store links live in `apps/site/src/links.ts`: replace them with the Chrome Web Store and Figma Community pages once both are published. The comparison table quotes each competitor's own website (checked November 2026); check it again before publishing.

Lighthouse (production build, mobile and desktop): 100 in Performance, Accessibility, Best Practices and SEO. What keeps it there: the stylesheet is inlined in `index.html` and the two hero fonts are preloaded (a small Vite plugin in `apps/site/vite.config.ts`); the sections below the hero use `content-visibility: auto` with roughly their real heights, and every section is drawn before an in-page jump (`#how`, a page opened at `#compare`) so it lands exactly. Build with `SITE_URL=https://…/` to make the share image (`og-image.png`, 1200×630) absolute and add the canonical URL. `privacy.html` is the privacy policy the Chrome Web Store asks for (contact: getmagpin@gmail.com). The site lives at https://magpin.pages.dev/ (Cloudflare Pages, free). How to publish everything: [DEPLOY.md](DEPLOY.md).

### Import the plugin in Figma

1. In the Figma desktop app, open any file.
2. Menu **Plugins → Development → Import plugin from manifest…**
3. Pick `apps/figma-plugin/manifest.json`.
4. Run it from **Plugins → Development → Magpin**. It also runs in FigJam.

For live rebuilds while coding: `pnpm dev:plugin`, then re-run the plugin in Figma.

## How it works

1. Open a board and click the Magpin icon. The side panel shows the board (title, source, and the page's own count when it shows one: "41 pins", "115 elements"; it includes videos) and waits: **Collect this board** reads it and collects every image. **Stop** keeps what was read so far. A reading that ends clearly short of the page's count says so ("Found 300 of 1,000 pins"), with no celebration. A board already read in the panel, or already in the moodboard, comes back with its images and its selection, and is not read again; **Scan again** (shown while the board is in the active tab) reads it anew, and a new reading stopped early never shrinks a board read before. Supported pages:
   - Pinterest board: `pinterest.com/<user>/<board>/` (and its sections), any country domain;
   - Are.na channel: `are.na/<owner>/<channel>`, public or private (private ones are read from the page you are signed in to);
   - Cosmos cluster: `cosmos.so/<user>/<cluster>`;
   - Savee board: `savee.com/<user>/boards/<board>/`.
2. Everything is selected. Click to toggle, **Shift + click** to select a range, **All** or **None**. Each board keeps its selection when you switch tabs.
3. Optional: **+ Add to moodboard** (in the dock, above **Copy for Figma**), then open another board and add it too. The cart (the **Moodboard** bar above the buttons) lists the boards with their source and image counts; click a title to rename the board (Enter to keep, Esc to cancel, empty to go back to the original), remove one or clear it. It is saved in `chrome.storage.local`, so it survives closing the panel or Chrome. A board in the cart keeps following the selection you make on it.
4. **Copy for Figma** copies the cart plus the board on screen (if not added yet); **Download ZIP** saves the same images, one folder per board. The same image found twice is counted and delivered once: the ZIP holds it once, while the paste carries each board whole and the plugin removes the duplicates as it reads it, so leaving a board out in the plugin gives its shared images back to the boards that stay. If no image at all could be downloaded, no ZIP is saved. Afterwards, the panel offers to clear the moodboard.
5. In Figma, run Magpin and press **⌘V**, anywhere: Figma keeps ⌘V for the canvas unless a plugin text field has focus, so a board pasted on the canvas lands as a text layer, which the plugin picks up from the selection and deletes. Clicking in the plugin window first sends ⌘V straight to the plugin. Image files copied in the Finder and pasted in the plugin are imported like dropped ones (only a drag carrying files shows the drop overlay).
6. Leave out any board with its **×** (put it back with **+**). Pick the layout (**Grid**, **Mosaic**, **Colors**), color sort (on by default), columns, spacing, palette and its number of colors (3–8) and color variables, in two groups (**Layout**, **Palette**). A grey sketch at the top shows the moodboard as it will sit on the canvas: the section "Moodboard — board name" and the Palette frame beside it, at their real proportions, sorted blocks in a light-to-dark ramp, one palette row per color (one more color, one more row). The setting under the pointer (or focused) lights up its part (columns as layout-grid bands, after the swatches in **Colors**, only as many as the images fill; spacing as hatched gutters; the palette frame outlined); the chosen layout says what it gives. Layouts change on click (or arrow keys), never on hover. Once the settings are scrolled, the image count moves up into the top bar and the sketch and boards stay fixed above them; a setting reached with Tab is never hidden under them. Choices are remembered (`figma.clientStorage`).
7. **Create moodboard** loads and analyses every image, removes duplicates, sorts, then builds a section *Moodboard — Board name*: images numbered `01`, `02`… in order, a **Palette** frame next to them, and a variable collection *Magpin / Board name*. Several boards stay distinct: one section per board inside the moodboard section, side by side, each with its own sort, numbering and palette; their variables are grouped by board (`Board/Brick Red`). Variable names are made safe for Figma (a `/` in a board title becomes `-`; `.`, `{` and `}` are dropped) and kept unique. Pasting the same board again offers to update the collection instead of creating another: variables already holding a color's name keep it, the others are renamed or removed, so bindings elsewhere in the file survive; if anything fails, what that run created is removed. **Stop** keeps what has loaded (or, while placing, what is placed); an image that takes over 30 s is skipped. Failed images are skipped and counted. When nothing could be placed, the plugin says why (stopped, no image loaded, or Figma's error), and an error inside the plugin returns to the preview with a notice. Each new moodboard goes to the right of what is already on the page while the row has room (16,000 px), then starts a new row; it never covers anything (`apps/figma-plugin/src/main/place.ts`).

### Colors, duplicates and layouts

- **Analysis**: each image is decoded at ~64 px (Pinterest: the 236 px thumbnail), its pixels clustered with k-means (k = 4) in OKLab; the dominant color is the biggest cluster.
- **Sort**: by OKLCH hue in 16 bins, lightness alternating direction from bin to bin; the hue circle is cut at its widest empty gap. Low-chroma images (black, white, gray) go last, light to dark.
- **Duplicates**: first by pin id and image URL across boards (the extension's counts and ZIP; the plugin again on paste, since the paste carries every board whole), then by a 64-bit dHash in the plugin: within 5 bits and of a similar color, the bigger image is kept.
- **Layouts**: Grid (square cells), Mosaic (column width fixed, height from the image, shortest column first), Colors (one block per hue family with a swatch of the group's color).
- **Palette**: k-means over a sample of the board's pixels, near-identical colors (ΔE OK < 0.07) merged; the heaviest colors are kept, then shown along the smoothest path from the lightest one (a neutral palette reads light to dark, close hues stay together). Names come from a curated list ("Brick Red", "Sage"…). In Figma the squares are bound to the variables. FigJam gets the layout and palette squares, no variables.

The clipboard only carries text: `MAGPIN:` followed by a versioned JSON (`packages/core/src/exchange.ts`). The plugin downloads the images itself.

### How images reach Figma

Pinterest's CDN (`i.pinimg.com`) does not send `Access-Control-Allow-Origin`, so the plugin window (origin `null`) cannot download its images with `fetch`. The plugin then hands the URL to the main thread, which calls `figma.createImageAsync(url)`. The Figma docs say nothing about CORS for that call; **tested in Figma desktop on 2026-11-08: it loads Pinterest images.** WebP originals, which Figma refuses, fall back to the /736x/ JPEG.

A host is sent straight to Figma for the rest of a build only once it has really refused the plugin window (a `no-cors` request to it gets an answer while the computer is online), so a network hiccup doesn't count; every build starts afresh. If a host ever refuses both paths, the plugin says so, and the ZIP route still works: **Download ZIP** in the extension, then drop the ZIP on the plugin (or **Import ZIP or images**). The ZIP's `magpin.json` restores titles and order.

Are.na, Cosmos and Savee CDNs all answer `Access-Control-Allow-Origin: *` (checked on 2026-11-08), so their images download straight from the plugin window (the 4096 px limit and formats Figma refuses, such as WebP and AVIF, are handled by redrawing the image on a canvas).

Known limit: a dropped ZIP is unpacked in memory all at once before the first image loads, so a ZIP of several hundred full-size originals needs that much memory in the plugin window (unpacking each image only when it loads would lower it).

## Tests

```bash
pnpm test        # Vitest: core + Pinterest adapter + plugin input parsing
pnpm typecheck   # TypeScript strict, every package
```

Covered:

- `packages/core`: exchange format (round trip, validation, versions), de-duplication (id/URL, dHash), OKLab and k-means, dominant color, color sort (gradient without isolated jumps), hue families, palette (count, merging, names), grid / mosaic / color groups layouts (10, 100, 500 items, no overlap), ZIP and layer naming, ordered concurrency.
- Are.na private channels: page reading checked against the API's block types on a recorded page.
- `apps/extension`: Pinterest URL matching, image URL resolution (originals, fallback, avatars, videos), board meta, pin counts in several locales, and extraction on a **recorded board page** (`test/fixtures/`), including the "More like this" list that must be ignored. Are.na (recorded API responses), Cosmos and Savee (recorded pages): URL matching, originals, videos skipped, titles.
- `apps/extension`: the cart (selection per board, one moodboard from three boards, duplicates across boards counted once and left in the paste, a reading stopped early never shrinking a board, the echo of its own storage writes told from other windows' changes).
- `apps/extension`: scan progress without a known total (only moves forward, never reaches the end on its own), how a reading ends (full, stopped, empty, clearly short of the page's count), plain words for raw Chrome and fetch errors, an Are.na reading stopped mid-request, and the falling twigs of the intro screen (fall, rest, pile up, fade, fall again when what they rest on goes).
- `apps/figma-plugin`: image format sniffing, 4096 px limit, paste decoding, ZIP import order from `magpin.json`, the arrangement step (visual duplicates, sort, the three layouts, palette), leaving boards out (indexes, title, duplicates checked again), placement on the page (rows, gaps, never overlapping), color variable names (cleaning, board groups, updating a collection without a name collision), the preview sketch's geometry (columns in use, as the real layouts), and the nest's geometry and tiers.

### Manual checks

| Check | How |
| --- | --- |
| F1: every image, no duplicates | Board with 300+ pins, logged in. The counter must reach the board's pin count, minus videos and sponsored pins (shown as skipped). |
| F2: only checked images leave | Uncheck a few, copy, paste: the plugin count must match. Same for the ZIP. |
| F4: 500 images without freezing Figma | Paste a 500-pin board. Figma stays usable, progress moves, **Stop** works (shows "Stopping…", keeps what is loaded). |
| F4: FigJam | Same paste in a FigJam file. |
| F5: ZIP of 500 images | Open the ZIP: one folder, files `001-<id>.jpg`… at full resolution. |

Logged out, Pinterest only shows the first 25 pins of a board: test while signed in.

### Sources

Each source is an isolated adapter in `apps/extension/src/sources/<source>/`, injected in the page only when the panel opens on it.

| Source | How | Original image | Notes |
| --- | --- | --- | --- |
| Pinterest | Scrolls the board, reads grid cells (the list holding the board is locked, so "More like this" is ignored) | `i.pinimg.com/originals/…`, fallback `/736x/` | CDN has no CORS header: Figma fetches it with `createImageAsync` |
| Are.na | Public API v3: `/channels/{slug}` then `/channels/{slug}/contents`, 100 per page. Private channels (new ones are private by default) answer 401: the page is read instead (`grid-cell`, scrolling) | `image.src` (CloudFront original), fallback `large`; from the page, the file key decoded from the `images.are.na` URL | Image blocks only (link and embed badges are recognised on the page); embeds counted as videos. No total shown: the channel's count takes in every block. Magpin never uses an Are.na token |
| Cosmos | Scrolls the cluster, reads `data-testid="element-tile"` | `cdn.cosmos.so/{id}` without parameters | Tiles carry the original size; play badge = video |
| Savee | Scrolls the board, reads `#grid-item-*` | `dm.savee-cdn.com/asset-image/original/{id}.jpg` | `asset-video/` = video |

Pages change: every selector sits at the top of its adapter (`selectors.ts` for Pinterest). To refresh a fixture, save the page's HTML into `apps/extension/test/fixtures/`, strip scripts and styles, and run `pnpm test`. Fixtures were recorded logged out, so they show only what a visitor sees (Pinterest: 25 pins, Savee: about 30 items); signed in, the collectors keep scrolling.

## Permissions

Each permission is needed for the Chrome Web Store and Figma Community reviews.

### Chrome extension

| Permission | Why |
| --- | --- |
| `sidePanel` | Magpin's interface is a side panel next to the board. |
| `scripting` | Injects the collector into the board tab **only when the user opens the panel** on it. No content script is declared in the manifest, so Magpin never runs on pages by itself. |
| `clipboardWrite` | "Copy for Figma" writes the board (URLs as text) to the clipboard. |
| `downloads` | "Download ZIP" saves the archive. |
| `storage` | Keeps the cart (boards added to the moodboard) between sessions, on this computer only. |
| `https://*.pinterest.com/*` | Read the board the user is viewing, and see the active tab's URL to know whether it is a board. Country domains (pinterest.fr, .de, .co.uk…) redirect to `xx.pinterest.com`. |
| `https://i.pinimg.com/*` | Download the board's images for the ZIP (this CDN sends no CORS header). |
| `https://www.are.na/*`, `https://are.na/*` | Read the Are.na channel the user is viewing (the images come from the public API and CDNs, which allow any origin). |
| `https://www.cosmos.so/*`, `https://cosmos.so/*` | Read the Cosmos cluster the user is viewing. |
| `https://savee.com/*`, `https://www.savee.com/*` | Read the Savee board the user is viewing. |

No `tabs`, no `<all_urls>`, no remote code, no analytics.

### Figma plugin

| Field | Value | Why |
| --- | --- | --- |
| `networkAccess.allowedDomains` | `https://i.pinimg.com` (Pinterest), `https://d2w9rnfcy7mm78.cloudfront.net` (Are.na's image CDN, originals), `https://images.are.na` (Are.na's resized images), `https://cdn.cosmos.so` (Cosmos), `https://*.savee-cdn.com` (Savee: the extension keeps any `savee-cdn.com` subdomain from the page, `dm.` today) | Download the pasted board's images from the CDN of each source. Nothing else. `networkAccess.reasoning` names each domain's purpose for the review. |
| `editorType` | `figma`, `figjam` | Works in both. FigJam gets the layout and palette squares, no color variables. |
| `documentAccess` | `dynamic-page` | Required for new plugins. |

The `id` in `apps/figma-plugin/manifest.json` (`1702182298012784493`) is the plugin's Figma Community id; the Community page is `https://www.figma.com/community/plugin/1702182298012784493/magpin` (`FIGMA_PLUGIN_URL` in `apps/extension/src/config.ts`).

### Privacy

No server, no account, no tracking. The extension reads the board only when asked, the clipboard only carries image URLs, and images go straight from the source's CDN to the user's computer or Figma file.

## Design

Black and white, inspired by dice.fm: Anton for display type, Geist for text, black pill buttons. Both fonts are under the SIL Open Font License and bundled (`packages/ui/src/fonts/`), so nothing loads from the network. Tokens and shared components live in `packages/ui`.

The logo mark (`assets/logo/magpin-mark.svg`) was traced from Kiyan's logo. The icon is the magpie's head as a sticker (`assets/logo/head-sticker-*.png`): it is the extension's icon and sits next to the name in both headers. When publishing the plugin, upload `assets/logo/head-sticker-128.png` as its icon in Figma's publish dialog (the manifest has no icon field, so a plugin in development shows Figma's placeholder). The full magpie only appears in animations.

### Motion

The magpie is drawn from the mark, with an eye that opens, squints, blinks and shuts into a crescent. It carries the story of each wait, and every animation has a start and an end: when the work finishes mid-way, the animation completes smoothly and ends on a small celebration (eyes shut, two hops, a burst of rays) instead of stopping dead.

- **Extension**: the intro title swipes in word by word and the magpie lands on it (once per panel; coming back to it later, it is simply there); a click on the empty page drops twigs that pile up at the bottom. While a board is read, the bird hops along the progress line (an estimate when the total is unknown), then reaches the end and celebrates. Adding a board: the bird brings a twig and drops it into the moodboard. After a copy or a download, its head pops over the dock and winks.
- **Plugin**: the ⌘ V keycaps press under the bird's weight and with the real keys. While building, it brings twigs (the same twig it carries) and builds its nest; how far it gets depends on the size of the moodboard, from a single twig to a whole nest it settles in.
- **Website**: the magpie hops in with a twig, drops it in the middle (it vanishes as it lands) and “Copy” and “Paste” appear either side of it; in Chrome a hand-drawn arrow points up to the extensions (the nav's Add to Chrome stays hidden until the next section comes up). The big birds are drawn as stickers (white outline, soft shadow); once landed, the hero's can be peeled off with the mouse (it folds back from where you grab it), carried and stuck anywhere in the hero. Hovering a store button makes its head peek over the edge and wink (at the end of the page, a small magpie potters back and forth along the footer's line: hops, pecks, the odd backflip; dropped twigs make it start with a "!", and it jumps over the ones lying on its way, higher and further the bigger the pile; it goes right to both ends of the line); the sources scroll by in a ticker that fades out at both edges. The flow demo loops with its three steps lighting up beneath it, and a click on a step plays it from there; its Figma part shows the plugin as it is (the preview sketch and palette, the settings grouped, Create docked at the bottom), then loads, arranges and places the images already sorted, with the palette names Magpin really gives. The intro always finishes, whatever happens meanwhile (fonts landing, a resize). The feature demos play once when seen; the layout picker answers the arrow keys.
- Buttons, links, switches, the layout picker and the steppers have small press and hover responses. Everything respects *Reduce motion*.
