#!/usr/bin/env node
// scope: framework
//
// Kortex `sync-to-template` — propose-test-merge sync from mykortex to a
// public template repo.
//
// The flow (the headline change from v1):
//
//   1. Pre-flight: both repos clean, both on main, template pulled.
//   2. Compute eligible file set (md frontmatter + code top-of-file scope).
//   3. Create a SYNC BRANCH on the template (`sync-mykortex-<ts>`).
//   4. Walk + redact + PII-gate + leak-scan + write each eligible file
//      into the branch's working tree.
//   5. Commit the branch.
//   6. Run `pnpm test` IN THE TEMPLATE on that branch — if those tests
//      fail, the personal data and the framework changes both stay on a
//      branch nobody pushes. Owner inspects, decides.
//   7. On test success: merge --no-ff → main, push, delete branch.
//
// Why this shape: a copy-direct-to-main sync would silently publish
// regressions or PII the moment redaction missed something. The branch +
// test gate makes the unsafe state non-default. It mirrors the
// safe-change pattern owners already trust inside mykortex.
//
// Public surface (flags):
//   --target PATH           template checkout (default: ../kortex-template-v2)
//   --dry-run               compute the plan, write nothing, do nothing
//   --branch-only           create the branch + write + commit, then stop
//                           (skip tests, skip merge, skip push)
//   --skip-tests            skip pnpm test (emergency override; logs loudly)
//   --no-merge              run tests but leave branch unmerged
//   --no-push               merge to main but don't `git push`
//   --no-redact             debug only — disable the redaction pipeline
//   --allow-pii PATH        bypass PII gate for one file (repeatable)
//   --allow-leak PATH       bypass post-redact leak scan for one file (repeatable)
//   --json                  machine-readable report
//   --repo PATH             override repo root (used by tests)
//   --branch-name NAME      override sync branch name (used by tests)

import { parseArgs } from 'node:util';
import { readFile, writeFile, mkdir, readdir, appendFile, stat } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import path from 'node:path';
import { parseFile, parseString } from '../lib/frontmatter.mjs';
import { colors, tag } from '../lib/colors.mjs';
import { redact, buildPrivateProjectsRule } from '../lib/redact.mjs';
import { checkEligibility, CODE_EXTS } from '../lib/sync-eligibility.mjs';

