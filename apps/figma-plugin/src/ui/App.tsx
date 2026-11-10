import { DEFAULT_GRID, GRID_LIMITS, PALETTE_LIMITS, looksLikeMagpin } from '@magpin/core';
import { Button, KeysBird, type NestMemory, NestScene, SourceIcon, formatCount, freshNest, pluralize, prefersReducedMotion } from '@magpin/ui';
import type { ComponentChildren, JSX, RefObject } from 'preact';
import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { EditorType, LayoutKind, Settings, VariablesMode } from '../shared/messages';
import { onMainMessage, postToMain } from './bridge';
import { type BuildProgress, type BuildResult, buildMoodboard } from './builder';
import { Sketch, type SketchPart } from './Sketch';
import { type Prepared, fromFiles, fromPastedText, selectBoards } from './sources';
// The plugin's icon, the same sticker as the Chrome extension's (inlined into ui.html).
import appIcon from './assets/app-icon.png';

type View =
  | { kind: 'empty'; error: string | null }
  /** `error`: the last build failed before placing anything. */
  | { kind: 'preview'; prepared: Prepared; error?: string }
  | { kind: 'building'; prepared: Prepared; progress: BuildProgress }
  | { kind: 'done'; prepared: Prepared; result: BuildResult };

const IS_MAC = /Mac/i.test(navigator.userAgent);
const PASTE_KEY = IS_MAC ? '⌘V' : 'Ctrl+V';

