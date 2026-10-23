import { createPublicKey, verify as cryptoVerify, type JsonWebKey } from 'node:crypto';

// Who may call the intake endpoints: the intake workflow in emissary-archangel, and nothing else. GitHub Actions can mint a short-lived OIDC
// token for a job (`permissions: id-token: write`), signed by GitHub, naming the repository, the workflow file and the ref it runs from. The
// endpoint verifies that signature against GitHub's published keys and checks those claims, so there is no long-lived secret to leak and a
// fork, another repository, another workflow or another branch cannot produce an acceptable token. Everything fails closed: a missing
// setting, an unreachable key set, an unknown key id, an unexpected algorithm or any wrong claim is a refusal.

export const GITHUB_ISSUER = 'https://token.actions.githubusercontent.com';
export const GITHUB_JWKS_URL = `${GITHUB_ISSUER}/.well-known/jwks`;

export interface IntakePolicy {
  audience: string;
  /** owner/name of the repository whose workflow may call */
  repository: string;
  /** path of the workflow file in that repository */
  workflow: string;
  /** the ref it must run from */
  ref: string;
  /** the events it may be started by */
  events: string[];
}

export const DEFAULT_POLICY: IntakePolicy = {
  audience: 'https://competemath.com/leak-memory-intake',
  repository: 'competemath/emissary-archangel',
  workflow: '.github/workflows/memory-intake.yml',
  ref: 'refs/heads/main',
  events: ['schedule', 'workflow_dispatch'],
};

export interface Jwk extends JsonWebKey {
  kid?: string;
  kty?: string;
  alg?: string;
  use?: string;
}
export type FetchJwks = () => Promise<{ keys: Jwk[] }>;

export class OidcError extends Error {}

const b64url = (s: string): Buffer => Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');

/** Verify a GitHub Actions OIDC token against the policy. Returns its claims, or throws OidcError. */
export async function verifyGithubOidc(
  token: string,
  policy: IntakePolicy,
  { fetchJwks, nowSeconds = Math.floor(Date.now() / 1000), skew = 60 }: { fetchJwks: FetchJwks; nowSeconds?: number; skew?: number },
): Promise<Record<string, unknown>> {
  const parts = token.split('.');
  if (parts.length !== 3 || parts.some((p) => !p)) throw new OidcError('not a JWT');
  let header: Record<string, unknown>;
  let claims: Record<string, unknown>;
  try {
    header = JSON.parse(b64url(parts[0]).toString('utf8'));
    claims = JSON.parse(b64url(parts[1]).toString('utf8'));
  } catch {
    throw new OidcError('not a JWT');
  }
  if (header.alg !== 'RS256') throw new OidcError('unexpected algorithm'); // never "none", never an HMAC keyed by a public key
  if (typeof header.kid !== 'string' || !header.kid) throw new OidcError('no key id');

  let jwks: { keys: Jwk[] };
  try {
    jwks = await fetchJwks();
  } catch {
    throw new OidcError('keys unavailable');
  }
  const jwk = (jwks?.keys ?? []).find((k) => k.kid === header.kid && k.kty === 'RSA');
  if (!jwk) throw new OidcError('unknown key');
  let ok = false;
  try {
    ok = cryptoVerify('RSA-SHA256', Buffer.from(`${parts[0]}.${parts[1]}`), createPublicKey({ key: jwk, format: 'jwk' }), b64url(parts[2]));
  } catch {
    ok = false;
  }
  if (!ok) throw new OidcError('bad signature');

  const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (claims.iss !== GITHUB_ISSUER) throw new OidcError('wrong issuer');
  if (!aud.includes(policy.audience)) throw new OidcError('wrong audience');
  const exp = Number(claims.exp);
  const nbf = claims.nbf === undefined ? undefined : Number(claims.nbf);
  if (!Number.isFinite(exp) || exp + skew < nowSeconds) throw new OidcError('expired');
  if (nbf !== undefined && (!Number.isFinite(nbf) || nbf - skew > nowSeconds)) throw new OidcError('not yet valid');
  if (claims.repository !== policy.repository) throw new OidcError('wrong repository');
  if (claims.repository_owner !== policy.repository.split('/')[0]) throw new OidcError('wrong owner');
  // `job_workflow_ref` names the workflow file that is running, whichever file asked for the token: "owner/repo/path@ref"
  if (claims.job_workflow_ref !== `${policy.repository}/${policy.workflow}@${policy.ref}`) throw new OidcError('wrong workflow');
  if (claims.ref !== policy.ref) throw new OidcError('wrong ref');
  if (typeof claims.event_name !== 'string' || !policy.events.includes(claims.event_name)) throw new OidcError('wrong event');
  return claims;
}

let cached: { at: number; jwks: { keys: Jwk[] } } | null = null;
/** GitHub's key set, fetched at most every ten minutes. */
export const fetchGithubJwks: FetchJwks = async () => {
  if (cached && Date.now() - cached.at < 10 * 60_000) return cached.jwks;
  const res = await fetch(GITHUB_JWKS_URL, { headers: { accept: 'application/json' }, cache: 'no-store' });
  if (!res.ok) throw new Error(`jwks ${res.status}`);
  const jwks = (await res.json()) as { keys: Jwk[] };
  cached = { at: Date.now(), jwks };
  return jwks;
};

export interface IntakeAuthResult {
  ok: boolean;
  status: number;
  reason?: string;
}

/**
 * The route-level check. Off unless LEAK_INTAKE_ENABLED=1 (set on the host by the owner), and the policy may be narrowed by environment
 * (LEAK_INTAKE_REPOSITORY, LEAK_INTAKE_WORKFLOW, LEAK_INTAKE_AUDIENCE) but not widened: every field is required to be present and non-empty.
 */
export async function authorizeIntake(
  authorization: string | null,
  env: Record<string, string | undefined> = process.env,
  deps: { fetchJwks?: FetchJwks; nowSeconds?: number } = {},
): Promise<IntakeAuthResult> {
  if (env.LEAK_INTAKE_ENABLED !== '1') return { ok: false, status: 404, reason: 'off' };
  const m = /^Bearer ([A-Za-z0-9._-]+)$/.exec(authorization ?? '');
  if (!m) return { ok: false, status: 401, reason: 'no token' };
  const policy: IntakePolicy = {
    ...DEFAULT_POLICY,
    audience: env.LEAK_INTAKE_AUDIENCE || DEFAULT_POLICY.audience,
    repository: env.LEAK_INTAKE_REPOSITORY || DEFAULT_POLICY.repository,
    workflow: env.LEAK_INTAKE_WORKFLOW || DEFAULT_POLICY.workflow,
  };
  try {
    await verifyGithubOidc(m[1], policy, { fetchJwks: deps.fetchJwks ?? fetchGithubJwks, nowSeconds: deps.nowSeconds });
    return { ok: true, status: 200 };
  } catch (e) {
    return { ok: false, status: 401, reason: e instanceof OidcError ? e.message : 'refused' };
  }
}
