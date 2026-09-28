"use client";

import { useEffect, useState } from "react";
import { Check, Download, ExternalLink, Pin, PinOff, Loader2, Search, Star, Trash2, Users, X } from "lucide-react";
import { Badge, Card, Monogram, Page, PageHeader, Section } from "@/components/ui";
import { BROWSER_EXTENSIONS, chromeWebStoreUrl } from "@/lib/extensions/browser";
import { useAppShell, useDesktopExtensions, type StoreExtension } from "@/lib/client/desktop";
import { appLogo } from "@/lib/catalog/apps";

const RELEASES_URL = "https://github.com/Kennyvincss/SolOS/releases/latest";
const DEFAULT_QUERY = "solana";

type Desktop = ReturnType<typeof useDesktopExtensions>;

interface CardData {
  id: string;
  name: string;
  description: string;
  icon?: string;
  color?: string;
  badge?: string;
  rating?: number | null;
  users?: string | null;
}

function ExtensionCard({ x, desktop, shell }: { x: CardData; desktop: Desktop; shell: "web" | "desktop" | "mobile" }) {
  const installed = desktop.installed.has(x.id);
  const busy = desktop.busy === x.id;
  return (
    <Card className="flex flex-col gap-3 p-4">
      <div className="flex items-start gap-3">
        <Monogram name={x.name} color={x.color ?? "#9945ff"} size={44} src={x.icon} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-[15px] font-semibold">{x.name}</span>
            {x.badge && <Badge>{x.badge}</Badge>}
          </div>
          <div className="flex items-center gap-3 text-[12px] text-faint">
            {x.rating ? (
              <span className="flex items-center gap-1">
                <Star size={11} className="fill-warn text-warn" /> {x.rating.toFixed(1)}
              </span>
            ) : null}
            {x.users ? (
              <span className="flex items-center gap-1">
                <Users size={11} /> {x.users}
              </span>
            ) : null}
            {!x.rating && !x.users && <span>Chrome Web Store</span>}
          </div>
        </div>
      </div>
      <p className="line-clamp-2 flex-1 text-[13px] leading-relaxed text-muted">{x.description || " "}</p>
      <div className="flex items-center justify-end gap-2">
        {desktop.available ? (
          installed ? (
            <>
              <span className="mr-auto flex items-center gap-1 text-[12.5px] text-sol-green">
                <Check size={14} /> Installed
              </span>
              <button onClick={() => desktop.remove(x.id)} disabled={busy} className="btn btn-ghost btn-sm" aria-label={`Remove ${x.name}`}>
                {busy ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />} Remove
              </button>
            </>
          ) : (
            <button onClick={() => desktop.install(x.id, x.name)} disabled={busy} className="btn btn-primary btn-sm">
              {busy ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />} {busy ? "Installing…" : "Install"}
            </button>
          )
        ) : shell === "mobile" ? null : (
          <a href={chromeWebStoreUrl(x.id)} target="_blank" rel="noopener noreferrer" className="btn btn-soft btn-sm">
            Chrome Web Store <ExternalLink size={12} />
          </a>
        )}
      </div>
    </Card>
  );
}

const featured: CardData[] = BROWSER_EXTENSIONS.map((x) => ({
  id: x.id,
  name: x.name,
  description: x.description,
  color: x.color,
  badge: x.kind,
  icon: x.app ? appLogo(x.app) : `/api/extensions/${x.id}/icon`,
}));

// Store result images are sometimes wide promo tiles ("-w275-h175"); use the real icon then.
const isSquareIcon = (url: string) => /^https:\/\/lh\d\.googleusercontent\.com\//.test(url) && !/-w\d+-h\d+/.test(url);
const fromStore = (r: StoreExtension): CardData => ({ id: r.id, name: r.name, description: r.description, icon: isSquareIcon(r.icon) ? r.icon : `/api/extensions/${r.id}/icon`, rating: r.rating, users: r.users });

