#!/usr/bin/env node
//
// Kortex `build-index` — rebuild every INDEX.md from the filesystem.
//
// Why this exists: INDEX.md was specified in AGENTS.md §5 as a manual
// contract ("every .md file appears in exactly one INDEX.md"). In
// practice, the migration auto-generated all INDEX bodies, `ingest`
// only appends, and humans rarely curate them. Treating INDEX.md as a
// generated artifact is honest about what it actually is and closes
// the drift gap (file added → invisible in INDEX).
//
// Scope of one rebuild:
//   - We rewrite ONLY the body sections we own.
//   - The INDEX's own frontmatter is preserved (only `updated:` is bumped).
//   - The `## Backlinks` block at the bottom is owned by the
//     update-backrefs hook and is preserved verbatim.
//   - Any prose between the H1 and the first auto-section is preserved
//     (intro paragraph). On first run we wrap the generated body in
//     `<!-- build-index:start --> / <!-- build-index:end -->` markers so
//     subsequent runs are unambiguous.
//
// Two modes per INDEX:
//   - Aggregate — list every .md under the index's directory, grouped by
//     first-level subfolder. Used at wiki/, output/, projects/<name>/,
//     learnings/<name>/.
//   - Container — the immediate subdirectories each have their own
//     INDEX.md, so we just list those subdirectories. Used at projects/
//     and learnings/. Auto-detected.
//
// Spec exclusions per AGENTS.md §5:
//   - INDEX.md itself
//   - Root-of-repo: AGENTS.md, CLAUDE.md, README.md, index.md (at the
//     literal repo root, NOT inside zones/projects)
//   - Everything under .claude/, .git/, node_modules/, .cache/, .husky/
//   - output/sessions/ contents — folder is mentioned with file count
//     instead of enumerated
//
// Flags:
//   --dry-run    print which INDEX files would change, no writes
//   --check      exit 1 if any INDEX is out of date (CI mode)
//   --only <p>   rebuild only the INDEX.md at this path (relative to repo)

import { parseArgs } from 'node:util';
import { readFile, writeFile, readdir, stat } from 'node:fs/promises';
import { existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { parseFile, parseString, stringify } from '../lib/frontmatter.mjs';
import { colors, tag } from '../lib/colors.mjs';

const { values } = parseArgs({
  options: {
    'dry-run': { type: 'boolean', default: false },
    check: { type: 'boolean', default: false },
    only: { type: 'string' },
    repo: { type: 'string' },
    date: { type: 'string' },                   // override today (tests)
    help: { type: 'boolean', short: 'h', default: false },
  },
  strict: false,
});

if (values.help) {
  printHelp();
  process.exit(0);
}

const repoRoot = values.repo ? path.resolve(values.repo) : findRepoRoot(process.cwd());
const today = values.date || new Date().toISOString().slice(0, 10);

const SKIP_DIRS = new Set(['.git', 'node_modules', '.cache', '.husky', '.pnpm-store', '.claude']);
// Files at the literal repo root that never get indexed anywhere.
const ROOT_EXCLUDE = new Set(['AGENTS.md', 'CLAUDE.md', 'README.md', 'index.md', 'TODO.md', 'log.md', 'JOURNAL.md', 'INBOX.md']);

const BLOCK_START = '<!-- build-index:start -->';
const BLOCK_END = '<!-- build-index:end -->';

const indexFiles = values.only
  ? [path.join(repoRoot, values.only)]
  : await findAllIndexFiles(repoRoot);

let changedCount = 0;
let unchangedCount = 0;
const changedPaths = [];

for (const indexAbs of indexFiles) {
  const result = await rebuildOne(indexAbs);
  if (result.changed) {
    changedCount++;
    changedPaths.push(path.relative(repoRoot, indexAbs));
  } else {
    unchangedCount++;
  }
}

if (values.check) {
  if (changedCount > 0) {
    console.log(`${tag.fail()} ${changedCount} INDEX.md out of date:`);
    for (const p of changedPaths) console.log(`  ${colors.cyan(p)}`);
    process.exit(1);
  }
  console.log(`${tag.ok()} All ${unchangedCount} INDEX.md up to date.`);
  process.exit(0);
}

const verb = values['dry-run'] ? 'would update' : 'updated';
if (changedCount === 0) {
  console.log(`${tag.ok()} All ${unchangedCount} INDEX.md already up to date.`);
} else {
  console.log(`${tag.ok()} ${verb} ${changedCount} INDEX.md (${unchangedCount} unchanged):`);
  for (const p of changedPaths) console.log(`  ${colors.cyan(p)}`);
}

// =====================================================================
// Discovery
// =====================================================================

async function findAllIndexFiles(root) {
  const out = [];
  async function recurse(dir) {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const ent of entries) {
      if (SKIP_DIRS.has(ent.name)) continue;
      if (ent.name.startsWith('.')) continue;
      const abs = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        await recurse(abs);
      } else if (ent.name === 'INDEX.md') {
        out.push(abs);
      }
    }
  }
  await recurse(root);
  return out.sort();
}

