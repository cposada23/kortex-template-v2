// scope: framework
//
// Sync eligibility — decides whether a single file should be mirrored to
// the public template. Centralized so sync-to-template doesn't have to
// know the difference between `.md` files (frontmatter `mirror:` /
// `scope:`) and code files (`// scope:` comment in the first 10 lines).
//
// The contract per AGENTS.md §11 + §13:
//
//   - .md outside .claude/      → frontmatter.mirror in {framework, both}
//   - .md inside .claude/       → frontmatter.scope === 'framework'
//   - .mjs / .js / .ts / .py / .sh → top-of-file comment with scope: framework
//   - .claude/templates/* (any extension) → framework by convention
//                                            (per .claude/rules/scope.md)
//
// Anything else: not eligible.
//
// Intentionally pure — takes a path + content + parsed frontmatter and
// returns a verdict. No IO. The caller (sync-to-template) does the file
// reading and frontmatter parsing because it already does that for the
// PII gate.

const CODE_EXTS = new Set(['.mjs', '.js', '.ts', '.py', '.sh']);
// Match `scope: framework` anchored on a line that starts with a comment
// marker. We accept `//`, `#`, and `--` (Lua/SQL, future-proof). `\s*$`
// at the end allows trailing whitespace but not trailing characters —
// that prevents `// scope: framework-private` from passing as framework.
const CODE_SCOPE_RE = /^\s*(?:\/\/|#|--)\s*scope:\s*framework\s*$/m;

const TEMPLATES_PREFIX = '.claude/templates/';

/**
 * @param {string} relPath  Repo-relative POSIX path.
 * @param {object} parsed   Result of frontmatter.parseFile/parseString. May be ignored for code files.
 * @returns {{ eligible: boolean, reason: string }}
 */
export function checkEligibility(relPath, parsed) {
  // Templates: framework by convention. Body content is the frontmatter
  // of the FUTURE file (the one created from this template), so we don't
  // try to read mirror/scope from it — the path is the contract.
  if (relPath.startsWith(TEMPLATES_PREFIX)) {
    return { eligible: true, reason: 'templates/ — framework by convention' };
  }

  const ext = lastDot(relPath);

  if (ext === '.md') {
    const fm = parsed?.data || {};
    if (relPath.startsWith('.claude/')) {
      // Inside .claude/, the convention is `scope:` not `mirror:` (per
      // scope.md). We accept either for back-compat with files that may
      // carry both during a transition.
      if (fm.scope === 'framework') return { eligible: true, reason: 'scope: framework' };
      if (fm.mirror === 'framework' || fm.mirror === 'both') {
        return { eligible: true, reason: `mirror: ${fm.mirror}` };
      }
      return { eligible: false, reason: '.claude/ md without scope:framework or mirror:framework|both' };
    }
    if (fm.mirror === 'framework' || fm.mirror === 'both') {
      return { eligible: true, reason: `mirror: ${fm.mirror}` };
    }
    return { eligible: false, reason: 'mirror is personal or unset' };
  }

  if (CODE_EXTS.has(ext)) {
    // For code we don't trust frontmatter — we read the top-of-file
    // comment scope. We only inspect the first ~30 lines so a giant file
    // doesn't pay the regex cost on every walk.
    const head = (parsed?.raw || '').split('\n').slice(0, 30).join('\n');
    if (CODE_SCOPE_RE.test(head)) return { eligible: true, reason: 'code: scope framework' };
    return { eligible: false, reason: 'code: no scope:framework declaration' };
  }

  return { eligible: false, reason: `unsupported extension: ${ext}` };
}

/**
 * Synchronously decide eligibility from a filepath, using the Node fs
 * helpers and the project's frontmatter parser. Convenience wrapper —
 * the pure `checkEligibility` is what the unit tests target.
 */
export async function checkEligibilityAtPath(repoRoot, relPath) {
  const path = await import('node:path');
  const fs = await import('node:fs');
  const { parseFile } = await import('./frontmatter.mjs');
  const abs = path.join(repoRoot, relPath);
  // Code files don't have frontmatter — we wrap the raw bytes so
  // checkEligibility sees the same shape as a parsed .md.
  const ext = lastDot(relPath);
  if (ext === '.md') {
    const parsed = parseFile(abs);
    return checkEligibility(relPath, parsed);
  }
  if (CODE_EXTS.has(ext)) {
    const raw = fs.readFileSync(abs, 'utf8');
    return checkEligibility(relPath, { raw });
  }
  return checkEligibility(relPath, null);
}

function lastDot(p) {
  const i = p.lastIndexOf('.');
  if (i === -1) return '';
  // Don't return extension for dotfiles like ".gitignore" — there is no
  // ext, the whole name is the file.
  const base = p.slice(p.lastIndexOf('/') + 1);
  if (base.startsWith('.') && base.indexOf('.', 1) === -1) return '';
  return p.slice(i);
}

export { CODE_EXTS };
