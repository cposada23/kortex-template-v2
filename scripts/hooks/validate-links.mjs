#!/usr/bin/env node
//
// Pre-commit hook: validate internal markdown links resolve to real files.
//
// Algorithm (port of v1 validate-links.py):
//   1. List staged .md files.
//   2. For each, parse out `[text](target)` links from the body, ignoring
//      code blocks and external/media targets.
//   3. Resolve each target relative to the source file's directory.
//   4. Hard-block the commit if any target doesn't exist on disk.
//
// Implementation notes:
//   - We check the WORKING-TREE state of files, not the staged blob. That
//      matches v1 behavior and is the right call: if a user moves a file in
//      the same commit as updating the link to it, both must reach the
//      working tree before the commit fires anyway. Pre-commit runs after
//      `git add`, so working-tree state == staged state for these files.
//   - We only stat files that aren't already known not-to-exist; same set
//      lookup keeps this fast even on large repos.

import fs from 'node:fs';
import path from 'node:path';
import { repoRoot, stagedFiles } from '../lib/git.mjs';
import { extractLinks, resolveLinkTarget } from '../lib/markdown-links.mjs';
import { colors } from '../lib/colors.mjs';

// Validate one file. Returns array of `{ line, target }` for broken links.
// File is identified by absolute path; we read the working-tree contents.
export function validateFile(absPath) {
  const broken = [];
  let content;
  try {
    content = fs.readFileSync(absPath, 'utf8');
  } catch {
    // Unreadable file — caller probably staged a delete. Skip silently.
    return broken;
  }

  const links = extractLinks(content);
  for (const { line, target } of links) {
    const resolved = resolveLinkTarget(absPath, target);
    // existsSync is fine here: we don't care WHAT it is, only that it
    // resolves to something. Lets folder targets like `../foo/` pass.
    if (!fs.existsSync(resolved)) {
      broken.push({ line, target });
    }
  }
  return broken;
}

async function main() {
  const root = repoRoot();
  const staged = stagedFiles('.md');
  if (staged.length === 0) process.exit(0);

  const allBroken = [];
  for (const rel of staged) {
    const abs = path.join(root, rel);
    const broken = validateFile(abs);
    if (broken.length > 0) allBroken.push({ file: rel, broken });
  }

  if (allBroken.length === 0) process.exit(0);

  // Group output by file so the user can scan their own work alphabetically.
  console.error(colors.red(colors.bold('\nBROKEN LINKS — commit blocked')));
  let totalBroken = 0;
  for (const { file, broken } of allBroken) {
    console.error('  ' + colors.cyan(file));
    for (const { line, target } of broken) {
      console.error(
        `    ${colors.gray('line ' + line + ':')} ${target}`
      );
      totalBroken++;
    }
  }
  console.error(
    colors.gray(
      `\n  ${totalBroken} broken link(s) in ${allBroken.length} file(s). Fix paths, re-stage, retry.\n`
    )
  );
  process.exit(1);
}

const isDirectInvocation =
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith('validate-links.mjs');

if (isDirectInvocation) {
  main().catch((e) => {
    console.error(colors.red('validate-links crashed:'), e);
    process.exit(1);
  });
}
