/**
 * Main thread: everything that touches the canvas.
 *
 * - `register-*`: turns each image into a Figma image (hash + size) without
 *   placing it, and returns a small rendition for color analysis.
 * - `build`: places the analysed, sorted images in a section, with group
 *   swatches, the palette frame and the color variables.
 */
import { DEFAULT_GRID, PALETTE_LIMITS, SOURCE_NAMES, clampGridOptions, sourceIconSvg } from '@magpin/core';
import type { BuildBlock, BuildPaletteColor, BuildRequest, EditorType, MainToUi, Registered, Settings, UiToMain, VariablesMode } from '../shared/messages';
import { type Rect, findSpot } from './place';
import { planVariableUpdate, uniqueNames, variableNames } from './variables';

const SETTINGS_KEY = 'magpin.settings.v2';
/** Plugin data key holding the image's id in its source (pin id…). */
const SOURCE_ID_KEY = 'sourceId';
const PADDING = 80;
const PALETTE_GAP = 160;
/** Room taken by the source header (mark, name, link) above a board's images. */
const HEADER_SPACE = 72;
/** Space between two boards' sections. */
const BLOCK_GAP = 200;
const SPACING_FROM_CONTENT = 240;
/** Moodboards line up left to right up to this width, then start a new row. */
const ROW_WIDTH = 16000;
const BATCH_SIZE = 40;
/** Biggest image whose own bytes we send back for analysis when there is no thumbnail. */
const MAX_ANALYSIS_PIXELS = 1600 * 1600;

const DEFAULT_SETTINGS: Settings = {
  columns: DEFAULT_GRID.columns,
  gap: DEFAULT_GRID.gap,
  layout: 'grid',
  sortByColor: true,
  palette: true,
  paletteSize: PALETTE_LIMITS.default,
  variables: true,
};

let building = false;
let cancelBuild = false;

figma.showUI(__html__, { width: 360, height: 640, themeColors: false, title: 'Magpin' });

// ⌘V usually lands on the canvas (Figma keeps the shortcut unless a plugin
// text field has focus): the board then arrives as a selected text layer.
figma.on('selectionchange', checkSelectionForBoard);

figma.ui.onmessage = (message: UiToMain) => {
  handle(message).catch((error: unknown) => {
    figma.notify(`Magpin: ${error instanceof Error ? error.message : String(error)}`, { error: true });
  });
};

async function handle(message: UiToMain): Promise<void> {
  switch (message.type) {
    case 'ready':
      post({ type: 'init', settings: await loadSettings(), editor: editorType() });
      // A board pasted on the canvas before the plugin was opened is still selected.
      checkSelectionForBoard();
      return;
    case 'save-settings':
      await figma.clientStorage.setAsync(SETTINGS_KEY, normalizeSettings(message.settings));
      return;
    case 'inspect':
      post({ type: 'inspection', collectionName: message.collectionName, exists: (await findCollection(message.collectionName)) !== null });
      return;
    case 'register-bytes':
      post({ type: 'registered', index: message.index, result: await registerBytes(message.bytes) });
      return;
    case 'register-urls':
      post({ type: 'registered', index: message.index, result: await registerUrls(message.urls, message.thumbUrl) });
      return;
    case 'build':
      await build(message.request);
      return;
    case 'cancel-build':
      cancelBuild = true;
      return;
    case 'canvas-paste-result':
      if (message.accepted) await removeNodes(message.nodeIds);
      return;
  }
}

// ---------- Register ----------

async function registerBytes(bytes: Uint8Array): Promise<Registered> {
  try {
    const image = figma.createImage(bytes);
    const { width, height } = await image.getSizeAsync();
    return { ok: true, hash: image.hash, width, height, thumbBytes: null };
  } catch {
    return { ok: false };
  }
}

