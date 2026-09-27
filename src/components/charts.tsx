"use client";

import { useMemo, useRef, useState } from "react";
import type { PricePoint } from "@/lib/types";
import { fmtUsd } from "@/lib/format";
import { cn } from "./ui";

/** Lightweight SVG charts — no chart library, so they stay fast on mobile. */

export function Sparkline({ points, width = 96, height = 32, className }: { points: number[]; width?: number; height?: number; className?: string }) {
  if (points.length < 2) return <div style={{ width, height }} />;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;
  const d = points.map((p, i) => `${(i / (points.length - 1)) * width},${height - 2 - ((p - min) / span) * (height - 4)}`).join(" L");
  const up = points[points.length - 1] >= points[0];
  return (
    <svg width={width} height={height} className={className} aria-hidden>
      <path d={`M${d}`} fill="none" stroke={up ? "var(--up)" : "var(--down)"} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

export function AreaChart({
  data,
  height = 260,
  format = (v: number) => fmtUsd(v),
  className,
  label = "Price",
}: {
  data: PricePoint[];
  height?: number;
  format?: (v: number) => string;
  className?: string;
  label?: string;
}) {
  const ref = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const W = 800;
  const H = height;
  const pad = { t: 12, b: 22, l: 0, r: 0 };
  const { path, area, min, max, xs, ys } = useMemo(() => {
    const vals = data.map((d) => d.v);
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const span = max - min || Math.abs(max) * 0.01 || 1;
    const xs = data.map((_, i) => pad.l + (i / Math.max(1, data.length - 1)) * (W - pad.l - pad.r));
    const ys = data.map((d) => pad.t + (1 - (d.v - min) / span) * (H - pad.t - pad.b));
    const path = xs.map((x, i) => `${i ? "L" : "M"}${x.toFixed(1)},${ys[i].toFixed(1)}`).join("");
    const area = `${path}L${xs[xs.length - 1]},${H - pad.b}L${xs[0]},${H - pad.b}Z`;
    return { path, area, min, max, xs, ys };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, H]);

  if (data.length < 2) return <div className={cn("grid place-items-center text-[13px] text-muted", className)} style={{ height }}>No price history available</div>;
  const up = data[data.length - 1].v >= data[0].v;
  const color = up ? "var(--up)" : "var(--down)";
  const i = hover ?? data.length - 1;
  const spanMs = data[data.length - 1].t - data[0].t;
  const fmtTime = (t: number) =>
    new Date(t).toLocaleString("en-US", spanMs <= 2 * 86400e3 ? { hour: "numeric", minute: "2-digit" } : { month: "short", day: "numeric", ...(spanMs > 180 * 86400e3 ? { year: "2-digit" } : {}) });

  const onMove = (clientX: number) => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    const x = ((clientX - r.left) / r.width) * W;
    let best = 0;
    for (let k = 1; k < xs.length; k++) if (Math.abs(xs[k] - x) < Math.abs(xs[best] - x)) best = k;
    setHover(best);
  };

  return (
    <div className={cn("relative select-none", className)}>
      <div className="pointer-events-none absolute left-0 top-0 z-10 text-[12px]">
        <span className="font-medium tabular text-fg">{format(data[i].v)}</span>
        <span className="ml-2 text-muted">{fmtTime(data[i].t)}</span>
      </div>
      <svg
        ref={ref}
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="w-full touch-pan-y"
        style={{ height }}
        role="img"
        aria-label={`${label} chart from ${format(data[0].v)} to ${format(data[data.length - 1].v)}; range ${format(min)} to ${format(max)}`}
        onMouseMove={(e) => onMove(e.clientX)}
        onMouseLeave={() => setHover(null)}
        onTouchMove={(e) => onMove(e.touches[0].clientX)}
        onTouchEnd={() => setHover(null)}
      >
        <defs>
          <linearGradient id={`fill-${up ? "u" : "d"}`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.18} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75].map((f) => (
          <line key={f} x1={0} x2={W} y1={pad.t + f * (H - pad.t - pad.b)} y2={pad.t + f * (H - pad.t - pad.b)} stroke="var(--border)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
        ))}
        <path d={area} fill={`url(#fill-${up ? "u" : "d"})`} />
        <path d={path} fill="none" stroke={color} strokeWidth={2} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
        {hover !== null && (
          <>
            <line x1={xs[hover]} x2={xs[hover]} y1={pad.t} y2={H - pad.b} stroke="var(--border-strong)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
            <circle cx={xs[hover]} cy={ys[hover]} r={4.5} fill={color} stroke="var(--surface)" strokeWidth={2} vectorEffect="non-scaling-stroke" />
          </>
        )}
      </svg>
      <div className="mt-1 flex justify-between text-[11px] text-faint tabular">
        <span>{fmtTime(data[0].t)}</span>
        <span>
          Low {format(min)} · High {format(max)}
        </span>
        <span>{fmtTime(data[data.length - 1].t)}</span>
      </div>
    </div>
  );
}

