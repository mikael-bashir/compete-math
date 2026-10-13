"use client";

import { useState } from "react";
import { RANGES, place, windowPoints, type DayPoint, type RangeKey } from "@/app/lib/data/tengoku-history-core";

const W = 600;
const H = 140;
const PAD = 8; // keeps the end dot and the line's stroke inside the box

function formatDay(day: string): string {
  return new Date(`${day}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

/**
 * The theorem count, one point per day. The vertical scale hugs the data inside the chosen window, so a few hundred new
 * theorems show against hundreds of thousands. Only the two ends of the time axis are labelled: the window's first day and today.
 */
export function HistoryChart({ points, today }: { points: DayPoint[]; today: string }) {
  const [range, setRange] = useState<RangeKey>("30d");
  const days = RANGES.find((r) => r.key === range)!.days;
  const win = windowPoints(points, days, today);
  const placed = place(win.points, win.start, days, W - 2 * PAD, H - 2 * PAD, (p) => p.total).map((p) => ({ ...p, x: p.x + PAD, y: p.y + PAD }));
  const line = placed.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const last = placed[placed.length - 1];
  const first = placed[0];
  const change = placed.length > 1 ? last.value - first.value : null;
  const label = last
    ? `Theorems per day from ${formatDay(win.start)} to today: ${last.value.toLocaleString("en-US")} today${change !== null ? `, ${change >= 0 ? "up" : "down"} ${Math.abs(change).toLocaleString("en-US")} since ${formatDay(first.day)}` : ""}`
    : "No theorem counts logged yet";

  return (
    <div className="mx-auto w-full max-w-2xl">
      <div className="mb-3 flex items-center justify-between gap-3 font-code text-xs">
        <div className="text-white/50">
          {last ? <strong className="text-white/80">{last.value.toLocaleString("en-US")}</strong> : null}
          {change !== null ? (
            <span className={change >= 0 ? "ml-2 text-emerald-300/80" : "ml-2 text-amber-300/80"}>
              {change >= 0 ? "+" : "−"}
              {Math.abs(change).toLocaleString("en-US")}
            </span>
          ) : null}
        </div>
        <div role="group" aria-label="Time range" className="flex gap-1">
          {RANGES.map((r) => (
            <button
              key={r.key}
              type="button"
              onClick={() => setRange(r.key)}
              aria-pressed={range === r.key}
              className={`rounded-full border px-3 py-1 transition-colors ${
                range === r.key
                  ? "border-emerald-400/30 bg-emerald-500/[0.08] text-emerald-300"
                  : "border-white/10 bg-white/[0.03] text-white/50 hover:text-white/80"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} className="block h-auto w-full">
        <line x1={PAD} x2={W - PAD} y1={H - PAD} y2={H - PAD} stroke="currentColor" className="text-white/10" strokeWidth={1} />
        {placed.length > 1 ? (
          <>
            <path d={`${line} L${last.x.toFixed(1)},${H - PAD} L${first.x.toFixed(1)},${H - PAD} Z`} className="fill-emerald-400/[0.07]" />
            <path d={line} fill="none" stroke="currentColor" className="text-emerald-300" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          </>
        ) : null}
        {placed.length > 1 && placed.length <= 31
          ? placed.slice(0, -1).map((p) => <circle key={p.day} cx={p.x} cy={p.y} r={2.5} className="fill-emerald-300/70" />)
          : null}
        {last ? (
          <>
            <circle cx={last.x} cy={last.y} r={8} className="fill-emerald-400/15" />
            <circle cx={last.x} cy={last.y} r={4} className="fill-emerald-300" />
          </>
        ) : null}
      </svg>

      <div className="mt-1 flex justify-between font-code text-[11px] text-white/35">
        <span>{formatDay(win.start)}</span>
        <span>Today</span>
      </div>
      {placed.length <= 1 ? (
        <p className="mt-2 text-center font-code text-[11px] text-white/35">Counted once a day. The line appears as days are logged.</p>
      ) : null}
    </div>
  );
}
