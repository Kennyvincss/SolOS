// Search the Chrome Web Store from inside the app.
// SPDX-License-Identifier: GPL-3.0-only
//
// The store has no public search API, so this loads its search page in a
// hidden window (same session as the browser) and reads the results from the
// rendered page: every link to /detail/<slug>/<id> is one extension. Reading
// the DOM this way doesn't depend on the store's internal data format.

const { BrowserWindow } = require("electron");

const cache = new Map(); // query -> { at, results }
const CACHE_MS = 10 * 60 * 1000;

// Runs inside the store page. Returns [{ id, name, icon, description, rating, users }].
const EXTRACT = `(() => {
  const out = new Map();
  for (const a of document.querySelectorAll('a[href*="detail/"]')) {
    try {
      const href = new URL(a.getAttribute("href"), document.baseURI).pathname;
      const m = href.match(/\\/detail\\/(?:[^/]+\\/)?([a-p]{32})\\/?$/);
      if (!m || out.has(m[1])) continue;
      const card = a.closest("[role=listitem], li, article") || a;
      const img = a.querySelector("img") || card.querySelector("img");
      const lines = String(card.innerText || a.innerText || "").split("\\n").map((s) => s.trim()).filter(Boolean);
      const heading = a.querySelector("h1,h2,h3,[role=heading]") || card.querySelector("h1,h2,h3,[role=heading]");
      const name = String((heading && heading.textContent) || (img && img.alt) || lines[0] || "").trim();
      if (!name) continue;
      const description = lines.find((l) => l !== name && l.length > 25 && !/^\\d/.test(l)) || "";
      const ratingLine = lines.find((l) => /^\\d(\\.\\d)?$/.test(l));
      const usersLine = lines.find((l) => /users?$/i.test(l));
      out.set(m[1], {
        id: m[1],
        name: name.slice(0, 80),
        icon: img ? String(img.currentSrc || img.getAttribute("src") || img.getAttribute("data-src") || "") : "",
        description: description.slice(0, 200),
        rating: ratingLine ? Number(ratingLine) : null,
        users: usersLine || null,
      });
    } catch (e) {
      /* skip odd elements */
    }
  }
  return [...out.values()];
})()`;

const LOAD_MORE = `(() => {
  const b = [...document.querySelectorAll("button")].find((x) => /load more|show more/i.test(x.textContent || ""));
  if (b) { b.click(); return true; }
  window.scrollTo(0, document.body.scrollHeight);
  return false;
})()`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Search the Chrome Web Store. `session` must be the browser's session so the
 * store sees a normal Chrome and the results match what users see there.
 */
async function searchWebStore(session, query, { limit = 60, timeoutMs = 20000 } = {}) {
  const q = String(query || "").trim().slice(0, 100) || "solana";
  const key = `${q.toLowerCase()}|${limit}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.results;

  const win = new BrowserWindow({
    show: false,
    width: 1280,
    height: 2000,
    webPreferences: { session, sandbox: true, contextIsolation: true, backgroundThrottling: false },
  });
  try {
    await win.loadURL(`https://chromewebstore.google.com/search/${encodeURIComponent(q)}?hl=en`);
    const started = Date.now();
    let results = [];
    let stableRounds = 0;
    let loadMores = 0;
    let lastError = null;
    while (Date.now() - started < timeoutMs) {
      await sleep(600);
      const now = await win.webContents.executeJavaScript(EXTRACT).catch((err) => {
        lastError = String(err && err.message ? err.message : err);
        return [];
      });
      if (now.length > results.length) {
        results = now;
        stableRounds = 0;
      } else stableRounds++;
      if (results.length >= limit) break;
      // Results rendered and stopped growing: ask for more a couple of times, then stop.
      if (results.length && stableRounds >= 2) {
        if (loadMores >= 3) break;
        loadMores++;
        stableRounds = 0;
        await win.webContents.executeJavaScript(LOAD_MORE).catch(() => false);
      }
    }
    results = results.slice(0, limit);
    if (results.length) cache.set(key, { at: Date.now(), results });
    else if (lastError) throw new Error(`Couldn't read the Chrome Web Store results: ${lastError}`);
    return results;
  } finally {
    if (!win.isDestroyed()) win.destroy();
  }
}

module.exports = { searchWebStore, EXTRACT };
