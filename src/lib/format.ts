export function fmtUsd(v: number | undefined | null, opts: { compact?: boolean; digits?: number } = {}): string {
  if (v === undefined || v === null || !Number.isFinite(v)) return "—";
  const abs = Math.abs(v);
  if (opts.compact && abs >= 1000) {
    return (
      (v < 0 ? "-$" : "$") +
      new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 2 }).format(abs)
    );
  }
  let digits = opts.digits;
  if (digits === undefined) {
    if (abs === 0) digits = 2;
    else if (abs < 0.0001) digits = 8;
    else if (abs < 0.01) digits = 6;
    else if (abs < 1) digits = 4;
    else digits = 2;
  }
  return (v < 0 ? "-$" : "$") + abs.toLocaleString("en-US", { minimumFractionDigits: Math.min(2, digits), maximumFractionDigits: digits });
}

export function fmtNum(v: number | undefined | null, opts: { compact?: boolean; digits?: number } = {}): string {
  if (v === undefined || v === null || !Number.isFinite(v)) return "—";
  if (opts.compact && Math.abs(v) >= 10000) {
    return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 2 }).format(v);
  }
  const abs = Math.abs(v);
  const digits = opts.digits ?? (abs === 0 ? 0 : abs < 0.001 ? 8 : abs < 1 ? 4 : abs < 1000 ? 3 : 2);
  return v.toLocaleString("en-US", { maximumFractionDigits: digits });
}

export function fmtPct(v: number | undefined | null, digits = 2): string {
  if (v === undefined || v === null || !Number.isFinite(v)) return "—";
  return `${v > 0 ? "+" : ""}${v.toFixed(digits)}%`;
}

export function shortAddr(a: string | undefined, chars = 4): string {
  if (!a) return "";
  if (a.length <= chars * 2 + 3) return a;
  return `${a.slice(0, chars)}…${a.slice(-chars)}`;
}

export function timeAgo(input: number | string | Date | undefined): string {
  if (input === undefined) return "";
  const ts = typeof input === "number" ? (input < 1e12 ? input * 1000 : input) : new Date(input).getTime();
  if (!Number.isFinite(ts)) return "";
  const s = Math.round((Date.now() - ts) / 1000);
  if (s < 0) {
    const f = -s;
    if (f < 3600) return `in ${Math.max(1, Math.round(f / 60))}m`;
    if (f < 86400) return `in ${Math.round(f / 3600)}h`;
    return `in ${Math.round(f / 86400)}d`;
  }
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  if (s < 86400 * 30) return `${Math.round(s / 86400)}d ago`;
  return new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function fmtDate(input: number | string | undefined): string {
  if (input === undefined) return "—";
  const ts = typeof input === "number" ? (input < 1e12 ? input * 1000 : input) : new Date(input).getTime();
  return new Date(ts).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
}

export function clamp(n: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, n));
}

export function slugify(s: string) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
