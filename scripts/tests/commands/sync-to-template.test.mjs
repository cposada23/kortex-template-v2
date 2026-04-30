// scope: framework
// Tests for scripts/commands/sync-to-template.mjs
//
// We exercise four code paths:
//   1. mirror: personal  → file is skipped.
//   2. mirror: framework + PII clean → file is copied.
//   3. mirror: framework + PII fail → file is blocked, logged.
//   4. --allow-pii bypass → file is copied AND override is logged.
//
// The PII validator is shimmed via a temp validate-pii.mjs that
// classifies based on a marker string in the body (so we don't need
// the real Hook-porter implementation present at test time).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const syncScript = path.resolve(__dirname, '..', '..', 'commands', 'sync-to-template.mjs');

// Build a temporary repo + template pair, plus a stubbed PII validator.
// The validator returns { ok: false, reason: 'fixture-pii-marker' } when
// the file body contains the literal "FIXTURE_PII_MARKER", otherwise
// { ok: true }. Tests opt into the failure case by including the marker
// in the body.
async function makePair() {
  const repo = await mkdtemp(path.join(os.tmpdir(), 'kortex-sync-test-repo-'));
  const tpl = await mkdtemp(path.join(os.tmpdir(), 'kortex-sync-test-tpl-'));

  // Init git in repo so findRepoRoot works.
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: repo });
  execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: repo });
  execFileSync('git', ['config', 'user.name', 'Test'], { cwd: repo });

  // Copy the real frontmatter lib into the temp repo so the script's
  // `import('../lib/frontmatter.mjs')` resolves. We mirror the directory
  // structure: scripts/lib/ + scripts/commands/ + scripts/hooks/.
  await mkdir(path.join(repo, 'scripts', 'lib'), { recursive: true });
  await mkdir(path.join(repo, 'scripts', 'commands'), { recursive: true });
  await mkdir(path.join(repo, 'scripts', 'hooks'), { recursive: true });

  // We don't actually copy the lib — we point the script at the real
  // repo via --repo. Cleaner: install a fake validate-pii.mjs in the
  // temp repo and run sync from there with --repo pointing to it.

  // Stub PII validator. Detect the FIXTURE_PII_MARKER string and refuse.
  const piiStub = `
export function validatePii({ body }) {
  if (body && body.includes('FIXTURE_PII_MARKER')) {
    return { ok: false, reason: 'fixture-pii-marker' };
  }
  return { ok: true };
}
`;
  await writeFile(path.join(repo, 'scripts', 'hooks', 'validate-pii.mjs'), piiStub);

  // Symlink the lib directory from the real source so frontmatter parsing
  // works inside the temp repo.
  const realLib = path.resolve(__dirname, '..', '..', 'lib');
  // node:fs symlink would be cleaner but we keep it simple: copy the
  // three files we know about.
  for (const f of ['frontmatter.mjs', 'colors.mjs', 'git.mjs']) {
    const src = path.join(realLib, f);
    if (existsSync(src)) {
      const body = await readFile(src, 'utf8');
      await writeFile(path.join(repo, 'scripts', 'lib', f), body);
    }
  }

  // Bring node_modules in so gray-matter resolves. We install a tiny
  // pseudo-link by copying the real module... actually simpler: most CI
  // already has node_modules at the real repo root. We shell out to the
  // real script directly with --repo overriding the discovered root.

  return { repo, tpl };
}

// =====================================================================
// Test 1: mirror: personal is skipped.
// =====================================================================

test('sync: mirror=personal is skipped', async () => {
  const { repo, tpl } = await makePair();
  try {
    await mkdir(path.join(repo, 'wiki', 'concepts'), { recursive: true });
    await writeFile(
      path.join(repo, 'wiki', 'concepts', 'private.md'),
      `---\ntitle: "Private"\ntype: concept\nlayer: synthesis\nlanguage: en\ntags: []\nupdated: 2026-04-30\nmirror: personal\n---\n\nbody`,
    );
    const res = runSync(repo, tpl, []);
    assert.equal(res.status, 0, res.stderr);
    assert.equal(existsSync(path.join(tpl, 'wiki', 'concepts', 'private.md')), false, 'personal file should not be copied');
  } finally {
    await rm(repo, { recursive: true, force: true });
    await rm(tpl, { recursive: true, force: true });
  }
});

