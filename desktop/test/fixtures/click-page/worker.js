// No toolbar popup: clicking the icon opens the extension's page, like some wallets do.
chrome.action.onClicked.addListener(() => chrome.tabs.create({ url: chrome.runtime.getURL("page.html") }));
// Opened without a click (tests): a tab.
chrome.runtime.onMessage.addListener((m) => {
  if (m === "open-tab") chrome.tabs.create({ url: chrome.runtime.getURL("page.html?direct=1") });
});
