# Template: learnings/<name>/INDEX.md

Copy the block below into `learnings/<name>/INDEX.md` and fill in
the placeholders (`{{...}}`). This file is the learning-level index —
**every `.md` note, assignment, and resource in the learning folder
must appear here**, at any depth.

`learnings/` replaces v1's `sources/courses/`. The folder name change
reflects the broader scope: any structured learning input — courses,
books, video series, conference talks, paper roundups — files in
here.

**Entry format:**

- Top-level files → short description + keywords.
- Notes/assignments at depth 4+ → filename + keywords; drop the
  description when the filename is self-explanatory.
- Keywords: 2–5 lowercase, comma-separated, **only terms NOT already
  in the filename**.

See the root [AGENTS.md](../../AGENTS.md) → Auto-index Rule for the
full exclusion list.

```markdown
---
title: "{{Learning Name}} — Learning Index"
type: index
layer: source
language: en-es
tags: [learning, index]
updated: YYYY-MM-DD
mirror: personal
---

# {{Learning Name}} — Learning Index

{{One paragraph: what this learning is, who teaches/wrote it,
platform/medium, format, and what it feeds (which wiki areas or
projects).}}

**Language:** {{es | en}} ·
**Format:** {{course | book | video-series | paper-set | talk}} ·
**Source:** {{YouTube | Skool | Hotmart | O'Reilly | arXiv | ...}} ·
**Status:** {{in-progress | completed | paused | abandoned}} ·
**Feeds:** {{wiki/areas/<name>/, projects/<name>/, ...}}

**Entry points (read in this order):**

1. [AGENTS.md](AGENTS.md) — learning-specific rules *(if exists)*
2. [README.md](README.md) — overview, module/level map *(if exists)*
3. {{first note file or TODO.md}}

---

## Top-level files

- **[README.md](README.md)** — overview. `overview, syllabus`
- **[TODO.md](TODO.md)** — study tracker. `progress`
- {{List every remaining .md at the learning root with description +
  keywords.}}

## notes/

{{How notes are organized + current depth of coverage.}}

- **[file-1.md](notes/file-1.md)** — what it is. `kw1, kw2`

### notes/{{module}}/ *(if depth 4+)*

- **[nested-note.md](notes/module/nested-note.md)** — `kw1, kw2`

## assignments/ *(if applicable)*

- **[file-1.md](assignments/file-1.md)** — `kw1, kw2`

## resources/ *(if applicable)*

- **[file-1.md](resources/file-1.md)** — what it is. `kw1, kw2`

## Insights — [INSIGHTS.md](INSIGHTS.md) *(if applicable)*

Promotion candidates log — claims verified in this learning that rise
to `wiki/` or `projects/`.

## Inbox

[inbox/](inbox/) — learning-specific captures.

---

## How this file is maintained

Updated by `pnpm kortex ingest` when processing inbox items. Manual
edits when completing a new module or adding assignments.
`pnpm kortex health` flags drift.

Zone entry: [../INDEX.md](../INDEX.md). Root entry:
[../../index.md](../../index.md).
```

## Backlinks
<!-- backrefs:start -->
- [AGENTS](../../AGENTS.md)
<!-- backrefs:end -->
