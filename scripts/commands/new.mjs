#!/usr/bin/env node
//
// Kortex `new` — interactive scaffolder for a new content page.
//
// Why: copying templates manually (cp .claude/templates/concept.md ...) is
// error-prone — wrong folder, missing frontmatter date, slug mismatched
// with title. This walks the owner through the 3 questions that fully
// determine the file (type, title, subfolder if needed) and writes a
// ready-to-edit page with valid frontmatter.
//
// Supported types map 1:1 to existing templates / known schema patterns:
//
//   concept     → wiki/concepts/<sub>/<slug>.md    (uses concept template)
//   area        → wiki/areas/<slug>.md             (uses area template)
//   playbook    → wiki/playbooks/<slug>.md         (inline minimal)
//   reference   → wiki/references/<slug>.md        (inline minimal)
//   decision    → wiki/decisions/<NNNN>-<slug>.md  (auto-numbered ADR)
//   idea        → inbox/<slug>.md                  (idea schema per rule)
//
// We keep deps zero: node:readline/promises is built-in, no inquirer.
//
// Flags:
//   --type <name>      skip the type prompt
//   --title <text>     skip the title prompt
//   --subfolder <s>    concepts/<s> (skip the subfolder prompt)
//   --target-channel   for idea type
//   --no-open          don't open in $EDITOR after creating
//   --dry-run          print the path + frontmatter, write nothing

