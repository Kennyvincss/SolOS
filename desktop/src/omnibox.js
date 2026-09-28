// Address-bar suggestions (like Chrome's omnibox): what you typed (page,
// token, wallet, search or STRATA AI), open tabs, bookmarks, history and
// STRATA search results. Shown in a bubble that doesn't take focus, so typing
// stays in the address bar.
// SPDX-License-Identifier: GPL-3.0-only

const { net } = require("electron");
const bubbles = require("./bubbles");
const { SOLANA_OS_URL, routeInput } = require("./lib");

let state = null; // { shell, text, items, index, seq }

function hostPath(url) {
  return String(url || "").replace(/^https?:\/\/(www\.)?/, "").slice(0, 80);
}

function primary(text) {
  const r = routeInput(text);
  if (r.kind === "ai") return { kind: "ai", title: text, subtitle: "Ask STRATA AI about this page", run: { type: "ai", prompt: text } };
  if (r.url.startsWith(`${SOLANA_OS_URL}/search?q=`)) return { kind: "search", title: text, subtitle: "Search STRATA", run: { type: "go", text } };
  if (r.url.startsWith(`${SOLANA_OS_URL}/open?q=`)) return { kind: "entity", title: text, subtitle: "Open in STRATA (token, wallet or program)", run: { type: "go", text } };
  if (r.url.startsWith(`${SOLANA_OS_URL}/tx/`)) return { kind: "transaction", title: text.slice(0, 24) + "…", subtitle: "Open transaction", run: { type: "go", text } };
  return { kind: "url", title: hostPath(r.url), subtitle: "Open website", run: { type: "go", text } };
}

function localMatches(s, q) {
  const lib = s.profile.library;
  const needle = q.toLowerCase();
  const out = [];
  const seen = new Set();
  const add = (item) => {
    if (seen.has(item.url)) return;
    seen.add(item.url);
    out.push(item);
  };
  for (const id of s.order) {
    const t = s.tabs.get(id);
    const url = t.pending?.url ?? t.view.webContents.getURL();
    const title = t.view.webContents.getTitle() || t.placeholderTitle || "";
    if (id !== s.activeId && `${title} ${url}`.toLowerCase().includes(needle)) add({ kind: "tab", title, subtitle: `Switch to tab · ${hostPath(url)}`, url, run: { type: "tab", id } });
  }
  for (const b of lib.bookmarks()) if (`${b.title} ${b.url}`.toLowerCase().includes(needle)) add({ kind: "bookmark", title: b.title, subtitle: `Bookmark · ${hostPath(b.url)}`, url: b.url, run: { type: "url", url: b.url } });
  for (const h of lib.historyList({ query: q, limit: 40 })) {
    if (h.type === "search" || h.type === "ai") continue;
    add({ kind: "history", title: h.title, subtitle: hostPath(h.url), url: h.url, run: { type: "url", url: h.url } });
  }
  return out.slice(0, 6);
}

async function remote(q) {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 1500);
    const res = await net.fetch(`${SOLANA_OS_URL}/api/search?q=${encodeURIComponent(q)}`, { signal: ctrl.signal });
    clearTimeout(timer);
    if (!res.ok) return [];
    const body = await res.json();
    const hits = (body.groups ?? []).flatMap((g) => g.hits ?? []).sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
    return hits.slice(0, 4).map((h) => ({ kind: h.kind, title: h.title, subtitle: `${h.kind.charAt(0).toUpperCase()}${h.kind.slice(1)}${h.subtitle ? ` · ${h.subtitle}` : ""}`, url: h.href.startsWith("http") ? h.href : `${SOLANA_OS_URL}${h.href}`, run: { type: "url", url: h.href.startsWith("http") ? h.href : `${SOLANA_OS_URL}${h.href}` } }));
  } catch {
    return [];
  }
}

function show(s, rect) {
  const data = { items: state.items.map(({ run, ...x }) => x), index: state.index };
  if (bubbles.isOpen("omnibox")) return bubbles.update("omnibox", data);
  bubbles.open(s, {
    name: "omnibox",
    inactive: true,
    anchor: rect,
    align: "left",
    width: Math.max(360, Math.round((rect?.right ?? 600) - (rect?.left ?? 0))),
    data,
    handler: (action, payload) => {
      if (action === "pick" && state) {
        state.index = Number(payload);
        accept(state.shell, state.go);
      }
      return true;
    },
    onClose: () => {},
  });
}

function suggest(s, text, rect, go) {
  const q = text.trim();
  if (!q) return close();
  const seq = (state?.seq ?? 0) + 1;
  const items = [primary(q), ...localMatches(s, q)];
  if (routeInput(q).kind === "url" && !/^https?:|\./.test(q)) items.push({ kind: "ai", title: q, subtitle: "Ask STRATA AI", run: { type: "ai", prompt: q } });
  state = { shell: s, text: q, items, index: 0, seq, go, rect };
  show(s, rect);
  // STRATA search results (tokens, apps, wallets…) arrive a moment later.
  if (q.length >= 2 && !/^https?:/i.test(q)) {
    remote(q).then((hits) => {
      if (!state || state.seq !== seq || !hits.length) return;
      const urls = new Set(state.items.map((i) => i.url).filter(Boolean));
      state.items = [...state.items, ...hits.filter((h) => !urls.has(h.url))].slice(0, 10);
      show(s, rect);
    });
  }
}

function move(s, delta) {
  if (!state || state.shell !== s) return;
  state.index = (state.index + delta + state.items.length) % state.items.length;
  bubbles.update("omnibox", { items: state.items.map(({ run, ...x }) => x), index: state.index });
  const it = state.items[state.index];
  s.win.webContents.send("shell:setAddress", it.run.type === "url" ? it.url : it.run.type === "tab" ? it.title : state.text);
}

/** Run the selected suggestion. Returns false when there's nothing to run (the shell navigates itself). */
function accept(s, go) {
  if (!state || state.shell !== s) return false;
  const it = state.items[state.index];
  const text = state.text;
  close();
  if (!it) return false;
  const r = it.run;
  if (r.type === "tab") s.selectTab(r.id);
  else if (r.type === "url") s.navigate(r.url);
  else if (r.type === "ai") {
    s.profile.library.addActivity("ai", r.prompt, `${SOLANA_OS_URL}/ai?q=${encodeURIComponent(r.prompt)}`);
    s.openPanel(r.prompt);
  }
  else go(s, text);
  s.win.webContents.send("shell:setAddress", "");
  return true;
}

function close() {
  state = null;
  if (bubbles.isOpen("omnibox")) bubbles.close();
}

module.exports = { suggest, move, accept, close };
