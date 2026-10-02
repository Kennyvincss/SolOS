// "Site wants to …" prompt: Allow / Block, Escape or × to decide later.
// SPDX-License-Identifier: GPL-3.0-only
"use strict";

const SVG = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
const ICONS = {
  camera: SVG('<rect x="3" y="6" width="13" height="12" rx="2"/><path d="M16 10l5-3v10l-5-3"/>'),
  microphone: SVG('<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>'),
  location: SVG('<path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/>'),
  bell: SVG('<path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4z"/><path d="M10 21h4"/>'),
  clipboard: SVG('<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4h6v3H9z"/>'),
  screen: SVG('<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>'),
  cookie: SVG('<path d="M12 3a9 9 0 1 0 9 9 3 3 0 0 1-3-3 3 3 0 0 1-3-3 3 3 0 0 1-3-3z"/><circle cx="9" cy="11" r="1"/><circle cx="14" cy="15" r="1"/><circle cx="9" cy="16" r="1"/>'),
  app: SVG('<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>'),
  info: SVG('<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>'),
};
const close = SVG('<path d="M6 6l12 12M18 6L6 18"/>');

const iconFor = (what) =>
  /camera/.test(what) ? ICONS.camera
  : /microphone/.test(what) ? ICONS.microphone
  : /location/.test(what) ? ICONS.location
  : /notification/.test(what) ? ICONS.bell
  : /copy/.test(what) ? ICONS.clipboard
  : /screen/.test(what) ? ICONS.screen
  : /cookies/.test(what) ? ICONS.cookie
  : /open an app/.test(what) ? ICONS.app
  : ICONS.info;

const el = (tag, cls, html) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
};
const text = (s) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

(async () => {
  const d = await window.permission.data();
  if (!d) return;
  const root = document.getElementById("root");
  const head = el("div", "head");
  head.append(el("h1", "", `<b>${text(d.host)}</b> wants to`));
  const x = el("button", "x", close);
  x.title = "Decide later";
  x.id = "dismiss";
  x.onclick = () => window.permission.answer("dismiss");
  head.append(x);
  const what = el("div", "what", `${iconFor(d.what)}<span>${text(d.what.charAt(0).toUpperCase() + d.what.slice(1))}</span>`);
  const actions = el("div", "actions");
  const block = el("button", "btn", "Block");
  block.id = "block";
  block.onclick = () => window.permission.answer("block");
  const allow = el("button", "btn primary", "Allow");
  allow.id = "allow";
  allow.onclick = () => window.permission.answer("allow");
  actions.append(block, allow);
  root.append(head, what, actions);
  document.addEventListener("keydown", (e) => e.key === "Escape" && window.permission.answer("dismiss"));
  requestAnimationFrame(() => window.permission.resize(document.body.scrollHeight));
})();