// =====================================================================
// One rebuild
// =====================================================================

async function rebuildOne(indexAbs) {
  const indexDir = path.dirname(indexAbs);
  const indexRel = path.relative(repoRoot, indexAbs);

  // Preserve the index's own frontmatter and the intro/backlinks regions.
  const original = await readFile(indexAbs, 'utf8');
  const parsed = parseString(original);

  // Decide aggregate vs container mode.
  const mode = await detectMode(indexDir);

  // Build the body.
  let generatedBody;
  if (mode === 'container') {
    generatedBody = await renderContainer(indexDir);
  } else {
    generatedBody = await renderAggregate(indexDir);
  }

  // Compose the new full file.
  const newContent = composeIndexFile(parsed, generatedBody);

  // No-op if nothing changed.
  if (newContent === original) {
    return { changed: false, indexRel };
  }

  if (!values['dry-run'] && !values.check) {
    await writeFile(indexAbs, newContent);
  }
  return { changed: true, indexRel };
}

// Aggregate vs container: container = at least one immediate subdirectory
// has its own INDEX.md (this dir is acting as a zone-of-zones, e.g.
// projects/ or learnings/). Subdirectories that lack their own INDEX.md
// still get listed as bare folder links — that's how a new project
// stub appears in the parent index before its own INDEX is created.
//
// Aggregate is the default everywhere else: zero subdirs with INDEX.md,
// or no subdirs at all.
async function detectMode(indexDir) {
  let entries;
  try {
    entries = await readdir(indexDir, { withFileTypes: true });
  } catch {
    return 'aggregate';
  }
  const subdirs = entries
    .filter((e) => e.isDirectory() && !SKIP_DIRS.has(e.name) && !e.name.startsWith('.'));
  if (subdirs.length === 0) return 'aggregate';
  for (const sd of subdirs) {
    if (existsSync(path.join(indexDir, sd.name, 'INDEX.md'))) return 'container';
  }
  return 'aggregate';
}

// =====================================================================
// Aggregate mode — every .md under indexDir, grouped by first-level subfolder.
// =====================================================================

