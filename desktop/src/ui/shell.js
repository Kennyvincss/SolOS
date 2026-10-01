// Browser chrome for STRATA: tab strip, vertical tabs, toolbar, bookmarks bar.
// Talks to the main process via window.sos.
// SPDX-License-Identifier: GPL-3.0-only
"use strict";

const $ = (id) => document.getElementById(id);
const tabsEl = $("tabs");
const sideTabs = $("side-tabs");
const sidePinned = $("side-pinned");
const address = $("address");
const riskEl = $("risk");
let state = null;
let editing = false;
let filter = "";

const SVG = {
  close: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  sound: '<svg viewBox="0 0 24 24"><path d="M4 9h4l5-4v14l-5-4H4zM16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/></svg>',
  muted: '<svg viewBox="0 0 24 24"><path d="M4 9h4l5-4v14l-5-4H4zM17 9l5 6M22 9l-5 6"/></svg>',
  split: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="3"/><path d="M12 4v16"/></svg>',
  caret: '<svg viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg>',
  folder: '<svg viewBox="0 0 24 24"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>',
  star: '<svg viewBox="0 0 24 24"><path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"/></svg>',
  stop: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  reload: '<svg viewBox="0 0 24 24"><path d="M20 11a8 8 0 1 0-2.3 5.7M20 5v6h-6"/></svg>',
};

const TYPE_ICON = {
  token: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><path d="M9 12h6M12 9v6"/></svg>',
  wallet: '<svg viewBox="0 0 24 24"><path d="M3 7a2 2 0 0 1 2-2h13v4M3 7v10a2 2 0 0 0 2 2h15V9H5a2 2 0 0 1-2-2z"/></svg>',
  transaction: '<svg viewBox="0 0 24 24"><path d="M7 7h11l-3-3M17 17H6l3 3"/></svg>',
  market: '<svg viewBox="0 0 24 24"><path d="M4 19V5M4 19h16M8 15l3-4 3 2 5-6"/></svg>',
};

