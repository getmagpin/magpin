/**
 * Collector, injected on demand by the side panel with chrome.scripting
 * (never declared in the manifest, so it only runs when the user asks).
 */
import { COLLECT_PORT, type PageToPanel, type PanelToPage } from '@/src/messaging';
import { arenaAdapter } from '@/src/sources/arena/adapter';
import { cosmosAdapter } from '@/src/sources/cosmos/adapter';
import { pinterestAdapter } from '@/src/sources/pinterest/adapter';
import { saveeAdapter } from '@/src/sources/savee/adapter';
import { type BoardMeta, type CollectedItem, type SkipCounts, type SourceAdapter, emptySkips } from '@/src/sources/types';

const ADAPTERS: SourceAdapter[] = [pinterestAdapter, arenaAdapter, cosmosAdapter, saveeAdapter];

declare global {
  interface Window {
    __magpinCollector?: boolean;
  }
}

export default defineContentScript({
  matches: ['https://*.pinterest.com/*', 'https://www.are.na/*', 'https://are.na/*', 'https://www.cosmos.so/*', 'https://cosmos.so/*', 'https://savee.com/*', 'https://www.savee.com/*'],
  registration: 'runtime',
  main() {
    // The panel injects us each time it opens: register the listener once.
    if (window.__magpinCollector) return;
    window.__magpinCollector = true;

    browser.runtime.onConnect.addListener((port) => {
      if (port.name !== COLLECT_PORT) return;
      const send = (message: PageToPanel) => {
        try {
          port.postMessage(message);
        } catch {
          // Port closed: the panel went away.
        }
      };

      const adapter = ADAPTERS.find((candidate) => candidate.match(location.href));
      if (!adapter) {
        send({ type: 'unsupported' });
        return;
      }
      const readMeta = async (): Promise<BoardMeta | null> => {
        try {
          return await adapter.getBoardMeta(document);
        } catch {
          return null;
        }
      };
      void readMeta().then((meta) => meta && send({ type: 'meta', meta }));

      let controller: AbortController | null = null;
      port.onDisconnect.addListener(() => controller?.abort());
      port.onMessage.addListener(async (message: PanelToPage) => {
        if (message.type === 'stop') {
          controller?.abort();
          return;
        }
        if (message.type !== 'start' || controller) return;
        controller = new AbortController();
        const { signal } = controller;
        // What reached the panel so far, in case the reading ends on an error after a stop.
        const sent: CollectedItem[] = [];
        let skipped: SkipCounts = emptySkips();
        try {
          // After an in-page navigation the page can show the previous board's
          // title and count for a moment: read them again now, and at the end.
          const meta = await readMeta();
          if (meta) send({ type: 'meta', meta });
          const result = await adapter.collectItems((progress) => {
            sent.push(...progress.newItems);
            skipped = progress.skipped;
            send({ type: 'progress', ...progress });
          }, signal);
          send({ type: 'done', meta: await readMeta(), items: result.items, skipped: result.skipped, stopped: signal.aborted });
        } catch (error) {
          // Stopped: a request cut short is no error, the panel keeps what it got.
          if (signal.aborted) send({ type: 'done', meta: await readMeta(), items: sent, skipped, stopped: true });
          else send({ type: 'error', message: error instanceof Error ? error.message : String(error) });
        } finally {
          controller = null;
        }
      });
    });
  },
});
