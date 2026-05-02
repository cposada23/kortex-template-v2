#!/usr/bin/env node
//
// Kortex `review` — surface 3 random notes that need attention.
//
// The bet: a PKM that doesn't proactively re-surface old material rots.
// You add notes faster than you re-read them, low-distillation pages
// pile up, and confidence claims marked as `high` go stale silently.
// `review` runs over the fields that already exist (no new schema —
// `next_review` would be a 4th overlapping date and we resisted that)
// and picks 3 candidates from these buckets:
//
//   A. wiki/* with distillation_level <= 2 AND updated > 30 days ago
//      (raw or partially-distilled pages that have gone cold)
//   B. wiki/* with confidence: high AND last_verified missing or > 30d
//      (high-confidence claims that haven't been re-checked)
//   C. inbox/* (excluding inbox/journal/) older than 14 days
//      (captures that never got triaged)
//
// We surface 3 random total, weighted toward whichever bucket has the
// most candidates. Reasoning: if you have 50 stale wiki pages and 2
// inbox items, a uniform 1-per-bucket sample over-represents the long
// tail of inbox and lets the wiki backlog grow. Random over the union
// is the simplest correct thing.
//
// Flags:
//   --count N       how many to surface (default 3)
//   --bucket A|B|C  restrict to one bucket
//   --json          machine-readable
//   --all           print every candidate, no random sampling