async function renderAggregate(indexDir) {
  const groups = new Map();           // groupName -> [{ relFromIndex, ... }]

  async function walk(absDir, relFromIndex) {
    let entries;
    try {
      entries = await readdir(absDir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const ent of entries) {
      if (SKIP_DIRS.has(ent.name)) continue;
      if (ent.name.startsWith('.')) continue;
      // Skip symlinks. CLAUDE.md is a symlink to AGENTS.md in every project,
      // so listing both would duplicate every project entry. The convention
      // (per AGENTS.md §12 write-authority) is that AGENTS.md is canonical.
      if (ent.isSymbolicLink && ent.isSymbolicLink()) continue;
      const abs = path.join(absDir, ent.name);
      const rel = relFromIndex ? `${relFromIndex}/${ent.name}` : ent.name;

      if (ent.isDirectory()) {
        // Special case per AGENTS.md §5: output/sessions/ is mentioned by
        // count, not enumerated. We detect this by checking if we are
        // inside output/ and the subdir name is "sessions".
        if (relFromIndex === '' && ent.name === 'sessions' &&
            path.basename(indexDir) === 'output') {
          const count = await countMd(abs);
          if (count > 0) {
            getGroup(groups, 'sessions').push({
              specialFolderRef: true,
              relFromIndex: 'sessions/',
              title: 'sessions/',
              description: `${count} session note${count === 1 ? '' : 's'} (browsable via filesystem)`,
              tags: [],
            });
          }
          continue;
        }
        await walk(abs, rel);
        continue;
      }

      if (!ent.name.endsWith('.md')) continue;
      if (ent.name === 'INDEX.md') continue;

      // Repo-root excludes only apply if we're at repo root. Inside a zone
      // or project, AGENTS.md/README.md/INBOX.md/etc are valid index entries.
      if (path.resolve(absDir) === path.resolve(repoRoot) && ROOT_EXCLUDE.has(ent.name)) {
        continue;
      }

      // Skip files that fall under another INDEX.md's scope. We detect
      // this by checking whether any *parent* directory (between indexDir
      // and absDir) has its own INDEX.md.
      if (await fileFallsUnderNestedIndex(indexDir, abs)) continue;

      const entry = await buildEntry(abs, rel);
      if (!entry) continue;

      // Group by first path segment of relFromIndex; '' means "Top-level".
      const firstSlash = rel.indexOf('/');
      const group = firstSlash === -1 ? 'Top-level' : rel.slice(0, firstSlash) + '/';
      getGroup(groups, group).push(entry);
    }
  }

  await walk(indexDir, '');

  // Sort entries within each group by path.
  for (const arr of groups.values()) {
    arr.sort((a, b) => a.relFromIndex.localeCompare(b.relFromIndex));
  }

  // Build sorted group order: Top-level first, then alphabetical.
  const groupNames = [...groups.keys()].sort((a, b) => {
    if (a === 'Top-level') return -1;
    if (b === 'Top-level') return 1;
    return a.localeCompare(b);
  });

  const lines = [];
  for (const g of groupNames) {
    const items = groups.get(g) || [];
    if (!items.length) continue;
    lines.push(`## ${g === 'Top-level' ? 'Top-level' : capitalize(g.replace(/\/$/, ''))}`);
    lines.push('');
    for (const it of items) {
      lines.push(formatEntry(it));
    }
    lines.push('');
  }

  return lines.join('\n').replace(/\n+$/, '\n');
}

async function fileFallsUnderNestedIndex(indexDir, fileAbs) {
  // Walk up from fileAbs's directory toward indexDir; if any intermediate
  // directory has an INDEX.md, this file belongs to that nested index.
  let dir = path.dirname(fileAbs);
  const stop = path.resolve(indexDir);
  while (path.resolve(dir) !== stop) {
    if (existsSync(path.join(dir, 'INDEX.md'))) return true;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return false;
}

// =====================================================================
// Container mode — list child folders, each with its own INDEX.md.
// =====================================================================

async function renderContainer(indexDir) {
  let entries;
  try {
    entries = await readdir(indexDir, { withFileTypes: true });
  } catch {
    return '';
  }

  const childRows = [];
  const topLevelRows = [];

  for (const ent of entries) {
    if (ent.name.startsWith('.')) continue;
    if (SKIP_DIRS.has(ent.name)) continue;
    if (ent.isSymbolicLink && ent.isSymbolicLink()) continue;
    const abs = path.join(indexDir, ent.name);

    if (ent.isDirectory()) {
      const childIndex = path.join(abs, 'INDEX.md');
      const agents = path.join(abs, 'AGENTS.md');
      const readme = path.join(abs, 'README.md');
      // Prefer AGENTS.md for the link target (matches the migration
      // convention), fall back to INDEX.md, then README.md, then the
      // bare folder. A subfolder without any of those still gets listed
      // — that's how a new stub project shows up in the parent index
      // before its own INDEX has been created.
      let linkAbs = null;
      if (existsSync(agents)) linkAbs = agents;
      else if (existsSync(childIndex)) linkAbs = childIndex;
      else if (existsSync(readme)) linkAbs = readme;
      if (linkAbs) {
        const entry = await buildEntry(linkAbs, `${ent.name}/${path.basename(linkAbs)}`);
        if (entry) {
          entry.title = ent.name;
          entry.relFromIndex = `${ent.name}/${path.basename(linkAbs)}`;
          childRows.push(entry);
        } else {
          childRows.push({ relFromIndex: `${ent.name}/`, title: ent.name, description: '', tags: [] });
        }
      } else {
        childRows.push({ relFromIndex: `${ent.name}/`, title: ent.name, description: '', tags: [] });
      }
      continue;
    }

    if (!ent.name.endsWith('.md')) continue;
    if (ent.name === 'INDEX.md') continue;
    if (ROOT_EXCLUDE.has(ent.name) && path.resolve(indexDir) === path.resolve(repoRoot)) {
      continue;
    }
    const entry = await buildEntry(abs, ent.name);
    if (entry) topLevelRows.push(entry);
  }

  childRows.sort((a, b) => a.title.localeCompare(b.title));
  topLevelRows.sort((a, b) => a.relFromIndex.localeCompare(b.relFromIndex));

  const lines = [];
  for (const r of childRows) {
    lines.push(formatEntry(r));
  }
  if (topLevelRows.length) {
    lines.push('');
    lines.push('## Top-level');
    lines.push('');
    for (const r of topLevelRows) lines.push(formatEntry(r));
  }
  lines.push('');
  return lines.join('\n').replace(/\n+$/, '\n');
}

// =====================================================================
// Per-file extraction
// =====================================================================

async function buildEntry(absPath, relFromIndex) {
  let parsed;
  try {
    parsed = parseFile(absPath);
  } catch {
    return null;
  }
  const data = parsed.data || {};
  const rawTitle = (data.title && String(data.title).trim()) || path.basename(absPath, '.md');
  // Strip any embedded markdown links from the title — their relative
  // paths are computed against the source file's depth, not against the
  // INDEX's depth, so echoing them verbatim breaks link validation.
  // `[text](url)` -> `text`; backticks left untouched (they are inert).
  const title = rawTitle.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1');
  const description = extractDescription(parsed.content || '');
  const tags = Array.isArray(data.tags) ? data.tags : [];
  return {
    relFromIndex,
    title,
    description,
    tags,
  };
}

function formatEntry(entry) {
  const linkText = `[${entry.title}](${entry.relFromIndex})`;
  const tagPart = entry.tags && entry.tags.length
    ? ` \`${entry.tags.join(', ')}\``
    : '';
  if (entry.description) {
    return `- **${linkText}** — ${entry.description}${tagPart}`;
  }
  return `- **${linkText}**${tagPart}`;
}

// Extract a one-line description from the body. Skips frontmatter (already
// removed by parseFile), headings, blank lines, horizontal rules,
// blockquote markers ('>'), template placeholders ('{{...}}'). Strips
// markdown link syntax (`[text](url)` -> `text`) and leading
// `**Summary:**`-style markers. Truncates at the first sentence boundary
// or 110 chars, whichever is shorter.
export function extractDescription(body) {
  const lines = body.split('\n');
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith('#')) continue;
    if (line.startsWith('---')) continue;        // horizontal rule
    if (line.startsWith('<!--')) continue;
    if (line.startsWith('>')) continue;          // blockquote — informative but verbose
    if (line.startsWith('|')) continue;          // table row
    if (line.startsWith('```')) continue;        // code fence
    if (line.startsWith('{{') && line.endsWith('}}')) continue;
    // Skip bullet-list lines. If the body opens with a list (e.g. an
    // idea note with `- Título: ...`), there is no useful single-line
    // description to extract — better empty than a fragment of metadata.
    if (/^[-*+]\s+/.test(line)) continue;
    let s = line;
    // Strip [text](url) -> text.
    s = s.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1');
    // Strip leading bold-prefix labels like "**Summary:** ", "**Status:** ".
    s = s.replace(/^\*\*[^*]+:\*\*\s*/, '');
    // Strip ALL bold markers (`**text**`) globally — emphasis adds noise
    // to a one-line description and partial truncation leaves stray `**`.
    s = s.replace(/\*\*/g, '');
    // Strip surrounding italic markers.
    s = s.replace(/^\*+|\*+$/g, '');
    // Collapse whitespace.
    s = s.replace(/\s+/g, ' ').trim();
    if (!s) continue;
    return truncateAtSentence(s, 110);
  }
  return '';
}

