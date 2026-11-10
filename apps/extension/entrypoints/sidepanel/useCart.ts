import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import { type CartBoard, EchoFilter, type Reading, applyReading, readCart, renameBoard, upsertBoard, watchCart, writeCart } from '@/src/cart';

/** Changes made in a quick run (Shift+click, All, None) land in storage as one write. */
const WRITE_DELAY_MS = 250;

/**
 * The persisted cart, kept in sync across panels. Changes show at once and
 * are written shortly after; storage's echo of this panel's own writes is
 * ignored, so only changes made elsewhere come in.
 */
export function useCart() {
  const [boards, setBoards] = useState<CartBoard[] | null>(null);
  const latest = useRef<CartBoard[]>([]);
  const echoes = useRef(new EchoFilter());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flush = useCallback(() => {
    if (!timer.current) return;
    clearTimeout(timer.current);
    timer.current = null;
    echoes.current.wrote(latest.current);
    void writeCart(latest.current);
  }, []);

  useEffect(() => {
    let alive = true;
    void readCart().then((stored) => {
      if (!alive) return;
      latest.current = stored;
      setBoards(stored);
    });
    const stop = watchCart((stored) => {
      if (echoes.current.isEcho(stored)) return;
      // Changed in another window: theirs wins over a write still waiting here.
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
      latest.current = stored;
      setBoards(stored);
    });
    // The panel closing must not lose the last change.
    const onHide = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', onHide);
    return () => {
      alive = false;
      stop();
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', onHide);
      flush();
    };
  }, [flush]);

  const save = useCallback(
    (next: CartBoard[]) => {
      if (next === latest.current) return;
      latest.current = next;
      setBoards(next);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(flush, WRITE_DELAY_MS);
    },
    [flush],
  );

  return {
    boards: boards ?? [],
    loaded: boards !== null,
    find: useCallback((key: string) => latest.current.find((board) => board.key === key) ?? null, []),
    upsert: useCallback((board: CartBoard) => save(upsertBoard(latest.current, board)), [save]),
    /** The selection made on a board of the cart. */
    select: useCallback(
      (key: string, deselected: string[]) => save(latest.current.map((board) => (board.key === key ? { ...board, deselected } : board))),
      [save],
    ),
    /** A board was read again: if it is in the cart, it follows. */
    applyReading: useCallback((key: string, reading: Reading) => save(applyReading(latest.current, key, reading)), [save]),
    remove: useCallback((key: string) => save(latest.current.filter((board) => board.key !== key)), [save]),
    rename: useCallback((key: string, title: string) => save(renameBoard(latest.current, key, title)), [save]),
    clear: useCallback(() => save([]), [save]),
  };
}
