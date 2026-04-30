---
scope: framework
---

# /review

Surface 3 random notes that need attention. Built on existing
frontmatter — no new schema fields. Catches the three most common
forms of PKM rot:

| Bucket | Criterion |
|---|---|
| **A** | `wiki/*` with `distillation_level <= 2` AND `updated > 30d` ago |
| **B** | `wiki/*` with `confidence: high` AND `last_verified` missing or `> 30d` |
| **C** | `inbox/*` (excluding `inbox/journal/`) older than 14 days |

Output: 3 random candidates from the union, with title, path, age,
and bucket reason. Re-running gives a different sample.

## How to run

```bash
pnpm kortex review                  # 3 random picks
pnpm kortex review --count 5        # surface 5
pnpm kortex review --bucket A       # only stale wiki
pnpm kortex review --bucket A,B     # multiple buckets
pnpm kortex review --all            # every candidate, no sampling
pnpm kortex review --json           # machine-readable
```

## Why no `next_review` field

Adding `next_review:` would be a fourth overlapping date alongside
`updated`, `last_verified`, and `distillation_level`. The 3 buckets
above already cover the rot shapes; if a future need surfaces that
the existing fields can't express, that's the moment to add the
field — not before.

## What the model does

When the owner runs `/review`, it usually surfaces 3 cards. The
model can offer to: (a) take a single pick to a `/safe-change`
distillation pass, (b) bump `last_verified` after a quick check,
or (c) move an inbox item to its destination via `/ingest`.
`/review` itself is diagnostic, never corrective.
