#!/usr/bin/env node
//
// Kortex `daily` — create today's daily journal page.
//
// Per PRD §11.3, the daily note is the on-ramp for capture-zone work. It
// lives at `inbox/journal/YYYY-MM-DD.md` and is intentionally schema-light
// — quick captures, decisions, next steps. Triage moves them into wiki/
// or projects/ later (via /ingest).
//
// Idempotent: if today's file already exists, we open it (print path).
// We never overwrite — the day's notes are owner-authored and re-running
// `daily` should be safe at any hour.
//
// Behavior:
//   1. Compute today's date.
//   2. If `inbox/journal/YYYY-MM-DD.md` exists → print path + exit.
//   3. Else → write the template, print path.
//
// We deliberately do NOT auto-open the file in an editor — that's the
// owner's environment choice (VS Code, Vim, etc.). The slash wrapper can
// hint at the next action if the editor preference is known.

import { parseArgs } from 'node:util';
import { writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { colors, tag } from '../lib/colors.mjs';

const { values } = parseArgs({
  options: {
    repo: { type: 'string' },
    date: { type: 'string' },                                  // override today (tests)
    lang: { type: 'string', default: 'es' },                   // template language
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

// We resolve the daily path inside `inbox/journal/`. We only create the
// `journal/` directory if it doesn't exist — fresh templates ship with it
// already present, but a future repo restructure might not.
const journalDir = path.join(repoRoot, 'inbox', 'journal');
const dailyPath = path.join(journalDir, `${today}.md`);

if (existsSync(dailyPath)) {
  // Already exists — print the path and exit. We DO NOT modify the file
  // because it likely contains the owner's notes from earlier in the day.
  console.log(`${tag.info()} Today's journal already exists.`);
  console.log(`  ${path.relative(repoRoot, dailyPath)}`);
  process.exit(0);
}

await mkdir(journalDir, { recursive: true });

// Pick the template language. Default Spanish per {{owner_name}}'s setup, but the
// template is also valid English (sections rename cleanly).
const tpl = values.lang === 'en' ? englishTemplate(today) : spanishTemplate(today);

await writeFile(dailyPath, tpl);

console.log(`${tag.ok()} Created ${path.relative(repoRoot, dailyPath)}`);
console.log(`${tag.info()} Open in your editor and start capturing.`);

// =====================================================================
// Templates. Kept tiny — the daily note is for fast capture, not careful
// formatting. Schema-light per CLAUDE.md (idea-frontmatter inbox rule
// applies on a per-item basis, not on the journal itself).
// =====================================================================

function spanishTemplate(date) {
  return [
    '---',
    `title: "Journal ${date}"`,
    'type: inbox',
    'layer: source',
    'language: es',
    'tags: [journal, daily]',
    `updated: ${date}`,
    'mirror: personal',
    '---',
    '',
    `# Journal ${date}`,
    '',
    '## Captures',
    '',
    '_(Capturas rápidas — ideas, links, referencias. Sin schema estricto.)_',
    '',
    '## Decisions',
    '',
    '_(Cosas que decidí hoy.)_',
    '',
    '## Next steps',
    '',
    '_(Lo que sigue mañana o esta tarde.)_',
    '',
  ].join('\n');
}

function englishTemplate(date) {
  return [
    '---',
    `title: "Journal ${date}"`,
    'type: inbox',
    'layer: source',
    'language: en',
    'tags: [journal, daily]',
    `updated: ${date}`,
    'mirror: personal',
    '---',
    '',
    `# Journal ${date}`,
    '',
    '## Captures',
    '',
    '_(Quick captures — ideas, links, references. No strict schema.)_',
    '',
    '## Decisions',
    '',
    '_(Things I decided today.)_',
    '',
    '## Next steps',
    '',
    '_(What\'s next tomorrow or later today.)_',
    '',
  ].join('\n');
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
  console.log('Usage: pnpm kortex daily [--lang en|es]');
  console.log('');
  console.log('Create or open today\'s journal at inbox/journal/YYYY-MM-DD.md.');
  console.log('Idempotent — re-running on the same day prints the existing path.');
  console.log('');
  console.log('Flags:');
  console.log('  --lang en|es   template language (default: es)');
  console.log('  --date YYYY-MM-DD  override today (used by tests)');
}
