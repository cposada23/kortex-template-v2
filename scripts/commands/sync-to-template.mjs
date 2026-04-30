#!/usr/bin/env node
// scope: framework
//
// Kortex `sync-to-template` — mirror personal artifacts to the public
// template repo.
//
// IMPORTANT: this command only makes sense in `mykortex` (the owner's
// personal Kortex instance). The template itself ships this script too
// (per scope:framework), but running it inside the template is a no-op
// because the template has no personal files.
//
// What gets mirrored: every file with frontmatter `mirror: framework` or
// `mirror: both`. Files with `mirror: personal` (the default) stay put.
//
// Per PRD §6.3:
//   - mirror: personal  → skip entirely
//   - mirror: framework → copy to template (and warn — that file's source
//                         of truth is the template; consider moving it).
//   - mirror: both      → copy to template, keep in personal.
//
// PII gate (per Hook-porter's validate-pii.mjs):
//   - Each file is run through validatePii BEFORE copy.
//   - Pass → copy.
//   - Fail → skip + log to output/sessions/sync-overrides.log so the owner
//           can decide. The owner can re-run with `--allow-pii <path>` to
//           override per-file.
//
// Flags:
//   --target PATH        path to the template checkout (defaults to ../kortex-template-v2)
//   --dry-run            plan only — don't copy, just print what would
//   --allow-pii PATH     bypass PII check for this specific file
//   --json               machine-readable output