// STRATA's own pages never show the website's domain: the home page is an empty
// address bar, searches show what you typed, other pages show strata://page.
function displayUrl(url) {
  if (!url || url === "about:blank" || url.startsWith("file:")) return "";
  const home = (state?.home || "").replace(/\/$/, "");
  if (home && (url === home || url.startsWith(`${home}/`) || url.startsWith(`${home}?`) || url.startsWith(`${home}#`))) {
    const rest = url.slice(home.length);
    const q = rest.match(/^\/(search|open)\?q=([^&]+)/);
    if (q) return decodeURIComponent(q[2].replace(/\+/g, " "));
    if (rest === "" || rest === "/" || /^\/?[?#]/.test(rest)) return "";
    return `strata://${rest.replace(/^\//, "")}`;
  }
  return url.replace(/^https:\/\//, "");
}

const groupOf = (id) => state.groups.find((g) => g.id === id);

/* ------------------------------------------------------------ tab icons */

function iconFor(t) {
  if (t.loading) return Object.assign(document.createElement("span"), { className: "spinner" });
  if (t.favicon) {
    const img = document.createElement("img");
    img.className = "fav";
    img.src = t.favicon;
    // If the site's own icon fails, try Google's favicon service, then the placeholder.
    img.onerror = () => {
      let host = "";
      try {
        host = /^https?:/.test(t.url || "") ? new URL(t.url).origin : "";
      } catch {}
      const g = host ? `https://www.google.com/s2/favicons?sz=32&domain_url=${encodeURIComponent(host)}` : "";
      if (g && img.src !== g) img.src = g;
      else img.replaceWith(Object.assign(document.createElement("span"), { className: "dot" }));
    };
    return img;
  }
  return Object.assign(document.createElement("span"), { className: "dot" });
}

function audioButton(t) {
  if (!t.audible && !t.muted) return null;
  const b = document.createElement("button");
  b.className = `audio${t.muted ? " muted" : ""}`;
  b.innerHTML = t.muted ? SVG.muted : SVG.sound;
  b.title = t.muted ? "Unmute site" : "Mute site";
  b.setAttribute("aria-label", b.title);
  b.addEventListener("mousedown", (e) => e.stopPropagation());
  b.addEventListener("click", (e) => {
    e.stopPropagation();
    window.sos.toggleMute(t.id);
  });
  return b;
}

function closeButton(id) {
  const close = document.createElement("button");
  close.className = "close";
  close.setAttribute("aria-label", "Close tab");
  close.title = "Close tab (Ctrl+W)";
  close.innerHTML = SVG.close;
  close.addEventListener("mousedown", (e) => e.stopPropagation());
  close.addEventListener("click", (e) => {
    e.stopPropagation();
    window.sos.closeTab(id);
  });
  return close;
}

/* ------------------------------------------------------------ drag and drop */

let dragId = null;
let dragGroup = null;

function clearDropMarks() {
  for (const el of document.querySelectorAll(".drop-before,.drop-after,.drop-into")) el.classList.remove("drop-before", "drop-after", "drop-into");
}

/** Index (in the order without the dragged tab) for dropping before/after tab `targetId`. */
function dropIndex(targetId, after) {
  const order = state.tabs.map((t) => t.id).filter((id) => id !== dragId);
  const i = order.indexOf(targetId);
  return i + (after ? 1 : 0);
}

const tabById = (id) => state.tabs.find((x) => x.id === id);

function wireDrag(el, id, axis) {
  el.draggable = true;
  el.addEventListener("dragstart", (e) => {
    dragId = id;
    dragGroup = null;
    el.classList.add("dragging");
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", tabById(id)?.url || "");
  });
  el.addEventListener("dragend", (e) => {
    el.classList.remove("dragging");
    clearDropMarks();
    // Dropped outside the window: open the tab in a new window, like Chrome.
    const outside = e.screenX < window.screenX || e.screenX > window.screenX + window.outerWidth || e.screenY < window.screenY || e.screenY > window.screenY + window.outerHeight;
    if (dragId === id && outside && e.dataTransfer.dropEffect === "none") window.sos.detachTab(id);
    dragId = null;
    render();
  });
  el.addEventListener("dragover", (e) => {
    if (dragId === null && dragGroup === null) return;
    e.preventDefault();
    const r = el.getBoundingClientRect();
    const after = axis === "x" ? e.clientX > r.left + r.width / 2 : e.clientY > r.top + r.height / 2;
    clearDropMarks();
    el.classList.add(after ? "drop-after" : "drop-before");
  });
  el.addEventListener("dragleave", () => el.classList.remove("drop-before", "drop-after"));
  el.addEventListener("drop", (e) => {
    e.preventDefault();
    const after = el.classList.contains("drop-after");
    clearDropMarks();
    const t = tabById(id);
    if (!t) return;
    if (dragGroup) {
      const order = state.tabs.filter((x) => x.groupId !== dragGroup).map((x) => x.id);
      const i = order.indexOf(id) + (after ? 1 : 0);
      window.sos.moveGroup(dragGroup, i);
      dragGroup = null;
      return;
    }
    if (dragId === null || dragId === id) return;
    window.sos.moveTab(dragId, dropIndex(id, after), t.groupId ?? null, t.pinned);
  });
}

function wireGroupDrop(el, gid) {
  el.addEventListener("dragover", (e) => {
    if (dragId === null) return;
    e.preventDefault();
    clearDropMarks();
    el.classList.add("drop-into");
  });
  el.addEventListener("dragleave", () => el.classList.remove("drop-into"));
  el.addEventListener("drop", (e) => {
    e.preventDefault();
    clearDropMarks();
    if (dragId === null) return;
    const first = state.tabs.find((x) => x.groupId === gid && x.id !== dragId);
    window.sos.moveTab(dragId, first ? dropIndex(first.id, false) : state.tabs.length, gid, false);
  });
  el.draggable = true;
  el.addEventListener("dragstart", (e) => {
    dragGroup = gid;
    dragId = null;
    e.dataTransfer.effectAllowed = "move";
  });
  el.addEventListener("dragend", () => {
    dragGroup = null;
    clearDropMarks();
    render();
  });
}

/* ------------------------------------------------------------ horizontal tabs */

function tabTitle(t) {
  return t.crashed ? `${t.title} (crashed — reload)` : t.title;
}

// Elements are kept and updated in place (keyed), so a click that lands while
// the page is loading still hits the same close button it started on.
const stripEls = new Map(); // key -> element

function renderStrip() {
  const keys = [];
  let lastGroup = null;
  for (const t of state.tabs) {
    if (t.groupId && t.groupId !== lastGroup && groupOf(t.groupId)) keys.push(`g:${t.groupId}`);
    lastGroup = t.groupId;
    const g = t.groupId ? groupOf(t.groupId) : null;
    if (!g?.collapsed) keys.push(`t:${t.id}`);
  }
  const wanted = new Set(keys);
  for (const [k, el] of stripEls) if (!wanted.has(k)) (el.remove(), stripEls.delete(k));
  keys.forEach((k, i) => {
    let el = stripEls.get(k);
    if (!el) {
      el = k.startsWith("g:") ? makeGroupChip(k.slice(2)) : makeHorizontalTab(Number(k.slice(2)));
      stripEls.set(k, el);
    }
    if (k.startsWith("g:")) updateGroupChip(el, groupOf(k.slice(2)));
    else updateHorizontalTab(el, tabById(Number(k.slice(2))));
    if (tabsEl.children[i] !== el) tabsEl.insertBefore(el, tabsEl.children[i] ?? null);
  });
  // With more tabs than fit, keep the active one in view.
  if (state.activeId !== lastScrolledTo) {
    lastScrolledTo = state.activeId;
    requestAnimationFrame(() => stripEls.get(`t:${state.activeId}`)?.scrollIntoView({ block: "nearest", inline: "nearest" }));
  }
}
let lastScrolledTo = null;
// The mouse wheel scrolls the tab strip sideways when tabs overflow.
tabsEl.addEventListener(
  "wheel",
  (e) => {
    if (tabsEl.scrollWidth <= tabsEl.clientWidth) return;
    tabsEl.scrollLeft += Math.abs(e.deltaY) > Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
    e.preventDefault();
  },
  { passive: false },
);

function makeHorizontalTab(id) {
  const el = document.createElement("div");
  el.setAttribute("role", "tab");
  el.innerHTML = '<span class="ic"></span><span class="split-mark" hidden></span><span class="title"></span><span class="aud"></span>';
  el.querySelector(".split-mark").innerHTML = SVG.split;
  el.querySelector(".split-mark").title = "In split view";
  el.append(closeButton(id));
  el.addEventListener("mousedown", (e) => e.button === 0 && window.sos.selectTab(id));
  el.addEventListener("auxclick", (e) => e.button === 1 && window.sos.closeTab(id));
  el.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    window.sos.tabMenu(id, e.clientX, e.clientY);
  });
  wireDrag(el, id, "x");
  return el;
}

function iconKey(t) {
  return t.loading ? "loading" : t.favicon ? `img:${t.favicon}` : "dot";
}

function updateHorizontalTab(el, t) {
  const g = t.groupId ? groupOf(t.groupId) : null;
  const sp = t.splitId ? state.splits.find((s) => s.id === t.splitId) : null;
  const active = t.id === state.activeId || Boolean(sp && (sp.left === state.activeId || sp.right === state.activeId));
  el.className = ["tab", active ? "active" : "", t.pinned ? "pinned" : "", g ? "grouped" : "", t.crashed ? "crashed" : "", sp ? (sp.left === t.id ? "split-left" : "split-right") : ""].filter(Boolean).join(" ");
  el.setAttribute("aria-selected", String(t.id === state.activeId));
  if (g) el.style.setProperty("--group", g.hex);
  el.title = t.pinned ? t.title : `${tabTitle(t)}\n${displayUrl(t.url)}`;
  const ic = el.querySelector(".ic");
  if (ic.dataset.key !== iconKey(t)) {
    ic.dataset.key = iconKey(t);
    ic.replaceChildren(iconFor(t));
  }
  el.querySelector(".split-mark").hidden = !(sp && sp.left === t.id);
  const title = el.querySelector(".title");
  if (title.textContent !== tabTitle(t)) title.textContent = tabTitle(t);
  const aud = el.querySelector(".aud");
  const audKey = t.muted ? "m" : t.audible ? "a" : "";
  if (aud.dataset.key !== audKey) {
    aud.dataset.key = audKey;
    aud.replaceChildren(...[audioButton(t)].filter(Boolean));
  }
}

function makeGroupChip(gid) {
  const el = document.createElement("div");
  el.addEventListener("click", () => window.sos.toggleCollapse(gid));
  const edit = (e) => {
    e.preventDefault();
    const r = el.getBoundingClientRect();
    window.sos.groupEditor(gid, { left: r.left, top: r.top, right: r.right, bottom: r.bottom });
  };
  el.addEventListener("contextmenu", edit);
  el.addEventListener("dblclick", edit);
  wireGroupDrop(el, gid);
  return el;
}

function updateGroupChip(el, g) {
  const count = state.tabs.filter((t) => t.groupId === g.id).length;
  el.className = `group-chip${g.title ? "" : " empty"}${g.collapsed ? " collapsed" : ""}`;
  el.style.setProperty("--group", g.hex);
  el.title = `${g.title || "Unnamed group"} — ${count} tab${count === 1 ? "" : "s"}. Click to ${g.collapsed ? "expand" : "collapse"}, right-click to edit.`;
  el.textContent = g.title || "";
  if (g.title && g.collapsed) {
    const c = document.createElement("span");
    c.className = "count";
    c.textContent = String(count);
    el.append(c);
  }
}

/* ------------------------------------------------------------ vertical tabs */

function renderSidebar() {
  const q = filter.trim().toLowerCase();
  const match = (t) => !q || `${t.title} ${t.url}`.toLowerCase().includes(q);
  const pinned = state.tabs.filter((t) => t.pinned && match(t));
  sidePinned.replaceChildren(
    ...pinned.map((t) => {
      const el = document.createElement("div");
      el.className = `pin-tile${t.id === state.activeId ? " active" : ""}`;
      el.title = t.title;
      el.append(iconFor(t));
      const a = audioButton(t);
      if (a) el.append(a);
      el.addEventListener("mousedown", (e) => e.button === 0 && window.sos.selectTab(t.id));
      el.addEventListener("auxclick", (e) => e.button === 1 && window.sos.closeTab(t.id));
      el.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        window.sos.tabMenu(t.id, e.clientX, e.clientY);
      });
      wireDrag(el, t.id, "x");
      return el;
    }),
  );
  const frag = document.createDocumentFragment();
  let lastGroup = null;
  for (const t of state.tabs) {
    if (t.pinned) continue;
    const g = t.groupId ? groupOf(t.groupId) : null;
    if (g && g.id !== lastGroup) {
      const header = document.createElement("div");
      header.className = `vgroup${g.collapsed ? " collapsed" : ""}`;
      header.style.setProperty("--group", g.hex);
      const count = state.tabs.filter((x) => x.groupId === g.id).length;
      header.title = `${g.title || "Unnamed group"} — ${count} tabs`;
      header.innerHTML = `<span class="gdot"></span><span class="gname"></span><span class="caret">${SVG.caret}</span>`;
      header.querySelector(".gname").textContent = g.title || `${count} tabs`;
      header.addEventListener("click", () => window.sos.toggleCollapse(g.id));
      header.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        const r = header.getBoundingClientRect();
        window.sos.groupEditor(g.id, { left: r.left, top: r.top, right: r.right, bottom: r.bottom });
      });
      wireGroupDrop(header, g.id);
      frag.append(header);
    }
    lastGroup = t.groupId;
    if (g?.collapsed || !match(t)) continue;
    frag.append(verticalTab(t, g));
  }
  sideTabs.replaceChildren(frag);
}

