"""Leak II refresh logic with a fake Pantograph and a fake pin.sh: no Lean, no network."""
import asyncio, importlib.util, os, sys, tempfile, time

os.environ["LEAN_PROJECT_PATH"] = tempfile.mkdtemp()
os.environ["TENGOKU_DRAIN_MAX"] = "2"
spec = importlib.util.spec_from_file_location("leak2", os.path.expanduser("~/leak-topups/Leak-II/server.py"))
m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)


class FakeProc:
    def __init__(self): self.killed = False
    def kill(self): self.killed = True
    async def wait(self): return 0


class FakeServer:
    made = 0
    def __init__(self): FakeServer.made += 1; self.n = FakeServer.made; self.proc = FakeProc(); self.to_remove_goal_states = []
    async def restart_async(self): self.proc = FakeProc()
    async def goal_start_async(self, _): return object()


async def fake_get(worker, force_restart=False):
    if worker.server is None: worker.server = FakeServer()
    elif force_restart or worker.server.proc is None: await worker.server.restart_async()
    return worker.server

PIN = {"rc": 0, "head": "aaa"}
async def fake_run(cmd, cwd, timeout):
    if cmd[0].endswith("pin.sh") and "--check" in cmd: return 3, "newer bbb"
    if cmd[0].endswith("pin.sh"):
        if PIN["rc"] == 0: PIN["head"] = "bbb"
        return PIN["rc"], "pinned to bbb" if PIN["rc"] == 0 else "kept aaa: the build for bbb did not replay"
    if cmd[:2] == ["git", "rev-parse"]: return 0, PIN["head"]
    return 0, ""

m.get_lean_server = fake_get; m._run = fake_run
async def noop(): pass
m._ensure_pin = noop
def check(c, msg): print(("PASS " if c else "FAIL ") + msg); check.bad += (not c)
check.bad = 0


async def main():
    w0 = m._pool[0]; await fake_get(w0)
    # 1. idle worker: restarted in place, no second process
    out = await m._tengoku_sync()
    check(out.startswith("✅") and len(m._pool) == 1 and w0.gen == 1 and not w0.retiring, "idle worker is restarted in place")
    # 2. busy worker: retired, fresh worker appended, states survive
    m.proof_ledger["s1"] = {"worker": 0, "gen": w0.gen}; PIN["head"] = "aaa"
    out = await m._tengoku_sync(); await asyncio.sleep(0.05)
    check(w0.retiring and not w0.retired and len(m._pool) == 2 and "s1" in m.proof_ledger, "busy worker keeps its proof and a fresh worker appears")
    check(m._pick_worker().idx == 1, "new proofs go to the fresh worker")
    check(m._pool[0] is w0 and not w0.server.proc.killed, "the retired worker's process is still alive")
    # 3. a refresh during the drain is folded, not run and not dropped
    out = await m._tengoku_sync()
    check(out.startswith("⏳") and m._refresh["queued"], "a refresh during the drain is deferred, not dropped")
    # 4. janitor: stops the retired worker when its proofs are freed
    del m.proof_ledger["s1"]
    for w in m._draining():
        if m._live_count(w.idx) == 0: await m._stop_worker(w, "freed", forced=False)
    check(w0.retired and w0.server is None and m._refresh["drained"] == 1, "retired worker is stopped once its proofs are freed")
    # 5. deadline: a worker that never drains is stopped at the deadline, its states end
    w1 = m._pool[1]; m.proof_ledger["s2"] = {"worker": 1, "gen": w1.gen}; PIN["head"] = "aaa"
    m._refresh["queued"] = False
    await m._tengoku_sync(); check(w1.retiring and len(m._pool) == 3, "second generation retires the same way")
    await asyncio.sleep(2.1)
    for w in m._draining():
        if time.time() > w.retire_at: await m._stop_worker(w, "deadline", forced=True)
    check(w1.retired and "s2" not in m.proof_ledger and m._refresh["forced"] == 1, "deadline ends a worker that never drains")
    # 6. pin.sh exit 4: nothing is restarted
    PIN["rc"] = 4; gen = m._pool[2].gen if m._pool[2].server else None
    await fake_get(m._pool[2]); g = m._pool[2].gen
    out = await m._tengoku_sync()
    check(out.startswith("↩️") and m._pool[2].gen == g and m._refresh["kept"] == 1, "a kept state (exit 4) restarts nothing")
    # 7. stale lookups by index still resolve
    check(all(m._pool[i].idx == i for i in range(len(m._pool))), "worker indices stay valid")
    print("RESULT", "OK" if not check.bad else f"{check.bad} FAILED")

asyncio.run(main())
