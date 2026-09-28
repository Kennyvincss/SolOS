import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, AppState, BackHandler, Keyboard, Platform, Pressable, Share, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import WebView, { type WebViewMessageEvent, type WebViewNavigation } from "react-native-webview";
import type { ShouldStartLoadRequest } from "react-native-webview/lib/WebViewTypes";
import * as Linking from "expo-linking";
import { Ionicons } from "@expo/vector-icons";
import nacl from "tweetnacl";
import bs58 from "bs58";

import { APP_VERSION, MAX_TABS, SCHEME, SOLANA_OS_ORIGIN, SOLANA_OS_URL } from "../config";
import { decideNavigation, displayUrl, hostOf, normalizeInput, originOf, riskFromReport, walletBrowseUrl, type Risk } from "../lib/url";
import { addHistory, applyRemote, isBookmarked, toggleBookmark, type Library, EMPTY_LIBRARY } from "../lib/library";
import { loadLibrary, loadTabs, saveLibrary, saveTabs } from "../storage";
import { WalletBridge, parseWalletRequest } from "../wallet/bridge";
import { injectedScript, replyScript } from "../wallet/injected";
import { WALLET_APPS } from "../wallet/protocol";
import { SyncView, type SyncHandle, type SyncStatus } from "./SyncView";
import { LibrarySheet, MenuSheet, TabsSheet, type MenuItem } from "./Sheets";
import { C } from "./theme";

interface Tab {
  id: string;
  /** What the WebView is told to load; changing it navigates. */
  src: string;
  url: string;
  title: string;
  loading: boolean;
  progress: number;
  canGoBack: boolean;
  canGoForward: boolean;
}

const bridge = new WalletBridge(SCHEME);
const WALLETS = (Object.keys(WALLET_APPS) as (keyof typeof WALLET_APPS)[]).map((id) => ({ id, name: WALLET_APPS[id].name, color: WALLET_APPS[id].color }));
const USER_AGENT_SUFFIX = `SolanaOSMobile/${APP_VERSION}`;

let tabSeq = 0;
function newTab(url: string, title = ""): Tab {
  return { id: `t${Date.now().toString(36)}${++tabSeq}`, src: url, url, title, loading: true, progress: 0, canGoBack: false, canGoForward: false };
}

const riskCache = new Map<string, Risk | null>();
async function checkRisk(url: string): Promise<Risk | null> {
  const host = hostOf(url);
  if (!host) return null;
  if (host === hostOf(SOLANA_OS_URL)) return { level: "low", label: "Solana OS" };
  if (riskCache.has(host)) return riskCache.get(host) ?? null;
  try {
    const res = await fetch(`${SOLANA_OS_URL}/api/security?q=${encodeURIComponent(url)}`);
    const risk = res.ok ? riskFromReport(await res.json()) : null;
    riskCache.set(host, risk);
    return risk;
  } catch {
    return null;
  }
}

