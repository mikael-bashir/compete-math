// Local, dependency-free (no external API key, no per-request cost) sentence
// embeddings via transformers.js, running the ONNX port of a standard
// sentence-transformers model. Used both by the offline backfill script and
// by live semantic search, so a query is always embedded with the exact same
// model/pooling as the stored rows — otherwise cosine similarity is
// meaningless.

import { env, pipeline, type FeatureExtractionPipeline } from "@huggingface/transformers";
import os from "node:os";
import path from "node:path";

export const EMBEDDING_MODEL = "Xenova/all-MiniLM-L6-v2";
export const EMBEDDING_DIM = 384;

// transformers.js defaults its model cache to a path inside its own
// node_modules directory — fine for local dev, but a deployed Vercel
// function's bundle is read-only, so every cold start would fail to cache
// the ~90MB model weights and re-download them on every single invocation.
// os.tmpdir() (Vercel's /tmp) is writable and persists for the life of a
// warm container, so this makes the model download once per cold start
// instead of once per request.
env.cacheDir = path.join(os.tmpdir(), "tengoku-transformers-cache");

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
