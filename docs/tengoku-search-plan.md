# Tengoku search: plan of action

The tree on GitHub is the library. The database becomes a **search index over
that repository and nothing else**: rich metadata per declaration, several
indexes over it, and the feedback that teaches ranking. Statements are copied
into the index because they are what results display; proofs are not stored
at all. The same index serves two consumers with two query planners: the
`/tengoku` page (people, ambiguous queries) and Leak I (agents, precise
queries). Google-quality relevance comes from many weak signals fused and
then learned from behaviour, never from one scorer.

## 1. What GitHub provides directly

**Stat pills, no database.** The tree publishes `data/stats.json`, written by
the promote loop on every promotion commit and by the nightly build: per
library `{trusted, staging, tentative}`, totals, `last_promoted_at`,
`tree_commit`, `cache_commit`, toolchain. The page fetches
`raw.githubusercontent.com/competemath/tengoku/main/data/stats.json` with
`next: { revalidate: 600 }` (ISR). Raw is CDN-cached and needs no token, so
there is no rate limit to hit. A fetch failure keeps the last rendered value.

**Index artifacts, built where the cache is built.** The nightly workflow,
right after it publishes `cache-<sha>`, runs the extractor (section 3) and
publishes `index-<sha>` as a release: `decls.jsonl`, `deps.jsonl`,
`symbols.jsonl`, `embeddings/*.npy`, `stats.json`. A loader ingests the
newest `index-<sha>` into the database, versioned by commit. The index can be
rebuilt from scratch from any commit, so the database is never a source of
truth.

**Result links and proof text.** Every hit links to the file and line on
GitHub at the indexed commit (a permalink). Proof text is fetched on demand
through one ISR'd route that reads the raw file at that commit, so the
database never holds a proof.

## 2. Data model: what the database stores

One Postgres 16 with `pgvector` and `pg_trgm`. Estimated size for 240k
declarations: rows 0.5 GB, two embedding sets 0.75 GB, full-text 0.5 GB,
dependency graph 0.5 GB. About 3 GB, one database, no sharding, no hashing,
no registry.

### `decl`, one row per declaration
- identity: `id` (library + full name, stable across rebuilds), `name`,
  `namespace`, `name_tokens` (split on dots, underscores and camel case),
  `kind` (theorem, lemma, def, abbrev, instance, structure, class, inductive,
  axiom), `library`, `tier` (trusted, staging, tentative), `module`,
  `source_path`, `line`, `permalink`, `toolchain`, `index_commit`
