---
scope: framework
---

# /sync-to-template

Mirror personal artifacts to the public template repo.

**Use case:** the owner runs this in `mykortex` (their personal Kortex
instance). It does not run in the template (no personal files to mirror).

Files marked `mirror: framework` or `mirror: both` in their frontmatter
are copied to a sibling template checkout. Each file passes through
`validate-pii.mjs` first — failures are logged and skipped.

## How to run

```bash
pnpm kortex sync-to-template                          # default — copies to ../kortex-template-v2
pnpm kortex sync-to-template --target /path/to/template
pnpm kortex sync-to-template --dry-run                # plan only
pnpm kortex sync-to-template --allow-pii wiki/foo.md  # bypass PII gate per-file
pnpm kortex sync-to-template --json                   # machine-readable
```

## Mirror values

| Value | Meaning |
|---|---|
| `mirror: personal` (default) | Skipped entirely. Stays in personal. |
| `mirror: framework` | Copy to template. The template is the source of truth — consider moving the file there to avoid drift. |
| `mirror: both` | Copy to template AND keep in personal. Use when the file legitimately belongs in both. |

## PII gate

Every file is run through `validatePii({ path, body, frontmatter })`
before copy. The validator (Hook-porter writes this) blocks on:
- emails, phone numbers, addresses
- API keys, tokens, .env values
- internal-only project names

Blocked files are listed in the report AND appended to
`output/sessions/sync-overrides.log` so the owner can audit later.

To override per file: `--allow-pii path/to/file.md` (repeatable). The
override is also logged.

## Exit codes

- `0` — clean run, all eligible files copied.
- `1` — at least one file was blocked by PII (and not allow-listed).

## What the model does

Run with `--dry-run` first. Read the plan. Spot files that look
personal-but-tagged-framework (an honest mistake). Either fix the
frontmatter (most common — flip to `mirror: personal`) or proceed with
the real sync.
