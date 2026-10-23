import { createHash, createHmac, createPublicKey, randomBytes, timingSafeEqual, verify as cryptoVerify } from 'node:crypto';
import { BRIDGE_FILES, MANIFEST_PREFIX, SIGNATURE_BRANCH_URL } from '../../../lib/leak/bridge-files';

// Evidence that a theorem came out of Leak's own harness, kept with the theorem when it is kept (kept-core.ts) and handed to the intake job.
//
// This is friction, not proof. Everything the bridge says about itself is a claim by a program on someone's machine, and a forger who reads this file
// can copy every field. The aim is that a script that POSTs saved theorems with invented stars does not get through by accident, and that anyone who
// wants to pass as the harness has to do the work of looking like it: hold a signed-in session open for half an hour, carry a published build
// id, and keep a set of counters consistent with the server's own clock. What actually protects Tengoku is that the intake recompiles and
// re-rates every theorem and that a person approves the pull request; this tells reviewers, human and AI, where a theorem says it came from.
//
//   build     the bridge hashes its own files in the order the signed manifest lists them (scripts/bridge-signing/files.json) and says which manifest
//             that makes. Known when it is the manifest of the build this site serves, or when the project's CI signed it (the signature file on
//             the bridge-signatures branch, checked against the public key in this deploy).
//   ticket    at the start of a run the page asks this server for a ticket naming the account and the target, signed with a key only the server has.
//             A theorem counts only if its ticket is at least MIN_RUN_MS old when the theorem is saved: "long-running" is something the server saw.
//   receipt   counters from the run (seconds, verifications that passed and failed, searches, attempts, model, strategy). They must be plausible for
//             a prover run and agree with the ticket's age as the server measures it.

/** a theorem counts as the product of a long-running effort only when its run began at least this long before it was saved */
export const MIN_RUN_MS = 30 * 60_000;
/** the bridge ends a run after 48 hours; a ticket is good a little longer than that */
export const MAX_RUN_MS = 49 * 3_600_000;

export interface Receipt {
  seconds: number;
  verifyOk: number;
  verifyFail: number;
  searches: number;
  attempts: number;
  model: string;
  strategy: string;
}
export interface BuildClaim {
  /** sha-256 of the manifest text */
  id: string;
  /** the manifest text: one "<sha256>  <file>" line per bridge file, in the signed order */
  text: string;
}
export interface HarnessClaim {
  ticket?: string;
  build?: BuildClaim;
  receipt?: Receipt;
}
export interface Evidence {
  at: string;
  ticket: { ok: boolean; reason?: string; ageMs?: number };
  receipt: { ok: boolean; reason?: string } & Partial<Receipt>;
  build: BuildClaim | null;
}

// ---- tickets ------------------------------------------------------------------------------------------------------------------------------------

const b64u = (b: Buffer | string) => Buffer.from(b).toString('base64url');
const ticketKey = (secret: string) => createHmac('sha256', secret).update('leak-run-ticket-v1').digest();
const mac = (secret: string, payload: string) => createHmac('sha256', ticketKey(secret)).update(`v1.${payload}`).digest();

/** A ticket for a run of `username` on `target`, issued now: `v1.<payload>.<mac>`. */
export function issueTicket(username: string, target: string, secret: string, now = Date.now()): string {
  if (!secret) throw new Error('no ticket secret');
  const payload = b64u(JSON.stringify({ u: username, t: target, i: now, n: randomBytes(12).toString('hex') }));
  return `v1.${payload}.${b64u(mac(secret, payload))}`;
}

export function readTicket(ticket: string, secret: string): { u: string; t: string; i: number } | null {
  if (!secret) return null;
  const m = /^v1\.([A-Za-z0-9_-]{1,600})\.([A-Za-z0-9_-]{20,60})$/.exec(ticket);
  if (!m) return null;
  const want = mac(secret, m[1]);
  const got = Buffer.from(m[2], 'base64url');
  if (got.length !== want.length || !timingSafeEqual(got, want)) return null;
  try {
    const p = JSON.parse(Buffer.from(m[1], 'base64url').toString('utf8'));
    return typeof p.u === 'string' && typeof p.t === 'string' && Number.isFinite(p.i) ? { u: p.u, t: p.t, i: p.i } : null;
  } catch {
    return null;
  }
}