async function registerUrls(urls: string[], thumbUrl: string | null): Promise<Registered> {
  for (const url of urls) {
    try {
      const image = await figma.createImageAsync(url);
      const { width, height } = await image.getSizeAsync();
      return { ok: true, hash: image.hash, width, height, thumbBytes: await analysisBytes(image, width * height, thumbUrl) };
    } catch {
      // Try the next URL (smaller rendition, or a format Figma accepts).
    }
  }
  return { ok: false };
}

/** A small rendition for color analysis: the source's thumbnail, else the image itself if small enough. */
async function analysisBytes(image: Image, pixels: number, thumbUrl: string | null): Promise<Uint8Array | null> {
  if (thumbUrl) {
    try {
      return await (await figma.createImageAsync(thumbUrl)).getBytesAsync();
    } catch {
      // fall through
    }
  }
  if (pixels > MAX_ANALYSIS_PIXELS) return null;
  try {
    return await image.getBytesAsync();
  } catch {
    return null;
  }
}

// ---------- Build ----------

async function build(request: BuildRequest): Promise<void> {
  if (building) return;
  building = true;
  cancelBuild = false;
  // Outside the try, so a failure halfway still reports what got placed
  // (and an empty section can go).
  let placedTotal = 0;
  let section: SectionNode | null = null;
  // A collection made by this run goes again if nothing ends up placed.
  let newCollection: VariableCollection | null = null;
  const discardEmpty = () => {
    if (placedTotal > 0) return;
    if (section && !section.removed) section.remove();
    if (newCollection) newCollection.remove();
    newCollection = null;
  };
  try {
    const { blocks } = request;
    const total = blocks.reduce((sum, block) => sum + block.items.length, 0);
    const several = blocks.length > 1;

    // Color variables first, so palette squares can be bound to them. With
    // several boards, each board's colors form a group: "Board/Brick Red".
    const flat = blocks.flatMap((block, b) => block.palette.map((color) => ({ block: b, color })));
    const wantVariables = flat.length > 0 && editorType() === 'figma' && request.variables !== 'none';
    const bound = wantVariables
      ? await upsertVariables(
          request.collectionName,
          flat.map(({ color }) => color),
          variableNames(blocks.map((block) => ({ title: block.title, colors: block.palette.map((color) => color.name) }))),
          request.variables,
        )
      : null;
    newCollection = bound?.created ?? null;
    const variablesOf = (b: number): Variable[] | null => {
      if (!bound) return null;
      return flat.map((entry, i) => (entry.block === b ? bound.variables[i]! : null)).filter((v): v is Variable => v !== null);
    };

    // Room for the estimate first (before the section exists, so it doesn't
    // count itself), then once built, room for its real size.
    const estimate = estimateSize(request);
    const spot = freeSpot(estimate.width, estimate.height);
    section = figma.createSection();
    section.name = `Moodboard — ${request.title}`;
    section.x = spot.x;
    section.y = spot.y;
    section.resizeWithoutConstraints(estimate.width, estimate.height);
    figma.viewport.scrollAndZoomIntoView([section]);

    const report = (count: number) => {
      placedTotal += count;
      post({ type: 'build-progress', done: placedTotal, total });
    };

    let cursorX = PADDING;
    let tallest = 0;
    for (const [b, block] of blocks.entries()) {
      if (cancelBuild) break;
      // One board: straight in the moodboard section. Several: one section each.
      const container = several ? figma.createSection() : section;
      if (several) {
        container.name = block.title;
        section.appendChild(container);
        container.x = cursorX;
        container.y = PADDING;
      }
      const size = await fillBlock(container, block, variablesOf(b), report);
      if (several) {
        if (size.placed === 0) {
          container.remove();
          continue;
        }
        container.resizeWithoutConstraints(size.width + PADDING * 2, size.height + PADDING * 2);
        cursorX += container.width + BLOCK_GAP;
        tallest = Math.max(tallest, container.height);
      } else {
        cursorX += size.width;
        tallest = size.height;
      }
    }

    if (placedTotal === 0) {
      discardEmpty();
      post({ type: 'built', placed: 0, variables: null });
      return;
    }
    const width = several ? cursorX - BLOCK_GAP + PADDING : cursorX + PADDING;
    const height = several ? tallest + PADDING * 2 : tallest + PADDING * 2;
    section.resizeWithoutConstraints(width, height);
    // The palette and the headers can make it bigger than estimated: move it
    // where its real size fits, so it never covers anything.
    const final = freeSpot(width, height, section);
    section.x = final.x;
    section.y = final.y;

    figma.currentPage.selection = [section];
    figma.viewport.scrollAndZoomIntoView([section]);
    const noun = placedTotal === 1 ? 'image' : 'images';
    figma.notify(cancelBuild ? `Stopped. ${placedTotal} ${noun} placed.` : `Moodboard ready. ${placedTotal} ${noun}.`);
    post({ type: 'built', placed: placedTotal, variables: bound ? { collectionName: bound.collectionName, count: bound.variables.length } : null });
  } catch (error) {
    // Never leave the plugin waiting: say what happened and what got placed.
    const reason = error instanceof Error ? error.message : String(error);
    try {
      discardEmpty();
    } catch {
      // Leave it: the error below matters more.
    }
    figma.notify(`Magpin: the moodboard could not be finished (${reason})`, { error: true });
    post({ type: 'built', placed: placedTotal, variables: null, error: reason });
  } finally {
    building = false;
  }
}

