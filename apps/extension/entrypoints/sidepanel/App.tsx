import { createPayload, encodePayload } from '@magpin/core';
import type { SourceId } from '@magpin/core';
import { Button, Magpie, ProgressBar, SourceIcon, formatCount, pluralize } from '@magpin/ui';
import type { ComponentChildren, JSX } from 'preact';
import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { browser } from 'wxt/browser';
import { AppIcon } from '@/src/AppIcon';
import { type CartBoard, buildExport, displayTitle, selectedItems as selectedOf } from '@/src/cart';
import { copyText } from '@/src/clipboard';
import { PASTE_SHORTCUT } from '@/src/config';
import { friendlyError } from '@/src/errors';
import { scanEnding } from '@/src/progress';
import { itemNoun, sourceLabel } from '@/src/sources';
import type { SkipCounts } from '@/src/sources/types';
import { type ZipProgress, exportZip } from '@/src/zip';
import { Intro } from './Intro';
import { Delivery, type Notice, Peek } from './Peek';
import { Collect } from './Collect';
import { ThumbGrid } from './ThumbGrid';
import { type KnownBoard, useBoardSession } from './useBoardSession';
import { useCart } from './useCart';

type Busy = { kind: 'idle' } | { kind: 'copying' } | { kind: 'zipping'; progress: ZipProgress };

