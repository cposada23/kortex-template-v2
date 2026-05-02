#!/usr/bin/env node
// scope: framework
//
// Kortex `regen-status` — recompute and write `.cache/status.json`.
//
// Why this exists: bridge-in and health both read .cache/status.json as a
// "what's hot right now" snapshot to avoid re-walking the filesystem on
// every session start. v2 shipped the readers but the writer was deferred
// — without it, both consumers fall back to filesystem walks and bridge-in
// prints a WARN. This command closes that gap.
//
// Trigger: invoked automatically from `.husky/post-commit` after every
// commit so the cache is always within one commit of repo state. Also
// available as `pnpm kortex regen-status` for manual regen.
//
// Schema: schema/status.json. Required fields: generated_at, priorities,
// stale_count, open_handoffs. Add a field here only when a consumer needs
// it — speculative fields rot.
//
// Failure mode: post-commit hook ignores non-zero exit. The commit is
// already written; a stale or missing cache is not a reason to fail. We
// surface errors on stderr so manual runs see them, but never abort the
// caller.

import { parseArgs } from 'node:util';
import { readFile, readdir, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFile } from '../lib/frontmatter.mjs';
import { hasOpenHandoff } from './bridge.mjs';
import { tag } from '../lib/colors.mjs';

const { values } = parseArgs({
  options: {
    repo: { type: 'string' },                    // override repo root (tests)
    quiet: { type: 'boolean', default: false },  // suppress success line (post-commit hook)
    help: { type: 'boolean', short: 'h', default: false },
  },
  strict: false,
});

if (values.help) {
  console.log('Usage: pnpm kortex regen-status [--quiet] [--repo <path>]');
  console.log('');
  console.log('Recomputes .cache/status.json from current repo state.');
  console.log('Invoked automatically by .husky/post-commit; safe to run manually.');
  process.exit(0);
}

// Only run as a CLI when this file is the entrypoint. When imported by
// tests we want the helpers without the side effects.
const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  const repoRoot = values.repo ? path.resolve(values.repo) : findRepoRoot(process.cwd());
  try {
    const status = await computeStatus(repoRoot);
    await writeStatus(repoRoot, status);
    if (!values.quiet) {
      console.log(`${tag.ok()} status.json regenerated (${status.priorities.length} priorities, ${status.stale_count} stale, ${status.open_handoffs} open handoffs)`);
    }
  } catch (err) {
    // Surface but don't abort — see header comment on failure mode.
    console.error(`${tag.warn()} regen-status failed: ${err.message}`);
    if (process.env.DEBUG) console.error(err.stack);
    process.exit(1);
  }
}

// =====================================================================
// Computation — exported for tests and for callers that want the snapshot
// without writing it (none today, but cheap to expose).
// =====================================================================

export async function computeStatus(root) {
  const [priorities, stale_count, open_handoffs] = await Promise.all([
    parseActivePriorities(root),
    countStaleWikiPages(root),
    countOpenHandoffs(root),
  ]);
  return {
    generated_at: new Date().toISOString(),
    priorities,
    stale_count,
    open_handoffs,
  };
}

export async function writeStatus(root, status) {
  const cacheDir = path.join(root, '.cache');
  await mkdir(cacheDir, { recursive: true });
  const cachePath = path.join(cacheDir, 'status.json');
  // Pretty-print — the file is small (~1 KB) and humans inspect it during
  // debugging. Trailing newline matches the rest of our JSON files.
  await writeFile(cachePath, JSON.stringify(status, null, 2) + '\n');
}

// Parse the `### Active Priorities` numbered list out of AGENTS.md. We
// look for the heading exactly (case-sensitive) and read consecutive
// numbered list items (`1. ...`, `2. ...`) until a blank line or another
// heading. If the section is missing we return an empty array — that's a
// valid state, not an error.
//
// We do this with a hand-rolled scanner instead of a markdown parser
// because (a) the format is fixed and well-known, (b) pulling in a parser
// for one section is overkill, (c) errors here can't fail the commit.
export async function parseActivePriorities(root) {
  const agentsPath = path.join(root, 'AGENTS.md');
  if (!existsSync(agentsPath)) return [];
  const body = await readFile(agentsPath, 'utf8');
  const lines = body.split('\n');

  let i = 0;
  // Find the heading. Allow any heading level (### is the convention but
  // we don't want to break if someone bumps it to ##).
  while (i < lines.length) {
    if (/^#{1,6}\s+Active Priorities\s*$/.test(lines[i])) break;
    i++;
  }
  if (i >= lines.length) return [];
  i++; // step past the heading

  // Skip immediate blank lines after heading.
  while (i < lines.length && lines[i].trim() === '') i++;

  // Collect numbered list items. Stop at blank line followed by non-list
  // content, or at any new heading.
  const priorities = [];
  while (i < lines.length) {
    const line = lines[i];
    if (/^#{1,6}\s/.test(line)) break;
    const m = line.match(/^\d+\.\s+(.+?)\s*$/);
    if (m) {
      priorities.push(m[1]);
      i++;
      continue;
    }
    // Tolerate a blank line inside the list, but bail if the next non-blank
    // line is not a numbered item.
    if (line.trim() === '') {
      let j = i + 1;
      while (j < lines.length && lines[j].trim() === '') j++;
      if (j >= lines.length || !/^\d+\.\s/.test(lines[j])) break;
      i = j;
      continue;
    }
    // Non-list content — end of the section.
    break;
  }
  return priorities;
}

// Count wiki pages with `updated` >60 days old AND distillation_level < 2.
// Mirrors health.checkStaleWiki. Kept as a count-only function because
// status.json doesn't store the list — health computes the list itself
// when it needs to print examples.
export async function countStaleWikiPages(root) {
  const wikiDir = path.join(root, 'wiki');
  if (!existsSync(wikiDir)) return 0;
  const cutoff = Date.now() - 60 * 24 * 3600 * 1000;
  let count = 0;
  for await (const f of walkMd(wikiDir)) {
    let fm;
    try {
      fm = parseFile(f).data || {};
    } catch {
      continue; // malformed — skip, don't fail
    }
    if (!fm.updated) continue;
    if (new Date(fm.updated).getTime() >= cutoff) continue;
    if ((fm.distillation_level ?? 0) >= 2) continue;
    count++;
  }
  return count;
}

// Count session files whose last `## Handoff` / `## Bridge-out` marker is
// a Handoff (i.e. mid-session pause that was never closed). Reuses
// hasOpenHandoff from bridge.mjs so the definition is shared.
export async function countOpenHandoffs(root) {
  const dir = path.join(root, 'output', 'sessions');
  if (!existsSync(dir)) return 0;
  const entries = await readdir(dir);
  let count = 0;
  for (const f of entries) {
    if (!/^\d{4}-\d{2}-\d{2}\.md$/.test(f)) continue;
    const body = await readFile(path.join(dir, f), 'utf8');
    if (hasOpenHandoff(body)) count++;
  }
  return count;
}

// =====================================================================
// Walkers + utilities (local — keeping the file self-contained).
// =====================================================================

async function* walkMd(dir) {
  if (!existsSync(dir)) return;
  const entries = await readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    if (['node_modules', '.git', '.cache'].includes(e.name)) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) yield* walkMd(full);
    else if (full.endsWith('.md')) yield full;
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
