"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Sparkles } from "lucide-react";
import { AssistantBubble, reduceEvent, type AssistantMsg } from "./message";
import { streamChat } from "@/lib/client/ai";
import { useSession } from "@/lib/client/session";
import { Badge, Card, cn } from "../ui";

/** A one-shot Solana AI panel, triggered by a button, that streams an answer in place. */
export function AskAIPanel({ label, prompt, description, className }: { label: string; prompt: string; description?: string; className?: string }) {
  const session = useSession();
  const [m, setM] = useState<AssistantMsg | null>(null);
  const run = () => {
    setM({ role: "assistant", text: "", tools: [], cards: [], sources: [], done: false });
    streamChat([{ role: "user", content: prompt }], session.address, (e) => setM((cur) => (cur ? reduceEvent(cur, e) : cur))).catch(() => {});
  };
  return (
    <Card className={cn("p-4 sm:p-5", className)}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-[14px] font-semibold">
            <Sparkles size={15} className="text-sol-green" /> {label}
            <Badge tone="purple">AI analysis</Badge>
          </div>
          {description && <p className="mt-1 text-[12.5px] text-muted">{description}</p>}
        </div>
        {!m ? (
          <button onClick={run} className="btn btn-soft btn-sm shrink-0">
            Generate
          </button>
        ) : m.done ? (
          <button onClick={run} className="btn btn-ghost btn-sm shrink-0">
            Refresh
          </button>
        ) : null}
      </div>
      {m && (
        <div className="mt-4">
          <AssistantBubble m={m} viewer={session.address} />
          {m.done && (
            <Link href={`/ai?q=${encodeURIComponent(prompt)}`} className="mt-3 inline-flex items-center gap-1 text-[12.5px] text-muted hover:text-fg">
              Continue in Solana AI <ArrowRight size={12} />
            </Link>
          )}
        </div>
      )}
    </Card>
  );
}
