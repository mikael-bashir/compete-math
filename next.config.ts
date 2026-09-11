import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // @huggingface/transformers (Tengoku's local search embeddings) pulls in
  // onnxruntime-node's native .node binary and sharp's native image
  // bindings — bundling native addons through webpack/Turbopack routinely
  // corrupts or drops them in a serverless build. Marking them external
  // leaves them as plain node_modules requires, which Vercel's own file
  // tracer (@vercel/nft) handles correctly for the deployed platform.
  serverExternalPackages: ["@huggingface/transformers", "onnxruntime-node", "sharp"],
  // The embedding model is fetched into ./.tengoku-model-cache at build
  // time (scripts/warm-tengoku-model.ts, run before `next build`) rather
  // than downloaded on a live request. Next's file tracer can't discover
  // those files on its own — the model path is only assembled at runtime
  // from a string, not a static import — so the route needs to say
  // explicitly to bundle them.
  outputFileTracingIncludes: {
    "/api/tengoku/search": ["./.tengoku-model-cache/**/*"],
  },
  async redirects() {
    // Archives was renamed to Practice. Keep old links/bookmarks working.
    return [
      { source: "/archives", destination: "/practice", permanent: true },
      {
        source: "/archives/problems/:id",
        destination: "/practice/problems/:id",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
