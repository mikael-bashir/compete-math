"""Steady traffic against the three Leak Spaces while the sandbox churns. One TSV line per call:
ts  space  tool  ok|FAIL|LOST  seconds  detail      — plus /refresh status snapshots every cycle."""
import asyncio, json, re, sys, time, urllib.request
from mcp import ClientSession
from mcp.client.sse import sse_client

OUT = sys.argv[1]; PERIOD = float(sys.argv[2]) if len(sys.argv) > 2 else 30
HOSTS = {"IV": "https://barkingtree-leak-iv.hf.space", "II": "https://barkingtree-leak-ii.hf.space", "I": "https://barkingtree-leak-i.hf.space"}
EXTRA = {"lemma": None}   # a lemma name that only exists after a promotion (set through the control file)
CONTROL = OUT + ".control"

def log(space, tool, status, secs, detail):
    if status != "ok" and tool != "status":
        with open(OUT + ".failures", "a") as f:
            f.write("=== " + time.strftime("%H:%M:%S", time.gmtime()) + f" {space} {tool} {status} {secs:.1f}s" + chr(10) + str(detail) + chr(10))
    with open(OUT, "a") as f:
        f.write("\t".join([time.strftime("%H:%M:%S", time.gmtime()), space, tool, status, f"{secs:.1f}", " ".join(str(detail).split())[:220]]) + "\n")

async def call(space, tool, args, timeout=420):
    t0 = time.time()
    try:
        async with sse_client(HOSTS[space] + "/sse", timeout=30, sse_read_timeout=timeout) as (r, w):
            async with ClientSession(r, w) as s:
                await asyncio.wait_for(s.initialize(), 60)
                res = await asyncio.wait_for(s.call_tool(tool, args), timeout)
                text = " ".join(getattr(c, "text", "") for c in res.content)
                return time.time() - t0, text
    except BaseException as e:  # noqa: BLE001 — a dropped stream raises exception groups
        if isinstance(e, (KeyboardInterrupt, SystemExit)): raise
        return time.time() - t0, f"EXC {type(e).__name__}: {e}"

def status(space):
    try:
        with urllib.request.urlopen(HOSTS[space] + "/refresh", timeout=60) as r:
            return json.loads(r.read())
    except Exception as e:
        return {"error": f"{type(e).__name__}: {e}"}

async def leak4():
    n = 0
    while True:
        n += 1
        secs, text = await call("IV", "verify_full_script", {"script": f"theorem soak_{n} (a b : Nat) : a + b = b + a := Nat.add_comm a b"})
        ok = ("✅" in text or "success" in text.lower() or "no errors" in text.lower()) and "EXC" not in text
        log("IV", "verify", "ok" if ok else "FAIL", secs, text if not ok else text[:200])
        try: lemma = open(CONTROL).read().strip()
        except Exception: lemma = ""
        if lemma:
            secs, text = await call("IV", "verify_full_script", {"script": f"open FirstOrder.Language.Formula in\ntheorem soak_uses_new_{n} : (1 : Nat) + 1 = 2 := {lemma}"})
            ok = ("✅" in text or "success" in text.lower()) and "EXC" not in text
            log("IV", f"verify-new:{lemma}", "ok" if ok else "FAIL", secs, text[:200])
        await asyncio.sleep(PERIOD)

async def leak1():
    while True:
        secs, text = await call("I", "loogle_search", {"query": "Nat.add_comm"}, timeout=400)
        log("I", "loogle", "ok" if "Nat.add_comm" in text and "Error" not in text and "EXC" not in text else "FAIL", secs, text[:160])
        await asyncio.sleep(PERIOD)

async def leak2():
    """Short proofs (init → tactic → free) plus ONE long-lived proof that must survive refreshes."""
    held = None; held_since = 0; n = 0
    try:
        held, hs = open(OUT + ".held").read().split(); held_since = float(hs)
    except Exception:
        pass
    while True:
        n += 1
        secs, text = await call("II", "init_proof", {"proposition": "forall (a b : Nat), a + b = b + a"})
        m = re.search(r"State ID: ([0-9a-f-]{36})", text)
        if not m: log("II", "init", "FAIL", secs, text)
        else:
            sid = m.group(1); log("II", "init", "ok", secs, "")
            secs, text = await call("II", "apply_tactic", {"state_id": sid, "tactic": "intro a b"})
            log("II", "tactic", "ok" if "Error" not in text and "EXC" not in text else "FAIL", secs, text[:160])
            await call("II", "cleanup_memory", {"state_id": sid})
        if held is None:
            secs, text = await call("II", "init_proof", {"proposition": "forall (n : Nat), n + 0 = n"})
            m = re.search(r"State ID: ([0-9a-f-]{36})", text)
            if m:
                held, held_since = m.group(1), time.time(); log("II", "held-init", "ok", secs, held[:8])
                open(OUT + ".held", "w").write(f"{held} {held_since}")
        else:
            secs, text = await call("II", "get_current_proof_state", {"state_id": held})
            alive = "not found" not in text and "lost" not in text and "EXC" not in text
            log("II", "held-state", "ok" if alive else "LOST", secs, f"age={int(time.time()-held_since)}s {text[:100]}")
            if not alive and "EXC" not in text: held = None
        await asyncio.sleep(PERIOD)

async def snapshots():
    while True:
        for sp in HOSTS:
            st = await asyncio.to_thread(status, sp)
            log(sp, "status", "ok" if "error" not in st else "FAIL", 0, json.dumps(st)[:215])
        await asyncio.sleep(max(60, PERIOD * 2))

async def main():
    await asyncio.gather(leak4(), leak1(), leak2(), snapshots())
asyncio.run(main())
