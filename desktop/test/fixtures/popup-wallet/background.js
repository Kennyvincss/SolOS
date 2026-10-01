// Records chrome.windows events and opens approval popups from the service
// worker when asked (like a wallet handling a site's connect/sign request).
self.removed = [];
chrome.windows.onRemoved.addListener((id) => self.removed.push(id));
chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  if (msg?.type !== "open-popup") return;
  (async () => {
    await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    await chrome.windows.getAll();
    const last = await chrome.windows.getLastFocused();
    const w = await chrome.windows.create({ url: "approve.html", type: "popup", width: 360, height: 600, left: (last?.left ?? 0) + (last?.width ?? 800) - 360, top: last?.top ?? 0 });
    reply({ id: w?.id });
  })();
  return true;
});
