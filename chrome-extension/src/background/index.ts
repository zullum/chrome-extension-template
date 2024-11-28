import 'webextension-polyfill';
import { exampleThemeStorage } from '@extension/storage';

exampleThemeStorage.get().then(theme => {
  console.log('theme', theme);
});

chrome.sidePanel
  .setPanelBehavior({
    openPanelOnActionClick: true,
  })
  .catch(error => console.error(error));

// Listen for and respond to events
chrome.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
  console.log('***message', message);

  sendResponse({ success: false });
});

console.log('*** v1.35');
