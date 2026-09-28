// Preload for web pages (runs in an isolated world; the page cannot see it).
// SPDX-License-Identifier: GPL-3.0-only
//
// Password manager integration only: notices when a login form is submitted
// (to offer saving) and fills saved logins. The main process decides the
// origin from the frame itself, never from anything the page says.

const { contextBridge, ipcRenderer } = require("electron");

/* ------------------------------------------------------------ STRATA bridge */

// On the STRATA site only, let its Extensions page list and install browser
// extensions (each install is confirmed in a native dialog; the main process
// re-checks the origin from the frame itself).
try {
  if (location.origin === ipcRenderer.sendSync("desktop:homeOrigin")) {
    const lib = (area, action, args) => ipcRenderer.invoke("desktop:library", area, action, args ?? {});
    const listen = (channel) => (cb) => {
      const fn = (_e, payload) => cb(payload);
      ipcRenderer.on(channel, fn);
      return () => ipcRenderer.removeListener(channel, fn);
    };
    contextBridge.exposeInMainWorld("solanaOSDesktop", {
      version: 2,
      // extensions (of the current profile)
      extensions: () => ipcRenderer.invoke("desktop:extensions"),
      installExtension: (id, name) => ipcRenderer.invoke("desktop:installExtension", String(id), String(name ?? "")),
      removeExtension: (id) => ipcRenderer.invoke("desktop:removeExtension", String(id)),
      searchExtensions: (query) => ipcRenderer.invoke("desktop:searchExtensions", String(query ?? "")),
      setExtensionHidden: (id, hidden) => ipcRenderer.invoke("desktop:setExtensionHidden", String(id), Boolean(hidden)),
      // profile
      profile: () => ipcRenderer.invoke("desktop:profile"),
      // bookmarks, history, reading list (this profile's library)
      library: (area, action, args) => lib(String(area), String(action), args),
      open: (url, where) => lib("open", String(where ?? "current"), { url: String(url) }),
      // STRATA AI side panel
      pageContext: (opts) => ipcRenderer.invoke("desktop:pageContext", opts ?? {}),
      panel: (action, arg) => ipcRenderer.invoke("desktop:panel", String(action), arg ?? null),
      onPageChanged: listen("desktop:pageChanged"),
      onPanelPrompt: listen("desktop:panelPrompt"),
      // developer mode
      dev: (action, arg) => ipcRenderer.invoke("desktop:dev", String(action), arg ?? null),
    });
  }
} catch {
  /* not available */
}

function visible(el) {
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden";
}

function passwordFields(root = document) {
  return [...root.querySelectorAll('input[type="password"]')].filter((el) => !el.disabled && !el.readOnly && visible(el));
}

/** The username field is the closest visible text/email input before the password field. */
function usernameFieldFor(pw) {
  const scope = pw.form ?? document;
  const inputs = [...scope.querySelectorAll('input:not([type="hidden"]):not([type="password"]):not([type="checkbox"]):not([type="radio"]):not([type="submit"]):not([type="button"])')].filter(visible);
  const before = inputs.filter((el) => el.compareDocumentPosition(pw) & Node.DOCUMENT_POSITION_FOLLOWING);
  const pick = (list) => list.find((el) => /user|email|login|name|phone/i.test(`${el.name} ${el.id} ${el.autocomplete} ${el.type}`)) ?? list[list.length - 1];
  return pick(before) ?? pick(inputs) ?? null;
}

/* ------------------------------------------------------------ capture */

let lastSent = "";
function capture(scope) {
  const pw = passwordFields(scope).find((el) => el.value);
  if (!pw) return;
  // Skip sign-up/change-password forms with a "new password" field.
  if (pw.autocomplete === "new-password" && passwordFields(scope).length > 1) return;
  const user = usernameFieldFor(pw);
  const username = user?.value?.trim() ?? "";
  const key = `${username}\u0000${pw.value}`;
  if (key === lastSent) return;
  lastSent = key;
  ipcRenderer.send("pw:captured", { username, password: pw.value });
}

document.addEventListener("submit", (e) => capture(e.target instanceof HTMLFormElement ? e.target : document), true);
// Many apps log in with a button click and no real <form> submit.
document.addEventListener(
  "click",
  (e) => {
    const btn = e.target instanceof Element ? e.target.closest('button, input[type="submit"], [role="button"]') : null;
    if (btn && passwordFields(btn.form ?? document).some((el) => el.value)) setTimeout(() => capture(btn.form ?? document), 0);
  },
  true,
);
document.addEventListener(
  "keydown",
  (e) => {
    if (e.key === "Enter" && e.target instanceof HTMLInputElement && passwordFields(e.target.form ?? document).some((el) => el.value)) capture(e.target.form ?? document);
  },
  true,
);

/* ------------------------------------------------------------ autofill */

function setValue(el, value) {
  // Use the native setter so React/Vue-controlled inputs notice the change.
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
  setter.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
}

let filled = false;
let pending = false;
async function tryFill() {
  if (filled || pending) return;
  const pw = passwordFields().find((el) => !el.value && el.autocomplete !== "new-password");
  if (!pw) return;
  pending = true;
  try {
    const creds = await ipcRenderer.invoke("pw:get");
    if (!creds?.length || pw.value) return;
    const user = usernameFieldFor(pw);
    const typed = user?.value?.trim();
    const match = (typed ? creds.find((c) => c.username === typed) : undefined) ?? creds[0];
    if (user && !user.value) setValue(user, match.username);
    setValue(pw, match.password);
    filled = true;
  } finally {
    pending = false;
  }
}

let timer = null;
const schedule = () => {
  clearTimeout(timer);
  timer = setTimeout(tryFill, 250);
};
window.addEventListener("DOMContentLoaded", () => {
  schedule();
  new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true });
});
