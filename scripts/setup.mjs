#!/usr/bin/env node
// scope: framework
//
// Kortex setup — runs once when a user clones the template.
//
// Two modes:
//   - Interactive (default): asks the human owner three questions on stdin.
//   - Headless (`--headless`): consumes flags non-interactively. Used by
//     agents and CI. This is per Gemini fix #3 (anti-pattern: LLM mediating
//     stdin) — a model orchestrating setup MUST pass --headless so we never
//     ask it to type into a TTY.
//
// What setup does (small on purpose):
//   1. Captures owner profile to `.kortex/profile.json` (gitignored).
//   2. Patches `AGENTS.md` placeholders ({{owner_name}}, {{default_language}},
//      {{primary_channel}}) with the captured values.
//
// What setup does NOT do:
//   - It does NOT initialize git, run hooks, or create directories beyond
//     `.kortex/`. The template is already a working repo when cloned.
//   - It does NOT install dependencies (`pnpm install` is the user's call).
//
// Why .kortex/profile.json is gitignored:
//   - Owner identity is personal config, not framework.
//   - The template's source of truth lives in the repo; the profile is the
//     overlay applied on top during normal command operation.

import { parseArgs } from 'node:util';
import readline from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { writeFile, mkdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

// Flags accepted in headless mode. Kept short and explicit. Each flag has
// the same meaning as its interactive question. We do NOT support partial
// headless (some flags + some prompts) — too easy to deadlock an agent.
const { values } = parseArgs({
  options: {
    headless: { type: 'boolean', default: false },
    name: { type: 'string' },                                    // owner display name
    lang: { type: 'string' },                                    // en | es | en-es
    'primary-channel': { type: 'string', default: 'personal' },  // personal | content channel slug
    git: { type: 'string' },                                     // y | n | true | false
    help: { type: 'boolean', short: 'h', default: false },
  },
  // strict:false so unknown flags don't crash setup if a future caller adds new ones.
  strict: false,
});

if (values.help) {
  printHelp();
  process.exit(0);
}

// Resolve the repo root from this file's location. setup.mjs lives at
// scripts/setup.mjs, so the repo root is one directory up.
const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

// Build the owner profile from either the headless flags or interactive
// prompts. We intentionally do NOT default missing headless flags — the
// agent should pass them explicitly, and a missing required flag is a bug
// at the call site, not something we should paper over.
let profile;
if (values.headless) {
  // Headless validation. Required: name, lang. Others have defaults.
  if (!values.name || !values.lang) {
    console.error('setup: --headless requires --name and --lang.');
    console.error('Example: pnpm setup --headless --name "{{owner_name}}" --lang es --git y');
    process.exit(1);
  }
  profile = {
    name: values.name,
    language: normalizeLang(values.lang),
    primary_channel: values['primary-channel'] || 'personal',
    use_git: parseBool(values.git ?? 'n'),
    setup_at: new Date().toISOString(),
    setup_mode: 'headless',
  };
} else {
  // Interactive prompts. Three questions only — anything more is friction.
  // We use readline/promises so the code reads top-to-bottom (no callbacks).
  const rl = readline.createInterface({ input: stdin, output: stdout });
  console.log('Kortex v2 setup');
  console.log('Three questions, then this template is yours.\n');

  const name = (await rl.question('1) Your name? > ')).trim();
  const langRaw = (await rl.question('2) Default language [en/es/en-es] (default: en)? > ')).trim() || 'en';
  const gitRaw = (await rl.question('3) Use git for sync? [y/N] > ')).trim() || 'n';
  rl.close();

  // Validate language against the schema enum. If the user typed something
  // unexpected we coerce to `en` and warn — better than crashing on a typo.
  const language = normalizeLang(langRaw);
  if (language !== langRaw) {
    console.log(`(Coerced "${langRaw}" -> "${language}".)`);
  }

  profile = {
    name,
    language,
    primary_channel: values['primary-channel'] || 'personal',
    use_git: parseBool(gitRaw),
    setup_at: new Date().toISOString(),
    setup_mode: 'interactive',
  };
}

// Persist the profile. .kortex/ is gitignored, so this never lands in the
// public template — only in the user's local clone.
const dotKortex = path.join(repoRoot, '.kortex');
await mkdir(dotKortex, { recursive: true });
await writeFile(
  path.join(dotKortex, 'profile.json'),
  JSON.stringify(profile, null, 2) + '\n',
);

// Patch AGENTS.md placeholders. Doc-writer authors AGENTS.md with literal
// `{{owner_name}}` markers; setup.mjs replaces them with profile values
// the first time it runs. We do simple string replace (not a templating
// engine) because the placeholder set is tiny and stable.
const agentsPath = path.join(repoRoot, 'AGENTS.md');
if (existsSync(agentsPath)) {
  let agents = await readFile(agentsPath, 'utf8');
  const before = agents;
  agents = agents
    .replaceAll('{{owner_name}}', profile.name)
    .replaceAll('{{default_language}}', profile.language)
    .replaceAll('{{primary_channel}}', profile.primary_channel);
  if (agents !== before) {
    await writeFile(agentsPath, agents);
    console.log('Patched AGENTS.md placeholders.');
  }
}

// Final hint. Keep it short — onboarding moves to the next step (daily
// note creation), not to a wall of docs.
console.log('');
console.log(`Setup complete. Profile: .kortex/profile.json`);
console.log('Next: `pnpm kortex daily` to create today\'s journal.');

// ---- Helpers ----

// Normalize free-text language input into one of the three schema values.
// We accept obvious synonyms (`english` -> `en`) so a typo doesn't fail the
// whole setup. Unknown values fall back to `en` — the safest default.
function normalizeLang(raw) {
  const v = String(raw).trim().toLowerCase();
  if (['en', 'english'].includes(v)) return 'en';
  if (['es', 'spanish', 'español', 'espanol'].includes(v)) return 'es';
  if (['en-es', 'es-en', 'bilingual', 'mixed'].includes(v)) return 'en-es';
  return 'en';
}

// Boolean coercion for headless flags: y/yes/true/1 -> true; everything
// else -> false. Permissive on the truthy side because users type `y`, `Y`,
// `yes`, `true` interchangeably.
function parseBool(raw) {
  const v = String(raw).trim().toLowerCase();
  return ['y', 'yes', 'true', '1'].includes(v);
}

function printHelp() {
  console.log('Usage:');
  console.log('  pnpm setup                       (interactive — asks 3 questions)');
  console.log('  pnpm setup --headless --name "X" --lang es [--primary-channel ...] [--git y]');
  console.log('');
  console.log('Flags (headless mode):');
  console.log('  --name              owner name (required)');
  console.log('  --lang              en | es | en-es (required)');
  console.log('  --primary-channel   primary channel slug (default: personal)');
  console.log('  --git               y/n — track owner state in git (default: n)');
}
