---
title: 'Decision: Keep Python Hooks (cancel Phase E)'
type: concept
layer: synthesis
language: en
tags:
  - decision
  - framework
  - hooks
  - python
updated: 2026-04-13T00:00:00.000Z
---

# Decision: Keep Python Hooks

**Date:** 2026-04-13

**Why:** The v4 plan proposed replacing Python validation hooks with POSIX shell scripts to remove the Python dependency. Shell scripts were attempted but cancelled because POSIX shell is not portable to Windows. The Kortex template repo is cloned by users on all platforms. Replacing Python (cross-platform) with shell (Mac/Linux only) would solve a minor friction for some users while creating a hard blocker for Windows users.

**What it affects:**
- `.claude/hooks/validate-frontmatter.py`, `validate-links.py`, `validate-index.py` — stay as Python
- `.claude/settings.json` and `.git/hooks/pre-commit` — no changes needed
- `projects/kortex/archive/framework-improvement-plan-v4.md` — Phase E marked cancelled

**Alternatives considered:**
- POSIX shell rewrites — rejected, not Windows-compatible
- Node.js rewrites — possible (Node is already required for Claude Code), but not worth the effort since Python works fine
- `lychee` (Rust binary) for link validation — adds a binary dependency, worse than Python

**Mitigation:** Added Python 3 installation instructions to the "How to Use" playbook (Paso 0) with platform-specific guidance and the Windows `python` vs `python3` edge case.

**Outcome:** Phase E cancelled. Python hooks stay permanently. If hook improvements are needed in the future, keep them in Python.

## Backlinks
<!-- backrefs:start -->
_No incoming links._
<!-- backrefs:end -->

