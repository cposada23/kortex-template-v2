---
title: "Cross-validate — cost log"
type: reference
layer: project
language: en
tags: [cross-validate, cost-log, ephemeral]
updated: 2026-04-30
mirror: personal
---

# Cross-validate — cost log

Append-only ledger of every `/cross-validate` invocation. One row per
validator per run, plus one TOTAL row per run.

The MTD calculation in `/cross-validate` Step 2 reads this file,
filters by current calendar month, sums `cost_usd` excluding
`vendor: TOTAL` rows, and aborts the run if the next invocation would
push MTD above the cap.

---

## Schema

| Column | Meaning |
|---|---|
| `date` | ISO date of the run (`YYYY-MM-DD`). |
| `input_slug` | Filename of the input without `.md`, or slug derived from path. |
| `vendor` | `openai` \| `gemini` \| `perplexity` \| `claude` \| `TOTAL`. |
| `model` | Specific model id used (e.g. `gpt-5.4`, `gemini-3.1-pro`). |
| `tokens_in` | Prompt tokens consumed. |
| `tokens_out` | Completion tokens (incl. reasoning if applicable). |
| `cost_usd` | Real cost in USD. `$0.00` for the native Claude row. |

---

## Log

| date | input_slug | vendor | model | tokens_in | tokens_out | cost_usd |
|------|------------|--------|-------|-----------|------------|----------|

*(empty — first cross-validate run will append rows here)*

---

## How to read this file

- Group consecutive rows with the same `date` and `input_slug` —
  each group is one run.
- Each group has one row per validator + one TOTAL row.
- For monthly cost: filter `date` to the month, exclude rows where
  `vendor = TOTAL`, sum `cost_usd`.

If you need to reset the MTD counter manually (e.g. after a paid
top-up), don't edit this file — change the cap in the skill
configuration. Editing this file rewrites history.

## Backlinks
<!-- backrefs:start -->
- [cross-validate](../../.claude/skills/cross-validate.md)
- [cross-ai-validation](../../wiki/playbooks/cross-ai-validation.md)
<!-- backrefs:end -->
