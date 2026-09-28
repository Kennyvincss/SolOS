"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Bookmark as BookmarkIcon, Clock, FolderPlus, Folder, GripVertical, Pencil, Plus, Search, Star, Trash2, X, Check, Inbox } from "lucide-react";
import { Card, EmptyState, Page, PageHeader, cn } from "@/components/ui";
import { SiteIcon } from "@/components/library";
import { useLibraryData } from "@/lib/client/library";
import type { Bookmark, BookmarkFolder, PageType } from "@/lib/library/types";
import { TYPE_LABEL } from "@/lib/library/types";
import { timeAgo } from "@/lib/format";

type View = { kind: "all" } | { kind: "favorites" } | { kind: "recent" } | { kind: "folder"; id: string | null };

const TYPE_FILTERS: (PageType | "")[] = ["", "token", "wallet", "app", "transaction", "market", "nft", "research", "website"];

function host(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function Bookmarks() {
  const params = useSearchParams();
  const { data, api, reload } = useLibraryData((a) => a.bookmarks());
  const [view, setView] = useState<View>({ kind: "all" });
  const [q, setQ] = useState("");
  const [type, setType] = useState<PageType | "">("");
  const [editing, setEditing] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [drag, setDrag] = useState<{ kind: "bookmark" | "folder"; id: string } | null>(null);
  const [over, setOver] = useState<string | null>(null);

  useEffect(() => {
    const f = params.get("folder");
    if (f) setView({ kind: "folder", id: f });
  }, [params]);

  const bookmarks = useMemo(() => data?.bookmarks ?? [], [data]);
  const folders = useMemo(() => data?.folders ?? [], [data]);
  const count = (id: string | null) => bookmarks.filter((b) => b.folderId === id).length;

  const shown = useMemo(() => {
    let list = bookmarks;
    if (view.kind === "favorites") list = list.filter((b) => b.favorite);
    if (view.kind === "folder") list = list.filter((b) => b.folderId === view.id);
    if (view.kind === "recent") list = [...list].sort((a, b) => b.createdAt - a.createdAt).slice(0, 50);
    if (type) list = list.filter((b) => b.type === type);
    const needle = q.trim().toLowerCase();
    if (needle) list = list.filter((b) => `${b.title} ${b.url}`.toLowerCase().includes(needle));
    return list;
  }, [bookmarks, view, type, q]);

  const title = view.kind === "all" ? "All bookmarks" : view.kind === "favorites" ? "Favorites" : view.kind === "recent" ? "Recently added" : view.id === null ? "Other bookmarks" : (folders.find((f) => f.id === view.id)?.name ?? "Folder");
  const currentFolder = view.kind === "folder" ? view.id : null;

  const dropOnFolder = async (folderId: string | null) => {
    if (drag?.kind === "bookmark") await api.moveBookmark(drag.id, folderId);
    setDrag(null);
    setOver(null);
    reload();
  };

  return (
    <Page wide>
      <PageHeader
        title="Bookmarks"
        subtitle="Websites, apps, tokens, wallets, transactions, markets and research you saved. Drag bookmarks onto a folder to organize them."
        actions={
          <div className="flex gap-2">
            <button onClick={() => setAdding(true)} className="btn btn-primary btn-sm">
              <Plus size={14} /> Add bookmark
            </button>
            <button
              onClick={async () => {
                const f = await api.createFolder("New folder");
                reload();
                if (f) {
                  setView({ kind: "folder", id: f.id });
                  setRenaming(f.id);
                }
              }}
              className="btn btn-ghost btn-sm"
            >
              <FolderPlus size={14} /> New folder
            </button>
          </div>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[240px_1fr]">
        <nav className="space-y-0.5 lg:sticky lg:top-6 lg:self-start">
          <NavItem icon={<BookmarkIcon size={15} />} label="All bookmarks" count={bookmarks.length} active={view.kind === "all"} onClick={() => setView({ kind: "all" })} />
          <NavItem icon={<Star size={15} />} label="Favorites" count={bookmarks.filter((b) => b.favorite).length} active={view.kind === "favorites"} onClick={() => setView({ kind: "favorites" })} />
          <NavItem icon={<Clock size={15} />} label="Recently added" active={view.kind === "recent"} onClick={() => setView({ kind: "recent" })} />
          <div className="px-3 pb-1 pt-4 text-[11.5px] font-medium uppercase tracking-[0.08em] text-faint">Folders</div>
          {folders.map((f) => (
            <div
              key={f.id}
              draggable={renaming !== f.id}
              onDragStart={() => setDrag({ kind: "folder", id: f.id })}
              onDragEnd={() => (setDrag(null), setOver(null))}
              onDragOver={(e) => {
                e.preventDefault();
                setOver(f.id);
              }}
              onDragLeave={() => setOver((o) => (o === f.id ? null : o))}
              onDrop={async (e) => {
                e.preventDefault();
                if (drag?.kind === "folder" && drag.id !== f.id) {
                  await api.moveFolder(drag.id, f.id);
                  setDrag(null);
                  setOver(null);
                  reload();
                } else dropOnFolder(f.id);
              }}
              className={cn("rounded-xl", over === f.id && "ring-2 ring-[var(--green)]")}
            >
              {renaming === f.id ? (
                <FolderRename
                  folder={f}
                  onDone={async (name) => {
                    if (name !== null) await api.renameFolder(f.id, name || f.name);
                    setRenaming(null);
                    reload();
                  }}
                />
              ) : (
                <NavItem
                  icon={<Folder size={15} />}
                  label={f.name}
                  count={count(f.id)}
                  active={view.kind === "folder" && view.id === f.id}
                  onClick={() => setView({ kind: "folder", id: f.id })}
                  actions={
                    <>
                      <button onClick={(e) => (e.stopPropagation(), setRenaming(f.id))} className="grid h-6 w-6 place-items-center rounded-md text-faint hover:text-fg" aria-label={`Rename ${f.name}`}>
                        <Pencil size={12} />
                      </button>
                      <button
                        onClick={async (e) => {
                          e.stopPropagation();
                          if (!confirm(`Delete the “${f.name}” folder? Its bookmarks move to Other bookmarks.`)) return;
                          await api.removeFolder(f.id);
                          if (view.kind === "folder" && view.id === f.id) setView({ kind: "all" });
                          reload();
                        }}
                        className="grid h-6 w-6 place-items-center rounded-md text-faint hover:text-down"
                        aria-label={`Delete ${f.name}`}
                      >
                        <Trash2 size={12} />
                      </button>
                    </>
                  }
                />
              )}
            </div>
          ))}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setOver("__other");
            }}
            onDragLeave={() => setOver(null)}
            onDrop={(e) => {
              e.preventDefault();
              dropOnFolder(null);
            }}
            className={cn("rounded-xl", over === "__other" && "ring-2 ring-[var(--green)]")}
          >
            <NavItem icon={<Inbox size={15} />} label="Other bookmarks" count={count(null)} active={view.kind === "folder" && view.id === null} onClick={() => setView({ kind: "folder", id: null })} />
          </div>
        </nav>

        <div className="min-w-0">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <h2 className="mr-auto text-[17px] font-semibold">{title}</h2>
            <label className="flex h-9 w-full items-center gap-2 rounded-xl border border-line bg-surface px-3 sm:w-64">
              <Search size={14} className="text-faint" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search bookmarks" className="min-w-0 flex-1 bg-transparent text-[13.5px] outline-none placeholder:text-faint" />
            </label>
          </div>
          <div className="no-scrollbar mb-4 flex gap-1.5 overflow-x-auto">
            {TYPE_FILTERS.map((t) => (
              <button key={t || "all"} onClick={() => setType(t)} className={cn("shrink-0 rounded-full border px-3 py-1 text-[12.5px] transition-colors", type === t ? "border-transparent bg-fg text-bg" : "border-line text-muted hover:text-fg")}>
                {t ? TYPE_LABEL[t] : "All types"}
              </button>
            ))}
          </div>

          {adding && (
            <AddBookmark
              folders={folders}
              defaultFolder={currentFolder}
              onCancel={() => setAdding(false)}
              onAdd={async (b) => {
                await api.addBookmark(b);
                setAdding(false);
                reload();
              }}
            />
          )}

          {!data ? null : shown.length === 0 ? (
            <Card>
              <EmptyState
                icon={<BookmarkIcon size={20} />}
                title={q || type ? "No matching bookmarks" : "Nothing here yet"}
                body={q || type ? "Try another search or type." : "Bookmark pages with the star in the address bar (or the Bookmark button on token, wallet and app pages)."}
              />
            </Card>
          ) : (
            <Card className="divide-y divide-line overflow-hidden">
              {shown.map((b) =>
                editing === b.url ? (
                  <EditRow
                    key={b.url}
                    b={b}
                    folders={folders}
                    onCancel={() => setEditing(null)}
                    onSave={async (patch) => {
                      await api.updateBookmark(b.url, patch);
                      setEditing(null);
                      reload();
                    }}
                  />
                ) : (
                  <div
                    key={b.url}
                    draggable
                    onDragStart={() => setDrag({ kind: "bookmark", id: b.url })}
                    onDragEnd={() => (setDrag(null), setOver(null))}
                    onDragOver={(e) => {
                      if (drag?.kind !== "bookmark" || drag.id === b.url) return;
                      e.preventDefault();
                      setOver(`b:${b.url}`);
                    }}
                    onDragLeave={() => setOver((o) => (o === `b:${b.url}` ? null : o))}
                    onDrop={async (e) => {
                      e.preventDefault();
                      if (drag?.kind === "bookmark" && drag.id !== b.url) await api.moveBookmark(drag.id, b.folderId, b.url);
                      setDrag(null);
                      setOver(null);
                      reload();
                    }}
                    className={cn("group flex items-center gap-3 px-3 py-2.5 transition-colors hover:bg-surface-2", over === `b:${b.url}` && "shadow-[inset_0_2px_0_var(--green)]", drag?.id === b.url && "opacity-40")}
                  >
                    <GripVertical size={14} className="shrink-0 cursor-grab text-faint opacity-0 group-hover:opacity-100" />
                    <SiteIcon url={b.url} type={b.type} />
                    <a href={b.url} className="min-w-0 flex-1">
                      <div className="truncate text-[14px] font-medium">{b.title}</div>
                      <div className="truncate text-[12px] text-faint">
                        {TYPE_LABEL[b.type] ?? "Website"} · {host(b.url)}
                        {view.kind !== "folder" && b.folderId && folders.some((f) => f.id === b.folderId) ? ` · ${folders.find((f) => f.id === b.folderId)!.name}` : ""} · {timeAgo(b.createdAt)}
                      </div>
                    </a>
                    <div className="flex shrink-0 items-center gap-0.5">
                      <button onClick={async () => (await api.updateBookmark(b.url, { favorite: !b.favorite }), reload())} className={cn("grid h-8 w-8 place-items-center rounded-lg hover:bg-surface-3", b.favorite ? "text-warn" : "text-faint hover:text-fg")} title={b.favorite ? "Remove from favorites" : "Add to favorites"} aria-label="Favorite">
                        <Star size={15} className={b.favorite ? "fill-current" : undefined} />
                      </button>
                      <button onClick={() => setEditing(b.url)} className="grid h-8 w-8 place-items-center rounded-lg text-faint opacity-0 hover:bg-surface-3 hover:text-fg group-hover:opacity-100" title="Edit" aria-label="Edit bookmark">
                        <Pencil size={14} />
                      </button>
                      <button onClick={async () => (await api.removeBookmark(b.url), reload())} className="grid h-8 w-8 place-items-center rounded-lg text-faint opacity-0 hover:bg-surface-3 hover:text-down group-hover:opacity-100" title="Delete" aria-label="Delete bookmark">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ),
              )}
            </Card>
          )}
          <p className="mt-3 text-[12px] text-faint">{api.kind === "desktop" ? "These are the bookmarks of your current STRATA profile." : "Signed in? Your bookmarks sync to your account."}</p>
        </div>
      </div>
    </Page>
  );
}

