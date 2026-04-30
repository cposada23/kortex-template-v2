---
title: "Example Course — Learning Index"
type: index
layer: source
language: en
tags: [example-course, index, learning]
updated: 2026-04-30
mirror: framework
---

# Example Course — Learning Index

A neutral example course shipped with the Kortex template. Shows
the expected structure of a learning folder: an INDEX.md at the
root, optional subfolders for `notes/`, `assignments/`, and
`resources/`, an `INSIGHTS.md` for promotion candidates, and an
`inbox/` for captures.

The example topic is **"AI Engineering 101"** — a hypothetical
introductory course on working effectively with frontier AI models.
Replace with your real course content when you adapt the template.

**Language:** en · **Format:** course (example) ·
**Source:** template · **Status:** example · **Feeds:** wiki/concepts/

**Entry points (read in this order):**

1. [INSIGHTS.md](INSIGHTS.md) — example insights worth promoting
2. (notes/, assignments/, resources/ when populated)

---

## Top-level files

- **[INSIGHTS.md](INSIGHTS.md)** — example promotion candidates from
  this course. `insights, promotion`

## notes/ *(empty in the example)*

Course notes go here, organized by module or week. When populated,
each note appears in this section with a one-line description and
keywords.

## assignments/ *(empty in the example)*

Assignment write-ups go here. Same indexing rules.

## resources/ *(empty in the example)*

External references the course points to (papers, articles, repos).

## Inbox

This example course ships without an `inbox/` subfolder. When you
adapt the example for a real course, create `inbox/` here for
course-specific captures. Drop notes mid-class and triage on the
next `pnpm kortex ingest` pass.

---

## How this file is maintained

Updated by `pnpm kortex ingest` when processing course inbox items.
Manual edits when a top-level file is added or removed.
`pnpm kortex health` flags drift.

Zone entry: [../INDEX.md](../INDEX.md).
