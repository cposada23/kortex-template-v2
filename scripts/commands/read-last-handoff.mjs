#!/usr/bin/env node
// scope: framework
//
// Kortex `read-last-handoff` — print (or copy) the last handoff section.
//
// Use case (per PRD §9, cross-surface gap fix): the owner is on mobile or
// in a web AI chat that has no filesystem access. They need the last
// handoff's RESUME PROMPT to seed the new conversation. Running this
// command on their laptop and `--clipboard` puts it on the system
// clipboard so they can paste into the phone-mirrored chat.
//
// Behavior:
//   1. Find the most recent session file in output/sessions/.
//   2. Find the last `## Handoff HH:MM` section in that file.
//   3. Print to stdout (default), or copy to the system clipboard
//      (--clipboard).
//
// Clipboard support:
//   - macOS: pbcopy
//   - Linux: xclip (or xsel as fallback)
//   - Windows (rare on this stack): clip.exe
// We probe each in turn and surface a clear message if none exist.

import { parseArgs } from 'node:util';
import { readFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { colors, tag } from '../lib/colors.mjs';

const { values } = parseArgs({
  options: {
    clipboard: { type: 'boolean', default: false },
    'resume-only': { type: 'boolean', default: false },          // only the RESUME PROMPT subsection
    repo: { type: 'string' },
    help: { type: 'boolean', short: 'h', default: false },
  },
  strict: false,
});

if (values.help) {
  printHelp();
  process.exit(0);
}

const repoRoot = values.repo ? path.resolve(values.repo) : findRepoRoot(process.cwd());
const sessionsDir = path.join(repoRoot, 'output', 'sessions');

if (!existsSync(sessionsDir)) {
  console.error('read-last-handoff: output/sessions/ does not exist');
  process.exit(1);
}

// Find the most recent session file by sorted filename. We rely on the
// YYYY-MM-DD.md convention from bridge — anything else gets ignored.
const files = (await readdir(sessionsDir))
  .filter((f) => /^\d{4}-\d{2}-\d{2}\.md$/.test(f))
  .sort();
if (files.length === 0) {
  console.error('read-last-handoff: no session files found');
  process.exit(2);
}

const latest = files[files.length - 1];
const latestPath = path.join(sessionsDir, latest);
const body = await readFile(latestPath, 'utf8');

// Walk the body and find the last `## Handoff HH:MM` section. We capture
// from the heading to the next `## ` heading (or end of file). This is
// slightly less precise than markdown-AST parsing but deterministic for
// the structure bridge.mjs writes.
const section = extractLastHandoff(body);
if (!section) {
  console.error(`${tag.warn()} no handoff section in ${latest}`);
  console.error('  bridge --handoff has not been run for this session.');
  process.exit(2);
}

// Optionally narrow to the RESUME PROMPT subsection only — that's the
// piece the owner pastes into the new chat.
const out = values['resume-only'] ? extractResumePrompt(section) : section;
if (values['resume-only'] && !out) {
  console.error(`${tag.warn()} handoff has no RESUME PROMPT subsection`);
  process.exit(2);
}

if (values.clipboard) {
  const ok = copyToClipboard(out);
  if (!ok) {
    console.error(`${tag.fail()} no clipboard helper found (tried pbcopy, xclip, xsel, clip.exe)`);
    console.error('Falling back to stdout:');
    console.log(out);
    process.exit(1);
  }
  console.log(`${tag.ok()} Copied last handoff${values['resume-only'] ? ' (RESUME PROMPT only)' : ''} to clipboard.`);
  console.log(`  Source: ${path.relative(repoRoot, latestPath)}`);
} else {
  console.log(out);
}

// =====================================================================
// Section extraction.
// =====================================================================

// Return the text of the LAST `## Handoff ...` block in `body`. If the
// block runs to EOF, that's fine — slice through end. Returns null if
// no handoff section exists. Exported for tests.
export function extractLastHandoff(body) {
  const re = /^## Handoff\s+\d{2}:\d{2}\b.*$/gm;
  let lastIdx = -1;
  let m;
  while ((m = re.exec(body)) !== null) {
    lastIdx = m.index;
  }
  if (lastIdx < 0) return null;
  // Find the next heading at H1 or H2 level after lastIdx.
  const after = body.slice(lastIdx);
  const nextHeadingMatch = after.slice(1).match(/^#{1,2} /m); // skip the first char
  if (!nextHeadingMatch) return after;
  const end = lastIdx + 1 + nextHeadingMatch.index;
  return body.slice(lastIdx, end).trimEnd();
}

// Return the body of the `### RESUME PROMPT` subsection inside a handoff
// block. Stops at the next `### ` heading or end of section.
export function extractResumePrompt(handoffSection) {
  const re = /^### RESUME PROMPT\s*\n([\s\S]*?)(?=^### |\Z)/m;
  const m = handoffSection.match(re);
  if (!m) return null;
  return m[1].trim();
}

// =====================================================================
// Clipboard. Try each helper in turn; first one that exits 0 wins.
// =====================================================================

function copyToClipboard(text) {
  const candidates = [
    { cmd: 'pbcopy', args: [] },                               // macOS
    { cmd: 'xclip', args: ['-selection', 'clipboard'] },       // Linux X
    { cmd: 'xsel', args: ['--clipboard', '--input'] },         // Linux X alt
    { cmd: 'wl-copy', args: [] },                              // Linux Wayland
    { cmd: 'clip.exe', args: [] },                             // Windows / WSL
  ];
  for (const c of candidates) {
    const res = spawnSync(c.cmd, c.args, { input: text, encoding: 'utf8' });
    if (res.status === 0) return true;
  }
  return false;
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
  console.log('Usage: pnpm kortex read-last-handoff [--clipboard] [--resume-only]');
  console.log('');
  console.log('Print or copy the last `## Handoff` section from the most recent session file.');
  console.log('');
  console.log('Flags:');
  console.log('  --clipboard     copy to system clipboard instead of stdout');
  console.log('  --resume-only   output only the RESUME PROMPT subsection');
}