// ---- what the bridge sends ----------------------------------------------------------------------------------------------------------------------

const int = (v: unknown, max: number): number | null => (typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= max ? Math.round(v) : null);
const MANIFEST_LINE = /^[0-9a-f]{64} {2}[A-Za-z0-9._-]{1,64}$/;

/** What a client claims, cleaned to the fields and sizes it may have; anything else is dropped. null when nothing usable is left. */
export function cleanHarness(raw: unknown): HarnessClaim | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const out: HarnessClaim = {};
  if (typeof r.ticket === 'string' && /^v1\.[A-Za-z0-9_-]{1,600}\.[A-Za-z0-9_-]{20,60}$/.test(r.ticket)) out.ticket = r.ticket;
  const b = r.build as Record<string, unknown> | undefined;
  if (b && typeof b.id === 'string' && /^[0-9a-f]{64}$/.test(b.id) && typeof b.text === 'string' && b.text.length <= 1200) {
    const lines = b.text.split('\n');
    if (lines.pop() === '' && lines.length === BRIDGE_FILES.length && lines.every((l) => MANIFEST_LINE.test(l))) out.build = { id: b.id, text: b.text };
  }
  const c = r.receipt as Record<string, unknown> | undefined;
  if (c && typeof c === 'object') {
    const seconds = int(c.seconds, 1e7);
    const verifyOk = int(c.verifyOk, 1e6);
    const verifyFail = int(c.verifyFail, 1e6);
    const searches = int(c.searches, 1e6);
    const attempts = int(c.attempts, 1e6);
    if (seconds !== null && verifyOk !== null && verifyFail !== null && searches !== null && attempts !== null && typeof c.model === 'string' && typeof c.strategy === 'string')
      out.receipt = { seconds, verifyOk, verifyFail, searches, attempts, model: c.model.slice(0, 80), strategy: c.strategy.slice(0, 80) };
  }
  return out.ticket || out.build || out.receipt ? out : null;
}

// ---- judging it ---------------------------------------------------------------------------------------------------------------------------------

const MEMORY_STRATEGY = /^control-(?:honoured|flint|paragon|lucid)(?:-iv)?$/;

/** The server's reading of a claim, at the moment a theorem is saved: the ticket against its own clock, the receipt against the ticket. */
export function evaluateHarness(claim: HarnessClaim | null, ctx: { username: string; target: string; secret: string; now?: number }): Evidence {
  const now = ctx.now ?? Date.now();
  const ev: Evidence = { at: new Date(now).toISOString(), ticket: { ok: false, reason: 'no ticket' }, receipt: { ok: false, reason: 'no receipt' }, build: claim?.build ?? null };
  if (!claim) return ev;
  let ageMs: number | undefined;
  if (claim.ticket) {
    const t = readTicket(claim.ticket, ctx.secret);
    if (!ctx.secret) ev.ticket = { ok: false, reason: 'tickets are not configured on this server' };
    else if (!t) ev.ticket = { ok: false, reason: 'not a ticket this server issued' };
    else if (t.u !== ctx.username || t.t !== ctx.target) ev.ticket = { ok: false, reason: "the ticket is for another account or target" };
    else {
      ageMs = now - t.i;
      if (ageMs < MIN_RUN_MS) ev.ticket = { ok: false, reason: 'the run is too young to have found this', ageMs };
      else if (ageMs > MAX_RUN_MS) ev.ticket = { ok: false, reason: 'the ticket has expired', ageMs };
      else ev.ticket = { ok: true, ageMs };
    }
  }
  const r = claim.receipt;
  if (r) {
    const total = r.verifyOk + r.verifyFail;
    let reason = '';
    if (r.seconds < MIN_RUN_MS / 1000 - 60) reason = 'the run is too short';
    else if (total < 10 || r.verifyOk < 1) reason = 'too few verifications for a prover run';
    else if (r.verifyFail / total < 0.02 || r.verifyFail / total > 0.95) reason = 'the share of failed verifications is not that of a prover run';
    else if (r.attempts < 1) reason = 'no attempt';
    else if (!MEMORY_STRATEGY.test(r.strategy)) reason = 'not a memory strategy'; // the model is recorded, not judged: a run may use the CLI's default
    else if (ageMs !== undefined && Math.abs(ageMs / 1000 - r.seconds) > Math.max(300, 0.25 * (ageMs / 1000))) reason = "the receipt's time does not match the ticket's age";
    ev.receipt = reason ? { ok: false, reason, ...r } : { ok: true, ...r };
  }
  return ev;
}

