# Tengoku search tests

- `pnpm test:tengoku` — unit tests for the pure parts (normalisation, intent,
  expansion, fusion, stats parsing). No database needed.
- `TENGOKU_INDEX_DATABASE_URL=… pnpm tengoku:eval [golden file]` — runs every
  golden query through the real index and reports hit@1, hit@10 and MRR, plus
  any expected declaration that is not in the index at all (a bad expectation,
  not a search failure).

The golden set is split 80/20:

- `golden-dev.jsonl` (80%) is Claude's: used to tune weights, lexicon and
  channels, so it will drift towards whatever the implementation does well.
- `golden-holdout.jsonl` (20%) is yours. Claude never reads results from it
  while tuning. Run it yourself to get an honest number; add to it freely.

One line per query: `{"q": …, "intent": …, "expect": [names…], "note": …}`.
A query counts as hit@k when any expected name is in the top k.
