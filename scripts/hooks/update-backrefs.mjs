#!/usr/bin/env node
//
// Soft pre-commit hook: regenerate `## Backlinks` sections on staged .md files.
//
// Behavior:
//   - Soft. Always exits 0 — never blocks a commit. A failure here means the
//     index lags one commit; that's acceptable. Failing the commit on a
//     metadata regen would create a pit-of-failure UX (especially during
//     bulk renames where the cache invalidation is most useful).
//   - Incremental. We re-scan the repo for backref edges only when the staged
//     set changes the link graph (any staged .md). The result is cached in
//     `.cache/backrefs.json` so subsequent commits are O(staged) instead of
//     O(repo).
//
// Algorithm:
//   1. Build (or refresh) a global map: target_md -> [referrer_md, ...].
//      We do this by walking every .md in the repo once and indexing all
//      relative links extracted by markdown-links.mjs.
//   2. For every staged .md, look up its incoming edges in the map and
//      rewrite the `## Backlinks` section at the bottom of the file.
//   3. If the rewrite changes the file, `git add` it back so the new content
//      ships in the same commit.
//
// Cache shape (`.cache/backrefs.json`):
//   {
//     "version": 1,
//     "generated_at": "<ISO>",
//     "edges": { "wiki/foo.md": ["wiki/bar.md", "projects/baz.md"], ... }
//   }

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { repoRoot, stagedFiles } from '../lib/git.mjs';
import { extractLinks, resolveLinkTarget } from '../lib/markdown-links.mjs';
import { colors } from '../lib/colors.mjs';

const BACKLINKS_HEADING = '## Backlinks';
// We delimit the auto-generated section with HTML comments. Anything outside
// the markers stays untouched, so a user can keep manual notes in `## Backlinks`
// above the markers if they want — though the convention is: the whole
// section is owned by the hook.
const BLOCK_START = '<!-- backrefs:start -->';
const BLOCK_END = '<!-- backrefs:end -->';

// Directories we never crawl. Skipping `.git` is mandatory; skipping
// `node_modules` and `.cache` saves a lot of stat calls on a fresh checkout.
const SKIP_DIRS = new Set(['.git', 'node_modules', '.cache', '.husky', '.pnpm-store']);

// Walk the repo for all .md files. Returns paths relative to repoRoot.
// We do a single sync walk because the repo size is small (~hundreds of .md)
// and parallelizing read calls would add complexity for negligible speedup.
function walkAllMd(root) {
  const out = [];
  function recurse(dir) {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (e.name.startsWith('.') && SKIP_DIRS.has(e.name)) continue;
      if (SKIP_DIRS.has(e.name)) continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        recurse(full);
      } else if (e.isFile() && e.name.endsWith('.md')) {
        out.push(path.relative(root, full));
      }
    }
  }
  recurse(root);
  return out;
}

// Build the full referrer map: target -> [referrer, ...].
// Both keys and values are paths relative to repo root, normalized to forward
// slashes so the cache is stable across OSes.
function buildEdgeMap(root) {
  const all = walkAllMd(root);
  const edges = new Map();
  for (const rel of all) {
    const abs = path.join(root, rel);
    let content;
    try {
      content = fs.readFileSync(abs, 'utf8');
    } catch {
      continue;
    }
    const links = extractLinks(content);
    for (const { target } of links) {
      // Resolve relative to the source file, then normalize back to repo-rel.
      const resolvedAbs = resolveLinkTarget(abs, target);
      // Only index links that resolve INSIDE the repo and end in .md.
      // External targets (already filtered upstream) and broken links are
      // skipped — broken links are someone else's problem (validate-links).
      if (!resolvedAbs.startsWith(root)) continue;
      if (!resolvedAbs.endsWith('.md')) continue;
      const targetRel = path
        .relative(root, resolvedAbs)
        .split(path.sep)
        .join('/');
      const sourceRel = rel.split(path.sep).join('/');
      if (!edges.has(targetRel)) edges.set(targetRel, new Set());
      // Self-references (a page linking to itself) are noise — skip.
      if (targetRel === sourceRel) continue;
      edges.get(targetRel).add(sourceRel);
    }
  }
  // Convert sets to sorted arrays for stable cache output. Stable order means
  // the cache file diff stays clean across regenerations even if the walk
  // order changes.
  const obj = {};
  for (const [k, v] of edges) {
    obj[k] = Array.from(v).sort();
  }
  return obj;
}

