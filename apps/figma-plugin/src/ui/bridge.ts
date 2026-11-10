import type { MainToUi, UiToMain } from '../shared/messages';

export function postToMain(message: UiToMain): void {
  parent.postMessage({ pluginMessage: message }, '*');
}

export function onMainMessage(handler: (message: MainToUi) => void): () => void {
  const listener = (event: MessageEvent) => {
    const message = (event.data as { pluginMessage?: MainToUi } | null)?.pluginMessage;
    if (message) handler(message);
  };
  window.addEventListener('message', listener);
  return () => window.removeEventListener('message', listener);
}
