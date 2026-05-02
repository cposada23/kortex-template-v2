---
title: "Example Project — TODO"
type: todo
layer: project
language: en
tags: [example-project, todo]
updated: 2026-04-30
status: active
---

# Example Project — TODO

This is the active task list for the example project. Copy this
shape when you start a real project.

---

## Active

- [ ] Replace this example project with your real one
- [ ] Edit AGENTS.md to capture your project's specific rules
- [ ] Decide on subfolder convention (`references/`, `drafts/`,
      etc.) and create them as needed

## Backlog

- [ ] Write a project brief — copy
      [.claude/templates/project-brief.md](../../.claude/templates/project-brief.md)
      into `references/project-brief.md` and fill it in
- [ ] First draft of whatever this project produces
- [ ] First sync of insights from the related learning to `wiki/`

## Done

- [x] Bootstrap project folder structure (came with the template)

---

## How this file is used

`TODO.md` is the day-to-day work list. Items move from Backlog →
Active → Done as you work. Don't delete completed items immediately
— moving them to Done gives `pnpm kortex daily` something to summarize
when it surfaces yesterday's progress.

When the Done section gets too long (every few weeks), prune it
manually. Git retains the history.

For longer-term planning that doesn't belong in day-to-day TODO
shape, write a brief in `references/project-brief.md` instead.

## Backlinks
<!-- backrefs:start -->
- [project-brief](../../.claude/templates/project-brief.md)
- [AGENTS](AGENTS.md)
- [INDEX](INDEX.md)
- [browser-automation-playwright](../../wiki/playbooks/claude-code-workflows/browser-automation-playwright.md)
- [cross-ai-validation](../../wiki/playbooks/cross-ai-validation.md)
<!-- backrefs:end -->

