// Tab group editor: name, color and group actions (like Chrome's).
// SPDX-License-Identifier: GPL-3.0-only
"use strict";

async function render() {
  const d = await window.bubble.data();
  if (!d) return;
  const name = h("input", { type: "text", placeholder: "Name this group", value: d.title, maxlength: 60 });
  name.addEventListener("input", () => window.bubble.action("title", name.value));
  name.addEventListener("keydown", (e) => e.key === "Enter" && window.bubble.close());
  const swatches = h(
    "div",
    { class: "swatches" },
    Object.entries(d.colors).map(([key, hex]) =>
      h("button", {
        class: `swatch${key === d.color ? " on" : ""}`,
        style: `background:${hex};color:${hex}`,
        title: key,
        "aria-label": key,
        onclick: async () => {
          await window.bubble.action("color", key);
          d.color = key;
          render();
        },
      }),
    ),
  );
  const item = (ic, label, action) => h("button", { class: "item", onclick: () => window.bubble.action(action).then(() => (action === "toggleSaved" ? render() : window.bubble.close())) }, icon(ic), label);
  root.replaceChildren(
    name,
    h("div", { style: "height:12px" }),
    swatches,
    h(
      "div",
      { class: "list", style: "margin-top:14px" },
      item("save", d.saved ? "Unsave group" : "Save group", "toggleSaved"),
      item("plus", "New tab in group", "newTab"),
      item("ungroup", "Ungroup", "ungroup"),
      item("close", "Close group", "close"),
      item("window", "Move group to new window", "moveToNewWindow"),
    ),
  );
  fit();
  if (!render.focused) {
    render.focused = true;
    name.focus();
    name.select();
  }
}
render();
