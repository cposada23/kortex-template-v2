// scope: framework
// Tests for scripts/commands/sync-to-template.mjs (v2 — propose-test-merge).
//
// We exercise the new flow with --branch-only so tests don't try to
// invoke `pnpm test` inside a throwaway template (which has no
// node_modules). The "did it sync correctly?" question becomes "what
// landed on the sync branch in the temp template?".

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm, copyFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const syncScript = path.resolve(__dirname, '..', '..', 'commands', 'sync-to-template.mjs');
const realLib = path.resolve(__dirname, '..', '..', 'lib');
const realHooks = path.resolve(__dirname, '..', '..', 'hooks');

// Build a temporary mykortex + template pair, both git-initialized,
// with a copy of the framework lib + hooks the sync script needs.
async function makePair() {
  const repo = await mkdtemp(path.join(os.tmpdir(), 'kortex-sync-test-repo-'));
  const tpl = await mkdtemp(path.join(os.tmpdir(), 'kortex-sync-test-tpl-'));

  // Init both repos.
  for (const dir of [repo, tpl]) {
    execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: dir });
    execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: dir });
    execFileSync('git', ['config', 'user.name', 'Test'], { cwd: dir });
    // An initial commit so `main` exists as a real branch.
    await writeFile(path.join(dir, '.gitkeep'), '');
    execFileSync('git', ['add', '.'], { cwd: dir });
    execFileSync('git', ['commit', '-q', '-m', 'init'], { cwd: dir });
  }

  // Mirror lib + hooks the sync command needs.
  await mkdir(path.join(repo, 'scripts', 'lib'), { recursive: true });
  await mkdir(path.join(repo, 'scripts', 'hooks'), { recursive: true });
  await mkdir(path.join(repo, 'scripts', 'commands'), { recursive: true });

  for (const f of ['frontmatter.mjs', 'colors.mjs', 'git.mjs', 'redact.mjs', 'sync-eligibility.mjs']) {
    const src = path.join(realLib, f);
    if (existsSync(src)) await copyFile(src, path.join(repo, 'scripts', 'lib', f));
  }
  for (const f of ['validate-pii.mjs']) {
    const src = path.join(realHooks, f);
    if (existsSync(src)) await copyFile(src, path.join(repo, 'scripts', 'hooks', f));
  }

  // Symlink the test repo's node_modules to the real one so gray-matter
  // resolves. Real path is two levels up from this file's dir.
  const realRoot = path.resolve(__dirname, '..', '..', '..');
  if (existsSync(path.join(realRoot, 'node_modules'))) {
    const { symlink } = await import('node:fs/promises');
    try {
      await symlink(path.join(realRoot, 'node_modules'), path.join(repo, 'node_modules'), 'dir');
    } catch { /* best effort */ }
  }

  return { repo, tpl };
}

async function cleanup(...dirs) {
  for (const d of dirs) await rm(d, { recursive: true, force: true });
}

function runSync(repo, tpl, extraArgs) {
  return spawnSync(
    'node',
    [
      syncScript,
      '--repo', repo,
      '--target', tpl,
      '--branch-name', 'sync-test',
      '--branch-only',
      ...extraArgs,
    ],
    { encoding: 'utf8' },
  );
}

// =====================================================================
// Test 1: mirror: personal stays in personal.
// =====================================================================

test('sync v2: mirror=personal is skipped', async () => {
  const { repo, tpl } = await makePair();
  try {
    await mkdir(path.join(repo, 'wiki', 'concepts'), { recursive: true });
    await writeFile(
      path.join(repo, 'wiki', 'concepts', 'private.md'),
      `---\ntitle: "Private"\ntype: concept\nlayer: synthesis\nlanguage: en\ntags: []\nupdated: 2026-04-30\nmirror: personal\n---\n\nbody`,
    );
    const res = runSync(repo, tpl, []);
    assert.equal(res.status, 0, res.stderr);

    // The sync branch was created but no eligible file = no commit.
    // private.md must NOT be on the branch.
    const branchFiles = execFileSync('git', ['ls-tree', '-r', '--name-only', 'sync-test'],
      { cwd: tpl, encoding: 'utf8' }).trim().split('\n');
    assert.ok(!branchFiles.includes('wiki/concepts/private.md'), 'personal file should not be in template branch');
  } finally {
    await cleanup(repo, tpl);
  }
});

