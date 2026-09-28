chrome.runtime.onInstalled.addListener(() => chrome.storage.local.set({ installed: true }));
// Like Phantom/Solflare: touch APIs Electron lacks at startup; record what worked.
const probe = {
  identity: typeof chrome.identity?.getRedirectURL === "function" ? chrome.identity.getRedirectURL("cb") : null,
  sidePanel: typeof chrome.sidePanel?.setPanelBehavior === "function",
  tabsCreate: typeof chrome.tabs?.create === "function",
  windowsUpdate: typeof chrome.windows?.update === "function",
};
chrome.storage.local.set({ swProbe: probe });
console.log("PROBE " + JSON.stringify(probe));
