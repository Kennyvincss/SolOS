// "Bookmark added" editor: name, folder, favorite, remove.
// SPDX-License-Identifier: GPL-3.0-only
"use strict";

async function render() {
  const d = await window.bubble.data();
  if (!d) return;
  const name = h("input", { type: "text", value: d.title, maxlength: 300 });
  const folder = h(
    "select",
    {},
    h("option", { value: "" }, "Other bookmarks"),
    d.folders.map((f) => h("option", { value: f.id, selected: f.id === d.folderId }, f.name)),
    h("option", { value: "__new" }, "New folder…"),
  );
  const fav = h("input", { type: "checkbox", checked: d.favorite });
  const save = () => window.bubble.action("update", { title: name.value, folderId: folder.value || null, favorite: fav.checked });
  folder.addEventListener("change", async () => {
    if (folder.value !== "__new") return save();
    folder.replaceWith(newFolder);
    newFolderInput.focus();
    fit();
  });
  const newFolderInput = h("input", { type: "text", placeholder: "Folder name", maxlength: 80 });
  const newFolder = h("div", { class: "row" }, newFolderInput, h("button", { class: "btn", onclick: async () => {
    const f = await window.bubble.action("newFolder", newFolderInput.value);
    if (f) {
      d.folders.push(f);
      d.folderId = f.id;
      d.title = name.value;
      d.favorite = fav.checked;
      await window.bubble.action("update", { title: name.value, folderId: f.id, favorite: fav.checked });
      render();
    }
  } }, "Add"));
  name.addEventListener("keydown", (e) => e.key === "Enter" && save().then(() => window.bubble.close()));
  root.replaceChildren(
    h("h1", {}, d.existing ? "Edit bookmark" : "Bookmark added"),
    h("label", {}, "Name"),
    name,
    h("label", {}, "Folder"),
    folder,
    h("label", { class: "check" }, fav, "Show in favorites (bookmarks bar)"),
    h("div", { class: "faint", style: "margin-top:10px" }, `Saved as: ${d.typeLabel}`),
    h(
      "div",
      { class: "actions" },
      h("button", { class: "btn danger", style: "margin-right:auto", onclick: () => window.bubble.action("remove").then(() => window.bubble.close()) }, "Remove"),
      h("button", { class: "btn", onclick: () => window.bubble.action("manager").then(() => window.bubble.close()) }, "More…"),
      h("button", { class: "btn primary", onclick: () => save().then(() => window.bubble.close()) }, "Done"),
    ),
  );
  fav.addEventListener("change", save);
  fit();
  name.focus();
  name.select();
}
render();
