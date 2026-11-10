import preact from '@preact/preset-vite';
import { defineConfig } from 'wxt';

// Every permission is justified in the README (needed for Chrome Web Store review).
export default defineConfig({
  manifest: {
    name: 'Magpin',
    description: 'Your moodboard arrives already sorted. Collect boards from Pinterest, Are.na, Cosmos and Savee, paste them in Figma. Free.',
    // chrome.sidePanel.setPanelBehavior (the toolbar icon opens the panel) needs Chrome 116.
    minimum_chrome_version: '116',
    permissions: ['sidePanel', 'clipboardWrite', 'downloads', 'scripting', 'storage'],
    // Board pages (to read them on demand) and the one CDN without CORS headers
    // (Pinterest). Are.na, Cosmos and Savee CDNs allow any origin.
    host_permissions: [
      'https://*.pinterest.com/*',
      'https://i.pinimg.com/*',
      'https://www.are.na/*',
      'https://are.na/*',
      'https://www.cosmos.so/*',
      'https://cosmos.so/*',
      'https://savee.com/*',
      'https://www.savee.com/*',
    ],
    action: {
      default_title: 'Open Magpin',
    },
    side_panel: {
      default_path: 'sidepanel.html',
    },
  },
  vite: () => ({
    plugins: [preact()],
  }),
});
