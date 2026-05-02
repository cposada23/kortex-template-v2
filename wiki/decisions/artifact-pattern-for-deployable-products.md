---
title: 'Decision: Artifact pattern for deployable products'
type: concept
layer: synthesis
language: en
tags:
  - decision
  - artifacts
  - deployment
  - architecture
updated: 2026-04-16T00:00:00.000Z
distillation_level: 2
confidence: high
source_count: 1
last_verified: 2026-04-16T00:00:00.000Z
---

# Decision: Artifact Pattern for Deployable Products

**Date:** 2026-04-16
**Status:** Accepted

## Context

Kortex produces two kinds of output:
1. **Knowledge artifacts** — wiki pages, playbooks, decision records (live inside the Kortex repo)
2. **Deployable products** — websites, tools, apps (need their own repo for deployment)

The first case was already handled (`kortex-template/` for Kortex itself). The second case needed a pattern for Idea Lab products like Cuánto Cobro.

## Decision

Deployable products follow the artifact pattern established by `projects/kortex/kortex-template/`:

1. Product lives in its own git repo inside the project folder (e.g., `projects/example-project/cuanto-cobro-site/`)
2. The folder is `.gitignored` from Kortex
3. The project's `CLAUDE.md` has an **Artifact** section with repo URL, local_path, and restore command
4. Development happens from the KB context via subshell commands — never `cd` into the artifact repo
5. All learnings captured in `projects/example-project/meta/INSIGHTS.md` (global) and project-specific files

## Why

- **Separate deployment lifecycle.** A static site's git history (commits, tags, deploys) should not pollute the KB's knowledge-focused history.
- **Independent hosting.** Each product connects to its own deployment platform (Cloudflare Pages, GitHub Pages, etc.) via its own repo.
- **Learnings stay in the KB.** The spec, deployment decisions, and insights are tracked in the KB project folder. The artifact repo is just the deployable output.
- **Proven pattern.** Already works for `kortex-template/` — `/bridge` checks for missing artifacts, `artifacts.md` documents restore commands.

## What It Affects

- New products from Idea Lab get `cuanto-cobro-site/`-style folders
- `.gitignore` updated per product
- `/bridge` artifact scan catches missing repos
- Development workflow uses subshells, not `cd`

## Alternatives Considered

1. **Build inside the KB repo** — rejected because deployment platforms expect their own repo, and mixing KB commits with product commits creates noise.
2. **Separate repo with no local clone** — rejected because development from KB context requires the files to be locally accessible for subshell commands.
3. **Monorepo with deploy subfolder** — rejected because it adds build complexity (deploy platforms would need subfolder config) for no 10x benefit.

## Backlinks
<!-- backrefs:start -->
_No incoming links._
<!-- backrefs:end -->

