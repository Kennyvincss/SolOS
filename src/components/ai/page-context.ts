import { classifyUrl } from "@/lib/library/classify";
import type { PageType } from "@/lib/library/types";

// Small helpers kept apart from the chat UI so pages can use them without
// loading the whole chat (it loads when STRATA AI is opened).

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
