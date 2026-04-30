#!/usr/bin/env node
// scope: framework
//
// Kortex `bridge` — session start/end/recovery/handoff in one command.
//
// v1 had four files (bridge.md, bridge-out.md, bridge-recovery.md,
// handoff.md). v2 collapses them to one .mjs + flags. Per audit this
// removes ~86% of the LOC because the four flows shared 80% of their
// scaffolding (read session file, parse handoff sections, append to log,
// classify git state).
//
// Modes:
//   bridge             default — bridge-in (session start)
//   bridge --out       bridge-out (session end; commits + pushes)
//   bridge --handoff   mid-session compaction (no commit, no push)
//   bridge --recovery  reconstruct state when previous session ended cold
//
// Hard rule (PRD §10.2): fidelity > token reduction. The 4-field STATE/
// DECISIONS/NEXT/BLOCKERS shape is a target, not a cap. If the session
// needs more lines to capture context honestly, we add them.
//
// Important: this script is run by Claude Code as a subprocess. The actual
// "extract 4 fields from the conversation" step happens in the model layer
// — this script can NOT see the conversation. So `--out` and `--handoff`
// are templates: they print a marker for Claude to fill in, and write a
// session block that Claude has assembled. The Node side handles plumbing
// (file I/O, git, log.md, status cache) and rejects only the things that
// can be checked mechanically.
//
// We surface every mode through a single entry point so the slash wrapper
// (.claude/commands/bridge.md) stays one-liner thin.

import { parseArgs } from 'node:util';
import { readFile, writeFile, mkdir, readdir, appendFile, stat } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { colors, tag } from '../lib/colors.mjs';

// Standard arg parser. Each mode flag is a boolean and they are mutually
// exclusive (default = bridge-in). The `--repo` flag is escape-hatch for
// tests that need to point at a temporary fixture root.
const { values } = parseArgs({
  options: {
    out: { type: 'boolean', default: false },
    handoff: { type: 'boolean', default: false },
    recovery: { type: 'boolean', default: false },
    repo: { type: 'string' },                                // override repo root (tests)
    'no-commit': { type: 'boolean', default: false },        // --out without git push (tests)
    help: { type: 'boolean', short: 'h', default: false },
  },
  strict: false,
});

if (values.help) {
  printHelp();
  process.exit(0);
}

// Resolve repo root. We prefer the explicit --repo flag (tests pass this);
// otherwise we walk up from cwd looking for the .git directory. This is the
// same strategy git itself uses, and keeps the script usable from
// subdirectories of the repo.
const repoRoot = values.repo ? path.resolve(values.repo) : findRepoRoot(process.cwd());

// Mode dispatch. Exactly one of out/handoff/recovery may be set; everything
// else is bridge-in.
const modeCount = [values.out, values.handoff, values.recovery].filter(Boolean).length;
if (modeCount > 1) {
  console.error('bridge: --out, --handoff, --recovery are mutually exclusive.');
  process.exit(1);
}

try {
  if (values.out) {
    await bridgeOut(repoRoot, { commit: !values['no-commit'] });
  } else if (values.handoff) {
    await bridgeHandoff(repoRoot);
  } else if (values.recovery) {
    await bridgeRecovery(repoRoot);
  } else {
    await bridgeIn(repoRoot);
  }
} catch (err) {
  console.error(`${tag.fail()} ${err.message}`);
  if (process.env.DEBUG) console.error(err.stack);
  process.exit(1);
}

// =====================================================================
// Mode: bridge-in (default — session start ritual)
// =====================================================================