export function App() {
  const [view, setView] = useState<View>({ kind: 'empty', error: null });
  const [settings, setSettings] = useState<Settings>({
    columns: DEFAULT_GRID.columns,
    gap: DEFAULT_GRID.gap,
    layout: 'grid',
    sortByColor: true,
    palette: true,
    paletteSize: PALETTE_LIMITS.default,
    variables: true,
  });
  const [editor, setEditor] = useState<EditorType>('figma');
  // Variable collection of the same name already in the file? Then offer to update it.
  const [collection, setCollection] = useState<{ name: string; exists: boolean } | null>(null);
  const [updateExisting, setUpdateExisting] = useState(true);
  const [dragging, setDragging] = useState(false);
  const pasteTarget = useRef<HTMLTextAreaElement>(null);
  const controller = useRef<AbortController | null>(null);
  // Stop pressed: the build winds down (keeps what is loaded or placed).
  const [stopping, setStopping] = useState(false);
  // The nest animation, carried from the build screen to the done screen.
  const nest = useRef(freshNest());
  const viewRef = useRef(view);
  viewRef.current = view;

  const [celebrating, setCelebrating] = useState(false);
  // Boards of the pasted moodboard the user left out (indexes).
  const [excluded, setExcluded] = useState<ReadonlySet<number>>(() => new Set());
  const celebration = useRef<ReturnType<typeof setTimeout> | null>(null);
  const accept = useCallback((result: Prepared | { error: string }) => {
    // Nothing replaces a moodboard being built.
    if (viewRef.current.kind === 'building') return;
    if (celebration.current) clearTimeout(celebration.current);
    celebration.current = null;
    if ('error' in result) {
      setCelebrating(false);
      setView({ kind: 'empty', error: result.error });
      return;
    }
    setExcluded(new Set());
    // From the paste screen, let the magpie celebrate for a beat first.
    if (viewRef.current.kind === 'empty' && !prefersReducedMotion()) {
      setCelebrating(true);
      celebration.current = setTimeout(() => {
        celebration.current = null;
        setCelebrating(false);
        if (viewRef.current.kind !== 'building') setView({ kind: 'preview', prepared: result });
      }, 560);
      return;
    }
    setView({ kind: 'preview', prepared: result });
  }, []);

  useEffect(() => {
    const stop = onMainMessage((message) => {
      if (message.type === 'init') {
        setSettings(message.settings);
        setEditor(message.editor);
      } else if (message.type === 'inspection') {
        setCollection({ name: message.collectionName, exists: message.exists });
      } else if (message.type === 'canvas-paste') {
        // The board was pasted on the canvas as a text layer: take it, then let
        // the main thread delete that layer.
        const busy = viewRef.current.kind === 'building';
        const result = busy ? null : fromPastedText(message.text);
        if (result) accept(result);
        postToMain({ type: 'canvas-paste-result', nodeIds: message.nodeIds, accepted: result !== null && !('error' in result) });
      }
    });
    postToMain({ type: 'ready' });
    pasteTarget.current?.focus();
    return stop;
  }, [accept]);

  const selected = useMemo(() => (view.kind === 'preview' ? selectBoards(view.prepared, excluded) : null), [view, excluded]);
  // Preview scrolled: its image count moves up into the top bar.
  const [compact, setCompact] = useState(false);
  useEffect(() => {
    if (view.kind !== 'preview') setCompact(false);
  }, [view.kind]);
  const headerCount = view.kind === 'preview' ? (selected ?? view.prepared).jobs.length : 0;
  const toggleBoard = (index: number) =>
    setExcluded((current) => {
      const next = new Set(current);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });

  const previewTitle = selected ? selected.title : null;
  useEffect(() => {
    if (previewTitle === null) return;
    setCollection(null);
    setUpdateExisting(true);
    postToMain({ type: 'inspect', collectionName: collectionNameFor(previewTitle) });
  }, [previewTitle]);

  /**
   * Fallback when a board lands in the paste field without a paste event.
   * Plain typing (pressing V on its own, say) is just cleared, quietly.
   */
  const onPasteFieldInput = (event: Event) => {
    const field = event.currentTarget as HTMLTextAreaElement;
    const text = field.value;
    field.value = '';
    const pasted = (event as InputEvent).inputType === 'insertFromPaste';
    if (text.trim() && (pasted || looksLikeMagpin(text))) accept(fromPastedText(text));
  };

  // ⌘V anywhere in the plugin window.
  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const kind = viewRef.current.kind;
      if (kind === 'building') return;
      const files = Array.from(event.clipboardData?.files ?? []);
      const text = event.clipboardData?.getData('text/plain') ?? '';
      if (!text && files.length === 0) return;
      event.preventDefault();
      // Files copied in the Finder come with their names as text: unless that
      // text is a Magpin board, import the files.
      if (files.length > 0 && !looksLikeMagpin(text)) void fromFiles(files).then(accept);
      else accept(fromPastedText(text));
    };
    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  }, [accept]);

  const openFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    void fromFiles(Array.from(files)).then(accept);
  };

  const updateSettings = (next: Settings) => {
    setSettings(next);
    postToMain({ type: 'save-settings', settings: next });
  };

  const variablesMode: VariablesMode =
    editor !== 'figma' || !settings.palette || !settings.variables ? 'none' : collection?.exists && updateExisting ? 'update' : 'create';

  /** `pasted`: the preview's moodboard as pasted, to go back to if the build fails. */
  const create = async (pasted: Prepared, prepared: Prepared) => {
    const abort = new AbortController();
    controller.current = abort;
    setStopping(false);
    nest.current = freshNest();
    setView({ kind: 'building', prepared, progress: { phase: 'loading', done: 0, failed: 0, total: prepared.jobs.length } });
    try {
      const result = await buildMoodboard(
        prepared,
        { settings, variables: variablesMode, collectionName: collectionNameFor(prepared.title) },
        (progress) => setView({ kind: 'building', prepared, progress }),
        abort.signal,
      );
      setView({ kind: 'done', prepared, result });
    } catch (error) {
      // Failed in the plugin window, before anything reached the canvas: back
      // to the preview, settings and boards as they were.
      const reason = error instanceof Error ? error.message : String(error);
      setView({ kind: 'preview', prepared: pasted, error: `The moodboard could not be built (${reason}). Nothing was placed. Try again.` });
    } finally {
      controller.current = null;
      setStopping(false);
    }
  };

  const stop = () => {
    const current = controller.current;
    if (!current || current.signal.aborted) return;
    setStopping(true);
    current.abort();
  };

  const reset = () => {
    setView({ kind: 'empty', error: null });
    requestAnimationFrame(() => pasteTarget.current?.focus());
  };

  // Only files can be dropped (a ZIP, images): other drags pass by.
  const hasFiles = (event: DragEvent) => Array.from(event.dataTransfer?.types ?? []).includes('Files');
  const dropProps = {
    onDragOver: (event: DragEvent) => {
      if (!hasFiles(event)) return;
      // Taken even while building, so a dropped file never opens in the window.
      event.preventDefault();
      if (view.kind === 'building') {
        if (event.dataTransfer) event.dataTransfer.dropEffect = 'none';
        return;
      }
      setDragging(true);
    },
    onDragLeave: (event: DragEvent) => {
      if (event.relatedTarget === null) setDragging(false);
    },
    onDrop: (event: DragEvent) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      setDragging(false);
      if (view.kind !== 'building') openFiles(event.dataTransfer?.files ?? null);
    },
  };

  return (
    <div class="app" {...dropProps}>
      <header class="topbar">
        <span class="brand">
          <img class="app-icon" src={appIcon} width={28} height={28} alt="" draggable={false} />
          <span class="brand__name">Magpin</span>
        </span>
        <span class="topbar__end">
          {view.kind === 'preview' ? (
            <span class={`topbar__count${compact ? ' is-shown' : ''}`} aria-hidden={!compact}>
              <span class="topbar__num mp-num">{formatCount(headerCount)}</span>
              <span class="topbar__unit">{headerCount === 1 ? 'Image' : 'Images'}</span>
            </span>
          ) : null}
          {editor === 'figjam' ? <span class="mp-label">FigJam</span> : null}
        </span>
      </header>

      {view.kind === 'empty' ? (
        <Empty error={view.error} celebrate={celebrating} pasteRef={pasteTarget} onPasteInput={onPasteFieldInput} onFiles={openFiles} />
      ) : view.kind === 'preview' ? (
        <Preview
          prepared={view.prepared}
          selected={selected ?? view.prepared}
          error={view.error ?? null}
          excluded={excluded}
          onToggleBoard={toggleBoard}
          settings={settings}
          editor={editor}
          collection={collection}
          updateExisting={updateExisting}
          onUpdateExisting={setUpdateExisting}
          onSettings={updateSettings}
          onCreate={() => void create(view.prepared, selected ?? view.prepared)}
          onClear={reset}
          compact={compact}
          onCompact={setCompact}
        />
      ) : view.kind === 'building' ? (
        <Building progress={view.progress} images={view.prepared.jobs.length} nest={nest.current} stopping={stopping} onStop={stop} />
      ) : (
        <Done prepared={view.prepared} result={view.result} nest={nest.current} onAgain={reset} />
      )}

      {dragging ? (
        <div class="dropzone" aria-hidden="true">
          <p class="mp-display">Drop to import</p>
        </div>
      ) : null}
    </div>
  );
}