function truncateAtSentence(s, maxLen) {
  if (s.length <= maxLen) {
    // Cut at first sentence boundary if one exists in the first maxLen.
    const m = s.match(/^(.+?[.!?])\s/);
    return m ? m[1] : s;
  }
  // Over maxLen — find the last word boundary inside the window.
  const window = s.slice(0, maxLen);
  const lastSpace = window.lastIndexOf(' ');
  const cut = lastSpace > 40 ? window.slice(0, lastSpace) : window;
  return cut + '…';
}

// =====================================================================
// File composition
// =====================================================================

function composeIndexFile(parsed, generatedBody) {
  // Frontmatter: keep all keys, bump `updated` to today.
  const data = { ...(parsed.data || {}) };
  data.updated = today;

  const body = parsed.content || '';
  const { intro, backlinks } = splitBody(body);

  const innerLines = [
    '',
    BLOCK_START,
    '',
    generatedBody.trimEnd(),
    '',
    BLOCK_END,
    '',
  ];

  // Reassemble: intro (already includes the H1 if present) + auto block +
  // backlinks block.
  const newBody = [
    intro.trimEnd(),
    innerLines.join('\n'),
    backlinks ? backlinks.trim() : '',
  ].filter(Boolean).join('\n\n') + '\n';

  return stringify(data, newBody);
}