function NavItem({ icon, label, count, active, onClick, actions }: { icon: React.ReactNode; label: string; count?: number; active: boolean; onClick: () => void; actions?: React.ReactNode }) {
  return (
    <div onClick={onClick} className={cn("group flex cursor-pointer items-center gap-2.5 rounded-xl px-3 py-2 text-[13.5px] transition-colors", active ? "bg-surface-2 font-medium text-fg" : "text-muted hover:bg-surface hover:text-fg")}>
      <span className={active ? "text-sol-green" : "text-faint"}>{icon}</span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {actions && <span className="hidden items-center group-hover:flex">{actions}</span>}
      {count !== undefined && <span className="text-[12px] text-faint group-hover:hidden">{count}</span>}
    </div>
  );
}

function FolderRename({ folder, onDone }: { folder: BookmarkFolder; onDone: (name: string | null) => void }) {
  const [name, setName] = useState(folder.name);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onDone(name.trim());
      }}
      className="flex items-center gap-1 px-1 py-1"
    >
      <input autoFocus value={name} onChange={(e) => setName(e.target.value)} onBlur={() => onDone(name.trim())} onKeyDown={(e) => e.key === "Escape" && onDone(null)} className="h-8 min-w-0 flex-1 rounded-lg border border-line-strong bg-surface px-2 text-[13px] outline-none" />
    </form>
  );
}