// Per PRD §10.1, bridge-in should be cheap: read a tiny status cache
// (~1 KB) instead of re-reading 14 files. The cache is regenerated
// post-write by hooks. If it's missing we fall back to "warn + still
// orient", because a missing cache is a degraded state, not a fatal one.
async function bridgeIn(root) {
  const today = todayISO();
  console.log(colors.bold(`Kortex bridge-in — ${today}`));
  console.log('');

  // Step 1: Detect open handoff. If the most recent session file has a
  // `## Handoff HH:MM` section without a later `## Bridge-out HH:MM`,
  // an earlier session paused mid-flight. Surface that to Claude so it
  // resumes the open work instead of starting fresh.
  const lastSession = await mostRecentSessionFile(root);
  if (lastSession) {
    const body = await readFile(lastSession.path, 'utf8');
    if (hasOpenHandoff(body)) {
      console.log(`${tag.warn()} Open handoff detected in ${path.relative(root, lastSession.path)}`);
      console.log('  Read that file before continuing — the previous session paused mid-task.');
      console.log('');
    }
  }

  // Step 2: Load .cache/status.json. This is the "what's hot right now"
  // file produced by hooks (see scripts/hooks/regen-status.mjs which the
  // Hook-porter is writing in parallel). Schema: see schema/status.json.
  const cachePath = path.join(root, '.cache', 'status.json');
  let status = null;
  if (existsSync(cachePath)) {
    try {
      status = JSON.parse(await readFile(cachePath, 'utf8'));
    } catch {
      console.log(`${tag.warn()} status.json is malformed — regenerating recommended.`);
    }
  } else {
    console.log(`${tag.warn()} .cache/status.json missing — running degraded bridge-in.`);
    console.log('  Run a write to trigger regen, or `pnpm kortex health` to inspect.');
    console.log('');
  }

  // Step 3: AGENTS.md is always read at bridge-in. It carries owner
  // priorities, language defaults, and Kortex-specific context that the
  // model needs to be useful. Per PRD §10.1 this is ~6 KB — small enough
  // to read every session.
  const agentsPath = path.join(root, 'AGENTS.md');
  const agentsExists = existsSync(agentsPath);

  // Step 4: Surface a structured state object. We print it as a fenced
  // code block so the model can parse it deterministically — no narrative
  // resume (per "fidelity > token reduction" rule, the model decides
  // whether to expand from this seed).
  console.log(colors.cyan('## Bridge state'));
  console.log('```yaml');
  console.log(`date: ${today}`);
  console.log(`repo: ${root}`);
  console.log(`agents_md: ${agentsExists ? 'present' : 'MISSING'}`);
  console.log(`last_session: ${lastSession ? path.relative(root, lastSession.path) : 'none'}`);
  if (status) {
    console.log(`active_priorities:`);
    for (const p of status.priorities ?? []) {
      console.log(`  - ${p}`);
    }
    console.log(`stale_pages: ${status.stale_count ?? 0}`);
    console.log(`open_handoffs: ${status.open_handoffs ?? 0}`);
  }
  console.log('```');
  console.log('');
  console.log('Read AGENTS.md and any open handoff before composing the next move.');
}

// =====================================================================
// Mode: bridge-out (session end — commits + pushes)
// =====================================================================

// Per PRD §10.2, bridge-out caps the session note at ~15 lines (4 fields:
// STATE / DECISIONS / NEXT / BLOCKERS). Fidelity > token reduction — the
// model can expand if 15 lines actively misleads the next session. Our job
// here is plumbing only: open the right session file, write the marker
// block, append to log.md, commit, push.
async function bridgeOut(root, { commit }) {
  const today = todayISO();
  const time = nowHHMM();
  const sessionPath = path.join(root, 'output', 'sessions', `${today}.md`);
  await mkdir(path.dirname(sessionPath), { recursive: true });

  // The session block is always written as a NEW section — never replaces
  // earlier content for the same day. Multiple bridge-outs per day stack.
  // The model fills the four field bodies; we only stamp the wrapper.
  const block = composeBridgeOutBlock({ today, time });

  // If today's session file does not exist, we add frontmatter on top.
  // Existing files just get the block appended.
  if (!existsSync(sessionPath)) {
    const fm = composeSessionFrontmatter(today);
    await writeFile(sessionPath, fm + '\n' + block);
  } else {
    await appendFile(sessionPath, '\n' + block);
  }

  // Append to log.md. We keep this terse — pointer back to the session
  // file is enough; log.md is not the place for full content.
  const logPath = path.join(root, 'log.md');
  const logEntry = `## [${today}] session-end\nSee: output/sessions/${today}.md\n\n`;
  await appendFile(logPath, logEntry);

  console.log(`${tag.ok()} Bridge-out written to output/sessions/${today}.md`);

  // Commit + push. We DO NOT skip these per `feedback_handoff_requires_push.md`
  // — bridge-out is the surface where session work lands on origin. Tests
  // pass --no-commit to opt out.
  if (commit) {
    try {
      execFileSync('git', ['add', '-A'], { cwd: root, stdio: 'pipe' });
      execFileSync(
        'git',
        ['commit', '-m', `bridge-out — ${today} session end`],
        { cwd: root, stdio: 'pipe' },
      );
      execFileSync('git', ['push', 'origin', 'HEAD'], { cwd: root, stdio: 'pipe' });
      console.log(`${tag.ok()} Committed and pushed to origin.`);
    } catch (e) {
      // Common: nothing to commit (clean tree), or push rejected. We surface
      // the message and exit non-zero so the session-close ritual is honest
      // about whether closure made it to origin.
      console.log(`${tag.warn()} Git step failed: ${trimGitErr(e)}`);
      console.log('  Resolve manually before relying on this session being persisted.');
      process.exit(1);
    }
  } else {
    console.log(`${tag.info()} --no-commit set; skipping git add/commit/push.`);
  }

  console.log('See you next session.');
}

