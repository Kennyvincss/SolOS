/** Starter projects for the STRATA developer dashboard. */

export type Kind = "extension" | "mini-app" | "agent" | "wallet-tool" | "widget";

export interface StarterInput {
  kind: Kind;
  name: string;
  description: string;
  version: string;
  permissions: string[];
  matches: string[];
  instructions?: string;
  home: string;
}

export const KINDS: { id: Kind; title: string; body: string }[] = [
  { id: "extension", title: "Browser extension", body: "A Chrome-compatible extension (Manifest V3) with a toolbar popup, background worker and content script. Runs in the STRATA browser." },
  { id: "wallet-tool", title: "Wallet tool", body: "An extension that works with the wallet on the page: reads the connected address, checks transactions, adds safety info." },
  { id: "mini-app", title: "Mini app", body: "A small web app that opens in a STRATA tab or split view and uses the STRATA API and the user's wallet." },
  { id: "agent", title: "AI agent", body: "Instructions and tools for a STRATA AI agent that answers questions or watches wallets and tokens for the user." },
  { id: "widget", title: "Data widget", body: "A compact card (price, portfolio, network, yields…) for the STRATA workspace, fed by the STRATA API." },
];

export const EXTENSION_PERMISSIONS: { id: string; label: string }[] = [
  { id: "storage", label: "Store settings" },
  { id: "activeTab", label: "Read the current tab when clicked" },
  { id: "tabs", label: "See open tabs" },
  { id: "notifications", label: "Show notifications" },
  { id: "sidePanel", label: "Side panel" },
  { id: "alarms", label: "Run on a schedule" },
];

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "strata-project";

function readme(i: StarterInput, run: string) {
  return `# ${i.name}

${i.description}

Built for STRATA — the browser for the onchain world.

## Run it

${run}

## STRATA API

\`\`\`js
const res = await fetch("${i.home}/api/tokens/JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN", {
  headers: { "x-strata-key": "YOUR_API_KEY" }, // optional: counts toward your developer analytics
});
const token = await res.json();
\`\`\`

Docs: ${i.home}/developers/docs
`;
}

function extensionFiles(i: StarterInput, wallet: boolean): Record<string, string> {
  const matches = i.matches.length ? i.matches : ["https://*/*"];
  const manifest = {
    manifest_version: 3,
    name: i.name,
    version: i.version,
    description: i.description,
    action: { default_title: i.name, default_popup: "popup.html" },
    background: { service_worker: "background.js" },
    permissions: i.permissions,
    host_permissions: [`${i.home}/*`],
    content_scripts: [{ matches, js: ["content.js"], run_at: "document_idle" }],
  };
  const popupJs = wallet
    ? `// Shows the wallet connected on the current page and its STRATA risk check.
const API = "${i.home}";
const out = document.getElementById("out");
chrome.tabs.query({ active: true, currentWindow: true }, async ([tab]) => {
  const [{ result } = {}] = await chrome.scripting?.executeScript?.({ target: { tabId: tab.id }, world: "MAIN", func: () => window.solana?.publicKey?.toString() ?? null }).catch(() => []) ?? [];
  if (!result) return (out.textContent = "No wallet connected on this page.");
  const r = await fetch(\`\${API}/api/security?q=\${result}\`).then((x) => x.json());
  out.textContent = \`\${result.slice(0, 4)}…\${result.slice(-4)}: \${r.indicators?.[0]?.label ?? "no warnings"}\`;
});
`
    : `// Popup: shows the SOL price from the STRATA API.
const API = "${i.home}";
fetch(\`\${API}/api/tokens/So11111111111111111111111111111111111111112\`)
  .then((r) => r.json())
  .then((t) => (document.getElementById("out").textContent = \`SOL $\${Number(t.data?.priceUsd ?? t.priceUsd).toFixed(2)}\`))
  .catch(() => (document.getElementById("out").textContent = "Couldn't load right now."));
`;
  if (wallet && !manifest.permissions.includes("scripting")) manifest.permissions = [...manifest.permissions, "scripting", "activeTab"];
  return {
    "manifest.json": JSON.stringify(manifest, null, 2),
    "popup.html": `<!doctype html>
<html>
  <head><meta charset="utf-8" /><style>body{margin:0;width:280px;padding:16px;font:14px system-ui;background:#0b0b10;color:#f3f4f6}h1{font-size:15px;margin:0 0 8px}</style></head>
  <body>
    <h1>${i.name}</h1>
    <div id="out">Loading…</div>
    <script src="popup.js"></script>
  </body>
</html>
`,
    "popup.js": popupJs,
    "background.js": `// Background service worker.
chrome.runtime.onInstalled.addListener(() => console.log("${i.name} installed"));
`,
    "content.js": `// Runs on matching pages. Keep it small: pages load it on every visit.
console.debug("[${i.name}] content script on", location.hostname);
`,
    "README.md": readme(i, "1. Unzip this folder.\n2. In the STRATA desktop app open ⋮ → Developer → turn on Developer mode, then **Load unpacked extension…** and pick the folder.\n3. Click the puzzle-piece button to open it. Edit files and use Reload on the developer dashboard."),
  };
}

