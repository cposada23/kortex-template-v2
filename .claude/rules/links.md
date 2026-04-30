---
scope: framework
---

# Link Rules

## Format

All internal links must use standard relative markdown links:
`[Display Text](relative/path/to/file.md)`

Do NOT use Obsidian wikilinks `[[FILENAME]]` — they only work in Obsidian.
Relative markdown links work in VS Code, Obsidian, GitHub, and Notion.

## When to link: file references in prose MUST be links

When a markdown file mentions another file in prose — narrative text,
bullet points, "see X", "inspired by Y", "promoted to Z" — format it as
a relative markdown link. Never as a bare path. Never as a backticked
path. Unlinked path strings become dead references the moment the file
moves, they leak internal structure into readable prose, and they force
readers to copy-paste paths manually to navigate.

Good: `Promoted to [operational-insights.md](../../wiki/references/operational-insights.md)`
Bad:  ``Promoted to `wiki/references/operational-insights.md` ``
Bad:  `Promoted to wiki/references/operational-insights.md`

Applies to:
- Prose cross-references ("see X.md", "promoted to Y.md", "inspired by Z.md")
- INSIGHTS entries pointing at source files
- Decision pages referencing affected files
- Playbook / AGENTS.md / README narrative mentions of sibling or parent docs

Does NOT apply to:
- Inventory tables that list what's in a folder (bare backticks are fine
  — the table IS the registry, not a cross-reference)
- Frontmatter `related_paths:` (YAML, not prose)
- Code blocks or shell commands showing literal paths
- Append-only logs (JOURNAL.md, log.md) — retroactive fixes would churn
  history; new entries should follow the rule

## When moving or renaming files

After moving or renaming any .md file:
1. Find all files that link TO the moved/renamed file
2. Update every link to use the new relative path
3. Update links INSIDE the moved file if its depth changed

Use grep to find references: `grep -r "FILENAME.md" --include="*.md"`

## When creating new links

- Always use relative paths from the source file's directory
- Always include the .md extension
- Count `../` levels carefully — verify mentally that the path resolves

## Frontmatter cross-references

- Use `related_paths:` for all frontmatter cross-references
- Each entry is a relative path from the source file's directory
- The old `related:` field (Obsidian wikilinks) is deprecated — do not add new ones
- Format as a YAML list:
  ```yaml
  related_paths:
    - ../concepts/strategy/FICHA_NICHO.md
    - ../../tools/HERRAMIENTAS_IA.md
  ```

## Pre-commit validation

The pre-commit hook at `scripts/hooks/validate-links.mjs` validates all
internal links on every commit. If broken links are found, the commit
is blocked with a report. Fix all broken links before committing.

## Backlinks
<!-- backrefs:start -->
- [AGENTS](../../AGENTS.md)
<!-- backrefs:end -->
