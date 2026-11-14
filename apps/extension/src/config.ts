/** Magpin's website, its privacy policy and its source code. */
export const SITE_URL = 'https://magpin.pages.dev/';
export const PRIVACY_URL = `${SITE_URL}privacy`;
export const SOURCE_CODE_URL = 'https://github.com/getmagpin/magpin';

/** Figma Community page of the plugin. */
export const FIGMA_PLUGIN_URL = 'https://www.figma.com/community/plugin/1702182298012784493/magpin';

/** Images downloaded in parallel for the ZIP. */
export const ZIP_CONCURRENCY = 6;

const IS_MAC = /Mac|iPhone|iPad/i.test(navigator.userAgent);
export const PASTE_SHORTCUT = IS_MAC ? '⌘V' : 'Ctrl+V';
