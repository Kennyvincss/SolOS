"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowUp, Clock, FileText, Globe, History, MessageSquarePlus, ReceiptText, Search, Sparkles, Square, Trash2, Wallet, X, Coins, Layers, TextSelect } from "lucide-react";
import { AssistantBubble, reduceEvent, type AssistantMsg } from "./message";
import { streamChat, useAiContext } from "@/lib/client/ai";
import { useSession } from "@/lib/client/session";
import { useLibrary } from "@/lib/client/library";
import { classifyUrl } from "@/lib/library/classify";
import type { ChatTurn, UserContext } from "@/lib/ai/protocol";
import type { PageType } from "@/lib/library/types";
import { cn } from "../ui";

/** What STRATA AI knows about the page being viewed. */
export interface PageContext {
  url: string;
  title: string;
  type: PageType | string;
  text?: string;
  description?: string;
  selection?: string;
  openTabs?: { title: string; url: string; active?: boolean }[];
}

type Msg = { role: "user"; text: string } | AssistantMsg;
interface Thread {
  id: string;
  title: string;
  updatedAt: number;
  pageTitle?: string;
  msgs: Msg[];
}

const THREADS_KEY = "strata:ai:threads";
const loadThreads = (): Thread[] => {
  try {
    return JSON.parse(localStorage.getItem(THREADS_KEY) ?? "[]") as Thread[];
  } catch {
    return [];
  }
};
const saveThreads = (t: Thread[]) => {
  try {
    localStorage.setItem(THREADS_KEY, JSON.stringify(t.slice(0, 30)));
  } catch {
    /* full */
  }
};
const newId = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

/** Suggested questions for the kind of page being viewed. */
function suggestionsFor(ctx: PageContext | null): string[] {
  const out: string[] = [];
  const t = ctx?.type;
  if (ctx?.selection) out.push("Explain the text I selected");
  if (t === "token") out.push("Analyze this token", "Is this token risky?", "Who are the top holders?");
  else if (t === "wallet") out.push("What has this wallet been buying?", "Analyze this wallet", "What's this wallet's profit and loss?");
  else if (t === "transaction") out.push("Explain this transaction", "Was this transaction safe?");
  else if (t === "market") out.push("Summarize this market", "What are the odds saying?");
  else if (t === "nft") out.push("Tell me about this collection", "Is this collection legit?");
  else if (t === "research") out.push("Summarize this page", "What are the key takeaways?");
  else if (t === "app" || t === "website") out.push("Research this project", "Is this site safe to connect my wallet?", "Summarize this page");
  else out.push("Summarize this page", "What's happening on Solana today?");
  if ((ctx?.openTabs?.length ?? 0) >= 2) out.push("Compare the projects in my open tabs");
  return [...new Set(out)].slice(0, 5);
}

const TYPE_ICON: Partial<Record<string, typeof Globe>> = { token: Coins, wallet: Wallet, transaction: ReceiptText, research: FileText };

interface Props {
  /** "panel": the desktop side panel or the website slide-over; "full": /ai. */
  variant?: "panel" | "full";
  /** Reads the page being viewed. */
  getContext: () => Promise<PageContext | null>;
  /** Subscribe to page changes / prompts pushed from outside (desktop panel). */
  subscribe?: (onPageChanged: () => void, onPrompt: (prompt: string) => void) => () => void;
  /** Open a link (desktop panel: in the browser tab, not the panel). */
  openLink?: (url: string) => boolean;
  onClose?: () => void;
  /** Prompt to send once on open. */
  initialPrompt?: string | null;
}

