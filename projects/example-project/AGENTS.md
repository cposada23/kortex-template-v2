---
title: "Example project — agent context"
type: reference
layer: project
language: en
tags: [example-project, agents]
updated: 2026-04-30
mirror: framework
---

# Example Project — Agent Context

This is the project-scoped `AGENTS.md`. It overrides or extends the
root [AGENTS.md](../../AGENTS.md) for anything specific to this
project.

When an agent works on a file inside `projects/example-project/`,
it reads:

1. The root `AGENTS.md` (general framework rules)
2. *This* file (project-specific overrides)
3. The specific file it's editing

Use this file to capture decisions, conventions, and constraints
that apply only to this project. Don't copy general framework rules
here — they're already in the root.

---

## What this project is

A neutral example — a placeholder for any project you might run.
Replace the body of this file with your own project's context when
you fork the template.

Concrete suggestions for what to put here:

- **Goal of the project** in one sentence.
- **Audience or stakeholder** — who benefits from this work.
- **Output format** — what gets shipped (a website, a PDF, a
  course, an internal tool).
- **Project-specific filename conventions** — e.g. "all draft posts
  live under `drafts/<YYYY-MM-DD>-<slug>.md`".
- **Project-specific schema additions** — extra frontmatter fields
  used only here.
- **Decisions that affect agents** — e.g. "always write content for
  this project in Spanish" or "always include a hook line as the
  first paragraph of every draft."

---

## Scope

`scope: project:example-project` — any `.claude/` files inside this
project's folder are scoped to this project and never mirror to the
public template. (This `AGENTS.md` is content, so it carries
`mirror: framework` in its frontmatter — it's part of the example
shipped with the template.)

---

## Project-specific commands or skills

If this project needs a workflow that doesn't make sense outside it,
write it as a skill or command under
`projects/example-project/.claude/` with `scope: project:example-project`.
The framework `.claude/` directory at the repo root is for
cross-project workflows only.

---

## Entry points

For an agent reading this project for the first time, follow this
order:

1. README.md — human-readable overview
2. INDEX.md — full file map
3. [TODO.md](TODO.md) — what's active right now
4. Most recent file in any subfolder — what was edited last

## Backlinks
<!-- backrefs:start -->
- [AGENTS](../../AGENTS.md)
- [INDEX](INDEX.md)
- [README](README.md)
- [TODO](TODO.md)
<!-- backrefs:end -->

