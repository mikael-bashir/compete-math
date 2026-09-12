// Local, dependency-free (no external API key, no per-request cost) sentence
// embeddings via transformers.js, running the ONNX port of a standard
// sentence-transformers model. Used both by the offline backfill script and
// by live semantic search, so a query is always embedded with the exact same
// model/pooling as the stored rows — otherwise cosine similarity is
// meaningless.

import { env, pipeline, type FeatureExtractionPipeline } from "@huggingface/transformers";
import path from "node:path";

export const EMBEDDING_MODEL = "Xenova/all-MiniLM-L6-v2";
export const EMBEDDING_DIM = 384;

// transformers.js defaults its model cache to a path inside its own
// node_modules directory, which is read-only once deployed. Worse, that
// default is *also* wrong to just redirect to a writable-but-ephemeral spot
// like os.tmpdir(): the model here is ~87MB, and downloading it over the
// network is not something that fits in a serverless function's per-request
// invocation timeout (10-15s by default) on top of the actual search work.
// It has to be present on disk *before* the function ever runs a request —
// so this points at a project-relative directory that `scripts/
// warm-tengoku-model.ts` populates during the build (see package.json's
// build script) and next.config.ts's outputFileTracingIncludes bundles into
// the deployed function, and falls back to fetching normally if that
// warmup hasn't run yet (e.g. a fresh local checkout before the first
// `pnpm build`).
export const MODEL_CACHE_DIR = path.join(process.cwd(), ".tengoku-model-cache");
env.cacheDir = MODEL_CACHE_DIR;

let extractorPromise: Promise<FeatureExtractionPipeline> | null = null;

function getExtractor(): Promise<FeatureExtractionPipeline> {
  if (!extractorPromise) {
    extractorPromise = pipeline("feature-extraction", EMBEDDING_MODEL) as Promise<FeatureExtractionPipeline>;
  }
  return extractorPromise;
}

export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  const extractor = await getExtractor();
  const output = await extractor(texts, { pooling: "mean", normalize: true });
  return output.tolist() as number[][];
}

export async function embedQuery(text: string): Promise<number[]> {
  const [vec] = await embedTexts([text]);
  return vec;
}

// pgvector's text input format: '[0.1,0.2,...]'
export function toPgVector(vec: number[]): string {
  return `[${vec.join(",")}]`;
}