function verticalTab(t, g) {
  const el = document.createElement("div");
  el.setAttribute("role", "tab");
  el.className = ["vtab", t.id === state.activeId ? "active" : "", g ? "in-group" : "", t.splitId ? "split" : ""].filter(Boolean).join(" ");
  if (g) el.style.setProperty("--group", g.hex);
  el.title = `${tabTitle(t)}\n${displayUrl(t.url)}`;
  el.append(iconFor(t));
  const title = document.createElement("span");
  title.className = "title";
  title.textContent = tabTitle(t);
  el.append(title);
  const a = audioButton(t);
  if (a) el.append(a);
  el.append(closeButton(t.id));
  el.addEventListener("mousedown", (e) => e.button === 0 && window.sos.selectTab(t.id));
  el.addEventListener("auxclick", (e) => e.button === 1 && window.sos.closeTab(t.id));
  el.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    window.sos.tabMenu(t.id, e.clientX, e.clientY);
  });
  wireDrag(el, t.id, "y");
  return el;
}

/* ------------------------------------------------------------ bookmarks bar */

function renderBookmarksBar() {
  const bar = $("bookmarks-bar");
  const b = state.bookmarksBar;
  bar.hidden = !b;
  if (!b) return;
  const items = [];
  for (const g of b.savedGroups) {
    const el = document.createElement("button");
    el.className = `bm saved-group${g.open ? " open" : ""}`;
    el.style.setProperty("--group", g.hex);
    el.innerHTML = "<span></span>";
    el.firstChild.textContent = g.title || "Saved group";
    el.title = g.open ? "Saved group (open) — click to show" : "Saved group — click to open";
    el.addEventListener("click", () => window.sos.savedGroupClicked(g.id));
    el.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      window.sos.savedGroupMenu(g.id, e.clientX, e.clientY);
    });
    items.push(el);
  }
  if (b.savedGroups.length && (b.favorites.length || b.folders.length)) items.push(Object.assign(document.createElement("span"), { className: "bm-sep" }));
  for (const f of b.favorites) {
    const el = document.createElement("button");
    el.className = "bm";
    el.title = `${f.title}\n${f.url}`;
    if (TYPE_ICON[f.type]) {
      const ic = document.createElement("span");
      ic.innerHTML = TYPE_ICON[f.type];
      ic.style.display = "grid";
      el.append(ic);
    } else {
      const img = document.createElement("img");
      img.src = `https://www.google.com/s2/favicons?sz=32&domain=${encodeURIComponent(hostOf(f.url))}`;
      img.alt = "";
      img.onerror = () => img.remove();
      el.append(img);
    }
    const s = document.createElement("span");
    s.textContent = f.title;
    el.append(s);
    el.addEventListener("click", (e) => window.sos.openUrl(f.url, e.ctrlKey || e.metaKey ? "tab" : "current"));
    el.addEventListener("auxclick", (e) => e.button === 1 && window.sos.openUrl(f.url, "tab"));
    el.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      window.sos.bookmarkItemMenu(f.url, e.clientX, e.clientY);
    });
    items.push(el);
  }
  for (const f of b.folders) {
    const el = document.createElement("button");
    el.className = "bm";
    el.innerHTML = `${SVG.folder}<span></span>`;
    el.querySelector("span").textContent = f.name;
    el.addEventListener("click", () => {
      const r = el.getBoundingClientRect();
      window.sos.bookmarkFolderMenu(f.id, { left: r.left, top: r.top, right: r.right, bottom: r.bottom });
    });
    items.push(el);
  }
  if (!items.length) items.push(Object.assign(document.createElement("span"), { className: "bm-empty", textContent: "Star a page to bookmark it. Tick “Show in favorites” to put it here." }));
  items.push(Object.assign(document.createElement("span"), { className: "bm-fill" }));
  const all = document.createElement("button");
  all.className = "bm";
  all.innerHTML = `${SVG.folder}<span>All bookmarks</span>`;
  all.addEventListener("click", () => window.sos.openHome("/bookmarks"));
  items.push(all);
  bar.replaceChildren(...items);
}

