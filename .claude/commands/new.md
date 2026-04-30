---
scope: framework
---

# /new

Interactive scaffolder for a new content page. Asks for type, title,
and any per-type extras, then writes a valid file with frontmatter
and opens it in `$EDITOR`.

## How to run

```bash
pnpm kortex new                                  # interactive
pnpm kortex new --type concept --title "Foo"     # skip prompts
pnpm kortex new --type idea --target-channel milo-ia --title "..."
pnpm kortex new --dry-run --type playbook --title "Bar"   # preview
```

## Supported types

| Type | Destination | Template |
|---|---|---|
| `concept` | `wiki/concepts/<sub>/<slug>.md` | concept.md |
| `area` | `wiki/areas/<slug>.md` | area.md |
| `playbook` | `wiki/playbooks/<slug>.md` | inline |
| `reference` | `wiki/references/<slug>.md` | inline |
| `decision` | `wiki/decisions/<NNNN>-<slug>.md` | inline (auto-numbered ADR) |
| `idea` | `inbox/<slug>.md` | inline (idea schema) |

## Behavior

- **Slugify** — title → lowercase, accent-strip, hyphenated, max 60 chars.
- **Today's date** — `updated:` and (for ideas) `created_date:` set
  to today.
- **No clobber** — fails if the target file already exists.
- **Editor** — opens with `$EDITOR` (or `$VISUAL`); pass `--no-open` to
  skip.
- **Idea routing** — when `type: idea`, asks for `target_channel`
  (defaults to `cross-project` if blank). Routing happens later via
  `pnpm kortex ingest`.

## Flags

```
--type <name>            skip the type prompt
--title <text>           skip the title prompt
--subfolder <s>          for concept type — wiki/concepts/<s>/
--target-channel <c>     for idea type
--no-open                don't open in $EDITOR after creating
--dry-run                print the path + body, write nothing
```