// ---- builds -------------------------------------------------------------------------------------------------------------------------------------

export interface BuildCheck {
  ok: boolean;
  via?: 'current' | 'signed';
  reason?: string;
}
export interface BuildVerifier {
  /** the manifest id of the build this server serves, or '' when unknown */
  currentId: string;
  /** base64 SPKI DER of the project's signing key, or '' while none has been set up */
  publicKey: string;
  fetchSignature: (id: string) => Promise<string | null>;
}

/** The manifest text of a set of bridge file hashes, as scripts/bridge-signing/core.mjs signs it. */
export const manifestTextOf = (hashes: Record<string, string>): string => BRIDGE_FILES.map((f) => `${hashes[f.url]}  ${f.local}\n`).join('');

export async function verifyBuild(build: BuildClaim, v: BuildVerifier): Promise<BuildCheck> {
  const lines = build.text.split('\n');
  if (lines.pop() !== '' || lines.length !== BRIDGE_FILES.length) return { ok: false, reason: 'not a manifest' };
  if (!lines.every((l, i) => MANIFEST_LINE.test(l) && l.endsWith(`  ${BRIDGE_FILES[i].local}`))) return { ok: false, reason: 'not the bridge files in the signed order' };
  if (createHash('sha256').update(build.text).digest('hex') !== build.id) return { ok: false, reason: 'the id is not the hash of the manifest' };
  if (v.currentId && build.id === v.currentId) return { ok: true, via: 'current' };
  if (!v.publicKey) return { ok: false, reason: 'an older build, and no signing key is set up to vouch for it' };
  let sig: string | null = null;
  try {
    sig = await v.fetchSignature(build.id);
  } catch {
    sig = null;
  }
  if (!sig) return { ok: false, reason: 'unknown build: no signature of it is published' };
  try {
    const key = createPublicKey({ key: Buffer.from(v.publicKey, 'base64'), format: 'der', type: 'spki' });
    return cryptoVerify(null, Buffer.from(MANIFEST_PREFIX + build.text), key, Buffer.from(sig.trim(), 'base64')) ? { ok: true, via: 'signed' } : { ok: false, reason: 'the signature does not match' };
  } catch {
    return { ok: false, reason: 'the signature does not match' };
  }
}

/** The verifier for this deploy: the manifest of the files it serves, the committed key, and the signature branch. Answers are remembered for a few minutes. */
export function deployBuildVerifier(env: Record<string, string | undefined> = process.env, fetchImpl: typeof fetch = fetch): (b: BuildClaim) => Promise<BuildCheck> {
  let currentId = '';
  try {
    const hashes = JSON.parse(env.NEXT_PUBLIC_BRIDGE_SHA256 || 'null');
    if (hashes && BRIDGE_FILES.every((f) => typeof hashes[f.url] === 'string')) currentId = createHash('sha256').update(manifestTextOf(hashes)).digest('hex');
  } catch {
    currentId = '';
  }
  let publicKey = '';
  try {
    publicKey = JSON.parse(env.NEXT_PUBLIC_BRIDGE_SIGNING || 'null')?.publicKey ?? '';
  } catch {
    publicKey = '';
  }
  const verifier: BuildVerifier = {
    currentId,
    publicKey,
    fetchSignature: async (id) => {
      const res = await fetchImpl(`${SIGNATURE_BRANCH_URL}/${id}.sig`, { cache: 'no-store', signal: AbortSignal.timeout(5000) });
      return res.ok ? await res.text() : null;
    },
  };
  const seen = new Map<string, { at: number; check: BuildCheck }>();
  return async (b) => {
    const hit = seen.get(b.id);
    if (hit && Date.now() - hit.at < 5 * 60_000) return hit.check;
    const check = await verifyBuild(b, verifier);
    seen.set(b.id, { at: Date.now(), check });
    return check;
  };
}
