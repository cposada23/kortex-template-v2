---
title: "Kortex template — agent context"
type: reference
layer: project
language: en-es
tags: [agents, kortex, framework]
updated: 2026-04-30
---

# Kortex — Agent Context

Hello {{owner_name}} — this is your Kortex instance.
Primary channel: **{{primary_channel}}**.
Default response language: **{{default_language}}**.

This file is the operating manual any AI agent reads first when
working in this repo. It is also the source of truth — `CLAUDE.md` is
a symlink to this file, so editing one edits both. If you (or any
agent) want to change a rule, edit `AGENTS.md`.

---

## What Kortex is

Kortex is a **personal knowledge graph** built from plain markdown
files, designed to be edited by humans and AI agents in the same
repo. It is markdown-first, multi-AI (any frontier model can read and
write into it), runs on Node 20+, and lives in git so every change is
versioned, reverted, and shareable.

It is not a Notion replacement and not an Obsidian replacement. Both
of those tools lock you in — Notion to a hosted database, Obsidian
to a wikilink syntax that breaks when you read files anywhere else.
Kortex commits to the inverse: nothing in this repo requires a
specific tool to be useful. You can browse it on GitHub, edit it in
VS Code, search it with grep, sync it to your phone, or hand it
wholesale to an AI agent. The only opinionated layer is this file
and the schema in `schema/frontmatter.json`.

The compounding bet: a knowledge base whose schema is enforced and
whose growth is automated by AI agents will outpace any system that
relies on manual gardening alone.

---

## The five-zone architecture

```
inbox/      CAPTURE ZONE    Raw input. Zero friction. AI can write here.
wiki/       SYNTHESIS ZONE  Distilled atomic pages. Cross-referenced.
projects/   PROJECT ZONE    Active execution per project.
learnings/  LEARNING ZONE   Structured input — courses, books, talks.
output/     EPHEMERAL ZONE  Session notes, lint reports, cost logs.
```

Each zone has one purpose and one set of expectations:

