# Example Project

This is a neutral example project shipped with the Kortex template
to show the expected internal structure.

When you start your own project, replace this folder's contents (or
copy it as a starting point):

```bash
cp -r projects/example-project projects/my-real-project
# Then edit AGENTS.md, README.md, INDEX.md, TODO.md inside the new folder
```

---

## What goes in a project

The expected files at the project root:

- **AGENTS.md** — agent context for this project. Overrides/extends
  the root AGENTS.md.
- **README.md** — this file. Human-readable overview.
- **INDEX.md** — full file map of the project, every `.md` listed.
- **TODO.md** — active tasks and backlog.

Then any subfolders the project needs:

- `references/` — project-specific reference docs (briefs, specs,
  audience research)
- `drafts/` — work-in-progress content
- `inbox/` — captures specific to this project
- `assets/` — binaries with optional `.meta.md` sidecars
- `archive/` — deprecated material that's still useful as context

The structure isn't enforced — it's a starting convention. Adapt
per project.

---

## How a project relates to the rest of Kortex

- **Sources flow in** from `learnings/<course>/INSIGHTS.md` and
  `inbox/` items routed by `target_channel`.
- **Synthesis flows out** to `wiki/`. When something written for
  this project becomes generally reusable knowledge, promote it to a
  wiki concept or playbook.
- **The project ends.** Projects are time-bounded; areas are not.
  When the project is done, archive it: set `status: completed` in
  any briefs, leave the folder in place, and stop accepting new
  work into it. Git remembers everything.

## Backlinks
<!-- backrefs:start -->
- [AGENTS](AGENTS.md)
- [INDEX](INDEX.md)
<!-- backrefs:end -->
