#!/usr/bin/env node
//
// Pre-commit hook: enforce the AGENTS.md / CLAUDE.md mirror invariant.
//
// Invariant:
//   For every directory that has an AGENTS.md, the sibling CLAUDE.md must
//   either be:
//     (a) a SYMLINK pointing to AGENTS.md (POSIX path), or
//     (b) on Windows-style checkouts, a regular file whose first non-empty
//         line is the marker comment `<!-- mirror of AGENTS.md`.
//   Anything else (drift between the two files, missing CLAUDE.md, dangling
//   symlink) is a hard block at the repo root and a warning elsewhere.
//
// Why root is hard, others soft:
//   The root pair is what every Claude Code session loads first, so drift
//   there is the most damaging. Per-project pairs are recoverable later by
//   `pnpm kortex sync-claude-md`; we WARN there but don't block the commit
//   because users may stage AGENTS.md on its own (the sync command is the
//   intended fix path).
//
// Note: per spec, hard block applies only to the repo-root pair.

import fs from 'node:fs';
import path from 'node:path';
import { repoRoot } from '../lib/git.mjs';
import { colors } from '../lib/colors.mjs';

// Marker we look for in a Windows-fallback CLAUDE.md (regular file, not symlink).
const WINDOWS_FALLBACK_MARKER = '<!-- mirror of AGENTS.md';

// Determine the relationship between AGENTS.md and CLAUDE.md in `dir`.
// Returns one of: 'ok-symlink' | 'ok-windows-marker' | 'missing' | 'drift'
// plus a `reason` describing the failure for human output.
export function checkPair(dir) {
  const agentsPath = path.join(dir, 'AGENTS.md');
  const claudePath = path.join(dir, 'CLAUDE.md');

  if (!fs.existsSync(agentsPath)) {
    // No AGENTS.md → nothing to enforce. Some leaf directories don't have
    // either file; that's fine.
    return { status: 'ok-symlink', reason: 'no AGENTS.md present' };
  }

  // lstat is critical: stat would follow the symlink and report the target's
  // type, not the link itself. We need to know if CLAUDE.md IS a symlink.
  let claudeStat;
  try {
    claudeStat = fs.lstatSync(claudePath);
  } catch {
    return {
      status: 'missing',
      reason: 'CLAUDE.md missing — run `pnpm kortex sync-claude-md` to recreate the symlink',
    };
  }

  if (claudeStat.isSymbolicLink()) {
    // Symlink — verify it points at the sibling AGENTS.md (relative target).
    const target = fs.readlinkSync(claudePath);
    if (target !== 'AGENTS.md') {
      return {
        status: 'drift',
        reason: `CLAUDE.md is a symlink but points to "${target}" (expected "AGENTS.md")`,
      };
    }
    return { status: 'ok-symlink', reason: 'symlink → AGENTS.md' };
  }

  if (claudeStat.isFile()) {
    // Regular file — only valid as a Windows fallback when the first non-empty
    // line is the marker comment.
    let head;
    try {
      head = fs.readFileSync(claudePath, 'utf8');
    } catch (e) {
      return { status: 'drift', reason: `unreadable CLAUDE.md: ${e.message}` };
    }
    const firstNonEmpty = head.split('\n').find((l) => l.trim().length > 0) || '';
    if (firstNonEmpty.trim().startsWith(WINDOWS_FALLBACK_MARKER)) {
      return { status: 'ok-windows-marker', reason: 'Windows-fallback regular file with marker' };
    }
    return {
      status: 'drift',
      reason:
        'CLAUDE.md is a regular file without the Windows-fallback marker. ' +
        'Either symlink it to AGENTS.md (`pnpm kortex sync-claude-md`) or add ' +
        '`<!-- mirror of AGENTS.md -->` as the first line.',
    };
  }

  return { status: 'drift', reason: `CLAUDE.md is neither file nor symlink` };
}

async function main() {
  const root = repoRoot();
  let hardFailed = false;

  // Hard check: repo root.
  const rootResult = checkPair(root);
  if (rootResult.status === 'missing' || rootResult.status === 'drift') {
    console.error(colors.red(colors.bold('\nROOT CLAUDE.md / AGENTS.md drift — commit blocked')));
    console.error('  ' + colors.cyan('./CLAUDE.md'));
    console.error('    ' + colors.gray('->') + ' ' + rootResult.reason);
    console.error(
      colors.gray('\n  Fix: pnpm kortex sync-claude-md\n')
    );
    hardFailed = true;
  }

  // Soft check: per-project pairs. Walk one level down through directories
  // that conventionally hold AGENTS.md (projects/, sources/courses/...).
  // Keeping the walk shallow (depth 2) keeps the hook fast on large repos —
  // deeply nested AGENTS.md files are rare and can be checked in CI later.
  const softWarnings = [];
  for (const sub of ['projects', 'sources']) {
    const subPath = path.join(root, sub);
    if (!fs.existsSync(subPath)) continue;
    let entries;
    try {
      entries = fs.readdirSync(subPath, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const projDir = path.join(subPath, entry.name);
      const result = checkPair(projDir);
      if (result.status === 'missing' || result.status === 'drift') {
        softWarnings.push({
          dir: path.relative(root, projDir),
          reason: result.reason,
        });
      }
      // For `sources/courses/<name>` we also check one level deeper.
      if (entry.name === 'courses') {
        let courses;
        try {
          courses = fs.readdirSync(projDir, { withFileTypes: true });
        } catch {
          continue;
        }
        for (const c of courses) {
          if (!c.isDirectory()) continue;
          const courseDir = path.join(projDir, c.name);
          const r = checkPair(courseDir);
          if (r.status === 'missing' || r.status === 'drift') {
            softWarnings.push({
              dir: path.relative(root, courseDir),
              reason: r.reason,
            });
          }
        }
      }
    }
  }

  if (softWarnings.length > 0) {
    console.warn(colors.yellow(colors.bold('\nCLAUDE.md / AGENTS.md drift in subprojects (warning):')));
    for (const w of softWarnings) {
      console.warn('  ' + colors.cyan(w.dir));
      console.warn('    ' + colors.gray('->') + ' ' + w.reason);
    }
    console.warn(colors.gray('\n  These are warnings only. Run `pnpm kortex sync-claude-md` when convenient.\n'));
  }

  process.exit(hardFailed ? 1 : 0);
}

const isDirectInvocation =
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith('validate-symlink.mjs');

if (isDirectInvocation) {
  main().catch((e) => {
    console.error(colors.red('validate-symlink crashed:'), e);
    process.exit(1);
  });
}
