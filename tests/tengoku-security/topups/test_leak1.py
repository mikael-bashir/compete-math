"""Leak I refresh logic with a fake loogle and a fake pin.sh."""
import asyncio, importlib.util, os, sys, tempfile, types
# the semantic-search half (torch, chroma) is not under test: stub it
st = types.ModuleType("sentence_transformers"); st.SentenceTransformer = lambda *a, **k: object(); sys.modules["sentence_transformers"] = st
ch = types.ModuleType("chromadb")
class _C:
    def __init__(self, *a, **k): pass
    def get_or_create_collection(self, *a, **k): return self
    def get_collection(self, *a, **k): return self
    def count(self): return 0
ch.PersistentClient = _C; sys.modules["chromadb"] = ch
os.environ["TENGOKU_DIR"] = tempfile.mkdtemp()
os.chdir(os.path.expanduser("~/Leak-I"))  # chroma_db lives beside the server
spec = importlib.util.spec_from_file_location("leak1", os.path.expanduser("~/leak-topups/Leak-I/server.py"))
m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)

class FakeProc:
    returncode = None
    pid = 1
    def kill(self): self.returncode = -9
    async def wait(self): return 0

class FakeLoogle:
    made = 0; fail_next = False
    def __init__(self):
        FakeLoogle.made += 1; self.n = FakeLoogle.made; self.process = None; self.lock = asyncio.Lock(); self.is_ready = False
    async def boot(self): self.process = FakeProc()
    async def warmup(self):
        async with self.lock:
            await self.boot(); await asyncio.sleep(0.3)
            self.is_ready = not FakeLoogle.fail_next
    async def search(self, q):
        async with self.lock:
            return {"hits": [{"name": f"from-index-{self.n}", "type": "T"}], "count": 1} if self.is_ready else {"error": "index not ready"}

PIN = {"rc": 0, "head": "aaa"}
async def fake_run(cmd, cwd, timeout):
    if cmd[0].endswith("pin.sh") and "--check" in cmd: return 3, "newer bbb"
    if cmd[0].endswith("pin.sh"):
        if PIN["rc"] == 0: PIN["head"] = "bbb"
        return PIN["rc"], "pinned to bbb" if PIN["rc"] == 0 else "kept aaa: the build for bbb did not replay"
    if cmd[:2] == ["git", "rev-parse"]: return 0, PIN["head"]
    return 0, ""
async def noop(): pass
m._run = fake_run; m._ensure_pin = noop; m.LoogleDaemon = FakeLoogle
def check(c, msg): print(("PASS " if c else "FAIL ") + msg); check.bad += (not c)
check.bad = 0

async def main():
    m.loogle_engine = FakeLoogle(); await m.loogle_engine.warmup()
    first = m.loogle_engine
    answers = []
    async def hammer():
        for _ in range(12):
            answers.append((await m.loogle_engine.search("x")).get("hits", [{}])[0].get("name")); await asyncio.sleep(0.04)
    sync = asyncio.create_task(m._tengoku_sync()); await asyncio.sleep(0.01)
    await hammer(); out = await sync
    check(out.startswith("✅") and m._refresh["swaps"] == 1 and m.loogle_engine is not first, "new index swapped in")
    check(None not in answers and answers[0] == "from-index-1" and "from-index-2" in answers + [(await m.loogle_engine.search("x"))["hits"][0]["name"]], f"every search during the refresh was answered ({len(answers)} searches, old index then new)")
    check(first.process is None and not first.is_ready, "the old loogle is stopped after the swap")
    # the new index fails to load: keep the old one
    FakeLoogle.fail_next = True; keep = m.loogle_engine; PIN["head"] = "aaa"
    out = await m._tengoku_sync()
    check(out.startswith("❌") and m.loogle_engine is keep and keep.is_ready, "an index that does not load is discarded; the old one keeps serving")
    FakeLoogle.fail_next = False
    # exit 4
    PIN["rc"] = 4; made = FakeLoogle.made
    out = await m._tengoku_sync()
    check(out.startswith("↩️") and FakeLoogle.made == made, "a kept state (exit 4) starts no new index")
    # blue/green off → cold restart path still works
    PIN["rc"] = 0; PIN["head"] = "aaa"; m.BLUE_GREEN = False
    out = await m._tengoku_sync(); await asyncio.sleep(0.5)
    check(out.startswith("✅") and m._refresh["cold"] == 1 and m.loogle_engine.is_ready, "with the swap switched off the old restart path still works")
    check(isinstance(m._memory(), dict), "memory probe never raises")
    print("RESULT", "OK" if not check.bad else f"{check.bad} FAILED")
asyncio.run(main())
