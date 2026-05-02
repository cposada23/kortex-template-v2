#!/usr/bin/env node
//
// Kortex `ingest` — process all inbox locations.
//
// Inboxes (per CLAUDE.md auto-index rule + idea-frontmatter):
//   inbox/                       — global text/file drops
//   projects/<name>/inbox/       — project-scoped
//   sources/courses/<name>/inbox/ — (legacy v1; v2 uses learnings/)
//   learnings/<name>/inbox/      — course-scoped (v2 rename)
//
// What this script does:
//   1. Scan every inbox; collect markdown files (text drops are also .md).
//   2. For each item:
//      a. Read frontmatter.
//      b. If `type: idea`, route by `target_channel` (NOT by inbox path).
//         An idea in /inbox/ with target_channel: milo-ia goes to milo-ia
//         regardless of where it was dropped.
//      c. Else, route by inbox location:
//         - global / course → wiki/<subzone>/
//         - project → that project's references/ folder
//   3. Move file to destination, append entry to the relevant INDEX.md.
//   4. Move source to processed/ subfolder so re-scans don't re-route it.
//
// What this script does NOT do:
//   - Generate the destination page from scratch. It moves. Page content is
//     authored by the model when it captures the file in the first place.
//   - Re-interpret idea frontmatter. The schema is the contract; we route.
//
// Mode flags:
//   --dry-run   plan only — don't move anything, just print what would move
//   --inbox X   restrict to a single inbox path (relative to repo root)

