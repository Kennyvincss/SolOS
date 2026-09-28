"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { AlertTriangle, Check, Copy, FlaskConical, Info, RefreshCw, X } from "lucide-react";
import type { DataMeta, RiskLevel } from "@/lib/types";
import { fmtPct, shortAddr, timeAgo } from "@/lib/format";

export function cn(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

/* ------------------------------------------------------------------ layout */

export function Page({ children, className, wide }: { children: ReactNode; className?: string; wide?: boolean }) {
  return <div className={cn("mx-auto w-full px-4 pb-28 pt-5 sm:px-6 md:pb-16 lg:px-10 lg:pt-8", wide ? "max-w-[1400px]" : "max-w-[1180px]", className)}>{children}</div>;
}

export function PageHeader({ title, subtitle, actions, eyebrow }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; eyebrow?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:mb-8 sm:flex-row sm:items-end sm:justify-between animate-fade-up">
      <div className="min-w-0">
        {eyebrow && <div className="mb-2 text-[13px] font-medium text-muted">{eyebrow}</div>}
        <h1 className="text-[28px] font-semibold leading-tight tracking-[-0.02em] sm:text-[34px]">{title}</h1>
        {subtitle && <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Section({ title, action, children, className, id, subtitle }: { title?: ReactNode; action?: ReactNode; children: ReactNode; className?: string; id?: string; subtitle?: ReactNode }) {
  return (
    <section id={id} className={cn("mt-8 scroll-mt-20 first:mt-0", className)}>
      {(title || action) && (
        <div className="mb-3 flex items-end justify-between gap-3">
          <div>
            {title && <h2 className="text-[17px] font-semibold tracking-[-0.01em]">{title}</h2>}
            {subtitle && <p className="mt-0.5 text-[13px] text-muted">{subtitle}</p>}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function Card({ children, className, as: As = "div", href, onClick }: { children: ReactNode; className?: string; as?: "div" | "section" | "article"; href?: string; onClick?: () => void }) {
  if (href) {
    const external = /^https?:/.test(href);
    return (
      <Link href={href} target={external ? "_blank" : undefined} rel={external ? "noopener noreferrer" : undefined} className={cn("card card-hover block", className)}>
        {children}
      </Link>
    );
  }
  return (
    <As className={cn("card", onClick && "card-hover cursor-pointer", className)} onClick={onClick}>
      {children}
    </As>
  );
}

/* ------------------------------------------------------------------ atoms */

export function Badge({ children, tone = "neutral", className }: { children: ReactNode; tone?: "neutral" | "green" | "purple" | "warn" | "down" | "up"; className?: string }) {
  const tones = {
    neutral: "bg-surface-2 text-muted",
    green: "bg-sol-green/10 text-sol-green",
    purple: "bg-sol-purple/12 text-sol-purple",
    warn: "bg-warn/12 text-warn",
    down: "bg-down/12 text-down",
    up: "bg-up/12 text-up",
  };
  return <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium", tones[tone], className)}>{children}</span>;
}

export function Change({ value, className, digits = 2 }: { value?: number; className?: string; digits?: number }) {
  if (value === undefined || value === null || !Number.isFinite(value)) return <span className={cn("text-faint", className)}>—</span>;
  return <span className={cn("tabular", value > 0 ? "text-up" : value < 0 ? "text-down" : "text-muted", className)}>{fmtPct(value, digits)}</span>;
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton", className)} />;
}

export function SkeletonRows({ rows = 5, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn("space-y-3", className)}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3">
          <Skeleton className="h-9 w-9 rounded-full" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-3.5 w-1/3" />
            <Skeleton className="h-3 w-1/5" />
          </div>
          <Skeleton className="h-4 w-16" />
        </div>
      ))}
    </div>
  );
}

export function EmptyState({ icon, title, body, action }: { icon?: ReactNode; title: string; body?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      {icon && <div className="mb-3 grid h-11 w-11 place-items-center rounded-2xl bg-surface-2 text-muted">{icon}</div>}
      <div className="text-[15px] font-medium">{title}</div>
      {body && <div className="mt-1 max-w-sm text-[13px] leading-relaxed text-muted">{body}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/** Plain-language error text: never shows status codes, provider names or internals. */
export function friendlyError(message: string): string {
  if (/\b[1-5]\d\d\b|rpc|provider|upstream|fetch|timed? ?out|forbidden|json|econn|network|api|unavailable:|internal|undefined|null/i.test(message)) return "Couldn't load this right now. Please try again in a moment.";
  return message;
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-down/20 bg-down/5 p-4 text-[13px]">
      <AlertTriangle size={16} className="mt-0.5 shrink-0 text-down" />
      <div className="flex-1">
        <div className="text-fg">{friendlyError(message)}</div>
      </div>
      {onRetry && (
        <button onClick={onRetry} className="btn btn-sm btn-ghost">
          <RefreshCw size={13} /> Retry
        </button>
      )}
    </div>
  );
}

/** Provenance label. Every data view shows where its numbers came from. */
export function DataBadge({ meta, className }: { meta?: DataMeta | null; className?: string }) {
  if (!meta) return null;
  const demo = meta.mode === "demo";
  return (
    <span
      title={demo ? "Live data is temporarily unavailable, so sample figures are shown." : `Updated ${timeAgo(meta.fetchedAt)}`}
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-medium",
        demo ? "border-warn/30 bg-warn/10 text-warn" : "border-line text-faint",
        className,
      )}
    >
      {demo ? <FlaskConical size={11} /> : <span className="h-1.5 w-1.5 rounded-full bg-up" />}
      {demo ? "Sample data" : "Live"}
    </span>
  );
}

export function DemoNotice({ meta }: { meta?: DataMeta | null }) {
  if (!meta || meta.mode !== "demo") return null;
  return (
    <div className="mb-4 flex items-start gap-2.5 rounded-2xl border border-warn/25 bg-warn/[0.06] p-3.5 text-[13px] leading-relaxed">
      <FlaskConical size={15} className="mt-0.5 shrink-0 text-warn" />
      <div>
        <span className="font-medium text-warn">Sample data.</span> <span className="text-muted">Live data is temporarily unavailable, so these figures are examples, not real market data. Refresh in a minute.</span>
      </div>
    </div>
  );
}

export function Stat({ label, value, sub, className }: { label: ReactNode; value: ReactNode; sub?: ReactNode; className?: string }) {
  return (
    <div className={cn("min-w-0", className)}>
      <div className="text-[12px] text-muted">{label}</div>
      <div className="mt-1 truncate text-[17px] font-semibold tabular tracking-[-0.01em]">{value}</div>
      {sub && <div className="mt-0.5 text-[12px]">{sub}</div>}
    </div>
  );
}

export function Tabs<T extends string>({ value, onChange, options, className }: { value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode }[]; className?: string }) {
  return (
    <div className={cn("no-scrollbar flex gap-1.5 overflow-x-auto", className)}>
      {options.map((o) => (
        <button key={o.value} className="chip" data-active={o.value === value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Segmented<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: T[] }) {
  return (
    <div className="inline-flex rounded-full bg-surface-2 p-0.5">
      {options.map((o) => (
        <button key={o} onClick={() => onChange(o)} className={cn("rounded-full px-3 py-1 text-[12px] font-medium transition-colors", o === value ? "bg-surface-3 text-fg shadow-sm" : "text-muted hover:text-fg")}>
          {o}
        </button>
      ))}
    </div>
  );
}

export function Monogram({ name, color, size = 40, src, rounded = "xl" }: { name: string; color?: string; size?: number; src?: string; rounded?: "full" | "xl" }) {
  const [err, setErr] = useState(false);
  const r = rounded === "full" ? "rounded-full" : size >= 56 ? "rounded-[22%]" : "rounded-[28%]";
  if (src && !err) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt="" width={size} height={size} loading="lazy" onError={() => setErr(true)} className={cn("shrink-0 bg-surface-2 object-cover", r)} style={{ width: size, height: size }} />;
  }
  const c = color ?? "#888";
  return (
    <div
      className={cn("grid shrink-0 place-items-center font-semibold", r)}
      style={{
        width: size,
        height: size,
        fontSize: size * 0.4,
        background: `linear-gradient(145deg, ${c}33, ${c}14)`,
        color: c,
        boxShadow: `inset 0 0 0 1px ${c}30`,
      }}
    >
      {name.replace(/^\$/, "").slice(0, 1).toUpperCase()}
    </div>
  );
}

export function CopyButton({ text, className, label }: { text: string; className?: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        navigator.clipboard?.writeText(text).then(() => {
          setDone(true);
          setTimeout(() => setDone(false), 1200);
        });
      }}
      className={cn("inline-flex items-center gap-1 text-faint transition-colors hover:text-fg", className)}
      aria-label={`Copy ${label ?? text}`}
    >
      {done ? <Check size={13} className="text-up" /> : <Copy size={13} />}
      {label && <span className="text-[12px]">{label}</span>}
    </button>
  );
}

export function Address({ value, href, chars = 4, className }: { value: string; href?: string; chars?: number; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 font-mono text-[12.5px]", className)}>
      {href ? (
        <Link href={href} className="hover:text-sol-green">
          {shortAddr(value, chars)}
        </Link>
      ) : (
        shortAddr(value, chars)
      )}
      <CopyButton text={value} />
    </span>
  );
}

export const RISK_STYLE: Record<RiskLevel, { label: string; cls: string; dot: string }> = {
  low: { label: "Low", cls: "text-up bg-up/10", dot: "bg-up" },
  medium: { label: "Medium", cls: "text-warn bg-warn/10", dot: "bg-warn" },
  high: { label: "High", cls: "text-down bg-down/10", dot: "bg-down" },
  unknown: { label: "Unknown", cls: "text-muted bg-surface-2", dot: "bg-faint" },
};

export function RiskPill({ level }: { level: RiskLevel }) {
  const s = RISK_STYLE[level];
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide", s.cls)}>
      <span className={cn("h-1.5 w-1.5 rounded-full", s.dot)} />
      {s.label}
    </span>
  );
}

export function Modal({ open, onClose, children, title, className }: { open: boolean; onClose: () => void; children: ReactNode; title?: ReactNode; className?: string }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center sm:items-center" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className={cn("animate-scale-in relative w-full max-w-md rounded-t-3xl border border-line bg-elev p-5 shadow-2xl sm:rounded-3xl", className)}>
        <div className="mb-4 flex items-center justify-between">
          <div className="text-[16px] font-semibold">{title}</div>
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-full text-muted hover:bg-surface-2 hover:text-fg" aria-label="Close">
            <X size={16} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function InfoNote({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-start gap-2 rounded-xl bg-surface-2/60 p-3 text-[12.5px] leading-relaxed text-muted", className)}>
      <Info size={14} className="mt-0.5 shrink-0" />
      <div>{children}</div>
    </div>
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn("relative h-6 w-10 shrink-0 rounded-full transition-colors", checked ? "bg-sol-green" : "bg-surface-3")}
    >
      <span className={cn("absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform", checked ? "translate-x-[18px]" : "translate-x-0.5")} />
    </button>
  );
}

export function share(title: string, url = typeof location !== "undefined" ? location.href : "") {
  if (navigator.share) navigator.share({ title, url }).catch(() => {});
  else navigator.clipboard?.writeText(url);
}
