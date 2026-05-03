# schema/

Single source of truth for Kortex v2 frontmatter validation.

## Files

- **[`frontmatter.json`](frontmatter.json)** — JSON Schema (Draft-07).
  Consumed by `scripts/hooks/validate-frontmatter.mjs`. Defines the
  required and optional fields, their enums, and the conditional rules
  (e.g. `type: idea` requires extra fields).
- **[`types.md`](types.md)** — Human-readable reference for the
  `type:` enum. One section per value with description, when-to-use,
  and example path.
- **`README.md`** — this file.

The two artifacts (`frontmatter.json` and `types.md`) describe the
same schema from two angles: machine-validated and
human-internalized. They are kept in lockstep.

## Why one schema folder

v1 (the AI_knowledge repo) split this content across three places:

1. `.claude/rules/frontmatter.md` (general schema, ~91 LOC)
2. `.claude/rules/idea-frontmatter.md` (narrower for ideas, ~119 LOC)
3. Schema sections embedded in the root `CLAUDE.md`

That triplication caused real drift — fields got added in one file
and not the others, the `idea` type's required-field list disagreed
between sources, and the validator hook had to re-derive what was
already documented in prose. v2 consolidates all three into
`frontmatter.json` (machine-readable) + `types.md` (human-readable).
v1's `.md` rule files are obsolete; the validator now reads JSON
Schema directly.

## Bumping the schema

Schema changes are breaking by default — every user's existing files
get re-validated against the new shape. Bump procedure:

1. **Edit `frontmatter.json`.** Add/remove fields, tighten enums,
   adjust patterns.
2. **Update `types.md`** if the change touches the `type:` enum.
   The two files must agree on the enum list and ordering.
3. **Run the health check:**

   ```bash
   pnpm kortex health
   ```

   The lint command flags every file that violates the new schema.
4. **Open an ADR** in `wiki/decisions/` documenting the change —
   what was added/removed/tightened, what the migration looks like
   for existing files, and why now.

For non-breaking additions (new optional field with a sensible
default), step 4 (the ADR) is recommended but not required. For
anything that changes a required field, an enum value, or a pattern,
the ADR is required.

## Migration notes — v1 → v2

What changed between v1 and v2:

- **`layer:` enum.** v1 was string-typed and frequently held values
  like `wiki`, `source`, or whatever. v2 fixes the enum to four
  values: `source`, `synthesis`, `project`, `schema`.
- **`capa/*` tags removed.** v1 required tags like
  `capa/1-fuente`, `capa/2-wiki`, `capa/3-proyecto`. v2 drops this
  convention entirely — `layer:` already encodes the same
  information, so the duplication was wasteful drift surface.
- **`type: adr` added.** v1 wrote ADRs as `type: reference` under
  `wiki/decisions/`. v2 promotes them to a first-class type.
- **`type: session` added.** v1 wrote daily session files as
  `type: reference` under `output/sessions/`. v2 promotes them too.
- **`mirror:` field added.** New v2 field controlling sync to the
  public template repo. Replaces the draft `visibility:` field that
  briefly existed during v2 design — the rename happened because
  `mirror` better names what the field actually does (it controls
  the mirror operation), and `visibility` was overloaded with
  Git-host meanings.
- **Conditional schema for `type: idea`.** v1 documented idea-specific
  fields in a separate `.md` file and relied on social enforcement.
  v2 encodes the conditional in JSON Schema's `if/then`, so the
  validator hook fails fast when an idea is missing `angle` or
  `target_channel`.

What did NOT change:

- The base required fields: `title`, `type`, `layer`, `language`,
  `tags`, `updated`.
- The `language:` enum: `en | es | en-es`.
- All optional fields from v1: `status`, `distillation_level`,
  `confidence`, `source_count`, `last_verified`, `supersedes`,
  `superseded_by`, `related_paths`, `course`, `step`, `project`.
- Idea-specific fields and their semantics: `angle`,
  `target_channel`, `why_it_works`, `created_in`, `created_date`,
  `round`, `score_initial`, `surface`, `plan`, `prompt_version`.

## Relationship to other parts of v2

- The validator hook at `scripts/hooks/validate-frontmatter.mjs`
  loads `frontmatter.json` and validates every staged `.md` file
  against it on commit.
- The lint command (`pnpm kortex health`) loads the same schema and
  reports violations across the whole repo (not just staged changes).
- The `scripts/lib/frontmatter.mjs` helper exposes parse/validate
  utilities that other commands compose with — e.g. `/ingest` reads
  inbox files via this helper before deciding routing.
- `AGENTS.md` and the `.claude/rules/` files reference this folder
  as the authoritative schema location. They describe the schema in
  prose; this folder defines it.

If you need to add a field, this folder is where the change starts.

## Backlinks
<!-- backrefs:start -->
- [types](types.md)
<!-- backrefs:end -->

