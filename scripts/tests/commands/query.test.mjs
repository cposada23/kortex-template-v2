//
// Tests for scripts/commands/query.mjs (post-Phase-D fix).
//
// We test:
//   1. Pure helpers — `tokenize`, `slugifyFilename`, `scoreFile` — directly
//      via named imports, no fs needed.
//   2. End-to-end `searchRepo` against a fixture repo we build in /tmp
//      with a handful of representative .md files.
//   3. CLI integration — spawn `node scripts/commands/query.mjs --repo ...`
//      and assert exit code + stdout shape — to catch regressions in the
//      argv parsing / output formatting path.
//
// Each test isolates its fixture in mkdtemp, so they can run in parallel.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

import {
  tokenize,
  slugifyFilename,
  scoreFile,
  searchRepo,
} from '../../commands/query.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const queryScript = path.resolve(__dirname, '..', '..', 'commands', 'query.mjs');

// Build a minimal fixture repo under /tmp with a wiki/ folder. We add only
// the files needed by the test to keep ranking deterministic.
async function makeFixture(files) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'query-test-'));
  await mkdir(path.join(root, 'wiki'), { recursive: true });
  for (const f of files) {
    const abs = path.join(root, f.path);
    await mkdir(path.dirname(abs), { recursive: true });
    await writeFile(abs, f.content);
  }
  return root;
}

// =====================================================================
// tokenize
// =====================================================================

test('tokenize: lowercases input', () => {
  // The Phase D bug: query "FICHA NICHO" produced 0 hits because matching
  // was case-sensitive. The fix lives in the tokenizer (lowercase) plus
  // matching (also lowercase). Asserting the tokenizer side here.
  assert.deepEqual(tokenize('FICHA NICHO'), ['ficha', 'nicho']);
});

test('tokenize: drops single-char tokens to avoid false positives', () => {
  // Otherwise "a b c d" would match every file in the repo.
  assert.deepEqual(tokenize('a meaningful phrase b'), ['meaningful', 'phrase']);
});

test('tokenize: keeps hyphens within tokens', () => {
  // The owner thinks in slugs ("safe-change"), and filenames are
  // hyphenated. Splitting on hyphen would defeat the slug-match heuristic.
  assert.deepEqual(tokenize('safe-change workflow'), ['safe-change', 'workflow']);
});

test('tokenize: strips punctuation', () => {
  assert.deepEqual(tokenize('claude.ai, projects?'), ['claude', 'ai', 'projects']);
});

// =====================================================================
// slugifyFilename
// =====================================================================

test('slugifyFilename: maps a typical wiki filename to its slug', () => {
  assert.equal(slugifyFilename('Skool-Monetization-LATAM.md'), 'skool-monetization-latam');
});

// =====================================================================
// scoreFile (per-file scoring contract)
// =====================================================================

test('scoreFile: filename slug match for ALL tokens scores 10', () => {
  // The strongest signal — Phase D's biggest miss was filenames not
  // contributing to score.
  const result = scoreFile({
    filename: 'skool-monetization-latam.md',
    title: 'Some unrelated title',
    body: 'no relevant content',
    tokens: ['skool', 'monetization'],
  });
  assert.equal(result.matchType, 'AND');
  // 10 from filename. Title/body do not contain the tokens, so no extra.
  assert.equal(result.score, 10);
});

test('scoreFile: title match for ALL tokens contributes +5', () => {
  // Filename does not match. Title fully matches.
  const result = scoreFile({
    filename: 'unrelated-name.md',
    title: 'Skool Monetization for LATAM',
    body: 'no relevant content',
    tokens: ['skool', 'monetization'],
  });
  assert.equal(result.matchType, 'AND');
  // 5 from title. Body has nothing.
  assert.equal(result.score, 5);
});

test('scoreFile: body-only AND match scores 3', () => {
  const result = scoreFile({
    filename: 'unrelated.md',
    title: 'Unrelated title',
    body: 'a paragraph mentioning skool and separately monetization elsewhere',
    tokens: ['skool', 'monetization'],
  });
  assert.equal(result.matchType, 'AND');
  assert.equal(result.score, 3);
});

test('scoreFile: returns null matchType when no token hits', () => {
  const result = scoreFile({
    filename: 'foo.md',
    title: 'foo',
    body: 'bar',
    tokens: ['quux', 'xyzzy'],
  });
  assert.equal(result.matchType, null);
  assert.equal(result.score, 0);
});

test('scoreFile: partial match (some tokens hit) flagged as partial', () => {
  // "skool" hits the body but "monetization" does not — partial.
  const result = scoreFile({
    filename: 'unrelated.md',
    title: 'Unrelated',
    body: 'a paragraph about skool only',
    tokens: ['skool', 'monetization'],
  });
  assert.equal(result.matchType, 'partial');
  // Partial floor: at least 1.
  assert.ok(result.score >= 1);
});

test('scoreFile: case-insensitive matching across all fields', () => {
  // The exact Phase D bug: query lowercase, content with capitals.
  const result = scoreFile({
    filename: 'README.md',
    title: 'SKOOL Monetization',
    body: 'Skool talk',
    tokens: ['skool', 'monetization'],
  });
  assert.equal(result.matchType, 'AND');
  // Title fully matches (5). Body has only "skool", so partial body hit
  // contributes 1 * (1/2) = 0.5. Total expected: 5.5.
  assert.equal(result.score, 5.5);
});

