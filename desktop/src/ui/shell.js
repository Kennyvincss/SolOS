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

function renderTabs() {
  tabsEl.replaceChildren(
    ...state.tabs.map((t) => {
      const el = document.createElement("div");
      el.className = "tab" + (t.id === state.activeId ? " active" : "");
      el.setAttribute("role", "tab");
      el.title = t.title;
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
      const title = document.createElement("span");
      title.className = "title";
      title.textContent = t.title;
      const close = document.createElement("button");
      close.className = "close";
      close.setAttribute("aria-label", "Close tab");
      close.innerHTML = '<svg viewBox="0 0 24 24" style="width:12px;height:12px"><path d="M6 6l12 12M18 6L6 18"/></svg>';
      close.onclick = (e) => {
        e.stopPropagation();
        window.sos.closeTab(t.id);
      };
      el.append(icon, title, close);
      el.onmousedown = (e) => {
        if (e.button === 1) window.sos.closeTab(t.id);
        else if (e.button === 0) window.sos.selectTab(t.id);
      };
      return el;
    }),
  );
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
}

window.sos.onState((s) => {
  state = s;
  document.body.classList.toggle("darwin", s.platform === "darwin");
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
$("wallets").onclick = (e) => {
  const r = e.currentTarget.getBoundingClientRect();
  window.sos.walletMenu(r.left, r.bottom + 4);
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