function hostOf(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}

/* ------------------------------------------------------------ toolbar */

function renderToolbar() {
  const n = state.nav;
  $("back").disabled = !n.canGoBack;
  $("forward").disabled = !n.canGoForward;
  $("reload").innerHTML = n.loading ? SVG.stop : SVG.reload;
  $("reload").title = n.loading ? "Stop" : "Reload (Ctrl+R)";
  if (!editing) address.value = displayUrl(n.url);
  // Only warnings show in the address bar; verified and neutral sites stay clean.
  if (n.risk && (n.risk.level === "high" || n.risk.level === "medium")) {
    riskEl.hidden = false;
    riskEl.className = `risk ${n.risk.level}`;
    riskEl.textContent = n.risk.level === "high" ? `⚠ ${n.risk.label}` : n.risk.label;
    riskEl.title = n.risk.detail || "";
  } else riskEl.hidden = true;
  const web = /^https?:/.test(n.url || "");
  const star = $("star");
  star.hidden = !web;
  star.classList.toggle("on", Boolean(n.bookmarked));
  star.setAttribute("aria-pressed", String(Boolean(n.bookmarked)));
  star.title = n.bookmarked ? "Edit bookmark for this tab" : "Bookmark this tab (Ctrl+D)";
  const reading = $("reading");
  reading.hidden = !web;
  reading.classList.toggle("on", Boolean(n.reading));
  reading.setAttribute("aria-pressed", String(Boolean(n.reading)));
  reading.title = n.reading ? "Remove from reading list" : "Add to reading list";
  $("split").classList.toggle("on", state.splits.some((s) => s.left === state.activeId || s.right === state.activeId));
  const ai = $("ai");
  ai.classList.toggle("on", state.panelOpen);
  ai.setAttribute("aria-pressed", String(state.panelOpen));
  const p = $("profile");
  const pic = typeof state.profile.picture === "string" && state.profile.picture.startsWith("data:image/png;base64,") ? state.profile.picture : null;
  p.textContent = pic ? "" : state.profile.initial;
  p.style.background = pic ? `center / cover no-repeat url("${pic}")` : state.profile.color;
  p.title = `${state.profile.name} — switch or add profiles`;
  // Extension icons for this profile's session.
  let list = document.querySelector("browser-action-list");
  if (!list || list.getAttribute("partition") !== state.partition) {
    list?.remove();
    list = document.createElement("browser-action-list");
    list.id = "actions";
    list.setAttribute("partition", state.partition);
    list.setAttribute("alignment", "bottom left");
    $("actions-slot").append(list);
  }
  applyHiddenExtensions(state.hiddenExtensions);
}

