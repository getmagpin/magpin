/**
 * Follows the active tab and runs the collector on supported boards.
 *
 * - Panel opens on a board, or the tab moves to a new board: the panel shows
 *   it (title, source, count) and waits; reading starts when the user asks.
 * - A board already read in this panel, or already in the moodboard, shows
 *   its images straight away, with no new reading.
 * - Tab moves to a page Magpin can't read: keep what was collected (stopping
 *   any collection in progress), so the user can still copy it.
 */
import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import { type Browser, browser } from 'wxt/browser';
import { type Reading, itemsAfterReading } from '@/src/cart';
import { friendlyError } from '@/src/errors';
import { COLLECT_PORT, type PageToPanel, type PanelToPage } from '@/src/messaging';
import { findSource } from '@/src/sources';
import { canonicalBoardUrl } from '@/src/sources/pinterest/match';
import { type BoardMeta, type CollectedItem, type SkipCounts, emptySkips } from '@/src/sources/types';

/** `found`: a board is open and ready to be read, not read yet. */
export type SessionPhase = 'detecting' | 'unsupported' | 'found' | 'collecting' | 'ready' | 'error';

/** The last reading's own numbers, for its progress line and its ending. */
export interface ReadingStats {
  /** Images found. */
  found: number;
  skipped: SkipCounts;
  stopped: boolean;
}

export interface SessionState {
  phase: SessionPhase;
  boardUrl: string | null;
  meta: BoardMeta | null;
  /** The board's images on screen. */
  items: CollectedItem[];
  skipped: SkipCounts;
  stopped: boolean;
  /**
   * The reading in progress or just ended; null when the board came back
   * without one. Can say fewer than `items`: a reading stopped early keeps
   * the earlier, longer list on screen.
   */
  reading: ReadingStats | null;
  /** Ids left out of the selection saved with the board, to start from. */
  deselected: string[];
  /** The active tab shows this board, so it can be read again. */
  onBoard: boolean;
  error: string | null;
  /** Goes up with each reading, so what shows its progress starts over. */
  scan: number;
}

/** A board read earlier, to show again without reading it again. */
export interface KnownBoard {
  meta: BoardMeta;
  items: CollectedItem[];
  skipped?: SkipCounts;
  stopped?: boolean;
  deselected?: string[];
}

export interface SessionOptions {
  /** False until the moodboard is loaded: a board in it must never show as new, even for a frame. */
  ready: boolean;
  /** A board of the moodboard, to show without reading it again. */
  lookup: (boardUrl: string) => KnownBoard | null;
  /** A reading ended: its items as read, before any earlier list was kept. */
  onRead: (boardUrl: string, reading: Reading) => void;
}

const INITIAL: SessionState = {
  phase: 'detecting',
  boardUrl: null,
  meta: null,
  items: [],
  skipped: emptySkips(),
  stopped: false,
  reading: null,
  deselected: [],
  onBoard: false,
  error: null,
  scan: 0,
};

const READ_FAILED = 'Reload the board, then try again.';