function Screen({
  children,
  footer,
  onMouseDown,
  onScroll,
}: {
  children: ComponentChildren;
  footer?: ComponentChildren;
  onMouseDown?: (event: MouseEvent) => void;
  onScroll?: (event: Event) => void;
}) {
  return (
    <>
      <main class="screen" onMouseDown={onMouseDown} onScroll={onScroll}>
        {children}
      </main>
      {footer ? <footer class="dock">{footer}</footer> : null}
    </>
  );
}

function Empty({
  error,
  celebrate,
  pasteRef,
  onPasteInput,
  onFiles,
}: {
  error: string | null;
  celebrate: boolean;
  pasteRef: RefObject<HTMLTextAreaElement>;
  onPasteInput: (event: Event) => void;
  onFiles: (files: FileList | null) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [down, setDown] = useState({ mod: false, v: false });

  // A click anywhere puts the focus on a hidden field, so ⌘V reaches the
  // plugin. Without it, ⌘V lands on the canvas, which the plugin picks up too.
  const focusField = (event: MouseEvent) => {
    const target = event.target as HTMLElement;
    if (target.closest('button, a, input')) return;
    event.preventDefault();
    pasteRef.current?.focus();
  };

  // The keycaps press down with the real keys (when the plugin has focus).
  useEffect(() => {
    const update = (event: KeyboardEvent, pressed: boolean) => {
      // On a Mac, V sends no keyup while ⌘ is held: letting go of ⌘ releases both.
      if (event.key === 'Meta' || event.key === 'Control') setDown((d) => (pressed ? { ...d, mod: true } : { mod: false, v: false }));
      else if (event.key.toLowerCase() === 'v') setDown((d) => ({ ...d, v: pressed }));
    };
    const onDown = (event: KeyboardEvent) => update(event, true);
    const onUp = (event: KeyboardEvent) => update(event, false);
    const reset = () => setDown({ mod: false, v: false });
    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    window.addEventListener('blur', reset);
    return () => {
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
      window.removeEventListener('blur', reset);
    };
  }, []);

  return (
    <Screen
      onMouseDown={focusField}
      footer={
        <>
          <Button block variant="secondary" onClick={() => input.current?.click()}>
            Import ZIP or images
          </Button>
          <p class="dock__caption">or drop a Magpin ZIP anywhere</p>
          <input ref={input} type="file" accept=".zip,image/*" multiple hidden onChange={(event) => onFiles((event.target as HTMLInputElement).files)} />
        </>
      }
    >
      <div class="paste">
        <KeysBird mac={IS_MAC} down={down} celebrate={celebrate} />
        <h1 class="mp-display paste__title paste__in" style={{ '--i': 2 } as JSX.CSSProperties}>
          Paste your board
        </h1>
        <p class="paste__sub paste__in" style={{ '--i': 3 } as JSX.CSSProperties}>
          Copy a board with the Magpin extension, then press {PASTE_KEY} here or right on the canvas.
        </p>
        {error ? (
          <p class="notice paste__notice" role="alert">
            {error}
          </p>
        ) : null}
      </div>

      {/* Receives ⌘V when the plugin window has focus. */}
      <textarea ref={pasteRef} class="paste-target" aria-label="Paste your Magpin board here" spellcheck={false} onInput={onPasteInput} />
    </Screen>
  );
}

function collectionNameFor(title: string): string {
  return `Magpin / ${title}`;
}

const LAYOUTS: { value: LayoutKind; label: string }[] = [
  { value: 'grid', label: 'Grid' },
  { value: 'mosaic', label: 'Mosaic' },
  { value: 'groups', label: 'Colors' },
];
/** What each layout gives, said under the picker (for the chosen one). */
const LAYOUT_HINTS: Record<LayoutKind, string> = {
  grid: 'Same-size squares, row after row.',
  mosaic: 'Each image keeps its shape, in columns.',
  groups: 'Grouped by color, each group with its swatch.',
};

/** Height of the boards list once folded (`.preview-top.is-compact .boards` in ui.css). */
const BOARDS_FOLDED_MAX = 124;
/** The fade under the pinned block (`.preview-top::after`). */
const PINNED_FADE = 14;

function Preview({
  prepared,
  selected,
  error,
  excluded,
  onToggleBoard,
  settings,
  editor,
  collection,
  updateExisting,
  onUpdateExisting,
  onSettings,
  onCreate,
  onClear,
  compact,
  onCompact,
}: {
  /** As pasted: every board, listed. */
  prepared: Prepared;
  /** Without the boards left out: what gets built. */
  selected: Prepared;
  /** Why the last build failed, if it did. */
  error: string | null;
  excluded: ReadonlySet<number>;
  onToggleBoard: (index: number) => void;
  settings: Settings;
  editor: EditorType;
  collection: { name: string; exists: boolean } | null;
  updateExisting: boolean;
  onUpdateExisting: (value: boolean) => void;
  onSettings: (settings: Settings) => void;
  onCreate: () => void;
  onClear: () => void;
  /** Scrolled: the count sits in the top bar, the sketch and boards stay put. */
  compact: boolean;
  onCompact: (compact: boolean) => void;
}) {
  const count = selected.jobs.length;
  const pinned = useRef<HTMLDivElement>(null);
  const tally = useRef<HTMLDivElement>(null);
  const boardList = useRef<HTMLUListElement>(null);
  // A little scroll folds the count away; only back at the very top does it unfold.
  const onScroll = (event: Event) => {
    const screen = event.currentTarget as HTMLElement;
    const top = screen.scrollTop;
    if (compact) {
      if (top <= 0) onCompact(false);
      return;
    }
    if (top <= 12) return;
    // Folding takes the count (and a long list's extra rows) out of the page.
    // Fold only if there is still more than a nudge to scroll after that:
    // otherwise the scroll would clamp to the top and unfold it again.
    const shrink = (tally.current?.offsetHeight ?? 0) + Math.max(0, (boardList.current?.offsetHeight ?? 0) - BOARDS_FOLDED_MAX);
    if (screen.scrollHeight - screen.clientHeight > shrink + 12) onCompact(true);
  };
  // A setting reached with Tab never sits hidden under the pinned block.
  useLayoutEffect(() => {
    const block = pinned.current;
    const screen = block?.parentElement;
    if (!block || !screen) return;
    const fit = () => screen.style.setProperty('--pinned', `${Math.ceil(block.offsetHeight) + PINNED_FADE}px`);
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(block);
    return () => {
      observer.disconnect();
      screen.style.removeProperty('--pinned');
    };
  }, []);
  const kept = prepared.boards.length - excluded.size;
  const set = (patch: Partial<Settings>) => onSettings({ ...settings, ...patch });
  const canVariables = editor === 'figma';
  // The setting under the pointer (or focused) lights up its part of the sketch.
  // Kept apart: the pointer can leave a setting that keeps the focus, and back.
  const [hovered, setHovered] = useState<SketchPart | null>(null);
  const [focused, setFocused] = useState<SketchPart | null>(null);
  const part = hovered ?? focused;
  const about = (target: SketchPart) => ({
    onPointerEnter: () => setHovered(target),
    onPointerLeave: () => setHovered(null),
    onFocusIn: () => setFocused(target),
    onFocusOut: () => setFocused(null),
  });
  const layout = settings.layout;
  // The hint slides in when the layout changes, not when the preview opens.
  const firstLayout = useRef(layout);
  const layoutChanged = useRef(false);
  if (layout !== firstLayout.current) layoutChanged.current = true;
  const sketchBox = useRef<HTMLDivElement>(null);
  const [sketchWidth, setSketchWidth] = useState(0);
  useLayoutEffect(() => {
    const el = sketchBox.current;
    if (!el) return;
    const fit = () => setSketchWidth(el.clientWidth);
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return (
    <Screen
      onScroll={onScroll}
      footer={
        <>
          <Button block onClick={onCreate} disabled={count === 0}>
            Create moodboard
          </Button>
          <button type="button" class="mp-link dock__secondary" onClick={onClear}>
            Start over
          </button>
        </>
      }
    >
      {/* Fixed at the top: the sketch, the count (folded away once scrolled), the boards. */}
      <div ref={pinned} class={`preview-top${compact ? ' is-compact' : ''}`}>
      {/* The moodboard to come, in grey: columns, spacing, layout, palette. */}
      <div ref={sketchBox} class="sketch-box">
        {sketchWidth > 0 ? (
          <Sketch
            title={selected.title}
            layout={layout}
            columns={settings.columns}
            gap={settings.gap}
            sortByColor={settings.sortByColor}
            palette={settings.palette}
            paletteSize={settings.paletteSize}
            variables={canVariables && settings.variables}
            images={count}
            focus={part}
            width={sketchWidth - 24}
            height={128}
          />
        ) : null}
      </div>
      <div ref={tally} class="tally" aria-hidden={compact}>
        <div class="tally__in">
          <p class="mp-display mp-display--xl mp-num">{formatCount(count)}</p>
          <p class="mp-label">
            {count === 1 ? 'Image' : 'Images'}
            {selected.duplicates > 0 ? ` · ${pluralize(selected.duplicates, 'duplicate')} left out` : ''}
          </p>
        </div>
      </div>

      <ul ref={boardList} class="boards">
        {prepared.boards.map((board, index) => {
          const off = excluded.has(index);
          return (
            <li key={`${board.title}-${index}`} class={off ? 'is-off' : undefined}>
              {board.source ? <SourceIcon source={board.source} size={16} /> : null}
              <span class="boards__title">{board.title}</span>
              <span class="mp-num boards__count">{formatCount(board.count)}</span>
              {prepared.boards.length > 1 ? (
                <button
                  type="button"
                  class="boards__toggle"
                  aria-label={off ? `Put ${board.title} back` : `Leave out ${board.title}`}
                  // The last board left can't go: there would be nothing to build.
                  disabled={!off && kept <= 1}
                  onClick={() => onToggleBoard(index)}
                >
                  <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true">
                    <path d={off ? 'M6 2v8M2 6h8' : 'M2.5 2.5l7 7M9.5 2.5l-7 7'} />
                  </svg>
                </button>
              ) : null}
            </li>
          );
        })}
      </ul>
      </div>
      {error ? (
        <p class="notice preview__notice" role="alert">
          {error}
        </p>
      ) : null}
      {prepared.skipped > 0 ? <p class="mp-text mp-text--muted small">{pluralize(prepared.skipped, 'invalid item')} ignored.</p> : null}

      <div class="settings">
        {/* Layout: how the images are laid out in the section. */}
        <p class="settings__head">Layout</p>
        <div class="settings__layout">
          <Segmented label="Layout" value={settings.layout} options={LAYOUTS} onChange={(next) => set({ layout: next })} />
          <p class="settings__hint" aria-live="polite">
            <span key={layout} class={`settings__hint-text${layoutChanged.current ? ' is-new' : ''}`}>
              {LAYOUT_HINTS[layout]}
            </span>
          </p>
        </div>
        <Row label="Columns" {...about('columns')}>
          <Stepper
            value={settings.columns}
            min={GRID_LIMITS.columns.min}
            max={GRID_LIMITS.columns.max}
            step={1}
            labels={['Fewer columns', 'More columns']}
            onChange={(columns) => set({ columns })}
          />
        </Row>
        <Row label="Spacing" {...about('spacing')}>
          <Stepper
            value={settings.gap}
            min={GRID_LIMITS.gap.min}
            max={GRID_LIMITS.gap.max}
            step={4}
            suffix="px"
            labels={['Less spacing', 'More spacing']}
            onChange={(gap) => set({ gap })}
          />
        </Row>
        {settings.layout !== 'groups' ? (
          <Row label="Sort by color" {...about('sort')}>
            <Switch checked={settings.sortByColor} label="Sort by color" onChange={(sortByColor) => set({ sortByColor })} />
          </Row>
        ) : null}

        {/* Palette: the frame beside the section, one row per color. */}
        <div class="settings__head settings__head--switch" {...about('palette')}>
          <span>Palette</span>
          <Switch checked={settings.palette} label="Palette" onChange={(palette) => set({ palette })} />
        </div>
        {settings.palette ? (
          <Row label="Colors" {...about('palette')}>
            <Stepper
              value={settings.paletteSize}
              min={PALETTE_LIMITS.min}
              max={PALETTE_LIMITS.max}
              step={1}
              labels={['Fewer colors', 'More colors']}
              onChange={(paletteSize) => set({ paletteSize })}
            />
          </Row>
        ) : null}
        {settings.palette && canVariables ? (
          <Row label="Color variables" {...about('palette')}>
            <Switch checked={settings.variables} label="Color variables" onChange={(variables) => set({ variables })} />
          </Row>
        ) : null}
        {settings.palette && canVariables && settings.variables && collection?.exists ? (
          <div class="settings__note">
            <span class="mp-text mp-text--muted small-inline">
              <strong>{collection.name}</strong> is already in this file.
            </span>
            <Segmented
              label="Variable collection"
              value={updateExisting ? 'update' : 'new'}
              options={[
                { value: 'update', label: 'Update' },
                { value: 'new', label: 'New' },
              ]}
              onChange={(value) => onUpdateExisting(value === 'update')}
            />
          </div>
        ) : null}
      </div>
      {editor === 'figjam' ? <p class="mp-text mp-text--muted small">FigJam: layout and palette only, no color variables.</p> : null}
    </Screen>
  );
}

function Row({ label, children, ...handlers }: { label: string; children: ComponentChildren } & JSX.HTMLAttributes<HTMLDivElement>) {
  const id = useId();
  return (
    <div class="settings__row" role="group" aria-labelledby={id} {...handlers}>
      <span id={id} class="mp-label">
        {label}
      </span>
      {children}
    </div>
  );
}

function Stepper({
  value,
  min,
  max,
  step,
  suffix = '',
  labels,
  onChange,
}: {
  value: number;
  min: number;
  max: number;
  step: number;
  suffix?: string;
  /** The − and + buttons, said in words ("Fewer columns", "More columns"). */
  labels: [string, string];
  onChange: (value: number) => void;
}) {
  // The number rolls in from the side it moved to: up on +, down on −. Set
  // with the change, so an unrelated re-render can't cut the roll short.
  const [direction, setDirection] = useState<'up' | 'down' | null>(null);
  const move = (delta: number) => {
    const next = Math.min(max, Math.max(min, value + delta));
    if (next === value) return;
    setDirection(delta > 0 ? 'up' : 'down');
    onChange(next);
  };
  // At a limit the button says so but stays focusable (a disabled one would drop the focus).
  return (
    <span class="stepper">
      <button type="button" class="stepper__btn" aria-label={labels[0]} aria-disabled={value <= min} onClick={() => move(-step)}>
        −
      </button>
      <span class="stepper__value mp-num" aria-live="polite">
        <span key={value} class={direction ? `stepper__roll is-${direction}` : undefined}>
          {value}
          {suffix}
        </span>
      </span>
      <button type="button" class="stepper__btn" aria-label={labels[1]} aria-disabled={value >= max} onClick={() => move(step)}>
        +
      </button>
    </span>
  );
}

function Switch({ checked, label, onChange }: { checked: boolean; label: string; onChange: (checked: boolean) => void }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} class="switch" onClick={() => onChange(!checked)}>
      <span class="switch__thumb" />
    </button>
  );
}

function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  /** Accessible name of the group. */
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  // The black pill slides to the chosen option instead of jumping there.
  const root = useRef<HTMLSpanElement>(null);
  const [pill, setPill] = useState<{ x: number; width: number } | null>(null);
  const [ready, setReady] = useState(false);
  useLayoutEffect(() => {
    const active = root.current?.querySelector<HTMLElement>('[aria-checked="true"]');
    if (active) setPill({ x: active.offsetLeft, width: active.offsetWidth });
  }, [value]);
  // No slide on first paint: only when the choice changes.
  useEffect(() => {
    const frame = requestAnimationFrame(() => setReady(true));
    return () => cancelAnimationFrame(frame);
  }, []);
  // A radio group: Tab reaches the chosen option, the arrows (Home, End) choose.
  const onKeyDown = (event: KeyboardEvent) => {
    const at = options.findIndex((option) => option.value === value);
    const step = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 0;
    const next = step !== 0 ? (at + step + options.length) % options.length : event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1 : -1;
    if (next < 0) return;
    event.preventDefault();
    if (next !== at) onChange(options[next]!.value);
    root.current?.querySelectorAll<HTMLButtonElement>('[role="radio"]')[next]?.focus();
  };
  return (
    <span ref={root} class={`segmented${ready ? ' is-ready' : ''}`} role="radiogroup" aria-label={label} onKeyDown={onKeyDown}>
      {pill ? <span class="segmented__pill" style={{ width: `${pill.width}px`, transform: `translateX(${pill.x}px)` }} aria-hidden="true" /> : null}
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={option.value === value}
          tabIndex={option.value === value ? 0 : -1}
          class={`segmented__option${option.value === value ? ' is-active' : ''}`}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </span>
  );
}

