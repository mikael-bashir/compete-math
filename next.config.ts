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
  //
  // The onnxruntime-node glob is a second, different case of the same
  // underlying problem: the tracer *does* follow onnxruntime-node's own
  // `require()` of its platform .node binding (that's a well-known special
  // case NFT handles for native addons) — but that .node binding then
  // dlopen()s its actual runtime, libonnxruntime.so.1, from C++ at
  // execution time, which is invisible to any JS-level static analysis.
  // Confirmed via a real deployed function's logs: "libonnxruntime.so.1:
  // cannot open shared object file" — the .node file shipped, its ~35MB
  // sibling .so didn't.
  //
  // IMPORTANT: this must name the two files explicitly, not a directory
  // glob. onnxruntime-node's own postinstall unconditionally downloads a
  // GPU build (microsoft.ml.onnxruntime.gpu.linux, confirmed 196MB) into
  // this exact same linux/x64 directory — a `**/*` glob here silently pulls
  // in the CUDA/TensorRT provider .so files too, which is what actually
  // blew the function up to 465MB against Vercel's 250MB limit. This route
  // only ever does CPU inference on a small sentence-embedding model and
  // never touches GPU execution providers.
  outputFileTracingIncludes: {
    "/api/tengoku/search": [
      "./.tengoku-model-cache/**/*",
      "./node_modules/.pnpm/onnxruntime-node@*/node_modules/onnxruntime-node/bin/napi-v6/linux/x64/libonnxruntime.so.1",
      "./node_modules/.pnpm/onnxruntime-node@*/node_modules/onnxruntime-node/bin/napi-v6/linux/x64/onnxruntime_binding.node",
    ],
  },
  // sharp is a transitive dependency of @huggingface/transformers, imported
  // unconditionally at its top level — and sharp's *own* top-level code
  // (lib/sharp.js) unconditionally requires its native platform binary too,
  // throwing immediately if it's missing, regardless of whether this route
  // ever calls an actual image function. Confirmed the hard way: excluding
  // sharp's package broke the route with "Cannot find package 'sharp'";
  // excluding just its native @img/sharp-* binaries broke it with sharp's
  // own "Could not load the sharp module" error instead. There's no lazy
  // path here — the native binary has to ship. Only the (separate, and
  // actually unnecessary) GPU provider libraries get excluded.
  outputFileTracingExcludes: {
    "/api/tengoku/search": [
      "./node_modules/.pnpm/onnxruntime-node@*/node_modules/onnxruntime-node/bin/napi-v6/linux/x64/libonnxruntime_providers_*.so",
    ],
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
