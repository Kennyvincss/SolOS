import type { AiCard, AiSource } from "./tools";

/** Newline-delimited JSON events streamed from /api/ai/chat to the chat UI. */
export type AiEvent =
  | { type: "meta"; engine: "groq" | "offline"; model?: string }
  | { type: "tool"; id: string; name: string; label: string; status: "running" | "done" | "error"; error?: string }
  | { type: "text"; delta: string }
  | { type: "card"; card: AiCard }
  | { type: "sources"; sources: AiSource[] }
  | { type: "action"; action: AiAction }
  | { type: "error"; message: string }
  | { type: "done" };

/** Something the app does for the user after the answer (e.g. open a page). */
export interface AiAction {
  type: "navigate";
  href: string;
  label: string;
}

/** What the app tells Solana AI about the user's session (all optional, all public-data). */
export interface UserContext {
  page?: string;
  app?: "web" | "desktop" | "mobile";
  followed?: { address: string; label?: string }[];
  watchlist?: string[];
  watchAddress?: string;
  installedExtensions?: string[];
}

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

export interface ChatRequest {
  messages: ChatTurn[];
  wallet?: string | null;
}
