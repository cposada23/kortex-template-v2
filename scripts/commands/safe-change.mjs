#!/usr/bin/env node
//
// Kortex `safe-change` — branched change workflow.
//
// Pattern validated 25× in April 2026 (per audit §9). The flow:
//   1. Verify working tree clean.
//   2. Create branch `safe-change/<slug>`.
//   3. Owner makes changes + tests on that branch.
//   4. Run health check + validators.
//   5. Show PR-style summary.
//   6. On YES: merge, delete branch, push.
//   7. On NO: discard branch, restore main.
//
// In v1 this lived as a markdown command file — Claude executed git
// commands inline. In v2 we move the orchestration into Node so:
//   - Branch naming is deterministic (no "Claude picked a generic name").
//   - The summary step has structured input (file:line counts, not prose).
//   - Tests can drive the workflow against fixture repos.
//
// This script is split into subcommands so each mode can be invoked
// independently:
//   safe-change start <slug>      create branch + announce
//   safe-change status            show what's pending on current branch
//   safe-change merge             after YES — merge, push, delete
//   safe-change discard           after NO — discard, restore main
//
// The slash-command wrapper interleaves these with prompts to the owner.

import { parseArgs } from 'node:util';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { colors, tag } from '../lib/colors.mjs';

const { values, positionals } = parseArgs({
  options: {
    repo: { type: 'string' },
    help: { type: 'boolean', short: 'h', default: false },
  },
  allowPositionals: true,
  strict: false,
});

if (values.help || positionals.length === 0) {
  printHelp();
  process.exit(values.help ? 0 : 1);
}

const repoRoot = values.repo ? path.resolve(values.repo) : findRepoRoot(process.cwd());
const subcmd = positionals[0];
const subargs = positionals.slice(1);

try {
  switch (subcmd) {
    case 'start': await cmdStart(subargs); break;
    case 'status': await cmdStatus(); break;
    case 'merge': await cmdMerge(); break;
    case 'discard': await cmdDiscard(); break;
    default:
      console.error(`safe-change: unknown subcommand "${subcmd}"`);
      printHelp();
      process.exit(1);
  }
} catch (err) {
  console.error(`${tag.fail()} ${err.message}`);
  if (process.env.DEBUG) console.error(err.stack);
  process.exit(1);
}

// =====================================================================
// Subcommands.
// =====================================================================

// `start <slug>` — verify clean, create branch, announce.
async function cmdStart(args) {
  if (args.length === 0) {
    throw new Error('safe-change start requires a slug, e.g. `pnpm kortex safe-change start refactor-bridge`');
  }
  const slug = sanitizeSlug(args.join('-'));
  const branch = `safe-change/${slug}`;

  // Step 1: verify working tree is clean. We refuse to start on a dirty
  // tree because the dirty changes would silently land on the new branch.
  const status = git(['status', '--porcelain']).trim();
  if (status) {
    console.error(`${tag.fail()} Working tree is dirty. Commit or stash before starting safe-change.`);
    console.error(status);
    process.exit(1);
  }

  // Step 2: verify we're on main (or master). Branching from a feature
  // branch bypasses the safety net.
  const current = git(['branch', '--show-current']).trim();
  if (current !== 'main' && current !== 'master') {
    throw new Error(`safe-change must start from main (currently on ${current})`);
  }

  // Step 3: pull main so the new branch is up to date with origin.
  try {
    git(['fetch', 'origin']);
    git(['pull', 'origin', current, '--ff-only']);
  } catch (e) {
    console.log(`${tag.warn()} pull from origin failed: ${trimGitErr(e)}`);
    console.log('  Continuing on local-only main. Resolve before merge.');
  }

  // Step 4: create + checkout the branch.
  git(['checkout', '-b', branch]);

  console.log(`${tag.ok()} Created branch ${colors.cyan(branch)}`);
  console.log('Make your changes, then:');
  console.log(`  pnpm kortex safe-change status   ${colors.gray('# review')}`);
  console.log(`  pnpm kortex safe-change merge    ${colors.gray('# YES — land on main')}`);
  console.log(`  pnpm kortex safe-change discard  ${colors.gray('# NO — throw away')}`);
}

// `status` — show what's pending. Used by the slash wrapper to build the
// "review in your IDE, then YES/NO" prompt.
async function cmdStatus() {
  const branch = git(['branch', '--show-current']).trim();
  if (!branch.startsWith('safe-change/')) {
    throw new Error(`not on a safe-change branch (currently ${branch})`);
  }
  const status = git(['status', '--short']);
  const stat = git(['diff', '--stat', `${defaultBase()}...HEAD`]);

  console.log(colors.bold(`Branch: ${branch}`));
  console.log('');
  console.log(colors.bold('Working tree status:'));
  console.log(status.trim() || '  (clean)');
  console.log('');
  console.log(colors.bold(`Diff vs ${defaultBase()}:`));
  console.log(stat.trim() || '  (no diff yet)');
}

