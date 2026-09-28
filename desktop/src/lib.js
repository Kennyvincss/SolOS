// Pure helpers shared by the main process and tests.
// SPDX-License-Identifier: GPL-3.0-only

/** The Solana OS web app shown in the home tab. Override with SOLANA_OS_URL. */
const SOLANA_OS_URL = (process.env.SOLANA_OS_URL || "https://solos-rho.vercel.app").replace(/\/+$/, "");

/** Wallet extensions offered for one-click install (Chrome Web Store IDs). */
const WALLETS = [
  { id: "bfnaelmomeimhlpmgjnjophhpkkoljpa", name: "Phantom", color: "#ab9ff2" },
  { id: "bhhhlbepdkbapadjdnnojkbgioiodbic", name: "Solflare", color: "#fc7227" },
  { id: "aflkmfhebedbjioipglgcbcmnbpgliof", name: "Backpack", color: "#e33e3f" },
];

function hostOf(url) {
  try {
    const u = new URL(url);
    return /^https?:$/.test(u.protocol) ? u.hostname.replace(/^www\./, "") : null;
  } catch {
    return null;
  }
}

/**
 * Address-bar input -> URL. URLs and bare domains open directly; anything else
 * (including Solana addresses and questions) goes to Solana OS search.
 */
function normalizeInput(input, base = SOLANA_OS_URL) {
  const t = String(input || "").trim();
  if (!t) return base;
  if (/^(https?|chrome-extension|about):/i.test(t)) return t;
  if (/^localhost(:\d+)?(\/.*)?$/i.test(t)) return `http://${t}`;
  const looksLikeDomain = !/\s/.test(t) && /^[a-z0-9-]+(\.[a-z0-9-]+)+(:\d+)?(\/.*)?$/i.test(t);
  if (looksLikeDomain) return `https://${t}`;
  return `${base}/search?q=${encodeURIComponent(t)}`;
}

/** Summarise a Solana OS security report (/api/security) into one toolbar badge. */
function riskFromReport(report) {
  const ind = Array.isArray(report?.indicators) ? report.indicators : [];
  if (!ind.length) return null;
  const high = ind.find((i) => i.level === "high");
  if (high) return { level: "high", label: high.label, detail: high.explanation };
  const medium = ind.find((i) => i.level === "medium");
  if (medium) return { level: "medium", label: medium.label, detail: medium.explanation };
  const known = ind.find((i) => i.id === "registry");
  return { level: "low", label: known?.value ? `Known app · ${known.value}` : "No warnings", detail: known?.explanation };
}

module.exports = { SOLANA_OS_URL, WALLETS, hostOf, normalizeInput, riskFromReport };
