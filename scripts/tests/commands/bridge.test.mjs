// scope: framework
// Tests for scripts/commands/bridge.mjs
//
// We test the pure helpers (hasOpenHandoff, classifyGitState,
// mostRecentSessionFile) and the I/O of bridge --out / --handoff against
// a fixture repo we create in /tmp.
//
// We DO NOT test bridge-in's prose output — that's deterministic plumbing
// (read cache → print) and asserting on its exact strings would just lock
// in formatting decisions without catching bugs.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

import {
  hasOpenHandoff,
  mostRecentSessionFile,
  classifyGitState,
} from '../../commands/bridge.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const bridgeScript = path.resolve(__dirname, '..', '..', 'commands', 'bridge.mjs');

// =====================================================================
// Pure helper tests — no fs/git needed.
// =====================================================================

test('hasOpenHandoff: returns false for empty body', () => {
  assert.equal(hasOpenHandoff(''), false);
});

test('hasOpenHandoff: returns true when handoff is the last marker', () => {
  const body = `
## Bridge-out 09:00
some content
## Handoff 14:30
more content
`;
  assert.equal(hasOpenHandoff(body), true);
});

test('hasOpenHandoff: returns false when bridge-out comes after handoff', () => {
  const body = `
## Handoff 10:00
mid-session pause
## Bridge-out 18:30
end of day
`;
  assert.equal(hasOpenHandoff(body), false);
});

test('hasOpenHandoff: returns false when only bridge-out present', () => {
  const body = `## Bridge-out 17:00\nfields here`;
  assert.equal(hasOpenHandoff(body), false);
});

// =====================================================================
// Fixture-based tests — create a temp git repo, drive the script.
// =====================================================================

// Create a fresh empty git repo in a temp directory and return its path.
// We initialize git so classifyGitState has something to read.
async function makeFixtureRepo() {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'kortex-bridge-test-'));
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: dir });
  execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: dir });
  execFileSync('git', ['config', 'user.name', 'Test'], { cwd: dir });
  // One initial commit so HEAD exists.
  await writeFile(path.join(dir, 'README.md'), '# fixture\n');
  execFileSync('git', ['add', '.'], { cwd: dir });
  execFileSync('git', ['commit', '-q', '-m', 'init'], { cwd: dir });
  return dir;
}

