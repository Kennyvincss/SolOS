"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, Sparkles } from "lucide-react";
import { AssistantBubble, reduceEvent, type AssistantMsg } from "./message";
import { streamChat, useAiContext } from "@/lib/client/ai";
import { useSession } from "@/lib/client/session";
import { Card, cn } from "../ui";

/** Streams a short STRATA AI answer at the top of the results page. */
export function InlineAnswer({ question, variant = "card" }: { question: string; variant?: "card" | "lite" }) {
  const session = useSession();
  const aiContext = useAiContext();
  const ctxRef = useRef(aiContext);
  ctxRef.current = aiContext;
  const [m, setM] = useState<AssistantMsg | null>(null);
  const ran = useRef<string | null>(null);
  useEffect(() => {
    if (ran.current === question) return;
    ran.current = question;
    const ctrl = new AbortController();
    setM({ role: "assistant", text: "", tools: [], cards: [], sources: [], done: false });
    streamChat([{ role: "user", content: `${question}\n\n(Answer concisely for a search results page: at most ~120 words plus the key data.)` }], session.address, (e) => setM((cur) => (cur ? reduceEvent(cur, e) : cur)), ctrl.signal, ctxRef.current).catch(() => {});
    return () => ctrl.abort();
  }, [question, session.address]);
  if (!m) return null;
  return (
    <Card className={cn("overflow-hidden", variant === "lite" ? "mb-8 rounded-2xl border-[color-mix(in_srgb,var(--green)_22%,var(--border))] bg-[color-mix(in_srgb,var(--green)_3%,var(--surface))] p-4 shadow-none sm:p-5" : "mb-6 p-4 sm:p-5")}>
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2 text-[13px] font-medium">
          <Sparkles size={15} className="text-sol-green" /> {variant === "lite" ? "Ask STRATA" : "STRATA AI"}
        </div>
        <Link href={`/ai?q=${encodeURIComponent(question)}`} className="flex items-center gap-1 text-[12.5px] text-muted hover:text-fg">
          {variant === "lite" ? "Keep asking" : "Continue in chat"} <ArrowRight size={12} />
        </Link>
      </div>
      <AssistantBubble m={m} viewer={session.address} />
    </Card>
  );
}