- **`inbox/`** — anything goes. No required schema beyond the
  optional [idea schema](#8-idea-schema-rule). External AI surfaces
  may drop captures here. Triaged out by `pnpm kortex ingest`.
- **`wiki/`** — distilled, atomic, cross-referenced. Five subfolders:
  `concepts/`, `playbooks/`, `references/`, `decisions/`, `areas/`.
  Pages here should be linkable by other pages.
- **`projects/`** — anything with a goal and an end date. Each
  project is its own folder with its own [AGENTS.md](#agentsmd-is-the-source-of-truth),
  README.md, INDEX.md, TODO.md.
- **`learnings/`** — anything structured you're learning from.
  Courses, books, video series. Notes belong here; insights promoted
  to `wiki/`.
- **`output/`** — ephemeral artifacts only. Session bridges, lint
  reports, plans, cost logs. Knowledge you want to keep goes to
  `wiki/`, never `output/`.

The schema layer (this file + `.claude/rules/` + `.claude/commands/` +
`schema/`) is the one thing that is not in any of these five zones —
it lives in the project root and `.claude/`.

---

## Schema

The single source of truth for the frontmatter schema is
[schema/frontmatter.json](schema/frontmatter.json). Required fields
on every indexable `.md` file:

```yaml
---
title: "Page title"
type: concept | reference | playbook | area | project | tool |
      person | index | inbox | idea | todo | todo-index | adr | session
layer: source | synthesis | project | schema
language: en | es | en-es
tags: [tag1, tag2]
updated: YYYY-MM-DD
---
```

Each `type` value is documented with a use case and example path in
[schema/types.md](schema/types.md). Don't invent new types. If you
need a type that isn't there, write an ADR proposing it.


### Idea-specific schema

Pages with `type: idea` carry three extra required fields —
`status`, `angle`, `target_channel` — gated by a JSON Schema
discriminator. See the "Idea schema rule" section below.

### Confidence + distillation (optional)

Two orthogonal trust signals on wiki pages:

```yaml
distillation_level: 0-4    # how processed (0 = raw dump, 4 = ready to ship)
confidence: high | medium | low  # how trustworthy
source_count: 3
last_verified: YYYY-MM-DD
```

A page can be `distillation_level: 3` but `confidence: low` if it's
based on a single unverified source.

---

## Language policy

Kortex is bilingual by design.

- **Sources stay in their original language.** A course in Spanish
  generates Spanish notes. A book in English generates English
  notes.
- **`wiki/` mixes Spanish and English** intentionally. Pages adopt
  whichever language best serves the content; bilingual pages use
  `language: en-es`.
- **Don't translate files unless explicitly asked.** Translation
  doubles maintenance and rarely beats keeping both languages around.
- **Default response language follows the owner's input.** If
  {{owner_name}} writes to you in Spanish, respond in Spanish; in
  English, respond in English. Project-specific override: a project's
  `AGENTS.md` may pin a default language for content produced for
  that project (e.g. content for a LATAM channel is generated in
  Spanish unless told otherwise).

The `language:` frontmatter field uses 3 values: `en`, `es`, `en-es`.

---

## Auto-index rule

**Every `.md` file appears in exactly one INDEX.md — the most specific
one for its location.** Files at any depth are listed in their parent
project / learning / zone INDEX using the full relative path from
that INDEX. There is no separate index per nested subfolder.

### Routing table

| New file path | Update this INDEX |
|---|---|
| `wiki/<...>.md` | wiki/INDEX.md |
| `projects/<name>/<...>.md` | `projects/<name>/INDEX.md` |
| `learnings/<name>/<...>.md` | `learnings/<name>/INDEX.md` |
| `inbox/<file>.md` | inbox/INBOX.md if it changes the snapshot |
| `output/<file>.md` | output/INDEX.md |

A whole new project or learning folder gets its own INDEX.md from
[.claude/templates/project-index.md](.claude/templates/project-index.md)
or [.claude/templates/learning-index.md](.claude/templates/learning-index.md).

### Entry format

```
- **[filename](full/relative/path)** — short description. `kw1, kw2, kw3`
```

Top-level files of a project/learning get a short description plus
keywords. Deep files (depth 4+) can drop the description if the
filename is self-explanatory. Keywords are 2–5 lowercase terms that
are NOT already in the filename — they are the secondary search
index that `pnpm kortex query` uses.

### Exclusions (never indexed)

- `INDEX.md` itself (recursion)
- Root-of-repo files: `AGENTS.md`, `CLAUDE.md`, `README.md`,
  `index.md`
- Everything under `.claude/`, `.git/`, `node_modules/`, system files
- `output/sessions/` contents (browsable via filesystem; folder
  itself is mentioned with file count)

> **Future direction:** v2 is planning build-time backref
> generation that may eventually replace the manual INDEX.md
> convention. Until that ships, manual indexes are the contract.

---

## Frontmatter rule and exceptions

Every new `.md` file created in this project must include YAML
frontmatter per [schema/frontmatter.json](schema/frontmatter.json).

**Frontmatter is NOT required on these** — they are schema or
operational files, not indexable content:

- `AGENTS.md`, `CLAUDE.md`, `README.md`
- `INBOX.md`, `JOURNAL.md`, `index.md`
- Anything under `.claude/rules/`, `.claude/hooks/`,
  `.claude/commands/`, `.claude/skills/`, `.claude/templates/`

The pre-commit hook at `scripts/hooks/validate-frontmatter.mjs`
enforces this list — keep the two in sync when you update either.


---

## Confidence + distillation tracking

Two optional fields, orthogonal to each other:

- **`distillation_level`** tracks maturity (0 raw → 4
  expression-ready)
- **`confidence`** tracks trust (high / medium / low)

Use `supersedes:` and `superseded_by:` when a new page replaces an
older one — bidirectional links prevent silent contradictions sitting
in `wiki/`.

Backfill these fields opportunistically during distillation reviews;
don't block new pages on them.

---

## Idea schema rule

Items in any `/inbox/` folder with `type: idea` follow a narrower
schema with three additional required fields:

```yaml
title: "idea title"
type: idea
layer: project
language: es
tags: [relevant-tags]
updated: YYYY-MM-DD
status: inbox | in-validation | in-testing | in-production |
        ready-to-publish | published | rejected | reserva |
        regalable | archivada
angle: "one-sentence editorial angle — why this idea is distinct"
target_channel: <channel-or-project-slug>
```

The JSON schema enforces this via an `if/then` discriminator —
without `status`, `angle`, and `target_channel`, the validator fails
the commit.

**Routing is by `target_channel`, not by inbox path.** An idea in
the root `/inbox/` with `target_channel: my-blog` is a my-blog idea,
regardless of physical location. `pnpm kortex ingest` moves it to
the right destination.

---

## Link rule

All internal links use **standard relative markdown**:
`text`. No wikilinks. The pre-commit hook at
`scripts/hooks/validate-links.mjs` blocks broken internal links.

File mentions in prose **must be links**, not bare paths or
backticked paths. Inventory tables and code blocks are exempt. Full
rule: [.claude/rules/links.md](.claude/rules/links.md).

---

## Verification rule

Claims about fast-changing external facts (AI product features,
platform UIs, metrics, legal events) require a live web search with
a result dated within 30 days. Output from another AI is a signal,
not verification. Critical claims (anything that changes a
production decision) need a source link plus the date.

Full rule: [.claude/rules/verification.md](.claude/rules/verification.md).

---


## Write authority rule

Structural writes pass through Claude Code only. External AI surfaces
may read and propose captures to `inbox/`; they do not write to
`wiki/`, `projects/`, `learnings/`, or schema. Full rule:
[.claude/rules/write-authority.md](.claude/rules/write-authority.md).

### AGENTS.md is the source of truth

`AGENTS.md` is canonical. `CLAUDE.md` is a symlink:

```bash
$ ls -la CLAUDE.md
CLAUDE.md -> AGENTS.md
```

Never edit `CLAUDE.md` directly. Never replace the symlink with a
copy. The symlink exists so Claude Code (which reads `CLAUDE.md`)
and other tools (which read `AGENTS.md`) point at the same file.

---


## Commands

The available command set lives under `.claude/commands/`. Each is a
thin slash-command wrapper around an implementation in
`scripts/commands/`. Invoke from CLI as `pnpm kortex <name>` or as a
slash command in Claude Code.

| Command | What it does |
|---|---|
| `bridge` | Session start ritual + end-of-session bridge in one. |
| `ingest` | Process all `inbox/` folders, route captures, file insights. |
| `health` | Lint pass — broken links, frontmatter drift, stale pages, sidecar debt. |
| `query` | Search the knowledge base with the compounding loop pattern. |
| `safe-change` | Branched change workflow with review-before-commit. |
| `daily` | Daily-driver wrapper — opens journal, surfaces TODOs. |
| `read-last-handoff` | Reconstruct session state after a missed bridge. |

Full documentation per command: see the matching `.md` file in
`.claude/commands/`.

---

## Asset sidecars

Binary files (images, videos, PDFs) get a `[filename].meta.md`
sidecar describing the asset:

- title, type (`image | video | pdf | audio`)
- description, source, license
- which page or project uses it

Convention, not enforced. Bulk asset folders (logos, exported sizes)
can use a folder-level `README.md` instead of one sidecar per file.
`pnpm kortex health` flags binaries that are neither covered by a
sidecar nor by a folder-README as "sidecar debt".

---

## Logs and rotation

`output/JOURNAL.md` is append-only — every session adds a STATE /
DECISIONS / NEXT block at the bottom. `pnpm kortex health` rotates
entries older than 90 days into `output/archive/journal-YYYY-Q[N].md`
so the live file stays scannable.

Don't rewrite history. If you need to correct a past entry, append a
new entry that supersedes it.

---

## Git policy

- **Commit before any bulk operation.** A commit before a refactor or
  a multi-file rename is the cheapest insurance you can buy.
- **Delete freely.** Git preserves history. Files deleted in commit
  N are still in commit N-1; there's no need to maintain a separate
  `archive/` folder for "I might want this back."
- **One symlink for `CLAUDE.md`.** Don't break it.
- **Branch for safe changes.** Use `pnpm kortex safe-change` when a
  change touches >3 files or >100 lines — it creates a branch,
  shows the diff for review before commit, and lets you abort
  cleanly.

---

## Quick reference for new files

| You want to write... | Use template / rule |
|---|---|
| A wiki concept | [.claude/templates/concept.md](.claude/templates/concept.md) |
| A wiki area | [.claude/templates/area.md](.claude/templates/area.md) |
| A project brief | [.claude/templates/project-brief.md](.claude/templates/project-brief.md) |
| A new project's INDEX.md | [.claude/templates/project-index.md](.claude/templates/project-index.md) |
| A new learning's INDEX.md | [.claude/templates/learning-index.md](.claude/templates/learning-index.md) |
| A session-end note | [.claude/templates/session-end.md](.claude/templates/session-end.md) |
| An idea (in inbox) | "Idea schema rule" section above + matching example in `inbox/INBOX.md` |
| An ADR | [wiki/decisions/0001-example-adr.md](wiki/decisions/0001-example-adr.md) (read as model) |

## Backlinks
<!-- backrefs:start -->
- [links](.claude/rules/links.md)
- [verification](.claude/rules/verification.md)
- [write-authority](.claude/rules/write-authority.md)
- [area](.claude/templates/area.md)
- [concept](.claude/templates/concept.md)
- [learning-index](.claude/templates/learning-index.md)
- [project-brief](.claude/templates/project-brief.md)
- [project-index](.claude/templates/project-index.md)
- [session-end](.claude/templates/session-end.md)
- [README](README.md)
- [AGENTS](projects/example-project/AGENTS.md)
- [types](schema/types.md)
- [0001-example-adr](wiki/decisions/0001-example-adr.md)
<!-- backrefs:end -->

