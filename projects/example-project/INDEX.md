---
title: "Example Project — Project Index"
type: index
layer: project
language: en
tags: [example-project, index]
updated: 2026-04-30
mirror: framework
---

# Example Project — Project Index

A neutral example project shipped with the Kortex template. Shows
the expected structure of a project folder: AGENTS.md, README.md,
INDEX.md, TODO.md at the root, plus optional subfolders for
references, drafts, inbox, and assets.

**Status:** example · **Language:** en · **Started:** 2026-04-30

**Entry points (read in this order):**

1. [AGENTS.md](AGENTS.md) — project rules
2. [README.md](README.md) — overview
3. [TODO.md](TODO.md) — active tasks

---

## Top-level files

- **[AGENTS.md](AGENTS.md)** — project agent context. `rules, scope`
- **[README.md](README.md)** — overview of this example project. `overview, structure`
- **[TODO.md](TODO.md)** — active tasks + backlog. `tasks, backlog`

## Subfolders (when populated)

This example project ships with no subfolders populated. When you
adapt the project for real work, expected subfolders include:

- `references/` — project-specific briefs, specs, audience research
- `drafts/` — work-in-progress content
- `inbox/` — project-specific captures
- `assets/` — binaries (with `.meta.md` sidecars or folder-README
  aggregation)

Each subfolder added gets a section here listing its files.

## Inbox

This project ships with no inbox content. Drop captures into
`inbox/` (or root `/inbox/` with `target_channel: example-project`)
and they're routed here on the next ingest.

---

## How this file is maintained

Updated by `pnpm kortex ingest` when processing inbox items.
Manual edits when a top-level file is added or removed.
`pnpm kortex health` flags drift.

Zone entry: [../INDEX.md](../INDEX.md).

## Backlinks
<!-- backrefs:start -->
- [AGENTS](AGENTS.md)
<!-- backrefs:end -->
