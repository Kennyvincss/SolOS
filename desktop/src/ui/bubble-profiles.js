// Profile switcher (like Chrome's): switch, add, rename, recolor, delete.
// SPDX-License-Identifier: GPL-3.0-only
"use strict";

let editing = null; // profile id being edited, or "new"
let draft = { name: "", color: "" };

const avatar = (p, size = 28) => h("span", { style: `width:${size}px;height:${size}px;border-radius:50%;background:${p.color};color:#0b0b12;display:grid;place-items:center;font-weight:700;font-size:${Math.round(size * 0.45)}px;flex:none` }, (p.name || "?").trim().charAt(0).toUpperCase());

async function render() {
  const d = await window.bubble.data();
  if (!d) return;
  const cur = d.profiles.find((p) => p.id === d.current);
  if (editing) {
    const isNew = editing === "new";
    const name = h("input", { type: "text", value: draft.name, placeholder: "Profile name (e.g. Trading)", maxlength: 40 });
    name.addEventListener("input", () => (draft.name = name.value));
    const presets = isNew
      ? h("div", { class: "row", style: "flex-wrap:wrap;margin-top:8px" }, d.presets.map((p) => h("button", { class: "btn", style: "height:28px;padding:0 10px", onclick: () => ((draft = { name: p.name, color: p.color }), render()) }, p.name)))
      : null;
    const swatches = h("div", { class: "swatches" }, d.colors.map((c) => h("button", { class: `swatch${c === draft.color ? " on" : ""}`, style: `background:${c};color:${c}`, onclick: () => ((draft.color = c), render()) })));
    root.replaceChildren(
      h("h1", {}, isNew ? "Add a profile" : "Edit profile"),
      h("div", { class: "faint" }, isNew ? "Each profile has its own wallet, extensions, bookmarks, history, settings and tabs." : ""),
      h("label", {}, "Name"),
      name,
      presets,
      h("label", {}, "Color"),
      swatches,
      h(
        "div",
        { class: "actions" },
        !isNew && editing !== "default" ? h("button", { class: "btn danger", style: "margin-right:auto", onclick: async () => {
          const ok = await window.bubble.action("remove", editing);
          if (ok) ((editing = null), render());
        } }, "Delete") : null,
        h("button", { class: "btn", onclick: () => ((editing = null), render()) }, "Cancel"),
        h("button", { class: "btn primary", onclick: async () => {
          if (isNew) await window.bubble.action("create", { name: draft.name, color: draft.color });
          else await window.bubble.action("update", { id: editing, name: draft.name, color: draft.color });
          editing = null;
          if (!isNew) render();
        } }, isNew ? "Create and open" : "Save"),
      ),
    );
    fit();
    name.focus();
    return;
  }
  root.replaceChildren(
    h("div", { class: "row", style: "gap:12px;margin-bottom:10px" }, avatar(cur, 40), h("div", {}, h("div", { style: "font-weight:600;font-size:14px" }, cur.name), h("div", { class: "faint" }, d.walletLabel || "Browser profile")),
      h("button", { class: "btn", style: "margin-left:auto;height:28px;padding:0 10px", title: "Edit profile", onclick: () => ((editing = cur.id), (draft = { name: cur.name, color: cur.color }), render()) }, icon("pencil"))),
    h(
      "div",
      { class: "list" },
      h("div", { class: "faint", style: "padding:6px 16px 4px" }, "Profiles"),
      d.profiles.filter((p) => p.id !== d.current).map((p) =>
        h("button", { class: "item", onclick: () => window.bubble.action("switch", p.id).then(() => window.bubble.close()) }, avatar(p, 22), h("span", { style: "flex:1" }, p.name), p.open ? h("span", { class: "faint" }, "Open") : null),
      ),
      h("button", { class: "item", onclick: () => ((editing = "new"), (draft = { name: "", color: d.colors.find((c) => !d.profiles.some((p) => p.color === c)) ?? d.colors[0] }), render()) }, icon("plus"), "Add profile"),
    ),
  );
  fit();
}
render();
