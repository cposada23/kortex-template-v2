---
scope: framework
---

# Scope Tagging for `.claude/` Files

Every file under `.claude/` declares a scope that decides whether it
mirrors to the public template repo via `pnpm kortex sync-to-template`.

This rule is the **contract between your private Kortex instance and the
public template**. It is what lets you keep project-specific commands,
hooks, and templates in your repo without leaking them into the
framework everyone else clones.

## Values

- `framework` — portable; mirrors to the public template
- `project:<name>` — bound to one project in this repo; never mirrors
- `personal` — your private overrides; never mirrors

`personal` is the default when scope is omitted. Be explicit anyway —
implicit defaults drift over time.

## Relationship to the `mirror:` frontmatter field

`scope:` (in `.claude/`) and `mirror:` (in content frontmatter) answer
the same question for different file classes:

| File class | Field name | Where it lives |
|---|---|---|
| `.claude/` framework artifacts (commands, skills, hooks, rules, templates) | `scope:` | minimal frontmatter |
| Wiki / project / learning content (`.md`) | `mirror:` | full frontmatter |

Both feed the same `sync-to-template` selector:

- `scope: framework` ↔ `mirror: framework` — copies into the public template
- `scope: project:<name>` or `scope: personal` ↔ `mirror: personal` — stays private
- `mirror: both` (content only) — copies AND keeps in personal repo

If you maintain a fork of the template that ships your own conventions,
you bump pages from `personal` to `both` so they propagate downstream
the next sync.

## How to declare

### `.md` files (`commands/`, `skills/`, `rules/`)

Minimal YAML frontmatter at the top:

```yaml
---
scope: framework
---
```

Or for project-scoped files:

```yaml
---
scope: project:example-project
---
```

The frontmatter validator hook (`scripts/hooks/validate-frontmatter.mjs`)
exempts `.claude/commands/`, `.claude/skills/`, `.claude/rules/`, and
`.claude/templates/` from the full content schema — `scope:` is the only
required field on those files. If you add title/tags/etc. for human
readability, the hook will not complain.

### `.mjs` / `.py` / `.sh` files (`hooks/`, ad-hoc scripts under `.claude/`)

Top-of-file comment (after the shebang if present):

```js
#!/usr/bin/env node
// scope: framework
```

```python
#!/usr/bin/env python3
# scope: framework
```

The convention is comment-based for code files because YAML frontmatter
in code requires per-language parsing tricks; a comment string scan is
universal.

### `templates/` files

No declaration needed. Templates are framework-scoped by convention —
their body frontmatter is intentionally the frontmatter of the *new
file* being created from the template, not metadata about the template
itself. Tagging the template with `scope:` would leak that tag into
every new page. Path is the scope marker instead.

A project-specific template is a sign you should put the template
inside that project's folder, not in `.claude/templates/`.

### Settings files

`settings.json` and `settings.local.json` are out of scope for this
system — they belong to the Claude Code CLI runtime, not the framework
mirror. They are gitignored anyway.

## When creating a new file under `.claude/`

1. Decide its scope:
   - Does it reference a specific project folder or data? → `project:<name>`
   - Does it encode a personal habit only you use? → `personal`
   - Does it encode a general workflow, validator, or skill reusable
     across projects? → `framework`
2. Add the scope declaration per format above.
3. Run `pnpm kortex sync-to-template --dry-run` to confirm the file is
   classified the way you expect before mirroring for real.

## Why explicit scope tagging

Without it, the old wildcard sync (`sync_triggers: .claude/commands/*`)
would mirror project-specific files (e.g. a command that only makes
sense inside one project) into the public template. The band-aid was
manual exclusion per commit. Scope tagging replaces the band-aid with
metadata that survives moves and scales to any number of
project-specific artifacts.

It also protects you against a more annoying failure mode — discovering
months later that a personal note ended up in the public template
because the sync defaulted to "include everything in `.claude/commands/`".
Default-deny on missing scope is the cheapest fix; this rule formalizes it.

## Backlinks
<!-- backrefs:start -->
- [write-authority](write-authority.md)
- [AGENTS](../../AGENTS.md)
<!-- backrefs:end -->