// =====================================================================
// Test 2: mirror: framework + clean body lands on the branch.
// =====================================================================

test('sync v2: mirror=framework + clean PII = lands on branch', async () => {
  const { repo, tpl } = await makePair();
  try {
    await mkdir(path.join(repo, 'wiki', 'concepts'), { recursive: true });
    await writeFile(
      path.join(repo, 'wiki', 'concepts', 'public.md'),
      `---\ntitle: "Public"\ntype: concept\nlayer: synthesis\nlanguage: en\ntags: []\nupdated: 2026-04-30\nmirror: framework\n---\n\nclean body`,
    );
    const res = runSync(repo, tpl, []);
    assert.equal(res.status, 0, res.stderr);
    assert.equal(existsSync(path.join(tpl, 'wiki', 'concepts', 'public.md')), true,
      'framework file should be on the branch');
  } finally {
    await cleanup(repo, tpl);
  }
});

// =====================================================================
// Test 3: PII match (real validator + real patterns) blocks the file.
// =====================================================================

test('sync v2: real PII match blocks the file', async () => {
  const { repo, tpl } = await makePair();
  try {
    await mkdir(path.join(repo, 'wiki', 'concepts'), { recursive: true });
    // Use a Colombian phone pattern that real validate-pii.mjs catches.
    await writeFile(
      path.join(repo, 'wiki', 'concepts', 'leaks.md'),
      `---\ntitle: "Leaks"\ntype: concept\nlayer: synthesis\nlanguage: en\ntags: []\nupdated: 2026-04-30\nmirror: framework\n---\n\nCall me at +57 300 555 1234 anytime.`,
    );
    const res = runSync(repo, tpl, []);
    assert.equal(res.status, 1, 'PII block should exit 1');
    assert.equal(existsSync(path.join(tpl, 'wiki', 'concepts', 'leaks.md')), false,
      'blocked file must not be on the branch');
  } finally {
    await cleanup(repo, tpl);
  }
});

// =====================================================================
// Test 4: leak canary catches a literal that survived redaction.
// =====================================================================

test('sync v2: leak canary blocks file when literal survives', async () => {
  const { repo, tpl } = await makePair();
  try {
    // Owner config with a canary but no matching literal substitution
    // — so "OwnerName" survives redaction and trips the canary.
    await mkdir(path.join(repo, '.kortex'), { recursive: true });
    await writeFile(
      path.join(repo, '.kortex', 'sync-redactions.json'),
      JSON.stringify({ literal: [], regex: [], drop_lines: [], leak_canaries: ['OwnerName'] }),
    );

    await mkdir(path.join(repo, 'wiki', 'concepts'), { recursive: true });
    await writeFile(
      path.join(repo, 'wiki', 'concepts', 'leaks2.md'),
      `---\ntitle: "Leaks2"\ntype: concept\nlayer: synthesis\nlanguage: en\ntags: []\nupdated: 2026-04-30\nmirror: framework\n---\n\nThe owner is OwnerName.`,
    );

    const res = runSync(repo, tpl, []);
    assert.equal(res.status, 1, 'canary should exit 1');
    assert.equal(existsSync(path.join(tpl, 'wiki', 'concepts', 'leaks2.md')), false);
  } finally {
    await cleanup(repo, tpl);
  }
});

// =====================================================================
// Test 5: redaction substitutes literals and the substituted output is
// what lands on the branch.
// =====================================================================

test('sync v2: redaction applies before write', async () => {
  const { repo, tpl } = await makePair();
  try {
    await mkdir(path.join(repo, '.kortex'), { recursive: true });
    await writeFile(
      path.join(repo, '.kortex', 'sync-redactions.json'),
      JSON.stringify({
        literal: [['OwnerName', '{{owner_name}}']],
        regex: [],
        drop_lines: [],
        leak_canaries: [],
      }),
    );

    await mkdir(path.join(repo, 'wiki', 'concepts'), { recursive: true });
    await writeFile(
      path.join(repo, 'wiki', 'concepts', 'doc.md'),
      `---\ntitle: "Doc"\ntype: concept\nlayer: synthesis\nlanguage: en\ntags: []\nupdated: 2026-04-30\nmirror: framework\n---\n\nHello OwnerName, welcome.`,
    );

    const res = runSync(repo, tpl, []);
    assert.equal(res.status, 0, res.stderr);

    const synced = await readFile(path.join(tpl, 'wiki', 'concepts', 'doc.md'), 'utf8');
    assert.match(synced, /Hello \{\{owner_name\}\}, welcome\./);
    assert.doesNotMatch(synced, /OwnerName/);
  } finally {
    await cleanup(repo, tpl);
  }
});