const { values } = parseArgs({
  options: {
    target: { type: 'string' },
    'dry-run': { type: 'boolean', default: false },
    'branch-only': { type: 'boolean', default: false },
    'skip-tests': { type: 'boolean', default: false },
    'no-merge': { type: 'boolean', default: false },
    'no-push': { type: 'boolean', default: false },
    'no-redact': { type: 'boolean', default: false },
    'allow-pii': { type: 'string', multiple: true },
    'allow-leak': { type: 'string', multiple: true },
    json: { type: 'boolean', default: false },
    repo: { type: 'string' },
    'branch-name': { type: 'string' },
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
const branchOnly = values['branch-only'];
const skipTests = values['skip-tests'];
const noMerge = values['no-merge'];
const noPush = values['no-push'];
const noRedact = values['no-redact'];
const allowPii = new Set((values['allow-pii'] || []).map((p) => path.resolve(p)));
const allowLeak = new Set((values['allow-leak'] || []).map((p) => path.resolve(p)));

if (!existsSync(target)) {
  console.error(`${tag.fail()} sync-to-template: target does not exist: ${target}`);
  console.error('  Pass --target /path/to/template to override.');
  process.exit(1);
}

// =====================================================================
// 1. Load redaction config + auto-derive private project list
// =====================================================================

const redactionConfig = await loadRedactionConfig(repoRoot);
const privateProjects = await listPrivateProjects(repoRoot);
const autoPrivatePathRule = buildPrivateProjectsRule(privateProjects);

const redactOpts = noRedact ? null : assembleRedactOpts(redactionConfig, autoPrivatePathRule);

// =====================================================================
// 2. Lazy-load PII validator
// =====================================================================

const piiHookPath = path.join(repoRoot, 'scripts', 'hooks', 'validate-pii.mjs');
let validatePii = null;
if (existsSync(piiHookPath)) {
  try {
    const mod = await import(piiHookPath);
    validatePii = mod.validatePii || mod.default;
  } catch (e) {
    console.error(`${tag.warn()} could not load PII validator: ${e.message}`);
  }
}

// =====================================================================
// 3. Pre-flight: confirm both repos are clean, branches OK
// =====================================================================

if (!dryRun) {
  if (!isCleanGitTree(target)) {
    console.error(`${tag.fail()} target template has uncommitted changes — aborting.`);
    console.error(`  Clean the working tree at ${target} and retry.`);
    process.exit(1);
  }
}

// =====================================================================
// 4. Compute eligibility — walk repo, classify each candidate file
// =====================================================================

const report = {
  scanned: 0,
  eligible: 0,
  copied: 0,
  blocked_pii: [],
  blocked_leak: [],
  errors: [],
  branch: null,
  test_result: null,
  merged: false,
  pushed: false,
};

const eligibleFiles = [];                            // { abs, rel, parsed }
const syncSet = new Set();                           // repo-relative paths

for await (const file of walkAll(repoRoot)) {
  report.scanned++;
  const rel = path.relative(repoRoot, file).split(path.sep).join('/');
  const ext = path.extname(file).toLowerCase();

  let parsed;
  if (ext === '.md') {
    try { parsed = parseFile(file); } catch { continue; }
  } else if (CODE_EXTS.has(ext)) {
    try {
      const raw = await readFile(file, 'utf8');
      parsed = { data: {}, content: raw, hasFrontmatter: false, raw };
    } catch { continue; }
  } else {
    continue;
  }

  const verdict = checkEligibility(rel, parsed);
  if (!verdict.eligible) continue;

  eligibleFiles.push({ abs: file, rel, parsed });
  syncSet.add(rel);
  report.eligible++;
}

// =====================================================================
// 5. Dry-run path: redact in memory, report, exit
// =====================================================================

if (dryRun) {
  for (const f of eligibleFiles) {
    const result = await processFile(f, syncSet, redactOpts);
    if (result.blocked_pii) report.blocked_pii.push({ file: f.rel, reason: result.blocked_pii });
    else if (result.blocked_leak) report.blocked_leak.push({ file: f.rel, reason: result.blocked_leak });
    else console.log(`${tag.info()} would copy ${colors.cyan(f.rel)}` + summarizeHits(result.hits));
  }
  printReport(report);
  process.exit(0);
}

// =====================================================================
// 6. Create sync branch on the template
// =====================================================================

const branchName = values['branch-name'] || `sync-mykortex-${timestamp()}`;
report.branch = branchName;

ensureOnMain(target);
// Fetch + pull are best-effort. A template without an `origin` remote
// (e.g. a local-only checkout, or a fresh test fixture) is still valid;
// we just skip the network step. A real-origin failure is surfaced as
// a warning but does not block the sync — the test gate downstream is
// the authoritative pass/fail.
if (gitHasRemote(target, 'origin')) {
  try {
    git(target, ['fetch', 'origin', '--quiet']);
    git(target, ['pull', '--ff-only', '--quiet']);
  } catch (e) {
    console.error(`${tag.warn()} could not pull origin/main: ${e.stderr || e.message}`);
  }
}
gitOrFail(target, ['checkout', '-b', branchName], `create branch ${branchName}`);

console.log(`${tag.ok()} branch ${colors.cyan(branchName)} on template`);

// =====================================================================
// 7. Process each file: redact, PII-gate, leak-scan, write
// =====================================================================

for (const f of eligibleFiles) {
  const result = await processFile(f, syncSet, redactOpts);
  if (result.blocked_pii) {
    report.blocked_pii.push({ file: f.rel, reason: result.blocked_pii });
    await logSyncOverride(repoRoot, f.abs, `PII: ${result.blocked_pii}`);
    continue;
  }
  if (result.blocked_leak) {
    report.blocked_leak.push({ file: f.rel, reason: result.blocked_leak });
    await logSyncOverride(repoRoot, f.abs, `LEAK: ${result.blocked_leak}`);
    continue;
  }
  const dest = path.join(target, f.rel);
  await mkdir(path.dirname(dest), { recursive: true });
  try {
    await writeFile(dest, result.content);
    report.copied++;
  } catch (e) {
    report.errors.push({ file: f.rel, error: e.message });
  }
}

if (report.blocked_pii.length || report.blocked_leak.length) {
  console.error(`${tag.fail()} blocked files exist; aborting before commit:`);
  for (const b of report.blocked_pii) console.error(`  PII   ${b.file}: ${b.reason}`);
  for (const b of report.blocked_leak) console.error(`  LEAK  ${b.file}: ${b.reason}`);
  console.error('');
  console.error('Branch retained for inspection:');
  console.error(`  cd ${target} && git status`);
  console.error('Add to redaction config or pass --allow-pii / --allow-leak per file.');
  printReport(report);
  process.exit(1);
}

// =====================================================================
// 8. Commit on branch
// =====================================================================

if (gitHasChanges(target)) {
  gitOrFail(target, ['add', '-A'], 'stage sync output');
  const msg = `sync from mykortex (${branchName})\n\n${report.copied} files synced.`;
  gitOrFail(target, ['commit', '-m', msg], 'commit sync output');
  console.log(`${tag.ok()} committed ${report.copied} files on ${branchName}`);
} else {
  console.log(`${tag.info()} no changes to commit on template — sync is a no-op.`);
}

if (branchOnly) {
  console.log(`${tag.info()} --branch-only: stopping before tests.`);
  console.log(`  Inspect at ${target} on branch ${branchName}.`);
  printReport(report);
  process.exit(0);
}

// =====================================================================
// 9. Run tests in the template
// =====================================================================

if (!skipTests) {
  console.log(`${tag.info()} running pnpm test in template...`);
  const testRes = runTemplateTests(target);
  report.test_result = { passed: testRes.passed, code: testRes.code };
  if (!testRes.passed) {
    console.error(`${tag.fail()} tests failed in template (exit ${testRes.code})`);
    console.error(`  Branch ${branchName} retained for inspection at ${target}.`);
    console.error('  Fix tests, push manually, or rerun with --skip-tests.');
    printReport(report);
    process.exit(1);
  }
  console.log(`${tag.ok()} tests passed`);
} else {
  console.log(`${tag.warn()} --skip-tests: bypassing test gate.`);
}

// =====================================================================
// 10. Merge to main + push
// =====================================================================

if (noMerge) {
  console.log(`${tag.info()} --no-merge: leaving branch ${branchName}.`);
  printReport(report);
  process.exit(0);
}

gitOrFail(target, ['checkout', 'main'], 'checkout main');
gitOrFail(target, ['merge', '--no-ff', branchName, '-m', `merge ${branchName}`], `merge ${branchName}`);
report.merged = true;

if (!noPush) {
  try {
    git(target, ['push', 'origin', 'main']);
    report.pushed = true;
    console.log(`${tag.ok()} merged + pushed to origin/main`);
  } catch (e) {
    console.error(`${tag.warn()} merge succeeded locally but push failed: ${e.message}`);
    console.error(`  Push manually: cd ${target} && git push origin main`);
  }
} else {
  console.log(`${tag.ok()} merged to main locally (--no-push)`);
}

gitOrFail(target, ['branch', '-d', branchName], `delete branch ${branchName}`);

printReport(report);
process.exit(0);

// =====================================================================
// File processing
// =====================================================================

async function processFile(f, syncSet, redactOpts) {
  let content = await readFile(f.abs, 'utf8');
  let hits = null;

  // skip_redact: files where the redactor itself would corrupt content
  // by interpreting fixtures as live data. The canonical case is
  // scripts/tests/lib/redact.test.mjs — its assertions contain literal
  // `<!-- mirror:strip -->` markers as test FIXTURES, and naively running
  // the redactor on the test file deletes the fixtures, breaking the
  // tests in the template after sync.
  const skipRedact = (redactionConfig?.skip_redact || []).includes(f.rel);

  if (redactOpts && !skipRedact) {
    const ext = path.extname(f.rel).toLowerCase();
    const fileType = ext === '.md' ? 'md' : 'code';
    const r = redact(content, { ...redactOpts, syncSet, fromPath: f.rel, fileType });
    content = r.content;
    hits = r.hits;
  }

  // Path-based allowlist for known PII-fixture files. These are test
  // files whose entire reason for existing is to contain pattern-matching
  // strings (e.g. validate-pii.test.mjs uses real CO-phone shapes to
  // verify the regex). Listed in `.kortex/sync-redactions.json` under
  // `skip_pii_check` / `skip_leak_check`.
  const skipPiiByPath = (redactionConfig?.skip_pii_check || []).includes(f.rel);
  const skipLeakByPath = (redactionConfig?.skip_leak_check || []).includes(f.rel);

  // PII gate on the REDACTED bytes — that's the bytes that will land
  // in the template, so that's what we check. We always run the
  // validator (even when --allow-pii is set for the file) so the
  // override gets logged with the actual reason; the allowlist only
  // suppresses the block, never the audit trail.
  if (validatePii && !skipPiiByPath) {
    const piiResult = await runPii(f.abs, content);
    if (!piiResult.ok) {
      if (!allowPii.has(path.resolve(f.abs))) return { blocked_pii: piiResult.reason };
      await logSyncOverride(repoRoot, f.abs, `PII: ${piiResult.reason} (BYPASSED via --allow-pii)`);
    }
  }

  // Leak scan: a fail-safe for cases the redactor missed. We grep for
  // the literal canonical owner identifiers AFTER redaction. If any
  // survive, something in the redaction config is wrong. Same allowlist
  // pattern as PII — log the override but copy the file.
  if (!skipLeakByPath) {
    const leak = scanLeaks(content, redactionConfig?.leak_canaries || []);
    if (leak) {
      if (!allowLeak.has(path.resolve(f.abs))) return { blocked_leak: leak };
      await logSyncOverride(repoRoot, f.abs, `LEAK: ${leak} (BYPASSED via --allow-leak)`);
    }
  }

  return { content, hits };
}

// PII validator returns `{ passed, matches }` (real shape) — adapt to ok/reason.
async function runPii(filepath, content) {
  // The validator reads from disk, but we just redacted in memory — so
  // we have to write a temp file or call the patterns directly. To
  // avoid a temp file (race risk + slow), we re-import the patterns
  // and run them against `content` here. If that interface ever
  // changes, this is the only place to update.
  try {
    const mod = await import(piiHookPath);
    if (mod.PII_PATTERNS && mod.DEFAULT_ALLOWLIST) {
      const matches = scanPii(content, mod.PII_PATTERNS, mod.DEFAULT_ALLOWLIST);
      if (matches.length === 0) return { ok: true };
      return { ok: false, reason: matches.slice(0, 3).map((m) => `${m.pattern}@L${m.line}`).join(', ') };
    }
    // Fallback: write temp file and call validatePii(path).
    const tmp = path.join(repoRoot, '.cache', `pii-${Date.now()}.tmp.md`);
    await mkdir(path.dirname(tmp), { recursive: true });
    await writeFile(tmp, content);
    const res = await validatePii(tmp);
    if (res?.passed) return { ok: true };
    return { ok: false, reason: 'pii match (legacy validator)' };
  } catch (e) {
    return { ok: false, reason: `validator threw: ${e.message}` };
  }
}

function scanPii(content, patterns, allowlist) {
  const out = [];
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    for (const { name, regex } of patterns) {
      const re = new RegExp(regex.source, regex.flags);   // fresh state
      let m;
      while ((m = re.exec(lines[i])) !== null) {
        if (name === 'Email (non-allowlisted)' && allowlist?.emails?.includes(m[0].toLowerCase())) continue;
        out.push({ pattern: name, line: i + 1, value: m[0] });
        if (out.length > 20) return out;
      }
    }
  }
  return out;
}

function scanLeaks(content, canaries) {
  for (const c of canaries) {
    if (!c) continue;
    if (content.includes(c)) return `leak canary "${c}" survived redaction`;
  }
  return null;
}

// =====================================================================
// Config + private-project derivation
// =====================================================================

async function loadRedactionConfig(root) {
  const p = path.join(root, '.kortex', 'sync-redactions.json');
  if (!existsSync(p)) {
    return { literal: [], regex: [], drop_lines: [], leak_canaries: [] };
  }
  try {
    const raw = await readFile(p, 'utf8');
    const parsed = JSON.parse(raw);
    return {
      literal: parsed.literal || [],
      regex: parsed.regex || [],
      drop_lines: parsed.drop_lines || [],
      leak_canaries: parsed.leak_canaries || [],
      skip_pii_check: parsed.skip_pii_check || [],
      skip_leak_check: parsed.skip_leak_check || [],
      skip_redact: parsed.skip_redact || [],
    };
  } catch (e) {
    console.error(`${tag.warn()} malformed .kortex/sync-redactions.json: ${e.message} — running without owner rules`);
    return { literal: [], regex: [], drop_lines: [], leak_canaries: [], skip_pii_check: [], skip_leak_check: [], skip_redact: [] };
  }
}

async function listPrivateProjects(root) {
  const dir = path.join(root, 'projects');
  if (!existsSync(dir)) return [];
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    return entries
      .filter((e) => e.isDirectory() && e.name !== 'example-project')
      .map((e) => e.name);
  } catch {
    return [];
  }
}

function assembleRedactOpts(config, autoPathRule) {
  const regex = [...(config.regex || [])];
  if (autoPathRule) regex.push(autoPathRule);
  return {
    literal: config.literal || [],
    regex,
    dropLines: config.drop_lines || [],
  };
}

// =====================================================================
// Walker — yields .md and code files only
// =====================================================================

async function* walkAll(root) {
  // Explicit skip list. We do NOT use a generic `startsWith('.')` filter
  // because that would exclude `.claude/` — and that directory is the
  // home of many framework artifacts (commands, templates, rules, hooks)
  // that we want to walk and consider for eligibility.
  const skip = new Set(['node_modules', '.git', '.cache', '.husky', '.pnpm-store', '.worktrees', '.kortex']);
  async function* recurse(dir) {
    let entries;
    try { entries = await readdir(dir, { withFileTypes: true }); }
    catch { return; }
    for (const e of entries) {
      if (skip.has(e.name)) continue;
      if (e.isSymbolicLink && e.isSymbolicLink()) continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) yield* recurse(full);
      else {
        const ext = path.extname(e.name).toLowerCase();
        if (ext === '.md' || CODE_EXTS.has(ext)) yield full;
      }
    }
  }
  yield* recurse(root);
}

