'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useSession } from 'next-auth/react';
import { toast } from 'sonner';
import {
  Loader2,
  Send,
  ShieldCheck,
  ShieldAlert,
  GitBranch,
  Square,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { fetchProverMcpServers } from '@/lib/mcp/fetch-prover-servers';
import {
  runProverStream,
  extendProverRun,
} from '@/lib/prover/run-prover-stream';
import { ProverConsole } from '@/components/prover/prover-console';
import type { ProverEvent, ProverOutcome } from '@/lib/prover/types';
import { LEAK_TARGETS, findLeakTarget } from '@/data/leak-targets';
import { LeakMemoryModal } from '@/components/prover/leak-memory-modal';
import {
  MEMORY_VARIANTS,
  applyMemoryFrame,
  deleteMemoryEntry,
  isMemoryStrategy,
  loadMemory,
  packMemory,
  saveMemoryEntries,
  setMemoryNominated,
  type MemoryEntry,
} from '@/lib/prover/memory-client';
import { publishMemory, publishProverEvent, publishRunEnd, publishRunReset } from '@/lib/universe/live-bus';

// Wall-clock budget for a decomposition (tree) run. The tree path governs by
// TIME when this is set and reports a runId so "+5 min" can push it out; the
// single-agent path ignores it. Never a cap on the prover otherwise.
const PLAYGROUND_COMPUTE_BUDGET_MS = 30 * 60_000;
// Longest wall-clock limit the bridge honours: 48 h for the memory variants (built for 12-24 h runs), 6 h for the rest.
const limitCapHours = (strategy: string) => (isMemoryStrategy(strategy) ? 48 : 6);
// The architect strategy is governed much tighter — fail fast/cheap while
// it's under test — and extends one minute at a time instead of five.
const ARCHITECT_COMPUTE_BUDGET_MS = 5 * 60_000;
const ARCHITECT_EXTEND_MS = 1 * 60_000;
// Grok is the only driver proveArchitect supports — lock the model selector
// to this value whenever a Leak River strategy is active.
const ARCHITECT_MODEL = 'grok-4-1-fast-reasoning';
const ARCHITECT_DEFAULT_ITERS = 5;
const isRiverStrategy = (s: string) =>
  s === 'architect' || s.startsWith('river-');
// Leak Ultra runs the same blueprint pipeline with the local Claude CLI as
// driver, so it inherits the model selector instead of locking it.
const isUltraStrategy = (s: string) => s.startsWith('ultra-');
const isArchitectStrategy = (s: string) =>
  isRiverStrategy(s) || isUltraStrategy(s);

// A minimal "message the prover" surface: send a statement, watch every step,
// extend the compute budget live, or terminate.
export function ProverPlayground() {
  // A statement that crosses libraries: periodicity (algebra), compactness (topology), the interval integral (analysis and measure theory).
  const [problem, setProblem] = useState(
    'theorem sample (f : ℝ → ℝ) (hf : Continuous f) (hp : Function.Periodic f 1) :\n    (∃ M, ∀ x, |f x| ≤ M) ∧ ∀ x, ∫ t in x..x + 1, f t = ∫ t in (0:ℝ)..1, f t := by sorry',
  );
  const [events, setEvents] = useState<ProverEvent[]>([]);
  const [running, setRunning] = useState(false);
  const [outcome, setOutcome] = useState<ProverOutcome | null>(null);
  // Decomposition mode drives the /prove-tree orchestrator: prove-or-split, so a
  // stalled goal is broken into verified sub-lemmas instead of looping forever.
  const [decompose, setDecompose] = useState(true);
  // Strategy mode for A/B testing proof approaches (tree path only).
  const [strategy, setStrategy] = useState('control-oneshot-2');
  // Model the prover runs on ('' = the bridge/CLI default). Starts on Sonnet 5.5: strong, and quick enough to watch.
  const [model, setModel] = useState('claude-sonnet-5-5');
  // Architect strategy always drives Grok directly — force + lock the model.
  useEffect(() => {
    if (isRiverStrategy(strategy)) setModel(ARCHITECT_MODEL);
    else setModel((m) => (m === ARCHITECT_MODEL ? '' : m));
  }, [strategy]);
  // Roadmap target ('' = free text). Selecting one fills the statement, which is then fixed to what was vetted.
  const [targetId, setTargetId] = useState('');
  const target = findLeakTarget(targetId);
  const customProblem = useRef('');
  // Optional limits for the run: wall-clock (hours) and a dollar cap on the CLI's list-price estimate. Blank = default / none.
  const [limitHours, setLimitHours] = useState('');
  const [costCap, setCostCap] = useState('');
  // Memory of the signed-in account for the selected target (the bridge keeps nothing between runs).
  const { data: session } = useSession();
  const signedIn = !!session?.user;
  const [memory, setMemory] = useState<MemoryEntry[]>([]);
  const [memoryLoading, setMemoryLoading] = useState(false);
  const [memoryStats, setMemoryStats] = useState<Record<string, number> | null>(null);
  const [memoryLimits, setMemoryLimits] = useState({ maxNominated: 10, minNominatedForAudit: 3 });
  const pendingSave = useRef<Map<string, MemoryEntry>>(new Map());
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const warnedSave = useRef(false);
  const memoryRef = useRef<MemoryEntry[]>([]);
  memoryRef.current = memory;

  const pickTarget = (id: string) => {
    const t = findLeakTarget(id);
    if (t && !targetId) customProblem.current = problem;
    setTargetId(id);
    if (t) setProblem(t.statement);
    else if (customProblem.current) setProblem(customProblem.current);
  };

  // Load this account's saved theorems whenever the target (or the account) changes.
  useEffect(() => {
    setMemoryStats(null);
    setMemory([]);
    if (!targetId || !signedIn) return;
    let live = true;
    setMemoryLoading(true);
    loadMemory(targetId).then((r) => {
      if (!live) return;
      setMemoryLoading(false);
      if (r.ok) {
        setMemory(r.data.entries);
        setMemoryLimits({ maxNominated: r.data.limits.maxNominated, minNominatedForAudit: r.data.limits.minNominatedForAudit });
      }
    });
    return () => {
      live = false;
    };
  }, [targetId, signedIn]);

  const flushSaves = useCallback(async () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = null;
    if (!targetId || !signedIn || pendingSave.current.size === 0) return;
    const batch = [...pendingSave.current.values()].slice(0, 100);
    for (const e of batch) pendingSave.current.delete(e.id);
    const r = await saveMemoryEntries(targetId, batch);
    if (!r.ok && !warnedSave.current) {
      warnedSave.current = true;
      toast.error(`Could not save to your memory (${r.error}). Entries stay in this tab until you reload.`);
    }
    if (pendingSave.current.size) saveTimer.current = setTimeout(() => void flushSaves(), 1500);
  }, [targetId, signedIn]);

  const onMemoryFrame = useCallback(
    (frame: import('@/lib/prover/run-prover-stream').MemoryFrame) => {
      if (frame.op === 'stats') {
        setMemoryStats(frame.stats);
        publishMemory('stats', frame.stats.size);
        return;
      }
      setMemory((prev) => applyMemoryFrame(prev, frame));
      // the visualiser's orb: a save is a spark and one more theorem in the orb
      if (frame.op === 'save' || frame.op === 'update') publishMemory(frame.op);
      if (frame.op === 'save' || frame.op === 'update') {
        const e = frame.entry as unknown as MemoryEntry;
        if (e?.id) pendingSave.current.set(e.id, e);
        if (!saveTimer.current) saveTimer.current = setTimeout(() => void flushSaves(), 2000);
      } else if (frame.op === 'nominate' && targetId && signedIn) {
        void setMemoryNominated(targetId, frame.id, frame.nominated);
      }
    },
    [flushSaves, targetId, signedIn],
  );

  const nominate = useCallback(
    async (id: string, on: boolean) => {
      if (!targetId) return;
      setMemory((m) => m.map((e) => (e.id === id ? { ...e, nominated: on } : e)));
      if (!signedIn) return;
      const r = await setMemoryNominated(targetId, id, on);
      if (!r.ok || !r.data.ok) {
        setMemory((m) => m.map((e) => (e.id === id ? { ...e, nominated: !on } : e)));
        toast.error(r.ok ? (r.data.reason ?? 'Could not nominate') : r.error);
      }
    },
    [targetId, signedIn],
  );

  const removeEntry = useCallback(
    async (id: string) => {
      if (!targetId) return;
      setMemory((m) => m.filter((e) => e.id !== id));
      if (signedIn) await deleteMemoryEntry(targetId, id);
    },
    [targetId, signedIn],
  );

  // Refinement-iteration budget for Leak River runs (+1 per click).
  const [maxIters, setMaxIters] = useState(ARCHITECT_DEFAULT_ITERS);

  // Live compute-budget state for the tree path: the bridge reports a runId +
  // deadline via onRunId; the "+5 min" button (extend) pushes the deadline out.
  const [computeLimit, setComputeLimit] = useState<{
    deadlineMs: number;
    budgetMs: number;
  } | null>(null);
  const [extending, setExtending] = useState(false);
  const [extendingIters, setExtendingIters] = useState(false);
  const runIdRef = useRef<string | null>(null);
  // Latest saved checkpoint (a partially-filled skeleton) from a decompose run.
  // Persists in component state so you can Resume after a Terminate or a stop.
  const [checkpoint, setCheckpoint] = useState<{
    skeleton: string;
    filled: number;
    total: number;
  } | null>(null);
  // Lets the Terminate button abort a running prove; aborting the fetch trips the
  // bridge's disconnect handler, which kills the claude run server-side.
  const abortRef = useRef<AbortController | null>(null);

  const run = useCallback(
    async (seed?: string) => {
      if (!problem.trim()) return;
      // Resuming is always a tree run (the seed is a have-tree skeleton).
      const asTree = decompose || !!seed;
      setRunning(true);
      setEvents([]);
      setOutcome(null);
      setComputeLimit(null);
      runIdRef.current = null;
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      publishRunReset();
      if (asTree && isMemoryStrategy(strategy)) publishMemory('load', memoryRef.current.length);
      const append = (e: ProverEvent) => {
        publishProverEvent(e);
        setEvents((prev) => [...prev, e]);
      };
      // The account's limits for this run, validated: hours within (0, 48], dollars within (0, 5000].
      const hours = Number(limitHours);
      const customBudgetMs = Number.isFinite(hours) && hours > 0 ? Math.min(hours, limitCapHours(strategy)) * 3_600_000 : 0;
      const cap = Number(costCap);
      const maxCostUsd = Number.isFinite(cap) && cap > 0 ? Math.min(cap, 5000) : undefined;
      const usesMemory = asTree && isMemoryStrategy(strategy);
      pendingSave.current.clear();
      try {
        const mcpServers = await fetchProverMcpServers();
        const out = await runProverStream({
          problem,
          mcpServers,
          model: model || undefined,
          signal: ctrl.signal,
          onEvent: append,
          endpoint: asTree ? 'prove-tree' : 'prove-stream',
          strategy: asTree ? strategy : undefined,
          seed,
          // Tree path runs under an extendable wall-clock budget; the single-agent
          // path ignores it (and never fires onRunId), so no indicator shows.
          // Architect gets a much tighter budget (see ARCHITECT_COMPUTE_BUDGET_MS).
          computeBudgetMs: asTree
            ? isArchitectStrategy(strategy)
              ? ARCHITECT_COMPUTE_BUDGET_MS
              : customBudgetMs || PLAYGROUND_COMPUTE_BUDGET_MS
            : undefined,
          maxCostUsd: asTree ? maxCostUsd : undefined,
          targetId: usesMemory && target ? target.id : undefined,
          memoryEntries: usesMemory && target ? packMemory(memoryRef.current) : undefined,
          onMemory: usesMemory ? onMemoryFrame : undefined,
          maxIters: isArchitectStrategy(strategy) ? maxIters : undefined,
          onRunId: ({ runId, deadlineMs, budgetMs }) => {
            runIdRef.current = runId;
            setComputeLimit({ deadlineMs, budgetMs });
          },
          // Auto-save the latest banked checkpoint so a stop/Terminate can Resume.
          onCheckpoint: (cp) => setCheckpoint(cp),
        });
        setOutcome(out);
      } catch {
        /* the console already shows the error event (or the abort) */
      } finally {
        await flushSaves();
        publishRunEnd();
        setRunning(false);
        runIdRef.current = null;
        abortRef.current = null;
      }
    },
    [problem, decompose, strategy, model, maxIters, limitHours, costCap, target, onMemoryFrame, flushSaves],
  );

  // Push the running prove's wall-clock budget out. Best-effort.
  const extend = useCallback(async () => {
    const runId = runIdRef.current;
    if (!runId || extending) return;
    setExtending(true);
    try {
      const addMs = isArchitectStrategy(strategy) ? ARCHITECT_EXTEND_MS : 5 * 60_000;
      const r = await extendProverRun({ runId, addMs });
      if (r) setComputeLimit(r);
    } finally {
      setExtending(false);
    }
  }, [extending, strategy]);

  // "+1 iter": raise the refinement budget for the NEXT run and, while a River
  // run is live, for that run too (the bridge re-reads the budget each iteration).
  const extendIters = useCallback(async () => {
    if (extendingIters) return;
    setExtendingIters(true);
    try {
      setMaxIters((n) => Math.min(32, n + 1));
      const runId = runIdRef.current;
      if (!runId) return;
      const r = await extendProverRun({ runId, addIters: 1 });
      if (r?.maxIters) setMaxIters(r.maxIters);
    } finally {
      setExtendingIters(false);
    }
  }, [extendingIters]);

  const terminate = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  return (
    <div className="space-y-4">
      <Textarea
        value={problem}
        onChange={(e) => setProblem(e.target.value)}
        readOnly={!!target}
        rows={4}
        className="font-mono text-sm"
        placeholder="Enter a statement (Lean theorem, or a problem to prove)…"
      />
      <div className="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={() => setDecompose((v) => !v)}
          disabled={running}
          className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] transition-colors ${
            decompose
              ? 'border-violet-500/50 bg-violet-500/10 text-violet-600 dark:text-violet-400'
              : 'text-muted-foreground hover:bg-muted'
          }`}
          title="Break the goal into verified sub-lemmas recursively (prove-or-split tree)"
        >
          <GitBranch className="size-3" />
          Decompose {decompose ? 'on' : 'off'}
        </button>
        <label className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
          Model
          <select
            value={isRiverStrategy(strategy) ? ARCHITECT_MODEL : model}
            onChange={(e) => setModel(e.target.value)}
            disabled={running || isRiverStrategy(strategy)}
            className="w-auto! rounded-md border bg-background px-1.5 py-0.5 text-[10px] disabled:opacity-60"
            title={
              isRiverStrategy(strategy)
                ? 'Leak River strategies always drive Grok directly — model is locked.'
                : undefined
            }
          >
            {isRiverStrategy(strategy) ? (
              <option value={ARCHITECT_MODEL}>
                Grok 4.1 Fast Reasoning (forced)
              </option>
            ) : (
              <>
                <option value="">Default</option>
                <option value="claude-opus-4-8">Opus 4.8</option>
                <option value="claude-sonnet-5-5">Sonnet 5.5</option>
                <option value="claude-sonnet-5">Sonnet 5</option>
                <option value="claude-fable-5">Fable 5</option>
                <option value="claude-haiku-4-5-20251001">Haiku 4.5</option>
              </>
            )}
          </select>
        </label>
        {decompose && (
          <label className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
            Strategy
            <select
              value={strategy}
              onChange={(e) => setStrategy(e.target.value)}
              disabled={running}
              className="w-auto! max-w-[180px] truncate rounded-md border bg-background px-1.5 py-0.5 text-[10px]"
            >
              <option value="hacker">Hacker (compiler-driven)</option>
              <option value="pantograph">Pantograph (interactive Leak II)</option>
              <option value="librarian">Librarian (search-first control)</option>
              <option value="sketch">Sketch (plan then formalize)</option>
              <option value="brute">Brute (automation only)</option>
              <option value="have">Have (in-context, no top-level lemmas)</option>
              <option value="control-oneshot">
                Leak Control I (one continuous agent, one-shot, Leak IV only — no decomposition)
              </option>
              <option value="control-oneshot-2">
                Leak Control II (one continuous agent, one-shot, Leak IV + Leak I search — no decomposition)
              </option>
              <option value="control-oneshot-4">
                Leak Control IV (one continuous agent, one-shot, Leak IV + Leak I search + Leak II Pantograph — no decomposition)
              </option>
              <option value="control-oneshot-3">
                Leak Control III (blind prover — no tools / no error feedback — + separate Leak IV gate)
              </option>
              {/* value stays `have-tree` — renaming it would orphan saved
                  checkpoints and every existing research row. */}
              <option value="have-tree">
                Leak Stronghold Dark (planner + isolated per-hole minions)
              </option>
              <option value="have-surround">
                Leak Stronghold Surround (parallel minion waves, ghost-army Leak II)
              </option>
              <option value="finality-1">
                Leak Finality I (Surround + timed skeleton refinement)
              </option>
              <option value="stronghold-force">
                Leak Stronghold Force (dedicated recursive decomposer, no finisher)
              </option>
              <option value="stronghold-forte">
                Leak Stronghold Forte (Force + reliable handoff, opening pool, duplicate-cut guard)
              </option>
              <option value="stronghold-keep">
                Leak Stronghold Keep (flat first, bounded gated siege, guaranteed
                flat finisher)
              </option>
              <option value="stronghold-impenetrable">
                Leak Stronghold Impenetrable (apply?-driven recon sweep, then
                Surround)
              </option>
              <optgroup label="Control II memory (experimental · pick a target to use them)">
                {MEMORY_VARIANTS.map((v) => (
                  <option key={v.key} value={v.key}>
                    {v.label} ({v.blurb})
                  </option>
                ))}
              </optgroup>
              <optgroup label="Leak Ultra (Goedel blueprint · claude driver)">
                <option value="ultra-fleeting">
                  Leak Ultra Fleeting (model from the selector)
                </option>
              </optgroup>
              <optgroup label="Leak River (Goedel blueprint · grok driver)">
                <option value="river-stone">Leak River Stone (control)</option>
                <option value="river-gate">Leak River Gate (+ dead-end ledger)</option>
                <option value="river-delta">Leak River Delta (+ Sonnet 5 NL seed)</option>
                <option value="river-vintage">
                  Leak River Vintage (+ oversight watchers)
                </option>
              </optgroup>
            </select>
          </label>
        )}
        <label className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
          Target
          <select
            value={targetId}
            onChange={(e) => pickTarget(e.target.value)}
            disabled={running}
            className="w-auto! max-w-[200px] truncate rounded-md border bg-background px-1.5 py-0.5 text-[10px]"
            title="A vetted open problem, stated once, to point the run at. Free text keeps the box above editable."
          >
            <option value="">Free text</option>
            {LEAK_TARGETS.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title}
              </option>
            ))}
          </select>
        </label>
        {decompose && !isArchitectStrategy(strategy) && (
          <>
            <label className="inline-flex items-center gap-1 text-[10px] text-muted-foreground" title={`Wall-clock limit for the run, up to ${limitCapHours(strategy)} h for this strategy. Blank = ${PLAYGROUND_COMPUTE_BUDGET_MS / 60_000} min.`}>
              Time limit
              <input
                type="number"
                min={0.1}
                max={limitCapHours(strategy)}
                step={0.5}
                value={limitHours}
                onChange={(e) => setLimitHours(e.target.value)}
                disabled={running}
                placeholder={`${PLAYGROUND_COMPUTE_BUDGET_MS / 60_000} min`}
                className="w-16 rounded-md border bg-background px-1.5 py-0.5 text-[10px]"
              />
              h
            </label>
            <label className="inline-flex items-center gap-1 text-[10px] text-muted-foreground" title="Stop when the CLI's list-price cost estimate reaches this. Blank = no cap.">
              Cost cap $
              <input
                type="number"
                min={1}
                max={5000}
                step={5}
                value={costCap}
                onChange={(e) => setCostCap(e.target.value)}
                disabled={running}
                placeholder="none"
                className="w-16 rounded-md border bg-background px-1.5 py-0.5 text-[10px]"
              />
            </label>
          </>
        )}
        {target && (
          <LeakMemoryModal
            targetId={target.id}
            targetTitle={target.short}
            entries={memory}
            signedIn={signedIn}
            loading={memoryLoading}
            stats={memoryStats}
            maxNominated={memoryLimits.maxNominated}
            minNominated={memoryLimits.minNominatedForAudit}
            onNominate={nominate}
            onDelete={removeEntry}
          />
        )}
        {/* The refinement-budget control lives on the console below, alongside the
            clock control, so it can be raised MID-FLIGHT and not just per run. */}
        <div className="ml-auto flex items-center gap-1.5">
          {!running && checkpoint && (
            <button
              type="button"
              onClick={() => run(checkpoint.skeleton)}
              className="inline-flex items-center gap-1 rounded-md border border-violet-500/50 bg-violet-500/10 px-1.5 py-0.5 text-[10px] text-violet-600 transition-colors hover:bg-violet-500/20 dark:text-violet-400"
              title="Continue from the saved checkpoint instead of restarting"
            >
              <GitBranch className="size-3" />
              Resume ({checkpoint.filled}/{checkpoint.total})
            </button>
          )}
          {running && (
            <button
              type="button"
              onClick={terminate}
              className="inline-flex items-center gap-1 rounded-md border border-rose-500/50 bg-rose-500/10 px-1.5 py-0.5 text-[10px] text-rose-600 transition-colors hover:bg-rose-500/20 dark:text-rose-400"
              title="Stop this prove — kills the claude run server-side via the bridge"
            >
              <Square className="size-3" />
              Terminate
            </button>
          )}
          <Button
            size="sm"
            onClick={() => run()}
            disabled={running || !problem.trim()}
            className="h-6 gap-1 px-2 text-[10px] [&_svg]:size-3"
          >
            {running ? (
              <Loader2 className="animate-spin" />
            ) : (
              <Send />
            )}
            Send to prover
          </Button>
        </div>
      </div>
      {decompose && isMemoryStrategy(strategy) && (
        <p className="text-xs text-muted-foreground">
          {MEMORY_VARIANTS.find((v) => v.key === strategy)?.label}: {MEMORY_VARIANTS.find((v) => v.key === strategy)?.blurb}.{' '}
          {target
            ? signedIn
              ? 'Every non-trivial theorem it verifies on Leak IV is saved to your account for this target.'
              : 'Sign in to keep what it saves between sessions.'
            : 'Pick a target to give it a memory; without one it runs with an empty library.'}
        </p>
      )}
      {decompose && (
        <p className="text-xs text-muted-foreground">
          Prove-or-split: each goal gets a bounded direct attempt, then is broken
          into toolchain-verified sub-lemmas (recursively) and assembled into one
          sorry-free proof.{' '}
          {strategy === 'pantograph'
            ? 'Pantograph mode builds proofs interactively in Leak II; Leak IV is used only as the final guardrail.'
            : 'Hacker mode leads with the compiler (verify_full_script) and strong automation.'}{' '}
          Needs a verify_full_script MCP server connected. Runs under a compute budget of{' '}
          {Number(limitHours) > 0 && !isArchitectStrategy(strategy)
            ? `${Math.min(Number(limitHours), limitCapHours(strategy))} h`
            : `${Math.round(
                (isArchitectStrategy(strategy)
                  ? ARCHITECT_COMPUTE_BUDGET_MS
                  : PLAYGROUND_COMPUTE_BUDGET_MS) / 60_000,
              )} min`}{' '}
          that you can extend live (+
          {Math.round(
            (isArchitectStrategy(strategy) ? ARCHITECT_EXTEND_MS : 5 * 60_000) /
              60_000,
          )}{' '}
          min)
          {isArchitectStrategy(strategy)
            ? `, with ${maxIters} refinement iteration(s) — raise either live from the console header`
            : ''}
          .
        </p>
      )}

      <ProverConsole
        events={events}
        running={running}
        computeLimit={computeLimit}
        onExtend={extend}
        extending={extending}
        extendLabel={isArchitectStrategy(strategy) ? '1 min' : '5 min'}
        iterLimit={
          decompose && isArchitectStrategy(strategy) ? { budget: maxIters } : null
        }
        onExtendIters={extendIters}
        extendingIters={extendingIters}
        onResetIters={
          maxIters === ARCHITECT_DEFAULT_ITERS
            ? undefined
            : () => setMaxIters(ARCHITECT_DEFAULT_ITERS)
        }
      />

      {!outcome && events.some((e) => e.kind === 'verified') && (
        <div className="flex items-start gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-4" role="status">
          <ShieldCheck className="mt-0.5 size-4 text-emerald-500" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">Proof verified. This run is complete.</p>
            <p className="mt-1 text-xs text-muted-foreground">{running ? 'Closing the run down; nothing more is being tried.' : 'The prover has stopped.'}</p>
          </div>
        </div>
      )}

      {outcome && (
        <div
          className={`flex items-start gap-2 rounded-lg border p-4 ${
            outcome.verified
              ? 'border-emerald-500/40 bg-emerald-500/10'
              : 'border-amber-500/40 bg-amber-500/10'
          }`}
        >
          {outcome.verified ? (
            <ShieldCheck className="mt-0.5 size-4 text-emerald-500" />
          ) : (
            <ShieldAlert className="mt-0.5 size-4 text-amber-500" />
          )}
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">
              {outcome.verified
                ? 'Verified by your MCP server'
                : 'Not verified'}
            </p>
            {outcome.proof && (
              <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded bg-background/60 p-3 font-mono text-xs">
                {outcome.proof}
              </pre>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
