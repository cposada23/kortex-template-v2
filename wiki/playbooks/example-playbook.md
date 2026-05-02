---
title: "Capture an idea to inbox"
type: playbook
layer: synthesis
language: en
tags: [inbox, capture, workflow]
updated: 2026-04-30
distillation_level: 3
related_paths:
  - ../concepts/example-concept.md
---

# Capture an idea to inbox

**When:** an idea or observation worth keeping crosses your mind
and you don't want to lose it. The friction-free capture path —
takes under a minute. Triage happens later, in a batch, via
`pnpm kortex ingest`.

**Outcome:** a markdown file in `inbox/` with valid frontmatter,
ready to be routed to its destination on the next ingest pass.

---

## Steps

### 1. Pick the right inbox

There are three:

- **`inbox/`** (root) — cross-project ideas, ideas not yet tied to
  any specific destination, anything you'll route by
  `target_channel` later.
- **`projects/<name>/inbox/`** — ideas you already know belong to a
  specific project.
- **`learnings/<name>/inbox/`** — captures tied to a specific course
  or book.

When in doubt, drop into root `inbox/` with `target_channel:
cross-project` and triage at ingest time.

### 2. Create the file

Filename is `<slug>.md` — lowercase, hyphenated, no dates. The
`updated` field in frontmatter is the chronological source of truth,
not the filename.

```bash
touch inbox/quick-capture-from-meeting.md
```

### 3. Write the frontmatter

For a generic idea:

```yaml
---
title: "Quick capture from meeting"
type: idea
layer: project
language: en
tags: [capture]
updated: 2026-04-30
status: inbox
angle: "the one-sentence reason this idea is distinct"
target_channel: cross-project
---
```

The three idea-specific fields (`status`, `angle`, `target_channel`)
are required by the schema — the validator rejects the commit if
they're missing. Full schema:
[schema/types.md](../../schema/types.md).

### 4. Write the body

One or two paragraphs. The angle in frontmatter is the headline; the
body is the supporting context. Don't try to make it final — the
goal is friction-free capture, not polished output.

### 5. Commit (or wait for batch)

```bash
git add inbox/quick-capture-from-meeting.md
git commit -m "capture: quick-capture-from-meeting"
```

Or skip the commit and let the next `pnpm kortex daily` or
`pnpm kortex ingest` pass batch the captures.

### 6. Triage on the next ingest

When you run `pnpm kortex ingest`, the command reads the
`target_channel` field of every inbox file, moves the file to the
right destination (e.g. `projects/<channel>/ideas/`), and updates
the relevant INDEX.md. The decision of *where* an idea lives is
deferred to ingest time — capture stays friction-free.

### 7. Verify

After ingest, the file should be:

- Out of `inbox/`
- In the destination matched by `target_channel`
- Listed in the destination project's INDEX.md
- With `status:` updated from `inbox` to `reserva`, `regalable`,
  `archivada`, or `in-validation` per the triage decision

---

## Variants

- **Voice capture from phone.** Use the iOS/Android Shortcut that
  pipes to a markdown file in your iCloud / Drive folder, then sync
  to repo. Treat the dictation output as a draft and clean before
  ingest.
- **AI-assisted capture.** External AI surfaces (Claude.ai chat,
  Cowork) may write to `inbox/` directly per the
  [write-authority rule](../../.claude/rules/write-authority.md).
  Schema validation runs on the next commit by Claude Code.

## Failure modes

- **Skipped frontmatter.** Validator blocks the commit. Fix the
  frontmatter, commit again.
- **Wrong `target_channel`.** Ingest routes to the wrong place.
  Move the file manually, fix the field, re-run ingest with no
  args (it's idempotent).
- **Filename collision.** Two captures with the same slug — the
  ingest command appends a numeric suffix and warns you.

## Backlinks
<!-- backrefs:start -->
- [write-authority](../../.claude/rules/write-authority.md)
- [README](../../README.md)
- [types](../../schema/types.md)
- [example-concept](../concepts/example-concept.md)
<!-- backrefs:end -->

