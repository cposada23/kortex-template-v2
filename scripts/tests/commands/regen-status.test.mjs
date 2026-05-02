// scope: framework
// Tests for scripts/commands/regen-status.mjs
//
// We test the three computation helpers (parseActivePriorities,
// countStaleWikiPages, countOpenHandoffs) against fixture content created
// in /tmp, plus a round-trip test that runs computeStatus + writeStatus
// and asserts the cache file matches the schema's required fields.
//
// We don't shell out to `pnpm kortex regen-status` here because the unit
// tests cover the same code paths and avoid the spawn overhead.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import {
  parseActivePriorities,
  countStaleWikiPages,
  countOpenHandoffs,
  computeStatus,
  writeStatus,
} from '../../commands/regen-status.mjs';

// =====================================================================
// Fixture helpers.
// =====================================================================

async function makeFixtureRoot() {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'kortex-regen-status-test-'));
  return dir;
}

async function writeAgents(root, body) {
  await writeFile(path.join(root, 'AGENTS.md'), body);
}

async function writeWikiPage(root, relPath, frontmatter) {
  const full = path.join(root, 'wiki', relPath);
  await mkdir(path.dirname(full), { recursive: true });
  const fm = Object.entries(frontmatter)
    .map(([k, v]) => `${k}: ${typeof v === 'string' ? `"${v}"` : v}`)
    .join('\n');
  await writeFile(full, `---\n${fm}\n---\n\nbody\n`);
}

async function writeSession(root, name, body) {
  const dir = path.join(root, 'output', 'sessions');
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, name), body);
}

// =====================================================================
// parseActivePriorities
// =====================================================================

test('parseActivePriorities: reads numbered list under heading', async () => {
  const root = await makeFixtureRoot();
  await writeAgents(root, [
    '# Title',
    '',
    '### Active Priorities',
    '',
    '1. First priority',
    '2. Second priority',
    '3. Third — with em dash',
    '',
    '### Other section',
    'unrelated',
  ].join('\n'));

  const got = await parseActivePriorities(root);
  assert.deepEqual(got, ['First priority', 'Second priority', 'Third — with em dash']);
  await rm(root, { recursive: true, force: true });
});

test('parseActivePriorities: returns [] when AGENTS.md is missing', async () => {
  const root = await makeFixtureRoot();
  const got = await parseActivePriorities(root);
  assert.deepEqual(got, []);
  await rm(root, { recursive: true, force: true });
});

test('parseActivePriorities: returns [] when section is missing', async () => {
  const root = await makeFixtureRoot();
  await writeAgents(root, '# Just a title\n\nNo priorities section.\n');
  const got = await parseActivePriorities(root);
  assert.deepEqual(got, []);
  await rm(root, { recursive: true, force: true });
});

test('parseActivePriorities: stops at next heading even without blank line', async () => {
  const root = await makeFixtureRoot();
  await writeAgents(root, [
    '### Active Priorities',
    '1. one',
    '2. two',
    '### Next section',
    '3. not a priority',
  ].join('\n'));
  const got = await parseActivePriorities(root);
  assert.deepEqual(got, ['one', 'two']);
  await rm(root, { recursive: true, force: true });
});

test('parseActivePriorities: tolerates ## heading level too', async () => {
  const root = await makeFixtureRoot();
  await writeAgents(root, [
    '## Active Priorities',
    '',
    '1. only one',
    '',
  ].join('\n'));
  const got = await parseActivePriorities(root);
  assert.deepEqual(got, ['only one']);
  await rm(root, { recursive: true, force: true });
});

// =====================================================================
// countStaleWikiPages
// =====================================================================

test('countStaleWikiPages: counts pages >60d old AND distillation_level<2', async () => {
  const root = await makeFixtureRoot();
  const oldDate = new Date(Date.now() - 100 * 24 * 3600 * 1000).toISOString().slice(0, 10);
  const recentDate = new Date().toISOString().slice(0, 10);

  // Stale (old + low distillation)
  await writeWikiPage(root, 'concepts/a.md', {
    title: 'a', type: 'concept', layer: 'synthesis', language: 'en',
    tags: '[]', updated: oldDate, distillation_level: 1,
  });
  // Old but well-distilled — NOT stale
  await writeWikiPage(root, 'concepts/b.md', {
    title: 'b', type: 'concept', layer: 'synthesis', language: 'en',
    tags: '[]', updated: oldDate, distillation_level: 3,
  });
  // Recent — NOT stale regardless of level
  await writeWikiPage(root, 'concepts/c.md', {
    title: 'c', type: 'concept', layer: 'synthesis', language: 'en',
    tags: '[]', updated: recentDate, distillation_level: 0,
  });

  const got = await countStaleWikiPages(root);
  assert.equal(got, 1);
  await rm(root, { recursive: true, force: true });
});

