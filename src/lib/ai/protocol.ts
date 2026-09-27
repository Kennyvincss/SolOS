import type { AiCard, AiSource } from "./tools";

/** Newline-delimited JSON events streamed from /api/ai/chat to the chat UI. */
export type AiEvent =
  | { type: "meta"; engine: "groq" | "offline"; model?: string }
  | { type: "tool"; id: string; name: string; label: string; status: "running" | "done" | "error"; error?: string }
  | { type: "text"; delta: string }
  | { type: "card"; card: AiCard }
  | { type: "sources"; sources: AiSource[] }
  | { type: "error"; message: string }
  | { type: "done" };

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

export interface ChatRequest {
  messages: ChatTurn[];
  wallet?: string | null;
}
