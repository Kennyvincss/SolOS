// Passkeys (WebAuthn) in web pages. Chrome answers a site's passkey request
// with its own sheet, which also offers passkeys saved in Chrome; here the
// request goes straight to the operating system, so on Windows a page that
// asks for a passkey on its own pops up "Windows Security: Making sure it's
// you, insert your security key". Google's sign-in does that on load.
//  - Google sign-in pages see no passkey support, so Google asks for the
//    password instead (passkeys saved in Chrome aren't reachable here anyway).
//  - Elsewhere, a page can only start a passkey prompt from a click or key
//    press (a "Sign in with passkey" button still works); prompts started on
//    their own are declined like a cancelled prompt.
//  - Passkey autofill (conditional mediation) is reported as unavailable.
// SPDX-License-Identifier: GPL-3.0-only

const { contextBridge } = require("electron");

const NO_PASSKEY_HOSTS = ["accounts.google.com", "accounts.youtube.com"];
// Extra hosts for tests (comma-separated).
const extra = (process.env.STRATA_NO_PASSKEY_HOSTS || "").split(",").filter(Boolean);

function install(noPasskeyHosts) {
  if (typeof location === "undefined" || !/^https?:$/.test(location.protocol)) return;
  const C = window.CredentialsContainer;
  if (!C || !C.prototype || !window.PublicKeyCredential) return;
  const host = location.hostname;
  const noPasskeys = noPasskeyHosts.some((h) => host === h || host.endsWith(`.${h}`));
  const declined = () => new DOMException("The operation either timed out or was not allowed.", "NotAllowedError");
  const PKC = window.PublicKeyCredential;

  try {
    Object.defineProperty(PKC, "isConditionalMediationAvailable", { value: () => Promise.resolve(false), configurable: true, writable: true });
    if (noPasskeys) {
      Object.defineProperty(PKC, "isUserVerifyingPlatformAuthenticatorAvailable", { value: () => Promise.resolve(false), configurable: true, writable: true });
      Object.defineProperty(window, "PublicKeyCredential", { value: undefined, configurable: true, writable: true });
    }
  } catch {
    /* leave as is */
  }

  const wrap = (name) => {
    const original = C.prototype[name];
    if (typeof original !== "function") return;
    Object.defineProperty(C.prototype, name, {
      configurable: true,
      writable: true,
      value: function (options) {
        if (options && options.publicKey) {
          if (noPasskeys) return Promise.reject(declined());
          if (options.mediation === "conditional") {
            // Autofill is unavailable: stay pending until the site cancels it.
            return new Promise((_resolve, reject) => {
              const signal = options.signal;
              if (signal) signal.addEventListener("abort", () => reject(signal.reason ?? new DOMException("Aborted", "AbortError")), { once: true });
            });
          }
          if (!(navigator.userActivation && navigator.userActivation.isActive)) return Promise.reject(declined());
        }
        return original.call(this, options);
      },
    });
  };
  wrap("get");
  wrap("create");
}

try {
  contextBridge.executeInMainWorld({ func: install, args: [[...NO_PASSKEY_HOSTS, ...extra]] });
} catch {
  /* older Electron or a page without a main world */
}