// =====================================================================
// searchRepo (end-to-end)
// =====================================================================

test('searchRepo: finds file via filename even when query is lowercase', async (t) => {
  const root = await makeFixture([
    {
      path: 'wiki/Skool-Monetization-LATAM.md',
      content: '---\ntitle: Skool Monetization for LATAM Creators\ntype: concept\n---\n\nbody about creators.',
    },
    {
      path: 'wiki/unrelated.md',
      content: '---\ntitle: Unrelated\ntype: concept\n---\n\nnothing relevant here.',
    },
  ]);
  t.after(() => rm(root, { recursive: true, force: true }));

  const results = await searchRepo({ repoRoot: root, query: 'skool monetization', limit: 10 });
  assert.ok(results.length > 0, 'expected at least one match');
  // Top hit must be the slug-matched file.
  assert.equal(results[0].path, 'wiki/Skool-Monetization-LATAM.md');
  assert.equal(results[0].matchType, 'AND');
});

test('searchRepo: AND matches always rank above partial matches', async (t) => {
  const root = await makeFixture([
    // Partial — only "monetization" appears.
    {
      path: 'wiki/partial.md',
      content: '---\ntitle: Partial\n---\n\nmonetization but no other word.',
    },
    // AND — both tokens appear in body.
    {
      path: 'wiki/and-match.md',
      content: '---\ntitle: AndMatch\n---\n\nskool and monetization both present.',
    },
  ]);
  t.after(() => rm(root, { recursive: true, force: true }));

  const results = await searchRepo({ repoRoot: root, query: 'skool monetization', limit: 10 });
  assert.equal(results.length, 2);
  assert.equal(results[0].matchType, 'AND', 'AND match should be first');
  assert.equal(results[1].matchType, 'partial', 'partial match should be second');
});

test('searchRepo: OR fallback kicks in when AND yields fewer than 3 hits', async (t) => {
  // Only ONE AND match in the fixture; OR fallback should add partial
  // matches so the result list is not artificially empty.
  const root = await makeFixture([
    {
      path: 'wiki/the-one-and.md',
      content: '---\ntitle: The One AND\n---\n\nalpha and beta together.',
    },
    {
      path: 'wiki/only-alpha.md',
      content: '---\ntitle: Only Alpha\n---\n\nalpha by itself.',
    },
    {
      path: 'wiki/only-beta.md',
      content: '---\ntitle: Only Beta\n---\n\nbeta by itself.',
    },
  ]);
  t.after(() => rm(root, { recursive: true, force: true }));

  const results = await searchRepo({ repoRoot: root, query: 'alpha beta', limit: 10 });
  // AND matches: 1 (the-one-and.md). Falls below 3 → OR fallback.
  // Total expected: 1 AND + 2 partial = 3.
  assert.equal(results.length, 3);
  assert.equal(results[0].matchType, 'AND');
  assert.equal(results[1].matchType, 'partial');
  assert.equal(results[2].matchType, 'partial');
});

test('searchRepo: title from frontmatter contributes to score', async (t) => {
  // The body contains "alpha beta" once; the title file has the same body
  // PLUS frontmatter title hit. Title-hit file must score higher.
  const root = await makeFixture([
    {
      path: 'wiki/no-title.md',
      content: '---\ntitle: Plain\n---\n\nalpha and beta together.',
    },
    {
      path: 'wiki/with-title.md',
      content: '---\ntitle: alpha beta titled page\n---\n\nalpha and beta together.',
    },
  ]);
  t.after(() => rm(root, { recursive: true, force: true }));

  const results = await searchRepo({ repoRoot: root, query: 'alpha beta', limit: 10 });
  assert.equal(results.length, 2);
  assert.equal(results[0].path, 'wiki/with-title.md', 'title-matched file must rank first');
  assert.ok(
    results[0].score > results[1].score,
    'title-match score must exceed body-only score',
  );
});

// =====================================================================
// CLI integration — argv parsing + exit code + JSON output shape.
// =====================================================================

test('CLI: --json output matches the searchRepo result shape', async (t) => {
  const root = await makeFixture([
    {
      path: 'wiki/skool-monetization.md',
      content: '---\ntitle: Skool Monetization\n---\n\nbody text.',
    },
  ]);
  t.after(() => rm(root, { recursive: true, force: true }));

  const res = spawnSync(
    process.execPath,
    [queryScript, '--repo', root, '--json', 'skool', 'monetization'],
    { encoding: 'utf8' },
  );
  assert.equal(res.status, 0, `expected exit 0, got ${res.status}: ${res.stderr}`);
  const parsed = JSON.parse(res.stdout);
  assert.equal(parsed.query, 'skool monetization');
  assert.ok(parsed.results.length >= 1);
  assert.equal(parsed.results[0].path, 'wiki/skool-monetization.md');
  assert.equal(parsed.results[0].matchType, 'AND');
});

test('CLI: exits 2 when there are no matches', async (t) => {
  const root = await makeFixture([
    { path: 'wiki/foo.md', content: '---\ntitle: foo\n---\n\nfoo content.' },
  ]);
  t.after(() => rm(root, { recursive: true, force: true }));

  const res = spawnSync(
    process.execPath,
    [queryScript, '--repo', root, 'nonexistent-query-xyz'],
    { encoding: 'utf8' },
  );
  assert.equal(res.status, 2, 'no-match should exit 2 (CLI contract)');
});
