export const getH1Title = async (): Promise<string[]> => {
  try {
    // Query the active tab
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!activeTab?.id) {
      console.error('No active tab found');
      return [];
    }

    // Execute script to get all h1 titles
    const results = await chrome.scripting.executeScript({
      target: { tabId: activeTab.id },
      func: () => {
        const h1Elements = document.getElementsByTagName('h1');
        return Array.from(h1Elements)
          .map(el => el.textContent || '')
          .filter(Boolean);
      },
    });

    return results[0]?.result || [];
  } catch (error) {
    console.error('Error getting H1 titles:', error);
    return [];
  }
};
