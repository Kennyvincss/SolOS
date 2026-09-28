// Search the Chrome Web Store from inside the app.
// SPDX-License-Identifier: GPL-3.0-only
//
// The store has no public search API, so this loads its search page in a
// hidden window (same session as the browser) and reads the results from the
// rendered page: every link to /detail/<slug>/<id> is one extension. Reading
// the DOM this way doesn't depend on the store's internal data format.

const fs = require("node:fs");
const path = require("node:path");
const { app, BrowserWindow } = require("electron");

// Results are cached in memory and on disk. Cached results are returned
// immediately; if they're older than FRESH_MS a background refresh updates them.
const cache = new Map(); // key -> { at, results }
const FRESH_MS = 30 * 60 * 1000;
const KEEP_MS = 7 * 24 * 60 * 60 * 1000;
const inflight = new Map();

const cacheFile = () => path.join(app.getPath("userData"), "webstore-cache.json");
let loaded = false;
function loadDisk() {
  if (loaded) return;
  loaded = true;
  try {
    const d = JSON.parse(fs.readFileSync(cacheFile(), "utf8"));
    for (const [k, v] of Object.entries(d)) if (v && Date.now() - v.at < KEEP_MS) cache.set(k, v);
  } catch {
    /* no cache yet */
  }
}
let saveTimer = null;
function saveDisk() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      const entries = [...cache.entries()].sort((a, b) => b[1].at - a[1].at).slice(0, 30);
      fs.writeFileSync(cacheFile(), JSON.stringify(Object.fromEntries(entries)));
    } catch {
      /* best effort */
    }
  }, 500);
}

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
  loadDisk();
  const hit = cache.get(key);
  if (hit) {
    // Serve instantly; refresh in the background when stale.
    if (Date.now() - hit.at > FRESH_MS && !inflight.has(key)) fetchStore(session, q, key, limit, timeoutMs).catch(() => {});
    return hit.results;
  }
  return fetchStore(session, q, key, limit, timeoutMs);
}

function fetchStore(session, q, key, limit, timeoutMs) {
  if (inflight.has(key)) return inflight.get(key);
  const p = loadStore(session, q, key, limit, timeoutMs).finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

async function loadStore(session, q, key, limit, timeoutMs) {
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
      await sleep(400);
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
        if (loadMores >= 2 || (results.length >= 24 && loadMores >= 1)) break;
        loadMores++;
        stableRounds = 0;
        await win.webContents.executeJavaScript(LOAD_MORE).catch(() => false);
      }
    }
    results = results.slice(0, limit);
    if (results.length) {
      cache.set(key, { at: Date.now(), results });
      saveDisk();
    }
    else if (lastError) throw new Error(`Couldn't read the Chrome Web Store results: ${lastError}`);
    return results;
  } finally {
    if (!win.isDestroyed()) win.destroy();
  }
}

/** Warm the cache for the Extensions page's default list. */
function prefetch(session) {
  loadDisk();
  const key = "solana|60";
  const hit = cache.get(key);
  if (!hit || Date.now() - hit.at > FRESH_MS) fetchStore(session, "solana", key, 60, 20000).catch(() => {});
}

module.exports = { searchWebStore, prefetch, EXTRACT };
