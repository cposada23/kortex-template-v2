---
title: 'Decision: Consolidate wiki subfolder CLAUDE.md files'
type: concept
layer: synthesis
language: en
tags:
  - decision
  - framework
  - governance
updated: 2026-04-13T00:00:00.000Z
distillation_level: 2
confidence: high
source_count: 1
---

# Decision: Consolidate wiki subfolder CLAUDE.md files

**Date:** 2026-04-13

**Why:** 7 CLAUDE.md files in wiki subfolders repeated what wiki/CLAUDE.md already said — ~11KB of redundant governance, ~1,860 tokens of potential load. Each file was read by Claude Code when navigating into that subfolder.

**What it affects:** `wiki/CLAUDE.md` (expanded with subfolder table), 7 subfolder CLAUDE.md files (deleted). Main repo went from 17 → 10 CLAUDE.md files.

**Alternatives considered:** Keep the files but slim them to 3-5 lines each. Rejected because even slim files still get loaded as context, and the unique rules fit cleanly into a table in the parent.

**Outcome:** All unique behavioral rules preserved in wiki/CLAUDE.md subfolders table. Zero information lost, significant token savings.

## Backlinks
<!-- backrefs:start -->
_No incoming links._
<!-- backrefs:end -->