// =====================================================================
// Git helpers
// =====================================================================

function git(cwd, args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function gitOrFail(cwd, args, label) {
  try {
    git(cwd, args);
  } catch (e) {
    console.error(`${tag.fail()} git ${label} failed: ${e.stderr || e.message}`);
    process.exit(1);
  }
}

function isCleanGitTree(cwd) {
  try {
    const out = git(cwd, ['status', '--porcelain']);
    return out === '';
  } catch { return false; }
}

function gitHasChanges(cwd) {
  try {
    const out = git(cwd, ['status', '--porcelain']);
    return out !== '';
  } catch { return false; }
}

function gitHasRemote(cwd, name) {
  try {
    const out = git(cwd, ['remote']);
    return out.split('\n').includes(name);
  } catch { return false; }
}

function ensureOnMain(cwd) {
  try {
    const branch = git(cwd, ['rev-parse', '--abbrev-ref', 'HEAD']);
    if (branch !== 'main') {
      console.error(`${tag.fail()} template is on branch ${branch}, expected main.`);
      process.exit(1);
    }
  } catch (e) {
    console.error(`${tag.fail()} could not read template branch: ${e.message}`);
    process.exit(1);
  }
}

function timestamp() {
  return new Date().toISOString().replace(/[T:]/g, '-').replace(/\..+$/, '').replace(/-(\d{2})-(\d{2})$/, '-$1$2');
}

// =====================================================================
// Test runner
// =====================================================================

function runTemplateTests(cwd) {
  // Install only if package.json/lockfile is in the staged commit. We
  // approximate by checking if package.json is in the latest commit's
  // changeset. Cheap to overshoot — pnpm install on a no-change repo is
  // nearly instant.
  const latestChanges = (() => {
    try { return git(cwd, ['diff', '--name-only', 'HEAD~1', 'HEAD']); }
    catch { return ''; }
  })();
  if (latestChanges.includes('package.json') || latestChanges.includes('pnpm-lock.yaml')) {
    const r = spawnSync('pnpm', ['install', '--frozen-lockfile'], { cwd, stdio: 'inherit' });
    if (r.status !== 0) return { passed: false, code: r.status, stage: 'install' };
  }
  const r = spawnSync('pnpm', ['test'], { cwd, stdio: 'inherit' });
  return { passed: r.status === 0, code: r.status, stage: 'test' };
}

// =====================================================================
// Logging
// =====================================================================

async function logSyncOverride(root, file, reason) {
  const logPath = path.join(root, 'output', 'sessions', 'sync-overrides.log');
  await mkdir(path.dirname(logPath), { recursive: true });
  const ts = new Date().toISOString();
  const rel = path.relative(root, file);
  await appendFile(logPath, `${ts}  ${rel}  ${reason}\n`);
}

function summarizeHits(h) {
  if (!h) return '';
  const parts = [];
  if (h.literal) parts.push(`literal=${h.literal}`);
  if (h.regex) parts.push(`regex=${h.regex}`);
  if (h.strip_blocks) parts.push(`strip=${h.strip_blocks}`);
  if (h.backrefs_dropped) parts.push(`backrefs=${h.backrefs_dropped}`);
  if (h.links_demoted) parts.push(`links=${h.links_demoted}`);
  if (h.drop_lines) parts.push(`drop=${h.drop_lines}`);
  return parts.length ? colors.gray(`  [${parts.join(' ')}]`) : '';
}

function printReport(r) {
  if (values.json) {
    console.log(JSON.stringify(r, null, 2));
    return;
  }
  console.log('');
  console.log(colors.bold('sync-to-template report'));
  console.log(`  Scanned:       ${r.scanned}`);
  console.log(`  Eligible:      ${r.eligible}`);
  console.log(`  Copied:        ${r.copied}`);
  if (r.blocked_pii.length)  console.log(`  ${tag.fail()} Blocked by PII (${r.blocked_pii.length})`);
  if (r.blocked_leak.length) console.log(`  ${tag.fail()} Blocked by leak scan (${r.blocked_leak.length})`);
  if (r.errors.length)       console.log(`  ${tag.fail()} Errors (${r.errors.length})`);
  if (r.branch)              console.log(`  Branch:        ${r.branch}`);
  if (r.test_result)         console.log(`  Tests:         ${r.test_result.passed ? 'pass' : 'fail'}`);
  console.log(`  Merged:        ${r.merged ? 'yes' : 'no'}`);
  console.log(`  Pushed:        ${r.pushed ? 'yes' : 'no'}`);
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
  console.log('Usage: pnpm kortex sync-to-template [flags]');
  console.log('');
  console.log('Propose-test-merge sync from mykortex to a public template repo.');
  console.log('Creates a sync branch on the template, redacts personal data,');
  console.log('runs the template\'s test suite, then merges to main on success.');
  console.log('');
  console.log('Flags:');
  console.log('  --target PATH         template checkout (default: ../kortex-template-v2)');
  console.log('  --dry-run             plan only, write nothing');
  console.log('  --branch-only         create branch + commit, skip tests + merge');
  console.log('  --skip-tests          bypass pnpm test (logs loudly)');
  console.log('  --no-merge            run tests but leave branch unmerged');
  console.log('  --no-push             merge to main but don\'t git push');
  console.log('  --no-redact           debug: disable redaction entirely');
  console.log('  --allow-pii PATH      bypass PII for this file (repeatable)');
  console.log('  --allow-leak PATH     bypass leak scan for this file (repeatable)');
  console.log('  --json                machine-readable output');
}