// `merge` — YES path. Stage everything, commit, switch to main, merge,
// push, delete branch. We absorb v1's step-9 (`update-brief` style work)
// here as a no-op stub: real brief regeneration is now handled by hooks
// at write time, so safe-change just needs to leave AGENTS.md priorities
// fresh — which is the owner's call before triggering merge.
async function cmdMerge() {
  const branch = git(['branch', '--show-current']).trim();
  if (!branch.startsWith('safe-change/')) {
    throw new Error(`not on a safe-change branch (currently ${branch})`);
  }
  const base = defaultBase();

  // Stage + commit any pending changes. If there's nothing to commit and
  // the branch already has commits, we skip the commit step. If both are
  // empty we fail loudly — merging a no-op branch is almost certainly a
  // mistake.
  const dirty = git(['status', '--porcelain']).trim();
  const ahead = git(['log', `${base}..HEAD`, '--oneline']).trim();
  if (dirty) {
    git(['add', '-A']);
    git(['commit', '-m', `${branch.replace('safe-change/', 'safe-change: ')}`]);
  } else if (!ahead) {
    throw new Error('branch has no commits ahead of base — nothing to merge');
  }

  // Switch + merge. We use --no-ff so the merge commit shows the safe-
  // change boundary in history. This is by design: history readability
  // beats a slightly cleaner linear log.
  git(['checkout', base]);
  git(['merge', '--no-ff', branch, '-m', `merge ${branch}`]);

  // Push. If push fails (rejected, network), the merge is local-only —
  // we surface that loud and clear so the owner knows to resolve.
  try {
    git(['push', 'origin', base]);
  } catch (e) {
    console.log(`${tag.warn()} push failed: ${trimGitErr(e)}`);
    console.log(`  ${branch} is merged locally on ${base}. Push manually when ready.`);
  }

  // Delete the branch only after everything else succeeded. We use -d
  // (safe delete) which refuses if the branch isn't merged — a safety
  // net we keep even though the merge above should always satisfy it.
  git(['branch', '-d', branch]);

  console.log(`${tag.ok()} Merged ${branch} into ${base} and pushed.`);
  console.log(`${tag.info()} Branch ${branch} deleted.`);
}

// `discard` — NO path. Destructive: switch to main, delete the branch
// with -D (force), report. We DO NOT touch worktree files — if the owner
// had uncommitted changes on the branch, those vanish with the branch.
// That's the explicit point of "NO": the owner reviewed the diff in
// the IDE and chose to abandon.
async function cmdDiscard() {
  const branch = git(['branch', '--show-current']).trim();
  if (!branch.startsWith('safe-change/')) {
    throw new Error(`not on a safe-change branch (currently ${branch})`);
  }
  const base = defaultBase();

  // Stash any uncommitted state out of the way, then switch + force-delete.
  // We DO NOT pop the stash — the owner explicitly said NO.
  const dirty = git(['status', '--porcelain']).trim();
  if (dirty) {
    try {
      git(['stash', 'push', '-u', '-m', `safe-change-discard-${branch}`]);
    } catch {
      // If stashing fails (e.g. nothing to stash because all changes are
      // staged but unmerged), continue — the checkout below will report.
    }
  }
  git(['checkout', base]);
  git(['branch', '-D', branch]);
  console.log(`${tag.ok()} Discarded ${branch}. Back on ${base}.`);
  console.log(`${tag.info()} Any uncommitted state is in the most recent stash entry — \`git stash pop\` to recover.`);
}

// =====================================================================
// Helpers.
// =====================================================================

// Run a git command and return stdout. Throws if git exits non-zero.
function git(args) {
  return execFileSync('git', args, {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

// Pick the default base branch. Prefer main, fall back to master.
function defaultBase() {
  try {
    git(['rev-parse', '--verify', 'main']);
    return 'main';
  } catch {
    return 'master';
  }
}

// Normalize a freeform slug into branch-safe characters.
function sanitizeSlug(s) {
  return String(s)
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60) || 'change';
}

function trimGitErr(e) {
  const msg = (e?.stderr?.toString() || e?.message || '').trim();
  return msg.split('\n').slice(-2).join(' ');
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
  console.log('Usage: pnpm kortex safe-change <subcommand>');
  console.log('');
  console.log('Subcommands:');
  console.log('  start <slug>   verify clean, create branch safe-change/<slug>');
  console.log('  status         show pending changes on current branch');
  console.log('  merge          YES — stage, commit, merge to main, push, delete');
  console.log('  discard        NO — stash, switch to main, force-delete branch');
}
