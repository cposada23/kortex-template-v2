#!/usr/bin/env node
// scope: framework
//
// Kortex `query` — full-text search across the knowledge base.
//
// History:
//   v1: Strict-AND, body-only, case-sensitive grep wrapper. Phase D
//   validation surfaced 6/10 real owner queries failing despite the
//   content existing — case mismatches, phrase-vs-tokens mismatches,
//   filename/title hits not weighted at all.
//
// v2 (this file): score-based ranking with AND-first / OR-fallback,
// case-insensitive throughout, scoring across filename slug + frontmatter
// title + body (not just body).
//
// Algorithm per file (tokens = lowercased query split on whitespace,
// minus 1-char tokens):
//
//   filename_slug_all_tokens     +10   strongest signal — owner usually
//                                       remembers the filename
//   frontmatter_title_all_tokens +5    title is the curator's summary
//   body_all_tokens              +3    classic AND grep
//   any_field_partial            +1    OR fallback (only used if AND
//                                       yields fewer than 3 hits)
//   recency boost                +0..1 same shape as v1 (today=+1.0,
//                                       365d=+0.0)
//
// Top `limit` files by composite score. Ties broken by recency. AND/OR
// labelling is preserved on the result (`match_type: 'AND' | 'partial'`)
// so the printed output can show partial matches as such.
//
// We deliberately do NOT shell out to ripgrep anymore. With ~500 .md
// files in the average Kortex repo, reading all of them in Node is sub-
// 200ms and gives us the structured access (frontmatter title) that a
// raw grep cannot provide. ripgrep stays available as an optimization
// path if the repo grows past ~5000 files (v2.1 candidate).

import { parseArgs } from 'node:util';
import { readFile, readdir, stat } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { colors, tag } from '../lib/colors.mjs';
import { parseString } from '../lib/frontmatter.mjs';

// =====================================================================
// Pure helpers (exported for tests).
// =====================================================================

