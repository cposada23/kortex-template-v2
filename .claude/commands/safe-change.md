---
scope: framework
---

# /safe-change

Branched change workflow for any non-trivial edit. Pattern validated 25×
in April 2026 (audit §9). The Node script orchestrates git; the model
makes the changes and brokers the YES/NO with the owner.

## How to run

```bash
pnpm kortex safe-change start <slug>      # verify clean, create branch
pnpm kortex safe-change status            # review pending changes
pnpm kortex safe-change merge             # YES — merge to main + push
pnpm kortex safe-change discard           # NO — discard branch
```

## Workflow

1. **Ask the owner** to describe the change in one sentence. Generate
   a kebab-case slug from it.
2. **`pnpm kortex safe-change start <slug>`** — script verifies the
   working tree is clean, the current branch is `main`, pulls origin,
   creates `safe-change/<slug>`, and switches to it.
3. **Make the changes** on this branch. Edit, write, move files. Do
   NOT `git add` or `git commit` yet — the merge subcommand handles
   that.
4. **Run health check + tests** (the model's call when these are
   relevant).
5. **`pnpm kortex safe-change status`** — print the branch name, working
   tree status, and a `--stat` diff vs main. Show this to the owner.
6. **Ask the owner**: "Review the changes in your IDE, then YES (merge)
   or NO (discard)?"
7. **YES → `pnpm kortex safe-change merge`**. The script stages
   everything, commits with `safe-change: <slug>` as the message,
   switches to main, merges with `--no-ff`, pushes, and deletes the
   branch.
8. **NO → `pnpm kortex safe-change discard`**. The script stashes any
   uncommitted state (recoverable with `git stash pop`), switches to
   main, force-deletes the branch.

## Hard rules

- Never branch from a feature branch — always start from `main`.
- Never auto-merge without explicit YES from the owner.
- The merge uses `--no-ff` so safe-change boundaries show in history.
- A failed `git push` after merge surfaces a warning — local merge
  succeeded but origin needs manual push.

## Relationship to /handoff and /bridge-out

- `/handoff` never commits. Use it mid-session to compact context.
- `/bridge-out` commits + pushes session work, but does not branch.
- `/safe-change` is the branched-change ritual for changes that need
  review.
