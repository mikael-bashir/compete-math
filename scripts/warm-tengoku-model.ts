// Downloads the Tengoku search embedding model into the project-relative
// cache dir (see tengoku-embeddings.ts) *before* `next build` runs, so the
// ~87MB model file is bundled into the deployment instead of being fetched
// over the network on a live request's cold start. A serverless function's
// invocation timeout (10-15s by default) is not a reasonable budget for an
// 87MB download plus the actual search work — this must happen at build
// time, on Vercel's build machine, which has no such limit.
import { embedQuery } from "../src/app/lib/data/tengoku-embeddings";

embedQuery("warmup")
  .then((vec) => {
    console.log(`Tengoku embedding model cached (dim=${vec.length}).`);
  })
  .catch((e) => {
    console.error("Failed to warm the Tengoku embedding model cache:", e);
    process.exit(1);
  });
