// What /tengoku shows while its numbers are being counted. Each block is sized like the thing that replaces it (a pill, the chart's box), so the
// page does not jump when the data arrives.

const BAR = "motion-safe:animate-pulse rounded bg-white/[0.06]";
const PILL = "block h-[30px] rounded-full border border-white/10 bg-white/[0.03] motion-safe:animate-pulse";

/** The four stat pills, as the pills themselves are laid out (same row, same height). */
export function PillsSkeleton() {
  return (
    <div role="status" aria-label="Counting the theorems" className="not-prose mt-8 flex flex-wrap items-center justify-center gap-3 sm:grid sm:grid-cols-[1fr_auto_1fr]">
      <span className="flex w-full justify-center sm:col-start-2 sm:row-start-1 sm:w-auto">
        <span className={`${PILL} w-44`} />
      </span>
      <span className="sm:col-start-1 sm:row-start-1 sm:justify-self-end">
        <span className={`${PILL} w-40`} />
      </span>
      <span className="sm:col-start-3 sm:row-start-1 sm:justify-self-start">
        <span className={`${PILL} w-28`} />
      </span>
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
