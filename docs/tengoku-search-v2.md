# Tengoku search v2: the decisions

Written 2026-10-09. It extends `tengoku-search-plan.md` (the data model and the channels, most of it built) with the three things that plan left for
later: meaning (dense retrieval), a learned ranker with 200+ features, and a way to run all of it for nothing.

## What the user asked for

- Served long term for free or near 0.
- Anything that needs training trained for free: a free notebook (Colab, Kaggle) or this Mac (M1 Pro, 16 GB RAM, 18 GB of disk free on 2026-10-09).
- As good as it can be made: "comparable to Google", more than 200 signals in the ranking.

## What is wrong today (measured, 2026-10-09)

The live engine finds names, notation and type shapes well (golden-dev: hit@10 100%). It fails on **concepts**, the queries a person types when they do
not know the name:

| query | top result | what it should find |
|---|---|---|
| Euclid's lemma | `Nat.exists_infinite_primes` | `Nat.Prime.dvd_mul`, `Prime.dvd_or_dvd` |
| continuous function on a compact set attains its maximum | `continuous_max`, `Finite.exists_max` | `IsCompact.exists_isMaxOn` and friends |

Two causes. There is no semantic channel (`semantic` has a fusion weight but no channel: the embeddings were never backfilled), and the hand-written
gazetteer reads any query containing "euclid" as the infinitude of primes. A longer synonym table does not fix a missing channel.

## The design

```
query ─▶ understand ─▶ retrieve (8 channels, 200 each, in parallel on 7 shards) ─▶ features ─▶ LightGBM ranker ─▶ fold by type_hash ─▶ MMR ─▶ results
          intent         name · fts · symbol · pattern · gazetteer (built)
          expansion      dense-informal · dense-formal · click-memory (new)
          embedding
```

1. **Dense channels** (new). `halfvec(384)` columns in the shards that already exist, HNSW cosine, in the Postgres each shard already has (pgvector is
   available on the free tier). Two vectors per declaration: *informal* (name gloss + docstring + informal description) and *formal* (the statement
   text). 412,011 declarations × 384 × 2 bytes = 316 MB for one set, about 65 MB per shard per set with its index.
2. **The query embedding is computed in the API route** with an int8 ONNX model bundled with the app (25 to 35 MB, `onnxruntime-node`): no
   embedding service, no per-query cost. The browser can compute it instead (transformers.js) if the cold start of the function ever matters.
3. **The ranker is LightGBM LambdaMART** over 200+ features (the catalogue below), trained offline on this Mac, exported to JSON (a few hundred small
   trees) and evaluated in TypeScript inside the route: about a millisecond for 300 candidates. No model server.
4. **Diversity**: fold numeric-type copies and equal `type_hash` groups into one result ("3 variants"), then MMR across namespaces. Built in part.
5. **Click memory** (later): the log table exists; the features are zero until there are sessions, and the model is retrained when there are.

### The free-tier budget

| resource | use | free limit |
|---|---|---|
| Postgres shards | 7 of the 20 existing free databases, about 210 MB each today; vectors add about 130 MB each (both sets, HNSW included) | 0.5 GB each |
| Vercel function | the app, the ONNX model, the ranker JSON: well under 100 MB | 250 MB unzipped |
| query time | embedding 20 to 60 ms, 7 parallel shard queries 100 to 250 ms, ranking 5 ms | 10 s default |
| training | LightGBM on CPU, embedding fine-tune on the Mac or a free T4 | no cost |
| anything else | none: no search service, no vector database, no paid API | |

If a shard fills, the next free database takes its share (the hash is `fnv1a(name) % shards`; the shard count is an environment variable).

### The models (decided by the benchmark, not by taste)

- **Embedding**: candidates `bge-small-en-v1.5` (MIT, 33M parameters, 384 dimensions) and `all-MiniLM-L6-v2` (Apache-2.0, 22M). The one that wins on MathlibQR
  plus golden-dev is **fine-tuned** with in-batch negatives and mined hard negatives on pairs from our own tree (docstring or description ↔ statement), then
  exported to ONNX int8. Embedding all 412k declarations takes minutes on the M1 Pro. The big models (Qwen3-Embedding-8B and its reranker, Apache-2.0, what
  LeanSearch v2 uses) do not fit a free function, but they may *label*: their output can be distilled into the small model.
- **Informal text** for the declarations that have no docstring, in this order: (1) the LeanSearch v2 corpus for every Mathlib name it has (Apache-2.0,
  an LLM-written description per declaration, 332 MB); (2) docstrings; (3) the rule-based verbaliser already in `scripts/derive.py`; (4) an LLM pass over the most
  important declarations of the other libraries (by PageRank), on a free tier or a local 7B model, in the background and never blocking anything.
