---
title: "ADR 0001 — AGENTS.md as source of truth, CLAUDE.md as symlink"
type: adr
layer: synthesis
language: en
tags: [adr, schema, agents]
updated: 2026-04-30
mirror: framework
status: active
distillation_level: 3
---

# ADR 0001 — AGENTS.md as source of truth, CLAUDE.md as symlink

**Status:** active
**Decided:** 2026-04-30
**Deciders:** Kortex framework owners

---

## Context

Two conventions exist for naming the file an AI agent reads as its
operating manual when it enters a repo:

- **`AGENTS.md`** — emerging cross-vendor convention. Adopted by
  several editor-integrated AI tools and proposed in ad-hoc community
  conversations as the "standard agent context file."
- **`CLAUDE.md`** — the convention shipped by Anthropic's Claude
  Code. Claude Code reads `CLAUDE.md` automatically when present in
  a repo's working directory.

Picking one and ignoring the other locks Kortex into one ecosystem.
Picking both as independent files creates a guaranteed drift problem
— sooner or later the two diverge, an agent reads the stale copy,
and the user spends an afternoon debugging why a rule isn't being
followed.

A pure-content alias (literal copy at write time) doesn't survive
edits — the next session edits one file, the other quietly stays
behind.

## Decision

`AGENTS.md` is the canonical, edited file. `CLAUDE.md` is a symlink
pointing at `AGENTS.md`:

```bash
$ ls -la CLAUDE.md
CLAUDE.md -> AGENTS.md
```

Editing either name edits the same file on disk. There is no second
copy to drift.

The symlink is created once at template scaffold time and is part of
the git tree (git stores symlinks as tree entries with a special
mode bit, so cloning the repo restores the symlink correctly on
unix-like systems).

## Consequences

### Positive

- **Single source of truth.** No drift between agent context files.
  An edit to either name is visible to both ecosystems
  simultaneously.
- **No duplication of content.** ~400 lines of agent context don't
  live in two places.
- **Vendor-neutral.** Both `AGENTS.md`-aware and `CLAUDE.md`-aware
  tools find the same file.

### Negative

- **Windows compatibility nuance.** Git on Windows does not always
  follow symlinks by default. Users on Windows may need to enable
  symlink support in git config (`git config --global core.symlinks
  true`) or replace the symlink with a hard alias in their local
  clone. The README addresses this in the Windows section.
- **Symlinks confuse some grep / find tools.** When you grep across
  the repo, the same content appears under both names. Add a
  filter (`-not -name CLAUDE.md`) when this matters.
- **Editing `CLAUDE.md` directly via a tool that "doesn't follow
  symlinks" can break the link.** Some editors offer to "replace
  with copy" when saving — choosing that breaks the alias. The
  [write-authority rule](../../.claude/rules/write-authority.md)
  documents this risk and tells agents never to break the symlink.

### Neutral

- The decision is reversible. Reverting to two independent files (or
  picking one name and dropping the other) is a one-commit change
  whenever the cross-vendor convention settles.

## Alternatives considered

- **AGENTS.md only.** Rejected — Claude Code wouldn't auto-load the
  file, every session would start with manually pointing the model
  at `AGENTS.md`.
- **CLAUDE.md only.** Rejected — couples the framework to one
  vendor's convention; the goal of Kortex is to be multi-AI.
- **Two independent files with a pre-commit hook that copies one
  to the other.** Considered. Rejected because the hook adds
  complexity and only catches drift at commit time — between
  commits, the two files can disagree, which is exactly the failure
  mode the symlink eliminates outright.

---

## How to write an ADR

This file is also the example ADR for the template. Future ADRs
follow the same shape:

- **Filename:** `wiki/decisions/<NNNN>-<slug>.md` where `NNNN` is a
  zero-padded sequence number.
- **Frontmatter:** `type: adr`, `status: proposed | active |
  deprecated | superseded`, plus the standard fields.
- **Body sections:** Context, Decision, Consequences (positive,
  negative, neutral), Alternatives considered.

When an ADR is superseded by a newer decision, set
`superseded_by:` on the old file and `supersedes:` on the new one
— the bidirectional link prevents silent contradictions sitting in
the wiki.

## Backlinks
<!-- backrefs:start -->
- [AGENTS](../../AGENTS.md)
<!-- backrefs:end -->
