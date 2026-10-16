// What /tengoku shows while its numbers are being counted. Each block is sized like the thing that replaces it (a pill, the chart's box), so the
// page does not jump when the data arrives.

const BAR = "motion-safe:animate-pulse rounded bg-white/[0.06]";

/** The four stat pills, as the pills themselves are laid out (same row, same height). */
export function PillsSkeleton() {
  return (
    <div role="status" aria-label="Counting the theorems" className="not-prose mt-8 flex flex-wrap items-center justify-center gap-3">
      {["w-44", "w-40", "w-36", "w-28"].map((w) => (
        <span key={w} className={`h-[30px] ${w} rounded-full border border-white/10 bg-white/[0.03] motion-safe:animate-pulse`} />
      ))}
      <span className="sr-only">Counting the theorems…</span>
    </div>
  );
}

/** The history chart's box, laid out as the chart is: the header line and range buttons (wrapping the same way), the plot (same 600 × 140 aspect), its axis labels, and the libraries panel and note below. */
export function ChartSkeleton() {
  return (
    <div role="status" aria-label="Loading the history chart" className="mx-auto w-full max-w-2xl">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <span className={`${BAR} h-4 w-56`} />
        <span className="flex shrink-0 gap-1">
          {["w-24", "w-20", "w-20"].map((w, i) => (
            <span key={i} className={`h-[26px] ${w} rounded-full border border-white/10 bg-white/[0.03] motion-safe:animate-pulse`} />
          ))}
        </span>
      </div>
      <div className="relative w-full overflow-hidden rounded-md bg-white/[0.02]" style={{ aspectRatio: "600 / 140" }}>
        <span className="absolute inset-x-2 bottom-2 h-px bg-white/10" />
        <span className={`${BAR} absolute inset-x-6 bottom-6 h-[45%] opacity-60`} style={{ clipPath: "polygon(0 80%, 20% 65%, 40% 55%, 60% 40%, 80% 25%, 100% 10%, 100% 100%, 0 100%)" }} />
      </div>
      <div className="mt-1 flex justify-between">
        <span className={`${BAR} h-3 w-14`} />
        <span className={`${BAR} h-3 w-14`} />
      </div>
      <div className="mt-5 h-[96px] rounded-xl border border-white/10 bg-white/[0.02]" />
      <span className={`${BAR} mt-5 block h-4 w-48`} />
      <span className="sr-only">Loading the history chart…</span>
    </div>
  );
}