- **Cross-encoder reranker**: optional, after the ranker. `ms-marco-MiniLM-L6` class (22M), only if the benchmark says the features leave something on the table.

## The 200+ features

Computed per (query, candidate); 0 or "missing" where a signal does not exist, which LightGBM handles natively.

| group | count | examples |
|---|---|---|
| A. field relevance | 45 | for each of name, name gloss, namespace, docstring, statement gloss, informal text, topic, module, library: BM25, coverage, IDF-weighted coverage, best-term score, rank in that field |
| B. name matching | 20 | exact, suffix, prefix, substring, trigram similarity, edit distance, token Jaccard, token order kept, camel/snake alignment, acronym, abbreviation expansions hit, length ratio, namespace depth match |
| C. meaning | 12 | cosine to the informal and formal vectors, ranks in the dense lists, similarity to the 5th neighbour, margin to the best, cross-encoder score |
| D. symbols and types | 30 | IDF-weighted symbol overlap, notation overlap, conclusion head match, hypothesis head overlap, arity, binder count, skeleton match score, hole alignment, constants used, statement length, typeclass overlap, numeric-type-copy flag |
| E. graph and authority | 15 | PageRank, in and out degree, closure size, module PageRank, co-usage with higher-ranked results, dependents in other libraries, percentile inside the library |
| F. quality and provenance | 35 | tier, library, isnad origin (seed, translated, native), sorry-free, axiom count, deprecated, private, docstring length, attributes (simp, ext, …), kind, proof length, tactic count, age, duplicate-group size, root versus copy |
| G. query and intent | 25 | intent one-hot, intent × kind, intent × tier, token count, rare-token fraction, ambiguity (token groups), hole and operator flags, language flags |
| H. channel agreement | 18 | each channel's score and rank (8 channels), number of channels that returned it, the fused RRF score |
| I. popularity | 8 | clicks, CTR, impressions (decayed), past clicks for similar queries (zero until logging has data) |
| **total** | **208** | |

The list lives in code as one table (`features.ts`) with a name, a group and a function; a test fails if the count drops under 200 or a feature is
computed by two different formulas.

## Labels and evaluation

- **Training pairs**: (1) synthetic queries from docstrings, informal descriptions and verbalised names, each with its declaration as the positive and
  hard negatives from the other channels; (2) MathlibQR and MathlibMPR from LeanSearch v2's repository (Apache-2.0; real, human-style queries with
  relevant declarations); (3) golden-dev (80 queries, written by me). **golden-holdout (20, the user's) is never used for training or tuning.**
- **Metrics**: nDCG@10, hit@1, hit@10, MRR, per intent, on MathlibQR (held-out part), golden-dev and golden-holdout, before and after every change.
- **Gate for shipping**: no per-intent regression on golden-dev, and a gain on MathlibQR, with the holdout read once at the end.

## Order of work (each a small PR, each measured)

1. **Data**: join the LeanSearch v2 corpus to the index by name; informal text column; benchmark loaders.
2. **Dense channel**: embedding benchmark (two models), pgvector columns and HNSW, `semanticChannel`, query embedding in the route. First visible gain.
3. **Features v1** (the 60 cheapest) and the LightGBM ranker with the JSON export and the TypeScript scorer, behind the existing fusion as a flag.
4. **Features v2** up to 208, fine-tuned embedding, hard-negative mining, the cross-encoder if it earns its place.
5. **Click log, UI** (why-this-matched, facets by library and kind), and the Leak I tools on the same index (`search`, `find_by_type`, `similar_to`).

## What I need from the user

- A yes to these downloads, each public and permissively licensed: the LeanSearch v2 corpus JSONL (332 MB, Apache-2.0), the MathlibQR and MathlibMPR
  benchmark files (under 5 MB, Apache-2.0), the two candidate embedding models (about 130 MB and 90 MB, MIT and Apache-2.0), and the Python packages
  (`sentence-transformers`, `lightgbm`, `onnxruntime`, `optimum`) into a virtual environment. About 1.5 GB of disk in all.
- Nothing else: no paid account, no API key, no new service.

## Risks

- The informal descriptions of the non-Mathlib libraries are weaker than Mathlib's; the docstring and name channels cover the gap until the LLM pass runs.
- Neon's free compute can be slow on a cold start; the query path degrades to the existing channels if the dense channel times out.
- The corpus is Mathlib v4.28; the tree's seed is v4.34. Names that moved have no description until the next pass; the join reports the miss rate and
  the nearest-name fallback is measured.