- the statement: `statement` (pretty-printed at the tree's options),
  `statement_normalised` (alpha-renamed binders, notation expanded to
  constant names), `type_hash` (hash of the normalised type: the
  equivalence class of "the same theorem under different names"),
  `binders` (name, type, binder kind), `arity`, `universe_params`
- structure: `conclusion_head` (`Eq`, `LE.le`, `Continuous`, ...),
  `hypothesis_heads`, `constants_used` (every constant in the type),
  `notation_used` (∑, ∫, ∀, ∃, ∘, ...), `type_skeleton` (head-and-argument
  tree with holes, the shape loogle matches on)
- documentation: `docstring`, `attributes` (`simp`, `ext`, `norm_num`,
  `deprecated`, ...), `is_simp`, `deprecated_for`
- proof metadata only: `proof_chars`, `tactic_count`, `tactics_used`
  (multiset), `uses_sorry` (must be false in trusted), `proof_term_size`
- history: `first_seen_commit`, `last_changed_commit`, `promoted_at`
- popularity: `views_30d`, `clicks_30d`, `ctr`, `pagerank`, `in_degree`

### `decl_text`, the derived language
- `name_gloss`: `Nat.add_comm` becomes "natural number addition
  commutative", with every Mathlib abbreviation expanded from a maintained
  table (comm, assoc, deriv, iff, le, lt, succ, ...)
- `statement_gloss`: a rule-based verbaliser over the elaborated type,
  `∀ a b : ℕ, a + b = b + a` becomes "for all natural numbers a and b, a plus
  b equals b plus a". Rules per head symbol and notation; unknown heads fall
  back to the constant's own gloss.
- `topic_labels` from the module path (Analysis, SpecialFunctions,
  Trigonometric) and from the library's own topic map
- `search_text` with weighted full-text vectors: A name and name gloss, B
  docstring, C statement gloss and topic labels, D module path

### `decl_embedding`
- `gloss_vec`: sentence embedding of name gloss + docstring + statement
  gloss (start with the bundled MiniLM, evaluate bge-small and e5-small on
  the golden set before committing)
- `code_vec`: embedding of the raw Lean statement with a code-aware model,
  which matches notation-heavy queries the sentence model cannot
- HNSW indexes on both, cosine distance

### `symbol` and `decl_symbol`
- `symbol`: every constant and notation with `kind`, `arity`, human names
  and aliases (`≤` is `LE.le` is "le" is "less than or equal" is "at most"),
  document frequency, its own gloss
- `decl_symbol`: which declaration uses which symbol, and where (binder,
  hypothesis, conclusion). This makes symbol queries exact and gives
  IDF-style weights: a query mentioning `Real.sqrt` should weigh that far
  more than one mentioning `Eq`.

### `dep_edge` and graph features
- edges declaration → declaration for every constant used in a proof term
  or a statement, plus the module import graph
- derived: `pagerank` over the dependency graph (damping 0.85), in-degree,
  module-level PageRank, co-usage counts (pairs of lemmas that appear in
  the same proofs), personalised PageRank from a seed set for "related"

### `name_lm` and `translation`, the Markov machinery
- a token bigram and trigram model over identifier tokens (`add → comm`,
  `mul → left_cancel`), for completion of partial names, for spelling
  correction ranked by likelihood, and for reconstructing a likely name from
  English ("commutative addition" → `add_comm`, `mul_comm`, ...)
- a translation table P(lean_token | english_word) estimated with IBM
  Model 1 (EM) over (docstring, name tokens) pairs and (statement gloss,
  constants) pairs. This is what turns "at most" into `le` and "sum of" into
  `Finset.sum`.
- a query Markov chain over query terms from the logs, for autocomplete and
  "people also searched"

### `lexicon`
- curated synonyms and abbreviations (Mathlib naming conventions, the
  notation table, unicode and LaTeX and ASCII spellings of every symbol),
  plus mined synonyms from docstring co-occurrence. Every entry says which
  direction it applies (query expansion, indexing, or both).

### `gazetteer`
- named results: "Cauchy–Schwarz", "pigeonhole", "Rouché", "Bolzano",
  "Fermat's little theorem" → the declarations. Seeded from docstrings that
  name their theorem, from Mathlib's overview and undergrad pages, and then
  learned from clicks. A gazetteer hit outranks everything.

### `query_log`, `impression`, `click`, `session`
- every query (normalised and raw), the intent classification, the result
  list shown, clicks, dwell, and "no result" flags. IPs hashed. This is the
  training signal for ranking and the source of autocomplete.

### `index_version`
- `tree_commit`, `cache_commit`, `built_at`, counts per tier and library,
  extractor version. The page shows "index at &lt;sha&gt;".

## 3. Index construction, nightly, after the cache

1. **Extract from the Lean environment**, not from regexes. A small Lean
   program in the tree runs against the cache (a pure replay, nothing
   compiles) and walks every declaration in `Tengoku.All`: name, kind, the
   type at both full and pretty printing, binders, head symbols, every
   constant in the type and in the value, docstring, attributes, module,
   position, universe parameters. loogle's `Loogle.Find` already does most
   of this and should be reused; its discrimination tree of types is the
   `type_skeleton` index.
2. **Derive text**: tokenise names, expand abbreviations, run the
   verbaliser, attach topic labels, apply the lexicon.
3. **Embed** in batches (a GPU box or the CI runner overnight; only rows
   whose content hash changed are re-embedded).
4. **Graph features**: PageRank, degrees, co-usage.
5. **Language models**: refit the name n-grams and the translation table.
6. **Package** `index-<sha>` and publish it as a release; write
   `stats.json`.
7. **Load**: the loader diffs by `id` and content hash, upserts changed rows,
   swaps `index_version`. Old rows for declarations that vanished are
   marked, not deleted, for a week.

## 4. Query understanding

- **Normalise**: unicode, LaTeX and ASCII spellings of every symbol map to
  one form; quotes and case handled; Lean namespaces recognised.
- **Classify intent** (rules first, a tiny classifier later): exact or
  partial name; type pattern (holes, arrows, equality with placeholders);
  natural language; a named theorem; notation ("a^2+b^2"); a module or
  topic; mixed.
- **Expand**: lexicon synonyms both ways, translation table top-k tokens,
  spelling correction (SymSpell over the token vocabulary and full names),
  Markov completion of partial names, gazetteer lookup.
- **Parse patterns** into the skeleton language for structural matching and
  into loogle syntax for the Leak I path.

## 5. Retrieval channels, in parallel, top 200 each

1. exact and prefix name (trigram plus prefix index)
2. weighted full-text over name tokens, docstring, glosses, module
3. dense semantic on `gloss_vec`
4. dense code on `code_vec`
5. structural type pattern on `type_skeleton` (the loogle path)
6. symbol-set match with IDF weights on `decl_symbol`
7. gazetteer direct hits
8. click memory: query → declaration CTR, and results of the nearest past
   queries by embedding

## 6. Ranking

- **Fusion**: reciprocal rank fusion across channels with per-intent channel
  weights. A name-shaped query trusts channel 1 and 5; an English query
  trusts 3, 2 and 7.
- **Rerank** the fused top 300 with a LambdaMART model (LightGBM) over
  features: each channel's score and rank, `pagerank`, tier (trusted above
  staging above tentative), kind prior per intent, name length, namespace
  depth, topic match, symbol overlap, docstring present, CTR, `is_simp`,
  deprecated penalty, library prior, freshness.