export function useBoardSession(options: SessionOptions) {
  const [state, setState] = useState<SessionState>(INITIAL);
  const stateRef = useRef(state);
  stateRef.current = state;
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const portRef = useRef<Browser.runtime.Port | null>(null);
  // Boards read in this panel, and the selection made on each, by canonical URL.
  const read = useRef(new Map<string, KnownBoard>());
  const selections = useRef(new Map<string, string[]>());
  // Goes up whenever the port in use is let go, so a connect still on its way
  // (waiting for the script to be injected) knows something else took over.
  const generation = useRef(0);
  // Goes up with each look at the active tab: after quick tab switches, only
  // the latest look acts.
  const looks = useRef(0);

  const disconnect = useCallback(() => {
    generation.current++;
    const port = portRef.current;
    portRef.current = null;
    if (!port) return;
    try {
      port.postMessage({ type: 'stop' } satisfies PanelToPage);
      port.disconnect();
    } catch {
      // already closed
    }
  }, []);

  /** A reading ended (or the page went away mid-way): show it, remember it. */
  const finish = useCallback((boardUrl: string, ended: { meta: BoardMeta | null; items: CollectedItem[]; skipped: SkipCounts; stopped: boolean }) => {
    const meta = ended.meta ?? stateRef.current.meta;
    const before = read.current.get(boardUrl) ?? optionsRef.current.lookup(boardUrl);
    // A reading stopped early never shrinks a board read before: the earlier list stays on screen.
    const kept = before && itemsAfterReading(before.items, ended) !== ended.items ? before : null;
    const shown = kept
      ? { items: kept.items, skipped: kept.skipped ?? emptySkips(), stopped: kept.stopped ?? false }
      : { items: ended.items, skipped: ended.skipped, stopped: ended.stopped };
    if (kept) read.current.set(boardUrl, kept);
    else if (meta) read.current.set(boardUrl, { meta, ...shown });
    setState((s) => ({
      ...s,
      phase: 'ready',
      meta: meta ?? s.meta,
      ...shown,
      reading: { found: ended.items.length, skipped: ended.skipped, stopped: ended.stopped },
    }));
    if (meta) optionsRef.current.onRead(boardUrl, { title: meta.title, url: meta.url, items: ended.items, stopped: ended.stopped });
  }, []);

  /** Injects the collector and opens its port; reads the board only if `start`. */
  const connect = useCallback(
    async (tabId: number, url: string, start: boolean) => {
      disconnect();
      const mine = generation.current;
      const boardUrl = canonicalBoardUrl(url);
      setState((s) => ({
        ...INITIAL,
        phase: start ? 'collecting' : 'found',
        boardUrl,
        onBoard: true,
        reading: start ? { found: 0, skipped: emptySkips(), stopped: false } : null,
        scan: start ? s.scan + 1 : s.scan,
      }));
      try {
        await browser.scripting.executeScript({ target: { tabId }, files: ['/content-scripts/collector.js'] });
      } catch (error) {
        if (mine === generation.current) setState((s) => ({ ...s, phase: 'error', error: friendlyError(error, READ_FAILED) }));
        return;
      }
      // Another board, a board restored or the panel closing took over meanwhile.
      if (mine !== generation.current) return;

      const port = browser.tabs.connect(tabId, { name: COLLECT_PORT });
      portRef.current = port;
      port.onMessage.addListener((message: PageToPanel) => {
        if (portRef.current !== port) return;
        switch (message.type) {
          case 'meta':
            setState((s) => ({ ...s, meta: message.meta }));
            break;
          case 'unsupported':
            setState((s) => ({ ...s, phase: 'unsupported' }));
            break;
          case 'progress':
            setState((s) => ({
              ...s,
              items: [...s.items, ...message.newItems],
              skipped: message.skipped,
              reading: { found: message.found, skipped: message.skipped, stopped: false },
            }));
            break;
          case 'done':
            portRef.current = null;
            port.disconnect();
            finish(boardUrl, message);
            break;
          case 'error':
            setState((s) => ({ ...s, phase: 'error', error: friendlyError(message.message, READ_FAILED) }));
            break;
        }
      });
      port.onDisconnect.addListener(() => {
        if (portRef.current !== port) return;
        portRef.current = null;
        // The page went away mid-collection (reload, navigation): keep what we have.
        const current = stateRef.current;
        if (current.phase === 'collecting') finish(boardUrl, { meta: null, items: current.items, skipped: current.skipped, stopped: true });
      });
      if (start) port.postMessage({ type: 'start' } satisfies PanelToPage);
    },
    [disconnect, finish],
  );

  const stop = useCallback(() => {
    const port = portRef.current;
    if (!port) return;
    // The content script answers with `done` and the partial list.
    port.postMessage({ type: 'stop' } satisfies PanelToPage);
  }, []);

  /** Shows a board read earlier as it was, without reading it again. */
  const restore = useCallback(
    (boardUrl: string, known: KnownBoard) => {
      disconnect();
      read.current.set(boardUrl, known);
      setState((s) => ({
        ...INITIAL,
        phase: 'ready',
        boardUrl,
        meta: known.meta,
        items: known.items,
        skipped: known.skipped ?? emptySkips(),
        stopped: known.stopped ?? false,
        deselected: selections.current.get(boardUrl) ?? known.deselected ?? [],
        onBoard: true,
        scan: s.scan,
      }));
    },
    [disconnect],
  );

  /** Keeps the selection made on a board (even mid-reading), for when it comes back. */
  const remember = useCallback((boardUrl: string, deselected: string[]) => {
    selections.current.set(boardUrl, deselected);
  }, []);

  const inspectActiveTab = useCallback(
    async (force = false) => {
      const look = ++looks.current;
      const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
      if (look !== looks.current) return;
      const url = tab?.url;
      const source = findSource(url);
      const current = stateRef.current;

      if (!tab?.id || !url || !source) {
        if (current.phase === 'collecting' && portRef.current) {
          // The page answers with what it found so far.
          stop();
          setState((s) => ({ ...s, onBoard: false }));
        } else if (current.phase === 'ready' && current.items.length > 0) {
          setState((s) => (s.onBoard ? { ...s, onBoard: false } : s));
        } else if (current.phase !== 'unsupported') {
          disconnect();
          setState((s) => ({ ...INITIAL, phase: 'unsupported', scan: s.scan }));
        }
        return;
      }

      const boardUrl = canonicalBoardUrl(url);
      const sameBoard = current.boardUrl === boardUrl;
      if (!force && sameBoard && (current.phase === 'found' || current.phase === 'collecting' || current.phase === 'ready')) {
        if (!current.onBoard) setState((s) => ({ ...s, onBoard: true }));
        return;
      }
      // "Scan again" reads at once; a board read earlier comes back as it was; a new one waits for the user.
      if (force) return connect(tab.id, url, true);
      const known = read.current.get(boardUrl) ?? optionsRef.current.lookup(boardUrl);
      if (known) return restore(boardUrl, known);
      await connect(tab.id, url, false);
    },
    [connect, disconnect, restore, stop],
  );

  const rescan = useCallback(() => void inspectActiveTab(true), [inspectActiveTab]);

  /** Reads the board on screen: the user asked. */
  const start = useCallback(() => {
    const port = portRef.current;
    if (stateRef.current.phase === 'found' && port) {
      setState((s) => ({
        ...s,
        phase: 'collecting',
        items: [],
        skipped: emptySkips(),
        stopped: false,
        reading: { found: 0, skipped: emptySkips(), stopped: false },
        scan: s.scan + 1,
      }));
      try {
        port.postMessage({ type: 'start' } satisfies PanelToPage);
        return;
      } catch {
        // The page closed the port meanwhile: connect again, reading this time.
      }
    }
    void inspectActiveTab(true);
  }, [inspectActiveTab]);

  const { ready } = options;
  useEffect(() => {
    if (!ready) return;
    void inspectActiveTab();
    const onActivated = () => void inspectActiveTab();
    const onUpdated = (_tabId: number, info: Browser.tabs.OnUpdatedInfo, tab: Browser.tabs.Tab) => {
      if (tab.active && (info.url || info.status === 'complete')) void inspectActiveTab();
    };
    browser.tabs.onActivated.addListener(onActivated);
    browser.tabs.onUpdated.addListener(onUpdated);
    return () => {
      browser.tabs.onActivated.removeListener(onActivated);
      browser.tabs.onUpdated.removeListener(onUpdated);
      disconnect();
    };
  }, [ready, inspectActiveTab, disconnect]);

  return { state, stop, rescan, start, restore, remember };
}
