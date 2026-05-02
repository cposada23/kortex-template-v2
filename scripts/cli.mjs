#!/usr/bin/env node
// scope: framework
//
// Kortex CLI router.
//
// Maps `pnpm kortex <command> [args...]` to the corresponding script under
// `scripts/commands/<command>.mjs`. The router itself does no business logic
// — it just validates the command name, finds the script, and re-execs it
// with the remaining args.
//
// Why a router instead of one-script-per-pnpm-script:
//   - Single entry point in package.json keeps the surface tiny.
//   - Adding a new command = adding one file under scripts/commands/ and one
//     line to the COMMANDS array below. No package.json edits, no users
//     re-running `pnpm install`.
//   - `pnpm kortex` (no args) prints the command list — discoverable.
//
// We use `spawn` (not `import()`) so each command runs in its own process.
// That gives us:
//   - Independent exit codes (a command failure doesn't crash the router).
//   - Process isolation (no leaked top-level state between invocations).
//   - `process.exit()` inside a command terminates only that command.

import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';

// __dirname equivalent for ESM. Needed because we resolve sibling scripts
// relative to this file's location, not the caller's cwd.
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Canonical list of commands. Order matters for the help output (most-used
// first). Each name maps to scripts/commands/<name>.mjs.
const COMMANDS = [
  'bridge',              // session start/end/recovery/handoff (one file, flag-driven)
  'ingest',              // process all inboxes
  'health',              // wiki health check (renamed from v1 lint)
  'query',               // full-text + recency search
  'safe-change',         // branched change workflow
  'daily',               // create today's daily journal
  'new',                 // interactive scaffolder for a new content page
  'review',              // surface 3 random notes that need attention
  'build-index',         // rebuild every INDEX.md from filesystem + frontmatter
  'read-last-handoff',   // print/copy last handoff section
  'regen-status',        // recompute .cache/status.json (auto-invoked by .husky/post-commit)
  'finanzas',            // personal finances dispatcher (project: finanzas-personales — mykortex only)
];

// Pull command + args off argv. argv[0] is node, argv[1] is this script,
// argv[2] is the user-supplied command name.
const [, , cmd, ...args] = process.argv;

// No command supplied — print help and exit non-zero so shell scripts can
// detect "user forgot to pass a command".
if (!cmd) {
  printHelp();
  process.exit(1);
}

// `--help` or `-h` at the top level — print help and exit zero (success).
if (cmd === '--help' || cmd === '-h' || cmd === 'help') {
  printHelp();
  process.exit(0);
}

// Unknown command — print help and exit non-zero. We surface the bad command
// name so the user sees what they typed (vs. silent rejection).
if (!COMMANDS.includes(cmd)) {
  console.error(`kortex: unknown command "${cmd}"`);
  printHelp();
  process.exit(1);
}

// Resolve the target script path. Command names already match filenames
// (e.g. `safe-change` -> `safe-change.mjs`).
const scriptPath = path.join(__dirname, 'commands', `${cmd}.mjs`);

// Defensive existence check. Useful while sub-agents are still landing
// commands — without this, a missing file produces a cryptic ENOENT from
// child_process and obscures the real problem.
if (!fs.existsSync(scriptPath)) {
  console.error(`kortex: command "${cmd}" is not yet implemented (missing ${scriptPath})`);
  process.exit(1);
}

// Spawn the command in a child process and forward stdio so the user sees
// output in real time (no buffering). `stdio: 'inherit'` also forwards
// stdin, which is what setup.mjs and bridge --recovery need for prompts.
const child = spawn('node', [scriptPath, ...args], {
  stdio: 'inherit',
  // Keep the same cwd so commands resolve repo-relative paths the same way
  // regardless of where the user invoked `pnpm kortex`.
  cwd: process.cwd(),
});

// Mirror the child's exit code so CI / shell scripts can detect failure.
// Falls back to 1 if the child was killed by signal (signal -> non-zero).
child.on('exit', (code, signal) => {
  if (signal) process.exit(1);
  process.exit(code ?? 0);
});

// Print the help text. Kept as a function so both the no-args and --help
// branches can call it without duplicating the strings.
function printHelp() {
  console.log('Usage: pnpm kortex <command> [args]');
  console.log('');
  console.log('Commands:');
  for (const c of COMMANDS) {
    console.log(`  ${c}`);
  }
  console.log('');
  console.log('Run `pnpm kortex <command> --help` for command-specific options.');
}
