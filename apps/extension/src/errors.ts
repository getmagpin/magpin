/**
 * Chrome and fetch speak in raw messages ("Frame with ID 0 is showing error
 * page", "signal is aborted without reason"). The panel shows plain words
 * instead; the raw message goes to the console for whoever debugs it.
 */
const PLAIN: readonly [RegExp, string][] = [
  [/limiting requests|\b429\b/i, 'Are.na is limiting requests. Wait a minute, then try again.'],
  [/are\.na answered/i, "Are.na isn't answering right now. Try again in a moment."],
  [/failed to fetch|network|internet|offline/i, "The connection dropped. Check you're online, then try again."],
  [/quota|disk full|no space/i, "There isn't enough disk space to save it."],
  [/error page|cannot access|cannot be scripted|permission/i, "Magpin can't reach this page. Reload it, then try again."],
  [/no tab with id|tab was closed|receiving end|port closed|disconnected/i, 'The page went away. Reload the board, then try again.'],
];

/** Plain words for `error`, or `fallback` when it is not a known case. */
export function friendlyError(error: unknown, fallback: string): string {
  const raw = error instanceof Error ? error.message : String(error ?? '');
  console.warn('[magpin]', raw);
  return PLAIN.find(([pattern]) => pattern.test(raw))?.[1] ?? fallback;
}