export function App() {
  const cart = useCart();
  const { state, stop, rescan, start, restore, remember } = useBoardSession({
    ready: cart.loaded,
    lookup: (url) => {
      const board = cart.find(url);
      return board ? cartAsKnown(board) : null;
    },
    onRead: cart.applyReading,
  });
  const { phase, meta, items, skipped } = state;

  // Selection is stored as the set of *deselected* ids, so items that stream
  // in during collection are selected by default.
  const [deselected, setDeselected] = useState<Set<string>>(() => new Set());
  const [busy, setBusy] = useState<Busy>({ kind: 'idle' });

  // One live region for the whole panel: messages put in a fresh role=status
  // element, already filled, are often not read out.
  const [said, setSaid] = useState('');
  const announce = useCallback((text: string) => {
    // Emptied first, so the same words twice are read twice.
    setSaid('');
    requestAnimationFrame(() => setSaid(text));
  }, []);

  const [notice, setNoticeState] = useState<{ id: number; notice: Notice } | null>(null);
  const [delivery, setDelivery] = useState<{ id: number; title: string; detail: string } | null>(null);
  // Ids only go up, so a closing notice can never be mistaken for a new one.
  const ids = useRef(0);
  const setNotice = (next: Notice | null) => {
    if (next) {
      setDelivery(null);
      announce([next.title, next.detail].filter(Boolean).join('. '));
    }
    setNoticeState(next ? { id: ++ids.current, notice: next } : null);
  };
  // Pulses the moodboard count when the bird drops a board in.
  const [bump, setBump] = useState(0);
  const [cartOpen, setCartOpen] = useState(false);
  const zipController = useRef<AbortController | null>(null);
  const dockRef = useDockHeight();

  const boardKey = state.boardUrl;
  const cartEntry = cart.boards.find((board) => board.key === boardKey) ?? null;

  // New board: start from the selection saved with it (in the moodboard, or
  // when it was read earlier in this panel).
  const restoredFor = useRef<string | null>(null);
  useEffect(() => {
    if (restoredFor.current === boardKey) return;
    restoredFor.current = boardKey;
    setDeselected(new Set(cartEntry?.deselected ?? state.deselected));
  }, [boardKey, cartEntry, state.deselected]);

  // A board that turns up in the moodboard while shown as new (added from
  // another window): it was read there, show it as it is.
  useEffect(() => {
    if (phase !== 'found' || !cartEntry || !boardKey) return;
    restore(boardKey, cartAsKnown(cartEntry));
  }, [phase, cartEntry, boardKey, restore]);

  /** The user changed the selection: it is kept with the board, and follows into the moodboard. */
  const changeSelection = (next: Set<string>) => {
    setDeselected(next);
    if (!boardKey) return;
    const off = [...next];
    remember(boardKey, off);
    if (cartEntry) cart.select(boardKey, off);
  };

  const selectedItems = useMemo(() => items.filter((item) => !deselected.has(item.id)), [items, deselected]);

  // The board on screen, as a cart entry (live selection).
  const liveBoard = useMemo<CartBoard | null>(
    () =>
      phase === 'ready' && meta && boardKey && items.length > 0
        ? { key: boardKey, source: meta.source, title: meta.title, url: meta.url, items, deselected: [...deselected], addedAt: Date.now() }
        : null,
    [phase, meta, boardKey, items, deselected],
  );
  const pending = liveBoard && !cartEntry ? liveBoard : null;

  // What "Copy" and "ZIP" export: the moodboard, plus the board on screen if not added yet.
  const exportBoards = useMemo(() => (pending ? [...cart.boards, pending] : cart.boards), [cart.boards, pending]);
  const summary = useMemo(() => buildExport(exportBoards), [exportBoards]);

  const collecting = phase === 'collecting';
  const exportable = !collecting && busy.kind === 'idle' && summary.total > 0;
  const offerClear = (notice: Notice): Notice => (cart.boards.length > 0 ? { ...notice, action: { label: 'Clear moodboard', run: () => cart.clear() } } : notice);

  // The button says "Copied" for a moment after a copy.
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1600);
    return () => clearTimeout(timer);
  }, [copied]);

  const onCopy = async () => {
    setBusy({ kind: 'copying' });
    try {
      // Each board whole: the plugin removes the duplicates, and puts shared
      // images back in a board when another one is left out.
      await copyText(encodePayload(createPayload(summary.copy)));
      setCopied(true);
      setNotice(offerClear({ mood: 'wink', title: `Copied ${pluralize(summary.total, 'image')}`, detail: `In Figma, run Magpin and press ${PASTE_SHORTCUT}.` }));
    } catch {
      setNotice({ mood: 'hmm', title: 'Clipboard out of reach', detail: 'Click inside the panel and try again.' });
    } finally {
      setBusy({ kind: 'idle' });
    }
  };

  const onZip = async () => {
    const controller = new AbortController();
    zipController.current = controller;
    setNotice(null);
    setBusy({ kind: 'zipping', progress: { done: 0, total: summary.total, failed: 0 } });
    try {
      const result = await exportZip(summary.zip, (progress) => setBusy({ kind: 'zipping', progress }), controller.signal);
      if (result.written === 0) {
        setNotice({ mood: 'hmm', title: 'No image could be downloaded', detail: 'Check your connection, then try again.' });
      } else {
        const failed = result.failed > 0 ? `${pluralize(result.failed, 'image')} couldn't be downloaded.` : undefined;
        setNotice(offerClear({ mood: 'wink', title: `Saved ${result.fileName}`, ...(failed ? { detail: failed } : {}) }));
      }
    } catch (error) {
      setNotice(
        controller.signal.aborted
          ? { mood: 'hmm', title: 'ZIP cancelled' }
          : { mood: 'hmm', title: 'ZIP failed', detail: friendlyError(error, 'Something went wrong while saving it. Try again.') },
      );
    } finally {
      zipController.current = null;
      setBusy({ kind: 'idle' });
    }
  };

  const toggleInCart = () => {
    if (cartEntry) {
      cart.remove(cartEntry.key);
      setDelivery(null);
      announce('Removed from moodboard');
      return;
    }
    if (!liveBoard) return;
    cart.upsert(liveBoard);
    setNoticeState(null);
    const detail = `${pluralize(cart.boards.length + 1, 'board')} · ${pluralize(summary.total, 'image')}`;
    setDelivery({ id: ++ids.current, title: 'Added to moodboard', detail });
    announce(`Added to moodboard. ${detail}`);
  };

  const dock = (
    <footer ref={dockRef} class="dock">
      {/* On the moodboard screen the list is the page itself: no bar for it. */}
      {phase !== 'unsupported' && cart.boards.length > 0 ? (
        <CartBar
          open={cartOpen}
          onToggle={() => setCartOpen((open) => !open)}
          boards={cart.boards}
          pending={pending}
          onAddPending={toggleInCart}
          onRenamePending={(title) => liveBoard && cart.upsert({ ...liveBoard, ...(title && title !== liveBoard.title ? { customTitle: title } : {}) })}
          onRename={cart.rename}
          currentKey={boardKey}
          totals={summary}
          boardCount={exportBoards.length}
          onRemove={cart.remove}
          onClear={cart.clear}
          bump={bump}
        />
      ) : null}
      {liveBoard && !collecting ? (
        <button type="button" class={`dock__add${cartEntry ? ' is-added' : ''}`} aria-label={cartEntry ? 'Remove from moodboard' : 'Add to moodboard'} onClick={toggleInCart}>
          {cartEntry ? (
            <span key="in" class="mp-swap">
              <CheckIcon /> In moodboard
            </span>
          ) : (
            <span key="add" class="mp-swap">
              <PlusIcon /> Add to moodboard
            </span>
          )}
        </button>
      ) : null}
      <Button block disabled={!exportable} onClick={onCopy}>
        {copied ? (
          <span key="copied" class="mp-swap">
            <CheckIcon /> Copied
          </span>
        ) : (
          <span key="copy" class="mp-swap">
            {busy.kind === 'copying' ? 'Copying…' : 'Copy for Figma'}
          </span>
        )}
      </Button>
      {busy.kind === 'zipping' ? (
        <div class="dock__zip">
          <ProgressBar value={busy.progress.total ? busy.progress.done / busy.progress.total : null} label="Building ZIP" />
          <div class="collect__row">
            <span class="mp-label mp-num">
              Zipping {formatCount(busy.progress.done)} / {formatCount(busy.progress.total)}
            </span>
            <button type="button" class="mp-link" onClick={() => zipController.current?.abort()}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <Button block variant="secondary" disabled={!exportable} onClick={onZip}>
          Download ZIP
        </Button>
      )}

      {/* Inside the dock: the bird peeks over its top edge. */}
      {notice ? <Peek key={notice.id} notice={notice.notice} onClose={() => setNoticeState((current) => (current?.id === notice.id ? null : current))} /> : null}
      {delivery ? (
        <Delivery
          key={delivery.id}
          title={delivery.title}
          detail={delivery.detail}
          onDrop={() => setBump((count) => count + 1)}
          onClose={() => setDelivery((current) => (current?.id === delivery.id ? null : current))}
        />
      ) : null}
    </footer>
  );

  const expected = meta?.expectedCount ?? null;
  const noun = meta ? itemNoun(meta.source) : 'item';
  const reading = state.reading;
  // What the reading looked at that the page's own count takes in: images and videos (ads are extra).
  const scanned = reading ? reading.found + reading.skipped.video : 0;
  const partial = phase === 'ready' && reading !== null && scanEnding({ found: reading.found, scanned, expected, stopped: reading.stopped }) === 'partial';

  const screen = (): JSX.Element => {
    if (phase === 'detecting') return <Shell />;

    if (phase === 'unsupported') {
      if (cart.boards.length === 0) {
        return (
          <Shell>
            <Intro />
          </Shell>
        );
      }
      return (
        <Shell>
          <section class="hero">
            <h1 class="mp-display">Your moodboard</h1>
            <p class="mp-label hero__meta mp-num">
              {pluralize(cart.boards.length, 'board')} · {pluralize(summary.total, 'image')}
            </p>
          </section>
          <CartList boards={cart.boards} currentKey={null} onRemove={cart.remove} onRename={cart.rename} />
          <p class="mp-text mp-text--muted cart-hint">Open another board to add it.</p>
          {dock}
        </Shell>
      );
    }

    if (phase === 'error') {
      return (
        <Shell>
          <section class="hero">
            <h1 class="mp-display">Couldn't read this page</h1>
            <p class="mp-text mp-text--muted hero__sub">{state.error ?? 'Reload the board, then try again.'}</p>
            <div class="hero__actions">
              <Button onClick={rescan}>Try again</Button>
            </div>
          </section>
          {dock}
        </Shell>
      );
    }

    // A new board: shown, not read until the user asks.
    if (phase === 'found') {
      return (
        <Shell source={meta?.source}>
          <section class="hero">
            <h1 class="mp-display hero__title" title={meta?.title}>
              {meta?.title ?? 'This board'}
            </h1>
            <p class="mp-label hero__meta mp-num">{expected ? `${pluralize(expected, noun)} on this board` : 'Ready when you are'}</p>
          </section>
          <section class="found">
            <div class="found__line" aria-hidden="true">
              <Magpie size={28} class="found__bird" wake />
              <ProgressBar value={0} label="Not read yet" />
            </div>
            <Button onClick={start}>Collect this board</Button>
            <p class="mp-text mp-text--muted found__hint">Magpin reads every image on it, at full size.</p>
          </section>
          {dock}
        </Shell>
      );
    }

    return (
      <Shell source={meta?.source}>
        <section class="hero">
          <h1 class="mp-display hero__title" title={meta?.title}>
            {cartEntry ? displayTitle(cartEntry) : (meta?.title ?? 'Reading board')}
          </h1>
          <p class="mp-label hero__meta">
            <span class="mp-num">{pluralize(items.length, 'image')}</span>
            <SkipNote skipped={skipped} />
            {collecting ? null : state.stopped ? (
              <span> · Stopped early</span>
            ) : partial && expected ? (
              <span class="mp-num">
                {' '}
                · Found {formatCount(scanned)} of {pluralize(expected, noun)}
              </span>
            ) : null}
            {/* Reading again needs the board in the active tab. */}
            {!collecting && items.length > 0 && state.onBoard ? (
              <>
                {' · '}
                <button type="button" class="hero__rescan" onClick={rescan} disabled={busy.kind !== 'idle'}>
                  Scan again
                </button>
              </>
            ) : null}
          </p>
        </section>

        <Collect
          key={`${boardKey}:${state.scan}`}
          collecting={collecting}
          count={reading?.found ?? items.length}
          scanned={scanned}
          expected={expected}
          noun={noun}
          stopped={reading?.stopped ?? false}
          onStop={stop}
          announce={announce}
        />

        {items.length > 0 ? (
          <>
            <div class="toolbar">
              {/* Quiet while collecting: every batch would be read out. */}
              <span class="toolbar__count mp-num" aria-live={collecting ? 'off' : 'polite'}>
                <strong>{formatCount(selectedItems.length)}</strong> / {formatCount(items.length)} selected
              </span>
              <span class="toolbar__actions">
                <button type="button" class="mp-link" disabled={deselected.size === 0} onClick={() => changeSelection(new Set())}>
                  All
                </button>
                <button type="button" class="mp-link" disabled={selectedItems.length === 0} onClick={() => changeSelection(new Set(items.map((item) => item.id)))}>
                  None
                </button>
              </span>
            </div>
            <ThumbGrid items={items} deselected={deselected} onChange={changeSelection} />
          </>
        ) : !collecting ? (
          <section class="hero hero--empty">
            <p class="mp-text mp-text--muted">No images found on this board.</p>
            {state.onBoard ? (
              <div class="hero__actions">
                <Button variant="secondary" onClick={rescan}>
                  Scan again
                </Button>
              </div>
            ) : null}
          </section>
        ) : null}

        {dock}
      </Shell>
    );
  };

  return (
    <>
      {screen()}
      <p class="sr-only" aria-live="polite" aria-atomic="true">
        {said}
      </p>
    </>
  );
}