function AddBookmark({ folders, defaultFolder, onAdd, onCancel }: { folders: BookmarkFolder[]; defaultFolder: string | null; onAdd: (b: { url: string; title: string; folderId: string | null }) => void; onCancel: () => void }) {
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [folderId, setFolderId] = useState<string | null>(defaultFolder);
  const valid = /^https?:\/\/\S+\.\S+/.test(url.trim()) || /^[\w-]+(\.[\w-]+)+/.test(url.trim());
  return (
    <Card className="mb-4 p-4">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!valid) return;
          const u = /^https?:\/\//.test(url.trim()) ? url.trim() : `https://${url.trim()}`;
          onAdd({ url: u, title: title.trim() || u, folderId });
        }}
        className="grid gap-3 sm:grid-cols-[1fr_1fr_180px_auto]"
      >
        <input autoFocus value={url} onChange={(e) => setUrl(e.target.value)} placeholder="URL (e.g. jup.ag or a token page link)" className="h-9 rounded-xl border border-line bg-surface px-3 text-[13.5px] outline-none focus:border-line-strong" />
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Name (optional)" className="h-9 rounded-xl border border-line bg-surface px-3 text-[13.5px] outline-none focus:border-line-strong" />
        <select value={folderId ?? ""} onChange={(e) => setFolderId(e.target.value || null)} className="h-9 rounded-xl border border-line bg-surface px-2 text-[13.5px] outline-none">
          <option value="">Other bookmarks</option>
          {folders.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </select>
        <div className="flex gap-2">
          <button type="submit" disabled={!valid} className="btn btn-primary btn-sm h-9 disabled:opacity-40">
            Add
          </button>
          <button type="button" onClick={onCancel} className="btn btn-ghost btn-sm h-9">
            Cancel
          </button>
        </div>
      </form>
    </Card>
  );
}

