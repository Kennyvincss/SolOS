// Google sign-in ("Continue with Google"). Google refuses embedded browsers
// that present as Chrome ("Couldn't sign you in — This browser or app may not
// be secure") but accepts this engine presenting as Firefox (checked against
// accounts.google.com: test/check-google-signin.js). So on Google's sign-in
// pages only, tabs and popups present as Firefox; everywhere else STRATA keeps
// Chrome's user agent.
// SPDX-License-Identifier: GPL-3.0-only

const SIGNIN_HOSTS = ["accounts.google.com", "accounts.youtube.com"];
// Stand-in hosts for tests (google.com can't be served locally: it's HSTS-pinned).
const TEST_HOSTS = (process.env.STRATA_GOOGLE_SIGNIN_HOSTS || "").split(",").filter(Boolean);
const HOSTS = [...SIGNIN_HOSTS, ...TEST_HOSTS];

function isGoogleSignIn(url) {
  try {
    const h = new URL(url).hostname;
    return HOSTS.some((s) => h === s || h.endsWith(`.${s}`));
  } catch {
    return false;
  }
}

/** The Firefox user agent for this platform (Google lists Firefox as supported). */
function firefoxUserAgent(platform = process.platform) {
  const os = platform === "win32" ? "Windows NT 10.0; Win64; x64" : platform === "darwin" ? "Macintosh; Intel Mac OS X 10.15" : "X11; Linux x86_64";
  return `Mozilla/5.0 (${os}; rv:140.0) Gecko/20100101 Firefox/140.0`;
}

/**
 * Requests to Google's sign-in pages carry the Firefox user agent and no
 * Chrome client hints; every other request carries the session's (Chrome)
 * user agent, even right after a tab leaves Google.
 */
function installSession(ses) {
  const firefox = firefoxUserAgent();
  ses.webRequest.onBeforeSendHeaders({ urls: ["http://*/*", "https://*/*"] }, (details, callback) => {
    const google = isGoogleSignIn(details.url);
    const key = Object.keys(details.requestHeaders).find((k) => /^user-agent$/i.test(k));
    const current = key ? details.requestHeaders[key] : "";
    if (!google && !/Firefox\//.test(current)) return callback({});
    const headers = { ...details.requestHeaders };
    if (key) delete headers[key];
    if (google) for (const k of Object.keys(headers)) if (/^sec-ch-ua/i.test(k)) delete headers[k];
    headers["User-Agent"] = google ? firefox : ses.getUserAgent();
    callback({ requestHeaders: headers });
  });
}

/** The page's own navigator.userAgent follows: Firefox while on Google sign-in, the session's otherwise. */
function watchWebContents(wc) {
  if (wc.getType?.() === "backgroundPage") return;
  let onGoogle = false;
  const apply = (url) => {
    const want = isGoogleSignIn(url);
    if (want === onGoogle || wc.isDestroyed()) return;
    onGoogle = want;
    wc.setUserAgent(want ? firefoxUserAgent() : wc.session.getUserAgent());
  };
  wc.on("did-start-navigation", (details) => {
    if (details?.isMainFrame === false) return;
    apply(details?.url ?? "");
  });
}

module.exports = { isGoogleSignIn, firefoxUserAgent, installSession, watchWebContents, SIGNIN_HOSTS };