/**
 * Places one board's images (in batches), group swatches and palette frame in
 * `container`, at PADDING from its top-left corner. Returns the content size.
 */
async function fillBlock(
  container: SectionNode,
  block: BuildBlock,
  variables: Variable[] | null,
  report: (count: number) => void,
): Promise<{ width: number; height: number; placed: number }> {
  // Where the board comes from: its source's mark, name and a link to it.
  const header = block.source ? await createSourceHeader(block) : null;
  if (header) {
    container.appendChild(header);
    header.x = PADDING;
    header.y = PADDING;
  }
  const top = PADDING + (header ? HEADER_SPACE : 0);

  for (const swatch of block.swatches) {
    const dot = figma.createEllipse();
    dot.name = swatch.name;
    dot.resize(swatch.size, swatch.size);
    dot.x = PADDING + swatch.x;
    dot.y = top + swatch.y;
    dot.fills = [{ type: 'SOLID', color: hexToFigmaRgb(swatch.hex) }];
    container.appendChild(dot);
  }

  const placed: RectangleNode[] = [];
  let right = 0;
  let bottom = 0;
  for (let start = 0; start < block.items.length && !cancelBuild; start += BATCH_SIZE) {
    const batch = block.items.slice(start, start + BATCH_SIZE);
    for (const item of batch) {
      const rect = figma.createRectangle();
      rect.name = item.name;
      rect.setPluginData(SOURCE_ID_KEY, item.sourceId);
      rect.resize(item.width, item.height);
      rect.x = PADDING + item.x;
      rect.y = top + item.y;
      rect.fills = [{ type: 'IMAGE', imageHash: item.hash, scaleMode: 'FILL' }];
      container.appendChild(rect);
      placed.push(rect);
      right = Math.max(right, item.x + item.width);
      bottom = Math.max(bottom, item.y + item.height);
    }
    report(batch.length);
    await nextTick();
  }
  // The layers panel lists the last child first: append from the end so that
  // 01 sits at the top of the list.
  for (let index = placed.length - 1; index >= 0; index--) container.appendChild(placed[index]!);

  let width = Math.max(cancelBuild ? right : block.contentWidth, header?.width ?? 0);
  let height = (cancelBuild ? bottom : block.contentHeight) + (header ? HEADER_SPACE : 0);
  if (block.palette.length > 0 && placed.length > 0 && !cancelBuild) {
    const frame = await createPaletteFrame(block.palette, variables);
    container.appendChild(frame);
    frame.x = PADDING + width + PALETTE_GAP;
    frame.y = top;
    width += PALETTE_GAP + frame.width;
    height = Math.max(height, frame.height + (header ? HEADER_SPACE : 0));
  }
  return { width, height, placed: placed.length };
}

