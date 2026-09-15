-- Tengoku search index, DATA shard (docs/tengoku-search-plan.md §2; sharded
-- over the angel databases, see src/app/lib/tengoku-search/shards.ts). A
-- declaration's row, full-text vector and embeddings live together here.
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE TABLE IF NOT EXISTS index_version (id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1), tree_commit TEXT NOT NULL, loaded_at TIMESTAMPTZ NOT NULL DEFAULT now(), decl_count INTEGER NOT NULL DEFAULT 0, shard_index INTEGER, shard_count INTEGER);
CREATE TABLE IF NOT EXISTS decl (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, namespace TEXT NOT NULL DEFAULT '', name_tokens TEXT[] NOT NULL DEFAULT '{}', kind TEXT NOT NULL, library TEXT NOT NULL,
  tier TEXT NOT NULL DEFAULT 'trusted', module TEXT NOT NULL DEFAULT '', line INTEGER, permalink TEXT, index_commit TEXT,
  statement TEXT NOT NULL DEFAULT '', type_hash TEXT, binders JSONB NOT NULL DEFAULT '[]', arity INTEGER NOT NULL DEFAULT 0, universe_params TEXT[] NOT NULL DEFAULT '{}',
  conclusion_head TEXT, hypothesis_heads TEXT[] NOT NULL DEFAULT '{}', constants_used TEXT[] NOT NULL DEFAULT '{}', notation_used TEXT[] NOT NULL DEFAULT '{}',
  docstring TEXT, is_simp BOOLEAN NOT NULL DEFAULT false, is_instance BOOLEAN NOT NULL DEFAULT false, deprecated_for TEXT, proof_depth INTEGER, value_consts INTEGER,
  content_hash TEXT NOT NULL DEFAULT '', pagerank DOUBLE PRECISION NOT NULL DEFAULT 0, in_degree INTEGER NOT NULL DEFAULT 0, out_degree INTEGER NOT NULL DEFAULT 0,
  views_30d INTEGER NOT NULL DEFAULT 0, clicks_30d INTEGER NOT NULL DEFAULT 0, ctr REAL NOT NULL DEFAULT 0, updated_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS decl_name_trgm ON decl USING gin (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS decl_name_lower ON decl (lower(name) text_pattern_ops);
CREATE INDEX IF NOT EXISTS decl_tokens_gin ON decl USING gin (name_tokens);
CREATE INDEX IF NOT EXISTS decl_type_hash ON decl (type_hash);
CREATE INDEX IF NOT EXISTS decl_conclusion_head ON decl (conclusion_head);
CREATE INDEX IF NOT EXISTS decl_constants_gin ON decl USING gin (constants_used);
CREATE INDEX IF NOT EXISTS decl_pagerank ON decl (pagerank DESC);
CREATE TABLE IF NOT EXISTS decl_text (id TEXT PRIMARY KEY REFERENCES decl(id) ON DELETE CASCADE, name_gloss TEXT NOT NULL DEFAULT '', statement_gloss TEXT NOT NULL DEFAULT '', topic_labels TEXT[] NOT NULL DEFAULT '{}', search_text TSVECTOR);
CREATE INDEX IF NOT EXISTS decl_text_search ON decl_text USING gin (search_text);
CREATE TABLE IF NOT EXISTS decl_embedding (id TEXT PRIMARY KEY REFERENCES decl(id) ON DELETE CASCADE, model TEXT NOT NULL, gloss_vec vector(384), code_vec vector(384));
