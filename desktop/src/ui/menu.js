// Renders one level of a STRATA menu (see popmenu.js). Labels are set with
// textContent; the only markup inserted is the fixed icon set below.
"use strict";

const P = (d) => `<svg viewBox="0 0 24 24">${d}</svg>`;
const ICONS = {
  "new-tab": P('<rect x="3" y="5" width="18" height="15" rx="2.5"/><path d="M12 9.5v6M9 12.5h6"/>'),
  window: P('<rect x="3" y="4" width="18" height="16" rx="2.5"/><path d="M3 9h18"/>'),
  split: P('<rect x="3" y="4" width="18" height="16" rx="2.5"/><path d="M12 4v16"/>'),
  profile: P('<circle cx="12" cy="8.5" r="3.5"/><path d="M5 20c1.2-3.5 4-5 7-5s5.8 1.5 7 5"/>'),
  key: P('<circle cx="7.5" cy="14.5" r="3.5"/><path d="M10 12l9-9M16 6l2.5 2.5M13.5 8.5l2 2"/>'),
  history: P('<path d="M3.5 12a8.5 8.5 0 1 0 2.5-6"/><path d="M3 4v4h4"/><path d="M12 8v4.5l3 2"/>'),
  bookmark: P('<path d="M12 3.8l2.5 5.1 5.6.8-4.05 3.95.96 5.6L12 16.6l-5.01 2.65.96-5.6L3.9 9.7l5.6-.8z"/>'),
  reading: P('<path d="M3 5.5c2.5-1 5.5-1 9 1 3.5-2 6.5-2 9-1V19c-2.5-1-5.5-1-9 1-3.5-2-6.5-2-9-1z"/><path d="M12 6.5V20"/>'),
  puzzle: P('<path d="M9 4.5a2 2 0 0 1 4 0V6h3.5a1.5 1.5 0 0 1 1.5 1.5V11h-1.5a2 2 0 0 0 0 4H18v3.5a1.5 1.5 0 0 1-1.5 1.5H13v-1.5a2 2 0 0 0-4 0V20H5.5A1.5 1.5 0 0 1 4 18.5V15h1.5a2 2 0 0 0 0-4H4V7.5A1.5 1.5 0 0 1 5.5 6H9z"/>'),
  trash: P('<path d="M4 7h16M9 7V4.5h6V7M6.5 7l1 13h9l1-13"/>'),
  tabs: P('<path d="M3 9V6.5A1.5 1.5 0 0 1 4.5 5H10l2 2.5h7.5A1.5 1.5 0 0 1 21 9v9.5a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18.5z"/>'),
  ai: P('<path d="M12 3.5l1.6 4.4 4.4 1.6-4.4 1.6L12 15.5l-1.6-4.4L6 9.5l4.4-1.6z"/><path d="M18.5 14.5l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z"/>'),
  devices: P('<rect x="2.5" y="5" width="13" height="10" rx="1.5"/><path d="M1.5 18h15"/><rect x="17.5" y="9" width="5" height="10" rx="1.2"/>'),
  code: P('<path d="M8.5 7L3.5 12l5 5M15.5 7l5 5-5 5M13.5 4.5l-3 15"/>'),
  sync: P('<path d="M4 12a8 8 0 0 1 13.7-5.6L20 8.5M20 4v4.5h-4.5M20 12a8 8 0 0 1-13.7 5.6L4 15.5M4 20v-4.5h4.5"/>'),
  appearance: P('<circle cx="12" cy="12" r="8.5"/><path d="M12 3.5v17A8.5 8.5 0 0 0 12 3.5z" fill="currentColor" stroke="none"/>'),
  settings: P('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>'),
  help: P('<circle cx="12" cy="12" r="8.5"/><path d="M9.6 9.4a2.5 2.5 0 0 1 4.8.9c0 1.7-2.4 2.2-2.4 3.7M12 17h.01"/>'),
  exit: P('<path d="M14 4h4.5A1.5 1.5 0 0 1 20 5.5v13a1.5 1.5 0 0 1-1.5 1.5H14M10 16l4-4-4-4M14 12H4"/>'),
  update: P('<path d="M12 4v10M8 10l4 4 4-4M5 19h14"/>'),
  info: P('<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.5M12 7.8h.01"/>'),
  zoom: P('<circle cx="10.5" cy="10.5" r="6"/><path d="M15 15l5 5"/>'),
};
const CHECK = '<svg viewBox="0 0 24 24" class="check"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
const CHEV = '<svg viewBox="0 0 16 16"><path d="M6 3.5l4.5 4.5L6 12.5"/></svg>';
const TICK = '<svg viewBox="0 0 16 16"><path d="M3 8.5l3 3 7-7"/></svg>';
const MINUS = '<svg viewBox="0 0 16 16"><path d="M3.5 8h9"/></svg>';
const PLUS = '<svg viewBox="0 0 16 16"><path d="M3.5 8h9M8 3.5v9"/></svg>';
const FULL = '<svg viewBox="0 0 16 16"><path d="M2.5 6V2.5H6M10 2.5h3.5V6M13.5 10v3.5H10M6 13.5H2.5V10"/></svg>';

