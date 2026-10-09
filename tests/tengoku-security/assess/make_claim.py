#!/usr/bin/env python3
"""make_claim.py <repo root> <staging file> <claim dir> <pinned commit> <email> closed|resisted ... — a full-length claim
without waiting for one (scenario fixture: same shapes as the runner writes, times fabricated)."""
import base64, json, sys
from pathlib import Path
root, staging, out, pinned, email = Path(sys.argv[1]), sys.argv[2], sys.argv[3], sys.argv[4], sys.argv[5]
sys.path.insert(0, str(root / "scripts" / "assess"))
import common as C
recs = [json.loads(l) for l in (root / staging).read_text().splitlines() if l.strip()]
outcomes = sys.argv[6:]
d = root / out; d.mkdir(parents=True, exist_ok=True)
heads = []
for i, (rec, outcome) in enumerate(zip(recs, outcomes), 1):
    closed = outcome == "closed"
    lines = [{"t": 0.0, "kind": "runner", "version": C.VERSION, "headline": rec["name"], "statement_sha256": C.sha256(C.theorem_text(rec)), "prompt": C.prompt_for(rec), "budget": {"soft_s": C.SOFT_S, "hard_s": C.HARD_S}, "services": C.SERVICES, "pinned": {k: pinned for k in C.SERVICES}, "started_at": "2026-09-20T12:00:00Z"},
             {"t": 0.4, "kind": "event", "event": {"type": "system", "subtype": "init", "model": "claude-sonnet-5", "tools": C.ALLOWED_TOOLS, "mcp_servers": [{"name": s, "status": "connected"} for s in C.SERVICES]}}]
    t = 1.0
    for n in range(2 if closed else 13):
        last = closed and n == 1
        tool = "mcp__verify__verify_full_script" if n % 3 == 0 or last else ("mcp__search__loogle_search" if n % 3 == 1 else "mcp__states__apply_tactic")
        script = C.theorem_text(rec) + " := by simp"
        inp = {"script": script} if "verify" in tool else ({"query": "Nat.add"} if "search" in tool else {"state_id": "0123abcd", "tactic": "simp"})
        ok = "✅ Compilation Successful! The proof is 100% verified.\n[[LEAK_NORMALIZED_SCRIPT_B64:" + base64.b64encode(("import Tengoku.All\n\n" + script).encode()).decode() + "]]"
        lines.append({"t": t, "kind": "event", "event": {"type": "assistant", "message": {"model": "claude-sonnet-5", "content": [{"type": "text", "text": f"(scenario fixture) idea {n}: try the next standard approach."}, {"type": "tool_use", "id": f"c{n}", "name": tool, "input": inp}], "usage": {}}}})
        lines.append({"t": t + 2, "kind": "event", "event": {"type": "user", "message": {"content": [{"type": "tool_result", "tool_use_id": f"c{n}", "content": json.dumps({"result": ok if last else "❌ Compilation Failed: unsolved goals"})}]}}})
        t += 3 if closed else 23.5
    lines.append({"t": t, "kind": "runner", "end": "closed" if closed else "soft-budget", "seconds": t})
    m = C.measure(lines, rec); stem = f"{i}-{C.slug(rec['name'])}"
    C.write_transcript(d / f"{stem}.transcript.jsonl.gz", lines); (d / f"{stem}.working.md").write_text(C.render_working(lines, rec))
    heads.append({"name": rec["name"], "statement_sha256": C.sha256(C.theorem_text(rec)), "outcome": m["outcome"], "seconds": m["seconds"], "calls": m["calls"], "models": m["models"], "working": f"{stem}.working.md", "working_sha256": C.sha256((d / f"{stem}.working.md").read_bytes()), "transcript": f"{stem}.transcript.jsonl.gz", "transcript_sha256": C.sha256((d / f"{stem}.transcript.jsonl.gz").read_bytes())})
claim = {"version": C.VERSION, "records": staging, "headlines": heads, "others": [], "budget": {"soft_s": C.SOFT_S, "hard_s": C.HARD_S}, "services": C.SERVICES, "pinned_start": {k: pinned for k in C.SERVICES}, "pinned_end": {k: pinned for k in C.SERVICES}, "attested_by": f"scenario <{email}>", "made_at": "2026-09-20T12:10:00Z"}
claim["digest"] = C.digest(claim); (d / "claim.json").write_text(json.dumps(claim, indent=2, ensure_ascii=False) + "\n")
print("claim:", [(h["name"], h["outcome"], h["seconds"]) for h in heads])
