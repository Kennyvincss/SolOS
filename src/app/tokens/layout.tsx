import { preload } from "react-dom";

/**
 * Start loading the default token list (Trending, 24h) with the page itself,
 * instead of after the JavaScript has loaded and asked for it.
 */
export default function TokensLayout({ children }: { children: React.ReactNode }) {
  preload("/api/tokens?list=trending&interval=24h&limit=50", { as: "fetch", crossOrigin: "anonymous" });
  return children;
}
