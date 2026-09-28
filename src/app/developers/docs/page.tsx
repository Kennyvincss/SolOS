import type { Metadata } from "next";
import { Card } from "@/components/ui";
import { PERMISSIONS } from "@/lib/extensions/sdk";

export const metadata: Metadata = { title: "Developer docs" };

const API: [string, string, string][] = [
  ["GET", "/api/search?q=", "Universal search: tokens, wallets, apps, protocols, news (with intent)"],
  ["GET", "/open?q=", "Resolve a ticker, address or signature and redirect to its page"],
  ["GET", "/api/tokens?list=trending|top_traded|new|gainers|losers", "Token lists"],
  ["GET", "/api/tokens/{mint}", "Token market data: price, market cap, volume, liquidity, holders"],
  ["GET", "/api/tokens/{mint}/history?range=1D|7D|30D|90D|1Y", "Price history"],
  ["GET", "/api/tokens/{mint}/holders", "Top holders"],
  ["GET", "/api/wallets/{address}", "Portfolio from onchain balances"],
  ["GET", "/api/wallets/{address}/activity", "Recent transactions, explained"],
  ["GET", "/api/wallets/{address}/pnl", "7d / 30d / all-time trading PnL"],
  ["GET", "/api/account/{address}", "What an address is: wallet, token mint, program…"],
  ["GET", "/api/tx/{signature}", "Plain-English transaction explanation"],
  ["GET", "/api/security?q=", "Risk indicators for a mint, wallet, program or website"],
  ["POST", "/api/security/tx", "Decode and simulate a transaction before signing"],
  ["GET", "/api/apps", "App registry with live usage metrics"],
  ["GET", "/api/defi", "Protocols, yields and DEX volume"],
  ["GET", "/api/news", "Solana news with sources"],
  ["GET", "/api/network", "Slot, TPS and priority fees"],
  ["POST", "/api/ai/ask", "STRATA AI, one response: { prompt, wallet? }"],
  ["POST", "/api/ai/chat", "STRATA AI, streamed (NDJSON events)"],
];

function Code({ children }: { children: string }) {
  return <pre className="mt-2 overflow-x-auto rounded-xl bg-surface-2 p-4 font-mono text-[12.5px] leading-relaxed">{children}</pre>;
}

function Doc({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-6">
      <h2 className="text-[19px] font-semibold tracking-[-0.01em]">{title}</h2>
      <div className="mt-2 space-y-3 text-[14px] leading-relaxed text-muted">{children}</div>
    </section>
  );
}

