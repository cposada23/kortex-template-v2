---
scope: framework
---

# /sync-to-template

Propose-test-merge sync from your personal Kortex (e.g. `mykortex`) to a
public template repo. Files marked `mirror: framework | both` (for `.md`)
or `// scope: framework` (for `.mjs/.js/.ts/.py/.sh`) are redacted, then
written onto a SYNC BRANCH on the template, the template's own test
suite runs against that branch, and only on test success is the branch
merged + pushed.

This shape mirrors `/safe-change`: nothing reaches `main` of the public
repo unless the gate passes. A redaction miss or a regression stays on
the branch for inspection.

## How to run

```bash
pnpm kortex sync-to-template                    # full flow: branch → write → test → merge → push
pnpm kortex sync-to-template --dry-run          # plan only — print what would change
pnpm kortex sync-to-template --branch-only      # branch + write + commit, then stop
pnpm kortex sync-to-template --no-merge         # run tests but leave branch unmerged
pnpm kortex sync-to-template --no-push          # merge to main locally but don't push
pnpm kortex sync-to-template --skip-tests       # bypass test gate (logs loudly)
pnpm kortex sync-to-template --target /path     # template checkout location
```

## Eligibility — what gets synced

| Path | Field controlling |
|---|---|
| Any `.md` outside `.claude/` | `mirror: framework` or `mirror: both` |
| `.md` inside `.claude/` | `scope: framework` (or `mirror: framework|both` back-compat) |
| `.mjs / .js / .ts / .py / .sh` anywhere | `// scope: framework` (or `# scope: framework`) in the first 30 lines |
| `.claude/templates/*` | always — framework by convention |

`mirror: personal` (default) → file stays in mykortex.

## Redaction pipeline

Before writing each file to the template, the redactor applies, in order:

1. **Strip blocks** — content between `` markers is removed.
2. **Literal substitutions** — e.g. `{{owner_name}}` → `{{owner_name}}`.
3. **Regex substitutions** — context-specific field replacements (line-anchored,
   multiline by default).
4. **Auto-derived path rule** — `projects/<private-name>/...` becomes
   `projects/example-project/...`. The list of private names is derived
   live from `projects/*/` (anything other than `example-project/`).
5. **Smart backref filter** — bullets in `
## Backlinks
<!-- backrefs:start -->
_No incoming links._
<!-- backrefs:end -->
`
   blocks are dropped if their target is not in the sync set.
6. **Drop-line patterns** — full-line regex matches removed.

Rules live in `.kortex/sync-redactions.json` (gitignored, owner-specific).
Bootstrap from `.kortex/sync-redactions.example.json`.

## Gates that can block a file

| Gate | What it checks |
|---|---|
| **PII** | Post-redaction bytes against `validate-pii.mjs` patterns + allowlist |
| **Leak canary** | Post-redaction bytes for literal owner identifiers (`leak_canaries` in config) |
| **Tests** | Template's `pnpm test` against the sync branch |

PII or leak failures abort BEFORE commit. Test failures retain the
branch for inspection. `--allow-pii PATH` and `--allow-leak PATH`
override the file-level gates (each logs to
`output/sessions/sync-overrides.log`).

## What the model does

Default: run with `--dry-run` first, read the plan, spot anomalies
(files where redaction shows zero hits but the path looks personal,
literals not yet covered by config, etc.). Update
`.kortex/sync-redactions.json` if needed. Then run the real sync.

Tests fail? The branch stays. Diagnose either in the template or in
mykortex (most likely the framework code change broke something on the
example fixtures); fix in mykortex; re-run sync. The old branch can be
deleted once the new one merges.

## Exit codes

- `0` — clean run; or dry-run; or `--branch-only` succeeded.
- `1` — a gate blocked (PII, leak, or test). Branch retained.