// =====================================================================
// Mode: handoff (mid-session compaction — NO commit, NO push)
// =====================================================================

// Handoff is for "I want a clean chat window right now" — the owner
// /clears the conversation and pastes the RESUME PROMPT. Per
// `feedback_handoff_requires_push.md`, /handoff NEVER commits.
// Everything stays in the working tree so the owner sees it in the IDE
// before deciding to commit.
async function bridgeHandoff(root) {
  const today = todayISO();
  const time = nowHHMM();
  const sessionPath = path.join(root, 'output', 'sessions', `${today}.md`);
  await mkdir(path.dirname(sessionPath), { recursive: true });

  // Step 0 (per v1 handoff): detect repo state. We classify into the same
  // three buckets so the model can warn the new chat about MID-SAFE-CHANGE.
  // We surface the classification in a comment inside the handoff block,
  // and Claude expands it into the STATE/RESUME PROMPT prose.
  const gitState = classifyGitState(root);

  const block = composeHandoffBlock({ today, time, gitState });

  if (!existsSync(sessionPath)) {
    const fm = composeSessionFrontmatter(today);
    await writeFile(sessionPath, fm + '\n' + block);
  } else {
    await appendFile(sessionPath, '\n' + block);
  }

  // Append a single line to log.md (uncommitted — owner reviews in IDE).
  const logPath = path.join(root, 'log.md');
  const logEntry = `## [${today}] handoff\nSee: output/sessions/${today}.md\n\n`;
  await appendFile(logPath, logEntry);

  console.log(`${tag.ok()} Handoff section written to output/sessions/${today}.md`);
  console.log(`${tag.info()} Git state: ${gitState.kind}${gitState.detail ? ` — ${gitState.detail}` : ''}`);
  console.log(`${tag.info()} Nothing committed. Open the session file in your IDE, copy the RESUME PROMPT, then /clear.`);
}

// =====================================================================
// Mode: recovery (post-crash bridge-in)
// =====================================================================

// Recovery runs when the previous session ended without a bridge-out.
// We reconstruct an APPROXIMATE state from git log + open handoff
// markers, write it to today's session file with a ⚠️ warning, then
// hand off to bridge-in.
async function bridgeRecovery(root) {
  const today = todayISO();
  const last = await mostRecentSessionFile(root);
  const sinceDate = last ? last.date : daysAgo(7); // fall back to a week ago

  // Pull commit log between the last session and now. We use --stat so the
  // model sees what files moved; --format isolates the metadata it needs.
  let log = '';
  try {
    log = execFileSync(
      'git',
      [
        'log',
        '--stat',
        `--since=${sinceDate}`,
        '--until=now',
        '--format=%h %ad %s',
        '--date=short',
      ],
      { cwd: root, encoding: 'utf8' },
    );
  } catch (e) {
    console.log(`${tag.warn()} git log failed: ${trimGitErr(e)}`);
  }

  const sessionPath = path.join(root, 'output', 'sessions', `${today}.md`);
  await mkdir(path.dirname(sessionPath), { recursive: true });

  const block = composeRecoveryBlock({ today, sinceDate, log });
  if (!existsSync(sessionPath)) {
    const fm = composeSessionFrontmatter(today);
    await writeFile(sessionPath, fm + '\n' + block);
  } else {
    await appendFile(sessionPath, '\n' + block);
  }

  console.log(`${tag.ok()} Recovery block written to output/sessions/${today}.md`);
  console.log('Now running bridge-in with the reconstructed state...');
  console.log('');
  await bridgeIn(root);
}

