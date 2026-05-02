---
title: "Atomic notes"
type: concept
layer: synthesis
language: en
tags: [knowledge-management, note-taking]
updated: 2026-04-30
distillation_level: 3
related_paths:
  - ../playbooks/example-playbook.md
  - ../decisions/0001-example-adr.md
---

# Atomic notes

**Summary:** A note is "atomic" when it captures a single idea
completely enough to be linked from anywhere else without losing
context. One idea, one page, one stable URL.

---

## What it is

An atomic note answers exactly one question or describes exactly one
concept. It is not a collection of related thoughts under one
heading; that is a chapter. The page is short enough to be read in
under two minutes — typically 100–300 words of body text — and is
written so that linking to it from another page transports the full
meaning of the idea, not a fragment.

The discipline forces three habits: distilling before you write,
naming the concept clearly enough that the title alone is useful,
and accepting that some pages will end up as one paragraph.

## Why it matters

Atomic notes are what make a knowledge graph compound. When every
page is one idea, links between pages encode genuine relationships
between ideas — not "see also this giant doc that mentions the same
keyword somewhere." Search hits are precise. Cross-references are
trustworthy. New pages connect to the existing graph at the
specific node they relate to, not the whole document.

Non-atomic pages do the opposite: they accumulate, they get
re-edited under increasing internal contradiction, and they become
unlinkable because no caller knows which fragment they meant.

## How it connects

The Kortex schema tracks atomic-note maturity through
`distillation_level` (0–4) on every wiki page. A level-2 page is
"distilled in your own words"; a level-3 page is "synthesized and
cross-referenced"; level-4 means the page is ready to ship as
content directly. The `confidence` field tracks trust separately —
a page can be highly distilled but low-confidence if it rests on a
single source.

For the procedure of writing one, see
[example-playbook.md](../playbooks/example-playbook.md).

## Source

This concept is from the Zettelkasten tradition (Niklas Luhmann),
adapted for markdown-and-git by the Kortex framework.

## Backlinks
<!-- backrefs:start -->
- [example-playbook](../playbooks/example-playbook.md)
<!-- backrefs:end -->
