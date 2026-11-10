/** Figma Community page of the plugin. Update once the plugin is published. */
export const FIGMA_PLUGIN_URL = 'https://www.figma.com/community/search?resource_type=plugins&query=magpin';

/** Images downloaded in parallel for the ZIP. */
export const ZIP_CONCURRENCY = 6;

const IS_MAC = /Mac|iPhone|iPad/i.test(navigator.userAgent);
export const PASTE_SHORTCUT = IS_MAC ? '⌘V' : 'Ctrl+V';