function miniAppFiles(i: StarterInput): Record<string, string> {
  return {
    "index.html": `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${i.name}</title>
    <style>body{margin:0;font:15px system-ui;background:#0b0b10;color:#f3f4f6}main{max-width:720px;margin:40px auto;padding:0 20px}button{padding:10px 16px;border-radius:10px;border:0;background:#9b9cff;color:#0b0b12;font-weight:600}</style>
  </head>
  <body>
    <main>
      <h1>${i.name}</h1>
      <p>${i.description}</p>
      <button id="connect">Connect wallet</button>
      <pre id="out"></pre>
    </main>
    <script src="app.js"></script>
  </body>
</html>
`,
    "app.js": `// Uses the wallet on the page (Phantom, Solflare, Backpack… installed in STRATA) and the STRATA API.
const API = "${i.home}";
const out = document.getElementById("out");
document.getElementById("connect").onclick = async () => {
  const provider = window.phantom?.solana ?? window.solflare ?? window.solana;
  if (!provider) return (out.textContent = "Install a wallet in STRATA (Extensions page) to continue.");
  const { publicKey } = await provider.connect();
  const address = publicKey.toString();
  const portfolio = await fetch(\`\${API}/api/wallets/\${address}\`).then((r) => r.json());
  out.textContent = JSON.stringify(portfolio.data?.totalUsd ?? portfolio, null, 2);
};
`,
    "README.md": readme(i, "Serve the folder (e.g. `npx serve .`) and open it in STRATA. Try it next to STRATA AI with split view."),
  };
}

function agentFiles(i: StarterInput): Record<string, string> {
  const agent = {
    name: i.name,
    version: i.version,
    description: i.description,
    instructions: i.instructions || "You watch the user's followed wallets and explain notable trades in plain English.",
    tools: ["get_token", "get_wallet_portfolio", "get_wallet_activity", "explain_transaction", "check_security", "search_solana"],
  };
  return {
    "agent.json": JSON.stringify(agent, null, 2),
    "run.mjs": `// Ask STRATA AI with your agent's instructions (Node 18+).
import agent from "./agent.json" with { type: "json" };
const question = process.argv.slice(2).join(" ") || "What happened on Solana today?";
const res = await fetch("${i.home}/api/ai/ask", {
  method: "POST",
  headers: { "content-type": "application/json", ...(process.env.STRATA_API_KEY ? { "x-strata-key": process.env.STRATA_API_KEY } : {}) },
  body: JSON.stringify({ prompt: \`\${agent.instructions}\\n\\n\${question}\` }),
});
console.log(await res.text());
`,
    "README.md": readme(i, "`STRATA_API_KEY=... node run.mjs \"Analyze wallet <address>\"`"),
  };
}

function widgetFiles(i: StarterInput): Record<string, string> {
  const manifest = {
    id: `dev.${slug(i.name)}`,
    name: i.name,
    version: i.version,
    author: "You",
    description: i.description,
    category: "Markets",
    icon: "Activity",
    color: "#9b9cff",
    permissions: ["tokens:read"],
    widget: { size: "sm" },
    entry: "https://example.com/widget.html",
  };
  return {
    "strata.json": JSON.stringify(manifest, null, 2),
    "widget.html": `<!doctype html>
<html>
  <head><meta charset="utf-8" /><style>body{margin:0;padding:14px;font:14px system-ui;background:transparent;color:#f3f4f6}</style></head>
  <body>
    <div id="out">Loading…</div>
    <script>
      fetch("${i.home}/api/tokens?list=trending&limit=5").then((r) => r.json()).then((d) => {
        document.getElementById("out").innerHTML = (d.data ?? []).map((t) => t.symbol + " " + (t.change24h ?? 0).toFixed(1) + "%").join("<br>");
      });
    </script>
  </body>
</html>
`,
    "README.md": readme(i, "Host widget.html anywhere (it's loaded in a sandboxed frame), put its URL in strata.json → entry, then submit it from the developer dashboard."),
  };
}

export function starterFiles(i: StarterInput): Record<string, string> {
  const base = slug(i.name);
  const files = i.kind === "extension" ? extensionFiles(i, false) : i.kind === "wallet-tool" ? extensionFiles(i, true) : i.kind === "mini-app" ? miniAppFiles(i) : i.kind === "agent" ? agentFiles(i) : widgetFiles(i);
  return Object.fromEntries(Object.entries(files).map(([k, v]) => [`${base}/${k}`, v]));
}

export function starterName(name: string) {
  return `${slug(name)}.zip`;
}
