# Kortex

🧠 A personal knowledge graph that compounds with every course you
take, every experiment you run, and every conversation you have with
an AI.

Kortex is a markdown-first, AI-native template for keeping the
knowledge you build over the years in one place — versioned with
git, editable from any tool, readable by any frontier AI model, and
private by default.

---

## What problem does it solve?

- **Your notes are scattered.** Bookmarks, voice memos, Notion
  databases, half-finished docs, screenshots in your camera roll.
  Each tool stops being useful the moment you switch tools. Kortex
  is a single repo of plain `.md` files — nothing is locked to a
  vendor.
- **AI agents lose context across sessions.** Without a shared
  substrate, every conversation starts from zero. Kortex is the
  shared substrate: any agent can read any page, follow links,
  understand the schema, and write back into it through the
  validated commands.
- **Knowledge degrades when you don't process it.** Courses you
  finish but never apply. Books with notes you never re-read. Kortex
  has explicit zones for raw input (`inbox/`, `learnings/`),
  distilled synthesis (`wiki/`), and active execution (`projects/`)
  — moving from one to the next is the work, and the schema makes
  the boundaries visible.

---

## 5-minute quickstart

```bash
git clone https://github.com/<your-username>/your-mykortex
cd your-mykortex
pnpm install
pnpm kortex setup     # interactive — sets owner, channel, language
pnpm kortex daily     # opens today's journal entry
```

That's it. From there:

- Drop ideas into `inbox/`. Run `pnpm kortex ingest` weekly to
  triage them.
- Add a course to `learnings/` when you start one. Promote insights
  to `wiki/` when you finish a module.
- Spin up a project under `projects/` when something has a goal and
  an end date.
- Run `pnpm kortex health` monthly to catch stale pages, broken
  links, and frontmatter drift.

---

## The five zones

```
inbox/      Capture zone     Raw input. Zero friction. AI can write here.
wiki/       Synthesis zone   Distilled atomic pages. Cross-referenced.
projects/   Project zone     Active execution per project.
learnings/  Learning zone    Structured input — courses, books, talks.
output/     Ephemeral zone   Session notes, lint reports, cost logs.
```

The full rules for each zone live in
[AGENTS.md](AGENTS.md) — that file is the operating manual for both
you and any AI agent working in this repo. (`CLAUDE.md` is a symlink
to `AGENTS.md` so both names resolve to the same content.)

---

## Your first playbook

A playbook is a multi-step procedure you've codified — the kind of
thing you'd otherwise re-discover from scratch every six months.
Three steps to write one:

1. **Copy the template.**
   ```bash
   cp .claude/templates/concept.md wiki/playbooks/<your-slug>.md
   ```
   Open the file, change `type: concept` to `type: playbook`, edit
   the title and tags.

2. **Write the procedure.** One step per heading. Include
   commands, file paths, and decision points. Aim for the length
   that lets future-you re-execute the procedure without
   reconstructing context.

3. **Commit.**
   ```bash
   pnpm kortex safe-change "add <slug> playbook"
   ```
   The pre-commit hook validates frontmatter and links. If anything
   is off, it tells you exactly what to fix before the commit goes
   through.

The example at [wiki/playbooks/example-playbook.md](wiki/playbooks/example-playbook.md)
walks through this end-to-end with real content.

---

## Git for non-developers (optional, Chapter 2)

If you've never used git: the commands above (`pnpm kortex
safe-change`, etc.) handle most of the day-to-day work for you.
When you want a visual interface, install
[GitHub Desktop](https://desktop.github.com/) — it shows the same
commits and branches as the CLI but with a UI. Either approach
works; pick the one that doesn't get in the way.

---

## Cheat sheet — when to use which command

| Want to... | Run |
|---|---|
| Open today's journal | `pnpm kortex daily` |
| Triage everything in `inbox/` | `pnpm kortex ingest` |
| Search the knowledge base | `pnpm kortex query "<terms>"` |
| Make a multi-file change safely | `pnpm kortex safe-change "<msg>"` |
| Check repo health | `pnpm kortex health` |
| Resume after a missed session | `pnpm kortex read-last-handoff` |
| Save a session bridge | `pnpm kortex bridge` |
| Mirror your framework changes to the public template | `pnpm kortex sync-to-template` |

Full command docs: [.claude/commands/](.claude/commands/).

---

## Trouble?

- **Pre-commit hook blocks your commit?** Read the message — it lists
  the exact files and rules that failed. Fix them and commit again.
- **A command behaves unexpectedly?** Run `pnpm kortex health` —
  it does a sweep for the most common drift patterns and reports
  what it finds.
- **Something is broken at the schema layer?** Open an issue on the
  template repo. Schema changes are the kind of thing the framework
  needs to fix once for everyone.

---

## License & contributing

MIT. Fork it, customize it, ship your own. The template is the
starting point — your version belongs to you.

If you find a bug in the framework (commands, hooks, schema, the
template scaffold), pull requests are welcome. If you build a new
playbook or workflow on top of the framework that you think others
would benefit from, open an issue describing it before sending a
PR — the goal is to keep the framework small and let individual
playbooks live in personal forks.
