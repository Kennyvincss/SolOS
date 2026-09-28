// Script injected into every page (main frame only) before the page's own
// scripts run. It registers Phantom and Solflare as Wallet Standard wallets.
// Their methods forward to the app, which hands the request to the real wallet
// app through its deeplink protocol; the wallet shows its own approval screen.
//
// It is a plain string because release builds (Hermes) can't turn functions
// back into source. Keep it ES2017 and free of backticks.

export interface InjectOptions {
  wallets: { id: string; name: string; color: string }[];
  /** Random per-tab secret. Kept in a closure, so iframes (which can reach the native bridge on Android) can't forge requests. */
  token: string;
  /** Remove the Android WebView markers ("; wv", "Version/x") from navigator.userAgent so sites offer Mobile Wallet Adapter. */
  cleanUserAgent: boolean;
}

export function injectedScript(o: InjectOptions): string {
  return `(function () {
  if (window.__solanaOS || window.top !== window) return;
  var RN = window.ReactNativeWebView;
  if (!RN) return;
  var TOKEN = ${JSON.stringify(o.token)};
  var CLEAN_UA = ${JSON.stringify(o.cleanUserAgent)};
  if (CLEAN_UA) {
    try {
      var ua = navigator.userAgent.replace(/; wv\\)/, ")").replace(/ Version\\/[\\d.]+/, "");
      Object.defineProperty(Navigator.prototype, "userAgent", { get: function () { return ua; }, configurable: true });
    } catch (e) {}
  }

  var seq = 0;
  var pending = {};
  function call(req) {
    return new Promise(function (resolve, reject) {
      var id = "r" + (++seq) + "_" + Math.random().toString(36).slice(2);
      pending[id] = { resolve: resolve, reject: reject };
      RN.postMessage(JSON.stringify({ __solanaOS: "wallet", token: TOKEN, id: id, req: req }));
    });
  }
  Object.defineProperty(window, "__solanaOS", {
    value: Object.freeze({
      reply: function (id, ok, value) {
        var p = pending[id];
        if (!p) return;
        delete pending[id];
        if (ok) p.resolve(value);
        else p.reject(new Error(String(value || "Wallet request failed")));
      }
    })
  });

  function b64(u8) {
    var s = "";
    for (var i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]);
    return btoa(s);
  }
  function unb64(s) {
    var b = atob(s);
    var u = new Uint8Array(b.length);
    for (var i = 0; i < b.length; i++) u[i] = b.charCodeAt(i);
    return u;
  }
  function icon(name, color) {
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="16" fill="' + color + '"/>' +
      '<text x="32" y="43" font-family="-apple-system,Roboto,sans-serif" font-size="30" font-weight="700" text-anchor="middle" fill="#fff">' + name.charAt(0) + '</text></svg>';
    return "data:image/svg+xml;base64," + btoa(svg);
  }

  var CHAINS = ["solana:mainnet", "solana:devnet", "solana:testnet"];
  var ACCOUNT_FEATURES = ["solana:signAndSendTransaction", "solana:signTransaction", "solana:signMessage"];

  function makeWallet(id, name, color) {
    var accounts = [];
    var listeners = {};
    function emit(ev, data) {
      (listeners[ev] || []).slice().forEach(function (l) { try { l(data); } catch (e) {} });
    }
    function setAccounts(list) {
      accounts = list;
      emit("change", { accounts: accounts.slice() });
    }
    function toAccount(r) {
      return Object.freeze({ address: r.address, publicKey: unb64(r.publicKey), chains: CHAINS.slice(), features: ACCOUNT_FEATURES.slice() });
    }
    function mine(account) {
      if (!account || !accounts.some(function (a) { return a.address === account.address; })) throw new Error("Account not connected");
    }
    function each(inputs, fn) {
      var out = [];
      return inputs.reduce(function (p, input) {
        return p.then(function () { return fn(input); }).then(function (r) { out.push(r); });
      }, Promise.resolve()).then(function () { return out; });
    }

    var wallet = {
      version: "1.0.0",
      name: name,
      icon: icon(name, color),
      chains: CHAINS.slice(),
      get accounts() { return accounts.slice(); },
      features: {
        "standard:connect": {
          version: "1.0.0",
          connect: function (input) {
            return call({ type: "connect", wallet: id, silent: !!(input && input.silent) }).then(function (r) {
              if (r && r.address) setAccounts([toAccount(r)]);
              return { accounts: accounts.slice() };
            });
          }
        },
        "standard:disconnect": {
          version: "1.0.0",
          disconnect: function () {
            return call({ type: "disconnect", wallet: id }).then(function () { setAccounts([]); });
          }
        },
        "standard:events": {
          version: "1.0.0",
          on: function (ev, l) {
            (listeners[ev] = listeners[ev] || []).push(l);
            return function () { listeners[ev] = (listeners[ev] || []).filter(function (x) { return x !== l; }); };
          }
        },
        "solana:signMessage": {
          version: "1.1.0",
          signMessage: function () {
            var inputs = Array.prototype.slice.call(arguments);
            return each(inputs, function (input) {
              mine(input.account);
              return call({ type: "signMessage", wallet: id, message: b64(input.message) }).then(function (r) {
                return { signedMessage: input.message, signature: unb64(r.signature) };
              });
            });
          }
        },
        "solana:signTransaction": {
          version: "1.0.0",
          supportedTransactionVersions: ["legacy", 0],
          signTransaction: function () {
            var inputs = Array.prototype.slice.call(arguments);
            inputs.forEach(function (i) { mine(i.account); });
            if (inputs.length === 1) {
              return call({ type: "signTransaction", wallet: id, transaction: b64(inputs[0].transaction) }).then(function (r) {
                return [{ signedTransaction: unb64(r.transaction) }];
              });
            }
            return call({ type: "signAllTransactions", wallet: id, transactions: inputs.map(function (i) { return b64(i.transaction); }) }).then(function (r) {
              return r.transactions.map(function (t) { return { signedTransaction: unb64(t) }; });
            });
          }
        },
        "solana:signAndSendTransaction": {
          version: "1.0.0",
          supportedTransactionVersions: ["legacy", 0],
          signAndSendTransaction: function () {
            var inputs = Array.prototype.slice.call(arguments);
            return each(inputs, function (input) {
              mine(input.account);
              return call({ type: "signAndSendTransaction", wallet: id, transaction: b64(input.transaction), options: input.options || null }).then(function (r) {
                return { signature: unb64(r.signature) };
              });
            });
          }
        }
      }
    };
    return wallet;
  }

  function register(wallet) {
    var callback = function (api) { api.register(wallet); };
    try { window.dispatchEvent(new CustomEvent("wallet-standard:register-wallet", { detail: callback })); } catch (e) {}
    try { window.addEventListener("wallet-standard:app-ready", function (e) { callback(e.detail); }); } catch (e) {}
  }

  ${JSON.stringify(o.wallets)}.forEach(function (w) { register(makeWallet(w.id, w.name, w.color)); });
})();
true;`;
}

/** JS that delivers a reply to the page's pending wallet request. */
export function replyScript(id: string, ok: boolean, value: unknown): string {
  return `window.__solanaOS && window.__solanaOS.reply(${JSON.stringify(id)}, ${ok ? "true" : "false"}, ${JSON.stringify(value ?? null)});true;`;
}