// =====================================================================
// Test 6: code files with `// scope: framework` are synced.
// =====================================================================

test('sync v2: .mjs with scope:framework comment is synced', async () => {
  const { repo, tpl } = await makePair();
  try {
    await mkdir(path.join(repo, 'scripts', 'lib'), { recursive: true });
    await writeFile(
      path.join(repo, 'scripts', 'lib', 'helper.mjs'),
      `// scope: framework\nexport function helper() { return 42; }\n`,
    );

    const res = runSync(repo, tpl, []);
    assert.equal(res.status, 0, res.stderr);
    assert.equal(existsSync(path.join(tpl, 'scripts', 'lib', 'helper.mjs')), true,
      'framework-scoped .mjs should sync');
  } finally {
    await cleanup(repo, tpl);
  }
});

// =====================================================================
// Test 7: code file without scope declaration stays in personal.
// =====================================================================

test('sync v2: .mjs without scope declaration is NOT synced', async () => {
  const { repo, tpl } = await makePair();
  try {
    await mkdir(path.join(repo, 'scripts', 'lib'), { recursive: true });
    await writeFile(
      path.join(repo, 'scripts', 'lib', 'private.mjs'),
      `export function privateFn() { return 'secret'; }\n`,
    );

    const res = runSync(repo, tpl, []);
    assert.equal(res.status, 0, res.stderr);
    assert.equal(existsSync(path.join(tpl, 'scripts', 'lib', 'private.mjs')), false,
      'unscoped .mjs must not sync');
  } finally {
    await cleanup(repo, tpl);
  }
});

// =====================================================================
// Test 8: --allow-pii bypasses block (real validator) AND logs override.
// =====================================================================

test('sync v2: --allow-pii bypass copies + logs', async () => {
  const { repo, tpl } = await makePair();
  try {
    await mkdir(path.join(repo, 'wiki', 'concepts'), { recursive: true });
    const file = path.join(repo, 'wiki', 'concepts', 'reviewed.md');
    await writeFile(
      file,
      `---\ntitle: "Reviewed"\ntype: concept\nlayer: synthesis\nlanguage: en\ntags: []\nupdated: 2026-04-30\nmirror: framework\n---\n\nCall me at +57 300 555 1234.`,
    );
    const res = runSync(repo, tpl, ['--allow-pii', file]);
    assert.equal(res.status, 0, res.stderr);
    assert.equal(existsSync(path.join(tpl, 'wiki', 'concepts', 'reviewed.md')), true,
      'allow-pii should copy');

    const log = await readFile(
      path.join(repo, 'output', 'sessions', 'sync-overrides.log'),
      'utf8',
    );
    assert.match(log, /reviewed\.md/);
  } finally {
    await cleanup(repo, tpl);
  }
});

// =====================================================================
// Test 9: dry-run produces the plan but writes nothing on disk.
// =====================================================================

test('sync v2: --dry-run writes nothing', async () => {
  const { repo, tpl } = await makePair();
  try {
    await mkdir(path.join(repo, 'wiki', 'concepts'), { recursive: true });
    await writeFile(
      path.join(repo, 'wiki', 'concepts', 'public.md'),
      `---\ntitle: "Public"\ntype: concept\nlayer: synthesis\nlanguage: en\ntags: []\nupdated: 2026-04-30\nmirror: framework\n---\n\nclean`,
    );
    const res = spawnSync(
      'node',
      [syncScript, '--repo', repo, '--target', tpl, '--dry-run'],
      { encoding: 'utf8' },
    );
    assert.equal(res.status, 0, res.stderr);
    assert.match(res.stdout, /would copy/);
    assert.equal(existsSync(path.join(tpl, 'wiki', 'concepts', 'public.md')), false,
      'dry-run must not write to template');
  } finally {
    await cleanup(repo, tpl);
  }
});