import { parseArgs } from 'node:util';
import { readFile, writeFile, mkdir, readdir, rename, appendFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { parseFile } from '../lib/frontmatter.mjs';
import { colors, tag } from '../lib/colors.mjs';

const { values } = parseArgs({
  options: {
    'dry-run': { type: 'boolean', default: false },
    inbox: { type: 'string' },                              // restrict to single inbox
    repo: { type: 'string' },                               // override repo root (tests)
    help: { type: 'boolean', short: 'h', default: false },
  },
  strict: false,
});

if (values.help) {
  printHelp();
  process.exit(0);
}

const repoRoot = values.repo ? path.resolve(values.repo) : findRepoRoot(process.cwd());
const dryRun = values['dry-run'];

const report = {
  inboxes_scanned: 0,
  items_processed: 0,
  items_skipped: 0,
  pages_moved: 0,
  index_updates: new Set(),
  needs_routing: [],
  errors: [],
};

// Step 1: enumerate inbox locations. We support `--inbox X` to constrain
// the scan to one location (used during testing or when the user wants to
// process only a project's inbox without touching the global).
const inboxes = values.inbox
  ? [path.resolve(repoRoot, values.inbox)]
  : await discoverInboxes(repoRoot);

for (const inbox of inboxes) {
  if (!existsSync(inbox)) continue;
  await processInbox(inbox);
  report.inboxes_scanned++;
}

// Final report. We use plain text, not JSON, because the consumer is a
// human (or Claude reading subprocess output) — JSON adds noise. A future
// `--json` flag could re-emit machine-readable output if needed.
printReport(report);

// =====================================================================
// Discover inbox directories under the repo root.
// =====================================================================

async function discoverInboxes(root) {
  const out = [];
  // Global inbox
  out.push(path.join(root, 'inbox'));

  // Per-project inboxes
  const projectsDir = path.join(root, 'projects');
  if (existsSync(projectsDir)) {
    for (const name of await readdir(projectsDir)) {
      const inbox = path.join(projectsDir, name, 'inbox');
      if (existsSync(inbox)) out.push(inbox);
    }
  }

  // Per-course inboxes (v2 rename: learnings/; v1 path sources/courses/
  // also supported during migration).
  for (const top of ['learnings', 'sources/courses']) {
    const dir = path.join(root, top);
    if (!existsSync(dir)) continue;
    for (const name of await readdir(dir)) {
      const inbox = path.join(dir, name, 'inbox');
      if (existsSync(inbox)) out.push(inbox);
    }
  }

  return out;
}

// =====================================================================
// Process one inbox folder.
// =====================================================================

async function processInbox(inboxDir) {
  const entries = await readdir(inboxDir, { withFileTypes: true });
  for (const ent of entries) {
    if (ent.isDirectory()) {
      // Skip the processed/ subfolder — that's the trail of past ingests.
      // Skip drop/ (file drops) on this pass; they need different handling
      // (binary assets) which we leave to a future iteration.
      if (ent.name === 'processed' || ent.name === 'drop') continue;
      continue;
    }
    if (!ent.name.endsWith('.md')) continue;
    if (ent.name === 'INBOX.md' || ent.name === 'INDEX.md') continue;

    const filePath = path.join(inboxDir, ent.name);
    try {
      await routeItem(filePath, inboxDir);
      report.items_processed++;
    } catch (err) {
      report.errors.push({ file: filePath, error: err.message });
      report.items_skipped++;
    }
  }
}

// =====================================================================
// Routing decision for a single item.
// =====================================================================

// The contract: each item lands somewhere persistent (or stays in inbox
// flagged needs-routing). The decision tree is:
//   1. If type:idea AND target_channel set → route by target_channel.
//   2. If type:idea AND no target_channel → leave + flag.
//   3. Otherwise: route by inbox location.
async function routeItem(filePath, inboxDir) {
  const parsed = parseFile(filePath);
  const fm = parsed.data || {};
  const isIdea = fm.type === 'idea';

  let destFolder;
  let indexFile;

  if (isIdea) {
    const channel = fm.target_channel;
    if (!channel || channel === 'cross-project') {
      report.needs_routing.push(path.relative(repoRoot, filePath));
      return; // leave in inbox
    }
    // Idea routing: every channel maps to a project under projects/<channel>/.
    // Within the project we sort by `status` (per idea-frontmatter.md).
    const projectDir = path.join(repoRoot, 'projects', channel);
    if (!existsSync(projectDir)) {
      throw new Error(`target_channel "${channel}" — projects/${channel}/ does not exist`);
    }
    destFolder = ideaDestForStatus(projectDir, fm.status);
    indexFile = path.join(projectDir, 'INDEX.md');
  } else {
    // Generic markdown — route by physical inbox location.
    const inboxKind = classifyInbox(inboxDir);
    if (inboxKind.kind === 'global' || inboxKind.kind === 'course') {
      // Lasting knowledge → wiki/. We pick a section based on type:
      // concept → concepts/, playbook → playbooks/, decision → decisions/,
      // reference → references/. Default falls to references/ which is the
      // "inbox of synthesized material" in v2.
      const section = wikiSectionForType(fm.type);
      destFolder = path.join(repoRoot, 'wiki', section);
      indexFile = path.join(repoRoot, 'wiki', 'INDEX.md');
    } else if (inboxKind.kind === 'project') {
      destFolder = path.join(inboxKind.projectDir, 'references');
      indexFile = path.join(inboxKind.projectDir, 'INDEX.md');
    } else {
      throw new Error(`unknown inbox kind for ${inboxDir}`);
    }
  }

  // Move + index. Moving is atomic on local fs; if it fails partway we
  // surface and stop (no half-state).
  await mkdir(destFolder, { recursive: true });
  const destPath = path.join(destFolder, path.basename(filePath));
  if (existsSync(destPath)) {
    throw new Error(`destination already exists: ${path.relative(repoRoot, destPath)}`);
  }

  if (dryRun) {
    console.log(`${tag.info()} would move ${path.relative(repoRoot, filePath)} -> ${path.relative(repoRoot, destPath)}`);
    return;
  }

  await rename(filePath, destPath);
  report.pages_moved++;

  // Update the relevant INDEX.md. We append a one-liner — restructuring
  // happens during /health, not /ingest.
  await appendIndexEntry(indexFile, destPath, fm);
  report.index_updates.add(path.relative(repoRoot, indexFile));

  // Drop a marker into processed/ so the source path is preserved as a
  // breadcrumb (per CLAUDE.md: "processed/ folders are permanent — never
  // delete their contents"). For v2 we just drop a stub note.
  await mkdir(path.join(inboxDir, 'processed'), { recursive: true });
  await writeFile(
    path.join(inboxDir, 'processed', `${path.basename(filePath)}.moved`),
    `Moved to: ${path.relative(repoRoot, destPath)}\nAt: ${new Date().toISOString()}\n`,
  );
}

// =====================================================================
// Routing helpers — pure
// =====================================================================

// Classify which kind of inbox a path is. The classification drives the
// generic-markdown destination logic above.
export function classifyInbox(inboxDir) {
  const norm = inboxDir.replace(/\/+$/, '');
  // /inbox at the repo root
  if (path.basename(norm) === 'inbox' && path.basename(path.dirname(norm)) !== 'projects' && path.basename(path.dirname(norm)) !== 'sources' && path.basename(path.dirname(norm)) !== 'learnings') {
    return { kind: 'global' };
  }
  // projects/<name>/inbox
  const segs = norm.split(path.sep);
  const ix = segs.lastIndexOf('inbox');
  if (ix >= 2) {
    const parentName = segs[ix - 2];
    if (parentName === 'projects') {
      return { kind: 'project', projectDir: segs.slice(0, ix).join(path.sep) };
    }
    if (parentName === 'learnings' || parentName === 'sources') {
      return { kind: 'course', projectDir: segs.slice(0, ix).join(path.sep) };
    }
  }
  return { kind: 'unknown' };
}

// Map an idea's status to its destination folder under the channel project.
// Per the Milo IA convention:
//   reserva     → ideation-bank/reserva/
//   regalable   → ideation-bank/regalables/
//   in-production / ready-to-publish / published → piezas/
//   archivada / rejected-at-validation → ideation-bank/archived/
//   anything else (inbox, in-validation, in-testing) → ideation-bank/triage/
export function ideaDestForStatus(projectDir, status) {
  const bank = path.join(projectDir, 'ideation-bank');
  switch (status) {
    case 'reserva': return path.join(bank, 'reserva');
    case 'regalable': return path.join(bank, 'regalables');
    case 'in-production':
    case 'ready-to-publish':
    case 'published':
      return path.join(projectDir, 'piezas');
    case 'archivada':
    case 'rejected-at-validation':
      return path.join(bank, 'archived');
    default:
      return path.join(bank, 'triage');
  }
}

// Map a generic markdown type to a wiki/ subfolder. We collapse aggressively
// because v2 wiki sections are: concepts, playbooks, decisions, references,
// areas. Anything we don't recognize lands in references/.
export function wikiSectionForType(type) {
  switch (type) {
    case 'concept': return 'concepts';
    case 'playbook': return 'playbooks';
    case 'adr':
    case 'decision': return 'decisions';
    case 'area': return 'areas';
    default: return 'references';
  }
}

// =====================================================================
// INDEX append helpers.
// =====================================================================

// Append a one-liner entry to the relevant INDEX.md. We do not re-sort or
// merge — just append at the bottom under a generic "## Recently ingested"
// section that we create if absent. /health (and Doc-writer's regen) will
// rationalize the structure later.
async function appendIndexEntry(indexFile, destPath, fm) {
  const repoRel = path.relative(path.dirname(indexFile), destPath);
  const title = fm.title || path.basename(destPath, '.md');
  const tags = (fm.tags || [])
    .filter((t) => !String(t).startsWith('capa/'))
    .slice(0, 5)
    .join(', ');
  const line = `- **[${title}](${repoRel})** — ingested ${todayISO()}.${tags ? ' `' + tags + '`' : ''}\n`;

  if (!existsSync(indexFile)) {
    // Create a minimal INDEX shell. Real structure is owned by Doc-writer
    // but we don't want to fail if a project predates its INDEX.
    await mkdir(path.dirname(indexFile), { recursive: true });
    await writeFile(
      indexFile,
      `---\ntitle: "Index"\ntype: index\nlayer: project\nlanguage: en-es\ntags: [index]\nupdated: ${todayISO()}\n---\n\n# Index\n\n## Recently ingested\n\n${line}`,
    );
    return;
  }

  const body = await readFile(indexFile, 'utf8');
  if (body.includes(line.trim())) return; // already present

  let updated;
  if (body.includes('## Recently ingested')) {
    // Insert the line right after the section header.
    updated = body.replace(/## Recently ingested\s*\n/, (m) => m + line);
  } else {
    updated = body.replace(/$/, `\n## Recently ingested\n\n${line}`);
  }
  await writeFile(indexFile, updated);
}

// =====================================================================
// Misc utilities — duplicated from bridge to keep modules independent.
// =====================================================================

function findRepoRoot(start) {
  let dir = path.resolve(start);
  while (dir !== path.dirname(dir)) {
    if (existsSync(path.join(dir, '.git'))) return dir;
    dir = path.dirname(dir);
  }
  return path.resolve(start);
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function printReport(r) {
  console.log('');
  console.log(colors.bold('Ingest report'));
  console.log(`  Inboxes scanned:  ${r.inboxes_scanned}`);
  console.log(`  Items processed:  ${r.items_processed}`);
  console.log(`  Pages moved:      ${r.pages_moved}`);
  console.log(`  Index updates:    ${r.index_updates.size}`);
  console.log(`  Skipped:          ${r.items_skipped}`);
  if (r.needs_routing.length) {
    console.log(`${tag.warn()} needs-routing (left in inbox):`);
    for (const f of r.needs_routing) console.log(`    ${f}`);
  }
  if (r.errors.length) {
    console.log(`${tag.fail()} errors:`);
    for (const e of r.errors) console.log(`    ${e.file}: ${e.error}`);
  }
  console.log('');
  if (dryRun) console.log(`${tag.info()} dry-run: nothing was actually moved.`);
}

function printHelp() {
  console.log('Usage: pnpm kortex ingest [--dry-run] [--inbox PATH]');
  console.log('');
  console.log('Process all inbox locations and route each markdown item to its destination.');
  console.log('');
  console.log('Flags:');
  console.log('  --dry-run        plan only; don\'t move anything');
  console.log('  --inbox PATH     restrict to a single inbox (relative to repo root)');
  console.log('  --repo PATH      override repo root (used by tests)');
}
