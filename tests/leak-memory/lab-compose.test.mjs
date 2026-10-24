// The compose file is where the isolation lives, so it is tested as data: `docker compose config --format json` resolves it (no daemon, no network).
// Skipped where docker is not installed.
import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import test from "node:test"
import path from "node:path"
import { fileURLToPath } from "node:url"

const file = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../services/leak-lab/docker-compose.yml")
const r = spawnSync("docker", ["compose", "-f", file, "--profile", "misery", "config", "--format", "json"], { encoding: "utf8" })
const cfg = r.status === 0 ? JSON.parse(r.stdout) : null
const skip = cfg ? false : "docker compose is not available"
const only = (name) => Object.keys(cfg.services).filter((n) => name.test(n))

test("the tool servers are on a network with no way out, and nothing else", { skip }, () => {
  const net = Object.keys(cfg.networks).find((n) => n.endsWith("lab_internal"))
  assert.equal(cfg.networks[net].internal, true)
  for (const n of ["cas", "atp"]) {
    assert.deepEqual(Object.keys(cfg.services[n].networks), ["lab_internal"], `${n} must be on the internal network only`)
    assert.equal(cfg.services[n].ports, undefined, `${n} publishes nothing`)
  }
})

test("only the gates publish a port, on 127.0.0.1 only, and they are on both networks", { skip }, () => {
  for (const n of ["cas-gate", "atp-gate"]) {
    const s = cfg.services[n]
    assert.equal(s.ports.length, 1)
    assert.equal(s.ports[0].host_ip, "127.0.0.1")
    assert.deepEqual(Object.keys(s.networks).sort(), ["lab_edge", "lab_internal"])
    assert.deepEqual(s.command, ["python", "-m", "lab_common.gate"])
  }
  assert.deepEqual(only(/./).filter((n) => cfg.services[n].ports).sort(), ["atp-gate", "cas-gate"])
})

test("every service is read-only, capability-free, non-root, limited, and mounts nothing from the host", { skip }, () => {
  for (const [n, s] of Object.entries(cfg.services)) {
    assert.equal(s.read_only, true, `${n}: read_only`)
    assert.deepEqual(s.cap_drop, ["ALL"], `${n}: cap_drop`)
    assert.ok((s.security_opt || []).includes("no-new-privileges:true"), `${n}: no-new-privileges`)
    assert.equal(s.user, "10001:10001", `${n}: user`)
    assert.ok(s.mem_limit, `${n}: memory limit`)
    assert.ok(s.pids_limit > 0, `${n}: pids limit`)
    assert.ok(!s.privileged, `${n}: privileged`)
    assert.equal(s.volumes, undefined, `${n}: volumes`)
    assert.ok(!s.network_mode, `${n}: network_mode`)
    assert.match(JSON.stringify(s.tmpfs), /noexec/, `${n}: tmpfs is not executable`)
  }
})

test("the misery services exist only under their profile, so elation starts the CAS alone", { skip }, () => {
  const plain = spawnSync("docker", ["compose", "-f", file, "config", "--format", "json"], { encoding: "utf8" })
  assert.deepEqual(Object.keys(JSON.parse(plain.stdout).services).sort(), ["cas", "cas-gate"])
  assert.deepEqual(Object.keys(cfg.services).sort(), ["atp", "atp-gate", "cas", "cas-gate"])
})