function estimateSize(request: BuildRequest): { width: number; height: number } {
  const blockWidth = (block: BuildBlock) => block.contentWidth + (block.palette.length > 0 ? PALETTE_GAP + 320 : 0);
  const blockHeight = (block: BuildBlock) => block.contentHeight + (block.source ? HEADER_SPACE : 0);
  if (request.blocks.length === 1) {
    const block = request.blocks[0]!;
    return { width: blockWidth(block) + PADDING * 2, height: blockHeight(block) + PADDING * 2 };
  }
  const width = request.blocks.reduce((sum, block) => sum + blockWidth(block) + PADDING * 2 + BLOCK_GAP, 0) - BLOCK_GAP + PADDING * 2;
  const height = Math.max(...request.blocks.map(blockHeight)) + PADDING * 4;
  return { width, height };
}

/**
 * "Source" chip: the source's mark, its name and the board title, linked to the
 * board. A white pill so it reads on light and dark canvases alike.
 */
async function createSourceHeader(block: BuildBlock): Promise<FrameNode | null> {
  if (!block.source) return null;
  try {
    const chip = figma.createFrame();
    chip.name = `Source — ${SOURCE_NAMES[block.source]}`;
    chip.layoutMode = 'HORIZONTAL';
    chip.primaryAxisSizingMode = 'AUTO';
    chip.counterAxisSizingMode = 'AUTO';
    chip.counterAxisAlignItems = 'CENTER';
    chip.itemSpacing = 12;
    chip.paddingTop = chip.paddingBottom = 10;
    chip.paddingLeft = 12;
    chip.paddingRight = 18;
    chip.cornerRadius = 999;
    chip.fills = [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 } }];

    const mark = figma.createNodeFromSvg(sourceIconSvg(block.source, { size: 28 }));
    mark.name = SOURCE_NAMES[block.source];
    chip.appendChild(mark);

    if (await loadFonts()) {
      const label = text(`${SOURCE_NAMES[block.source]}  ·  ${block.title}`, 'Medium', 18, { r: 0, g: 0, b: 0 });
      if (block.url) {
        try {
          label.hyperlink = { type: 'URL', value: block.url };
        } catch {
          // Links are a bonus.
        }
      }
      chip.appendChild(label);
    }
    return chip;
  } catch {
    return null;
  }
}

/** "Palette" frame: one square per color with its name and hex code underneath. */
async function createPaletteFrame(colors: BuildPaletteColor[], variables: Variable[] | null): Promise<FrameNode> {
  const fontsReady = await loadFonts();
  const frame = figma.createFrame();
  frame.name = 'Palette';
  frame.layoutMode = 'VERTICAL';
  frame.primaryAxisSizingMode = 'AUTO';
  frame.counterAxisSizingMode = 'AUTO';
  frame.itemSpacing = 28;
  frame.paddingTop = frame.paddingBottom = frame.paddingLeft = frame.paddingRight = 32;
  frame.fills = [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 } }];

  colors.forEach((color, i) => {
    const card = figma.createFrame();
    card.name = color.name;
    card.layoutMode = 'VERTICAL';
    card.primaryAxisSizingMode = 'AUTO';
    card.counterAxisSizingMode = 'AUTO';
    card.itemSpacing = 8;
    card.fills = [];

    const square = figma.createRectangle();
    square.name = color.hex;
    square.resize(240, 240);
    const paint: SolidPaint = { type: 'SOLID', color: color.rgb };
    const variable = variables?.[i];
    square.fills = [variable ? bindColor(paint, variable) : paint];
    card.appendChild(square);

    if (fontsReady) {
      card.appendChild(text(color.name, 'Medium', 16, { r: 0, g: 0, b: 0 }));
      card.appendChild(text(color.hex, 'Regular', 14, { r: 0.435, g: 0.435, b: 0.435 }));
    }
    frame.appendChild(card);
  });
  return frame;
}

