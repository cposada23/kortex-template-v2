#!/usr/bin/env node
// scope: framework
//
// Kortex `query` — full-text search across the knowledge base.
//
// Implementation choice (per PRD §4): default is a `ripgrep` shell call,
// not embeddings. ripgrep is:
//   - Already on every developer's machine (or trivially installable).
//   - Substring-fast on millions of lines.
//   - Predictable — owners know exactly what was matched.
//
// Embeddings are intentionally out of scope for v2.0. FTS5 (SQLite full-
// text) is a v2.1 candidate; the recency cache (.cache/recency.json) is
// the v2.0 ranking signal we layer on top of grep hits.
//
// Output: top 10 matches sorted by a composite of grep relevance × recency.
// Each match: path, line excerpt (truncated), score.

import { parseArgs } from 'node:util';
import { execFileSync, spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { colors, tag } from '../lib/colors.mjs';

const { values, positionals } = parseArgs({
  options: {
    limit: { type: 'string', default: '10' },                  // top-N
    json: { type: 'boolean', default: false },
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
const query = positionals.join(' ');
const limit = Math.max(1, Math.min(50, parseInt(values.limit, 10) || 10));

// Verify ripgrep exists. If not we fall back to `grep -r`. We surface the
// fallback so a user without rg knows results may be slower.
const rg = which('rg');
const grep = rg || 'grep';
if (!rg) {
  console.error(`${tag.warn()} ripgrep (rg) not found — falling back to grep -r. Install rg for faster search.`);
}

// Build the search command. We constrain to markdown files and the four
// content zones so we don't grep node_modules or .git.
const searchZones = ['wiki', 'projects', 'learnings', 'inbox', 'output'];
const existingZones = searchZones
  .map((z) => path.join(repoRoot, z))
  .filter((p) => existsSync(p));

if (existingZones.length === 0) {
  console.error('query: no content zones found under repo root');
  process.exit(1);
}

let matches = [];
if (rg) {
  // ripgrep: --json gives us structured output we don't need to re-parse,
  // but plain output with -n (line numbers) and -H (filename) is enough
  // for our scoring pass and easier to debug.
  const args = [
    '--no-heading',
    '--with-filename',
    '--line-number',
    '--smart-case',
    '--type', 'md',
    query,
    ...existingZones,
  ];
  const res = spawnSync(rg, args, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  // rg exits 1 when there are no matches — treat that as empty, not error.
  if (res.status !== 0 && res.status !== 1) {
    console.error(`query: rg failed: ${res.stderr || res.error?.message}`);
    process.exit(1);
  }
  matches = parseRgOutput(res.stdout || '');
} else {
  const args = ['-rniI', '--include=*.md', query, ...existingZones];
  const res = spawnSync('grep', args, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  if (res.status !== 0 && res.status !== 1) {
    console.error(`query: grep failed: ${res.stderr || res.error?.message}`);
    process.exit(1);
  }
  matches = parseGrepOutput(res.stdout || '');
}

// Apply recency weighting via .cache/recency.json. Schema: { "<rel>":
// "<ISO date>" }. Newer files float up. If the cache is missing, we skip
// recency entirely and use grep's natural order.
const recency = loadRecencyCache(repoRoot);
const today = Date.now();
for (const m of matches) {
  const rel = path.relative(repoRoot, m.file);
  m.path = rel;
  // Base score: 1 per hit (grep gives us one line per match). We then
  // bump by recency: a file updated today gets +1.0, a file 365 days old
  // gets ~0. This keeps score interpretable (raw hit count + at most a
  // 1.0 bump per file).
  m.score = 1;
  const updated = recency?.[rel];
  if (updated) {
    const ageDays = (today - new Date(updated).getTime()) / (24 * 3600 * 1000);
    const recencyBoost = Math.max(0, 1 - ageDays / 365);
    m.score += recencyBoost;
    m.updated = updated;
  }
}

// Collapse multiple hits in the same file (a single file can have many
// matching lines). We keep the first 2 line excerpts per file and sum the
// scores so a heavily-matched file still sorts above a single-hit file.
const byFile = new Map();
for (const m of matches) {
  const key = m.path;
  if (!byFile.has(key)) {
    byFile.set(key, { path: key, updated: m.updated, score: 0, excerpts: [] });
  }
  const slot = byFile.get(key);
  slot.score += m.score;
  if (slot.excerpts.length < 2) {
    slot.excerpts.push({ line: m.line, text: m.text.trim().slice(0, 160) });
  }
}

const ranked = [...byFile.values()]
  .sort((a, b) => b.score - a.score)
  .slice(0, limit);

if (values.json) {
  console.log(JSON.stringify({ query, count: ranked.length, results: ranked }, null, 2));
} else {
  printResults(query, ranked);
}

if (ranked.length === 0) process.exit(2); // exit 2 = no matches (vs 0 = ok, 1 = error)

// =====================================================================
// Parsers.
// =====================================================================

// rg --no-heading --with-filename --line-number outputs:
//   path:lineno:text
// We split on the first two ':' only — the line text itself can contain
// colons.
function parseRgOutput(stdout) {
  const out = [];
  for (const line of stdout.split('\n')) {
    if (!line) continue;
    const ix1 = line.indexOf(':');
    if (ix1 < 0) continue;
    const ix2 = line.indexOf(':', ix1 + 1);
    if (ix2 < 0) continue;
    out.push({
      file: line.slice(0, ix1),
      line: parseInt(line.slice(ix1 + 1, ix2), 10),
      text: line.slice(ix2 + 1),
    });
  }
  return out;
}

// grep -n output is the same shape; reuse the rg parser.
function parseGrepOutput(stdout) {
  return parseRgOutput(stdout);
}

// =====================================================================
// Recency cache loader. Soft-fail: missing cache = no recency boost.
// =====================================================================

function loadRecencyCache(root) {
  const p = path.join(root, '.cache', 'recency.json');
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(require('node:fs').readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
}

// =====================================================================
// Output.
// =====================================================================

function printResults(q, results) {
  if (results.length === 0) {
    console.log(`${tag.info()} no matches for "${q}"`);
    return;
  }
  console.log(colors.bold(`Top ${results.length} match${results.length === 1 ? '' : 'es'} for "${q}"`));
  console.log('');
  for (const r of results) {
    const score = r.score.toFixed(2);
    const updated = r.updated ? colors.gray(`(${r.updated})`) : '';
    console.log(`${colors.cyan(r.path)} ${colors.gray('score=' + score)} ${updated}`);
    for (const ex of r.excerpts) {
      console.log(`  ${colors.gray(ex.line + ':')} ${ex.text}`);
    }
    console.log('');
  }
}

// =====================================================================
// Helpers.
// =====================================================================

// Find an executable on PATH using `which`. Returns the absolute path or
// null. We prefer this over assuming `rg` is in PATH because Node's spawn
// will silently search PATH but we want to log fallback at startup.
function which(cmd) {
  try {
    return execFileSync('which', [cmd], { encoding: 'utf8' }).trim() || null;
  } catch {
    return null;
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

function printHelp() {
  console.log('Usage: pnpm kortex query "search terms" [--limit N] [--json]');
  console.log('');
  console.log('Full-text search across wiki/, projects/, learnings/, inbox/, output/.');
  console.log('Ranks by grep relevance × recency (recency.json cache).');
  console.log('');
  console.log('Flags:');
  console.log('  --limit N    top-N results (default 10, max 50)');
  console.log('  --json       machine-readable output');
}
