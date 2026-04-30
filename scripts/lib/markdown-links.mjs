// scope: framework
// Lightweight markdown link parser + relative-link resolver.
// Used by validate-links and update-backrefs.
//
// We don't pull a full markdown AST library because:
//   1. We only care about `[text](target)` form (relative internal links).
//   2. Code blocks are stripped textually before regex (good enough for ~99%
//      of cases — the false-positive is "a link inside a markdown example
//      that's NOT in a code block", which is rare and the cost is a noisy
//      warning, not data loss).
//   3. Adding a markdown AST dep raises install size for a tiny gain.

import path from 'node:path';
import fs from 'node:fs';

// Inline link regex: `[text](target)`.
// `text` may contain anything except a closing bracket; `target` may not
// contain `)` or whitespace at the boundary. Non-greedy on text so we don't
// gobble across multiple links on one line.
const LINK_RE = /\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;

// Strip fenced code blocks (``` ... ```) and inline code spans (` ... `).
// Operating on the stripped text means links inside code-block examples are
// ignored — which is what we want for both broken-link detection and backref
// generation.
export function stripCode(content) {
  return content
    .replace(/```[\s\S]*?```/g, '')
    .replace(/`[^`\n]+`/g, '');
}

// Yield every relative internal link in `content`.
// Returns array of `{ text, target, line }` (1-indexed line numbers based on
// the stripped content — close enough for "look near here" diagnostics).
//
// Skipped automatically:
//   - external URLs (http://, https://, mailto:)
//   - anchors-only (#foo)
//   - common media extensions (png/jpg/pdf/etc.) — we only care about .md
//     references for link integrity
export function extractLinks(content) {
  const stripped = stripCode(content);
  const lines = stripped.split('\n');
  const links = [];
  // We iterate per-line to capture line numbers cheaply. The regex's lastIndex
  // is local to each line so there's no state leakage between iterations.
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    let m;
    LINK_RE.lastIndex = 0;
    while ((m = LINK_RE.exec(line)) !== null) {
      const target = m[2];
      if (isSkippable(target)) continue;
      links.push({ text: m[1], target, line: i + 1 });
    }
  }
  return links;
}

const MEDIA_EXTS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp',
  '.mp4', '.mov', '.pdf', '.mp3', '.wav', '.zip',
]);

// Returns true if a link target should be ignored by the link integrity check.
// Centralized so update-backrefs and validate-links use identical rules.
export function isSkippable(target) {
  if (!target) return true;
  if (target.startsWith('http://') || target.startsWith('https://')) return true;
  if (target.startsWith('mailto:')) return true;
  if (target.startsWith('#')) return true;
  // Strip anchor for ext check
  const noAnchor = target.split('#')[0];
  if (!noAnchor) return true;
  const ext = path.extname(noAnchor).toLowerCase();
  if (MEDIA_EXTS.has(ext)) return true;
  return false;
}

// Resolve a relative link target to an absolute filesystem path, anchored at
// the directory of `sourceFile`. Strips trailing #anchor before resolving.
// Returns the resolved absolute path; caller checks existence.
export function resolveLinkTarget(sourceFile, target) {
  const noAnchor = target.split('#')[0];
  const sourceDir = path.dirname(sourceFile);
  return path.normalize(path.resolve(sourceDir, noAnchor));
}

// Check if a resolved link points at an existing file. Centralized so future
// changes (e.g. allowing case-insensitive match) live in one place.
export function linkExists(resolvedPath) {
  try {
    return fs.statSync(resolvedPath).isFile() || fs.statSync(resolvedPath).isDirectory();
  } catch {
    return false;
  }
}