- **Diversify**: collapse by `type_hash` (the Nat, Int and Real versions of
  a lemma show as one result with "3 variants"), then maximal marginal
  relevance across namespaces.
- **Explain**: highlight the matched tokens and say why each result matched
  (name, docstring, type shape, meaning).
- **Cold start**: hand-tuned weights and a golden set of 500 queries with
  expected results (exact names, English, patterns, named theorems),
  scored by hit@1, hit@10 and MRR. Retrain weekly from clicks once the log
  has a few thousand sessions; the golden set guards against drift.

## 7. Leak I on the same index

The retrieval channels become MCP tools: `search(query)` with the full
planner, `find_by_type(pattern)`, `find_by_constants([...])`,
`similar_to(decl)`, `neighbors(decl)` from the graph, `complete_name(prefix)`,
`explain(decl)` (docstring, gloss, top dependents as usage examples), and
`used_together(decl)` from co-usage counts, which suggests the next lemma a
proof usually needs. Agents get precise tools and recall tools over one
index, with the same reranker.

## 8. Feedback loop

Nightly CTR aggregation, weekly reranker retraining, golden-set evaluation
on every index build, a review of "no result" queries feeding the lexicon
and gazetteer, and per-intent dashboards for hit rate and latency.

## 9. Infrastructure and order of work

- **Storage**: one Postgres 16 with pgvector and pg_trgm, either a paid Neon
  project or self-hosted on the Leak VPS. Start there; move dense retrieval
  to a dedicated engine only if latency demands it.
- **Serving**: Next API routes; the query embedding stays in-process with the
  bundled model; popular queries cached.

Order:
1. `stats.json` in the tree and ISR pills on the page. One day.
2. Lean extractor in the tree, nightly `index-<sha>` release. One week.
3. New schema and loader; import from the newest index. One week.
4. Channels 1, 2, 3, 6 and fusion; ship behind the existing search box.
5. Verbaliser, lexicon, gazetteer, name models; channels 4, 5, 7, 8.
6. Logging, golden set, reranker, diversification.
7. Leak I tools on the index.
8. Retire the twenty shards.

Risks: verbaliser quality (mitigated by the docstring and name channels),
embedding model choice (decided by the golden set, not taste), extractor
runtime over 240k declarations (minutes on the cache), GitHub limits (only
raw and releases are used, never the REST API), and log privacy (hashed
identifiers, no raw IPs).