// =====================================================================
// Test 2: mirror: framework with clean body is copied.
// =====================================================================

test('sync: mirror=framework + clean PII = copied', async () => {
  const { repo, tpl } = await makePair();
  try {
    await mkdir(path.join(repo, 'wiki', 'concepts'), { recursive: true });
    await writeFile(
      path.join(repo, 'wiki', 'concepts', 'public.md'),
      `---\ntitle: "Public"\ntype: concept\nlayer: synthesis\nlanguage: en\ntags: []\nupdated: 2026-04-30\nmirror: framework\n---\n\nclean body, no markers`,
    );
    const res = runSync(repo, tpl, []);
    assert.equal(res.status, 0, res.stderr);
    assert.equal(existsSync(path.join(tpl, 'wiki', 'concepts', 'public.md')), true, 'framework file should be copied');
  } finally {
    await rm(repo, { recursive: true, force: true });
    await rm(tpl, { recursive: true, force: true });
  }
});

// =====================================================================
// Test 3: mirror: framework + PII match → blocked, logged, exit 1.
// =====================================================================

test('sync: mirror=framework + PII match = blocked + logged', async () => {
  const { repo, tpl } = await makePair();
  try {
    await mkdir(path.join(repo, 'wiki', 'concepts'), { recursive: true });
    const file = path.join(repo, 'wiki', 'concepts', 'leaks.md');
    await writeFile(
      file,
      `---\ntitle: "Leaks"\ntype: concept\nlayer: synthesis\nlanguage: en\ntags: []\nupdated: 2026-04-30\nmirror: framework\n---\n\nFIXTURE_PII_MARKER inside`,
    );
    const res = runSync(repo, tpl, []);
    assert.equal(res.status, 1, 'PII block should exit 1');
    assert.equal(existsSync(path.join(tpl, 'wiki', 'concepts', 'leaks.md')), false, 'blocked file should not be copied');

    // sync-overrides.log should have an entry mentioning the file.
    const logPath = path.join(repo, 'output', 'sessions', 'sync-overrides.log');
    const log = await readFile(logPath, 'utf8');
    assert.match(log, /leaks\.md/);
    assert.match(log, /fixture-pii-marker/);
  } finally {
    await rm(repo, { recursive: true, force: true });
    await rm(tpl, { recursive: true, force: true });
  }
});

// =====================================================================
// Test 4: --allow-pii flag bypasses block + logs override.
// =====================================================================

test('sync: --allow-pii bypasses block AND logs the override', async () => {
  const { repo, tpl } = await makePair();
  try {
    await mkdir(path.join(repo, 'wiki', 'concepts'), { recursive: true });
    const file = path.join(repo, 'wiki', 'concepts', 'reviewed.md');
    await writeFile(
      file,
      `---\ntitle: "Reviewed"\ntype: concept\nlayer: synthesis\nlanguage: en\ntags: []\nupdated: 2026-04-30\nmirror: framework\n---\n\nFIXTURE_PII_MARKER but owner reviewed`,
    );
    const res = runSync(repo, tpl, ['--allow-pii', file]);
    assert.equal(res.status, 0, res.stderr);
    assert.equal(existsSync(path.join(tpl, 'wiki', 'concepts', 'reviewed.md')), true, 'allow-pii should copy');

    const log = await readFile(path.join(repo, 'output', 'sessions', 'sync-overrides.log'), 'utf8');
    assert.match(log, /BYPASSED via --allow-pii/);
  } finally {
    await rm(repo, { recursive: true, force: true });
    await rm(tpl, { recursive: true, force: true });
  }
});

// =====================================================================
// Helper: spawn the sync script with --repo + --target overrides.
// =====================================================================

function runSync(repo, tpl, extraArgs) {
  // Use the real script (not a copy) so the test exercises the actual
  // implementation. Pass --repo so the script treats `repo` as repo root.
  return spawnSync(
    'node',
    [syncScript, '--repo', repo, '--target', tpl, ...extraArgs],
    { encoding: 'utf8' },
  );
}
