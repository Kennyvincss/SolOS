"use client";

import { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import bs58 from "bs58";
import { QrCode } from "lucide-react";
import { Card, CopyButton, InfoNote, Page, PageHeader, Section, Segmented, Tabs } from "@/components/ui";
import { AppCard } from "@/components/domain";
import { APPS } from "@/lib/catalog/apps";
import { useSession } from "@/lib/client/session";
import { isAddress } from "@/lib/solana/address";

const TOKENS = {
  SOL: null,
  USDC: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  PYUSD: "2b1kV6DkPAnxd5ixfnxCpjxmKwqjjaYmCZfHsFu24GXo",
} as const;
type Tok = keyof typeof TOKENS;

function randomReference() {
  const b = new Uint8Array(32);
  crypto.getRandomValues(b);
  return bs58.encode(b);
}

/** Builds a Solana Pay transfer request URL (spec: docs.solanapay.com/spec). */
function buildUrl(o: { recipient: string; amount: string; token: Tok; label: string; message: string; memo: string; reference: string }) {
  const p = new URLSearchParams();
  if (o.amount) p.set("amount", o.amount);
  const mint = TOKENS[o.token];
  if (mint) p.set("spl-token", mint);
  p.set("reference", o.reference);
  if (o.label) p.set("label", o.label);
  if (o.message) p.set("message", o.message);
  if (o.memo) p.set("memo", o.memo);
  return `solana:${o.recipient}?${p.toString().replace(/\+/g, "%20")}`;
}

function PayRequest() {
  const s = useSession();
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [token, setToken] = useState<Tok>("USDC");
  const [label, setLabel] = useState("");
  const [message, setMessage] = useState("");
  const [memo, setMemo] = useState("");
  const [reference, setReference] = useState("");
  const [qr, setQr] = useState<string | null>(null);

  useEffect(() => setReference(randomReference()), []);
  useEffect(() => {
    if (!recipient && s.address && s.address !== "demo") setRecipient(s.address);
  }, [s.address, recipient]);

  const valid = isAddress(recipient) && (!amount || (/^\d+(\.\d+)?$/.test(amount) && Number(amount) > 0));
  const url = useMemo(() => (valid && reference ? buildUrl({ recipient, amount, token, label, message, memo, reference }) : ""), [valid, recipient, amount, token, label, message, memo, reference]);

  useEffect(() => {
    if (!url) return setQr(null);
    QRCode.toDataURL(url, { margin: 1, width: 480, color: { dark: "#07080a", light: "#ffffff" } }).then(setQr).catch(() => setQr(null));
  }, [url]);

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
      <Card className="space-y-3 p-5">
        <label className="block">
          <span className="mb-1 block text-[12.5px] text-muted">Recipient address</span>
          <input className="input font-mono text-[13px]" value={recipient} onChange={(e) => setRecipient(e.target.value.trim())} placeholder="Your Solana address" />
        </label>
        <div className="grid grid-cols-[1fr_auto] items-end gap-3">
          <label className="block">
            <span className="mb-1 block text-[12.5px] text-muted">Amount (optional)</span>
            <input className="input" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
          </label>
          <Segmented value={token} onChange={setToken} options={["USDC", "PYUSD", "SOL"]} />
        </div>
        <label className="block">
          <span className="mb-1 block text-[12.5px] text-muted">Label (shown to payer)</span>
          <input className="input" value={label} onChange={(e) => setLabel(e.target.value.slice(0, 60))} placeholder="e.g. Kenny's Coffee" />
        </label>
        <label className="block">
          <span className="mb-1 block text-[12.5px] text-muted">Message</span>
          <input className="input" value={message} onChange={(e) => setMessage(e.target.value.slice(0, 120))} placeholder="e.g. Order #1234" />
        </label>
        <label className="block">
          <span className="mb-1 block text-[12.5px] text-muted">On-chain memo (public)</span>
          <input className="input" value={memo} onChange={(e) => setMemo(e.target.value.slice(0, 80))} placeholder="Optional" />
        </label>
        {recipient && !isAddress(recipient) && <p className="text-[12.5px] text-down">Enter a valid Solana address.</p>}
        <p className="text-[12px] leading-relaxed text-faint">Memos are visible to everyone on-chain. A unique reference key is added so you can find the payment later with getSignaturesForAddress.</p>
      </Card>
      <Card className="flex flex-col items-center p-5 text-center">
        {qr ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={qr} alt="Solana Pay QR code" className="w-full max-w-[260px] rounded-2xl bg-white p-2" />
        ) : (
          <div className="grid aspect-square w-full max-w-[260px] place-items-center rounded-2xl border border-dashed border-line text-faint">
            <QrCode size={32} />
          </div>
        )}
        {url && (
          <>
            <div className="mt-4 w-full break-all rounded-xl bg-surface-2 p-2.5 text-left font-mono text-[11px] text-muted">{url}</div>
            <div className="mt-3 flex w-full gap-2">
              <a href={url} className="btn btn-primary btn-sm flex-1">
                Open in wallet
              </a>
              <span className="btn btn-ghost btn-sm">
                <CopyButton text={url} label="Copy" />
              </span>
            </div>
            <button onClick={() => setReference(randomReference())} className="mt-2 text-[12px] text-faint hover:text-fg">
              New reference
            </button>
          </>
        )}
      </Card>
    </div>
  );
}

export default function PaymentsPage() {
  const [tab, setTab] = useState<"all" | "Stablecoins" | "Merchants" | "Infrastructure">("all");
  const apps = APPS.filter((a) => a.category === "Payments" || a.subcategories?.includes("Payments")).filter((a) => tab === "all" || a.subcategories?.some((s) => s === tab || (tab === "Merchants" && s === "Checkout") || (tab === "Infrastructure" && (s === "Standard" || s === "Infrastructure"))));
  return (
    <Page wide>
      <PageHeader title="Payments" subtitle="Solana Pay, stablecoins, merchants and payment infrastructure." />
      <Section title="Request a payment" subtitle="Generate a Solana Pay link and QR code anyone can pay from their wallet" className="mt-0">
        <PayRequest />
      </Section>
      <Section title="Discover payments" action={<Tabs value={tab} onChange={setTab} options={[{ value: "all", label: "All" }, { value: "Stablecoins", label: "Stablecoins" }, { value: "Merchants", label: "Merchants" }, { value: "Infrastructure", label: "Infrastructure" }]} />}>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {apps.map((a) => (
            <AppCard key={a.slug} app={a} />
          ))}
        </div>
      </Section>
      <InfoNote className="mt-6">Sending payments directly from Solana OS will use your connected wallet to sign; Solana OS never holds funds. Until then, “Open in wallet” hands the request to your wallet app.</InfoNote>
    </Page>
  );
}