// Unpinned extensions are hidden from the toolbar (inside the list's shadow DOM).
function applyHiddenExtensions(ids) {
  const list = document.querySelector("browser-action-list");
  const root = list && list.shadowRoot;
  if (!root) return setTimeout(() => applyHiddenExtensions(ids), 200);
  let style = root.getElementById("sos-hidden");
  if (!style) {
    style = document.createElement("style");
    style.id = "sos-hidden";
    root.appendChild(style);
  }
  const safe = (ids || []).filter((id) => /^[a-p]{32}$/.test(id));
  style.textContent = safe.length ? `${safe.map((id) => `#${id}`).join(", ")} { display: none !important; }` : "";
}

/* ------------------------------------------------------------ layout (split frames, divider, panel edge) */

function renderLayout(L) {
  if (!L) return;
  const frames = $("pane-frames");
  if (L.panes.length > 1) {
    frames.replaceChildren(
      ...L.panes.map((p) => {
        const el = document.createElement("div");
        el.className = `pane-frame${p.id === L.focus ? " focus" : ""}`;
        Object.assign(el.style, { left: `${p.x}px`, top: `${p.y}px`, width: `${p.width}px`, height: `${p.height}px` });
        return el;
      }),
    );
  } else frames.replaceChildren();
  const d = $("divider");
  d.hidden = !L.divider;
  if (L.divider) Object.assign(d.style, { left: `${L.divider.x}px`, top: `${L.divider.y}px`, width: `${L.divider.width}px`, height: `${L.divider.height}px` });
  const pe = $("panel-edge");
  pe.hidden = !L.panel || L.panel.width < 40;
  if (L.panel) Object.assign(pe.style, { left: `${L.panel.x - 4}px`, top: `${L.panel.y}px`, height: `${L.panel.height}px` });
  const sb = $("sidebar");
  sb.style.top = `${L.content.y}px`;
  sb.style.width = `${L.content.x}px`;
}