// Read or initialize the cache. Cache invalidation is implicit: we always
// rebuild the map on each run. The cache exists primarily as a debugging
// artifact + future incremental optimization point.
function readCache(cachePath) {
  if (!fs.existsSync(cachePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(cachePath, 'utf8'));
  } catch {
    return null;
  }
}

function writeCache(cachePath, edges) {
  const dir = path.dirname(cachePath);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    cachePath,
    JSON.stringify(
      { version: 1, generated_at: new Date().toISOString(), edges },
      null,
      2
    ) + '\n'
  );
}

// Find the LAST occurrence of `marker` that begins at the start of a line.
// Mentions inside inline-code spans or running prose are preceded by a
// non-newline character and skipped. Picking the LAST line-anchored hit also
// covers the rarer case of a doc that shows the marker in a fenced code block
// AND has a real auto-block at the bottom — the bottom one wins.
//
// Why this exists: a previous version used `content.indexOf(BLOCK_START)`,
// which matched the first prose mention inside an inline-code span and led
// the rewriter to insert an empty "## Backlinks" block mid-doc, corrupting
// the file. See [.claude/commands/sync-to-template.md](../../.claude/commands/sync-to-template.md)
// commit 49ef4d5 for the incident that motivated this fix.
function lastLineStartIndexOf(content, marker) {
  let from = content.length;
  while (from >= 0) {
    const idx = content.lastIndexOf(marker, from);
    if (idx === -1) return -1;
    if (idx === 0 || content[idx - 1] === '\n') return idx;
    from = idx - 1;
  }
  return -1;
}

