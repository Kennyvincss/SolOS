import localFont from "next/font/local";

// Geist, trimmed to what STRATA uses: weights 400–700 and Latin text plus
// punctuation, arrows and symbols (about half the size of the full fonts).
// Characters outside that fall back to the system font.
export const GeistSans = localFont({
  src: "./fonts/Geist-Variable.woff2",
  variable: "--font-geist-sans",
  weight: "400 700",
});

// Only numbers and addresses use the mono font, so it isn't preloaded.
export const GeistMono = localFont({
  src: "./fonts/GeistMono-Variable.woff2",
  variable: "--font-geist-mono",
  weight: "400 700",
  preload: false,
  adjustFontFallback: false,
  fallback: ["ui-monospace", "SFMono-Regular", "Menlo", "Monaco", "Liberation Mono", "monospace"],
});
