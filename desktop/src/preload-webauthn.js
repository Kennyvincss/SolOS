// Passkeys (WebAuthn) in web pages. Chrome answers a site's passkey request
// with its own sheet, which also offers passkeys saved in Chrome; here the
// request goes straight to the operating system, so on Windows a page that
// asks for a passkey on its own pops up "Windows Security: Making sure it's
// you, insert your security key". Google's sign-in does that on load, so
// Google sign-in pages see no passkey support and ask for the password
// (passkeys saved in Chrome aren't reachable here anyway).
//
// Those pages also present as Firefox (see google-signin.js), so they don't
// see Chromium-only properties (navigator.userAgentData, Google's vendor
// string) that would contradict the Firefox user agent.
//
// Only those pages are changed: on every other site the browser's built-in
// functions are left untouched, because bot checks such as Cloudflare
// Turnstile treat modified built-ins as a sign of automation and fail.
// SPDX-License-Identifier: GPL-3.0-only

const { contextBridge } = require("electron");

const NO_PASSKEY_HOSTS = ["accounts.google.com", "accounts.youtube.com"];
// Extra hosts for tests (comma-separated).
const extra = (process.env.STRATA_NO_PASSKEY_HOSTS || "").split(",").filter(Boolean);

function install(noPasskeyHosts) {
  if (typeof location === "undefined" || !/^https?:$/.test(location.protocol)) return;
  const host = location.hostname;
  const noPasskeys = noPasskeyHosts.some((h) => host === h || host.endsWith(`.${h}`));
  if (!noPasskeys) return; // leave every other site's built-ins untouched
  try {
    const N = Navigator.prototype;
    if ("userAgentData" in N) delete N.userAgentData;
    Object.defineProperty(N, "vendor", { get: () => "", configurable: true, enumerable: true });
  } catch {
    /* leave as is */
  }
  const C = window.CredentialsContainer;
  if (!C || !C.prototype || !window.PublicKeyCredential) return;
  const declined = () => new DOMException("The operation either timed out or was not allowed.", "NotAllowedError");
  const PKC = window.PublicKeyCredential;
  try {
    Object.defineProperty(PKC, "isConditionalMediationAvailable", { value: () => Promise.resolve(false), configurable: true, writable: true });
    Object.defineProperty(PKC, "isUserVerifyingPlatformAuthenticatorAvailable", { value: () => Promise.resolve(false), configurable: true, writable: true });
    Object.defineProperty(window, "PublicKeyCredential", { value: undefined, configurable: true, writable: true });
  } catch {
    /* leave as is */
  }
  for (const name of ["get", "create"]) {
    const original = C.prototype[name];
    if (typeof original !== "function") continue;
    Object.defineProperty(C.prototype, name, {
      configurable: true,
      writable: true,
      value: function (options) {
        if (options && options.publicKey) return Promise.reject(declined());
        return original.call(this, options);
      },
    });
  }
}

const hosts = [...NO_PASSKEY_HOSTS, ...extra];
const here = typeof location !== "undefined" ? location.hostname : "";
try {
  if (hosts.some((h) => here === h || here.endsWith(`.${h}`))) contextBridge.executeInMainWorld({ func: install, args: [hosts] });
} catch {
  /* older Electron or a page without a main world */
}
