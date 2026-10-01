import { Sparkles } from "lucide-react";

/** Shown for the moment the chat takes to load the first time it opens. */
export function ChatLoading() {
  return (
    <div className="grid h-full place-items-center text-muted" role="status" aria-label="Loading STRATA AI">
      <Sparkles size={20} className="animate-pulse" />
    </div>
  );
}
