-- Tengoku search index (docs/tengoku-search-plan.md, section 2).
-- One Postgres 16 database with pgvector and pg_trgm. The git tree is the
-- library; every row here is derived from it and rebuilt by the loader
-- (scripts/tengoku-index-load.ts) from an index-<sha> release.
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE IF NOT EXISTS index_version (
  id            SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  tree_commit   TEXT NOT NULL,
  cache_commit  TEXT,
  built_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  loaded_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  decl_count    INTEGER NOT NULL DEFAULT 0,
  extractor     TEXT
);

CREATE TABLE IF NOT EXISTS decl (
  id                   TEXT PRIMARY KEY,           -- library + '/' + name
  name                 TEXT NOT NULL,
  namespace            TEXT NOT NULL DEFAULT '',
  name_tokens          TEXT[] NOT NULL DEFAULT '{}',
  kind                 TEXT NOT NULL,
  library              TEXT NOT NULL,
  tier                 TEXT NOT NULL DEFAULT 'trusted',
  module               TEXT NOT NULL DEFAULT '',
  source_path          TEXT,
  line                 INTEGER,
  permalink            TEXT,
  toolchain            TEXT,
  index_commit         TEXT,
  statement            TEXT NOT NULL DEFAULT '',
  statement_normalised TEXT,
  type_hash            TEXT,
  binders              JSONB NOT NULL DEFAULT '[]',
  arity                INTEGER NOT NULL DEFAULT 0,
  universe_params      TEXT[] NOT NULL DEFAULT '{}',
  conclusion_head      TEXT,
  hypothesis_heads     TEXT[] NOT NULL DEFAULT '{}',
  constants_used       TEXT[] NOT NULL DEFAULT '{}',
  notation_used        TEXT[] NOT NULL DEFAULT '{}',
  type_skeleton        TEXT,
  docstring            TEXT,
  attributes           TEXT[] NOT NULL DEFAULT '{}',
  is_simp              BOOLEAN NOT NULL DEFAULT false,
  is_instance          BOOLEAN NOT NULL DEFAULT false,
  deprecated_for       TEXT,
  proof_depth          INTEGER,
  value_consts         INTEGER,
  first_seen_commit    TEXT,
  last_changed_commit  TEXT,
  content_hash         TEXT NOT NULL DEFAULT '',
  pagerank             DOUBLE PRECISION NOT NULL DEFAULT 0,
  in_degree            INTEGER NOT NULL DEFAULT 0,
  out_degree           INTEGER NOT NULL DEFAULT 0,
  views_30d            INTEGER NOT NULL DEFAULT 0,
  clicks_30d           INTEGER NOT NULL DEFAULT 0,
  ctr                  REAL NOT NULL DEFAULT 0,
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS decl_name_trgm ON decl USING gin (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS decl_name_lower ON decl (lower(name) text_pattern_ops);
CREATE INDEX IF NOT EXISTS decl_type_hash ON decl (type_hash);
CREATE INDEX IF NOT EXISTS decl_conclusion_head ON decl (conclusion_head);
CREATE INDEX IF NOT EXISTS decl_constants_gin ON decl USING gin (constants_used);
CREATE INDEX IF NOT EXISTS decl_kind_tier ON decl (kind, tier);
CREATE INDEX IF NOT EXISTS decl_pagerank ON decl (pagerank DESC);

CREATE TABLE IF NOT EXISTS decl_text (
  id               TEXT PRIMARY KEY REFERENCES decl(id) ON DELETE CASCADE,
  name_gloss       TEXT NOT NULL DEFAULT '',
  statement_gloss  TEXT NOT NULL DEFAULT '',
  topic_labels     TEXT[] NOT NULL DEFAULT '{}',
  search_text      TSVECTOR
);
CREATE INDEX IF NOT EXISTS decl_text_search ON decl_text USING gin (search_text);
CREATE INDEX IF NOT EXISTS decl_text_gloss_trgm ON decl_text USING gin (name_gloss gin_trgm_ops);

CREATE TABLE IF NOT EXISTS decl_embedding (
  id         TEXT PRIMARY KEY REFERENCES decl(id) ON DELETE CASCADE,
  model      TEXT NOT NULL,
  gloss_vec  vector(384),
  code_vec   vector(384)
);
CREATE INDEX IF NOT EXISTS decl_embedding_gloss ON decl_embedding USING hnsw (gloss_vec vector_cosine_ops);
CREATE INDEX IF NOT EXISTS decl_embedding_code ON decl_embedding USING hnsw (code_vec vector_cosine_ops);

CREATE TABLE IF NOT EXISTS symbol (
  name     TEXT PRIMARY KEY,
  kind     TEXT,
  arity    INTEGER,
  symbol   TEXT,                 -- the notation, if any: +, ≤, ∑
  gloss    TEXT NOT NULL DEFAULT '',
  aliases  TEXT[] NOT NULL DEFAULT '{}',
  df       INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS decl_symbol (
  decl_id  TEXT NOT NULL REFERENCES decl(id) ON DELETE CASCADE,
  symbol   TEXT NOT NULL,
  place    TEXT NOT NULL DEFAULT 'type',   -- binder | hypothesis | conclusion | type
  PRIMARY KEY (decl_id, symbol, place)
);
CREATE INDEX IF NOT EXISTS decl_symbol_symbol ON decl_symbol (symbol);

CREATE TABLE IF NOT EXISTS dep_edge (
  src  TEXT NOT NULL REFERENCES decl(id) ON DELETE CASCADE,
  dst  TEXT NOT NULL,
  PRIMARY KEY (src, dst)
);
CREATE INDEX IF NOT EXISTS dep_edge_dst ON dep_edge (dst);

CREATE TABLE IF NOT EXISTS name_lm (          -- token n-grams over identifier names
  prev   TEXT NOT NULL,
  next   TEXT NOT NULL,
  count  INTEGER NOT NULL,
  PRIMARY KEY (prev, next)
);
CREATE TABLE IF NOT EXISTS translation (      -- P(lean_token | english_word), IBM Model 1
  english  TEXT NOT NULL,
  token    TEXT NOT NULL,
  p        REAL NOT NULL,
  PRIMARY KEY (english, token)
);
CREATE TABLE IF NOT EXISTS lexicon (
  term       TEXT NOT NULL,
  expansion  TEXT NOT NULL,
  direction  TEXT NOT NULL DEFAULT 'both',    -- query | index | both
  source     TEXT NOT NULL DEFAULT 'curated',
  PRIMARY KEY (term, expansion)
);
CREATE TABLE IF NOT EXISTS gazetteer (
  key      TEXT NOT NULL,                     -- normalised phrase: "cauchy schwarz"
  decl_id  TEXT NOT NULL REFERENCES decl(id) ON DELETE CASCADE,
  weight   REAL NOT NULL DEFAULT 1,
  source   TEXT NOT NULL DEFAULT 'curated',
  PRIMARY KEY (key, decl_id)
);

CREATE TABLE IF NOT EXISTS query_log (
  id          BIGSERIAL PRIMARY KEY,
  at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  session     TEXT,                           -- hashed, never an IP
  raw         TEXT NOT NULL,
  normalised  TEXT NOT NULL,
  intent      TEXT,
  result_count INTEGER,
  latency_ms  INTEGER
);
CREATE TABLE IF NOT EXISTS impression (
  query_id  BIGINT NOT NULL REFERENCES query_log(id) ON DELETE CASCADE,
  decl_id   TEXT NOT NULL,
  rank      INTEGER NOT NULL,
  channels  TEXT[] NOT NULL DEFAULT '{}',
  PRIMARY KEY (query_id, decl_id)
);
CREATE TABLE IF NOT EXISTS click (
  query_id  BIGINT NOT NULL REFERENCES query_log(id) ON DELETE CASCADE,
  decl_id   TEXT NOT NULL,
  at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  dwell_ms  INTEGER,
  PRIMARY KEY (query_id, decl_id)
);
