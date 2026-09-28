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

/** "Nice" axis ticks covering [min, max]. */
function niceTicks(min: number, max: number, count = 4) {
  const span = max - min || Math.abs(max) || 1;
  const raw = span / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let v = lo; v <= hi + step / 2 && ticks.length < 12; v += step) ticks.push(Number(v.toPrecision(12)));
  return ticks;
}

export function AreaChart({
  data,
  height = 260,
  format = (v: number) => fmtUsd(v),
  axisFormat,
  className,
  label = "Price",
  color = "var(--chart)",
}: {
  data: PricePoint[];
  height?: number;
  format?: (v: number) => string;
  /** Shorter format for the y-axis (defaults to `format`). */
  axisFormat?: (v: number) => string;
  className?: string;
  label?: string;
  color?: string;
}) {
  const ref = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const W = 800;
  const H = height;
  const { path, area, min, max, xs, ys, ticks } = useMemo(() => {
    const vals = data.map((d) => d.v);
    const rawMin = Math.min(...vals);
    const rawMax = Math.max(...vals);
    const ticks = niceTicks(rawMin, rawMax);
    const lo = ticks[0];
    const hi = ticks[ticks.length - 1];
    const span = hi - lo || 1;
    const xs = data.map((_, i) => (i / Math.max(1, data.length - 1)) * W);
    const ys = data.map((d) => (1 - (d.v - lo) / span) * H);
    const path = xs.map((x, i) => `${i ? "L" : "M"}${x.toFixed(1)},${ys[i].toFixed(1)}`).join("");
    const area = `${path}L${xs[xs.length - 1]},${H}L${xs[0]},${H}Z`;
    return { path, area, min: rawMin, max: rawMax, xs, ys, ticks };
  }, [data, H]);

  if (data.length < 2) return <div className={cn("grid place-items-center text-[13px] text-muted", className)} style={{ height }}>No history available yet</div>;
  const spanMs = data[data.length - 1].t - data[0].t;
  const short = spanMs <= 2 * 86400e3;
  const fmtTime = (t: number) =>
    new Date(t).toLocaleString(
      "en-US",
      short ? { hour: "numeric", minute: "2-digit" } : spanMs <= 8 * 86400e3 ? { weekday: "short", month: "short", day: "numeric", hour: "numeric" } : { month: "short", day: "numeric", ...(spanMs > 180 * 86400e3 ? { year: "numeric" } : {}) },
    );
  const fmtTick = (t: number) =>
    new Date(t).toLocaleString("en-US", short ? { hour: "numeric" } : spanMs <= 8 * 86400e3 ? { weekday: "short" } : spanMs > 180 * 86400e3 ? { month: "short", year: "2-digit" } : { month: "short", day: "numeric" });
  const xTicks = Array.from({ length: 7 }, (_, k) => Math.round((k / 6) * (data.length - 1)));
  const axis = axisFormat ?? format;
  const band = W / Math.max(8, Math.min(data.length, 14));

  const onMove = (clientX: number) => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    const x = ((clientX - r.left) / r.width) * W;
    let best = 0;
    for (let k = 1; k < xs.length; k++) if (Math.abs(xs[k] - x) < Math.abs(xs[best] - x)) best = k;
    setHover(best);
  };
  const gid = `area-${label.replace(/\W/g, "")}`;
  const hx = hover !== null ? (xs[hover] / W) * 100 : 0;
  const hy = hover !== null ? (ys[hover] / H) * 100 : 0;

  return (
    <div className={cn("relative select-none", className)}>
      <div className="flex gap-3">
        {/* y-axis */}
        <div className="relative shrink-0 text-right text-[11.5px] tabular text-faint" style={{ height, width: Math.max(...ticks.map((t) => axis(t).length)) * 6.6 + 2 }}>
          {ticks.map((t, k) => (
            <span key={t} className="absolute right-0 -translate-y-1/2 whitespace-nowrap" style={{ top: `${(1 - k / (ticks.length - 1)) * 100}%` }}>
              {axis(t)}
            </span>
          ))}
        </div>
        <div className="relative min-w-0 flex-1">
          <svg
            ref={ref}
            viewBox={`0 0 ${W} ${H}`}
            preserveAspectRatio="none"
            className="block w-full touch-pan-y overflow-visible"
            style={{ height }}
            role="img"
            aria-label={`${label} chart from ${format(data[0].v)} to ${format(data[data.length - 1].v)}; range ${format(min)} to ${format(max)}`}
            onMouseMove={(e) => onMove(e.clientX)}
            onMouseLeave={() => setHover(null)}
            onTouchMove={(e) => onMove(e.touches[0].clientX)}
            onTouchEnd={() => setHover(null)}
          >
            <defs>
              <linearGradient id={gid} x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity={0.2} />
                <stop offset="100%" stopColor={color} stopOpacity={0.02} />
              </linearGradient>
            </defs>
            {ticks.map((_, k) => {
              const y = (1 - k / (ticks.length - 1)) * H;
              return <line key={k} x1={0} x2={W} y1={y} y2={y} stroke="var(--border)" strokeWidth={1} vectorEffect="non-scaling-stroke" />;
            })}
            {hover !== null && <rect x={Math.max(0, Math.min(W - band, xs[hover] - band / 2))} y={0} width={band} height={H} fill={color} fillOpacity={0.07} stroke={color} strokeOpacity={0.25} strokeWidth={1} vectorEffect="non-scaling-stroke" />}
            <path d={area} fill={`url(#${gid})`} />
            <path d={path} fill="none" stroke={color} strokeWidth={1.6} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
          </svg>
          {hover !== null && (
            <>
              <span className="pointer-events-none absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-surface" style={{ left: `${hx}%`, top: `${hy}%`, background: color }} />
              <div
                className="pointer-events-none absolute z-10 rounded-[10px] border border-line bg-surface px-3 py-2 text-[12px] shadow-[var(--shadow-pop)]"
                style={{ left: `${hx}%`, top: `${hy}%`, transform: `translate(${hx > 70 ? "calc(-100% - 12px)" : "12px"}, ${hy > 60 ? "-110%" : "10%"})` }}
              >
                <div className="whitespace-nowrap text-muted">{fmtTime(data[hover].t)}</div>
                <div className="whitespace-nowrap font-semibold tabular" style={{ color }}>
                  {label}: {format(data[hover].v)}
                </div>
              </div>
            </>
          )}
          {/* x-axis */}
          <div className="relative mt-2 h-4 text-[11.5px] text-faint">
            {xTicks.map((k, n) => (
              <span key={n} className={cn("absolute whitespace-nowrap", n % 2 === 1 && "hidden sm:inline", n === 0 ? "" : n === xTicks.length - 1 ? "-translate-x-full" : "-translate-x-1/2")} style={{ left: `${(xs[k] / W) * 100}%` }}>
                {fmtTick(data[k].t)}
              </span>
            ))}
          </div>
        </div>
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
export function Meter({ value, className, tone = "var(--chart)" }: { value: number; className?: string; tone?: string }) {
  return (
    <div className={cn("h-1.5 w-full overflow-hidden rounded-full bg-surface-3", className)}>
      <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${Math.max(0, Math.min(100, value * 100))}%`, background: tone }} />
    </div>
  );
}
