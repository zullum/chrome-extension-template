import 'webextension-polyfill';
import { exampleThemeStorage } from '@extension/storage';

console.log('[Background] Starting background script');

// Only log the initial theme, don't modify it
exampleThemeStorage.get().then(theme => {
  console.log('[Background] Current theme:', theme);
});

chrome.sidePanel
  .setPanelBehavior({
    openPanelOnActionClick: true,
  })
  .catch(error => console.error('[Background] SidePanel error:', error));

// Listen for and respond to events
chrome.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
  console.log('[Background] Message received:', message, 'from:', sender);
  sendResponse({ success: false });
});

console.log('[Background] v1.35');
