#!/usr/bin/env node
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

// Tunables for the unmigrated-NEXT detector. Declared up here so the
// constants exist before the top-level `await computeStatus(...)` block
// runs — Node ESM executes top-down and `const` is hoisted but in TDZ.
const TASK_VERBS = [
  'bug', 'fix', 'strip', 'audit', 'renumerar', 'renumber', 'rephrase',
  'refactor', 'rewrite', 'remove', 'eliminar', 'borrar', 'agregar',
  'add', 'implement', 'implementar', 'wire', 'crear', 'create',
  'migrate', 'migrar', 'cleanup', 'limpiar', 'rescatar',
];
const NEXT_LOOKBACK_SESSIONS = 5;

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
      const fwCount = status.framework_followups?.length ?? 0;
      const unmigrated = status.unmigrated_next_items?.length ?? 0;
      console.log(`${tag.ok()} status.json regenerated (${status.priorities.length} priorities, ${fwCount} framework followups, ${unmigrated} unmigrated NEXT, ${status.stale_count} stale, ${status.open_handoffs} open handoffs)`);
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
  const [
    priorities,
    stale_count,
    open_handoffs,
    framework_followups,
    in_progress_by_project,
    unmigrated_next_items,
  ] = await Promise.all([
    parseActivePriorities(root),
    countStaleWikiPages(root),
    countOpenHandoffs(root),
    parseFrameworkFollowups(root),
    parseInProgressByProject(root),
    detectUnmigratedNext(root),
  ]);
  return {
    generated_at: new Date().toISOString(),
    priorities,
    stale_count,
    open_handoffs,
    framework_followups,
    in_progress_by_project,
    unmigrated_next_items,
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

// Parse the `## Framework` section of TODO.md and return one followup per
// top-level bullet. We extract the first sentence (text up to the first
// period followed by space, or end of bullet) and cap at 200 chars so the
// post-it stays small. If §Framework is missing we return [].
//
// Why first-sentence-only: §Framework bullets carry long explanatory prose
// (rationale, context, history) that is useful when the owner reads TODO.md
// directly but noisy in bridge-in. The first sentence is the actionable
// title; everything after is "why".
export async function parseFrameworkFollowups(root) {
  const todoPath = path.join(root, 'TODO.md');
  if (!existsSync(todoPath)) return [];
  const body = await readFile(todoPath, 'utf8');
  const lines = body.split('\n');

  let i = 0;
  while (i < lines.length) {
    if (/^##\s+Framework\s*$/.test(lines[i])) break;
    i++;
  }
  if (i >= lines.length) return [];
  i++;

  const followups = [];
  while (i < lines.length) {
    const line = lines[i];
    if (/^##\s/.test(line) || /^---\s*$/.test(line)) break;
    // A top-level bullet is `- ` at column 0 (no leading spaces). Sub-bullets
    // are indented and belong to the prose of the parent.
    const m = line.match(/^- (.+)$/);
    if (m) {
      const title = firstSentence(m[1]);
      if (title) followups.push({ title });
    }
    i++;
  }
  return followups;
}

// Parse the `## Projects` section of TODO.md to extract per-project status
// strings. The format is two-line stanzas:
//
//   - [project-name](projects/project-name/TODO.md)
//     status: <one-line status string>
//
// We pair each project link with its status: line. Returns an object keyed
// by project slug.
export async function parseInProgressByProject(root) {
  const todoPath = path.join(root, 'TODO.md');
  if (!existsSync(todoPath)) return {};
  const body = await readFile(todoPath, 'utf8');
  const lines = body.split('\n');

  let i = 0;
  while (i < lines.length) {
    if (/^##\s+Projects\s*$/.test(lines[i])) break;
    i++;
  }
  if (i >= lines.length) return {};
  i++;

  const byProject = {};
  while (i < lines.length) {
    const line = lines[i];
    if (/^##\s/.test(line)) break;
    // Match `- [name](projects/name/TODO.md)` — capture the slug.
    const link = line.match(/^- \[([^\]]+)\]\(projects\/([^/]+)\/TODO\.md\)/);
    if (link) {
      const slug = link[2];
      // Look ahead for the next non-blank `status:` line within 3 lines.
      for (let j = i + 1; j < Math.min(i + 4, lines.length); j++) {
        const sm = lines[j].match(/^\s*status:\s*(.+)$/);
        if (sm) {
          byProject[slug] = truncate(stripMarkdownLinks(sm[1]).trim(), 200);
          break;
        }
      }
    }
    i++;
  }
  return byProject;
}

// Walk the most recent N session files and find NEXT items that look like
// concrete tasks but are NOT mentioned in TODO.md. This is the "lost work"
// detector — when a NEXT bullet says "Bug en X" or "Strip Y" but nobody
// migrated it to TODO.md §Framework, the next bridge-in surfaces it.
//
// Heuristic: split NEXT prose on sentence boundaries, keep candidates that
// start with a known task verb. Cross-check: if any compound identifier
// (e.g. `update-backrefs.mjs`) anywhere in the NEXT block appears in
// TODO.md, treat the whole block as migrated.
//
// This is intentionally noisy on the side of recall — false positives are
// cheap (owner ignores them); false negatives are exactly the failure mode
// we are trying to prevent.
//
// TASK_VERBS and NEXT_LOOKBACK_SESSIONS are declared at module scope above
// the top-level `await computeStatus(...)` block so they exist when the
// CLI entrypoint fires.
export async function detectUnmigratedNext(root) {
  const dir = path.join(root, 'output', 'sessions');
  if (!existsSync(dir)) return [];

  const todoPath = path.join(root, 'TODO.md');
  const todoBody = existsSync(todoPath) ? await readFile(todoPath, 'utf8') : '';

  const entries = await readdir(dir);
  const sessions = entries
    .filter((f) => /^\d{4}-\d{2}-\d{2}\.md$/.test(f))
    .sort()
    .reverse()
    .slice(0, NEXT_LOOKBACK_SESSIONS);

  const items = [];
  const seen = new Set();
  for (const f of sessions) {
    const body = await readFile(path.join(dir, f), 'utf8');
    for (const next of extractNextBlocks(body)) {
      // Block-level migration check: if ANY compound identifier in the
      // whole NEXT block is mentioned in TODO.md, treat the entire block as
      // migrated. Otherwise sub-sentences like "Fix: anchor the regex" surface
      // as orphans even when the parent bug ("Bug in update-backrefs.mjs")
      // is already tracked.
      if (mentionedInTodo(next, todoBody)) continue;
      for (const candidate of splitSentences(next)) {
        if (!looksLikeTask(candidate)) continue;
        const title = truncate(stripMarkdownLinks(candidate).trim(), 200);
        if (!title) continue;
        // Dedupe across sessions: the same NEXT often re-appears verbatim.
        const key = title.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        items.push({ title, from_session: f });
        // Only surface the first task-like sentence per block — sub-actions
        // ("Fix: ...", "Repro: ...") belong to the same item.
        break;
      }
    }
  }
  return items;
}

// Extract the body of every `**NEXT:**` line in the session file. NEXT can
// be a single sentence or a paragraph spanning to the next bold field
// (`**BLOCKERS:**`, `**STATE:**`, etc.) or end of section.
function* extractNextBlocks(body) {
  const lines = body.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^\*\*NEXT:\*\*\s*(.*)$/);
    if (!m) continue;
    let text = m[1];
    let j = i + 1;
    while (j < lines.length) {
      const nl = lines[j];
      // Stop at next bold field, header, or blank line followed by header.
      if (/^\*\*[A-Z][A-Z ]+:\*\*/.test(nl)) break;
      if (/^#{1,6}\s/.test(nl)) break;
      if (nl.trim() === '') {
        // tolerate one blank line, bail if next non-blank is a new field
        let k = j + 1;
        while (k < lines.length && lines[k].trim() === '') k++;
        if (k >= lines.length || /^\*\*[A-Z]/.test(lines[k]) || /^#{1,6}\s/.test(lines[k])) break;
        text += ' ';
        j = k;
        continue;
      }
      text += ' ' + nl.trim();
      j++;
    }
    yield text.trim();
    i = j - 1;
  }
}

// Split a paragraph into sentence-ish candidates. We use sentence-final
// punctuation followed by space + capital letter, plus semicolons. This
// is rough — perfectly acceptable for a heuristic detector.
function splitSentences(text) {
  return text
    .split(/(?<=[.!?;])\s+(?=[A-ZÁÉÍÓÚÑ(])/)
    .map((s) => s.trim())
    .filter(Boolean);
}

// True if the sentence starts with (or contains in the first 5 words) a
// known task verb. We accept either prefix or near-prefix because Spanish
// often opens with subject ("Bug en X") or article ("Strip de la propiedad").
function looksLikeTask(sentence) {
  const head = sentence.toLowerCase().split(/\s+/).slice(0, 5).join(' ');
  // strip markdown emphasis so `**bug**` matches `bug`
  const clean = head.replace(/[`*_]/g, '');
  return TASK_VERBS.some((v) => new RegExp(`\\b${v}\\b`).test(clean));
}

// True if any 6+ character identifier from the sentence appears in TODO.md.
// Identifier = word with a dot or hyphen (e.g. `update-backrefs.mjs`,
// `frontmatter.json`, `sync-eligibility`). Plain words are not enough —
// "audit" matches too liberally — but compound identifiers are reliable
// signals that the work was tracked.
function mentionedInTodo(sentence, todoBody) {
  const identifiers = sentence.match(/[a-zA-Z0-9_-]{4,}[.\-/][a-zA-Z0-9_./-]+/g) || [];
  if (identifiers.length === 0) return false;
  return identifiers.some((id) => todoBody.includes(id));
}

// Take the first sentence of a string (up to first sentence-final
// punctuation followed by space+capital, or end). Falls back to truncated
// input if no boundary is found. Bold-prefixed bullets (`**Title.**
// rationale...`) return just the bold title.
function firstSentence(s) {
  // If the bullet opens with `**...**`, return that as-is — it is the
  // pre-formatted title and any following prose is rationale.
  const bold = s.match(/^\*\*([^*]+?)\*\*/);
  if (bold) return truncate(stripMarkdownLinks(bold[1]).trim().replace(/[.:]+$/, ''), 200);
  const m = s.match(/^(.+?[.!?])(\s+[A-ZÁÉÍÓÚÑ(]|\s*$)/);
  const out = m ? m[1] : s;
  return truncate(stripMarkdownLinks(out).trim(), 200);
}

function stripMarkdownLinks(s) {
  return s.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
}

function truncate(s, max) {
  if (s.length <= max) return s;
  return s.slice(0, max - 1).trimEnd() + '…';
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
