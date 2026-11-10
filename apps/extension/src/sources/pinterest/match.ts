import { RESERVED_PROFILE_TABS, RESERVED_ROOTS } from './selectors';

/** pinterest.com and its country subdomains (fr.pinterest.com…). Country TLDs redirect there. */
export function isPinterestHost(hostname: string): boolean {
  return /(^|\.)pinterest\.com$/i.test(hostname);
}

/**
 * A board is `/<user>/<board>/`, a board section is `/<user>/<board>/<section>/`.
 */
export function matchPinterestBoard(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'https:' || !isPinterestHost(parsed.hostname)) return false;

  const segments = parsed.pathname.split('/').filter(Boolean).map(decodeSegment);
  if (segments.length < 2 || segments.length > 3) return false;
  const [user = '', board = ''] = segments;
  if (RESERVED_ROOTS.has(user.toLowerCase())) return false;
  if (RESERVED_PROFILE_TABS.has(board.toLowerCase())) return false;
  if (board.startsWith('_')) return false;
  return true;
}

export { canonicalBoardUrl } from '../scroll';

function decodeSegment(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}