const panel = document.getElementById("panel");
let items = [];
let rows = []; // { el, item }
let sel = -1;
let level = 0;
let hoverTimer = null;

const rectOf = (el) => {
  const r = el.getBoundingClientRect();
  return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
};
const selectable = (k) => rows[k] && rows[k].item.type !== "separator" && rows[k].item.enabled && rows[k].item.type !== "zoom";

function setSel(k) {
  if (rows[sel]) rows[sel].el.classList.remove("sel");
  sel = k;
  if (rows[sel]) {
    rows[sel].el.classList.add("sel");
    rows[sel].el.scrollIntoView({ block: "nearest" });
  }
}

function move(dir) {
  if (!rows.length) return;
  let k = sel;
  for (let n = 0; n < rows.length; n++) {
    k = (k + dir + rows.length) % rows.length;
    if (selectable(k)) return setSel(k);
  }
}

function activate(k) {
  const r = rows[k];
  if (!r || !selectable(k)) return;
  window.menu.activate(r.item.i, rectOf(r.el));
}

function zoomRow(item) {
  const el = document.createElement("div");
  el.className = "row zoom";
  const ic = document.createElement("span");
  ic.className = "ic";
  ic.innerHTML = ICONS.zoom;
  const label = Object.assign(document.createElement("span"), { className: "label", textContent: "Zoom" });
  const ctl = document.createElement("span");
  ctl.className = "ctl";
  const btn = (svg, title, action) => {
    const b = document.createElement("button");
    b.innerHTML = svg;
    b.title = title;
    b.onclick = async (e) => {
      e.stopPropagation();
      const v = await window.menu.zoom(item.i, action);
      if (typeof v === "string") val.textContent = v;
    };
    return b;
  };
  const val = Object.assign(document.createElement("span"), { className: "val", textContent: item.value });
  ctl.append(btn(MINUS, "Zoom out", "out"), val, btn(PLUS, "Zoom in", "in"), Object.assign(document.createElement("span"), { className: "bar" }), btn(FULL, "Full screen", "full"));
  el.append(ic, label, ctl);
  return el;
}