// Split a raw query into search tokens. Lowercase, drop single-char
// tokens (which would cause false positives — every file matches "a"),
// and drop punctuation that does not appear in slugs or titles.
//
// We keep hyphens INSIDE tokens (`safe-change`, `cross-validation`)
// because filenames slugify with hyphens and the user's mental model is
// "the slug". `tokenize('safe-change workflow')` -> ['safe-change',
// 'workflow']. We also expose the de-hyphenated form so a query for
// `cross-validation` matches a file called `crossvalidation.md` (rare
// but cheap to support).
//
// Punctuation stripped: . , ! ? : ; " ' ( ) [ ] { }  — anything that
// wouldn't survive slugification.
export function tokenize(raw) {
  if (!raw) return [];
  const normalized = String(raw)
    .toLowerCase()
    .replace(/[.,!?:;"'(){}\[\]]/g, ' ')
    .trim();
  const tokens = normalized
    .split(/\s+/)
    .filter((t) => t.length > 1);
  return tokens;
}

// Slugify a filename for matching: drop the `.md`, lowercase, replace
// non-alphanumerics with hyphens, collapse repeats. This mirrors how
// owners think about filenames — "skool-monetization-latam" matches a
// query of "skool monetization" because both reduce to the same tokens.
export function slugifyFilename(filename) {
  return String(filename)
    .toLowerCase()
    .replace(/\.md$/, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// Score a single file against the query tokens. Returns:
//   { score, matchType, hits: { filename, title, body }, excerpt }
// `matchType` is 'AND' if every token appears in at least one field,
// 'partial' if only some tokens hit anywhere, null if no token hits at
// all (caller filters those out).
//
// We compute hits per field separately because the rank weights differ.
// `hits.<field>` is the count of tokens that appear in that field —
// "all tokens hit" is `count === tokens.length`.
export function scoreFile({ filename, title, body, tokens }) {
  if (tokens.length === 0) {
    return { score: 0, matchType: null, hits: { filename: 0, title: 0, body: 0 }, excerpt: null };
  }

  const slug = slugifyFilename(filename);
  const titleLower = (title || '').toLowerCase();
  const bodyLower = (body || '').toLowerCase();

  const hits = { filename: 0, title: 0, body: 0 };
  for (const tok of tokens) {
    // Filename match: does the slug contain the token? We also try the
    // de-hyphenated form so "crossvalidation" hits "cross-validation".
    if (slug.includes(tok) || slug.replace(/-/g, '').includes(tok.replace(/-/g, ''))) {
      hits.filename += 1;
    }
    if (titleLower.includes(tok)) hits.title += 1;
    if (bodyLower.includes(tok)) hits.body += 1;
  }

  // Universe of fields where at least one token hit. Used to detect
  // "any token hit anywhere" for OR fallback.
  const totalHitFields = hits.filename + hits.title + hits.body;
  if (totalHitFields === 0) {
    return { score: 0, matchType: null, hits, excerpt: null };
  }

  // AND vs partial: we say a file is an AND match if every token is
  // present in at least one of the three fields. We OR the per-field
  // hit-sets to compute that.
  const anyFieldHasToken = (tok) =>
    slug.includes(tok) ||
    titleLower.includes(tok) ||
    bodyLower.includes(tok);
  const allTokensHit = tokens.every(anyFieldHasToken);
  const matchType = allTokensHit ? 'AND' : 'partial';

  // Score weights. We give the strongest signals to filename/title hits
  // because they are the curator's signal — if the filename matches the
  // query, the file is almost certainly relevant.
  let score = 0;
  if (hits.filename === tokens.length) score += 10;
  else if (hits.filename > 0) score += 4 * (hits.filename / tokens.length);
  if (hits.title === tokens.length) score += 5;
  else if (hits.title > 0) score += 2 * (hits.title / tokens.length);
  if (hits.body === tokens.length) score += 3;
  else if (hits.body > 0) score += 1 * (hits.body / tokens.length);
  if (matchType === 'partial') {
    // Floor for partial matches so we still surface them when AND fails.
    score = Math.max(score, 1);
  }

  // Pick a representative body excerpt — the first line that contains
  // any token. Truncated to 160 chars. We compute this in scoreFile so
  // tests can assert on it without re-implementing line picking.
  const excerpt = pickExcerpt(body || '', tokens);

  return { score, matchType, hits, excerpt };
}

// First non-empty line containing any of the tokens. Returns
// { line, text } or null.
function pickExcerpt(body, tokens) {
  if (!body || tokens.length === 0) return null;
  const lines = body.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const lower = lines[i].toLowerCase();
    if (tokens.some((t) => lower.includes(t))) {
      const text = lines[i].trim();
      if (text.length === 0) continue;
      return { line: i + 1, text: text.slice(0, 160) };
    }
  }
  return null;
}

// Walk the search zones and yield every .md path. We exclude node_modules
// and .git defensively even though they shouldn't appear under the zones.
async function listMarkdownFiles(repoRoot) {
  const searchZones = ['wiki', 'projects', 'learnings', 'inbox', 'output'];
  const out = [];
  for (const zone of searchZones) {
    const zoneRoot = path.join(repoRoot, zone);
    if (!existsSync(zoneRoot)) continue;
    await walk(zoneRoot, out);
  }
  return out;
}

async function walk(dir, acc) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const ent of entries) {
    if (ent.name === 'node_modules' || ent.name === '.git' || ent.name.startsWith('.')) {
      // Skip dotfiles and known-noisy dirs. We still want files that start
      // with a letter even inside output/, so this matches dirs only via
      // isDirectory below.
      if (ent.isDirectory()) continue;
    }
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      await walk(full, acc);
    } else if (ent.isFile() && ent.name.endsWith('.md')) {
      acc.push(full);
    }
  }
}

// Read + parse a single file into the shape scoreFile expects.
async function loadFile(absPath) {
  let raw;
  try {
    raw = await readFile(absPath, 'utf8');
  } catch {
    return null;
  }
  const parsed = parseString(raw);
  return {
    path: absPath,
    filename: path.basename(absPath),
    title: parsed.data?.title || '',
    body: parsed.content || raw,
  };
}

// =====================================================================
// Top-level search function (exported for tests).
// =====================================================================

