#!/usr/bin/env node
// scope: framework
//
// Pre-commit hook: validate YAML frontmatter on staged .md files.
//
// What it does:
//   1. Finds staged .md files (added/modified/copied/renamed).
//   2. Skips operational/schema files that don't carry content frontmatter.
//   3. For every remaining file, requires the base set of fields and checks
//      that enum-bound fields (type/layer/language/mirror) hold legal values.
//   4. Hard-blocks the commit if anything fails — exit 1.
//
// Why enum checking is new in v2:
//   v1 only checked field PRESENCE, not value validity. That permitted ~90
//   files in AI_knowledge to drift off-spec (typos, deprecated values) before
//   anyone noticed. Hard-failing on enum mismatches at commit time prevents
//   the same drift from accumulating in v2.
//
// Schema source of truth:
//   The ENUMS object below is the canonical list for v2 until the
//   Schema-canonicalizer wave produces `schema/frontmatter.json`. When that
//   ships, this hook should read enums from JSON instead of hardcoding them.

import path from 'node:path';
import { repoRoot, stagedFiles, resolveFromRoot } from '../lib/git.mjs';
import { parseFile } from '../lib/frontmatter.mjs';
import { colors } from '../lib/colors.mjs';

// Enum-bound fields. A value not in these lists fails the commit.
// Keep these in sync with .claude/rules/frontmatter.md and (eventually)
// schema/frontmatter.json.
const ENUMS = {
  type: [
    'concept', 'reference', 'playbook', 'area', 'project', 'tool',
    'person', 'index', 'inbox', 'idea', 'todo', 'todo-index',
    'adr', 'session',
  ],
  layer: ['source', 'synthesis', 'project', 'schema'],
  language: ['en', 'es', 'en-es'],
  mirror: ['framework', 'personal', 'both'], // NEW v2 — selects sync target
};

// Base required fields. Every indexable .md needs these so /lint, /query,
// and indexing skills have stable metadata to work from.
const REQUIRED_FIELDS = ['title', 'type', 'layer', 'language', 'tags', 'updated'];

// Extra fields required when type is `idea`. These drive the inbox triage
// pipeline: status routes the item, angle distinguishes near-duplicates,
// target_channel decides which project ingests it.
const IDEA_REQUIRED = ['status', 'angle', 'target_channel'];

// Filenames exempt from frontmatter (operational/schema files, not content).
const SKIP_FILENAMES = new Set([
  'CLAUDE.md', 'AGENTS.md', 'README.md', 'INBOX.md', 'log.md', 'index.md',
]);

// Path-prefix exemptions. Anything under .claude/{rules,hooks,commands,skills,templates}/
// carries operational metadata (just `scope:`), not the full content schema.
// Matching is done with `pathContains` because a project nested deep can
// still have its own .claude/.
const SKIP_PATH_FRAGMENTS = [
  '/.claude/rules/',
  '/.claude/hooks/',
  '/.claude/commands/',
  '/.claude/skills/',
  '/.claude/templates/',
];

// True if the path contains any exempt fragment. Prepending '/' makes the
// check work for both "relative" inputs (".claude/rules/foo.md") and absolute
// ones ("/.../.claude/rules/foo.md") without writing two branches.
function pathContains(p, fragments) {
  const normalized = '/' + p.replace(/\\/g, '/').replace(/^\/+/, '');
  return fragments.some((frag) => normalized.includes(frag));
}

// True if this file is exempt from frontmatter validation.
function isExempt(relPath) {
  const filename = path.basename(relPath);
  if (SKIP_FILENAMES.has(filename)) return true;
  if (pathContains(relPath, SKIP_PATH_FRAGMENTS)) return true;
  return false;
}