function render(data) {
  items = data.items;
  level = data.level;
  const withIcons = items.some((it) => it.ico || it.avatar || ((it.type === "checkbox" || it.type === "radio") && !it.ico));
  rows = [];
  panel.replaceChildren();
  items.forEach((item) => {
    if (item.type === "separator") {
      // Skip leading, trailing and doubled separators.
      const last = panel.lastElementChild;
      if (!last || last.classList.contains("sep")) return;
      const el = document.createElement("div");
      el.className = "sep";
      panel.append(el);
      rows.push({ el, item });
      return;
    }
    const el = item.type === "zoom" ? zoomRow(item) : document.createElement("div");
    if (item.type !== "zoom") {
      el.className = `row${item.enabled ? "" : " off"}`;
      el.setAttribute("role", item.type === "checkbox" ? "menuitemcheckbox" : item.type === "radio" ? "menuitemradio" : "menuitem");
      if (item.type === "checkbox" || item.type === "radio") el.setAttribute("aria-checked", String(item.checked));
      if (withIcons) {
        const ic = document.createElement("span");
        ic.className = "ic";
        if (item.avatar && typeof item.avatar.image === "string" && item.avatar.image.startsWith("data:image/png;base64,")) {
          const img = document.createElement("img");
          img.className = "avatar";
          img.src = item.avatar.image;
          img.alt = "";
          ic.append(img);
        } else if (item.avatar) {
          const a = document.createElement("span");
          a.className = "avatar";
          a.style.background = /^#[0-9a-f]{3,8}$/i.test(item.avatar.color || "") ? item.avatar.color : "#9b9cff";
          a.textContent = String(item.avatar.letter || "").slice(0, 1).toUpperCase();
          ic.append(a);
        } else if (item.ico && ICONS[item.ico]) ic.innerHTML = ICONS[item.ico];
        else if ((item.type === "checkbox" || item.type === "radio") && item.checked) ic.innerHTML = CHECK;
        el.append(ic);
      }
      el.append(Object.assign(document.createElement("span"), { className: "label", textContent: item.label }));
      if (item.accel) el.append(Object.assign(document.createElement("span"), { className: "accel", textContent: item.accel }));
      if ((item.type === "checkbox" || item.type === "radio") && item.checked && (item.ico || !withIcons)) {
        const t = document.createElement("span");
        t.className = "tick";
        t.innerHTML = TICK;
        el.append(t);
      }
      if (item.sub) {
        const c = document.createElement("span");
        c.className = "chev";
        c.innerHTML = CHEV;
        el.append(c);
      }
    }
    const k = rows.length;
    el.addEventListener("mouseenter", () => {
      if (selectable(k) || item.type === "zoom") setSel(selectable(k) ? k : -1);
      clearTimeout(hoverTimer);
      hoverTimer = setTimeout(() => window.menu.hover(item.i, rectOf(el)), item.sub ? 120 : 60);
    });
    el.addEventListener("click", () => activate(k));
    panel.append(el);
    rows.push({ el, item });
  });
  // Drop a trailing separator.
  if (panel.lastElementChild?.classList.contains("sep")) panel.lastElementChild.remove();
  if (data.select >= 0) move(1);
  requestAnimationFrame(() => window.menu.size(panel.offsetWidth, panel.offsetHeight));
}

window.menu.onKey((key) => {
  if (key === "ArrowDown") move(1);
  else if (key === "ArrowUp") move(-1);
  else if (key === "Home") (sel = -1), move(1);
  else if (key === "End") (sel = rows.length), move(-1);
  else if (key === "Enter" || key === " ") activate(sel);
  else if (key === "ArrowRight") {
    if (rows[sel]?.item.sub) activate(sel);
  } else if (key.length === 1 && /\S/.test(key)) {
    // Type a letter to jump to the next item that starts with it.
    const ch = key.toLowerCase();
    for (let n = 1; n <= rows.length; n++) {
      const k = (sel + n) % rows.length;
      if (selectable(k) && rows[k].item.label.trim().toLowerCase().startsWith(ch)) return setSel(k);
    }
  }
});

// Only the root menu window has focus: it forwards keys to whichever level has the keyboard.
document.addEventListener("keydown", (e) => {
  if (["ArrowDown", "ArrowUp", "ArrowLeft", "ArrowRight", "Enter", " ", "Escape", "Home", "End"].includes(e.key) || e.key.length === 1) {
    e.preventDefault();
    window.menu.key(e.key);
  }
});
panel.addEventListener("mouseleave", () => {
  if (!rows[sel]?.item.sub) setSel(-1);
});

window.menu.init().then((data) => data && render(data));
