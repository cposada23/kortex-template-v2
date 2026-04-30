// scope: framework
// Thin wrapper around git plumbing used by every hook.
// Centralized so the diff-filter / encoding / cwd handling lives in one place
// and individual hooks don't each rebuild the same subprocess plumbing.

import { execFileSync } from 'node:child_process';
import path from 'node:path';

// Run a git command and return stdout as a UTF-8 string (trimmed).
// We use execFileSync (not exec) to avoid any shell interpolation of args.
// Throwing surfaces git errors as exceptions to the caller — which keeps
// hook code linear (no manual error-code checks per call).
function git(args, opts = {}) {
  return execFileSync('git', args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    ...opts,
  }).trim();
}

// Absolute path to the repo root. Cached because every hook calls it and it
// never changes within a process lifetime.
let _repoRootCache = null;
export function repoRoot() {
  if (_repoRootCache) return _repoRootCache;
  _repoRootCache = git(['rev-parse', '--show-toplevel']);
  return _repoRootCache;
}

// Return staged file paths (added/copied/modified/renamed), already filtered
// by an optional file-extension predicate. Paths are RELATIVE to repo root —
// callers join with repoRoot() if they need absolute.
//
// `extFilter` is a string (e.g. '.md') or a predicate (path) => bool. We support
// both because most callers want a simple ext check, but secrets-scan wants
// "everything except blocked filenames" which is easier expressed as a fn.
export function stagedFiles(extFilter = null) {
  let raw;
  try {
    raw = git(['diff', '--cached', '--name-only', '--diff-filter=ACMR']);
  } catch {
    // No HEAD yet (initial commit) — fall back to listing all staged files.
    try {
      raw = git(['diff', '--cached', '--name-only']);
    } catch {
      return [];
    }
  }
  if (!raw) return [];
  const all = raw.split('\n').filter(Boolean);
  if (!extFilter) return all;
  if (typeof extFilter === 'string') {
    return all.filter((f) => f.endsWith(extFilter));
  }
  return all.filter(extFilter);
}

// Return only the ADDED lines (lines beginning with '+', excluding the +++
// file header) for a single staged path. Used by secret scanning so we only
// flag what's being introduced in this commit, not what was already in the
// repo. `unified=0` minimizes context noise.
export function stagedAddedLines(filePath) {
  let raw;
  try {
    raw = git(['diff', '--cached', '--no-color', '--unified=0', '--', filePath]);
  } catch {
    return '';
  }
  const out = [];
  for (const line of raw.split('\n')) {
    if (line.startsWith('+++') || line.startsWith('---')) continue;
    if (line.startsWith('+')) out.push(line.slice(1));
  }
  return out.join('\n');
}

// Resolve a repo-relative path to absolute, anchored at the repo root.
// Convenience to keep hooks readable.
export function resolveFromRoot(relPath) {
  return path.join(repoRoot(), relPath);
}
