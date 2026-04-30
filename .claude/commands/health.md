---
scope: framework
---

# /health

Single-shot wiki health check. Renamed from v1 `/lint` because the v2
implementation reads `.cache/status.json` instead of re-scanning the
filesystem (target: <6K tokens per run vs v1 ~95K).

## How to run

```bash
pnpm kortex health              # default — human output
pnpm kortex health --critical   # exit 1 if any critical finding (CI)
pnpm kortex health --tokens     # also estimate token cost of workflows
pnpm kortex health --json       # machine-readable
```

## Checks

1. **stale_wiki** — pages with `updated:` >60 days AND
   `distillation_level <2`.
2. **broken_links** — delegated to `validate-links.mjs` hook.
3. **sidecar_debt** — binary files without `.meta.md` or folder-README.
4. **idea_bank** — total ideas + age of oldest.
5. **distillation_debt** — count per level 0-4.
6. **agents_symlink** — `CLAUDE.md` must be a symlink to `AGENTS.md`.
7. **log_rotation** — flag if `log.md` >3000 lines.
8. **token_estimate** (with `--tokens`) — rough byte/token cost per
   workflow.

## Severity

Each check produces `ok | warn | critical`. Summary line at the end:
`ok N, warn N, critical N`. With `--critical`, exit 1 if any critical
finding so CI fails the run.

## What the model does

Read the report. Pick 1–3 critical or warn findings to address this
session. Hand each to `/safe-change` for the actual edits. `/health` is
diagnostic, never corrective.
