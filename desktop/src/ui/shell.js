// Toolbar UI for Solana OS Desktop. Talks to the main process via window.sos.
// SPDX-License-Identifier: GPL-3.0-only
"use strict";

const $ = (id) => document.getElementById(id);
const tabsEl = $("tabs");
const address = $("address");
const riskEl = $("risk");
let state = { tabs: [], activeId: null, home: "" };
let editing = false;

function displayUrl(url) {
  if (!url || url === "about:blank") return "";
  if (state.home && url.startsWith(state.home)) {
    const rest = url.slice(state.home.length);
    const q = rest.match(/^\/search\?q=([^&]+)/);
    if (q) return decodeURIComponent(q[1].replace(/\+/g, " "));
  }
  return url;
}

// Tab elements are kept and updated in place (keyed by tab id). Rebuilding
// them on every state change would destroy a close button between mousedown
// and click, so the click would never land.
const tabEls = new Map();

function makeTab(id) {
  const el = document.createElement("div");
  el.setAttribute("role", "tab");
  const icon = document.createElement("span");
  const title = document.createElement("span");
  title.className = "title";
  const close = document.createElement("button");
  close.className = "close";
  close.setAttribute("aria-label", "Close tab");
  close.title = "Close tab (Ctrl/⌘+W)";
  close.innerHTML = '<svg viewBox="0 0 24 24" style="width:12px;height:12px"><path d="M6 6l12 12M18 6L6 18"/></svg>';
  close.addEventListener("mousedown", (e) => e.stopPropagation());
  close.addEventListener("click", (e) => {
    e.stopPropagation();
    window.sos.closeTab(id);
  });
  el.append(icon, title, close);
  el.addEventListener("mousedown", (e) => {
    if (e.button === 0) window.sos.selectTab(id);
  });
  // Middle-click closes, like Chrome.
  el.addEventListener("auxclick", (e) => {
    if (e.button === 1) window.sos.closeTab(id);
  });
  const rec = { el, icon, title, iconKey: "" };
  tabEls.set(id, rec);
  return rec;
}

function setIcon(rec, t) {
  const key = t.loading ? "loading" : t.favicon ? `img:${t.favicon}` : "dot";
  if (key === rec.iconKey) return;
  rec.iconKey = key;
  let icon;
  if (t.loading) {
    icon = document.createElement("span");
    icon.className = "spinner";
  } else if (t.favicon) {
    icon = document.createElement("img");
    icon.src = t.favicon;
    icon.onerror = () => icon.replaceWith(Object.assign(document.createElement("span"), { className: "dot" }));
  } else {
    icon = document.createElement("span");
    icon.className = "dot";
  }
  rec.icon.replaceWith(icon);
  rec.icon = icon;
}

function renderTabs() {
  const ids = new Set(state.tabs.map((t) => t.id));
  for (const [id, rec] of tabEls) {
    if (!ids.has(id)) {
      rec.el.remove();
      tabEls.delete(id);
    }
  }
  state.tabs.forEach((t, i) => {
    const rec = tabEls.get(t.id) ?? makeTab(t.id);
    rec.el.className = "tab" + (t.id === state.activeId ? " active" : "");
    rec.el.title = t.title;
    if (rec.title.textContent !== t.title) rec.title.textContent = t.title;
    setIcon(rec, t);
    if (tabsEl.children[i] !== rec.el) tabsEl.insertBefore(rec.el, tabsEl.children[i] ?? null);
  });
}

function render() {
  renderTabs();
  const t = state.tabs.find((x) => x.id === state.activeId);
  $("back").disabled = !t?.canGoBack;
  $("forward").disabled = !t?.canGoForward;
  $("reload").innerHTML = t?.loading
    ? '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>'
    : '<svg viewBox="0 0 24 24"><path d="M20 11a8 8 0 1 0-2.3 5.7M20 5v6h-6"/></svg>';
  $("reload").title = t?.loading ? "Stop" : "Reload";
  if (!editing) address.value = displayUrl(t?.url);
  if (t?.risk) {
    riskEl.hidden = false;
    riskEl.className = `risk ${t.risk.level}`;
    riskEl.textContent = t.risk.level === "high" ? `⚠ ${t.risk.label}` : t.risk.level === "medium" ? t.risk.label : "✓ " + t.risk.label;
    riskEl.title = t.risk.detail || "";
  } else {
    riskEl.hidden = true;
  }
  const star = $("star");
  const bookmarkable = /^https?:/.test(t?.url ?? "");
  star.hidden = !bookmarkable;
  star.classList.toggle("on", Boolean(t?.bookmarked));
  star.setAttribute("aria-pressed", String(Boolean(t?.bookmarked)));
  star.title = t?.bookmarked ? "Remove bookmark" : "Bookmark this page (Ctrl/⌘+D)";
}

// Hide extensions the user hid from the toolbar (inside the list's shadow DOM).
function applyHiddenExtensions(ids) {
  const list = document.querySelector("browser-action-list");
  const root = list && list.shadowRoot;
  if (!root) return;
  let style = root.getElementById("sos-hidden");
  if (!style) {
    style = document.createElement("style");
    style.id = "sos-hidden";
    root.appendChild(style);
  }
  const safe = (ids || []).filter((id) => /^[a-p]{32}$/.test(id));
  style.textContent = safe.length ? `${safe.map((id) => `#${id}`).join(", ")} { display: none !important; }` : "";
}

window.sos.onState((s) => {
  state = s;
  applyHiddenExtensions(s.hiddenExtensions);
  document.body.classList.toggle("darwin", s.platform === "darwin");
  document.body.classList.toggle("overlay", s.platform !== "darwin");
  render();
});
window.sos.onFocusAddress(() => {
  address.focus();
  address.select();
});

$("new-tab").onclick = () => window.sos.newTab();
$("back").onclick = () => window.sos.back();
$("forward").onclick = () => window.sos.forward();
$("reload").onclick = () => (state.tabs.find((x) => x.id === state.activeId)?.loading ? window.sos.stop() : window.sos.reload());
$("home").onclick = () => window.sos.home();
$("star").onclick = () => window.sos.toggleBookmark();
$("menu").onclick = (e) => {
  const r = e.currentTarget.getBoundingClientRect();
  window.sos.appMenu(r.left, r.bottom + 4);
};
$("extensions").onclick = (e) => {
  const r = e.currentTarget.getBoundingClientRect();
  window.sos.extensionsPanel({ left: r.left, top: r.top, right: r.right, bottom: r.bottom });
};
address.addEventListener("focus", () => {
  editing = true;
  setTimeout(() => address.select(), 0);
});
address.addEventListener("blur", () => {
  editing = false;
  render();
});
$("address-form").addEventListener("submit", (e) => {
  e.preventDefault();
  window.sos.navigate(address.value);
  address.blur();
});
address.addEventListener("keydown", (e) => {
  if (e.key === "Escape") address.blur();
});

window.sos.ready();
