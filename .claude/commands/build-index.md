---
---

# /build-index

Rebuild every `INDEX.md` in the repo from the filesystem and
frontmatter of each `.md` file. Closes the drift gap from AGENTS.md
§5 ("every `.md` file appears in exactly one INDEX.md") by treating
INDEX.md as a generated artifact instead of a manual contract.

## How to run

```bash
pnpm kortex build-index                # rebuild every INDEX.md
pnpm kortex build-index --dry-run      # show which would change
pnpm kortex build-index --check        # CI mode — exit 1 if any are stale
pnpm kortex build-index --only wiki/INDEX.md   # rebuild a single index
```

## What gets preserved

- The index's own YAML frontmatter (only `updated:` is bumped to today).
- Any prose between the `# Title` heading and the first auto-section
  (intro paragraph).
- The `## Backlinks` block at the bottom — owned by the
  `update-backrefs.mjs` hook, never touched here.

## What gets generated

Auto-content sits between markers:

```
<!-- build-index:start -->
## Top-level
- ...
## subfolder/
- ...
<!-- build-index:end -->
```

Two modes per INDEX, auto-detected:

- **Aggregate** — list every `.md` under the index's directory,
  grouped by first-level subfolder. Used at `wiki/`, `output/`,
  `projects/<name>/`, `learnings/<name>/`.
- **Container** — when every immediate subdirectory has its own
  `INDEX.md`, just list those subdirectories with a link to their
  AGENTS.md. Used at `projects/INDEX.md` and `learnings/INDEX.md`.

## Exclusions per AGENTS.md §5

- `INDEX.md` itself
- Repo-root files: `AGENTS.md`, `CLAUDE.md`, `README.md`, `index.md`,
  `TODO.md`, `log.md`, `JOURNAL.md`, `INBOX.md` — only at the
  literal repo root, not inside zones/projects.
- Anything under `.claude/`, `.git/`, `node_modules/`, `.cache/`,
  `.husky/`.
- `output/sessions/` is mentioned by **count**, not enumerated.

## Per-entry format

```
- **[<title>](<relative-path>)** — <description> `<keywords>`
```

- **Title** — from frontmatter `title:`, falls back to filename.
- **Description** — first non-frontmatter, non-heading line of the
  body, with markdown link syntax stripped and truncated at the
  first sentence boundary or 110 chars.
- **Keywords** — joined `tags:` from frontmatter.

## When to run

- After landing a batch of new pages (CI hook candidate).
- During `pnpm kortex health` when drift is suspected.
- Manually before a sync to the public template, so the mirrored
  INDEX matches reality.

Not wired into pre-commit by default — diff churn would be high
and the migration / `/ingest` flows already keep new entries in
their right INDEX.