const PHASES = ['loading', 'arranging', 'placing'] as const;
const PHASE_LABELS: Record<BuildProgress['phase'], string> = {
  loading: 'Loading images',
  arranging: 'Arranging',
  placing: 'Placing on the canvas',
};

/** Overall progress for the nest: loading is most of the work, then placing. */
function overallProgress(progress: BuildProgress): number {
  const ratio = progress.total ? progress.done / progress.total : 0;
  if (progress.phase === 'loading') return 0.85 * ratio;
  if (progress.phase === 'arranging') return 0.85;
  return 0.85 + 0.15 * ratio;
}

function Building({
  progress,
  images,
  nest,
  stopping,
  onStop,
}: {
  progress: BuildProgress;
  images: number;
  nest: NestMemory;
  stopping: boolean;
  onStop: () => void;
}) {
  const step = PHASES.indexOf(progress.phase);
  // Stop keeps what is loaded (or placed): pressed once, it waits for that.
  return (
    <Screen
      footer={
        <Button block variant="secondary" onClick={onStop} disabled={stopping || progress.phase === 'arranging'}>
          <span key={stopping ? 'stopping' : 'stop'} class={stopping ? 'mp-swap' : undefined}>
            {stopping ? 'Stopping…' : 'Stop'}
          </span>
        </Button>
      }
    >
      <div class="stage">
        <NestScene progress={overallProgress(progress)} images={images} memory={nest} />
        <p class="mp-display stage__count mp-num">
          {formatCount(progress.done)}
          <span class="of"> / {formatCount(progress.total)}</span>
        </p>
        <p class="stage__label">
          <span key={progress.phase} class="mp-swap">
            {PHASE_LABELS[progress.phase]}
          </span>
        </p>
        <span class="stage__steps" role="img" aria-label={`Step ${step + 1} of ${PHASES.length}`}>
          {PHASES.map((phase, i) => (
            <i key={phase} class={i < step ? 'is-done' : i === step ? 'is-current' : undefined} />
          ))}
        </span>
        {progress.failed > 0 ? <p class="stage__note mp-num">{pluralize(progress.failed, 'image')} couldn't load</p> : null}
      </div>
    </Screen>
  );
}

/** Why nothing reached the canvas (the moodboard section is removed then). */
function nothingPlaced(result: BuildResult, total: number): string {
  if (result.cancelled) return 'Stopped before any image was placed.';
  if (result.error) return 'Figma ran into a problem while placing the images.';
  if (result.failed >= total) return total === 1 ? "The image couldn't be loaded." : `None of the ${formatCount(total)} images could be loaded.`;
  return 'There was no image left to place.';
}

function Done({ prepared, result, nest, onAgain }: { prepared: Prepared; result: BuildResult; nest: NestMemory; onAgain: () => void }) {
  const unfinished = result.cancelled || result.error !== null;
  const title = result.placed === 0 ? 'Nothing placed' : unfinished ? 'Stopped' : 'Done';
  return (
    <Screen
      footer={
        <Button block variant={result.placed === 0 ? 'primary' : 'secondary'} onClick={onAgain}>
          New moodboard
        </Button>
      }
    >
      <div class="stage stage--done">
        {result.placed > 0 ? <NestScene progress={1} images={prepared.jobs.length} memory={nest} complete={!unfinished} stopped={unfinished} /> : null}
        <h1 class="mp-display stage__title">{title}</h1>
        <p class="stage__sub">
          {result.placed > 0 ? (
            <>
              {pluralize(result.placed, 'image')} placed in <strong>Moodboard — {prepared.title}</strong>
            </>
          ) : (
            nothingPlaced(result, prepared.jobs.length)
          )}
        </p>
      </div>
      {result.error ? (
        <p class="notice" role="alert">
          Figma stopped with this error: {result.error}
          {result.placed > 0 ? ' What was placed stays on the canvas.' : ''}
        </p>
      ) : null}
      <ul class="facts">
        {result.duplicates > 0 ? <li>{pluralize(result.duplicates, 'duplicate')} left out</li> : null}
        {result.failed > 0 ? <li>{pluralize(result.failed, 'image')} couldn't load</li> : null}
        {result.variables ? (
          <li>
            {pluralize(result.variables.count, 'color variable')} in <strong>{result.variables.collectionName}</strong>
          </li>
        ) : null}
      </ul>
      {result.palettes.map((palette, index) => (
        <div class="palette-block" key={index}>
          {result.palettes.length > 1 ? (
            <p class="mp-label palette-block__title">
              {palette.source ? <SourceIcon source={palette.source} size={12} /> : null}
              {palette.title}
            </p>
          ) : null}
          <div class="palette" role="group" aria-label={`Palette of ${palette.title}`}>
            {palette.colors.map((color) => (
              <span class="palette__chip" key={color.hex} title={`${color.name} ${color.hex}`}>
                <span class="palette__swatch" style={{ background: color.hex }} />
                <span class="palette__hex mp-num">{color.hex}</span>
              </span>
            ))}
          </div>
        </div>
      ))}
      {result.blockedByCdn > 0 ? (
        <p class="notice">
          Some images can't be downloaded from inside Figma. In the extension, use <strong>Download ZIP</strong>, then drop the ZIP here.
        </p>
      ) : null}
    </Screen>
  );
}
