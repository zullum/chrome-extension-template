console.log('content script loaded');
chrome.runtime.onMessage.addListener(response => {
  console.log('***response', response);
});

console.log('** HERE');
