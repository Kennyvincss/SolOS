// Account sync for bookmarks and settings.
//
// Runs the sync requests from inside a hidden WebView on the STRATA
// origin, so they carry the login cookie of the STRATA account signed in
// in the browser tabs (web views share one cookie store). Uses the same
// account scope as the desktop app, so bookmarks follow you between devices.

import { forwardRef, useCallback, useImperativeHandle, useRef } from "react";
import { View } from "react-native";
import WebView, { type WebViewMessageEvent } from "react-native-webview";
import { SOLANA_OS_ORIGIN, SOLANA_OS_URL } from "../config";

const ENDPOINT = "/api/sync/desktop";

export type SyncStatus = { status: "off" | "ok" | "signed-out" | "unavailable" | "error"; at: number | null; error: string | null };

export interface SyncHandle {
  /** Download, let `merge` combine it with local data, upload the result. */
  run(merge: (remote: unknown) => unknown): Promise<SyncStatus>;
}

function fetchScript(id: string, method: "GET" | "PUT", body?: unknown): string {
  const init = method === "GET" ? "{ credentials: 'include', cache: 'no-store' }" : `{ method: 'PUT', credentials: 'include', headers: { 'content-type': 'application/json' }, body: ${JSON.stringify(JSON.stringify({ data: body }))} }`;
  return `(function(){
  fetch(${JSON.stringify(ENDPOINT)}, ${init})
    .then(function (r) { return r.text().then(function (t) { var j = null; try { j = JSON.parse(t); } catch (e) {} window.ReactNativeWebView.postMessage(JSON.stringify({ __sync: ${JSON.stringify(id)}, status: r.status, body: j })); }); })
    .catch(function (e) { window.ReactNativeWebView.postMessage(JSON.stringify({ __sync: ${JSON.stringify(id)}, status: 0, body: null })); });
})();true;`;
}

export const SyncView = forwardRef<SyncHandle>(function SyncView(_props, ref) {
  const web = useRef<WebView>(null);
  const ready = useRef<Promise<void> | null>(null);
  const markReady = useRef<(() => void) | null>(null);
  const waiting = useRef(new Map<string, (r: { status: number; body: unknown }) => void>());
  const seq = useRef(0);

  if (!ready.current) ready.current = new Promise((r) => (markReady.current = r));

  const request = useCallback(async (method: "GET" | "PUT", body?: unknown) => {
    await ready.current;
    const id = `s${++seq.current}`;
    return new Promise<{ status: number; body: unknown }>((resolve) => {
      const timer = setTimeout(() => {
        waiting.current.delete(id);
        resolve({ status: 0, body: null });
      }, 20000);
      waiting.current.set(id, (r) => {
        clearTimeout(timer);
        resolve(r);
      });
      web.current?.injectJavaScript(fetchScript(id, method, body));
    });
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      async run(merge) {
        const get = await request("GET");
        if (get.status === 401) return { status: "signed-out", at: null, error: null };
        if (get.status === 501) return { status: "unavailable", at: null, error: "Sync isn't set up on the STRATA server yet." };
        if (get.status !== 200) return { status: "error", at: null, error: get.status ? `Sync failed (${get.status})` : "Couldn't reach STRATA" };
        const upload = merge((get.body as { data?: unknown } | null)?.data ?? null);
        const put = await request("PUT", upload);
        if (put.status !== 200) return { status: "error", at: null, error: `Sync failed (${put.status})` };
        return { status: "ok", at: Date.now(), error: null };
      },
    }),
    [request],
  );

  const onMessage = (e: WebViewMessageEvent) => {
    // Only trust messages from our own origin (this view never leaves it).
    if (!e.nativeEvent.url.startsWith(SOLANA_OS_ORIGIN + "/")) return;
    try {
      const m = JSON.parse(e.nativeEvent.data) as { __sync?: string; status: number; body: unknown };
      if (!m.__sync) return;
      const cb = waiting.current.get(m.__sync);
      waiting.current.delete(m.__sync);
      cb?.({ status: m.status, body: m.body });
    } catch {
      /* ignore */
    }
  };

  return (
    <View style={{ width: 0, height: 0, position: "absolute", opacity: 0 }} pointerEvents="none">
      <WebView
        ref={web}
        source={{ uri: SOLANA_OS_URL + ENDPOINT }}
        onLoadEnd={() => markReady.current?.()}
        onError={() => markReady.current?.()}
        onMessage={onMessage}
        onShouldStartLoadWithRequest={(r) => r.url.startsWith(SOLANA_OS_ORIGIN + "/")}
        style={{ width: 1, height: 1 }}
      />
    </View>
  );
});