// =====================================================================
// Helpers — pure, testable
// =====================================================================

// True if the body contains a `## Handoff HH:MM` section with no later
// `## Bridge-out HH:MM`. Detection is line-based and order-aware: we walk
// the headers top-to-bottom and track the last marker we saw. Exported
// for tests via the test file's import path.
export function hasOpenHandoff(body) {
  const re = /^## (Handoff|Bridge-out)\b/gim;
  let last = null;
  let m;
  while ((m = re.exec(body)) !== null) {
    last = m[1].toLowerCase();
  }
  return last === 'handoff';
}

// Read output/sessions/ and return the most recent .md file (by filename
// date, which we control). Returns { path, date } or null.
export async function mostRecentSessionFile(root) {
  const dir = path.join(root, 'output', 'sessions');
  if (!existsSync(dir)) return null;
  const entries = await readdir(dir);
  const dated = entries
    .filter((f) => /^\d{4}-\d{2}-\d{2}\.md$/.test(f))
    .sort();
  if (dated.length === 0) return null;
  const latest = dated[dated.length - 1];
  return {
    path: path.join(dir, latest),
    date: latest.replace(/\.md$/, ''),
  };
}

// Classify the git working tree into the three buckets the v1 handoff
// command spelled out. Kept simple — a clean main vs anything else
// distinction is enough for the model to know whether it's safe to
// auto-commit downstream.
export function classifyGitState(root) {
  let branch = '', shortStatus = '', unpushed = '';
  // Quiet stderr — origin/main may not exist on fresh repos and git's
  // "fatal: ambiguous argument" is noise the user doesn't need to see.
  const quiet = { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] };
  try {
    branch = execFileSync('git', ['branch', '--show-current'], quiet).trim();
    shortStatus = execFileSync('git', ['status', '--short'], quiet);
    try {
      unpushed = execFileSync('git', ['log', 'origin/main..HEAD', '--oneline'], quiet);
    } catch {
      // origin/main may not exist (fresh repo); treat as zero unpushed.
    }
  } catch {
    return { kind: 'UNKNOWN', branch: '', detail: 'git unavailable' };
  }

  const dirty = shortStatus.trim().length > 0;
  const onMain = branch === 'main' || branch === 'master';
  const hasUnpushed = unpushed.trim().length > 0;

  if (onMain && !dirty && !hasUnpushed) {
    return { kind: 'CLEAN-MAIN', branch, detail: '' };
  }
  if (!onMain && dirty) {
    return { kind: 'MID-SAFE-CHANGE', branch, detail: `on ${branch} with uncommitted changes` };
  }
  // Catch-all: dirty main, feature branch with everything committed,
  // unpushed commits on main, etc. We surface the specific shape rather
  // than collapsing to a generic label.
  const bits = [];
  if (dirty) bits.push('uncommitted changes');
  if (hasUnpushed) bits.push('unpushed commits');
  if (!onMain) bits.push(`branch ${branch}`);
  return { kind: 'DIRTY-MAIN-OR-OTHER', branch, detail: bits.join(', ') || 'check git status' };
}

// Compose the session-file frontmatter. We use the schema's `session` type
// (added in v2 per Schema-canonicalizer) and the wiki layer because session
// notes are synthesis-adjacent.
function composeSessionFrontmatter(today) {
  return [
    '---',
    `title: "Session — ${today}"`,
    'type: session',
    'layer: synthesis',
    'language: en-es',
    'tags: [session, bridge]',
    `updated: ${today}`,
    'mirror: personal',
    '---',
    '',
  ].join('\n');
}

