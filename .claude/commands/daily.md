---
---

# /daily

Create today's journal page at `inbox/journal/YYYY-MM-DD.md`.

The daily note is the on-ramp for capture-zone work. Quick captures,
decisions, next steps — schema-light by design. `/ingest` triages
journal items into `wiki/` or `projects/` later.

## How to run

```bash
pnpm kortex daily              # default Spanish template
pnpm kortex daily --lang en    # English template
```

## Behavior

- **Idempotent.** If today's file already exists, prints the path and
  exits without modifying anything.
- **Never overwrites.** Re-running on the same day is safe at any hour.
- **No editor open.** The script only creates the file — the owner
  opens it in whatever editor they use.

## Template

```markdown
---
title: "Journal YYYY-MM-DD"
type: inbox
layer: source
language: es
tags: [journal, daily]
updated: YYYY-MM-DD
---

# Journal YYYY-MM-DD

## Captures
## Decisions
## Next steps
```

## What the model does

Usually nothing — the owner runs `/daily` and edits in their IDE. The
model may run `/daily` at the start of a session if no journal exists
yet, then start filling captures from the conversation.