function bindColor(paint: SolidPaint, variable: Variable): SolidPaint {
  try {
    return figma.variables.setBoundVariableForPaint(paint, 'color', variable);
  } catch {
    return paint;
  }
}

async function loadFonts(): Promise<boolean> {
  try {
    await Promise.all([figma.loadFontAsync({ family: 'Inter', style: 'Regular' }), figma.loadFontAsync({ family: 'Inter', style: 'Medium' })]);
    return true;
  } catch {
    return false;
  }
}

function text(characters: string, style: 'Regular' | 'Medium', size: number, color: RGB): TextNode {
  const node = figma.createText();
  node.fontName = { family: 'Inter', style };
  node.fontSize = size;
  node.characters = characters;
  node.fills = [{ type: 'SOLID', color }];
  return node;
}

/**
 * Collection "Magpin / <board>", one COLOR variable per palette color, named
 * `names` (already fit for Figma, see variables.ts). `update` rewrites the
 * existing collection of the same name in place. On failure, whatever this run
 * created is removed again.
 */
async function upsertVariables(
  name: string,
  colors: BuildPaletteColor[],
  names: string[],
  mode: VariablesMode,
): Promise<{ collectionName: string; variables: Variable[]; created: VariableCollection | null } | null> {
  let createdCollection: VariableCollection | null = null;
  const createdVariables: Variable[] = [];
  try {
    const existing = await findCollection(name);
    let collection: VariableCollection;
    let current: Variable[] = [];
    let reserved: string[] = [];
    if (existing && mode === 'update') {
      collection = existing;
      const found = (await Promise.all(existing.variableIds.map((id) => figma.variables.getVariableByIdAsync(id)))).filter(
        (variable): variable is Variable => variable !== null,
      );
      current = found.filter((variable) => variable.resolvedType === 'COLOR');
      // Names held by other kinds of variables (added by hand) stay theirs.
      reserved = found.filter((variable) => variable.resolvedType !== 'COLOR').map((variable) => variable.name);
    } else {
      collection = figma.variables.createVariableCollection(existing ? await uniqueCollectionName(name) : name);
      createdCollection = collection;
    }
    const wanted = uniqueNames(names, reserved);
    const plan = planVariableUpdate(
      current.map((variable) => variable.name),
      wanted,
    );
    // Extras go first, then renames only target names nobody holds.
    for (const index of plan.remove) current[index]!.remove();
    const modeId = collection.defaultModeId;
    const variables = colors.map((color, i) => {
      const reused = plan.reuse[i];
      let variable: Variable;
      if (reused !== null && reused !== undefined) {
        variable = current[reused]!;
        if (variable.name !== wanted[i]) variable.name = wanted[i]!;
      } else {
        variable = figma.variables.createVariable(wanted[i]!, collection, 'COLOR');
        createdVariables.push(variable);
      }
      variable.setValueForMode(modeId, { ...color.rgb, a: 1 });
      return variable;
    });
    return { collectionName: collection.name, variables, created: createdCollection };
  } catch (error) {
    try {
      if (createdCollection) createdCollection.remove();
      else for (const variable of createdVariables) variable.remove();
    } catch {
      // Already gone.
    }
    figma.notify(`Magpin: color variables could not be created (${error instanceof Error ? error.message : String(error)})`, { error: true });
    return null;
  }
}

async function findCollection(name: string): Promise<VariableCollection | null> {
  if (editorType() !== 'figma') return null;
  try {
    const collections = await figma.variables.getLocalVariableCollectionsAsync();
    return collections.find((collection) => collection.name === name) ?? null;
  } catch {
    return null;
  }
}