const SLOTS = ["var(--series-1)", "var(--series-2)", "var(--series-3)", "var(--series-4)", "var(--series-5)"];

/** Allocation donut: top 5 slices keep fixed categorical slots, the rest fold into "Other". */
export function Donut({ slices, size = 168, center }: { slices: { label: string; value: number }[]; size?: number; center?: React.ReactNode }) {
  const [hover, setHover] = useState<number | null>(null);
  const sorted = [...slices].filter((s) => s.value > 0).sort((a, b) => b.value - a.value);
  const top = sorted.slice(0, 5);
  const rest = sorted.slice(5).reduce((s, x) => s + x.value, 0);
  const parts = [...top.map((s, i) => ({ ...s, color: SLOTS[i] })), ...(rest > 0 ? [{ label: "Other", value: rest, color: "var(--series-other)" }] : [])];
  const total = parts.reduce((s, p) => s + p.value, 0) || 1;
  const r = size / 2;
  const stroke = size * 0.13;
  const rr = r - stroke / 2 - 2;
  const C = 2 * Math.PI * rr;
  const gap = parts.length > 1 ? 2 : 0;
  let acc = 0;
  return (
    <div className="flex flex-col items-center gap-5">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" role="img" aria-label={parts.map((p) => `${p.label} ${((p.value / total) * 100).toFixed(1)}%`).join(", ")}>
          {parts.map((p, i) => {
            const len = (p.value / total) * C;
            const el = (
              <circle
                key={p.label}
                cx={r}
                cy={r}
                r={rr}
                fill="none"
                stroke={p.color}
                strokeWidth={hover === i ? stroke + 3 : stroke}
                strokeDasharray={`${Math.max(0.5, len - gap)} ${C}`}
                strokeDashoffset={-acc}
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
                className="transition-[stroke-width]"
              />
            );
            acc += len;
            return el;
          })}
        </svg>
        <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
          {hover !== null ? (
            <div>
              <div className="text-[12px] text-muted">{parts[hover].label}</div>
              <div className="text-[16px] font-semibold tabular">{((parts[hover].value / total) * 100).toFixed(1)}%</div>
            </div>
          ) : (
            center
          )}
        </div>
      </div>
      <ul className="w-full min-w-0 flex-1 space-y-2">
        {parts.map((p, i) => (
          <li key={p.label} className="flex items-center gap-2.5 text-[13px]" onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
            <span className="h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ background: p.color }} />
            <span className="min-w-0 flex-1 truncate">{p.label}</span>
            <span className="tabular text-muted">{((p.value / total) * 100).toFixed(1)}%</span>
            <span className="w-20 text-right tabular">{fmtUsd(p.value, { compact: true })}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Horizontal bars for probability / share displays. */
export function Meter({ value, className, tone = "var(--green)" }: { value: number; className?: string; tone?: string }) {
  return (
    <div className={cn("h-1.5 w-full overflow-hidden rounded-full bg-surface-3", className)}>
      <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${Math.max(0, Math.min(100, value * 100))}%`, background: tone }} />
    </div>
  );
}
