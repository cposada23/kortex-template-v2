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
  parseFrameworkFollowups,
  parseInProgressByProject,
  detectUnmigratedNext,
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

async function writeTodo(root, body) {
  await writeFile(path.join(root, 'TODO.md'), body);
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
// parseFrameworkFollowups
// =====================================================================

test('parseFrameworkFollowups: extracts top-level bullets from §Framework', async () => {
  const root = await makeFixtureRoot();
  await writeTodo(root, [
    '# TODO',
    '',
    '## Framework',
    '',
    '- **Bug fix one.** rationale prose.',
    '- **Strip a thing.** more rationale.',
    '  - sub-bullet should be ignored',
    '- Plain bullet without bold. First sentence here. Second sentence.',
    '',
    '## Other section',
    '- not a framework item',
  ].join('\n'));

  const got = await parseFrameworkFollowups(root);
  assert.equal(got.length, 3);
  assert.equal(got[0].title, 'Bug fix one');
  assert.equal(got[1].title, 'Strip a thing');
  assert.equal(got[2].title, 'Plain bullet without bold.');
  await rm(root, { recursive: true, force: true });
});

test('parseFrameworkFollowups: returns [] when §Framework is missing', async () => {
  const root = await makeFixtureRoot();
  await writeTodo(root, '# TODO\n\n## Projects\n- something\n');
  const got = await parseFrameworkFollowups(root);
  assert.deepEqual(got, []);
  await rm(root, { recursive: true, force: true });
});

test('parseFrameworkFollowups: returns [] when TODO.md missing', async () => {
  const root = await makeFixtureRoot();
  const got = await parseFrameworkFollowups(root);
  assert.deepEqual(got, []);
  await rm(root, { recursive: true, force: true });
});

test('parseFrameworkFollowups: strips markdown links from titles', async () => {
  const root = await makeFixtureRoot();
  await writeTodo(root, [
    '## Framework',
    '',
    '- **Audit [synced wiki pages](wiki/INDEX.md) for orphans.** rationale.',
  ].join('\n'));
  const got = await parseFrameworkFollowups(root);
  assert.equal(got[0].title, 'Audit synced wiki pages for orphans');
  await rm(root, { recursive: true, force: true });
});

// =====================================================================
// parseInProgressByProject
// =====================================================================

test('parseInProgressByProject: pairs project links with status lines', async () => {
  const root = await makeFixtureRoot();
  await writeTodo(root, [
    '## Projects',
    '- [proj-one](projects/proj-one/TODO.md)',
    '  status: 2 in progress, 1 backlog',
    '- [proj-two](projects/proj-two/TODO.md)',
    '  status: 1 done',
    '',
    '## Other',
    '- ignored',
  ].join('\n'));

  const got = await parseInProgressByProject(root);
  assert.deepEqual(got, {
    'proj-one': '2 in progress, 1 backlog',
    'proj-two': '1 done',
  });
  await rm(root, { recursive: true, force: true });
});

test('parseInProgressByProject: skips dropped projects (~~name~~)', async () => {
  const root = await makeFixtureRoot();
  await writeTodo(root, [
    '## Projects',
    '- ~~old-proj~~ <!-- DROPPED -->',
    '- [active-proj](projects/active-proj/TODO.md)',
    '  status: 3 in progress',
  ].join('\n'));
  const got = await parseInProgressByProject(root);
  assert.deepEqual(got, { 'active-proj': '3 in progress' });
  await rm(root, { recursive: true, force: true });
});

test('parseInProgressByProject: returns {} when TODO.md missing', async () => {
  const root = await makeFixtureRoot();
  const got = await parseInProgressByProject(root);
  assert.deepEqual(got, {});
  await rm(root, { recursive: true, force: true });
});

// =====================================================================
// detectUnmigratedNext
// =====================================================================

test('detectUnmigratedNext: surfaces NEXT items absent from TODO.md', async () => {
  const root = await makeFixtureRoot();
  await writeTodo(root, '## Framework\n- existing item.\n');
  await writeSession(root, '2026-05-01.md', [
    '## Bridge-out 11:00',
    '',
    '**STATE:** sesión.',
    '**NEXT:** Bug en `forgotten-script.mjs`: regex roto que afecta builds.',
    '**BLOCKERS:** none.',
  ].join('\n'));

  const got = await detectUnmigratedNext(root);
  assert.equal(got.length, 1);
  assert.match(got[0].title, /Bug en/);
  assert.equal(got[0].from_session, '2026-05-01.md');
  await rm(root, { recursive: true, force: true });
});

test('detectUnmigratedNext: skips block when any identifier matches TODO.md', async () => {
  const root = await makeFixtureRoot();
  await writeTodo(root, '## Framework\n- Bug en `tracked-script.mjs` ya capturado.\n');
  await writeSession(root, '2026-05-01.md', [
    '**NEXT:** Bug en `tracked-script.mjs`: detalles. Fix: anchor regex.',
  ].join('\n'));

  const got = await detectUnmigratedNext(root);
  assert.deepEqual(got, []);
  await rm(root, { recursive: true, force: true });
});

test('detectUnmigratedNext: dedupes across sessions with same NEXT', async () => {
  const root = await makeFixtureRoot();
  await writeTodo(root, '## Framework\n- nothing.\n');
  const next = '**NEXT:** Strip the `legacy-thing.json` field from sync output.\n';
  await writeSession(root, '2026-05-01.md', next);
  await writeSession(root, '2026-05-02.md', next);

  const got = await detectUnmigratedNext(root);
  assert.equal(got.length, 1);
  await rm(root, { recursive: true, force: true });
});

test('detectUnmigratedNext: returns [] when no sessions exist', async () => {
  const root = await makeFixtureRoot();
  const got = await detectUnmigratedNext(root);
  assert.deepEqual(got, []);
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
  // New fields default to empty containers when sources are missing.
  assert.deepEqual(status.framework_followups, []);
  assert.deepEqual(status.in_progress_by_project, {});
  assert.deepEqual(status.unmigrated_next_items, []);
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