function EditRow({ b, folders, onSave, onCancel }: { b: Bookmark; folders: BookmarkFolder[]; onSave: (p: { title: string; newUrl: string; folderId: string | null }) => void; onCancel: () => void }) {
  const [title, setTitle] = useState(b.title);
  const [url, setUrl] = useState(b.url);
  const [folderId, setFolderId] = useState<string | null>(b.folderId);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSave({ title: title.trim() || b.title, newUrl: url.trim(), folderId });
      }}
      className="grid gap-2 bg-surface-2 px-3 py-3 sm:grid-cols-[1fr_1fr_160px_auto]"
    >
      <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} className="h-9 rounded-lg border border-line bg-surface px-2.5 text-[13.5px] outline-none" aria-label="Name" />
      <input value={url} onChange={(e) => setUrl(e.target.value)} className="h-9 rounded-lg border border-line bg-surface px-2.5 text-[13.5px] outline-none" aria-label="URL" />
      <select value={folderId ?? ""} onChange={(e) => setFolderId(e.target.value || null)} className="h-9 rounded-lg border border-line bg-surface px-2 text-[13.5px] outline-none" aria-label="Folder">
        <option value="">Other bookmarks</option>
        {folders.map((f) => (
          <option key={f.id} value={f.id}>
            {f.name}
          </option>
        ))}
      </select>
      <div className="flex gap-1">
        <button type="submit" className="grid h-9 w-9 place-items-center rounded-lg bg-fg text-bg" aria-label="Save">
          <Check size={15} />
        </button>
        <button type="button" onClick={onCancel} className="grid h-9 w-9 place-items-center rounded-lg border border-line text-muted" aria-label="Cancel">
          <X size={15} />
        </button>
      </div>
    </form>
  );
}

export default function BookmarksPage() {
  return (
    <Suspense>
      <Bookmarks />
    </Suspense>
  );
}
