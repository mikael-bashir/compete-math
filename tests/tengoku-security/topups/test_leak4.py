import asyncio, importlib.util, os, tempfile, types, sys
os.environ["LEAN_PROJECT_PATH"] = tempfile.mkdtemp(); os.environ["TENGOKU_REFRESH_MIN_GAP"] = "1"
spec = importlib.util.spec_from_file_location("leak4", os.path.expanduser("~/leak-topups/Leak-IV/server.py"))
m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
calls = {"sync": 0}
async def fake_check(): return "newer", "bbb"
async def fake_sync(): calls["sync"] += 1; m._refresh["running"] = True; await asyncio.sleep(0.4); m._refresh["running"] = False; return "✅"
async def fake_run(cmd, cwd, timeout): return 0, "aaa"
m._tree_check = fake_check; m._tengoku_sync = fake_sync; m._run = fake_run
class Req:
    def __init__(s, method): s.method = method
def check(c, msg): print(("PASS " if c else "FAIL ") + msg); check.bad += (not c)
check.bad = 0
async def main():
    import time; m._refresh["started_at"] = time.time()
    r1 = await m._refresh_endpoint(Req("POST")); await asyncio.sleep(0.05)
    codes = [(await m._refresh_endpoint(Req("POST"))).status_code for _ in range(6)]   # a burst while the first runs / inside the gap
    check(r1.status_code == 202 and all(c == 202 for c in codes) and m._refresh["queued"], "a burst of requests is accepted and folded (no 409/429)")
    await asyncio.sleep(31)
    check(calls["sync"] == 2 and not m._refresh["queued"], f"the burst cost exactly one extra refresh (ran {calls['sync']})")
    g = await m._refresh_endpoint(Req("GET")); check(g.status_code == 200 and b"topups" in g.body, "GET reports the top-up switch")
    print("RESULT", "OK" if not check.bad else f"{check.bad} FAILED")
asyncio.run(main())