// Rewrite the `## Backlinks` block at the bottom of `content` to reflect
// `referrers` (an array of repo-relative paths). Returns the new content.
//
// Behavior:
//   - If a marker block exists, replace its body in place.
//   - If the heading exists without markers, append markers after the heading
//     and treat anything between heading and next H2 as our territory.
//   - If neither exists and there ARE referrers, append a new section.
//   - If there are no referrers AND no existing block, return content
//     unchanged (don't litter empty Backlinks sections).
function rewriteBacklinks(content, referrers, sourceFileRel) {
  // Build the body of the block. Each entry is a relative-path link from the
  // CURRENT file's directory to the referrer. We compute this fresh per call
  // because the source file's depth dictates the link prefix.
  const sourceDir = path.posix.dirname(sourceFileRel);
  const linkLines = referrers.map((ref) => {
    const rel = path.posix.relative(sourceDir, ref) || ref;
    // Display text is the basename without extension — readable in IDE
    // outline view; full path is in the link target for navigation.
    const display = path.posix.basename(ref, '.md');
    return `- [${display}](${rel})`;
  });

  const header = `${BACKLINKS_HEADING}\n${BLOCK_START}\n`;
  const body = linkLines.length === 0
    ? '_No incoming links._\n'
    : linkLines.join('\n') + '\n';
  const block = header + body + BLOCK_END + '\n';

  // Case 1: marker block exists → replace from BLOCK_START backwards to the
  // heading (since they were written together) through BLOCK_END.
  const startIdx = lastLineStartIndexOf(content, BLOCK_START);
  const endIdx = lastLineStartIndexOf(content, BLOCK_END);
  if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
    // Walk backward from BLOCK_START to find the heading line above it (if any),
    // since we wrote them as a unit. We tolerate the user editing the heading
    // text (any `## …`) — we won't replace what we don't own.
    const beforeStart = content.slice(0, startIdx);
    const headingMatch = beforeStart.match(/##\s+Backlinks\s*\n$/);
    const replaceFrom = headingMatch
      ? startIdx - headingMatch[0].length
      : startIdx;
    const afterEnd = endIdx + BLOCK_END.length;
    // Preserve trailing newline conventions: collapse multiple blank lines
    // around the block into one to avoid drift over many regenerations.
    const tail = content.slice(afterEnd).replace(/^\n+/, '\n');
    return content.slice(0, replaceFrom).replace(/\n+$/, '\n') + '\n' + block + tail;
  }

  // Case 2: heading exists but no markers (legacy or hand-written). We
  // conservatively REPLACE from the heading to the next H2 (or EOF) — this
  // means hand-written backlink sections will be reformatted on first run,
  // which is the cost of letting the hook own this section.
  const headingRe = /^##\s+Backlinks\s*$/m;
  const headingFound = content.match(headingRe);
  if (headingFound) {
    const hStart = content.indexOf(headingFound[0]);
    // Find the next H2 after the heading (or use EOF).
    const after = content.slice(hStart + headingFound[0].length);
    const nextH2 = after.search(/\n##\s/);
    const sectionEnd = nextH2 === -1
      ? content.length
      : hStart + headingFound[0].length + nextH2 + 1; // +1 for the leading \n
    return (
      content.slice(0, hStart).replace(/\n+$/, '\n') +
      '\n' +
      block +
      content.slice(sectionEnd).replace(/^\n+/, '')
    );
  }

  // Case 3: no heading exists. Only add one if we have referrers — we don't
  // want to pollute every isolated note with empty Backlinks blocks.
  if (referrers.length === 0) return content;

  const trimmed = content.replace(/\s+$/, '');
  return trimmed + '\n\n' + block;
}

// Run `git add` on a file path. Used to re-stage files we just rewrote so
// the new content lands in the same commit. Errors are swallowed because
// this is a soft hook — failing to re-stage is recoverable on next commit.
function gitAddSilent(filePath) {
  try {
    execFileSync('git', ['add', '--', filePath], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

// Opt-in debug logger. Activated by `KORTEX_BACKREFS_DEBUG=1`; otherwise
// a no-op with zero overhead. Captures timestamp, PID/PPID (to detect
// duplicate invocations), staged set, edges count, and per-file decisions.
// Used to investigate the post-commit AGENTS.md side-effect bug observed
// 2026-05-02; left in place so future occurrences can be captured without
// re-instrumenting. Output: `.cache/update-backrefs-debug.log`.
function debugLog(root, payload) {
  if (process.env.KORTEX_BACKREFS_DEBUG !== '1') return;
  try {
    const dir = path.join(root, '.cache');
    fs.mkdirSync(dir, { recursive: true });
    const line = JSON.stringify({
      ts: new Date().toISOString(),
      pid: process.pid,
      ppid: process.ppid,
      ...payload,
    }) + '\n';
    fs.appendFileSync(path.join(dir, 'update-backrefs-debug.log'), line);
  } catch {
    // Never let logging break the hook.
  }
}

async function main() {
  const root = repoRoot();
  const staged = stagedFiles('.md');
  debugLog(root, { phase: 'start', staged });
  if (staged.length === 0) process.exit(0);

  // Build the full edge map fresh. Cheap on a small repo (~100ms for a few
  // hundred files); avoids stale cache bugs entirely.
  let edges;
  try {
    edges = buildEdgeMap(root);
  } catch (e) {
    // Soft hook — log and continue.
    console.warn(colors.yellow('update-backrefs: skipped (' + e.message + ')'));
    process.exit(0);
  }

  const cachePath = path.join(root, '.cache', 'backrefs.json');
  try {
    writeCache(cachePath, edges);
  } catch (e) {
    // Cache write failure is non-fatal; the rewrite below doesn't need it.
    console.warn(colors.yellow('update-backrefs: cache write failed (' + e.message + ')'));
  }

  debugLog(root, { phase: 'edges-built', edge_keys: Object.keys(edges).length });

  let rewriteCount = 0;
  for (const rel of staged) {
    const abs = path.join(root, rel);
    let content;
    try {
      content = fs.readFileSync(abs, 'utf8');
    } catch {
      continue;
    }
    const relKey = rel.split(path.sep).join('/');
    const refs = edges[relKey] || [];
    const newContent = rewriteBacklinks(content, refs, relKey);
    const willRewrite = newContent !== content;
    debugLog(root, {
      phase: 'process',
      rel: relKey,
      refs_count: refs.length,
      will_rewrite: willRewrite,
      writes_no_incoming: newContent.includes('_No incoming links._'),
    });
    if (willRewrite) {
      try {
        fs.writeFileSync(abs, newContent);
        gitAddSilent(rel);
        rewriteCount++;
      } catch (e) {
        console.warn(
          colors.yellow(`update-backrefs: could not rewrite ${rel} (${e.message})`)
        );
      }
    }
  }
  debugLog(root, { phase: 'done', rewrite_count: rewriteCount });

  if (rewriteCount > 0) {
    console.log(
      colors.gray(`update-backrefs: refreshed backlinks on ${rewriteCount} file(s)`)
    );
  }
  process.exit(0);
}

const isDirectInvocation =
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith('update-backrefs.mjs');

if (isDirectInvocation) {
  main().catch((e) => {
    // Soft: log + exit 0. We never want this hook to block a commit.
    console.warn(colors.yellow('update-backrefs: skipped (' + e.message + ')'));
    process.exit(0);
  });
}

export { rewriteBacklinks, buildEdgeMap };
