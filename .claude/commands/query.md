---
scope: framework
---

# /query

Full-text search across the knowledge base — wiki, projects, learnings,
inbox, output. Default backend is `ripgrep` (falls back to `grep -r` if
rg isn't installed). Recency-weighted via `.cache/recency.json`.

No embeddings in v2.0 — that's a deliberate design call (see PRD §4).
FTS5 is a v2.1 candidate.

## How to run

```bash
pnpm kortex query "search terms"
pnpm kortex query "skool monetization" --limit 20
pnpm kortex query "FICHA NICHO" --json
```

## Output

Top 10 matches by default, sorted by `(grep_hit_count + recency_boost)`.
Each match shows the file path, score, last-updated date (if known), and
1–2 line excerpts.

## What the model does

For a question that could be answered from existing knowledge:

1. Run `/query` with the most distinctive terms from the question.
2. Read the top 1–3 result files.
3. Synthesize the answer with explicit references to the source paths.
4. **Per the v1 compounding-loop rule:** if the answer reveals lasting
   knowledge, update or create a wiki page so the next query is faster.

## When NOT to use /query

- A question scoped to a single project where you already know the file
  to read. Just read it.
- Real-time facts (model pricing, platform UI) — those need
  `WebSearch`, not `/query`.
- Questions about `.claude/` infrastructure. Read the relevant rule or
  hook directly.
