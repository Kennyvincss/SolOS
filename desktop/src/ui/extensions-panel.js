// The toolbar's Extensions panel: every installed extension, pin/unpin to the
// toolbar, open its popup, and a ⋮ menu (Options, Remove…), like Chrome's.
// SPDX-License-Identifier: GPL-3.0-only

const listEl = document.getElementById("list");
const emptyEl = document.getElementById("empty");

const PIN = '<svg viewBox="0 0 24 24"><path d="M15 3l6 6-3 1-4 4 1 5-2 2-4-4-5 5M9 11l4 4M8 10l6-6" /></svg>';
const DOTS = '<svg viewBox="0 0 24 24"><path d="M12 5.5h.01M12 12h.01M12 18.5h.01" style="stroke-width:3" /></svg>';

function row(x) {
  const li = document.createElement("li");
  const open = document.createElement("button");
  open.className = "open";
  open.title = `Open ${x.name}`;
  if (x.icon) {
    const img = document.createElement("img");
    img.src = x.icon;
    img.alt = "";
    open.appendChild(img);
  } else {
    const ph = document.createElement("span");
    ph.className = "ph";
    open.appendChild(ph);
  }
  const name = document.createElement("span");
  name.textContent = x.name;
  open.appendChild(name);
  open.onclick = () => window.panel.open(x.id);

  const pin = document.createElement("button");
  pin.className = `icon pin${x.pinned ? " on" : ""}`;
  pin.innerHTML = PIN;
  pin.title = x.pinned ? "Unpin from toolbar" : "Pin to toolbar";
  pin.setAttribute("aria-label", `${x.pinned ? "Unpin" : "Pin"} ${x.name}`);
  pin.setAttribute("aria-pressed", String(x.pinned));
  pin.onclick = async () => {
    await window.panel.setPinned(x.id, !x.pinned);
    render();
  };

  const more = document.createElement("button");
  more.className = "icon more";
  more.innerHTML = DOTS;
  more.title = "More actions";
  more.setAttribute("aria-label", `More actions for ${x.name}`);
  more.onclick = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    window.panel.itemMenu(x.id, r.left, r.bottom);
  };

  li.append(open, pin, more);
  return li;
}

async function render() {
  const items = (await window.panel.list()) || [];
  listEl.replaceChildren(...items.map(row));
  emptyEl.hidden = items.length > 0;
  window.panel.resize(document.getElementById("panel").getBoundingClientRect().height);
}

document.getElementById("close").onclick = () => window.panel.close();
document.getElementById("manage").onclick = () => window.panel.manage();
document.getElementById("find").onclick = () => window.panel.findMore();
document.addEventListener("keydown", (e) => e.key === "Escape" && window.panel.close());
window.panel.onRefresh(render);
render();
