// Records chrome.windows events so the test can check them.
self.removed = [];
chrome.windows.onRemoved.addListener((id) => self.removed.push(id));