import { parseArgs } from 'node:util';
import { writeFile, mkdir, readFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import path from 'node:path';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { colors, tag } from '../lib/colors.mjs';

// Type catalog. Order is the order shown in the prompt and in --help.
// Declared at the top so printHelp() (hoisted) can reference it without
// hitting the const TDZ when --help runs early.
const TYPES = [
  { key: 'concept',   label: 'Concept (atomic wiki page)',                      template: 'concept'    },
  { key: 'area',      label: 'Area (long-running domain in wiki/areas/)',        template: 'area'       },
  { key: 'playbook',  label: 'Playbook (operational how-to)',                    template: null         },
  { key: 'reference', label: 'Reference (factual lookup, glossary, registry)',  template: null         },
  { key: 'decision',  label: 'Decision (ADR — wiki/decisions/, auto-numbered)', template: null         },
  { key: 'idea',      label: 'Idea (inbox/ — gets routed by /ingest)',          template: null         },
];

const { values } = parseArgs({
  options: {
    type: { type: 'string' },
    title: { type: 'string' },
    subfolder: { type: 'string' },
    'target-channel': { type: 'string' },
    'no-open': { type: 'boolean', default: false },
    'dry-run': { type: 'boolean', default: false },
    repo: { type: 'string' },
    date: { type: 'string' },                       // override today (tests)
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

const rl = readline.createInterface({ input, output });

try {
  const type = values.type || (await askType());
  if (!TYPES.find((t) => t.key === type)) {
    console.error(`${tag.fail()} Unknown type: ${type}`);
    console.error(`Valid: ${TYPES.map((t) => t.key).join(', ')}`);
    process.exit(1);
  }

  const title = values.title || (await ask('Title: '));
  if (!title || !title.trim()) {
    console.error(`${tag.fail()} Title is required.`);
    process.exit(1);
  }

  // Per-type extras:
  let subfolder = values.subfolder;
  if (type === 'concept' && !subfolder) {
    const existing = await listConceptSubfolders();
    if (existing.length) {
      console.log(`${tag.info()} Existing concept subfolders: ${existing.join(', ')}`);
    }
    subfolder = (await ask('Subfolder under wiki/concepts/ (e.g. strategy, design, tooling): ')).trim();
    if (!subfolder) {
      console.error(`${tag.fail()} Subfolder is required for concept type.`);
      process.exit(1);
    }
  }

  let targetChannel = values['target-channel'];
  if (type === 'idea' && !targetChannel) {
    targetChannel = (await ask('target_channel (e.g. milo-ia, kortex, cross-project): ')).trim();
    if (!targetChannel) targetChannel = 'cross-project';
  }

  const slug = slugify(title);
  const filePath = await resolveFilePath({ type, slug, subfolder });

  if (existsSync(filePath)) {
    console.error(`${tag.fail()} File already exists: ${path.relative(repoRoot, filePath)}`);
    process.exit(1);
  }

  const body = await renderTemplate({ type, title, slug, subfolder, targetChannel, date: today });

  const relPath = path.relative(repoRoot, filePath);

  if (values['dry-run']) {
    console.log(`${tag.info()} [dry-run] would create ${colors.cyan(relPath)}`);
    console.log('---');
    console.log(body);
    process.exit(0);
  }

  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, body);
  console.log(`${tag.ok()} Created ${colors.cyan(relPath)}`);

  if (!values['no-open']) {
    openInEditor(filePath);
  }
} finally {
  rl.close();
}

// =====================================================================
// Prompts
// =====================================================================

async function askType() {
  console.log('What do you want to create?');
  for (let i = 0; i < TYPES.length; i++) {
    console.log(`  ${colors.cyan(String(i + 1))}. ${TYPES[i].label}`);
  }
  const raw = (await ask('Pick a number (or type the name): ')).trim();
  const n = parseInt(raw, 10);
  if (!Number.isNaN(n) && n >= 1 && n <= TYPES.length) {
    return TYPES[n - 1].key;
  }
  return raw.toLowerCase();
}

async function ask(prompt) {
  return rl.question(prompt);
}

// =====================================================================
// Path resolution
// =====================================================================

async function resolveFilePath({ type, slug, subfolder }) {
  switch (type) {
    case 'concept':
      return path.join(repoRoot, 'wiki', 'concepts', slugify(subfolder), `${slug}.md`);
    case 'area':
      return path.join(repoRoot, 'wiki', 'areas', `${slug}.md`);
    case 'playbook':
      return path.join(repoRoot, 'wiki', 'playbooks', `${slug}.md`);
    case 'reference':
      return path.join(repoRoot, 'wiki', 'references', `${slug}.md`);
    case 'decision': {
      const next = await nextDecisionNumber();
      return path.join(repoRoot, 'wiki', 'decisions', `${next}-${slug}.md`);
    }
    case 'idea':
      return path.join(repoRoot, 'inbox', `${slug}.md`);
    default:
      throw new Error(`Unhandled type: ${type}`);
  }
}

async function nextDecisionNumber() {
  // ADRs are conventionally numbered 0001, 0002, ... — find the highest
  // existing number and return the next one zero-padded to 4 digits.
  const decDir = path.join(repoRoot, 'wiki', 'decisions');
  if (!existsSync(decDir)) return '0001';
  const entries = await readdir(decDir);
  let max = 0;
  for (const e of entries) {
    const m = e.match(/^(\d{4})-/);
    if (m) {
      const n = parseInt(m[1], 10);
      if (n > max) max = n;
    }
  }
  return String(max + 1).padStart(4, '0');
}

async function listConceptSubfolders() {
  const dir = path.join(repoRoot, 'wiki', 'concepts');
  if (!existsSync(dir)) return [];
  const entries = await readdir(dir, { withFileTypes: true });
  return entries.filter((e) => e.isDirectory()).map((e) => e.name).sort();
}

// =====================================================================
// Slugify
// =====================================================================

// Lowercase, strip accents, replace non-alphanumerics with hyphens, collapse,
// trim hyphens, cap at 60 chars. Mirrors the slug shape of existing files.
export function slugify(s) {
  return String(s)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

// =====================================================================
// Templates
//
// Where a template file exists in .claude/templates/ we read it and
// substitute placeholders. For types without a template file we render
// inline. The date and title always interpolate; type-specific fields
// (target_channel for idea, ADR fields for decision) are injected via
// the inline branch.
// =====================================================================

async function renderTemplate({ type, title, slug, subfolder, targetChannel, date }) {
  const tplDef = TYPES.find((t) => t.key === type);
  if (tplDef && tplDef.template) {
    const tplPath = path.join(repoRoot, '.claude', 'templates', `${tplDef.template}.md`);
    let raw = await readFile(tplPath, 'utf8');
    raw = raw
      .replace(/title:\s*"[^"]*"/, `title: "${title}"`)
      .replace(/^# .+$/m, `# ${title}`)
      .replace(/updated:\s*YYYY-MM-DD/, `updated: ${date}`);
    return raw;
  }

  switch (type) {
    case 'playbook':       return playbookTemplate(title, date);
    case 'reference':      return referenceTemplate(title, date);
    case 'decision':       return decisionTemplate(title, date, slug);
    case 'idea':           return ideaTemplate(title, date, targetChannel);
    default:
      throw new Error(`No template for type: ${type}`);
  }
}

function playbookTemplate(title, date) {
  return [
    '---',
    `title: "${title}"`,
    'type: playbook',
    'layer: synthesis',
    'language: es',
    'tags: [playbook]',
    `updated: ${date}`,
    'mirror: personal',
    'distillation_level: 2',
    '---',
    '',
    `# ${title}`,
    '',
    '> Scope: when to use this playbook + who it serves.',
    '',
    '## When to use',
    '',
    '## Steps',
    '',
    '1. ',
    '2. ',
    '3. ',
    '',
    '## Output',
    '',
    'What this playbook produces.',
    '',
  ].join('\n');
}

function referenceTemplate(title, date) {
  return [
    '---',
    `title: "${title}"`,
    'type: reference',
    'layer: synthesis',
    'language: es',
    'tags: [reference]',
    `updated: ${date}`,
    'mirror: personal',
    'distillation_level: 2',
    '---',
    '',
    `# ${title}`,
    '',
    '**Summary:** One sentence — what this lookup answers.',
    '',
    '## Body',
    '',
  ].join('\n');
}

function decisionTemplate(title, date, slug) {
  return [
    '---',
    `title: "Decision: ${title}"`,
    'type: adr',
    'layer: synthesis',
    'language: en',
    'tags: [decision]',
    `updated: ${date}`,
    'mirror: personal',
    '---',
    '',
    `# Decision: ${title}`,
    '',
    `**Date:** ${date}`,
    '**Status:** proposed',
    '',
    '## Context',
    '',
    'What forced this decision. The constraint, problem, or trigger.',
    '',
    '## Decision',
    '',
    'What we are doing and what we are not doing.',
    '',
    '## Consequences',
    '',
    'What changes downstream. What follow-up work this creates.',
    '',
  ].join('\n');
}

function ideaTemplate(title, date, targetChannel) {
  return [
    '---',
    `title: "${title}"`,
    'type: idea',
    'layer: project',
    'language: es',
    'tags: [idea, capa/3-proyecto]',
    `updated: ${date}`,
    'mirror: personal',
    'status: inbox',
    'angle: "<one-sentence editorial angle — why this idea is distinct>"',
    `target_channel: ${targetChannel}`,
    'created_in: claude-code',
    `created_date: ${date}`,
    '---',
    '',
    `# ${title}`,
    '',
    '## Idea',
    '',
    '## Why now',
    '',
    '## Notes',
    '',
  ].join('\n');
}

// =====================================================================
// Editor open
// =====================================================================

function openInEditor(filePath) {
  const editor = process.env.EDITOR || process.env.VISUAL;
  if (!editor) {
    console.log(`${tag.info()} \$EDITOR not set — open it yourself:`);
    console.log(`  ${path.relative(repoRoot, filePath)}`);
    return;
  }
  // We detach so this CLI returns immediately. Owners running in a TTY
  // editor (vim, nano) will see it take over their terminal naturally;
  // GUI editors (code, subl) just open and we exit cleanly.
  try {
    spawn(editor, [filePath], { stdio: 'inherit' });
  } catch (e) {
    console.log(`${tag.warn()} Could not open editor (${editor}): ${e.message}`);
  }
}

// =====================================================================
// Helpers
// =====================================================================

function findRepoRoot(start) {
  let dir = path.resolve(start);
  while (dir !== path.dirname(dir)) {
    if (existsSync(path.join(dir, '.git'))) return dir;
    dir = path.dirname(dir);
  }
  return path.resolve(start);
}

function printHelp() {
  console.log('Usage: pnpm kortex new [--type <name>] [--title <text>] [options]');
  console.log('');
  console.log('Interactive scaffolder for a new Kortex page. Asks for type,');
  console.log('title, and any per-type extras, then writes a valid file with');
  console.log('frontmatter and opens it in $EDITOR.');
  console.log('');
  console.log('Types:');
  for (const t of TYPES) {
    console.log(`  ${t.key.padEnd(10)}  ${t.label}`);
  }
  console.log('');
  console.log('Flags:');
  console.log('  --type <name>            skip the type prompt');
  console.log('  --title <text>           skip the title prompt');
  console.log('  --subfolder <s>          for concept type — wiki/concepts/<s>/');
  console.log('  --target-channel <c>     for idea type');
  console.log('  --no-open                don\'t open in $EDITOR after creating');
  console.log('  --dry-run                print the path + body, write nothing');
}