/** A board of the moodboard, as the session shows it. */
function cartAsKnown(board: CartBoard): KnownBoard {
  return { meta: { source: board.source, title: board.title, url: board.url, expectedCount: null }, items: board.items, deselected: board.deselected };
}

/**
 * Keeps `--dock-h` on the root at the dock's height (it grows with the
 * moodboard bar), so the page leaves room for it at the bottom.
 */
function useDockHeight() {
  const observed = useRef<{ dock: HTMLElement; observer: ResizeObserver } | null>(null);
  return useCallback((dock: HTMLElement | null) => {
    const root = document.documentElement;
    if (dock) {
      if (observed.current?.dock === dock) return;
      observed.current?.observer.disconnect();
      const sync = () => root.style.setProperty('--dock-h', `${Math.ceil(dock.getBoundingClientRect().height)}px`);
      const observer = new ResizeObserver(sync);
      observer.observe(dock);
      observed.current = { dock, observer };
      sync();
      return;
    }
    // Let go of while still in the page: once the render is over, clear it
    // unless the next screen's dock took over.
    queueMicrotask(() => {
      const current = observed.current;
      if (!current || current.dock.isConnected) return;
      current.observer.disconnect();
      observed.current = null;
      root.style.removeProperty('--dock-h');
    });
  }, []);
}