test('mostRecentSessionFile: returns null when no sessions exist', async () => {
  const dir = await makeFixtureRepo();
  try {
    const result = await mostRecentSessionFile(dir);
    assert.equal(result, null);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('mostRecentSessionFile: returns the latest by filename date', async () => {
  const dir = await makeFixtureRepo();
  try {
    const sd = path.join(dir, 'output', 'sessions');
    await mkdir(sd, { recursive: true });
    await writeFile(path.join(sd, '2026-04-01.md'), 'a');
    await writeFile(path.join(sd, '2026-04-15.md'), 'b');
    await writeFile(path.join(sd, '2026-04-10.md'), 'c');
    // Ignore non-dated files
    await writeFile(path.join(sd, 'not-a-session.md'), 'd');
    const result = await mostRecentSessionFile(dir);
    assert.equal(result.date, '2026-04-15');
    assert.ok(result.path.endsWith('2026-04-15.md'));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('classifyGitState: clean main', async () => {
  const dir = await makeFixtureRepo();
  try {
    const state = classifyGitState(dir);
    assert.equal(state.kind, 'CLEAN-MAIN');
    assert.equal(state.branch, 'main');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('classifyGitState: feature branch with uncommitted = MID-SAFE-CHANGE', async () => {
  const dir = await makeFixtureRepo();
  try {
    execFileSync('git', ['checkout', '-q', '-b', 'safe-change/foo'], { cwd: dir });
    await writeFile(path.join(dir, 'new.md'), 'hi');
    const state = classifyGitState(dir);
    assert.equal(state.kind, 'MID-SAFE-CHANGE');
    assert.equal(state.branch, 'safe-change/foo');
    assert.match(state.detail, /uncommitted/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('classifyGitState: dirty main = DIRTY-MAIN-OR-OTHER', async () => {
  const dir = await makeFixtureRepo();
  try {
    await writeFile(path.join(dir, 'dirty.md'), 'wip');
    const state = classifyGitState(dir);
    assert.equal(state.kind, 'DIRTY-MAIN-OR-OTHER');
    assert.equal(state.branch, 'main');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

// =====================================================================
// End-to-end: bridge --out writes a session file with the 4-field block
// and respects the 15-line cap (template only — model fills the bodies).
// =====================================================================

test('bridge --out: creates session file with frontmatter and 4-field block', async () => {
  const dir = await makeFixtureRepo();
  try {
    const res = spawnSync(
      'node',
      [bridgeScript, '--out', '--no-commit', '--repo', dir],
      { encoding: 'utf8' },
    );
    assert.equal(res.status, 0, res.stderr);

    // Find the session file (we don't hard-code today since the test
    // runs at whatever date).
    const sessionsDir = path.join(dir, 'output', 'sessions');
    const fs = await import('node:fs/promises');
    const entries = await fs.readdir(sessionsDir);
    const session = entries.find((e) => /^\d{4}-\d{2}-\d{2}\.md$/.test(e));
    assert.ok(session, 'session file was created');

    const body = await readFile(path.join(sessionsDir, session), 'utf8');
    // Frontmatter present
    assert.match(body, /^---\n/);
    assert.match(body, /type: session/);
    // 4-field block present
    assert.match(body, /## Bridge-out \d{2}:\d{2}/);
    assert.match(body, /\*\*STATE:\*\*/);
    assert.match(body, /\*\*DECISIONS:\*\*/);
    assert.match(body, /\*\*NEXT:\*\*/);
    assert.match(body, /\*\*BLOCKERS:\*\*/);

    // log.md updated
    const log = await readFile(path.join(dir, 'log.md'), 'utf8');
    assert.match(log, /session-end/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('bridge --handoff: writes handoff section without committing', async () => {
  const dir = await makeFixtureRepo();
  try {
    const res = spawnSync(
      'node',
      [bridgeScript, '--handoff', '--repo', dir],
      { encoding: 'utf8' },
    );
    assert.equal(res.status, 0, res.stderr);

    const sessionsDir = path.join(dir, 'output', 'sessions');
    const fs = await import('node:fs/promises');
    const entries = await fs.readdir(sessionsDir);
    const session = entries.find((e) => /^\d{4}-\d{2}-\d{2}\.md$/.test(e));
    const body = await readFile(path.join(sessionsDir, session), 'utf8');

    assert.match(body, /## Handoff \d{2}:\d{2}/);
    assert.match(body, /### STATE/);
    assert.match(body, /### CONTEXT/);
    assert.match(body, /### DECISIONS/);
    assert.match(body, /### REJECTED \/ EXPLORED/);
    assert.match(body, /### FILES TOUCHED/);
    assert.match(body, /### OPEN QUESTIONS/);
    assert.match(body, /### NEXT/);
    assert.match(body, /### RESUME PROMPT/);

    // No commit was made — git log only has the initial commit.
    const log = execFileSync('git', ['log', '--oneline'], { cwd: dir, encoding: 'utf8' });
    assert.equal(log.trim().split('\n').length, 1, 'no new commits from --handoff');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('bridge --recovery: writes recovery block + ⚠️ warning', async () => {
  const dir = await makeFixtureRepo();
  try {
    // Add a second commit so the recovery git log has something to show.
    await writeFile(path.join(dir, 'work.md'), 'progress');
    execFileSync('git', ['add', '.'], { cwd: dir });
    execFileSync('git', ['commit', '-q', '-m', 'wip'], { cwd: dir });

    const res = spawnSync(
      'node',
      [bridgeScript, '--recovery', '--repo', dir],
      { encoding: 'utf8' },
    );
    assert.equal(res.status, 0, res.stderr);

    const sessionsDir = path.join(dir, 'output', 'sessions');
    const fs = await import('node:fs/promises');
    const entries = await fs.readdir(sessionsDir);
    const session = entries.find((e) => /^\d{4}-\d{2}-\d{2}\.md$/.test(e));
    const body = await readFile(path.join(sessionsDir, session), 'utf8');

    assert.match(body, /## Recovery —/);
    assert.match(body, /WARNING: Reconstruction from git history/);
    assert.match(body, /Git log since last session/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