// The bridge-out block is a TEMPLATE. The model fills the four field
// bodies based on the conversation it just witnessed; this script can't
// see the conversation. We give the model unambiguous markers so its
// edits land in the right place without re-parsing.
function composeBridgeOutBlock({ today, time }) {
  return [
    `## Bridge-out ${time}`,
    '',
    '**STATE:** <one sentence — where things stand right now>',
    '**DECISIONS:**',
    '- <bullet list, max 5>',
    '**NEXT:** <single concrete next action>',
    '**BLOCKERS:** <omit if none>',
    '',
  ].join('\n');
}

// Handoff block — same skeleton, more sections. The model fills these in
// after it generates the handoff. Per the v1 handoff command we include a
// MID-SAFE-CHANGE banner if relevant so the new chat sees it on first read.
function composeHandoffBlock({ today, time, gitState }) {
  const banner =
    gitState.kind === 'MID-SAFE-CHANGE'
      ? `> WARNING: ${gitState.kind} on branch ${gitState.branch}. New chat must NOT commit, merge, or switch branches until owner says YES/NO.\n\n`
      : gitState.kind === 'DIRTY-MAIN-OR-OTHER'
      ? `> NOTE: ${gitState.kind} — ${gitState.detail}.\n\n`
      : '';
  return [
    `## Handoff ${time}`,
    '',
    banner +
      '### STATE\n<git state line + 2-3 lines on where work stands>\n\n' +
      '### CONTEXT\n<2-4 sentences on why this conversation exists>\n\n' +
      '### DECISIONS\n<each: chose A over B because C>\n\n' +
      '### REJECTED / EXPLORED\n<approaches tried + reason; or "None.">\n\n' +
      '### FILES TOUCHED\n<file:line pointers>\n\n' +
      '### OPEN QUESTIONS\n<unresolved items; or "None.">\n\n' +
      '### NEXT\n<1-2 concrete actions>\n\n' +
      '### RESUME PROMPT\n<250-400 word self-contained briefing for the new chat>\n',
  ].join('\n');
}

// Recovery block — git log inline so the model has the raw commits and
// can synthesize the 4 fields without an extra tool call.
function composeRecoveryBlock({ today, sinceDate, log }) {
  return [
    `## Recovery — ${sinceDate} → ${today}`,
    '',
    '> WARNING: Reconstruction from git history, not a real bridge-out. Review before trusting.',
    '',
    `**STATE:** <best-effort, based on commits>`,
    `**DECISIONS:** <implied by commit messages and file changes>`,
    `**NEXT:** <best guess at next action>`,
    `**BLOCKERS:** <items in TODO with no recent commits>`,
    '',
    '### Git log since last session',
    '```',
    log.trim() || '(no commits in window)',
    '```',
    '',
  ].join('\n');
}

// Walk up from `start` looking for a directory with a `.git` folder. This
// is what `git rev-parse --show-toplevel` does, but we avoid the subprocess
// call so bridge-in stays cheap.
function findRepoRoot(start) {
  let dir = path.resolve(start);
  while (dir !== path.dirname(dir)) {
    if (existsSync(path.join(dir, '.git'))) return dir;
    dir = path.dirname(dir);
  }
  // Fallback: cwd. Tests that don't have a .git pass --repo explicitly.
  return path.resolve(start);
}

// Date helpers. ISO format keeps filenames sortable; HH:MM for the
// per-section markers (multiple sessions per day stack chronologically).
function todayISO() {
  return new Date().toISOString().slice(0, 10);
}
function nowHHMM() {
  const d = new Date();
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function pad(n) {
  return String(n).padStart(2, '0');
}
function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

// git error messages dump command lines and stderr; we strip the noise so
// the user sees only the line that matters.
function trimGitErr(e) {
  const msg = (e?.stderr?.toString() || e?.message || '').trim();
  return msg.split('\n').slice(-2).join(' ');
}

function printHelp() {
  console.log('Usage: pnpm kortex bridge [--out | --handoff | --recovery]');
  console.log('');
  console.log('Modes:');
  console.log('  (default)     bridge-in — session start ritual');
  console.log('  --out         bridge-out — session end (commits + pushes)');
  console.log('  --handoff     mid-session compaction (no commit)');
  console.log('  --recovery    reconstruct state when previous session ended cold');
  console.log('');
  console.log('Flags:');
  console.log('  --no-commit   --out only: skip git add/commit/push (used by tests)');
  console.log('  --repo PATH   override repo root detection (used by tests)');
}