export default function ExtensionsPage() {
  const shell = useAppShell();
  const desktop = useDesktopExtensions();
  const [input, setInput] = useState("");
  const [query, setQuery] = useState(DEFAULT_QUERY);

  // Links like /extensions?q=phantom&install=1 (used by STRATA AI) open a search
  // and offer to install the best match; ?id=<store id> installs that extension.
  const [autoInstall, setAutoInstall] = useState<{ q?: string; id?: string } | null>(null);
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const q = sp.get("q")?.trim();
    const id = sp.get("id")?.trim();
    if (q) {
      setInput(q);
      setQuery(q);
    }
    if ((q && sp.get("install") === "1") || (id && /^[a-p]{32}$/.test(id))) setAutoInstall({ q: q || undefined, id: id || undefined });
  }, []);

  // In the desktop app, list every Solana extension from the Chrome Web Store (and search any).
  const { canSearch, search } = desktop;
  useEffect(() => {
    if (canSearch) search(query);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canSearch, query]);

  const featuredIds = new Set(featured.map((f) => f.id));
  const storeResults = (desktop.results ?? []).map(fromStore);
  // Use the store's own icon for featured wallets when the search returned it.
  const storeIcon = new Map(storeResults.filter((r) => r.icon && isSquareIcon(r.icon)).map((r) => [r.id, r.icon]));
  const featuredShown = featured.map((f) => (storeIcon.has(f.id) ? { ...f, icon: storeIcon.get(f.id) } : f));
  const isDefault = query === DEFAULT_QUERY;

  // Fire the requested install once the results are in (the app still asks to confirm).
  useEffect(() => {
    if (!autoInstall || !desktop.available) return;
    if (autoInstall.id) {
      const known = [...featured, ...storeResults].find((x) => x.id === autoInstall.id);
      if (!desktop.installed.has(autoInstall.id)) desktop.install(autoInstall.id, known?.name ?? "");
      setAutoInstall(null);
      return;
    }
    if (!desktop.results || desktop.searching) return;
    const q = (autoInstall.q ?? "").toLowerCase();
    const pool = [...featured, ...storeResults];
    const best = pool.find((x) => x.name.toLowerCase() === q) ?? pool.find((x) => x.name.toLowerCase().startsWith(q)) ?? storeResults[0];
    if (best && !desktop.installed.has(best.id)) desktop.install(best.id, best.name);
    setAutoInstall(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoInstall, desktop.available, desktop.results, desktop.searching]);
  // The default view shows featured wallets first, then the rest of the store's Solana extensions.
  const listed = isDefault ? storeResults.filter((r) => !featuredIds.has(r.id)) : storeResults;

  return (
    <Page wide>
      <PageHeader
        title="Extensions"
        subtitle={
          shell === "mobile"
            ? "Phones can't run browser extensions. In the STRATA app, sites connect to your Phantom or Solflare app instead: pick it in any site's “Connect wallet” list."
            : shell === "desktop"
              ? "Every Solana wallet and extension from the Chrome Web Store. Install one and it appears next to the address bar and works on every site, just like in Chrome."
              : "Solana wallets and browser extensions. Get the STRATA desktop app to search the whole Chrome Web Store and install any extension with one click."
        }
      />

      {shell !== "mobile" && (
        <form
          className="mb-6 flex max-w-2xl items-center gap-2 rounded-2xl border border-line bg-surface px-4 py-2.5 focus-within:border-sol-green/50"
          onSubmit={(e) => {
            e.preventDefault();
            const q = input.trim();
            if (!q) return setQuery(DEFAULT_QUERY);
            if (desktop.canSearch) setQuery(q);
            else window.open(`https://chromewebstore.google.com/search/${encodeURIComponent(q)}`, "_blank", "noopener");
          }}
        >
          <Search size={17} className="text-muted" />
          <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Search all extensions (e.g. wallet, trading, Jupiter, sniper, NFT)" className="min-w-0 flex-1 bg-transparent text-[14.5px] outline-none placeholder:text-faint" aria-label="Search extensions" />
          {input && (
            <button type="button" onClick={() => (setInput(""), setQuery(DEFAULT_QUERY))} className="text-muted hover:text-text" aria-label="Clear search">
              <X size={16} />
            </button>
          )}
          <button type="submit" className="btn btn-primary btn-sm">
            Search
          </button>
        </form>
      )}

      {shell === "web" && (
        <a href={RELEASES_URL} target="_blank" rel="noopener noreferrer" className="btn btn-soft btn-sm mb-6">
          <Download size={14} /> Get STRATA for desktop
        </a>
      )}
      {desktop.error && <p className="mb-4 rounded-xl border border-line px-3 py-2 text-[13px] text-down">{desktop.error}</p>}

      {desktop.available && desktop.installedList.length > 0 && (
        <Section id="installed" title="Installed" subtitle="Extensions in your STRATA browser. Pinned ones show next to the address bar; unpinned ones keep working and are in the puzzle-piece Extensions menu.">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {desktop.installedList.map((x) => {
              const busy = desktop.busy === x.id;
              const known = [...featured, ...storeResults].find((f) => f.id === x.id);
              return (
                <Card key={x.id} className="flex items-center gap-3 p-3">
                  <Monogram name={x.name} color={known?.color ?? "#9945ff"} size={40} src={known?.icon ?? `/api/extensions/${x.id}/icon`} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-[14px] font-semibold">{x.name}</span>
                      {!x.hidden && <Badge>Pinned</Badge>}
                    </div>
                    <div className="text-[12px] text-faint">Version {x.version}</div>
                  </div>
                  {desktop.canHide && (
                    <button onClick={() => desktop.setHidden(x.id, !x.hidden)} disabled={busy} className="btn btn-ghost btn-sm" title={x.hidden ? "Pin to toolbar" : "Unpin from toolbar"} aria-label={x.hidden ? `Pin ${x.name}` : `Unpin ${x.name}`}>
                      {x.hidden ? <Pin size={14} /> : <PinOff size={14} />} {x.hidden ? "Pin" : "Unpin"}
                    </button>
                  )}
                  <button onClick={() => desktop.remove(x.id)} disabled={busy} className="btn btn-ghost btn-sm text-down" aria-label={`Remove ${x.name}`}>
                    {busy ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />} Remove
                  </button>
                </Card>
              );
            })}
          </div>
        </Section>
      )}

      {isDefault && (
        <Section title="Popular Solana wallets">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {featuredShown.map((x) => (
              <ExtensionCard key={x.id} x={x} desktop={desktop} shell={shell} />
            ))}
          </div>
        </Section>
      )}

      {desktop.canSearch && (
        <Section title={isDefault ? "All Solana extensions" : `Results for “${query}”`} subtitle="Live from the Chrome Web Store">
          {desktop.searching && !desktop.results ? (
            <p className="flex items-center gap-2 text-[13.5px] text-muted">
              <Loader2 size={15} className="animate-spin" /> Searching the Chrome Web Store…
            </p>
          ) : listed.length ? (
            <div className={desktop.searching ? "opacity-60" : ""}>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {listed.map((x) => (
                  <ExtensionCard key={x.id} x={x} desktop={desktop} shell={shell} />
                ))}
              </div>
            </div>
          ) : (
            <p className="text-[13.5px] text-muted">{desktop.searchError ?? (desktop.searching ? "Searching…" : "No extensions found. Try another search.")}</p>
          )}
        </Section>
      )}
    </Page>
  );
}