/* ------------------------------------------------------------ render */

function render() {
  if (!state) return;
  if (dragId !== null || dragGroup !== null) return renderToolbar();
  document.body.classList.toggle("darwin", state.platform === "darwin");
  document.body.classList.toggle("overlay", state.platform !== "darwin");
  document.body.classList.toggle("vertical", state.vertical);
  document.body.classList.toggle("side-collapsed", state.vertical && state.sidebarCollapsed);
  $("sidebar").hidden = !state.vertical;
  $("side-collapse").title = state.sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar";
  if (state.vertical) {
    for (const el of stripEls.values()) el.remove();
    stripEls.clear();
    renderSidebar();
  } else renderStrip();
  renderToolbar();
  renderBookmarksBar();
  renderLayout(state.layout);
}

window.sos.onState((s) => {
  state = s;
  render();
});
window.sos.onLayout((L) => {
  if (state) state.layout = L;
  renderLayout(L);
});
window.sos.onFocusAddress(() => {
  address.focus();
  address.select();
});
window.sos.onSetAddress((text) => {
  address.value = text;
});

/* ------------------------------------------------------------ events */

const rectOf = (el) => {
  const r = el.getBoundingClientRect();
  return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
};

$("new-tab").onclick = () => window.sos.newTab();
$("side-new").onclick = () => window.sos.newTab();
$("side-collapse").onclick = () => window.sos.setSidebarCollapsed(!state?.sidebarCollapsed);
$("back").onclick = () => window.sos.back();
$("forward").onclick = () => window.sos.forward();
$("reload").onclick = () => (state?.nav.loading ? window.sos.stop() : window.sos.reload());
// Home: Alt+Home, or open a new tab (the toolbar has no home button).
$("star").onclick = (e) => window.sos.starClicked(rectOf(e.currentTarget));
$("reading").onclick = () => window.sos.toggleReading();
$("split").onclick = (e) => window.sos.splitMenu(rectOf(e.currentTarget));
$("extensions").onclick = (e) => window.sos.extensionsPanel(rectOf(e.currentTarget));
$("wallet").onclick = (e) => window.sos.walletMenu(rectOf(e.currentTarget));
$("notifications").onclick = () => window.sos.openHome("/notifications");
$("ai").onclick = () => window.sos.togglePanel();
$("profile").onclick = (e) => window.sos.profileMenu(rectOf(e.currentTarget));
$("menu").onclick = (e) => {
  const r = e.currentTarget.getBoundingClientRect();
  window.sos.appMenu(r.right, r.bottom + 2);
};
$("tabstrip").addEventListener("dblclick", (e) => {
  if (e.target === $("tabstrip") || e.target.classList.contains("drag-fill")) window.sos.newTab();
});
$("tabstrip").addEventListener("contextmenu", (e) => {
  if (e.target === $("tabstrip") || e.target.classList.contains("drag-fill") || e.target === tabsEl) {
    e.preventDefault();
    window.sos.stripMenu(e.clientX, e.clientY);
  }
});
$("divider").addEventListener("mousedown", (e) => {
  e.preventDefault();
  window.sos.dragStart("split");
});
$("panel-edge").addEventListener("mousedown", (e) => {
  e.preventDefault();
  window.sos.dragStart("panel");
});
$("tab-search").addEventListener("input", (e) => {
  filter = e.target.value;
  if (state) renderSidebar();
});

/* ------------------------------------------------------------ address bar (with suggestions) */

address.addEventListener("focus", () => {
  editing = true;
  setTimeout(() => address.select(), 0);
});
address.addEventListener("blur", () => {
  editing = false;
  setTimeout(() => window.sos.suggestClose(), 150);
  if (state) renderToolbar();
});
address.addEventListener("input", () => window.sos.suggest(address.value, rectOf($("address-form"))));
address.addEventListener("keydown", async (e) => {
  if (e.key === "Escape") {
    window.sos.suggestClose();
    address.value = displayUrl(state?.nav.url);
    address.blur();
  } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
    e.preventDefault();
    window.sos.suggestMove(e.key === "ArrowDown" ? 1 : -1);
  }
});
$("address-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const used = await window.sos.suggestAccept();
  if (!used) window.sos.navigate(address.value);
  address.blur();
});

window.sos.ready();
