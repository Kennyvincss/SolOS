"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ArrowUp, ChevronLeft, Info, Plus, Sparkles, Square } from "lucide-react";
import { AssistantBubble, reduceEvent, type AssistantMsg } from "@/components/ai/message";
import { streamChat, useAiContext } from "@/lib/client/ai";
import type { AiAction } from "@/lib/ai/protocol";
import { useSession } from "@/lib/client/session";
import type { ChatTurn } from "@/lib/ai/protocol";
import { cn } from "@/components/ui";

type Msg = { role: "user"; text: string } | AssistantMsg;

const STARTERS = [
  "What happened on Solana today?",
  "What are the most active tokens right now?",
  "Show me my portfolio",
  "What are whales buying?",
  "Find new Solana projects",
  "Compare Kamino and marginfi",
  "What can I do with my USDC?",
  "Explain JUP to me like I'm a beginner",
  "Is jup-ag-claim.com safe?",
];

const STORE_KEY = "sos:ai:thread";

function Chat() {
  const params = useSearchParams();
  const router = useRouter();
  const session = useSession();
  const aiContext = useAiContext();
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const started = useRef(false);

  // Restore the current thread for this tab.
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(STORE_KEY);
      if (raw) setMsgs(JSON.parse(raw));
    } catch {}
  }, []);
  useEffect(() => {
    if (busy) return;
    try {
      sessionStorage.setItem(STORE_KEY, JSON.stringify(msgs.slice(-30)));
    } catch {}
  }, [msgs, busy]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [msgs]);

  const send = useCallback(
    async (text: string) => {
      const q = text.trim();
      if (!q || busy) return;
      setInput("");
      const history: ChatTurn[] = [
        ...msgs.map((m) => (m.role === "user" ? { role: "user" as const, content: m.text } : { role: "assistant" as const, content: m.text || "(no text)" })),
        { role: "user", content: q },
      ];
      const assistant: AssistantMsg = { role: "assistant", text: "", tools: [], cards: [], sources: [], done: false };
      setMsgs((m) => [...m, { role: "user", text: q }, assistant]);
      setBusy(true);
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      let navigate: AiAction | null = null;
      try {
        await streamChat(
          history,
          session.address,
          (e) => {
            if (e.type === "action" && e.action.type === "navigate") navigate = e.action;
            setMsgs((all) => {
              const copy = [...all];
              const last = copy[copy.length - 1] as AssistantMsg;
              copy[copy.length - 1] = reduceEvent(last, e);
              return copy;
            });
          },
          ctrl.signal,
          { ...aiContext, page: "/ai" },
        );
      } catch (e) {
        if (!(e instanceof DOMException && e.name === "AbortError")) {
          setMsgs((all) => {
            const copy = [...all];
            copy[copy.length - 1] = { ...(copy[copy.length - 1] as AssistantMsg), error: "Connection lost. Please try again." };
            return copy;
          });
        }
      } finally {
        setMsgs((all) => {
          const copy = [...all];
          const last = copy[copy.length - 1];
          if (last?.role === "assistant") copy[copy.length - 1] = { ...last, done: true };
          return copy;
        });
        setBusy(false);
        abortRef.current = null;
      }
      // The assistant asked to open a page (e.g. "install Phantom"): go there once the answer is shown.
      const go = navigate as AiAction | null;
      if (go && !ctrl.signal.aborted) setTimeout(() => router.push(go.href), 1200);
    },
    [busy, msgs, session.address, aiContext, router],
  );

  // ?q= starts a conversation (from search, command bar, other pages).
  useEffect(() => {
    const q = params.get("q");
    if (q && !started.current) {
      started.current = true;
      router.replace("/ai");
      setMsgs([]);
      setTimeout(() => send(q), 0);
    }
  }, [params, router, send]);

  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 180)}px`;
  }, [input]);

  const engine = msgs.find((m): m is AssistantMsg => m.role === "assistant" && Boolean(m.engine))?.engine ?? session.capabilities?.ai;
  const empty = msgs.length === 0;

  return (
    <div className="flex h-[100dvh] flex-col md:h-dvh">
      <header className="flex h-14 shrink-0 items-center gap-2 border-b border-line bg-bg/80 px-3 backdrop-blur-xl sm:px-5">
        <Link href="/" className="grid h-9 w-9 place-items-center rounded-full text-muted hover:bg-surface-2 md:hidden" aria-label="Back">
          <ChevronLeft size={20} />
        </Link>
        <Sparkles size={17} className="text-sol-green" />
        <span className="text-[15px] font-semibold">Solana AI</span>
        {engine && (
          <span className="rounded-full border border-line px-2 py-0.5 text-[11px] text-faint" title={engine === "offline" ? "No language model configured; answers are templated from live data." : undefined}>
            {engine === "groq" ? "Groq" : "Offline mode"}
          </span>
        )}
        <div className="flex-1" />
        {!empty && (
          <button
            onClick={() => {
              abortRef.current?.abort();
              setMsgs([]);
            }}
            className="btn btn-ghost btn-sm"
          >
            <Plus size={14} /> New chat
          </button>
        )}
      </header>

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-[760px] px-4 pb-6 pt-6 sm:px-6">
          {empty ? (
            <div className="animate-fade-up flex flex-col items-center pt-[6vh] text-center">
              <div className="grid h-12 w-12 place-items-center rounded-2xl border border-line bg-surface">
                <Sparkles size={22} className="text-sol-green" />
              </div>
              <h1 className="mt-4 text-[26px] font-semibold tracking-[-0.02em] sm:text-[30px]">Ask anything about Solana</h1>
              <p className="mt-2 max-w-md text-[14px] text-muted">Answers use live on-chain and market data, link to their sources, and separate verified data from analysis.</p>
              <div className="mt-7 grid w-full gap-2 sm:grid-cols-2">
                {STARTERS.map((s) => (
                  <button key={s} onClick={() => send(s)} className="card card-hover px-4 py-3 text-left text-[13.5px] text-muted hover:text-fg">
                    {s}
                  </button>
                ))}
              </div>
              <div className="mt-6 flex items-start gap-2 text-left text-[12px] leading-relaxed text-faint">
                <Info size={13} className="mt-0.5 shrink-0" />
                <span>
                  Solana AI provides information, not financial advice. <span className="text-muted">Verified data</span> comes from tools and is labelled with its source; <span className="text-muted">analysis</span> is the AI&apos;s interpretation; anything unverifiable is flagged as uncertain.
                </span>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {msgs.map((m, i) =>
                m.role === "user" ? (
                  <div key={i} className="flex justify-end">
                    <div className="max-w-[85%] whitespace-pre-wrap rounded-3xl rounded-br-lg bg-surface-2 px-4 py-2.5 text-[14.5px]">{m.text}</div>
                  </div>
                ) : (
                  <div key={i} className="flex gap-3">
                    <div className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full border border-line">
                      <Sparkles size={13} className="text-sol-green" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <AssistantBubble m={m} viewer={session.address} />
                    </div>
                  </div>
                ),
              )}
              <div ref={endRef} />
            </div>
          )}
        </div>
      </div>

      <div className="pb-safe shrink-0 border-t border-line bg-bg/90 backdrop-blur-xl">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
          className="mx-auto flex w-full max-w-[760px] items-end gap-2 px-3 py-3 sm:px-6"
        >
          <div className="flex min-h-[48px] flex-1 items-end rounded-3xl border border-line-strong bg-surface px-4 py-2.5 focus-within:border-[color-mix(in_srgb,var(--green)_40%,var(--border-strong))]">
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
              placeholder={session.address ? "Ask about tokens, wallets, your portfolio…" : "Ask about tokens, wallets, apps, transactions…"}
              className="max-h-[180px] w-full resize-none bg-transparent text-[15px] leading-6 outline-none placeholder:text-faint"
              aria-label="Message Solana AI"
            />
          </div>
          {busy ? (
            <button type="button" onClick={() => abortRef.current?.abort()} className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-surface-3" aria-label="Stop">
              <Square size={14} className="fill-current" />
            </button>
          ) : (
            <button type="submit" disabled={!input.trim()} className={cn("grid h-12 w-12 shrink-0 place-items-center rounded-full bg-fg text-bg transition-opacity", !input.trim() && "opacity-40")} aria-label="Send">
              <ArrowUp size={19} />
            </button>
          )}
        </form>
      </div>
    </div>
  );
}

export default function AIPage() {
  return (
    <Suspense>
      <Chat />
    </Suspense>
  );
}