import { parseArgs } from 'node:util';
import { readdir, stat } from 'node:fs/promises';
import { existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { parseFile } from '../lib/frontmatter.mjs';
import { colors, tag } from '../lib/colors.mjs';

const { values } = parseArgs({
  options: {
    count: { type: 'string', default: '3' },
    bucket: { type: 'string' },
    json: { type: 'boolean', default: false },
    all: { type: 'boolean', default: false },
    repo: { type: 'string' },
    today: { type: 'string' },          // override today for tests
    help: { type: 'boolean', short: 'h', default: false },
  },
  strict: false,
});

if (values.help) {
  printHelp();
  process.exit(0);
}

const repoRoot = values.repo ? path.resolve(values.repo) : findRepoRoot(process.cwd());
const todayStr = values.today || new Date().toISOString().slice(0, 10);
const today = parseDate(todayStr);

const SKIP_DIRS = new Set(['.git', 'node_modules', '.cache', '.husky', '.pnpm-store', '.claude']);

const STALE_WIKI_DAYS = 30;
const STALE_VERIFY_DAYS = 30;
const STALE_INBOX_DAYS = 14;

const candidates = [];

await walk(repoRoot, '');

if (values.bucket) {
  const allowed = new Set(values.bucket.split(',').map((s) => s.trim().toUpperCase()));
  for (let i = candidates.length - 1; i >= 0; i--) {
    if (!allowed.has(candidates[i].bucket)) candidates.splice(i, 1);
  }
}

const count = parseInt(values.count, 10) || 3;
const picks = values.all ? candidates : sample(candidates, count);

if (values.json) {
  console.log(JSON.stringify({ today: todayStr, total: candidates.length, picked: picks }, null, 2));
  process.exit(0);
}

printReport(candidates, picks);

// =====================================================================
// Walker — single pass, classify each file into 0+ buckets.
// =====================================================================

async function walk(absDir, relDir) {
  let entries;
  try {
    entries = await readdir(absDir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const ent of entries) {
    if (SKIP_DIRS.has(ent.name)) continue;
    if (ent.name.startsWith('.')) continue;          // hidden files
    const absPath = path.join(absDir, ent.name);
    const relPath = relDir ? `${relDir}/${ent.name}` : ent.name;
    if (ent.isDirectory()) {
      await walk(absPath, relPath);
      continue;
    }
    if (!ent.name.endsWith('.md')) continue;
    if (ent.name === 'INDEX.md' || ent.name === 'INBOX.md') continue;
    classify(absPath, relPath);
  }
}

function classify(absPath, relPath) {
  let parsed;
  try {
    parsed = parseFile(absPath);
  } catch {
    return;
  }
  const data = parsed.data || {};
  const title = data.title || path.basename(relPath, '.md');
  const updated = parseDate(data.updated);

  // Bucket A — wiki/, distillation_level <= 2, updated > 30 days ago.
  if (relPath.startsWith('wiki/')) {
    const level = numOrNull(data.distillation_level);
    if (level !== null && level <= 2 && updated && daysBetween(updated, today) > STALE_WIKI_DAYS) {
      candidates.push({
        bucket: 'A',
        reason: `distillation_level=${level}, ${daysBetween(updated, today)}d since updated`,
        path: relPath,
        title,
        age_days: daysBetween(updated, today),
      });
    }
    // Bucket B — wiki/, confidence: high, last_verified > 30d (or missing).
    if (data.confidence === 'high') {
      const lv = parseDate(data.last_verified);
      const verifiedAge = lv ? daysBetween(lv, today) : null;
      if (verifiedAge === null || verifiedAge > STALE_VERIFY_DAYS) {
        candidates.push({
          bucket: 'B',
          reason: verifiedAge === null
            ? 'confidence=high but last_verified missing'
            : `confidence=high, ${verifiedAge}d since last_verified`,
          path: relPath,
          title,
          age_days: verifiedAge,
        });
      }
    }
    return;
  }

  // Bucket C — inbox/ (not journal), older than 14 days. We use mtime as
  // a fallback when frontmatter `updated` is missing — inbox items often
  // skip schema.
  if (relPath.startsWith('inbox/') && !relPath.startsWith('inbox/journal/')) {
    let age;
    if (updated) {
      age = daysBetween(updated, today);
    } else {
      try {
        const st = statSync(absPath);
        const mtime = new Date(st.mtime);
        age = Math.floor((today - mtime) / (1000 * 60 * 60 * 24));
      } catch {
        return;
      }
    }
    if (age > STALE_INBOX_DAYS) {
      candidates.push({
        bucket: 'C',
        reason: `${age}d in inbox without triage`,
        path: relPath,
        title,
        age_days: age,
      });
    }
  }
}

// =====================================================================
// Output
// =====================================================================

function printReport(all, picks) {
  console.log(`${colors.bold('Kortex review')} — ${todayStr}`);
  console.log('');
  if (!all.length) {
    console.log(`${tag.ok()} Inbox triaged, wiki fresh, claims verified. Nothing to surface.`);
    return;
  }
  const counts = bucketCounts(all);
  console.log(
    `${tag.info()} ${all.length} candidates ` +
    colors.gray(`(A:${counts.A} stale-wiki  B:${counts.B} unverified-high-confidence  C:${counts.C} cold-inbox)`)
  );
  console.log('');
  if (values.all) {
    console.log(colors.bold(`All candidates (${all.length}):`));
  } else {
    console.log(colors.bold(`Today's picks (${picks.length}):`));
  }
  for (const c of picks) {
    const badge = bucketColor(c.bucket)(`[${c.bucket}]`);
    console.log(`  ${badge} ${colors.bold(c.title)}`);
    console.log(`      ${colors.cyan(c.path)}`);
    console.log(`      ${colors.gray(c.reason)}`);
  }
  console.log('');
  console.log(colors.gray('Re-run for a different sample. Pass --all to see every candidate, --bucket A|B|C to filter.'));
}

function bucketColor(b) {
  if (b === 'A') return colors.yellow;
  if (b === 'B') return colors.red;
  if (b === 'C') return colors.cyan;
  return colors.gray;
}

function bucketCounts(items) {
  const out = { A: 0, B: 0, C: 0 };
  for (const c of items) out[c.bucket]++;
  return out;
}

// =====================================================================
// Helpers
// =====================================================================

function parseDate(s) {
  if (!s) return null;
  // Accept Date objects (gray-matter parses YYYY-MM-DD into Date).
  if (s instanceof Date) return s;
  const str = String(s).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(str)) return null;
  return new Date(`${str}T00:00:00Z`);
}

function daysBetween(a, b) {
  return Math.floor((b - a) / (1000 * 60 * 60 * 24));
}

function numOrNull(v) {
  if (v === undefined || v === null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// Random sample without replacement. Fisher–Yates partial shuffle so
// we don't allocate a full shuffled array when n << items.length.
function sample(items, n) {
  if (n >= items.length) return items.slice();
  const arr = items.slice();
  const out = [];
  for (let i = 0; i < n && arr.length > 0; i++) {
    const idx = Math.floor(Math.random() * arr.length);
    out.push(arr[idx]);
    arr.splice(idx, 1);
  }
  return out;
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
  console.log('Usage: pnpm kortex review [--count N] [--bucket A|B|C] [--all] [--json]');
  console.log('');
  console.log('Surface notes that need attention based on existing frontmatter:');
  console.log('  A — wiki pages with distillation_level <= 2 and updated > 30d ago');
  console.log('  B — wiki pages with confidence: high but last_verified missing or > 30d');
  console.log('  C — inbox/ items older than 14d (excluding inbox/journal/)');
  console.log('');
  console.log('Flags:');
  console.log('  --count N         how many to surface (default 3)');
  console.log('  --bucket A|B|C    restrict to one bucket (comma-separated)');
  console.log('  --all             print every candidate, no random sampling');
  console.log('  --json            machine-readable output');
  console.log('  --today YYYY-MM-DD  override today (used by tests)');
}