export default function Docs() {
  const home = "https://solos-rho.vercel.app";
  return (
    <div className="space-y-10">
      <Card className="p-4">
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-[13px]">
          {[
            ["#api", "STRATA API"],
            ["#keys", "API keys"],
            ["#extensions", "Browser extensions"],
            ["#wallet", "Wallet access"],
            ["#mini-apps", "Mini apps"],
            ["#agents", "AI agents"],
            ["#widgets", "Data widgets"],
            ["#publish", "Publishing"],
          ].map(([h, l]) => (
            <a key={h} href={h} className="text-muted hover:text-fg">
              {l}
            </a>
          ))}
        </div>
      </Card>

      <Doc id="api" title="STRATA API">
        <p>JSON over HTTPS. The public endpoints work without a key; responses from live data include where the data came from so you can show it.</p>
        <Card className="overflow-hidden">
          <table className="w-full text-left text-[13px]">
            <tbody className="divide-y divide-line">
              {API.map(([m, p, d]) => (
                <tr key={p}>
                  <td className="w-16 px-3 py-2 font-mono text-[11.5px] text-sol-green">{m}</td>
                  <td className="px-3 py-2 font-mono text-[12px] text-fg">{p}</td>
                  <td className="hidden px-3 py-2 text-muted sm:table-cell">{d}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
        <Code>{`curl "${home}/api/tokens/JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN" \\
  -H "x-strata-key: $STRATA_API_KEY"`}</Code>
      </Doc>

      <Doc id="keys" title="API keys">
        <p>Create keys under API keys. Send one as <code>x-strata-key</code> or <code>Authorization: Bearer strata_live_…</code>. Requests with a key count toward your Analytics; a revoked or wrong key gets <code>401</code>. Keep keys on your server or in an extension&apos;s background worker, not in page code.</p>
      </Doc>

      <Doc id="extensions" title="Browser extensions">
        <p>STRATA runs Chrome extensions (Manifest V3): toolbar popups, background service workers, content scripts, <code>chrome.storage</code>, <code>chrome.tabs</code>, <code>chrome.windows</code>, <code>chrome.identity.launchWebAuthFlow</code> and <code>chrome.sidePanel</code>. Anything on the Chrome Web Store installs in one click.</p>
        <ol className="list-decimal space-y-1 pl-5">
          <li>Create a project (Create → Browser extension) and unzip the starter.</li>
          <li>In the STRATA desktop app: ⋮ → Developer → turn on <strong>Developer mode</strong>, then <strong>Load unpacked extension…</strong> and pick the folder.</li>
          <li>Your extension appears under the puzzle-piece button. Pin it to the toolbar. Use Reload on My projects after editing.</li>
        </ol>
        <p>Each STRATA profile (Main Wallet, Trading, Burner…) has its own extensions and storage, so you can test with a burner wallet without touching your main one.</p>
      </Doc>

      <Doc id="wallet" title="Wallet access">
        <p>Wallet extensions (Phantom, Solflare, Backpack) inject their providers into pages as in Chrome: <code>window.phantom.solana</code>, <code>window.solflare</code>, <code>window.backpack</code>, and the Wallet Standard. Use the standard wallet adapter in mini apps. Never ask users for recovery phrases; STRATA flags pages that do.</p>
        <Code>{`const provider = window.phantom?.solana ?? window.solflare;
const { publicKey } = await provider.connect();
const portfolio = await fetch(\`${home}/api/wallets/\${publicKey}\`).then((r) => r.json());`}</Code>
      </Doc>

      <Doc id="mini-apps" title="Mini apps">
        <p>Mini apps are ordinary web apps that open in a STRATA tab, split view or a saved tab group. Keep them fast and mobile-friendly: the STRATA phone app opens them too, and connects wallets through Mobile Wallet Adapter.</p>
      </Doc>

      <Doc id="agents" title="AI agents">
        <p>An agent is a set of instructions plus STRATA AI&apos;s tools (token data, wallet portfolio and activity, transaction explainer, security checks, search). Call it with <code>POST /api/ai/ask</code>:</p>
        <Code>{`curl -X POST ${home}/api/ai/ask -H "content-type: application/json" \\
  -d '{"prompt":"You summarize whale buys. Analyze wallet 5Q544f…"}'`}</Code>
      </Doc>

      <Doc id="widgets" title="Data widgets">
        <p>Widgets are small cards in the STRATA workspace, loaded in a sandboxed frame from your <code>entry</code> URL and described by a <code>strata.json</code> manifest. They ask for permissions the user approves on install:</p>
        <Card className="divide-y divide-line">
          {Object.entries(PERMISSIONS).map(([k, v]) => (
            <div key={k} className="flex gap-3 px-3 py-2 text-[13px]">
              <code className="w-36 shrink-0 text-fg">{k}</code>
              <span>{v}</span>
            </div>
          ))}
        </Card>
      </Doc>

      <Doc id="publish" title="Publishing to the STRATA Store">
        <p>Submit a project from Submissions with notes for reviewers and a source link. Reviews check the permissions you ask for, wallet access, network requests and what the code does. You&apos;ll see the status (In review, Changes requested, Published) on your dashboard.</p>
      </Doc>
    </div>
  );
}
