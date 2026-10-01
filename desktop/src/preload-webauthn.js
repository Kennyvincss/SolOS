// Passkeys (WebAuthn) in web pages. Chrome answers a site's passkey request
// with its own sheet, which also offers passkeys saved in Chrome; here the
// request goes straight to the operating system, so on Windows a page that
// asks for a passkey on its own pops up "Windows Security: Making sure it's
// you, insert your security key". Google's sign-in does that on load, so
// Google sign-in pages see no passkey support and ask for the password
// (passkeys saved in Chrome aren't reachable here anyway).
//
// Google's sign-in also refuses a browser whose window.chrome is empty
// ("Couldn't sign you in — This browser or app may not be secure"); Electron
// leaves it empty, so there it's filled in the way Chrome does (chrome.app,
// chrome.csi, chrome.loadTimes). Checked against accounts.google.com:
// test/check-google-signin.js.
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
    const c = window.chrome || (window.chrome = {});
    const def = (k, v) => {
      if (!(k in c)) Object.defineProperty(c, k, { value: v, writable: true, enumerable: true, configurable: true });
    };
    def("app", {
      isInstalled: false,
      InstallState: { DISABLED: "disabled", INSTALLED: "installed", NOT_INSTALLED: "not_installed" },
      RunningState: { CANNOT_RUN: "cannot_run", READY_TO_RUN: "ready_to_run", RUNNING: "running" },
      getDetails() {
        return null;
      },
      getIsInstalled() {
        return false;
      },
      runningState() {
        return "cannot_run";
      },
    });
    def("csi", function csi() {
      const t = performance.timing;
      return { startE: t.navigationStart, onloadT: t.domContentLoadedEventEnd, pageT: performance.now(), tran: 15 };
    });
    def("loadTimes", function loadTimes() {
      const t = performance.timing;
      const nav = performance.getEntriesByType("navigation")[0] || {};
      const proto = nav.nextHopProtocol || "unknown";
      return {
        requestTime: t.navigationStart / 1000,
        startLoadTime: t.navigationStart / 1000,
        commitLoadTime: t.responseStart / 1000,
        finishDocumentLoadTime: t.domContentLoadedEventEnd / 1000,
        finishLoadTime: t.loadEventEnd / 1000,
        firstPaintTime: t.responseEnd / 1000,
        firstPaintAfterLoadTime: 0,
        navigationType: "Other",
        wasFetchedViaSpdy: proto === "h2",
        wasNpnNegotiated: true,
        npnNegotiatedProtocol: proto,
        wasAlternateProtocolAvailable: false,
        connectionInfo: proto,
      };
    });
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
