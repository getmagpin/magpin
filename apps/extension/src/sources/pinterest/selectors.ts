/**
 * Every Pinterest selector in one place. Pinterest changes its markup often:
 * when extraction breaks, update this file and the fixtures, then run the tests.
 */
export const PINTEREST_SELECTORS = {
  /** One masonry cell. Present logged in and logged out. */
  gridItem: '[data-grid-item]',
  /** Position of the cell in the board, used to keep the board order. */
  gridItemIndexAttr: 'data-grid-item-idx',
  /** The list holding the board's own pins (recommendations live in another list). */
  gridList: '[role="list"]',
  /** Pin image hosted on the Pinterest CDN. */
  pinImage: 'img[src*="pinimg.com"]',
  /** Link to the pin page, which carries the pin id. Absent when logged out. */
  pinLink: 'a[href*="/pin/"]',
  /** Element whose inline padding-bottom gives the image aspect ratio. */
  aspectBox: '[style*="padding-bottom"]',
  /** Signs of a video pin. */
  video: 'video, [data-test-id*="video" i]',
  /** Signs of a sponsored pin. */
  sponsored: '[data-test-id*="promoted" i], [data-test-id*="sponsored" i], [aria-label*="promoted" i]',
  /** Board name, tried in this order (then any non-generic <h1>, then the page title). */
  boardTitle: ['[data-test-id="board-title"] h1', '[data-test-id="board-title"]', '[data-test-id="board-name"]', '[data-test-id="board-header"] h1'],
  pinCount: '[data-test-id="pin-count"]',
} as const;

/** First path segments that are never a user name. */
export const RESERVED_ROOTS = new Set([
  '_',
  'business',
  'categories',
  'explore',
  'homefeed',
  'ideas',
  'inbox',
  'login',
  'news_hub',
  'notifications',
  'password',
  'pin',
  'resource',
  'search',
  'settings',
  'shopping',
  'signup',
  'today',
  'topics',
  'videos',
]);

/** Second path segments that are profile tabs, not boards. */
export const RESERVED_PROFILE_TABS = new Set(['_saved', '_created', '_profile', 'pins', 'boards', 'followers', 'following', '_shop', '_tried']);