/** A link that opens a board in the current tab (Cmd/Ctrl+click: a new one, as links do). */
function openInTab(event: JSX.TargetedMouseEvent<HTMLAnchorElement>, url: string) {
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  void browser.tabs.update({ url });
}

function CartBar({
  open,
  onToggle,
  boards,
  pending,
  onAddPending,
  onRenamePending,
  onRename,
  currentKey,
  totals,
  boardCount,
  onRemove,
  onClear,
  bump,
}: {
  open: boolean;
  onToggle: () => void;
  boards: CartBoard[];
  /** The board on screen when it is not in the cart: exported too, shown so the count adds up. */
  pending: CartBoard | null;
  onAddPending: () => void;
  /** Renaming the board on screen adds it to the moodboard under that name. */
  onRenamePending: (title: string) => void;
  onRename: (key: string, title: string) => void;
  currentKey: string | null;
  totals: { total: number; duplicates: number };
  boardCount: number;
  onRemove: (key: string) => void;
  onClear: () => void;
  /** Changes when a board is dropped in: the count pulses. */
  bump: number;
}) {
  // Pulses for drops that happen while it's on screen, not on its way in.
  const firstBump = useRef(bump);
  const bumped = bump !== firstBump.current;
  return (
    <div class={`cartbar${open ? ' is-open' : ''}`}>
      <button type="button" class="cartbar__head" aria-expanded={open} onClick={onToggle}>
        <span class="mp-label cartbar__title">Moodboard</span>
        <span key={bump} class={`cartbar__count mp-num${bumped ? ' is-bumped' : ''}`}>
          {pluralize(boardCount, 'board')} · {pluralize(totals.total, 'image')}
          {totals.duplicates > 0 ? ` · ${pluralize(totals.duplicates, 'duplicate')} left out` : ''}
        </span>
        <svg class="cartbar__chevron" viewBox="0 0 12 12" width="12" height="12" aria-hidden="true">
          <path d="M3 4.5 6 7.5 9 4.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </button>
      {open ? (
        <div class="cartbar__body">
          <CartList boards={boards} currentKey={currentKey} onRemove={onRemove} onRename={onRename} compact />
          {pending ? <PendingRow board={pending} onAdd={onAddPending} onRename={onRenamePending} /> : null}
          {boards.length > 0 ? (
            <button type="button" class="mp-link cartbar__clear" onClick={onClear}>
              Clear moodboard
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function CartList({
  boards,
  currentKey,
  onRemove,
  onRename,
  compact = false,
}: {
  boards: CartBoard[];
  currentKey: string | null;
  onRemove: (key: string) => void;
  onRename: (key: string, title: string) => void;
  compact?: boolean;
}) {
  return (
    <ul class={`cartlist${compact ? ' cartlist--compact' : ''}`} aria-label="Boards in the moodboard">
      {boards.map((board) => {
        const selected = selectedOf(board);
        const cover = selected[0] ?? board.items[0];
        return (
          <li key={board.key} class="cartlist__row">
            <a
              class="cartlist__coverbtn"
              href={board.url}
              aria-label={`Open ${displayTitle(board)} on ${sourceLabel(board.source)}`}
              title={`Open on ${sourceLabel(board.source)}`}
              onClick={(event) => openInTab(event, board.url)}
            >
              <Cover thumbUrl={cover?.thumbUrl} source={board.source} />
            </a>
            <span class="cartlist__text">
              <TitleField value={displayTitle(board)} original={board.title} onCommit={(title) => onRename(board.key, title)} />
              <span class="cartlist__meta mp-num">
                {sourceLabel(board.source)} · {formatCount(selected.length)} / {formatCount(board.items.length)}
                {board.key === currentKey ? ' · this board' : ''}
              </span>
            </span>
            <button type="button" class="cartlist__remove" aria-label={`Remove ${displayTitle(board)}`} onClick={() => onRemove(board.key)}>
              <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true">
                <path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
              </svg>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Board title, editable in place: click, type, Enter (or click away) to keep,
 * Esc to cancel. Emptying it goes back to the board's own title.
 */
function TitleField({ value, original, onCommit }: { value: string; original: string; onCommit: (title: string) => void }) {
  const [draft, setDraft] = useState(value);
  const editing = useRef(false);
  useEffect(() => {
    if (!editing.current) setDraft(value);
  }, [value]);
  const commit = () => {
    editing.current = false;
    const next = draft.replace(/\s+/g, ' ').trim();
    if (!next) setDraft(original);
    if (next !== value) onCommit(next);
  };
  return (
    <input
      class="cartlist__title"
      value={draft}
      aria-label="Board title"
      title="Rename this board"
      spellcheck={false}
      maxLength={120}
      onFocus={(event) => {
        editing.current = true;
        (event.currentTarget as HTMLInputElement).select();
      }}
      onInput={(event) => setDraft((event.currentTarget as HTMLInputElement).value)}
      onBlur={commit}
      onKeyDown={(event) => {
        const input = event.currentTarget as HTMLInputElement;
        if (event.key === 'Enter') input.blur();
        if (event.key === 'Escape') {
          setDraft(value);
          editing.current = false;
          requestAnimationFrame(() => input.blur());
        }
      }}
    />
  );
}

function PendingRow({ board, onAdd, onRename }: { board: CartBoard; onAdd: () => void; onRename: (title: string) => void }) {
  const selected = selectedOf(board);
  const cover = selected[0] ?? board.items[0];
  return (
    <div class="cartlist__row cartlist__row--pending">
      <span class="cartlist__coverbtn">
        <Cover thumbUrl={cover?.thumbUrl} source={board.source} />
      </span>
      <span class="cartlist__text">
        <TitleField value={displayTitle(board)} original={board.title} onCommit={onRename} />
        <span class="cartlist__meta mp-num">
          {sourceLabel(board.source)} · {formatCount(selected.length)} / {formatCount(board.items.length)} · not added
        </span>
      </span>
      <button type="button" class="mp-link" onClick={onAdd}>
        Add
      </button>
    </div>
  );
}

/** Board cover with the mark of its source in the corner. */
function Cover({ thumbUrl, source }: { thumbUrl: string | undefined; source: SourceId }) {
  return (
    <span class="cover">
      {thumbUrl ? <img src={thumbUrl} alt="" class="cartlist__cover" /> : <span class="cartlist__cover" />}
      <span class="cover__badge">
        <SourceIcon source={source} size={12} decorative />
      </span>
    </span>
  );
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 12 12" width="11" height="11" aria-hidden="true">
      <path d="M6 2v8M2 6h8" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 12 12" width="11" height="11" aria-hidden="true">
      <path d="M2.5 6.2 4.9 8.5 9.5 3.6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
  );
}

function Shell({ source, children }: { source?: SourceId | undefined; children?: ComponentChildren }) {
  return (
    <div class="app">
      <header class="topbar">
        <span class="brand">
          <AppIcon size={30} />
          <span class="brand__name">Magpin</span>
        </span>
        {source ? (
          <span class="topbar__source mp-label">
            <SourceIcon source={source} size={14} decorative />
            {sourceLabel(source)}
          </span>
        ) : null}
      </header>
      {children}
    </div>
  );
}

function SkipNote({ skipped }: { skipped: SkipCounts }) {
  const parts: string[] = [];
  if (skipped.video) parts.push(pluralize(skipped.video, 'video'));
  if (skipped.sponsored) parts.push(`${formatCount(skipped.sponsored)} sponsored`);
  if (parts.length === 0) return null;
  return <span class="mp-num"> · {parts.join(', ')} skipped</span>;
}
