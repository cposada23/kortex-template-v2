# Template: projects/<name>/INDEX.md

Copy the block below into `projects/<name>/INDEX.md` and fill in the
placeholders (`{{...}}`). This file is the project-level index —
**every `.md` file and every persistent binary in the project must
appear here**, at any depth, in the most appropriate section.

**Entry format:**

- Top-level project files → short description + keywords.
- Files at depth 4+ (inside subfolders) → filename + keywords is
  enough; drop the description when the filename is self-explanatory.
- Keywords: 2–5 lowercase terms, comma-separated, **only terms NOT
  already in the filename**.

See the root [AGENTS.md](../../AGENTS.md) → Auto-index Rule for the
full exclusion list.

```markdown
---
title: "{{Project Name}} — Project Index"
type: index
layer: project
language: en-es
tags: [project, index]
updated: YYYY-MM-DD
mirror: personal
---

# {{Project Name}} — Project Index

{{One paragraph: what this project is, who it's for, what it
produces. Go one layer deeper than the zone-level description
(pipeline, audience, format, key decisions).}}

**Status:** {{active-shipping | planning | backlog | paused}} ·
**Language:** {{es | en | en-es}} ·
**Started:** {{YYYY-MM-DD}}

**Entry points (read in this order):**

1. [AGENTS.md](AGENTS.md) — project rules
2. [README.md](README.md) — overview for humans
3. [TODO.md](TODO.md) — active tasks

---

## Top-level files

- **[AGENTS.md](AGENTS.md)** — project rules. `rules, policies`
- **[README.md](README.md)** — overview. `overview`
- **[TODO.md](TODO.md)** — active tasks + backlog. `tasks, backlog`
- {{List every remaining .md at project root with description +
  keywords.}}

## {{subfolder-name/}}

{{One-paragraph description of what lives here + current state.}}

- **[file-1.md](subfolder-name/file-1.md)** — what it is. `kw1, kw2`
- **[file-2.md](subfolder-name/file-2.md)** — `kw1, kw2`

### {{subfolder-name/nested-subfolder/}} *(if depth 4+)*

- **[deep-file.md](subfolder-name/nested-subfolder/deep-file.md)** — `kw1, kw2`

{{Repeat per subfolder. Include every nested path. Assets: index
sidecar `.meta.md` files when present; index persistent binaries
directly with filename + type keyword (image | video | pdf | audio)
when no sidecar exists; skip transient WIP binaries.}}

## Inbox

[inbox/](inbox/) — project-specific capture zone. Cross-project ideas
go to root `/inbox/` with `target_channel: <name>`.

List inbox files only if they describe a stable snapshot. Otherwise
the folder reference is enough — `pnpm kortex ingest` moves them to
their final destination.

## Archive *(if applicable)*

- **[archive/old-file.md](archive/old-file.md)** — `kw1, kw2`

---

## How this file is maintained

Updated by `pnpm kortex ingest` when processing inbox items (new
pages registered here). Manual edits when a top-level file is added
or removed. `pnpm kortex health` flags drift (unlisted .md files;
binaries without sidecars).

Zone entry: [../INDEX.md](../INDEX.md). Root entry:
[../../index.md](../../index.md).
```

## Backlinks
<!-- backrefs:start -->
- [AGENTS](../../AGENTS.md)
<!-- backrefs:end -->
