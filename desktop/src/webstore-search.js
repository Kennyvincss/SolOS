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
      // The link is often an empty overlay; its result card is the nearest
      // ancestor that has an icon and text but no other extension's link.
      let card = a;
      for (let i = 0; i < 8 && card.parentElement; i++) {
        const up = card.parentElement;
        const ids = new Set([...up.querySelectorAll('a[href*="detail/"]')].map((x) => (x.getAttribute("href").match(/([a-p]{32})/) || [])[1]).filter(Boolean));
        if (ids.size > 1) break;
        card = up;
        if (card.querySelector("img") && (card.innerText || "").trim().length > 10) break;
      }
      // Cards can have a wide promo image as well as the square icon; prefer the
      // icon (store icon URLs end in "=s<size>" with no width/height).
      const imgs = [...card.querySelectorAll("img")];
      const src = (i) => String(i.currentSrc || i.getAttribute("src") || i.getAttribute("data-src") || "");
      const img = imgs.find((i) => /=s\\d+(-rj|-c|$)/.test(src(i)) && !/-w\\d+-h\\d+/.test(src(i))) || imgs.find((i) => i.naturalWidth && i.naturalWidth === i.naturalHeight) || imgs[imgs.length - 1] || null;
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
        icon: img ? src(img).replace(/=s\\d+$/, "=s128") : "",
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
