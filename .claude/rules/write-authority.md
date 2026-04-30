---
scope: framework
---

# Write Authority Rule

Structural writes to the knowledge graph pass through Claude Code only.
External AI surfaces (Claude.ai chat, Cowork, ChatGPT, Gemini, etc.) may
read the repo and propose captures; they do not write to `/wiki`,
`/projects`, `/learnings`, or schema directly.

The same rule extends to the `AGENTS.md` / `CLAUDE.md` source-of-truth
relationship: edits land on `AGENTS.md`; `CLAUDE.md` is a symlink to it
and must never be edited independently.

## What counts as "Claude Code"

Claude Code runs in three surfaces — **all three are equally the
authoritative write surface:**

- **CLI** — terminal invocation (`claude`).
- **VS Code extension** — the same Claude Code embedded in the editor.
- **Desktop tab** — Claude Code mode inside the Claude Desktop app.

There is no hierarchy among them. What matters is that Claude Code (any
surface) is driving the write, because Code is the only surface running
this repo's `.claude/` hooks, rules, and commands.

## What Claude Code owns

Claude Code is the sole authoritative writer for:

- `/wiki/` — synthesis layer edits (new pages, distillation, cross-refs)
- `/projects/` — project structural changes (TODOs, briefs, artifacts,
  deploy specs, project `AGENTS.md`)
- `/learnings/` — course-driven additions (INSIGHTS, cross-refs, never
  rewriting raw course material)
- Schema — root [AGENTS.md](../../AGENTS.md), `.claude/rules/`,
  `.claude/commands/`, `.claude/skills/`, `.claude/hooks/`,
  `.claude/templates/`, `schema/frontmatter.json`
- `output/` — sessions, audits, handoffs, reports, logs
- Git commits and pushes

## AGENTS.md is the single source of truth

`AGENTS.md` is the canonical agent-context document. `CLAUDE.md` is a
symlink:

```bash
$ ls -la CLAUDE.md
CLAUDE.md -> AGENTS.md
```

Never edit `CLAUDE.md` directly. Never break the symlink by replacing
it with a copy. The symlink exists so Claude Code (which reads
`CLAUDE.md` by convention) and other tools (which read `AGENTS.md` by
convention) point at the same file. A diverged copy is a guaranteed
"why doesn't my agent know about this rule?" debugging session three
weeks later.

If you need different content for two audiences, write two files with
different names. Do not break the symlink.

## What external AI surfaces may do

- **Read** the repo via GitHub sync (Claude.ai Project), Filesystem MCP
  (Desktop), or any other read-only integration.
- **Propose captures** by dropping `.md` files into `/inbox/` — this is
  the only zone where external writes are tolerated, because `/inbox/`
  has no schema requirements and exists to collect raw input before
  Claude Code triages it.
- **Synthesize across sources** in chat — prompts, cross-AI validation,
  ideation, research. The *output* of that work comes back to Claude
  Code as input, not as a direct write.

## What external AI surfaces must NOT do

- Commit to `main` or any branch.
- Edit `/wiki`, `/projects`, or `/learnings` structure.
- Change schema files (root `AGENTS.md`, `.claude/rules/`,
  `.claude/commands/`, `.claude/skills/`, `.claude/hooks/`,
  `schema/frontmatter.json`).
- Update `index.md`, `JOURNAL.md`, or session-end notes.
- Modify validators or templates.

## Why one authority

- **No merge conflicts between surfaces.** If Code and an external
  surface both wrote, every session would need distributed locking or
  constant rebases. One writer eliminates the class of problem.
- **Hooks + validators only run in Code.** Frontmatter validation, link
  validation, scope tagging — all enforced at commit time by
  `scripts/hooks/`. Writes outside Code bypass those checks entirely.
- **Commit discipline + history quality.** `safe-change`, `bridge`,
  `daily` shape commit messages and log entries consistently. An
  external chat writing commits directly would drift in tone, scope,
  and format — and every drift compounds in the history.

## Inbox exception — rationale and limits

External surfaces may write to `/inbox/` because:

1. The capture zone has no required frontmatter beyond the optional
   idea schema.
2. The next `pnpm kortex ingest` pass routes captures into their final
   destination, applying schema enforcement at that point.
3. The friction cost of "always go through Claude Code to capture" was
   higher than the friction of "Claude Code triages inbox on the way in".

The exception does not extend to schema, structure, or commits.

## Enforcement

This rule is partly social and partly automated:

- Frontmatter validator (`scripts/hooks/validate-frontmatter.mjs`)
  rejects malformed frontmatter at commit time.
- Link validator (`scripts/hooks/validate-links.mjs`) rejects broken
  internal links.
- Scope tag validation (see [scope.md](scope.md)) flags untagged
  `.claude/` files.

Any write that bypasses Claude Code bypasses these checks too — which
is exactly what this rule is designed to prevent.

## Backlinks
<!-- backrefs:start -->
- [AGENTS](../../AGENTS.md)
- [0001-example-adr](../../wiki/decisions/0001-example-adr.md)
- [example-playbook](../../wiki/playbooks/example-playbook.md)
<!-- backrefs:end -->
