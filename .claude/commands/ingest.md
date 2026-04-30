---
scope: framework
---

# /ingest

Process every inbox in the repo and route items to their destinations.

## How to run

```bash
pnpm kortex ingest               # process all inboxes
pnpm kortex ingest --dry-run     # plan only — don't move anything
pnpm kortex ingest --inbox inbox/   # restrict to a single inbox
```

## What the script does

For each markdown item in any inbox:

1. **Parse frontmatter.**
2. **Idea routing (`type: idea`):** routes by `target_channel`, NOT by
   inbox path. `inbox/foo.md` with `target_channel: milo-ia` lands in
   `projects/example-project/` regardless of where it was dropped. Sub-folder
   inside the project is picked from `status` (reserva → ideation-bank/
   reserva, in-production → piezas/, etc.). If `target_channel` is
   missing or `cross-project`, the file stays in inbox flagged
   `needs-routing`.
3. **Generic markdown:** routes by inbox location:
   - global / course inbox → `wiki/<section>/` (concepts, playbooks,
     decisions, areas, references — picked from `type:`)
   - project inbox → `projects/<name>/references/`
4. **Updates the destination INDEX.md** with a one-liner entry.
5. **Drops a `.moved` breadcrumb** in `inbox/processed/` so re-scans
   don't re-route the same file.

## What the model does

Usually nothing — `/ingest` is plumbing. The exceptions:

- **needs-routing items:** the model triages each one (decides
  `target_channel`) and edits the frontmatter, then re-runs `/ingest`.
- **errors:** the script prints them at the end. The model inspects and
  resolves (e.g. missing project folder for a `target_channel`).

## Rules

- Do not re-interpret idea frontmatter. The schema is the contract;
  ingest moves files, it doesn't rewrite them.
- INDEX entries are appended to a `## Recently ingested` section.
  Restructuring happens during `/health`, not `/ingest`.