export function Browser() {
  const insets = useSafeAreaInsets();
  const [tabs, setTabs] = useState<Tab[]>(() => [newTab(SOLANA_OS_URL, "Solana OS")]);
  const [activeId, setActiveId] = useState(() => tabs[0].id);
  const [lib, setLib] = useState<Library>(EMPTY_LIBRARY);
  const [address, setAddress] = useState("");
  const [editing, setEditing] = useState(false);
  const [sheet, setSheet] = useState<null | "menu" | "tabs" | "bookmarks" | "history">(null);
  const [risk, setRisk] = useState<Risk | null>(null);
  const [sync, setSync] = useState<SyncStatus>({ status: "off", at: null, error: null });

  const views = useRef(new Map<string, WebView>());
  const tokens = useRef(new Map<string, string>());
  // Stable source objects: a WebView must only (re)load when its source really changes.
  const sources = useRef(new Map<string, { uri: string }>());
  const sourceFor = (t: Tab) => {
    const cur = sources.current.get(t.id);
    if (cur && cur.uri === t.src) return cur;
    const next = { uri: t.src };
    sources.current.set(t.id, next);
    return next;
  };
  const syncRef = useRef<SyncHandle>(null);
  const libRef = useRef(lib);
  libRef.current = lib;
  const restored = useRef(false);
  const initialTabId = useRef(tabs[0].id);

  const tabsRef = useRef(tabs);
  tabsRef.current = tabs;
  const active = tabs.find((t) => t.id === activeId) ?? tabs[0];

  /* ------------------------------------------------------------ persistence */

  useEffect(() => {
    (async () => {
      setLib(await loadLibrary());
      const saved = await loadTabs();
      if (saved) {
        const restoredTabs = saved.tabs.slice(0, MAX_TABS).map((t) => ({ ...newTab(t.url, t.title), id: t.id }));
        const savedActive = restoredTabs.some((t) => t.id === saved.activeId) ? saved.activeId : restoredTabs[0].id;
        // Keep tabs opened while restoring (e.g. a link the app was launched with).
        setTabs((prev) => [...restoredTabs, ...prev.filter((t) => t.id !== initialTabId.current)].slice(-MAX_TABS));
        setActiveId((cur) => (cur === initialTabId.current ? savedActive : cur));
      }
      restored.current = true;
    })();
  }, []);

  useEffect(() => {
    if (restored.current) saveTabs({ tabs: tabs.map((t) => ({ id: t.id, url: t.url, title: t.title })), activeId });
  }, [tabs, activeId]);

  const updateLib = useCallback((fn: (l: Library) => Library) => {
    setLib((prev) => {
      const next = fn(prev);
      saveLibrary(next);
      return next;
    });
  }, []);

  /* ------------------------------------------------------------ sync */

  const lastSync = useRef(0);
  const syncTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const runSync = useCallback(async () => {
    if (!syncRef.current) return;
    lastSync.current = Date.now();
    const status = await syncRef.current.run((remote) => {
      const { lib: merged, upload } = applyRemote(libRef.current, remote);
      updateLib(() => ({ ...merged, lastSync: Date.now() }));
      return upload;
    });
    setSync(status);
  }, [updateLib]);
  const scheduleSync = useCallback(
    (delay = 1500) => {
      if (syncTimer.current) clearTimeout(syncTimer.current);
      syncTimer.current = setTimeout(runSync, delay);
    },
    [runSync],
  );

  useEffect(() => {
    scheduleSync(4000);
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active" && Date.now() - lastSync.current > 30 * 60 * 1000) scheduleSync(1000);
    });
    return () => sub.remove();
  }, [scheduleSync]);

  /* ------------------------------------------------------------ tabs */

  const patchTab = useCallback((id: string, patch: Partial<Tab>) => {
    setTabs((ts) => ts.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  }, []);

  const openTab = useCallback((url: string) => {
    const t = newTab(url);
    setTabs((ts) => [...ts.slice(-(MAX_TABS - 1)), t]);
    setActiveId(t.id);
    setSheet(null);
  }, []);

  const closeTab = useCallback(
    (id: string) => {
      views.current.delete(id);
      tokens.current.delete(id);
      sources.current.delete(id);
      const rest = tabsRef.current.filter((t) => t.id !== id);
      if (!rest.length) {
        const t = newTab(SOLANA_OS_URL, "Solana OS");
        setTabs([t]);
        setActiveId(t.id);
        return;
      }
      setTabs(rest);
      if (id === activeId) setActiveId(rest[rest.length - 1].id);
    },
    [activeId],
  );

  const navigate = useCallback(
    (url: string, tabId = activeId) => {
      const tab = tabsRef.current.find((t) => t.id === tabId);
      if (tab && tab.src === url) {
        // The WebView only reloads when its source changes; go there from inside the page instead.
        if (tab.url === url) views.current.get(tabId)?.reload();
        else views.current.get(tabId)?.injectJavaScript(`window.location.assign(${JSON.stringify(url)});true;`);
        return;
      }
      patchTab(tabId, { src: url, url });
    },
    [activeId, patchTab],
  );

  /* ------------------------------------------------------------ links from outside */

  useEffect(() => {
    const handle = (url: string | null) => {
      if (!url || bridge.handleUrl(url)) return;
      // solanaos://open?url=https://...  or a plain web link shared to the app.
      if (url.startsWith(`${SCHEME}://open`)) {
        const target = Linking.parse(url).queryParams?.url;
        if (typeof target === "string" && /^https?:\/\//i.test(target)) openTab(target);
      } else if (/^https?:\/\//i.test(url)) openTab(url);
    };
    Linking.getInitialURL().then(handle);
    const sub = Linking.addEventListener("url", (e) => handle(e.url));
    return () => sub.remove();
  }, [openTab]);

  /* ------------------------------------------------------------ safety badge */

  useEffect(() => {
    let cancelled = false;
    setRisk(null);
    checkRisk(active.url).then((r) => !cancelled && setRisk(r));
    return () => {
      cancelled = true;
    };
  }, [active.url]);

  /* ------------------------------------------------------------ Android back button */

  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (sheet) {
        setSheet(null);
        return true;
      }
      if (active.canGoBack) {
        views.current.get(active.id)?.goBack();
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [sheet, active]);

  /* ------------------------------------------------------------ WebView handlers */

  const openExternal = (url: string) =>
    Linking.openURL(url).catch(() => Alert.alert("Can't open link", "No app on this phone can open this link."));

  const shouldStart = (tabId: string) => (req: ShouldStartLoadRequest) => {
    const d = decideNavigation(req.url);
    if (d.kind === "load") return true;
    // Only the page itself (not ads or other embedded frames) may hand links to other apps.
    if (req.isTopFrame === false) return false;
    if (d.kind === "open") openExternal(d.url);
    else if (d.kind === "ask")
      Alert.alert("Open in another app?", `This page wants to open a "${d.scheme}:" link.`, [
        { text: "Cancel", style: "cancel" },
        { text: "Open", onPress: () => openExternal(d.url) },
      ]);
    else if (d.kind === "intent") {
      if (d.appUrl) Linking.openURL(d.appUrl).catch(() => d.fallback && navigate(d.fallback, tabId));
      else if (d.fallback) navigate(d.fallback, tabId);
    }
    return false;
  };

  const onNav = (tabId: string) => (n: WebViewNavigation) => {
    patchTab(tabId, { url: n.url, title: n.title || hostOf(n.url) || n.url, loading: n.loading, canGoBack: n.canGoBack, canGoForward: n.canGoForward });
  };

  const onLoadEnd = (tabId: string) => (e: { nativeEvent: { url: string; title: string } }) => {
    const { url, title } = e.nativeEvent;
    patchTab(tabId, { loading: false, progress: 1 });
    updateLib((l) => addHistory(l, url, title));
    // Signing in happens on the Solana OS site; sync soon after visiting it.
    if (url.startsWith(SOLANA_OS_ORIGIN) && Date.now() - lastSync.current > 60 * 1000) scheduleSync(2000);
  };

  const onMessage = (tabId: string) => async (e: WebViewMessageEvent) => {
    let m: { __solanaOS?: string; token?: string; id?: unknown; req?: unknown };
    try {
      m = JSON.parse(e.nativeEvent.data);
    } catch {
      return;
    }
    if (m?.__solanaOS !== "wallet" || typeof m.id !== "string" || m.token !== tokens.current.get(tabId)) return;
    const id = m.id;
    const reply = (ok: boolean, value: unknown) => views.current.get(tabId)?.injectJavaScript(replyScript(id, ok, value));
    const origin = originOf(e.nativeEvent.url);
    const req = parseWalletRequest(m.req);
    if (!origin || !req) return reply(false, "Invalid wallet request");
    try {
      reply(true, await bridge.handle(origin, req));
    } catch (err) {
      reply(false, err instanceof Error ? err.message : "Wallet request failed");
    }
  };

  const scriptFor = (tabId: string) => {
    let token = tokens.current.get(tabId);
    if (!token) {
      token = bs58.encode(nacl.randomBytes(16));
      tokens.current.set(tabId, token);
    }
    return injectedScript({ token, wallets: WALLETS, cleanUserAgent: Platform.OS === "android" });
  };

  /* ------------------------------------------------------------ menu */

  const bookmarked = isBookmarked(lib, active.url);
  const shareable = /^https?:/.test(active.url);
  const menuItems: MenuItem[] = [
    { icon: bookmarked ? "star" : "star-outline", label: bookmarked ? "Remove bookmark" : "Bookmark this page", disabled: !shareable, onPress: () => (updateLib((l) => toggleBookmark(l, active.url, active.title)), scheduleSync()) },
    { icon: "bookmarks-outline", label: "Bookmarks", onPress: () => setSheet("bookmarks") },
    { icon: "time-outline", label: "History", onPress: () => setSheet("history") },
    { icon: "share-outline", label: "Share", disabled: !shareable, onPress: () => Share.share({ message: active.url, url: active.url }) },
    ...WALLETS.map((w) => ({
      icon: "wallet-outline" as const,
      label: `Open in ${w.name}`,
      hint: "For sites that don't list Phantom/Solflare",
      disabled: !shareable,
      onPress: () => openExternal(walletBrowseUrl(w.id, active.url, SOLANA_OS_URL)),
    })),
    {
      icon: "sync-outline",
      label: sync.status === "signed-out" ? "Sign in to sync" : sync.status === "ok" ? "Sync now" : "Sync",
      hint: syncHint(sync),
      onPress: () => (sync.status === "signed-out" ? openTab(`${SOLANA_OS_URL}/login`) : runSync()),
    },
    { icon: "refresh", label: "Reload", onPress: () => views.current.get(active.id)?.reload() },
  ];

  /* ------------------------------------------------------------ render */

  const shownAddress = editing ? address : active.url.startsWith(SOLANA_OS_URL) && displayUrl(active.url, SOLANA_OS_URL) === "" ? "" : hostOf(active.url) ?? active.url;
  const badgeColor = risk?.level === "high" ? C.down : risk?.level === "medium" ? C.warn : risk ? C.up : C.faint;

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      {/* Address bar */}
      <View style={s.topBar}>
        <Pressable
          hitSlop={8}
          onPress={() => Alert.alert(risk?.label ?? "Site safety", risk?.detail ?? "No safety information for this page yet. Solana OS checks sites against its app registry and known scam patterns.")}
          accessibilityLabel="Site safety"
        >
          <Ionicons name={risk?.level === "high" ? "warning" : "shield-checkmark"} size={18} color={badgeColor} />
        </Pressable>
        <TextInput
          style={s.address}
          value={shownAddress}
          placeholder="Search Solana or enter a website"
          placeholderTextColor={C.faint}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType={Platform.OS === "ios" ? "web-search" : "url"}
          returnKeyType="go"
          selectTextOnFocus
          onFocus={() => {
            setAddress(displayUrl(active.url, SOLANA_OS_URL));
            setEditing(true);
          }}
          onBlur={() => setEditing(false)}
          onChangeText={setAddress}
          onSubmitEditing={() => {
            navigate(normalizeInput(address, SOLANA_OS_URL));
            setEditing(false);
            Keyboard.dismiss();
          }}
        />
        <Pressable hitSlop={8} onPress={() => (active.loading ? views.current.get(active.id)?.stopLoading() : views.current.get(active.id)?.reload())} accessibilityLabel={active.loading ? "Stop" : "Reload"}>
          <Ionicons name={active.loading ? "close" : "refresh"} size={20} color={C.muted} />
        </Pressable>
      </View>
      <View style={s.progressTrack}>{active.loading && <View style={[s.progress, { width: `${Math.max(5, active.progress * 100)}%` }]} />}</View>

      {/* Pages */}
      <View style={s.pages}>
        {tabs.map((t) => (
          <View key={t.id} style={[StyleSheet.absoluteFill, { display: t.id === active.id ? "flex" : "none" }]}>
            <WebView
              ref={(r) => {
                if (r) views.current.set(t.id, r);
              }}
              source={sourceFor(t)}
              originWhitelist={["*"]}
              injectedJavaScriptBeforeContentLoaded={scriptFor(t.id)}
              applicationNameForUserAgent={USER_AGENT_SUFFIX}
              onShouldStartLoadWithRequest={shouldStart(t.id)}
              onNavigationStateChange={onNav(t.id)}
              onLoadProgress={(e) => patchTab(t.id, { progress: e.nativeEvent.progress })}
              onLoadEnd={onLoadEnd(t.id)}
              onMessage={onMessage(t.id)}
              onOpenWindow={(e) => {
                const url = e.nativeEvent.targetUrl;
                if (decideNavigation(url).kind === "load") openTab(url);
                else shouldStart(t.id)({ url, isTopFrame: true } as ShouldStartLoadRequest);
              }}
              onContentProcessDidTerminate={() => views.current.get(t.id)?.reload()}
              onRenderProcessGone={() => views.current.get(t.id)?.reload()}
              setSupportMultipleWindows
              allowsBackForwardNavigationGestures
              allowsInlineMediaPlayback
              pullToRefreshEnabled
              webviewDebuggingEnabled={__DEV__}
              decelerationRate="normal"
              style={s.web}
            />
          </View>
        ))}
      </View>

      {/* Toolbar */}
      <View style={[s.toolbar, { paddingBottom: Math.max(insets.bottom, 8) }]}>
        <ToolButton icon="chevron-back" label="Back" disabled={!active.canGoBack} onPress={() => views.current.get(active.id)?.goBack()} />
        <ToolButton icon="chevron-forward" label="Forward" disabled={!active.canGoForward} onPress={() => views.current.get(active.id)?.goForward()} />
        <ToolButton icon="home-outline" label="Solana OS" onPress={() => navigate(SOLANA_OS_URL)} />
        <Pressable style={s.tool} onPress={() => setSheet("tabs")} accessibilityLabel={`${tabs.length} tabs`}>
          <View style={s.tabCount}>
            <Text style={s.tabCountText}>{tabs.length}</Text>
          </View>
        </Pressable>
        <ToolButton icon="ellipsis-horizontal" label="Menu" onPress={() => setSheet("menu")} />
      </View>

      <MenuSheet visible={sheet === "menu"} onClose={() => setSheet(null)} title={active.title || hostOf(active.url) || "Solana OS"} items={menuItems} />
      <TabsSheet
        visible={sheet === "tabs"}
        onClose={() => setSheet(null)}
        tabs={tabs}
        activeId={active.id}
        onSelect={(id) => (setActiveId(id), setSheet(null))}
        onCloseTab={closeTab}
        onNewTab={() => openTab(SOLANA_OS_URL)}
      />
      <LibrarySheet
        visible={sheet === "bookmarks" || sheet === "history"}
        mode={sheet === "history" ? "history" : "bookmarks"}
        lib={lib}
        onClose={() => setSheet(null)}
        onOpen={(url) => (navigate(url), setSheet(null))}
        onRemoveBookmark={(url) => (updateLib((l) => toggleBookmark(l, url, "")), scheduleSync())}
        onClearHistory={() => updateLib((l) => ({ ...l, history: [] }))}
      />
      <SyncView ref={syncRef} />
    </View>
  );
}

function syncHint(s: SyncStatus): string {
  switch (s.status) {
    case "ok":
      return "Bookmarks synced with your Solana OS account";
    case "signed-out":
      return "Sign in to Solana OS to sync bookmarks";
    case "unavailable":
      return s.error ?? "Sync unavailable";
    case "error":
      return s.error ?? "Sync failed";
    default:
      return "Bookmarks sync with your Solana OS account";
  }
}

function ToolButton({ icon, label, onPress, disabled }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable style={s.tool} onPress={onPress} disabled={disabled} accessibilityLabel={label} hitSlop={4}>
      <Ionicons name={icon} size={24} color={disabled ? C.faint : C.text} />
    </Pressable>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  topBar: { flexDirection: "row", alignItems: "center", gap: 10, marginHorizontal: 12, marginVertical: 8, paddingHorizontal: 12, height: 42, borderRadius: 14, backgroundColor: C.surface },
  address: { flex: 1, color: C.text, fontSize: 15, paddingVertical: 0 },
  progressTrack: { height: 2 },
  progress: { height: 2, backgroundColor: C.accent },
  pages: { flex: 1 },
  web: { flex: 1, backgroundColor: C.bg },
  toolbar: { flexDirection: "row", justifyContent: "space-around", paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.line, backgroundColor: C.bg },
  tool: { width: 48, height: 40, alignItems: "center", justifyContent: "center" },
  tabCount: { minWidth: 24, height: 24, paddingHorizontal: 4, borderRadius: 6, borderWidth: 2, borderColor: C.text, alignItems: "center", justifyContent: "center" },
  tabCountText: { color: C.text, fontSize: 12, fontWeight: "700" },
});