// Run a full search and return the top N ranked results.
// Caller passes:
//   repoRoot   absolute path
//   query      raw query string (will be tokenized)
//   limit      max results (default 10)
//   recency    optional { "<rel-path>": "<ISO date>" } map for recency boost
// Returns: [{ path, score, matchType, hits, excerpt, updated? }, ...]
export async function searchRepo({ repoRoot, query: rawQuery, limit = 10, recency = null }) {
  const tokens = tokenize(rawQuery);
  if (tokens.length === 0) return [];

  const files = await listMarkdownFiles(repoRoot);
  const scored = [];
  // We load + score serially to keep memory bounded. With ~500 files this
  // is well under a second; if it ever becomes a problem we can chunk
  // with Promise.all.
  for (const abs of files) {
    const fileData = await loadFile(abs);
    if (!fileData) continue;
    const result = scoreFile({
      filename: fileData.filename,
      title: fileData.title,
      body: fileData.body,
      tokens,
    });
    if (result.matchType === null) continue;
    scored.push({
      path: path.relative(repoRoot, abs),
      score: result.score,
      matchType: result.matchType,
      hits: result.hits,
      excerpt: result.excerpt,
    });
  }

  // Apply recency boost if cache is available. Same shape as v1: today
  // gets +1.0, 365d-old gets +0.0, linear in between. We add this AFTER
  // the main scoring so it acts as a tie-breaker rather than dominating.
  if (recency) {
    const today = Date.now();
    for (const r of scored) {
      const updated = recency[r.path];
      if (updated) {
        const ageDays = (today - new Date(updated).getTime()) / (24 * 3600 * 1000);
        const boost = Math.max(0, 1 - ageDays / 365);
        r.score += boost;
        r.updated = updated;
      }
    }
  }

  // AND-first ranking: if we have at least 3 AND matches, return only
  // those. Otherwise, fall back to mixing AND and partial. This satisfies
  // the rule "AND-first, OR-fallback when AND yields <3".
  const andMatches = scored.filter((r) => r.matchType === 'AND');
  const partialMatches = scored.filter((r) => r.matchType === 'partial');

  let pool;
  if (andMatches.length >= 3) {
    pool = andMatches;
  } else {
    // Show all AND first, then partials, all sorted by score within type.
    pool = [
      ...andMatches.sort((a, b) => b.score - a.score),
      ...partialMatches.sort((a, b) => b.score - a.score),
    ];
  }

  // Final sort: AND matches always rank above partial regardless of raw
  // score, then by score desc.
  pool.sort((a, b) => {
    if (a.matchType !== b.matchType) {
      return a.matchType === 'AND' ? -1 : 1;
    }
    return b.score - a.score;
  });

  return pool.slice(0, limit);
}

// =====================================================================
// CLI dispatch — only runs when this file is invoked directly, not on import.
// =====================================================================

// Detect "is this module the entry point". Without this guard, importing
// `searchRepo` from a test would also run parseArgs and try to print
// help — breaking the test harness.
const invokedDirectly = (() => {
  try {
    return process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
  } catch {
    return false;
  }
})();

if (invokedDirectly) {
  await runCli();
}

async function runCli() {
  const { values, positionals } = parseArgs({
    options: {
      limit: { type: 'string', default: '10' },
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
  const rawQuery = positionals.join(' ');
  const limit = Math.max(1, Math.min(50, parseInt(values.limit, 10) || 10));
  const recency = loadRecencyCache(repoRoot);

  const results = await searchRepo({ repoRoot, query: rawQuery, limit, recency });

  if (values.json) {
    console.log(JSON.stringify({ query: rawQuery, count: results.length, results }, null, 2));
  } else {
    printResults(rawQuery, results);
  }

  if (results.length === 0) process.exit(2); // exit 2 = no matches
}

// =====================================================================
// CLI plumbing.
// =====================================================================

function loadRecencyCache(root) {
  const p = path.join(root, '.cache', 'recency.json');
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
}

function printResults(q, results) {
  if (results.length === 0) {
    console.log(`${tag.info()} no matches for "${q}"`);
    return;
  }
  // Header indicates whether the result list is pure AND or mixed —
  // helps the caller understand what they're looking at.
  const hasPartial = results.some((r) => r.matchType === 'partial');
  const headerSuffix = hasPartial ? colors.gray(' (incl. partial matches)') : '';
  console.log(
    colors.bold(`Top ${results.length} match${results.length === 1 ? '' : 'es'} for "${q}"`) +
      headerSuffix,
  );
  console.log('');
  for (const r of results) {
    const score = r.score.toFixed(2);
    const updated = r.updated ? colors.gray(`(${r.updated})`) : '';
    const tagPartial = r.matchType === 'partial' ? colors.yellow(' [partial]') : '';
    console.log(
      `${colors.cyan(r.path)} ${colors.gray('score=' + score)}${tagPartial} ${updated}`,
    );
    if (r.excerpt) {
      console.log(`  ${colors.gray(r.excerpt.line + ':')} ${r.excerpt.text}`);
    }
    console.log('');
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
  console.log('Scores by: filename slug match (10) > title match (5) > body match (3).');
  console.log('AND-first; falls back to partial matches when fewer than 3 AND hits.');
  console.log('Recency cache (.cache/recency.json) is a tie-breaker boost (+0..1).');
  console.log('');
  console.log('Flags:');
  console.log('  --limit N    top-N results (default 10, max 50)');
  console.log('  --json       machine-readable output');
}
