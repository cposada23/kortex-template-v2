---
title: "Kortex v2 — Type Reference"
type: reference
layer: schema
language: en
tags: [schema, frontmatter, reference]
updated: 2026-04-30
---

# Kortex v2 — Type Reference

Canonical descriptions for the **14** valid `type:` values in the
frontmatter schema. The `type:` field is the discriminator that
controls validation rules (`type: idea` requires extra fields) and
routing across commands (`/ingest`, `/lint`, `/query`).

If you need a value that isn't listed here, the rule is: **don't
invent a 15th type.** Either reuse the closest existing type and
distinguish via tags, or open an ADR proposing the addition. v1
drifted to ~42 ad-hoc values across the corpus and v2 exists in part
to undo that.

The canonical list lives in
[frontmatter.json](frontmatter.json) under `properties.type.enum` —
this document and that JSON enum stay in sync.

---

## Wiki types

These types live primarily under `wiki/`.

### `concept`

Distilled conceptual content. Atomic — one idea per page. Aim for
~100–300 words for the body; longer pages should be reconsidered as
either a `playbook` (if procedural) or split into multiple linked
concepts.

**When to use:** you've internalized a single idea well enough to
explain it in your own words and want it to be cross-referenceable.

**Example:** `wiki/concepts/strategy/skool-monetization-latam.md`

---

### `reference`

Operational fact lookups, configuration registries, indices that
aren't auto-generated. Stable, edited rarely, consulted often.

**When to use:** the content is "the source of truth for X" and other
pages will link to it rather than repeat it.

**Example:** `wiki/references/api-keys-roster.md`

---

### `playbook`

Multi-step actionable workflow. "When X, do Y, then Z." Procedural —
the reader runs the steps, they don't just learn from them.

**When to use:** the content is a how-to that should be executed,
not absorbed.

**Example:** `wiki/playbooks/cross-ai-validation.md`

---

### `area`

Persistent life or business domain — not project-bound. Career,
health, finances, a content channel taken as a long-running concern.
Areas have no end date; projects do.

**When to use:** the topic is ongoing and won't be "done." Project
content related to the area still uses `type: project`.

**Example:** `wiki/areas/health.md`

---

### `adr`

Architecture Decision Record. Numbered (`0001`, `0002`, …),
immutable post-merge. Captures a decision, its context, the options
considered, and the consequences.

**When to use:** a non-trivial decision is being made that future-you
or a collaborator will need to reconstruct. Decision is "non-trivial"
if reversing it would cost more than ~1 day.

**Example:** `wiki/decisions/0001-mirror-flag-replaces-visibility.md`

---

## Project types

These types live primarily under `projects/`.

### `project`

Top-level project entity. One per active project folder. The project's
"home page" — describes scope, status, current phase, key links.

**When to use:** creating a new project folder.

**Example:** `projects/example-project/project.md`

---

### `todo`

Per-project TODO list. Living document, edited frequently.

**When to use:** every active project gets exactly one of these.

**Example:** `projects/example-project/TODO.md`

---

### `todo-index`

Cross-project TODO aggregator. Typically one per repo (root `TODO.md`)
that summarizes the per-project `todo` files.

**When to use:** you want a single dashboard view of work across
projects.

**Example:** `TODO.md` (root)

---

## Capture types

These types live primarily under `inbox/` (root or per-project).

### `inbox`

Quick-capture content. Schema is enforced softly here — the goal is
zero friction for capture. Triaged into other types via `/ingest`.

**When to use:** dumping a thought, link, or fragment that hasn't
been processed yet. Don't agonize over fields — `title`, `type`,
`updated` are enough.

**Example:** `inbox/random-tool-i-saw.md`

---

### `idea`

Captured idea with editorial angle. Lives in any `/inbox/` until
triaged. Requires extra fields (`status`, `angle`, `target_channel`)
that drive routing.

**When to use:** you have a content idea (video, post, piece) and
want it to flow through the production pipeline. The `target_channel`
field decides where the idea ends up after triage, regardless of
which inbox you dropped it in.

**Schema specifics:** see the `if/then` block in
[frontmatter.json](frontmatter.json).

**Example:** `projects/example-project/inbox/skool-from-colombia.md`

---

## Session types

### `session`

Daily session file: bridge-in / handoff / bridge-out content for
one working day. One file per day, append-only within the day.

**When to use:** opened automatically by `/bridge` at the start of
a session, closed by `/bridge-out` at session end.

**Example:** `output/sessions/2026-04-30.md`

---

## Operational types

### `tool`

External tool reference. A Claude.ai project, a Notion database, an
API service, a CLI binary worth documenting because the team relies
on it.

**When to use:** the tool has its own configuration, login, or quirks
worth writing down.

**Example:** `wiki/tools/claude-ai-projects.md`

---

### `person`

Person reference. A collaborator, a client, a contact, a public
figure who keeps showing up in the work.

**When to use:** you find yourself referring to the same person
across multiple pages and want one canonical entry.

**Example:** `wiki/people/jane-doe-collaborator.md`

---

### `index`

Auto-generated `INDEX.md` listing children of a folder. Created and
maintained by `pnpm kortex build-index`, not by hand.

**When to use:** never manually — let the regenerator write these.
The type exists so the validator recognizes them as legitimate
generated artifacts. May be deprecated in v2.x if backref generation
moves to build-time only.

**Example:** `wiki/INDEX.md`

---

## Type ↔ layer matrix

Which `type:` values typically pair with which `layer:` values:

| type           | source | synthesis | project | schema |
| -------------- | :----: | :-------: | :-----: | :----: |
| `concept`      |        |    yes    |         |        |
| `reference`    |        |    yes    |   yes   |  yes   |
| `playbook`     |        |    yes    |   yes   |        |
| `area`         |        |    yes    |         |        |
| `adr`          |        |    yes    |         |  yes   |
| `project`      |        |           |   yes   |        |
| `todo`         |        |           |   yes   |        |
| `todo-index`   |        |           |   yes   |        |
| `inbox`        |  yes   |           |   yes   |        |
| `idea`         |  yes   |           |   yes   |        |
| `session`      |        |           |   yes   |        |
| `tool`         |        |    yes    |         |        |
| `person`       |        |    yes    |         |        |
| `index`        |  yes   |    yes    |   yes   |  yes   |

The matrix is descriptive, not enforced — the schema accepts any
`type` × `layer` combination so unusual placements don't get blocked.
The lint command surfaces unusual pairings as warnings.

---

## Migration from v1

v1 enumerated 12 types in `frontmatter.md`. v2 adds two:

- `adr` — formalizes Architecture Decision Records as a first-class
  type. v1 wrote them as `type: reference` under `wiki/decisions/`,
  which made them indistinguishable from any other reference page.
- `session` — formalizes daily session files. v1 wrote them as
  `type: reference` under `output/sessions/`, same indistinguishability
  problem.

The v1 `decision` keyword is **not** added; ADRs use `type: adr`.

No types are removed in v2.

## Backlinks
<!-- backrefs:start -->
- [AGENTS](../AGENTS.md)
- [README](README.md)
- [example-playbook](../wiki/playbooks/example-playbook.md)
<!-- backrefs:end -->

