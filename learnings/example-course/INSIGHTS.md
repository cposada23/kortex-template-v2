---
title: "Example Course — Insights"
type: reference
layer: source
language: en
tags: [example-course, insights, promotion]
updated: 2026-04-30
mirror: framework
distillation_level: 2
---

# Example Course — Insights

Promotion candidates log. As you go through a course, when a claim
or framework feels stable enough to be reused outside the course
context, add a row here. On the next ingest, those rows are
candidates for promotion to `wiki/concepts/`,
`wiki/playbooks/`, or `wiki/references/`.

The format is "find a claim → log it here → distill it → promote it
to the wiki when it's atomic enough to stand alone."

---

## 2026-04-30 — Module 1 — context windows are working memory

**Claim:** Treating an LLM context window as "working memory" rather
than "input parameter" changes how you structure prompts. You stop
thinking about the prompt as a single message and start thinking
about it as the room the model is in for the duration of the
response.

**Source:** Module 1, lesson 3 of the example course. ~15:00 mark.

**Promotion candidate:** Yes — concept-level. Suggested target path:
`wiki/concepts/context-as-working-memory.md` (does not yet exist —
this is a future promotion target, not a working link).

**Status:** raw — not yet distilled into a wiki page.

---

## 2026-04-30 — Module 1 — prompt-then-deliver vs deliver-then-prompt

**Claim:** Two structural patterns for prompts:

- **Prompt-then-deliver** — instructions first, content at the
  bottom. Best when the instructions are short and the content is
  long.
- **Deliver-then-prompt** — content first, then instructions. Best
  when the content is short and the instructions need to be very
  specific to it.

**Source:** Module 1, lesson 4. Several worked examples.

**Promotion candidate:** Maybe — playbook-level if it can be
generalized into a "when to use which structure" decision tree.

**Status:** raw — needs more examples from other sources before
being promoted (low confidence on a single source).

---

## How this file is used

Each insight is one entry. Entries can sit in this file for weeks
before being promoted — the cost of leaving them here is zero, and
premature promotion is more expensive than late promotion (an
under-distilled wiki page degrades the average quality of the wiki).

When you promote an insight to the wiki, leave this row in place
with a `Promoted to: <path>` line — the trail is part of the audit
log. Don't delete promoted insights from this file; that erases
provenance.

## Backlinks
<!-- backrefs:start -->
- [INDEX](INDEX.md)
<!-- backrefs:end -->