test('countStaleWikiPages: returns 0 when wiki/ is missing', async () => {
  const root = await makeFixtureRoot();
  const got = await countStaleWikiPages(root);
  assert.equal(got, 0);
  await rm(root, { recursive: true, force: true });
});

test('countStaleWikiPages: skips pages with no `updated` field', async () => {
  const root = await makeFixtureRoot();
  const dir = path.join(root, 'wiki', 'concepts');
  await mkdir(dir, { recursive: true });
  // No frontmatter at all.
  await writeFile(path.join(dir, 'naked.md'), '# just a body\n');
  const got = await countStaleWikiPages(root);
  assert.equal(got, 0);
  await rm(root, { recursive: true, force: true });
});

// =====================================================================
// countOpenHandoffs
// =====================================================================

test('countOpenHandoffs: counts session files with trailing handoff marker', async () => {
  const root = await makeFixtureRoot();
  // Open handoff (handoff is the last marker)
  await writeSession(root, '2026-04-01.md', [
    '## Bridge-out 09:00',
    'morning work',
    '## Handoff 14:00',
    'paused mid-task',
  ].join('\n'));
  // Closed (bridge-out comes after handoff)
  await writeSession(root, '2026-04-02.md', [
    '## Handoff 10:00',
    'paused',
    '## Bridge-out 18:00',
    'closed',
  ].join('\n'));
  // No markers at all
  await writeSession(root, '2026-04-03.md', '# just a session\n');

  const got = await countOpenHandoffs(root);
  assert.equal(got, 1);
  await rm(root, { recursive: true, force: true });
});

test('countOpenHandoffs: returns 0 when output/sessions/ missing', async () => {
  const root = await makeFixtureRoot();
  const got = await countOpenHandoffs(root);
  assert.equal(got, 0);
  await rm(root, { recursive: true, force: true });
});

test('countOpenHandoffs: ignores non-date filenames', async () => {
  const root = await makeFixtureRoot();
  await writeSession(root, 'README.md', '## Handoff 10:00\n');
  await writeSession(root, 'archive-Q1.md', '## Handoff 11:00\n');
  const got = await countOpenHandoffs(root);
  assert.equal(got, 0);
  await rm(root, { recursive: true, force: true });
});

// =====================================================================
// computeStatus + writeStatus round-trip.
// =====================================================================

test('computeStatus: returns all required schema fields', async () => {
  const root = await makeFixtureRoot();
  await writeAgents(root, '### Active Priorities\n\n1. p1\n');
  const status = await computeStatus(root);
  assert.equal(typeof status.generated_at, 'string');
  assert.match(status.generated_at, /^\d{4}-\d{2}-\d{2}T/);
  assert.deepEqual(status.priorities, ['p1']);
  assert.equal(status.stale_count, 0);
  assert.equal(status.open_handoffs, 0);
  await rm(root, { recursive: true, force: true });
});

test('writeStatus: creates .cache/status.json with pretty-printed JSON', async () => {
  const root = await makeFixtureRoot();
  const status = {
    generated_at: '2026-05-01T00:00:00.000Z',
    priorities: ['p'],
    stale_count: 0,
    open_handoffs: 0,
  };
  await writeStatus(root, status);
  const cachePath = path.join(root, '.cache', 'status.json');
  assert.ok(existsSync(cachePath));
  const body = await readFile(cachePath, 'utf8');
  // Round-trip through JSON.parse to verify it's valid JSON.
  const parsed = JSON.parse(body);
  assert.deepEqual(parsed, status);
  // Must end with trailing newline.
  assert.ok(body.endsWith('\n'));
  await rm(root, { recursive: true, force: true });
});