// Validate one file. Returns an array of error strings (empty = pass).
// Errors are returned (not printed) so the caller can group output and exit
// once at the end with a clean summary.
export function validateFile(absPath, relPath) {
  const errors = [];
  let parsed;
  try {
    parsed = parseFile(absPath);
  } catch (e) {
    return [`could not read file: ${e.message}`];
  }

  // Surface YAML parse errors immediately — the rest of the checks would
  // produce confusing cascading errors against an empty `data`.
  if (parsed.parseError) {
    errors.push(`malformed YAML frontmatter: ${parsed.parseError}`);
    return errors;
  }

  if (!parsed.hasFrontmatter) {
    errors.push('missing frontmatter block (file must start with ---)');
    return errors;
  }

  const { data } = parsed;

  // Required fields — missing values count as missing.
  // We treat empty string and null as "missing" so a stub like `title:` isn't
  // accepted as filled-in.
  for (const f of REQUIRED_FIELDS) {
    if (data[f] === undefined || data[f] === null || data[f] === '') {
      errors.push(`missing required field: ${f}`);
    }
  }

  // Idea-type extras. Only enforced when `type: idea` because the extra
  // fields don't make sense on other content types.
  if (data.type === 'idea') {
    for (const f of IDEA_REQUIRED) {
      if (data[f] === undefined || data[f] === null || data[f] === '') {
        errors.push(`type: idea requires field: ${f}`);
      }
    }
  }

  // Enum checks. We only enum-check fields that ARE present — a missing field
  // is already an error above; double-reporting it as an enum failure would
  // be noise.
  for (const [field, allowed] of Object.entries(ENUMS)) {
    if (data[field] === undefined || data[field] === null) continue;
    if (!allowed.includes(data[field])) {
      errors.push(
        `invalid value for ${field}: "${data[field]}" — allowed: ${allowed.join(', ')}`
      );
    }
  }

  // tags must be a non-empty list. YAML parses `tags: [a, b]` to an array;
  // a string `tags: foo` will still pass the "missing" check above but fail
  // here, which is what we want — tags are how /query finds things.
  if (data.tags !== undefined && !Array.isArray(data.tags)) {
    errors.push(`tags must be a YAML list, got: ${typeof data.tags}`);
  } else if (Array.isArray(data.tags) && data.tags.length === 0) {
    errors.push('tags list is empty — at least one tag required');
  }

  return errors;
}

// Entrypoint when run as a hook — collects staged files, runs validateFile
// on each, prints a summary, exits with the right code.
async function main() {
  const root = repoRoot();
  const staged = stagedFiles('.md');
  if (staged.length === 0) {
    // Nothing to validate — fast pass. Quiet output: hooks should be silent
    // on the happy path so commit messages aren't drowned in noise.
    process.exit(0);
  }

  const failures = [];
  for (const rel of staged) {
    if (isExempt(rel)) continue;
    const abs = path.join(root, rel);
    const errors = validateFile(abs, rel);
    if (errors.length > 0) failures.push({ file: rel, errors });
  }

  if (failures.length === 0) {
    process.exit(0);
  }

  // Pretty-printed summary so the user can scan failures fast.
  console.error(colors.red(colors.bold('\nFRONTMATTER VALIDATION FAILED')));
  for (const { file, errors } of failures) {
    console.error('  ' + colors.cyan(file));
    for (const err of errors) {
      console.error('    ' + colors.gray('-') + ' ' + err);
    }
  }
  console.error(
    colors.gray(
      `\n  ${failures.length} file(s) failed. Fix frontmatter, then re-stage and commit.\n`
    )
  );
  process.exit(1);
}

// Only run main when invoked as a CLI — keeps validateFile importable from
// tests without triggering the hook.
const isDirectInvocation =
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith('validate-frontmatter.mjs');

if (isDirectInvocation) {
  main().catch((e) => {
    console.error(colors.red('validate-frontmatter crashed:'), e);
    process.exit(1);
  });
}

// Re-export ENUMS so tests can reference the same source-of-truth.
export { ENUMS, REQUIRED_FIELDS, IDEA_REQUIRED, isExempt };
