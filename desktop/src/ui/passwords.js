// Passwords page UI.
// SPDX-License-Identifier: GPL-3.0-only
"use strict";

const $ = (id) => document.getElementById(id);
let state = null;

function el(tag, props = {}, children = []) {
  const e = Object.assign(document.createElement(tag), props);
  e.append(...children);
  return e;
}

function render() {
  const q = $("filter").value.trim().toLowerCase();
  $("unavailable").hidden = state.available;
  $("save").checked = state.save;
  $("autofill").checked = state.autofill;
  const entries = state.entries.filter((e) => !q || e.origin.toLowerCase().includes(q) || e.username.toLowerCase().includes(q));
  $("empty").hidden = entries.length > 0;
  $("list").replaceChildren(
    ...entries.map((e) => {
      const secret = el("span", { className: "secret", textContent: "••••••••" });
      const show = el("button", { textContent: "Show" });
      show.onclick = async () => {
        if (show.textContent === "Hide") {
          secret.textContent = "••••••••";
          show.textContent = "Show";
          return;
        }
        const pw = await window.pwm.reveal(e.id);
        if (pw == null) return;
        secret.textContent = pw;
        show.textContent = "Hide";
        setTimeout(() => {
          secret.textContent = "••••••••";
          show.textContent = "Show";
        }, 30000);
      };
      const del = el("button", { className: "danger", textContent: "Delete" });
      del.onclick = async () => {
        if (!confirm(`Delete the saved password for ${e.username || "this login"} on ${new URL(e.origin).host}?`)) return;
        await window.pwm.remove(e.id);
        refresh();
      };
      return el("li", {}, [
        el("div", { className: "site" }, [el("b", { textContent: new URL(e.origin).host }), el("span", { textContent: e.username || "(no username)" })]),
        secret,
        show,
        del,
      ]);
    }),
  );
  $("never-empty").hidden = state.never.length > 0;
  $("never").replaceChildren(
    ...state.never.map((origin) => {
      const allow = el("button", { textContent: "Remove" });
      allow.onclick = async () => {
        await window.pwm.allowAgain(origin);
        refresh();
      };
      return el("li", {}, [el("div", { className: "site" }, [el("b", { textContent: new URL(origin).host })]), allow]);
    }),
  );
}

async function refresh() {
  state = await window.pwm.list();
  if (state) render();
}

$("filter").addEventListener("input", () => state && render());
$("save").addEventListener("change", (e) => window.pwm.setting("savePasswords", e.target.checked));
$("autofill").addEventListener("change", (e) => window.pwm.setting("autofillPasswords", e.target.checked));
refresh();