async function uniqueCollectionName(name: string): Promise<string> {
  const names = new Set((await figma.variables.getLocalVariableCollectionsAsync()).map((collection) => collection.name));
  let n = 2;
  while (names.has(`${name} ${n}`)) n++;
  return `${name} ${n}`;
}

// ---------- Canvas paste ----------

function checkSelectionForBoard(): void {
  if (building) return;
  const found = figma.currentPage.selection.flatMap((node) => {
    const value = magpinTextOf(node);
    return value ? [{ id: node.id, text: value }] : [];
  });
  const last = found[found.length - 1];
  if (!last) return;
  post({ type: 'canvas-paste', text: last.text, nodeIds: found.map((entry) => entry.id) });
}

function magpinTextOf(node: SceneNode): string | null {
  let value: string | null = null;
  if (node.type === 'TEXT') value = node.characters;
  else if (node.type === 'STICKY' || node.type === 'SHAPE_WITH_TEXT') value = node.text.characters;
  return value !== null && value.trimStart().startsWith('MAGPIN:') ? value : null;
}

async function removeNodes(ids: string[]): Promise<void> {
  for (const id of ids) {
    const node = await figma.getNodeByIdAsync(id);
    if (node && 'remove' in node && !node.removed) node.remove();
  }
}

// ---------- Helpers ----------

/**
 * Room for a new moodboard: to the right of the others while the row has
 * room, then on a new row, never over anything. Middle of the view on an
 * empty page. `self` (the moodboard being placed) doesn't count.
 */
function freeSpot(width: number, height: number, self?: SceneNode): { x: number; y: number } {
  const rects: Rect[] = [];
  for (const node of figma.currentPage.children) {
    if (node === self || !('x' in node) || !('width' in node)) continue;
    // Real bounds, rotation included.
    const box = 'absoluteBoundingBox' in node ? node.absoluteBoundingBox : null;
    rects.push(box ?? { x: node.x, y: node.y, width: node.width, height: node.height });
  }
  const spot = findSpot(rects, { width, height }, { gap: SPACING_FROM_CONTENT, rowWidth: ROW_WIDTH });
  if (spot) return spot;
  const center = figma.viewport.center;
  return { x: Math.round(center.x - width / 2), y: Math.round(center.y - height / 2) };
}

async function loadSettings(): Promise<Settings> {
  try {
    const stored: unknown = await figma.clientStorage.getAsync(SETTINGS_KEY);
    return normalizeSettings(stored && typeof stored === 'object' ? (stored as Partial<Settings>) : {});
  } catch {
    return normalizeSettings({});
  }
}

function normalizeSettings(settings: Partial<Settings>): Settings {
  const { columns, gap } = clampGridOptions(settings);
  const layout = settings.layout === 'mosaic' || settings.layout === 'groups' ? settings.layout : 'grid';
  const paletteSize = Math.min(PALETTE_LIMITS.max, Math.max(PALETTE_LIMITS.min, Math.round(settings.paletteSize ?? PALETTE_LIMITS.default)));
  return {
    columns,
    gap,
    layout,
    sortByColor: settings.sortByColor ?? DEFAULT_SETTINGS.sortByColor,
    palette: settings.palette ?? DEFAULT_SETTINGS.palette,
    paletteSize: Number.isFinite(paletteSize) ? paletteSize : PALETTE_LIMITS.default,
    variables: settings.variables ?? DEFAULT_SETTINGS.variables,
  };
}

function editorType(): EditorType {
  if (figma.editorType === 'figma') return 'figma';
  if (figma.editorType === 'figjam') return 'figjam';
  return 'other';
}

function hexToFigmaRgb(hex: string): RGB {
  const value = Number.parseInt(hex.replace('#', ''), 16);
  return { r: ((value >> 16) & 255) / 255, g: ((value >> 8) & 255) / 255, b: (value & 255) / 255 };
}

function nextTick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function post(message: MainToUi): void {
  figma.ui.postMessage(message);
}

