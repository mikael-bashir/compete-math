"use client";

import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { RANGES, place, windowPoints, yieldOf, type DayPoint, type RangeKey } from "@/app/lib/data/tengoku-history-core";
import { YieldHint } from "./yield-hint";

const W = 600;
const H = 140;
const PAD = 8; // keeps the end dot and the line's stroke inside the box
const TOP_ROWS = 8;

interface Breakdown {
  libraries: string[];
  byDay: Record<string, [number, number, number][]>;
  sources: Record<string, number>;
}

const fmtPct = (v: number) => (v === 0 ? "0%" : v >= 99.95 ? `${Math.round(v)}%` : v >= 10 ? `${v.toFixed(0)}%` : v < 0.1 ? "<0.1%" : `${v.toFixed(1)}%`);

function formatDay(day: string): string {
  return new Date(`${day}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

const n = (v: number) => v.toLocaleString("en-US");

/**
 * The Leak-trusted theorem count, one point per day. The vertical scale hugs the data inside the chosen window, so a few hundred new
 * theorems show against hundreds of thousands. Only the two ends of the time axis are labelled: the window's first day and today.
 * Pointing at a day (or tapping it, or using the arrow keys) shows, for each source library, how many of its theorems were Leak-trusted that day
 * and the yield: the share of the library's own theorems that were kept.
 */
export function HistoryChart({ points, today }: { points: DayPoint[]; today: string }) {
  const [range, setRange] = useState<RangeKey>("30d");
  const [picked, setPicked] = useState<string | null>(null);
  const [pinned, setPinned] = useState(false);
  const [data, setData] = useState<Breakdown | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");
  const [showAll, setShowAll] = useState(false);
  const [sortBy, setSortBy] = useState<"trusted" | "yield">("trusted");
  const svgRef = useRef<SVGSVGElement>(null);

  const days = RANGES.find((r) => r.key === range)!.days;
  const win = windowPoints(points, days, today);
  const placed = place(win.points, win.start, win.days, W - 2 * PAD, H - 2 * PAD, (p) => p.trusted).map((p) => ({ ...p, x: p.x + PAD, y: p.y + PAD }));
  const line = placed.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const last = placed[placed.length - 1];
  const first = placed[0];
  const current = placed.find((p) => p.day === picked) ?? last;
  const change = placed.length > 1 ? last.value - first.value : null;

  const load = useCallback(() => {
    if (data || state === "loading") return;
    setState("loading");
    fetch("/api/tengoku/libraries")
      .then((r) => (r.ok ? (r.json() as Promise<Breakdown>) : Promise.reject(new Error(String(r.status)))))
      .then((d) => {
        setData(d);
        setState("idle");
      })
      .catch(() => setState("error"));
  }, [data, state]);

  // about 25 KB over the wire: fetched once the page has settled, so the panel is filled by the time anyone points at the graph
  useEffect(() => {
    const id = window.setTimeout(load, 1200);
    return () => window.clearTimeout(id);
  }, [load]);

  const pick = (clientX: number) => {
    const box = svgRef.current?.getBoundingClientRect();
    if (!box || placed.length === 0) return;
    const x = ((clientX - box.left) / box.width) * W;
    let best = placed[0];
    for (const p of placed) if (Math.abs(p.x - x) < Math.abs(best.x - x)) best = p;
    setPicked(best.day);
  };
  const onMove = (e: PointerEvent<SVGSVGElement>) => {
    load();
    if (!pinned) pick(e.clientX);
  };
  const onClick = (e: PointerEvent<SVGSVGElement>) => {
    load();
    pick(e.clientX);
    setPinned(true);
  };
  const onKey = (e: KeyboardEvent<SVGSVGElement>) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    load();
    const at = Math.max(0, placed.findIndex((p) => p.day === current?.day));
    const next = placed[Math.min(placed.length - 1, Math.max(0, at + (e.key === "ArrowRight" ? 1 : -1)))];
    setPicked(next.day);
    setPinned(true);
  };

  const rows = (() => {
    if (!data || !current) return null;
    const day = data.byDay[current.day];
    if (!day) return [];
    const all = day.map(([i, trusted]) => {
      const name = data.libraries[i];
      const source = data.sources[name];
      return { name, trusted, source, yieldPct: yieldOf(trusted, source) };
    });
    return all.sort((a, b) => (sortBy === "yield" ? (b.yieldPct ?? -1) - (a.yieldPct ?? -1) || b.trusted - a.trusted : b.trusted - a.trusted));
  })();
  const sourced = rows ? rows.filter((r) => r.source) : [];
  const overall = sourced.length ? yieldOf(sourced.reduce((a, r) => a + r.trusted, 0), sourced.reduce((a, r) => a + (r.source as number), 0)) : null;
  const shown = rows && !showAll ? rows.slice(0, TOP_ROWS) : rows;

  const label = last
    ? `Leak-trusted theorems per day from ${formatDay(win.start)} to today: ${n(last.value)} today${change !== null ? `, ${change >= 0 ? "up" : "down"} ${n(Math.abs(change))} since ${formatDay(first.day)}` : ""}. Point at a day to see its libraries.`
    : "No theorem counts logged yet";

  return (
    <div className="mx-auto w-full max-w-2xl">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-2 font-code text-xs">
        <div className="text-white/50">
          {current ? (
            <>
              <strong className="text-white/80">{n(current.value)}</strong>
              <span className="ml-2 text-white/35">{current.day === today ? "today" : formatDay(current.day)}</span>
            </>
          ) : null}
          {change !== null ? (
            <span className={change >= 0 ? "ml-2 text-emerald-300/80" : "ml-2 text-amber-300/80"}>
              {change >= 0 ? "+" : "−"}
              {n(Math.abs(change))}
            </span>
          ) : null}
        </div>
        <div role="group" aria-label="Time range" className="flex shrink-0 gap-1">
          {RANGES.map((r) => (
            <button
              key={r.key}
              type="button"
              onClick={() => {
                setRange(r.key);
                setPicked(null);
                setPinned(false);
              }}
              aria-pressed={range === r.key}
              className={`whitespace-nowrap rounded-full border px-2.5 py-1 transition-colors sm:px-3 ${
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

      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={label}
        tabIndex={0}
        onPointerMove={onMove}
        onPointerDown={onClick}
        onPointerLeave={() => {
          if (!pinned) setPicked(null);
        }}
        onKeyDown={onKey}
        className="block h-auto w-full cursor-crosshair touch-pan-y outline-none focus-visible:ring-1 focus-visible:ring-emerald-400/40"
      >
        <line x1={PAD} x2={W - PAD} y1={H - PAD} y2={H - PAD} stroke="currentColor" className="text-white/10" strokeWidth={1} />
        {placed.length > 1 ? (
          <>
            <path d={`${line} L${last.x.toFixed(1)},${H - PAD} L${first.x.toFixed(1)},${H - PAD} Z`} className="fill-emerald-400/[0.07]" />
            <path d={line} fill="none" stroke="currentColor" className="text-emerald-300" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          </>
        ) : null}
        {placed.length > 1 && placed.length <= 40
          ? placed.slice(0, -1).map((p) => <circle key={p.day} cx={p.x} cy={p.y} r={2.5} className="fill-emerald-300/70" />)
          : null}
        {current && current !== last ? <line x1={current.x} x2={current.x} y1={PAD} y2={H - PAD} stroke="currentColor" className="text-white/20" strokeWidth={1} /> : null}
        {current ? (
          <>
            <circle cx={current.x} cy={current.y} r={8} className="fill-emerald-400/15" />
            <circle cx={current.x} cy={current.y} r={4} className="fill-emerald-300" />
          </>
        ) : null}
      </svg>

      <div className="mt-1 flex justify-between font-code text-[11px] text-white/35">
        <span>{formatDay(win.start)}</span>
        <span>Today</span>
      </div>

      {current ? (
        <div className="mt-5 rounded-xl border border-white/10 bg-white/[0.02] p-3 font-code text-xs" aria-live="polite">
          <div className="mb-2 flex items-baseline justify-between text-white/50">
            <span>
              Libraries on <strong className="text-white/80">{current.day === today ? "today" : formatDay(current.day)}</strong>
              {rows ? <span className="ml-2 text-white/35">{rows.length} in the tree</span> : null}
            </span>
            <span className="text-[11px] text-white/30">{pinned ? "tap the graph to pick another day" : "point at the graph, or tap a day"}</span>
          </div>
          {state === "error" ? <p className="text-amber-300/80">The library breakdown could not be loaded right now.</p> : null}
          {!rows && state !== "error" ? <p className="text-white/35">Loading the libraries…</p> : null}
          {rows && rows.length === 0 ? <p className="text-white/35">No library breakdown was recorded for this day.</p> : null}
          {overall !== null ? (
            <p className="mb-2 text-white/45">
              <YieldHint>Yield</YieldHint>: <strong className="text-emerald-300/90">{fmtPct(overall)}</strong> of the theorems in the {sourced.length} libraries whose source is pinned are Leak-trusted.
            </p>
          ) : null}
          {shown && shown.length > 0 ? (
            <>
              <div className="mb-1 grid grid-cols-[minmax(0,1fr)_6.5rem_4.5rem] gap-2 text-[10px] uppercase tracking-wider text-white/30">
                <span>Library</span>
                <button type="button" onClick={() => setSortBy("trusted")} className={`text-right uppercase ${sortBy === "trusted" ? "text-emerald-300/80" : "hover:text-white/60"}`}>
                  Leak-trusted
                </button>
                <span className="flex justify-end">
                  <YieldHint align="right">
                    <button type="button" onClick={() => setSortBy("yield")} className={`uppercase ${sortBy === "yield" ? "text-emerald-300/80" : "hover:text-white/60"}`}>
                      Yield
                    </button>
                  </YieldHint>
                </span>
              </div>
              <ul className={`space-y-1 ${showAll ? "max-h-72 overflow-y-auto pr-1" : ""}`}>
                {shown.map((r) => (
                  <li key={r.name} className="grid grid-cols-[minmax(0,1fr)_6.5rem_4.5rem] items-center gap-2">
                    <span className="truncate text-white/70" title={r.name}>
                      {r.name}
                    </span>
                    <span className="text-right text-white/60">{n(r.trusted)}</span>
                    <span className="text-right text-white/55">
                      {r.yieldPct === null ? (
                        <span className="text-white/25" title="No pinned source to compare with">
                          —
                        </span>
                      ) : (
                        <span title={`${n(r.trusted)} of about ${n(r.source as number)} theorems in its source are Leak-trusted`}>{fmtPct(r.yieldPct)}</span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
              {rows && rows.length > TOP_ROWS ? (
                <button type="button" onClick={() => setShowAll((v) => !v)} className="mt-2 text-emerald-300/70 hover:text-emerald-300">
                  {showAll ? "Show the top 8" : `Show all ${rows.length} libraries`}
                </button>
              ) : null}
            </>
          ) : null}
        </div>
      ) : null}

      {placed.length <= 1 ? (
        <p className="mt-2 text-center font-code text-[11px] text-white/35">Counted once a day. The line appears as days are logged.</p>
      ) : null}

      <details className="group mt-5 font-code text-xs text-white/50">
        <summary className="cursor-pointer select-none text-white/60 hover:text-white/80">How we calculate the counts</summary>
        <div className="mt-2 space-y-2 leading-relaxed text-white/45">
          <p>
            Every theorem in Tengoku is one line in a data file in the public{" "}
            <a href="https://github.com/competemath/tengoku" target="_blank" rel="noopener noreferrer" className="text-emerald-300/70 hover:text-emerald-300">
              Tengoku repository
            </a>
            . We count those lines. Nobody types the numbers in.
          </p>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              <span className="text-emerald-300/80">Leak-trusted</span>: theorems Leak has checked from scratch, plus the theorems in libraries that were added whole.
            </li>
            <li>
              <span className="text-amber-300/80">Tentative</span>: theorems with a real proof in their original source that Leak has not checked yet.
            </li>
            <li>
              The total is both added together, counting each theorem once: a tentative record of a theorem that is already Leak-trusted (its library was added
              whole after it was harvested, or the record was promoted) is not counted again. Today&apos;s number is recounted about every ten minutes.
            </li>
          </ul>
          <p>
            The graph adds one point a day and starts on 10 Sep, the day the repository was created. Days before daily logging began were rebuilt
            from the repository&apos;s history using the same rule, so they are exact for those days. Moving theorems between files or folders does not
            change a count, because we count theorems, not files.
          </p>
          <p>
            Yield is, for each library, how much of its own theorems were kept: the share of its own theorems and lemmas that are Leak-trusted in Tengoku. The library&apos;s total is counted from its source code
            at the version Tengoku pins, with the same scanner Tengoku uses to read it. Tentative theorems do not count towards yield, because Leak has not checked them yet.
            Libraries with no pinned source (slices of Mathlib, sets written by AI) show a dash.
          </p>
        </div>
      </details>
    </div>
  );
}
