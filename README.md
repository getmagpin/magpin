<p align="center">
  <a href="https://magpin.pages.dev"><img src=".github/readme/banner.png" alt="Magpin: copy a board, paste a moodboard" width="100%"></a>
</p>

<h3 align="center">Your next moodboard is one paste away.</h3>

<p align="center">
  Magpin turns any board from Pinterest, Are.na, Cosmos or Savee into a Figma moodboard,
  sorted by color, with its palette. Free, unlimited, no account.
</p>

<p align="center">
  <a href="https://magpin.pages.dev"><b>Website</b></a>
  &nbsp;·&nbsp;
  <a href="#get-magpin"><b>Chrome extension</b></a>
  &nbsp;·&nbsp;
  <a href="#get-magpin"><b>Figma plugin</b></a>
  &nbsp;·&nbsp;
  <a href="https://magpin.pages.dev/privacy"><b>Privacy</b></a>
</p>

<p align="center">
  <img alt="Free" src="https://img.shields.io/badge/price-free-000000?style=flat-square">
  <a href="LICENSE"><img alt="MIT license" src="https://img.shields.io/badge/license-MIT-000000?style=flat-square"></a>
  <img alt="Chrome 116 or later" src="https://img.shields.io/badge/Chrome-116%2B-000000?style=flat-square&logo=googlechrome&logoColor=ffffff">
  <img alt="Figma and FigJam" src="https://img.shields.io/badge/Figma-%26%20FigJam-000000?style=flat-square&logo=figma&logoColor=ffffff">
  <img alt="No tracking" src="https://img.shields.io/badge/tracking-none-000000?style=flat-square">
  <a href="https://github.com/getmagpin/magpin/actions/workflows/checks.yml"><img alt="Checks" src="https://img.shields.io/github/actions/workflow/status/getmagpin/magpin/checks.yml?branch=main&style=flat-square&label=checks&color=000000"></a>
</p>

<br>

<p align="center">
  <img src=".github/readme/demo.gif" alt="A Pinterest board collected in Chrome, copied, then pasted in Figma, where it lands sorted by color with its palette" width="100%">
</p>

## Collect. Copy. Paste.

You spent an evening pinning. Now you need it in Figma, and that usually means saving eighty images one by one, dragging them onto the canvas and lining them up by hand. Magpin does it in three clicks.

1. **Collect a board.** Open a board, click Magpin in Chrome, then **Collect this board**. It reads every image, at full size.
2. **Copy it.** Uncheck what you don't want, then **Copy for Figma**. Got several boards? Add them all to one moodboard first.
3. **Paste in Figma.** Press **⌘V** in the plugin, then **Create moodboard**. It lands sorted by color, numbered, with its palette saved as Figma variables.

No export, no upload, no folder of `IMG_4821.jpg` to clean up.

<p align="center">
  <img src=".github/readme/works-with.png" alt="Works with Pinterest, Are.na, Cosmos and Savee, into Figma and FigJam" width="86%">
</p>

## Every pin, in its place.

<p align="center">
  <img src=".github/readme/features.png" alt="Sorted by color, its palette as variables, three layouts, many boards with no repeats" width="100%">
</p>

- **Sorted by color.** Every image falls into a gradient, with neutrals last. Turn it off to keep the board's own order.
- **Its palette, as variables.** From 3 to 8 named colors (*Brick Red*, *Sage*, *Ink*), saved as Figma color variables, ready to use in the rest of your file.
- **Three layouts.** A clean grid, a mosaic that keeps every image's shape, or blocks grouped by color.
- **Many boards, no repeats.** Mix boards from any source in one moodboard. Each keeps its own section, and an image found twice is placed once, even resized.
- **Unlimited.** Thirty pins or three thousand: no cap per paste, no daily quota.
- **A ZIP when you want files.** The same images as full-size originals, one folder per board.
- **FigJam too.** Same layouts and palette, right on the board.

## Free. All of it.

Similar tools stop at 30 pins on their free plan, or cost $25 to $52. Magpin has no plan: every feature above is the only version there is. No trial, no account, no "Pro". And because it is open source, it stays that way.

## No account. No server. No tracking.

There is nothing to sign up for and nowhere for your boards to go.

- Magpin reads a board **only when you click Collect this board**, on the page you have open.
- The clipboard carries the images' addresses, nothing else.
- Images go straight from the source to your Figma file or your computer.
- The extension asks for the fewest permissions it can: no access to every site, no reading your tabs, no code loaded from elsewhere.

The whole story, in plain words: [privacy policy](https://magpin.pages.dev/privacy).

## Get Magpin

Magpin comes in two parts that work together: the Chrome extension collects, the Figma plugin builds.

<p align="center">
  <img alt="Chrome Web Store: coming soon" src="https://img.shields.io/badge/Chrome_Web_Store-coming_soon-000000?style=for-the-badge&logo=googlechrome&logoColor=ffffff">
  &nbsp;
  <img alt="Figma Community: coming soon" src="https://img.shields.io/badge/Figma_Community-coming_soon-000000?style=for-the-badge&logo=figma&logoColor=ffffff">
</p>

Can't wait? Build both from source in a couple of minutes, below.

## Build from source

You need Node 20 or later, [pnpm](https://pnpm.io), Chrome 116 or later and the Figma desktop app.

```bash
pnpm install
pnpm build
```

- **Chrome**: open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked** and pick `apps/extension/.output/chrome-mv3`.
- **Figma**: in the desktop app, **Plugins → Development → Import plugin from manifest…** and pick `apps/figma-plugin/manifest.json`.

The [developer guide](docs/DEVELOPMENT.md) covers the rest: live reload, tests, how colors and duplicates are computed, how each source is read, and every permission explained.

## What's inside

A TypeScript monorepo, strict mode, no runtime dependencies on any server.

| Folder | What it is |
| --- | --- |
| [`apps/extension`](apps/extension) | The Chrome extension (Manifest V3, WXT, Preact): side panel, collectors, ZIP. |
| [`apps/figma-plugin`](apps/figma-plugin) | The Figma plugin: preview, color analysis, layouts, palette and variables. |
| [`apps/site`](apps/site) | [magpin.pages.dev](https://magpin.pages.dev), a static one-pager (Lighthouse 100 across the board). |
| [`packages/core`](packages/core) | Shared and tested: color science (OKLab, k-means), duplicates, layouts, exchange format. |
| [`packages/ui`](packages/ui) | The design system: tokens, fonts, and the magpie. |

## Contributing

Boards change their markup now and then. If a source stops collecting, [open an issue](https://github.com/getmagpin/magpin/issues/new) with the board's address: a public board is the easiest to check. Pull requests are welcome; run `pnpm typecheck` and `pnpm test` first.

## License

The code is under the [MIT license](LICENSE). The fonts in `packages/ui/src/fonts` (Anton, Geist) keep their own SIL Open Font License, in the files next to them.

<br>

<p align="center">
  <img src="assets/logo/head-sticker-96.png" alt="" width="48"><br>
  <sub>Magpies collect shiny things. So do designers.</sub>
</p>