// Split the existing body into:
//   intro     — everything from the start through the line before the
//               managed block (or the first ## that isn't `## Backlinks`).
//   backlinks — the `## Backlinks` section to the end (preserved verbatim).
function splitBody(body) {
  const lines = body.split('\n');
  let backlinksStart = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^##\s+Backlinks\b/i.test(lines[i])) {
      backlinksStart = i;
      break;
    }
  }
  const beforeBacklinks = backlinksStart === -1 ? lines : lines.slice(0, backlinksStart);
  const backlinks = backlinksStart === -1 ? '' : lines.slice(backlinksStart).join('\n');

  // Now in the pre-backlinks region, find where the managed block starts.
  // First preference: existing markers. Second: the first line that looks
  // like generated content — a `## ` heading OR a list item. Anything
  // before that is intro prose. Listing the cut on list items matters
  // because the migration-generated INDEXes (projects/, learnings/) put
  // child folders as bullet lines before the first `## ` section, and
  // that bullet block is exactly what we are about to replace.
  const region = beforeBacklinks.join('\n');
  const startMarker = region.indexOf(BLOCK_START);
  let intro;
  if (startMarker !== -1) {
    intro = region.slice(0, startMarker);
  } else {
    let cut = -1;
    for (let i = 0; i < beforeBacklinks.length; i++) {
      const ln = beforeBacklinks[i];
      if (/^##\s+/.test(ln)) { cut = i; break; }
      if (/^[-*+]\s+/.test(ln)) { cut = i; break; }
    }
    intro = cut === -1 ? region : beforeBacklinks.slice(0, cut).join('\n');
  }
  // Scrub any leftover generated content from the intro: bullet lines,
  // sub-headings (`## ...`), and `<!-- build-index:end -->` markers all
  // mean we're looking at content that should be replaced. The intro
  // ends at the first such line. (This catches the case where a previous
  // run left bullets in the intro region by accident.)
  intro = scrubIntro(intro);
  return { intro, backlinks };
}

function scrubIntro(intro) {
  const lines = intro.split('\n');
  let cut = lines.length;
  for (let i = 0; i < lines.length; i++) {
    const ln = lines[i];
    if (/^##\s+/.test(ln)) { cut = i; break; }
    if (/^[-*+]\s+/.test(ln)) { cut = i; break; }
    if (ln.includes(BLOCK_END)) { cut = i; break; }
  }
  return lines.slice(0, cut).join('\n').replace(/\n+$/, '');
}

// =====================================================================
// Helpers
// =====================================================================

async function countMd(absDir) {
  let entries;
  try {
    entries = await readdir(absDir, { withFileTypes: true });
  } catch {
    return 0;
  }
  let n = 0;
  for (const ent of entries) {
    if (ent.isDirectory()) continue;
    if (ent.name.endsWith('.md')) n++;
  }
  return n;
}

function getGroup(groups, name) {
  if (!groups.has(name)) groups.set(name, []);
  return groups.get(name);
}

function capitalize(s) {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
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
  console.log('Usage: pnpm kortex build-index [--dry-run] [--check] [--only <path>]');
  console.log('');
  console.log('Rebuild every INDEX.md in the repo from filesystem + frontmatter.');
  console.log('Two modes auto-detected per index:');
  console.log('  aggregate — list every .md under the index, grouped by subfolder');
  console.log('  container — list child folders that each have their own INDEX.md');
  console.log('');
  console.log('What is preserved verbatim:');
  console.log('  - the index\'s own YAML frontmatter (only `updated:` is bumped)');
  console.log('  - any prose between the H1 and the first auto-section');
  console.log('  - the `## Backlinks` block at the bottom (owned by update-backrefs)');
  console.log('');
  console.log('Flags:');
  console.log('  --dry-run         show which INDEX would change, write nothing');
  console.log('  --check           exit 1 if any INDEX is stale (CI mode)');
  console.log('  --only <path>     rebuild a single INDEX (path relative to repo)');
}