import { parseArgs } from 'node:util';
import { readFile, writeFile, mkdir, copyFile, readdir, appendFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { parseFile } from '../lib/frontmatter.mjs';
import { colors, tag } from '../lib/colors.mjs';

const { values } = parseArgs({
  options: {
    target: { type: 'string' },
    'dry-run': { type: 'boolean', default: false },
    'allow-pii': { type: 'string', multiple: true },
    json: { type: 'boolean', default: false },
    repo: { type: 'string' },
    help: { type: 'boolean', short: 'h', default: false },
  },
  strict: false,
});

if (values.help) {
  printHelp();
  process.exit(0);
}

const repoRoot = values.repo ? path.resolve(values.repo) : findRepoRoot(process.cwd());
const target = values.target
  ? path.resolve(values.target)
  : path.resolve(repoRoot, '..', 'kortex-template-v2');
const dryRun = values['dry-run'];
const allowPiiList = new Set((values['allow-pii'] || []).map((p) => path.resolve(p)));

if (!existsSync(target)) {
  console.error(`sync-to-template: target does not exist: ${target}`);
  console.error('  Pass --target /path/to/template-checkout to override.');
  process.exit(1);
}

// Lazy-load the PII validator. Hook-porter writes scripts/hooks/validate-pii.mjs
// in parallel; if it isn't present yet we surface a clear "deferred" message
// instead of silently skipping the gate.
const piiHookPath = path.join(repoRoot, 'scripts', 'hooks', 'validate-pii.mjs');
let validatePii;
if (existsSync(piiHookPath)) {
  try {
    const mod = await import(piiHookPath);
    validatePii = mod.validatePii || mod.default;
  } catch (e) {
    console.error(`${tag.warn()} could not load PII validator: ${e.message}`);
  }
}
if (!validatePii) {
  // Default to a permissive stub so we still test the copy mechanics, but
  // log loudly. The CI gate will block real syncs without the validator.
  console.error(`${tag.warn()} validate-pii hook not yet present — running in PERMISSIVE mode.`);
  console.error('  Do not use --no-dry-run in this mode without manual review.');
  validatePii = () => ({ ok: true });
}

const report = {
  scanned: 0,
  framework: 0,
  both: 0,
  copied: 0,
  blocked_pii: [],
  errors: [],
};

// Walk the personal repo root for all .md files. We exclude node_modules,
// .git, .cache, .husky — these are framework infra, not content.
const exclude = ['node_modules', '.git', '.cache', '.husky', '.worktrees', '.kortex'];
for await (const file of walkMd(repoRoot, exclude)) {
  report.scanned++;
  const parsed = parseFile(file);
  const fm = parsed.data || {};
  const mirror = fm.mirror;
  if (mirror !== 'framework' && mirror !== 'both') continue;

  if (mirror === 'framework') report.framework++;
  if (mirror === 'both') report.both++;

  // PII check. We pass the file path AND the parsed body so the validator
  // can inspect both (some PII patterns key on filename, others on body).
  const pii = await runPiiCheck(file, parsed);
  if (!pii.ok && !allowPiiList.has(path.resolve(file))) {
    report.blocked_pii.push({ file: path.relative(repoRoot, file), reason: pii.reason });
    await logSyncOverride(repoRoot, file, pii.reason);
    continue;
  }
  if (!pii.ok && allowPiiList.has(path.resolve(file))) {
    await logSyncOverride(repoRoot, file, `${pii.reason} (BYPASSED via --allow-pii)`);
  }

  // Resolve destination path inside the template, preserving repo-relative
  // structure. e.g. wiki/concepts/foo.md → <target>/wiki/concepts/foo.md.
  const rel = path.relative(repoRoot, file);
  const dest = path.join(target, rel);

  if (dryRun) {
    console.log(`${tag.info()} would copy ${rel} -> ${path.relative(target, dest)}`);
    continue;
  }

  await mkdir(path.dirname(dest), { recursive: true });
  try {
    await copyFile(file, dest);
    report.copied++;
  } catch (e) {
    report.errors.push({ file: rel, error: e.message });
  }
}

if (values.json) {
  console.log(JSON.stringify(report, null, 2));
} else {
  printReport(report);
}

if (report.blocked_pii.length > 0 && !dryRun) {
  process.exit(1); // signal to CI that something needs human review
}

// =====================================================================
// PII helper. Wraps validatePii so we always return { ok, reason }.
// =====================================================================

async function runPiiCheck(file, parsed) {
  try {
    const res = await validatePii({ path: file, body: parsed.raw, frontmatter: parsed.data });
    if (res === true || res?.ok === true) return { ok: true };
    if (res === false) return { ok: false, reason: 'validatePii returned false' };
    return { ok: false, reason: res?.reason || 'unknown' };
  } catch (e) {
    return { ok: false, reason: `validator threw: ${e.message}` };
  }
}

// =====================================================================
// Append a single line to output/sessions/sync-overrides.log so the
// owner has a permanent breadcrumb of every file that was blocked or
// allowed-with-override. The log is plain text, append-only.
// =====================================================================

async function logSyncOverride(root, file, reason) {
  const logPath = path.join(root, 'output', 'sessions', 'sync-overrides.log');
  await mkdir(path.dirname(logPath), { recursive: true });
  const ts = new Date().toISOString();
  const rel = path.relative(root, file);
  await appendFile(logPath, `${ts}  ${rel}  ${reason}\n`);
}

// =====================================================================
// Output.
// =====================================================================

function printReport(r) {
  console.log(colors.bold('sync-to-template report'));
  console.log(`  Scanned:        ${r.scanned} .md files`);
  console.log(`  mirror=framework: ${r.framework}`);
  console.log(`  mirror=both:      ${r.both}`);
  console.log(`  Copied:         ${r.copied}`);
  if (dryRun) console.log(`  ${tag.info()} dry-run: nothing was actually copied.`);
  if (r.blocked_pii.length) {
    console.log(`  ${tag.fail()} Blocked by PII (${r.blocked_pii.length}):`);
    for (const b of r.blocked_pii) console.log(`    ${b.file}: ${b.reason}`);
  }
  if (r.errors.length) {
    console.log(`  ${tag.fail()} Errors:`);
    for (const e of r.errors) console.log(`    ${e.file}: ${e.error}`);
  }
}

// =====================================================================
// Walker.
// =====================================================================

async function* walkMd(dir, exclude = []) {
  if (!existsSync(dir)) return;
  const entries = await readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    if (exclude.includes(e.name)) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) yield* walkMd(full, exclude);
    else if (e.name.endsWith('.md')) yield full;
  }
}

function findRepoRoot(start) {
  let dir = path.resolve(start);
  while (dir !== path.dirname(dir)) {
    if (existsSync(path.join(dir, '.git'))) return dir;
    dir = path.dirname(dir);
  }
  return path.resolve(start);
}

function printHelp() {
  console.log('Usage: pnpm kortex sync-to-template [--target PATH] [--dry-run] [--allow-pii PATH]...');
  console.log('');
  console.log('Mirror files marked `mirror: framework | both` from this personal Kortex');
  console.log('to the public template checkout. PII validator must pass per-file.');
  console.log('');
  console.log('Flags:');
  console.log('  --target PATH      template checkout location (default: ../kortex-template-v2)');
  console.log('  --dry-run          plan only; don\'t copy');
  console.log('  --allow-pii PATH   bypass PII check for this file (repeatable)');
  console.log('  --json             machine-readable output');
}