export function ChatPanel({ variant = "panel", getContext, subscribe, openLink, onClose, initialPrompt }: Props) {
  const session = useSession();
  const base = useAiContext();
  const library = useLibrary();
  const router = useRouter();
  const [threads, setThreads] = useState<Thread[]>([]);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState<"chat" | "history">("chat");
  const [ctx, setCtx] = useState<PageContext | null>(null);
  const [usePage, setUsePage] = useState(true);
  const abortRef = useRef<AbortController | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const sentInitial = useRef(false);

  useEffect(() => setThreads(loadThreads()), []);

  const refreshContext = useCallback(async () => {
    const c = await getContext().catch(() => null);
    setCtx(c);
    return c;
  }, [getContext]);

  useEffect(() => {
    refreshContext();
  }, [refreshContext]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [msgs]);

  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 160)}px`;
  }, [input]);

  // Keep the current conversation in the history list.
  const persist = useCallback(
    (id: string, all: Msg[], pageTitle?: string) => {
      const first = all.find((m) => m.role === "user") as { text: string } | undefined;
      if (!first) return;
      const next: Thread = { id, title: first.text.slice(0, 80), updatedAt: Date.now(), pageTitle, msgs: all.slice(-40).map((m) => (m.role === "assistant" ? { ...m, done: true } : m)) };
      setThreads((cur) => {
        const list = [next, ...cur.filter((t) => t.id !== id)];
        saveThreads(list);
        return list;
      });
    },
    [],
  );

  const send = useCallback(
    async (text: string) => {
      const q = text.trim();
      if (!q || busy) return;
      setInput("");
      setView("chat");
      const page = usePage ? await refreshContext() : null;
      const id = threadId ?? newId();
      if (!threadId) setThreadId(id);
      const history: ChatTurn[] = [
        ...msgs.map((m) => (m.role === "user" ? { role: "user" as const, content: m.text } : { role: "assistant" as const, content: m.text || "(no text)" })),
        { role: "user", content: q },
      ];
      const assistant: AssistantMsg = { role: "assistant", text: "", tools: [], cards: [], sources: [], done: false };
      let all: Msg[] = [...msgs, { role: "user", text: q }, assistant];
      setMsgs(all);
      setBusy(true);
      library.record("ai", q).catch(() => {});
      const context: UserContext = {
        ...base,
        ...(page
          ? {
              pageUrl: page.url,
              pageTitle: page.title?.slice(0, 300),
              pageType: String(page.type),
              pageText: page.text?.slice(0, 6000),
              pageDescription: page.description?.slice(0, 400),
              selection: page.selection?.slice(0, 2000),
              openTabs: page.openTabs?.slice(0, 20).map((t) => ({ title: t.title.slice(0, 300), url: t.url.slice(0, 2000), active: t.active })),
            }
          : {}),
      };
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      let navigate: string | null = null;
      try {
        await streamChat(
          history,
          session.address,
          (e) => {
            if (e.type === "action" && e.action.type === "navigate") navigate = e.action.href;
            setMsgs((cur) => {
              const copy = [...cur];
              copy[copy.length - 1] = reduceEvent(copy[copy.length - 1] as AssistantMsg, e);
              all = copy;
              return copy;
            });
          },
          ctrl.signal,
          context,
        );
      } catch (e) {
        if (!(e instanceof DOMException && e.name === "AbortError")) {
          setMsgs((cur) => {
            const copy = [...cur];
            copy[copy.length - 1] = { ...(copy[copy.length - 1] as AssistantMsg), error: "Connection lost. Please try again." };
            all = copy;
            return copy;
          });
        }
      } finally {
        setMsgs((cur) => {
          const copy = [...cur];
          const last = copy[copy.length - 1];
          if (last?.role === "assistant") copy[copy.length - 1] = { ...last, done: true };
          all = copy;
          return copy;
        });
        setBusy(false);
        abortRef.current = null;
        persist(id, all, page?.title);
      }
      const go = navigate as string | null;
      if (go && !ctrl.signal.aborted) setTimeout(() => (openLink?.(new URL(go, window.location.origin).href) ? undefined : router.push(go)), 900);
    },
    [busy, usePage, refreshContext, threadId, msgs, library, base, session.address, persist, openLink, router],
  );

  // Page changes and prompts from outside (desktop: page context menu, address bar).
  const sendRef = useRef(send);
  sendRef.current = send;
  useEffect(() => {
    if (!subscribe) return;
    return subscribe(
      () => refreshContext(),
      (prompt) => sendRef.current(prompt),
    );
  }, [subscribe, refreshContext]);

  useEffect(() => {
    if (initialPrompt && !sentInitial.current) {
      sentInitial.current = true;
      setTimeout(() => sendRef.current(initialPrompt), 50);
    }
  }, [initialPrompt]);

  const newChat = () => {
    abortRef.current?.abort();
    setMsgs([]);
    setThreadId(null);
    setView("chat");
  };
  const openThread = (t: Thread) => {
    abortRef.current?.abort();
    setThreadId(t.id);
    setMsgs(t.msgs);
    setView("chat");
  };
  const deleteThread = (id: string) =>
    setThreads((cur) => {
      const list = cur.filter((t) => t.id !== id);
      saveThreads(list);
      if (id === threadId) newChat();
      return list;
    });

  const suggestions = useMemo(() => suggestionsFor(ctx), [ctx]);
  const empty = msgs.length === 0;
  const PageIcon = (ctx && TYPE_ICON[ctx.type]) || Globe;

  const quick = useMemo(() => {
    const t = ctx?.type;
    const q: { label: string; prompt: string; icon: typeof Globe }[] = [{ label: "Summarize page", prompt: "Summarize this page", icon: FileText }];
    if (t === "transaction") q.push({ label: "Explain transaction", prompt: "Explain this transaction", icon: ReceiptText });
    if (t === "wallet") q.push({ label: "Analyze wallet", prompt: "Analyze this wallet: holdings, recent activity and PnL", icon: Wallet });
    if (t === "token") q.push({ label: "Analyze token", prompt: "Analyze this token: price, liquidity, holders and risks", icon: Coins });
    if (t === "app" || t === "website" || t === "research" || t === "strata") q.push({ label: "Research project", prompt: "Research this project: what it does, team, TVL/usage and risks", icon: Search });
    if ((ctx?.openTabs?.length ?? 0) >= 2) q.push({ label: "Compare tabs", prompt: "Compare the projects in my open tabs", icon: Layers });
    if (ctx?.selection) q.unshift({ label: "Explain selection", prompt: "Explain the text I selected", icon: TextSelect });
    return q;
  }, [ctx]);

  return (
    <div
      className={cn("flex h-full min-h-0 flex-col bg-bg", variant === "panel" && "text-[14px]")}
      onClickCapture={(e) => {
        const a = (e.target as HTMLElement).closest("a");
        if (!a || !openLink) return;
        const href = a.getAttribute("href");
        if (!href || href.startsWith("#")) return;
        if (openLink(new URL(href, window.location.origin).href)) e.preventDefault();
      }}
    >
      <header className="flex h-12 shrink-0 items-center gap-1.5 border-b border-line px-3">
        <Sparkles size={16} className="text-sol-green" />
        <span className="text-[14px] font-semibold">STRATA AI</span>
        <div className="flex-1" />
        <button onClick={() => setView(view === "history" ? "chat" : "history")} className={cn("grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-surface-2 hover:text-fg", view === "history" && "bg-surface-2 text-fg")} title="Chat history" aria-label="Chat history">
          <History size={16} />
        </button>
        <button onClick={newChat} className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-surface-2 hover:text-fg" title="New chat" aria-label="New chat">
          <MessageSquarePlus size={16} />
        </button>
        {onClose && (
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-surface-2 hover:text-fg" title="Close" aria-label="Close">
            <X size={16} />
          </button>
        )}
      </header>

      {view === "history" ? (
        <div className="flex-1 overflow-y-auto p-2">
          {threads.length === 0 ? (
            <p className="p-4 text-center text-[13px] text-muted">No conversations yet.</p>
          ) : (
            threads.map((t) => (
              <div key={t.id} className={cn("group flex items-start gap-2 rounded-xl px-3 py-2.5 hover:bg-surface-2", t.id === threadId && "bg-surface-2")}>
                <button onClick={() => openThread(t)} className="min-w-0 flex-1 text-left">
                  <div className="truncate text-[13.5px]">{t.title}</div>
                  <div className="mt-0.5 flex items-center gap-1 truncate text-[11.5px] text-faint">
                    <Clock size={11} /> {new Date(t.updatedAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                    {t.pageTitle ? ` · ${t.pageTitle}` : ""}
                  </div>
                </button>
                <button onClick={() => deleteThread(t.id)} className="grid h-7 w-7 place-items-center rounded-lg text-faint opacity-0 hover:text-down group-hover:opacity-100" aria-label="Delete conversation">
                  <Trash2 size={14} />
                </button>
              </div>
            ))
          )}
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto">
          <div className="px-4 pb-4 pt-4">
            {empty ? (
              <div className="animate-fade-up">
                <div className="flex items-center gap-2 text-[18px] font-semibold tracking-[-0.01em]">Ask about this page</div>
                <p className="mt-1 text-[13px] text-muted">STRATA AI reads the page you&apos;re on and uses live onchain data.</p>
                <div className="mt-4 space-y-1.5">
                  {suggestions.map((s) => (
                    <button key={s} onClick={() => send(s)} className="block w-full rounded-xl border border-line px-3 py-2.5 text-left text-[13px] text-muted transition-colors hover:border-line-strong hover:bg-surface hover:text-fg">
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-5">
                {msgs.map((m, i) =>
                  m.role === "user" ? (
                    <div key={i} className="flex justify-end">
                      <div className="max-w-[88%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-surface-2 px-3.5 py-2 text-[13.5px]">{m.text}</div>
                    </div>
                  ) : (
                    <div key={i} className="min-w-0">
                      <AssistantBubble m={m} viewer={session.address} />
                    </div>
                  ),
                )}
                <div ref={endRef} />
              </div>
            )}
          </div>
        </div>
      )}

      <div className="shrink-0 border-t border-line bg-bg px-3 pb-3 pt-2">
        {ctx?.url && (
          <div className="mb-2 flex items-center gap-2">
            <button onClick={() => setUsePage(!usePage)} className={cn("flex min-w-0 flex-1 items-center gap-1.5 rounded-lg border px-2 py-1 text-left text-[11.5px] transition-colors", usePage ? "border-line-strong text-muted" : "border-line text-faint line-through")} title={usePage ? "STRATA AI can see this page. Click to leave it out." : "Page left out. Click to include it."}>
              <PageIcon size={12} className="shrink-0" />
              <span className="truncate">{ctx.title || ctx.url}</span>
            </button>
          </div>
        )}
        <div className="no-scrollbar mb-2 flex gap-1.5 overflow-x-auto">
          {quick.map((q) => (
            <button key={q.label} onClick={() => send(q.prompt)} disabled={busy} className="flex shrink-0 items-center gap-1 rounded-full border border-line px-2.5 py-1 text-[11.5px] text-muted transition-colors hover:border-line-strong hover:text-fg disabled:opacity-50">
              <q.icon size={12} /> {q.label}
            </button>
          ))}
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
          className="flex items-end gap-2"
        >
          <div className="flex min-h-[42px] flex-1 items-end rounded-2xl border border-line-strong bg-surface px-3 py-2 focus-within:border-[color-mix(in_srgb,var(--green)_45%,var(--border-strong))]">
            <textarea
              ref={taRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send(input);
                }
              }}
              rows={1}
              placeholder="Ask about this page, a token, a wallet…"
              className="max-h-40 w-full resize-none bg-transparent text-[13.5px] leading-6 outline-none placeholder:text-faint"
            />
          </div>
          {busy ? (
            <button type="button" onClick={() => abortRef.current?.abort()} className="grid h-[42px] w-[42px] shrink-0 place-items-center rounded-full bg-surface-2 text-fg" aria-label="Stop">
              <Square size={14} className="fill-current" />
            </button>
          ) : (
            <button type="submit" disabled={!input.trim()} className="grid h-[42px] w-[42px] shrink-0 place-items-center rounded-full bg-fg text-bg transition-opacity disabled:opacity-30" aria-label="Send">
              <ArrowUp size={17} />
            </button>
          )}
        </form>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ page context sources */

type DesktopPanelBridge = {
  pageContext: (opts?: { text?: boolean }) => Promise<(PageContext & { inPanel?: boolean }) | null>;
  panel: (action: string, arg?: unknown) => Promise<unknown>;
  onPageChanged: (cb: () => void) => () => void;
  onPanelPrompt: (cb: (p: { prompt: string }) => void) => () => void;
};

export function desktopPanelBridge(): DesktopPanelBridge | null {
  if (typeof window === "undefined") return null;
  const b = (window as unknown as { solanaOSDesktop?: Partial<DesktopPanelBridge> }).solanaOSDesktop;
  return b && typeof b.pageContext === "function" ? (b as DesktopPanelBridge) : null;
}

/** Context of the STRATA page behind the website's slide-over panel. */
export function webPageContext(): PageContext {
  const main = document.querySelector("main");
  return {
    url: window.location.href,
    title: document.title,
    type: classifyUrl(window.location.href, window.location.origin),
    text: (main?.innerText ?? "").replace(/\n{3,}/g, "\n\n").slice(0, 6000),
    description: document.querySelector<HTMLMetaElement>('meta[name="description"]')?.content?.slice(0, 300),
    selection: String(window.getSelection() ?? "").slice(0, 2000),
  };
}
