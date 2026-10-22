// The files a Leak bridge is made of, and the one command that fetches, checks and starts them. Pure (no fs), so a test can read the command.
//
// The command checks twice before it runs anything. Each file is checked against the SHA-256 the build computed from the file it serves (a
// truncated download, a CDN serving one file from before a deploy and another from after, a file altered on the way). Then the list of those
// hashes is checked against a signature made by a key held in GitHub Actions and published on a branch of the repository, not by this site:
// with it a compromised website, which could change the page, the files and the hashes together, still cannot make a command that passes
// without the signing key. The check is node's own crypto, so it needs nothing installed beyond what the bridge needs. The public key in the
// command is the one committed as public/bridge-signing.pub; its fingerprint is printed when the check passes and published in the README.
import files from '../../../scripts/bridge-signing/files.json';

export const BRIDGE_FILES: { url: string; local: string }[] = files;

export type BridgeHashes = Record<string, string>; // keyed by the file's url name

export const SIGNATURE_BRANCH_URL = 'https://raw.githubusercontent.com/mikael-bashir/compete-math/bridge-signatures';
export const MANIFEST_PREFIX = 'leak-bridge-manifest-v1\n';

export type BridgeSigning = {
  publicKey: string; // base64 of the SPKI DER of the Ed25519 public key
  manifestId: string; // sha256 of the manifest text: names the signature file
  sigBase?: string;
};

// the manifest text, exactly as core.mjs signs it
export const manifestLines = (hashes: BridgeHashes): string[] => BRIDGE_FILES.map((f) => `${hashes[f.url]}  ${f.local}`);

// verifies bridge.sha256.sig over the prefix and bridge.sha256 with the embedded key; prints the key's fingerprint; exits non-zero otherwise.
// No `!`, `$` or backtick anywhere in it: the command is pasted into an interactive shell, where `!` inside double quotes is history expansion.
export const verifyScript = (publicKey: string): string =>
  `const c=require('crypto'),f=require('fs');` +
  `const k=c.createPublicKey({key:Buffer.from('${publicKey}','base64'),format:'der',type:'spki'});` +
  `const m=Buffer.concat([Buffer.from('leak-bridge-manifest-v1\\n'),f.readFileSync('bridge.sha256')]);` +
  `const s=Buffer.from(f.readFileSync('bridge.sha256.sig','utf8').trim(),'base64');` +
  `if(c.verify(null,m,k,s)){console.log('bridge files signed by key '+c.createHash('sha256').update(k.export({format:'der',type:'spki'})).digest('hex').slice(0,16))}` +
  `else{console.error('BRIDGE SIGNATURE DOES NOT MATCH: not starting');process.exit(1)}`;

export function buildSetupCommand(opts: {
  origin: string;
  token: string;
  port?: string;
  hashes: BridgeHashes;
  signing?: BridgeSigning | null;
}): string {
  const { origin, token, port, hashes, signing } = opts;
  if (!origin || !token) return '';
  const fetches = BRIDGE_FILES.map((f) => `curl -fsSL '${origin}/${f.url}' -o ${f.local}`).join(' && ');
  const known = BRIDGE_FILES.every((f) => /^[0-9a-f]{64}$/.test(hashes[f.url] ?? ''));
  // no hashes (a local dev build that could not compute them) means no check, said in the command itself rather than silently
  const verify = known
    ? `printf '%s\\n' ${manifestLines(hashes).map((l) => `'${l}'`).join(' ')} > bridge.sha256 && shasum -a 256 -c bridge.sha256 && `
    : '';
  const signed =
    known && signing && /^[A-Za-z0-9+/=]{40,}$/.test(signing.publicKey) && /^[0-9a-f]{64}$/.test(signing.manifestId)
      ? `curl -fsSL '${signing.sigBase || SIGNATURE_BRANCH_URL}/${signing.manifestId}.sig' -o bridge.sha256.sig && node -e "${verifyScript(signing.publicKey)}" && `
      : '';
  const portEnv = port && port !== '4123' ? `PORT='${port}' ` : '';
  return `${fetches} && ${verify}${signed}${portEnv}BRIDGE_TOKEN='${token}' ALLOWED_ORIGINS='${origin}' node claude-bridge.mjs`;
}
